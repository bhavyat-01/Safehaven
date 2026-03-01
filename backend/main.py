# main.py

from detector import process_video
import config

if __name__ == "__main__":
    process_video(config.VIDEO_PATH)