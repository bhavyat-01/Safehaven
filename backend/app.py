from flask import Flask, send_from_directory, jsonify
import os

app = Flask(__name__)
BASE_FOLDER = os.path.join(os.path.dirname(__file__), 'fight_screenshots')

@app.route('/debug')
def debug():
    exists = os.path.exists(BASE_FOLDER)
    contents = {}
    if exists:
        for item in os.listdir(BASE_FOLDER):
            item_path = os.path.join(BASE_FOLDER, item)
            if os.path.isdir(item_path):
                contents[item] = os.listdir(item_path)
            else:
                contents[item] = "file"
    return jsonify({
        "base_folder": BASE_FOLDER,
        "exists": exists,
        "contents": contents
    })

# -------------------------
# Screenshots (images)
# -------------------------
@app.route('/screenshots/<threat_id>')
def list_screenshots(threat_id):
    folder = os.path.join(BASE_FOLDER, threat_id)
    if not os.path.exists(folder):
        return jsonify([])
    files = sorted(os.listdir(folder))
    return jsonify(files)

@app.route('/screenshots/<threat_id>/<filename>')
def get_screenshot(threat_id, filename):
    folder = os.path.join(BASE_FOLDER, threat_id)
    return send_from_directory(folder, filename)

# -------------------------
# Clips (videos)
# -------------------------
@app.route('/clips/<threat_id>')
def list_clips(threat_id):
    folder = os.path.join(BASE_FOLDER, threat_id)
    if not os.path.exists(folder):
        return jsonify([])
    files = sorted([f for f in os.listdir(folder) if f.endswith('.mp4')])
    return jsonify(files)

@app.route('/clips/<threat_id>/<filename>')
def get_clip(threat_id, filename):
    folder = os.path.join(BASE_FOLDER, threat_id)
    return send_from_directory(folder, filename, mimetype='video/mp4')

if __name__ == '__main__':
    app.run(port=5000, debug=True)