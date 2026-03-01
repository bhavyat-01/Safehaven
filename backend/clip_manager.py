import os
import cv2
import time
import config

CLIP_DURATION_SECONDS = 5
CLIP_FPS = 15
TOTAL_FRAMES = CLIP_DURATION_SECONDS * CLIP_FPS


def save_clip(frames, folder):
    if not frames:
        return None

    os.makedirs(folder, exist_ok=True)

    filename = f"clip_{int(time.time()*1000)}.mp4"
    raw_path = os.path.join(folder, filename.replace(".mp4", "_raw.mp4"))
    final_path = os.path.join(folder, filename)

    h, w = frames[0].shape[:2]

    writer = cv2.VideoWriter(
        raw_path,
        cv2.VideoWriter_fourcc(*"mp4v"),
        CLIP_FPS,
        (w, h)
    )

    for frame in frames:
        writer.write(frame)

    writer.release()

    # Convert to H264
    cmd = f'ffmpeg -y -i "{raw_path}" -vcodec libx264 -preset fast -crf 23 "{final_path}"'
    if os.system(cmd) != 0:
        print("FFmpeg failed.")
        return None

    os.remove(raw_path)
    print("Clip saved:", final_path)

    return final_path