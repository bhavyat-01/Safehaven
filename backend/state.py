import time
import threading

lock = threading.Lock()



state = {
    "prev_centers": {},
    "recording": False,
    "frames_recorded": 0,
    "last_capture_time": 0,
    "current_threat_id": None,
    "active_threat": False,
    "reported_clips": set(),
    "top_clips": []  # max size 2
}