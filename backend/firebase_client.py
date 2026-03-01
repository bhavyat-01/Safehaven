# firebase_client.py

import os
import time
import firebase_admin
from firebase_admin import credentials, firestore
from dotenv import load_dotenv
import config  # ensure this has OUTPUT_FOLDER path

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
    """
    Creates a folder for storing screenshots for this threat.
    """
    folder = os.path.join(config.OUTPUT_FOLDER, threat_id)
    os.makedirs(folder, exist_ok=True)
    return folder

# -------------------------
# Insert a new threat
# -------------------------
def insert_threat(score, explanation, images=None, metadata=None, active=True):
    """
    Inserts a new threat in Firestore and creates a folder for screenshots.
    Returns the threat ID.
    """
    images = images or []
    metadata = metadata or {}

    doc_ref = threats_ref.document()
    threat_id = doc_ref.id

    # Prepare Firestore data
    threat_data = {
        "score": score,
        "explanation": explanation,
        "images": images,  # store filenames
        "metadata": metadata,
        "start_time": firestore.SERVER_TIMESTAMP,
        "end_time": None,
        "active": active
    }

    doc_ref.set(threat_data)

    # Ensure threat folder exists
    create_threat_folder(threat_id)

    # Wait until Firestore confirms write
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
def update_threat(threat_id, score, explanation, new_images=None, metadata=None):
    """
    Updates an existing threat's score, explanation, images, and metadata.
    """
    new_images = new_images or []
    metadata = metadata or {}

    doc_ref = threats_ref.document(threat_id)
    doc = doc_ref.get()
    if not doc.exists:
        print(f"[WARN] Threat {threat_id} does not exist!")
        return

    existing = doc.to_dict()
    images = existing.get("images", []) + new_images
    updated_score = max(score, existing.get("score", 0))
    updated_metadata = {**existing.get("metadata", {}), **metadata}

    doc_ref.update({
        "score": updated_score,
        "explanation": explanation,
        "images": images,
        "metadata": updated_metadata,
        "active": True
    })

# -------------------------
# Mark a threat as ended
# -------------------------
def end_threat(threat_id):
    """
    Marks the threat as inactive and sets the end_time.
    """
    doc_ref = threats_ref.document(threat_id)
    doc_ref.update({
        "active": False,
        "end_time": firestore.SERVER_TIMESTAMP
    })

# -------------------------
# Get all threats
# -------------------------
def get_all_threats():
    """
    Returns all threats as a dict keyed by threat ID.
    """
    docs = threats_ref.stream()
    return {doc.id: doc.to_dict() for doc in docs}