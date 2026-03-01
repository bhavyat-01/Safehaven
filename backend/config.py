# config.py

VIDEO_PATH = "violentVideos/3.mp4"
YOLO_MODEL = "yolov8n.pt"

OUTPUT_FOLDER = "backend/fight_screenshots"

MAX_SCREENSHOTS = 3
CAPTURE_INTERVAL = 2       # seconds between screenshots
GEMINI_COOLDOWN = 10       # seconds between Gemini API calls

PROCESS_EVERY = 10         # process every N frames
SPEED_THRESHOLD = 15       # movement threshold to trigger fight
THREAT_COOLDOWN = 5        # seconds without movement to end threat