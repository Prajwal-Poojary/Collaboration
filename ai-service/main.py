from flask import Flask, request, jsonify
from flask_cors import CORS
from transcription import transcribe_audio
from summarizer import summarize_text
import os
import uuid

app = Flask(__name__)
CORS(app)

UPLOAD_FOLDER = 'temp_uploads'
if not os.path.exists(UPLOAD_FOLDER):
    os.makedirs(UPLOAD_FOLDER)

@app.route('/')
def health_check():
    return jsonify({"status": "AI Service Running", "service": "Python"})

@app.route('/transcribe', methods=['POST'])
def transcribe():
    if 'file' not in request.files:
        return jsonify({"error": "No file part"}), 400
    
    file = request.files['file']
    if file.filename == '':
        return jsonify({"error": "No selected file"}), 400
        
    filename = f"{uuid.uuid4()}.wav"
    filepath = os.path.join(UPLOAD_FOLDER, filename)
    file.save(filepath)
    
    result = transcribe_audio(filepath)
    
    # Cleanup
    if os.path.exists(filepath):
        os.remove(filepath)
        
    return jsonify(result)

@app.route('/summarize', methods=['POST'])
def summarize():
    data = request.json
    text = data.get('text', '')
    if not text:
        return jsonify({"error": "No text provided"}), 400
        
    result = summarize_text(text)
    return jsonify(result)

if __name__ == '__main__':
    app.run(port=5001, debug=True)
