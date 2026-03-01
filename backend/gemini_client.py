import os
import time
from dotenv import load_dotenv
from google import genai

load_dotenv()

api_key = os.getenv("GEMINI_API_KEY")
client = genai.Client(api_key=api_key)


def summarize_fight(video_path):
    """
    video_path: path to .mp4 clip
    returns: dict with 'score' and 'explanation'
    """
    prompt = """
    Look at this surveillance video and determine if a physical fight or violent crime is occurring.
    Score it from 0-10.
    0 = no fight
    10 = extremely dangerous to bystanders
    Provide only:
    Score: X
    Explanation: Y.
    """

    print(f"Uploading video to Gemini: {video_path}")
    video_file = client.files.upload(file=video_path)

    # Wait for Gemini to finish processing the video
    while video_file.state.name == "PROCESSING":
        print("Waiting for video processing...")
        time.sleep(2)
        video_file = client.files.get(name=video_file.name)

    if video_file.state.name == "FAILED":
        print("Video processing failed")
        return {"score": 0, "explanation": "Video processing failed"}

    print("Video ready, sending to Gemini...")
    response = client.models.generate_content(
        model="models/gemini-2.5-flash",
        contents=[video_file, prompt],
    )

    # Cleanup uploaded file from Gemini servers
    client.files.delete(name=video_file.name)

    try:
        text = response.text
        lines = [line.strip() for line in text.split("\n") if line.strip()]
        score = int(lines[0].split(":")[1].strip())
        explanation = lines[1].split(":")[1].strip() if len(lines) > 1 else ""
        return {"score": score, "explanation": explanation}
    except Exception as e:
        print("Error parsing Gemini response:", e)
        return {"score": 0, "explanation": text}