# firebase_client.py

import os
import firebase_admin
from firebase_admin import credentials, firestore
from dotenv import load_dotenv
import time

load_dotenv()

# -------------------------
# Initialize Firebase
# -------------------------
if not firebase_admin._apps:
    cred = credentials.Certificate("serviceAccountKey.json")
    firebase_admin.initialize_app(cred)

db = firestore.client()
threats_ref = db.collection("threats")


def insert_threat(score, explanation, images, metadata=None, active=True):
    doc_ref = db.collection("threats").document()
    doc_ref.set({
        "score": score,
        "explanation": explanation,
        "images": images,
        "metadata": metadata or {},
        "start_time": firestore.SERVER_TIMESTAMP,
        "end_time": None,
        "active": active,
        "confirms": 0,
        "denies": 0
    })
    return doc_ref.id


def update_threat(threat_id, score, explanation, new_images, metadata=None):
    doc_ref = db.collection("threats").document(threat_id)
    doc = doc_ref.get()
    if doc.exists:
        existing = doc.to_dict()
        images = existing.get("images", []) + new_images
        updated_score = max(score, existing.get("score", 0))
        updated_metadata = {**existing.get("metadata", {}), **(metadata or {})}
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
# Get all threats (for cleanup)
# -------------------------
def get_all_threats():
    """
    Returns a dict of all threats keyed by document ID.
    """
    docs = threats_ref.stream()
    return {doc.id: doc.to_dict() for doc in docs}