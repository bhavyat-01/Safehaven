import os
import config
from video_processor import process_video
from firebase_cleanup import start_cleanup_thread

os.makedirs(config.OUTPUT_FOLDER, exist_ok=True)

if __name__ == "__main__":
    start_cleanup_thread()
    process_video(config.VIDEO_PATH)