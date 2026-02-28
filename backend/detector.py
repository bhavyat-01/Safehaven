# detector.py

import cv2
import numpy as np
import os
import time
from ultralytics import YOLO
import config


class FightDetector:
    def __init__(self):
        self.model = YOLO(config.YOLO_MODEL)
        self.prev_centers = {}
        self.screenshot_count = 0
        self.last_capture_time = 0
        self.image_buffer = []

        os.makedirs(config.OUTPUT_FOLDER, exist_ok=True)

    def process_frame(self, frame, frame_count):
        frame_resized = cv2.resize(frame, (640, 360))
        clean_frame = frame_resized.copy()

        if frame_count % config.PROCESS_EVERY != 0:
            return frame_resized, False

        results = self.model(frame_resized)
        new_centers = {}

        for r in results:
            for i, box in enumerate(r.boxes):
                cls = int(box.cls[0])
                label = self.model.names[cls]

                if label == "person":
                    x1, y1, x2, y2 = map(int, box.xyxy[0])
                    cx, cy = (x1 + x2) // 2, (y1 + y2) // 2
                    new_centers[i] = (cx, cy)

                    if i in self.prev_centers:
                        dx = abs(cx - self.prev_centers[i][0])
                        dy = abs(cy - self.prev_centers[i][1])
                        speed = np.sqrt(dx**2 + dy**2)

                        if speed > config.SPEED_THRESHOLD:
                            cv2.putText(frame_resized, "FIGHT TRIGGER",
                                        (x1, y2 + 20),
                                        cv2.FONT_HERSHEY_SIMPLEX,
                                        0.8, (0, 0, 255), 2)

                            current_time = time.time()

                            if (self.screenshot_count < config.MAX_SCREENSHOTS and
                                current_time - self.last_capture_time >= config.CAPTURE_INTERVAL):

                                filename = f"fight_{self.screenshot_count + 1}.png"
                                filepath = os.path.join(config.OUTPUT_FOLDER, filename)

                                cv2.imwrite(filepath, clean_frame)

                                self.image_buffer.append(filepath)
                                self.screenshot_count += 1
                                self.last_capture_time = current_time

        self.prev_centers = new_centers

        ready = self.screenshot_count == config.MAX_SCREENSHOTS
        return frame_resized, ready

    def reset(self):
        self.screenshot_count = 0
        images = self.image_buffer.copy()
        self.image_buffer = []
        return images