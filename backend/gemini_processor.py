import os
from gemini_client import summarize_fight
from firebase_client import insert_threat, update_threat
from state import state, lock
import config
from messages import process_threat_alerts

# -----------------------------
# Config
# -----------------------------
THREAT_THRESHOLD = 6

# -----------------------------
# Process a clip with Gemini
# -----------------------------
def process_clip(video_path, metadata):
    """
    Sends clip to Gemini, keeps top 2 clips in folder, and updates
    Firebase 'videos' field to always contain only top 2 clips.
    """
    try:
        print("[Gemini] Sending clip:", video_path)
        result = summarize_fight(video_path)
        score = result["score"]
        explanation = result["explanation"]
        print("[Gemini] Score:", score)

        # Discard low-score clips
        if score <= THREAT_THRESHOLD:
            if os.path.exists(video_path):
                os.remove(video_path)
            print("[Gemini] Low score. Clip deleted.")
            return

        filename = os.path.basename(video_path)

        with lock:
            # Create threat if first valid clip
            if not state.get("active_threat", False):
                threat_id = insert_threat(
                    score,
                    explanation,
                    videos=[filename],
                    metadata=metadata
                )
                state["current_threat_id"] = threat_id
                state["active_threat"] = True
                print("[Gemini] New threat created:", threat_id)
                process_threat_alerts(threat_id)

            # Ensure threat folder exists
            threat_folder = os.path.join(
                config.OUTPUT_FOLDER,
                state["current_threat_id"]
            )
            os.makedirs(threat_folder, exist_ok=True)

            # Move clip immediately to threat folder
            dest = os.path.join(threat_folder, filename)
            os.replace(video_path, dest)

            # Track clip in memory
            if "top_clips" not in state:
                state["top_clips"] = []

            state["top_clips"].append({
                "score": score,
                "path": dest,
                "explanation": explanation,
                "metadata": metadata
            })

            # Keep only top 2 highest scores
            state["top_clips"].sort(key=lambda x: x["score"], reverse=True)
            while len(state["top_clips"]) > 2:
                lowest = state["top_clips"].pop()
                if os.path.exists(lowest["path"]):
                    os.remove(lowest["path"])
                    print("[Gemini] Removed lower scoring clip:", lowest["path"])

            # 🔹 Always update Firebase 'videos' field to top 2 clips
            top_2_filenames = [os.path.basename(c["path"]) for c in state["top_clips"]]
            best = state["top_clips"][0]

            update_threat(
                state["current_threat_id"],
                best["score"],
                best["explanation"],
                new_videos=top_2_filenames,  # always only top 2
                metadata=best["metadata"],
                replace_videos=True
            )
            print("[Gemini] Threat updated with top 2 clips:", top_2_filenames)

    except Exception as e:
        print("[Gemini] Processing failed:", e)
        if os.path.exists(video_path):
            os.remove(video_path)