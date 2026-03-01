# gemini_client.py

import os
from dotenv import load_dotenv
from google import genai
from PIL import Image

load_dotenv()

api_key = os.getenv("GEMINI_API_KEY")
client = genai.Client(api_key=api_key)


def summarize_fight(image_paths):
    """
    image_paths: list of image file paths
    returns: dict with 'score' and 'explanation'
    """
    prompt = """
    Look at these images and determine if a physical fight or violent crime is occurring.
    Score it from 0-10.
    0 = no fight
    10 = extremely dangerous to bystanders
    Provide only:
    Score: X
    Short explanation.
    """

    images = [Image.open(path) for path in image_paths]

    response = client.models.generate_content(
        model="models/gemini-2.5-flash",
        contents=[*images, prompt],
    )

    # Example parsing: assumes Gemini returns "Score: X\nShort explanation: ..."
    try:
        text = response.text
        lines = [line.strip() for line in text.split("\n") if line.strip()]
        score = int(lines[0].split(":")[1].strip())
        explanation = lines[1] if len(lines) > 1 else ""
        return {"score": score, "explanation": explanation}
    except Exception as e:
        print("Error parsing Gemini response:", e)
        return {"score": 0, "explanation": text}