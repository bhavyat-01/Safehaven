# main.py

import cv2
import time
import threading
import config
from detector import FightDetector
from gemini_client import summarize_fight


def async_gemini_call(images):
    print("Sending frames to Gemini...")
    result = summarize_fight(images)
    print("\n===== GEMINI RESPONSE =====")
    print(result)
    print("===========================\n")


def main():
    cap = cv2.VideoCapture(config.VIDEO_PATH)
    detector = FightDetector()

    last_gemini_call = 0
    frame_count = 0

    while True:
        ret, frame = cap.read()
        if not ret:
            break

        frame_count += 1

        frame_processed, ready = detector.process_frame(frame, frame_count)

        if ready:
            if time.time() - last_gemini_call > config.GEMINI_COOLDOWN:
                images = detector.reset()

                thread = threading.Thread(
                    target=async_gemini_call,
                    args=(images,)
                )
                thread.start()

                last_gemini_call = time.time()

        cv2.imshow("Surveillance", frame_processed)

        if cv2.waitKey(1) & 0xFF == ord("q"):
            break

    cap.release()
    cv2.destroyAllWindows()


if __name__ == "__main__":
    main()