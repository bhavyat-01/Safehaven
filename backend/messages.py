import os
import requests
import firebase_admin
from firebase_admin import credentials, firestore
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

TEXTBELT_API_KEY = os.getenv("TEXTBELT_API_KEY")

# Initialize Firebase
cred = credentials.Certificate("serviceAccountKey.json")
firebase_admin.initialize_app(cred)
db = firestore.client()

# Load provider gateways from Firestore
providers_ref = db.collection("providers").stream()
provider_gateways = {}

for provider in providers_ref:
    data = provider.to_dict()
    provider_gateways[data["name"]] = data.get("carrierGateway")

print("Loaded provider gateways:", provider_gateways)


def send_sms(phone_number, message):
    """
    Sends SMS via Textbelt
    """
    payload = {
        "phone": phone_number,
        "message": message,
        "key": TEXTBELT_API_KEY
    }

    response = requests.post("https://textbelt.com/text", data=payload)
    result = response.json()
    if result.get("success"):
        print(f"SMS sent successfully to {phone_number}")
    else:
        print(f"Failed to send SMS to {phone_number}: {result}")


# Loop through users in Firestore
users = db.collection("users").stream()

for user in users:
    data = user.to_dict()
    phone = data.get("phone")
    provider = data.get("phoneProvider")

    if not phone or not provider:
        continue

    gateway = provider_gateways.get(provider)
    if not gateway:
        print(f"No gateway found for provider {provider}")
        continue

    # Build full phone address if needed (e.g., number + gateway)
    # Textbelt works with raw phone numbers, so we just pass the number
    send_sms(phone, "🚨 SafeHaven Alert: This is a test notification.")