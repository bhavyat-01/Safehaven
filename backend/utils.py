import json
import os

def load_video_metadata(video_path):
    metadata_path = video_path.replace(".mp4", "_metadata.json")
    if os.path.exists(metadata_path):
        with open(metadata_path) as f:
            return json.load(f)
    else:
        return None