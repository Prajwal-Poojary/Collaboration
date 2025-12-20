const axios = require('axios');
const FormData = require('form-data');
const fs = require('fs');

const PYTHON_SERVICE_URL = 'http://localhost:5001';

const transcribeAudio = async (filePath) => {
    try {
        const form = new FormData();
        form.append('file', fs.createReadStream(filePath));

        const response = await axios.post(`${PYTHON_SERVICE_URL}/transcribe`, form, {
            headers: {
                ...form.getHeaders(),
            },
        });

        return response.data;
    } catch (error) {
        console.error('Error calling AI service:', error.message);
        throw new Error('AI Service Transcription Failed');
    }
};

const summarizeText = async (text) => {
    try {
        const response = await axios.post(`${PYTHON_SERVICE_URL}/summarize`, { text });
        return response.data;
    } catch (error) {
        console.error('Error calling AI service:', error.message);
        throw new Error('AI Service Summarization Failed');
    }
};

module.exports = { transcribeAudio, summarizeText };
