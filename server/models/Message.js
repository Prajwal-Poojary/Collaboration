const mongoose = require('mongoose');

const messageSchema = new mongoose.Schema({
    meetingId: {
        type: String, // using meetingId string from uuid, not ObjectId of meeting (simplification)
        required: true,
    },
    sender: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
    },
    senderName: String,
    text: {
        type: String,
        required: false, // Text is optional if sending a file
    },
    file: {
        name: String,
        data: String, // Base64 encoded data
        mimeType: String, // MIME type
        size: Number,
    },
    isEdited: {
        type: Boolean,
        default: false,
    },
}, {
    timestamps: true,
});

const Message = mongoose.model('Message', messageSchema);

module.exports = Message;
