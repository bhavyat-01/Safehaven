# import os
# import requests
# import firebase_admin
# from firebase_admin import credentials, firestore
# from dotenv import load_dotenv
# import math

# # Load environment variables
# load_dotenv()
# TEXTBELT_API_KEY = os.getenv("TEXTBELT_API_KEY")

# # Initialize Firebase
# cred = credentials.Certificate("serviceAccountKey.json")
# firebase_admin.initialize_app(cred)
# db = firestore.client()

# # Load provider gateways (optional, for logging or future use)
# providers_ref = db.collection("providers").stream()
# provider_gateways = {}
# for provider in providers_ref:
#     data = provider.to_dict()
#     provider_gateways[data["name"]] = data.get("carrierGateway")
# print("Loaded provider gateways:", provider_gateways)


# def haversine_distance(lat1, lon1, lat2, lon2):
#     """Calculate distance in miles between two lat/lon points"""
#     R = 3958.8  # Earth radius in miles
#     phi1, phi2 = math.radians(lat1), math.radians(lat2)
#     d_phi = math.radians(lat2 - lat1)
#     d_lambda = math.radians(lon2 - lon1)

#     a = math.sin(d_phi / 2) ** 2 + math.cos(phi1) * math.cos(phi2) * math.sin(d_lambda / 2) ** 2
#     c = 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))
#     return R * c


# def send_sms(phone_number, message):
#     """Send SMS via Textbelt"""
#     # payload = {
#     #     "phone": phone_number,
#     #     "message": message,
#     #     "key": TEXTBELT_API_KEY
#     # }

#     # response = requests.post("https://textbelt.com/text", data=payload)
#     # result = response.json()
#     # if result.get("success"):
#     #     print(f"SMS sent successfully to {phone_number}")
#     # else:
#     #     print(f"Failed to send SMS to {phone_number}: {result}")
#     print("TEXT TO ", phone_number)


# # Radius in miles
# alert_radius_miles = 5

# # Loop through all threats
# threats = db.collection("threats").stream()
# for threat in threats:
#     threat_data = threat.to_dict()
#     threat_location = threat_data.get("location")
#     threat_message = threat_data.get("message", "🚨 SafeHaven Alert: Threat nearby!")

#     if not threat_location:
#         continue

#     # Handle Firestore GeoPoint or dict
#     threat_lat = threat_location.get("lat") if isinstance(threat_location, dict) else threat_location.latitude
#     threat_lon = threat_location.get("lng") if isinstance(threat_location, dict) else threat_location.longitude

#     # Loop through all users
#     users = db.collection("users").stream()
#     for user in users:
#         user_data = user.to_dict()
#         phone = user_data.get("phone")
#         user_location = user_data.get("location")

#         if not phone or not user_location:
#             continue

#         user_lat = user_location.get("lat") if isinstance(user_location, dict) else user_location.latitude
#         user_lon = user_location.get("lng") if isinstance(user_location, dict) else user_location.longitude

#         distance = haversine_distance(threat_lat, threat_lon, user_lat, user_lon)

#         if distance <= alert_radius_miles:
#             send_sms(phone, threat_message)
#             print(f"User {phone} is {distance:.2f} miles away — SMS sent for threat {threat.id}.")
#         else:
#             print(f"User {phone} is {distance:.2f} miles away — not in radius for threat {threat.id}.")

import os
import requests
import firebase_admin
from firebase_admin import credentials, firestore
from dotenv import load_dotenv
import math


# -------------------------
# Initialization
# -------------------------
load_dotenv()

TEXTBELT_API_KEY = os.getenv("TEXTBELT_API_KEY")

if not firebase_admin._apps:
    cred = credentials.Certificate("serviceAccountKey.json")
    firebase_admin.initialize_app(cred)

db = firestore.client()


# -------------------------
# Distance Calculation
# -------------------------
def haversine_distance(lat1, lon1, lat2, lon2):
    R = 3958.8  # miles

    phi1, phi2 = math.radians(lat1), math.radians(lat2)
    d_phi = math.radians(lat2 - lat1)
    d_lambda = math.radians(lon2 - lon1)

    a = (
        math.sin(d_phi / 2) ** 2
        + math.cos(phi1)
        * math.cos(phi2)
        * math.sin(d_lambda / 2) ** 2
    )

    return R * (2 * math.atan2(math.sqrt(a), math.sqrt(1 - a)))


# -------------------------
# SMS Sender
# -------------------------
def send_sms(phone_number, message):
    """
    Sends SMS using Textbelt
    """

    #Uncomment when ready
    payload = {
        "phone": phone_number,
        "message": message,
        "key": TEXTBELT_API_KEY,
    }
    
    response = requests.post(
        "https://textbelt.com/text",
        data=payload
    )
    
    print(response.json())

    print("TEXT TO:", phone_number)


# -------------------------
# MAIN FUNCTION ✅
# -------------------------
# -------------------------
# MAIN FUNCTION ✅
# -------------------------
def process_threat_alerts(threat_id, radius_miles: float = 5):
    """
    Sends SMS alerts for ONE threat only.
    """
    print("PROCESS THREAT ALERTS")

    threat_ref = db.collection("threats").document(threat_id)
    threat_doc = threat_ref.get()

    if not threat_doc.exists:
        print("Threat not found")
        return

    threat_data = threat_doc.to_dict()

    # Always use metadata.camera.lat/lng
    camera_data = threat_data.get("metadata", {}).get("camera", {})
    threat_lat = camera_data.get("lat")
    threat_lon = camera_data.get("lng")

    if threat_lat is None or threat_lon is None:
        print("No valid location found in metadata.camera")
        return

    threat_message = "🚨 SafeHaven Alert: " + threat_data.get(
        "explanation",
        "Threat nearby!"
    )

    # Loop through all users
    users = db.collection("users").stream()

    for user in users:
        user_data = user.to_dict()

        phone = user_data.get("phone")
        user_location = user_data.get("location")

        if not phone or not user_location:
            continue

        # Assuming user location is also a dict with lat/lng numbers
        user_lat = user_location.get("lat")
        user_lon = user_location.get("lng")

        if user_lat is None or user_lon is None:
            print(f"User {phone} has no valid location")
            continue

        distance = haversine_distance(
            threat_lat,
            threat_lon,
            user_lat,
            user_lon
        )

        if distance <= radius_miles:
            send_sms(phone, threat_message)
            print(f"User {phone} is {distance:.2f} miles away — alerted.")
        else:
            print(f"User {phone} is {distance:.2f} miles away — not alerted.")