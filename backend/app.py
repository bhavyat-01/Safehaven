from flask import Flask, send_from_directory
import os

app = Flask(__name__)

# route to serve images
@app.route('/fight_screenshots/<filename>')
def get_image(filename):
    # point to the correct folder
    folder_path = os.path.join(os.path.dirname(__file__), 'fight_screenshots')
    return send_from_directory(folder_path, filename)

if __name__ == '__main__':
    app.run(port=5000)