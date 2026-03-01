from flask import Flask, send_from_directory, jsonify
import os

app = Flask(__name__)
BASE_FOLDER = os.path.join(os.path.dirname(__file__), 'fight_screenshots')

# List all screenshots for a threat
@app.route('/screenshots/<threat_id>')
def list_screenshots(threat_id):
    folder = os.path.join(BASE_FOLDER, threat_id)
    if not os.path.exists(folder):
        return jsonify([])
    files = sorted(os.listdir(folder))
    return jsonify(files)

# Serve a single screenshot
@app.route('/screenshots/<threat_id>/<filename>')
def get_screenshot(threat_id, filename):
    folder = os.path.join(BASE_FOLDER, threat_id)
    return send_from_directory(folder, filename)

if __name__ == '__main__':
    app.run(port=5000)