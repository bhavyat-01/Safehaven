import os
import time
import firebase_admin
from firebase_admin import credentials, firestore
from dotenv import load_dotenv
import config

load_dotenv()

# -------------------------
# Initialize Firebase
# -------------------------
if not firebase_admin._apps:
    cred = credentials.Certificate("serviceAccountKey.json")
    firebase_admin.initialize_app(cred)

db = firestore.client()
threats_ref = db.collection("threats")

# -------------------------
# Folder utility
# -------------------------
def create_threat_folder(threat_id):
    folder = os.path.join(config.OUTPUT_FOLDER, threat_id)
    os.makedirs(folder, exist_ok=True)
    return folder

# -------------------------
# Insert a new threat
# -------------------------
def insert_threat(score, explanation, videos=None, metadata=None, active=True):
    videos = videos or []
    metadata = metadata or {}

    doc_ref = threats_ref.document()
    threat_id = doc_ref.id

    threat_data = {
        "score": score,
        "explanation": explanation,
        "videos": videos,
        "metadata": metadata,
        "start_time": firestore.SERVER_TIMESTAMP,
        "last_seen": time.time(),
        "end_time": None,
        "active": active,
        "resolved": False,
        "confirms": 0,
        "denies": 0,
        "voters": {}
    }

    doc_ref.set(threat_data)
    create_threat_folder(threat_id)

    for _ in range(5):
        if threats_ref.document(threat_id).get().exists:
            break
        time.sleep(0.3)
    else:
        print(f"[WARN] Threat {threat_id} not readable after creation!")

    return threat_id

# -------------------------
# Update an existing threat
# -------------------------
def update_threat(threat_id, score, explanation, new_videos=None, metadata=None, replace_videos=False):
    new_videos = new_videos or []
    metadata = metadata or {}

    doc_ref = threats_ref.document(threat_id)
    doc = doc_ref.get()
    if not doc.exists:
        print(f"[WARN] Threat {threat_id} does not exist!")
        return

    existing = doc.to_dict()
    
    # Either replace entirely or append
    if replace_videos:
        videos = new_videos
    else:
        videos = existing.get("videos", []) + new_videos

    updated_score = max(score, existing.get("score", 0))
    updated_metadata = {**existing.get("metadata", {}), **metadata}

    doc_ref.update({
        "score": updated_score,
        "explanation": explanation,
        "videos": videos,
        "metadata": updated_metadata,
        "last_seen": time.time(),
        "active": True
    })
# -------------------------
# Mark a threat as ended
# -------------------------
def end_threat(threat_id):
    threats_ref.document(threat_id).update({
        "active": False,
        "end_time": firestore.SERVER_TIMESTAMP
    })

# -------------------------
# Get all threats
# -------------------------
def get_all_threats():
    docs = threats_ref.stream()
    return {doc.id: doc.to_dict() for doc in docs}