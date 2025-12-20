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
        required: true,
    },
}, {
    timestamps: true,
});

const Message = mongoose.model('Message', messageSchema);

module.exports = Message;
