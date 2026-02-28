# gemini_client.py

import os
import re
from dotenv import load_dotenv
from google import genai
from PIL import Image

load_dotenv()

api_key = os.getenv("GEMINI_API_KEY")
client = genai.Client(api_key=api_key)


def summarize_fight(image_paths):
    prompt = """
    Look at these images and determine if a physical fight or violent crime is occurring.
    Score it from 0-10.
    0 = no fight
    10 = extremely dangerous to bystanders

    STRICT FORMAT:
    Score: <number>
    Explanation: <one short sentence>
    """

    images = [Image.open(path) for path in image_paths]

    response = client.models.generate_content(
        model="models/gemini-2.5-flash",
        contents=[*images, prompt],
    )

    raw_text = response.text.strip()

    # -------------------------
    # Parse Score
    # -------------------------
    score_match = re.search(r"Score:\s*(\d+)", raw_text)
    score = int(score_match.group(1)) if score_match else 0

    # -------------------------
    # Parse Explanation
    # -------------------------
    explanation_match = re.search(r"Explanation:\s*(.*)", raw_text)
    explanation = explanation_match.group(1).strip() if explanation_match else raw_text

    return {
        "score": score,
        "explanation": explanation,
        "raw": raw_text
    }