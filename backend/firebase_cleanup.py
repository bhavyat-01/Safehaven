import time
import threading
from firebase_client import threats_ref
import config


def cleanup_threats():
    while True:
        docs = threats_ref.where("active", "==", True).stream()

        for doc in docs:
            data = doc.to_dict()
            last_seen = data.get("last_seen", 0)

            if time.time() - last_seen > config.THREAT_COOLDOWN:
                threats_ref.document(doc.id).update({"active": False})
                print("Threat marked inactive:", doc.id)

        time.sleep(5)


def start_cleanup_thread():
    threading.Thread(target=cleanup_threats, daemon=True).start()