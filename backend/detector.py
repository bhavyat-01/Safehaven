# detector.py

import os
import cv2
import numpy as np
import time
import threading
from ultralytics import YOLO
from gemini_client import summarize_fight
from firebase_client import insert_threat, update_threat, threats_ref
import config
from utils import load_video_metadata

print("IMPORT SUCCESS")

# -------------------------
# Setup
# -------------------------
os.makedirs(config.OUTPUT_FOLDER, exist_ok=True)

model = YOLO(config.YOLO_MODEL)
prev_centers = {}
image_buffer = []
screenshot_count = 0
last_capture_time = 0
current_threat_id = None
active_threat = False
last_gemini_call = 0

# Max screenshots per threat
MAX_SCREENSHOTS_PER_THREAT = 5


# -------------------------
# Gemini async call
# -------------------------
def async_gemini_call(images, metadata=None):
    global current_threat_id, active_threat
    result = summarize_fight(images)
    score = result["score"]
    explanation = result["explanation"]

    image_filenames = [os.path.basename(p) for p in images]

    # New threat
    if not active_threat:
        if score > 6:
            threat_id = insert_threat(score, explanation, image_filenames, metadata=metadata)
            current_threat_id = threat_id
            active_threat = True

            # Move temp images to threat folder
            temp_folder = os.path.join(config.OUTPUT_FOLDER, "temp")
            threat_folder = os.path.join(config.OUTPUT_FOLDER, threat_id)
            os.makedirs(threat_folder, exist_ok=True)

            if os.path.exists(temp_folder):
                for f in os.listdir(temp_folder):
                    os.rename(os.path.join(temp_folder, f), os.path.join(threat_folder, f))
                os.rmdir(temp_folder)

            print(f"New threat created: {threat_id}")
            # process_threat_alerts(threat_id)

    # Existing threat
    else:
        update_threat(current_threat_id, score, explanation, image_filenames, metadata=metadata)
        print(f"Updated existing threat: {current_threat_id}")


# -------------------------
# Firebase cleanup thread
# -------------------------
def cleanup_threats():
    while True:
        docs = threats_ref.where("active", "==", True).stream()
        for doc in docs:
            threat_data = doc.to_dict()
            last_seen = threat_data.get("last_seen", 0)
            if time.time() - last_seen > config.THREAT_COOLDOWN:
                threats_ref.document(doc.id).update({"active": False})
                print(f"[Firebase] Threat {doc.id} marked inactive")
        time.sleep(5)


cleanup_thread = threading.Thread(target=cleanup_threats, daemon=True)
cleanup_thread.start()


# -------------------------
# Video processing
# -------------------------
def process_video(video_path):
    global prev_centers, image_buffer, screenshot_count, last_capture_time
    global current_threat_id, active_threat, last_gemini_call

    cap = cv2.VideoCapture(video_path)
    frame_count = 0
    video_metadata = load_video_metadata(video_path)

    while True:
        ret, frame = cap.read()
        if not ret:
            break

        frame_count += 1
        frame_resized = cv2.resize(frame, (640, 360))
        clean_frame = frame_resized.copy()

        # Process every N frames
        if frame_count % config.PROCESS_EVERY == 0:
            results = model(frame_resized)
            new_centers = {}

            for r in results:
                for i, box in enumerate(r.boxes):
                    cls = int(box.cls[0])
                    label = model.names[cls]

                    if label == "person":
                        x1, y1, x2, y2 = map(int, box.xyxy[0])
                        cx, cy = (x1 + x2) // 2, (y1 + y2) // 2
                        new_centers[i] = (cx, cy)

                        # Check movement
                        if i in prev_centers:
                            dx = abs(cx - prev_centers[i][0])
                            dy = abs(cy - prev_centers[i][1])
                            speed = np.sqrt(dx**2 + dy**2)

                            if speed > config.SPEED_THRESHOLD:
                                current_time = time.time()

                                # Determine folder for screenshots
                                folder_name = current_threat_id if current_threat_id else "temp"
                                folder_path = os.path.join(config.OUTPUT_FOLDER, folder_name)
                                os.makedirs(folder_path, exist_ok=True)

                                # Capture screenshot
                                if screenshot_count < MAX_SCREENSHOTS_PER_THREAT and \
                                current_time - last_capture_time >= config.CAPTURE_INTERVAL:

                                    filename = f"fight_frame_{screenshot_count + 1}.png"
                                    filepath = os.path.join(folder_path, filename)
                                    cv2.imwrite(filepath, clean_frame)

                                    # ✅ Store only the filename, not full path
                                    image_buffer.append(filepath)

                                    screenshot_count += 1
                                    last_capture_time = current_time

                                    # Update last_seen in Firebase
                                    if active_threat and current_threat_id:
                                        threats_ref.document(current_threat_id).update({"last_seen": time.time()})

            prev_centers = new_centers

        # Call Gemini when enough screenshots
        if screenshot_count == MAX_SCREENSHOTS_PER_THREAT:
            if time.time() - last_gemini_call > config.GEMINI_COOLDOWN:
                threading.Thread(target=async_gemini_call, args=(image_buffer.copy(), video_metadata)).start()
                last_gemini_call = time.time()

            # Reset buffer
            screenshot_count = 0
            image_buffer = []

        cv2.imshow("Surveillance", frame_resized)
        if cv2.waitKey(1) & 0xFF == ord("q"):
            break

    cap.release()
    cv2.destroyAllWindows()


# -------------------------
# Entry point
# -------------------------
if __name__ == "__main__":
    process_video(config.VIDEO_PATH)