const mongoose = require('mongoose');

const DocumentSchema = new mongoose.Schema({
    meetingId: {
        type: String,
        required: true,
        unique: true // One document per meeting for now
    },
    content: {
        type: Object, // Store Quill Delta
        default: {}
    },
    versions: [{
        timestamp: { type: Date, default: Date.now },
        content: Object,
        authorId: String,
        authorName: String
    }],
    lastUpdated: {
        type: Date,
        default: Date.now
    }
});

module.exports = mongoose.model('Document', DocumentSchema);
