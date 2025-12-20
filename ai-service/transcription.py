import speech_recognition as sr
import os

def transcribe_audio(audio_path):
    recognizer = sr.Recognizer()
    try:
        with sr.AudioFile(audio_path) as source:
            audio_data = recognizer.record(source)
            text = recognizer.recognize_google(audio_data)
            return {"text": text, "status": "success"}
    except sr.UnknownValueError:
        return {"text": "", "status": "error", "message": "Could not understand audio"}
    except sr.RequestError as e:
        return {"text": "", "status": "error", "message": f"Service error: {e}"}
    except Exception as e:
        return {"text": "", "status": "error", "message": str(e)}
