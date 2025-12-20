const { transcribeAudio, summarizeText } = require('../services/aiService');
const fs = require('fs');

// @desc    Transcribe audio file
// @route   POST /api/ai/transcribe
// @access  Private
const transcribe = async (req, res) => {
    if (!req.file) {
        return res.status(400).json({ message: 'No audio file uploaded' });
    }

    try {
        const result = await transcribeAudio(req.file.path);
        // Cleanup uploaded file from Node server
        fs.unlinkSync(req.file.path);
        res.json(result);
    } catch (error) {
        if (req.file) fs.unlinkSync(req.file.path);
        res.status(500).json({ message: error.message });
    }
};

// @desc    Summarize meeting text
// @route   POST /api/ai/summarize
// @access  Private
const summarize = async (req, res) => {
    const { text } = req.body;

    if (!text) {
        return res.status(400).json({ message: 'No text provided' });
    }

    try {
        const result = await summarizeText(text);
        res.json(result);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

module.exports = { transcribe, summarize };
