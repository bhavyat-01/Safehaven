import os
import cv2
import numpy as np
import time
import threading
from ultralytics import YOLO
from clip_manager import save_clip, TOTAL_FRAMES
from gemini_processor import process_clip
from state import state, lock
import config
from utils import load_video_metadata

os.makedirs(config.OUTPUT_FOLDER, exist_ok=True)

model = YOLO(config.YOLO_MODEL)


def draw_boxes(frame, boxes_data):
    """
    boxes_data: list of (x1, y1, x2, y2, is_fighting)
    """
    for (x1, y1, x2, y2, is_fighting) in boxes_data:
        color = (0, 0, 255) if is_fighting else (255, 255, 255)  # red or white
        thickness = 3 if is_fighting else 1
        cv2.rectangle(frame, (x1, y1), (x2, y2), color, thickness)

        label = "FIGHTING" if is_fighting else "person"
        font_scale = 0.6 if is_fighting else 0.4
        cv2.putText(
            frame, label,
            (x1, y1 - 8),
            cv2.FONT_HERSHEY_SIMPLEX,
            font_scale,
            color,
            thickness
        )

    return frame


def process_video(video_path):

    cap = cv2.VideoCapture(video_path)
    metadata = load_video_metadata(video_path)

    frames_buffer = []

    while True:
        ret, frame = cap.read()
        if not ret:
            break

        frame_resized = cv2.resize(frame, (640, 360))
        display_frame = frame_resized.copy()   # annotated version for display
        clean_frame = frame_resized.copy()     # no annotations — saved to clip

        results = model(frame_resized)
        new_centers = {}
        boxes_data = []

        # --------- Detection ---------
        for r in results:
            for i, box in enumerate(r.boxes):
                cls = int(box.cls[0])
                label = model.names[cls]

                if label == "person":
                    x1, y1, x2, y2 = map(int, box.xyxy[0])
                    cx, cy = (x1 + x2) // 2, (y1 + y2) // 2
                    new_centers[i] = (cx, cy)

                    prev = state["prev_centers"].get(i)
                    is_fighting = False

                    if prev:
                        dx = abs(cx - prev[0])
                        dy = abs(cy - prev[1])
                        speed = np.sqrt(dx**2 + dy**2)

                        if speed > config.SPEED_THRESHOLD:
                            is_fighting = True
                            now = time.time()

                            with lock:
                                can_capture = (
                                    not state["recording"] and
                                    now - state["last_capture_time"]
                                    >= config.GEMINI_COOLDOWN
                                )

                                if can_capture:
                                    state["recording"] = True
                                    state["frames_recorded"] = 0
                                    frames_buffer = []
                                    state["last_capture_time"] = now
                                    print("Recording started.")

                    boxes_data.append((x1, y1, x2, y2, is_fighting))

        state["prev_centers"] = new_centers

        # Draw boxes on display frame only
        display_frame = draw_boxes(display_frame, boxes_data)

        # --------- Recording Logic ---------
        if state["recording"]:
            frames_buffer.append(clean_frame)   # save clean frames
            state["frames_recorded"] += 1

            if state["frames_recorded"] >= TOTAL_FRAMES:
                state["recording"] = False
                print("Recording finished.")

                temp_folder = os.path.join(config.OUTPUT_FOLDER, "temp")
                clip_path = save_clip(frames_buffer, temp_folder)

                if clip_path:
                    threading.Thread(
                        target=process_clip,
                        args=(clip_path, metadata),
                        daemon=True
                    ).start()

        cv2.imshow("Surveillance", display_frame)   # show annotated
        if cv2.waitKey(1) & 0xFF == ord("q"):
            break

    cap.release()
    cv2.destroyAllWindows()


if __name__ == "__main__":
    process_video(config.VIDEO_PATH)