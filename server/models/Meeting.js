const mongoose = require('mongoose');

const meetingSchema = new mongoose.Schema({
    meetingId: {
        type: String,
        required: true,
        unique: true,
    },
    host: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
    },
    title: {
        type: String,
        default: 'Untitled Meeting',
    },
    isActive: {
        type: Boolean,
        default: true,
    },
    participants: [
        {
            user: {
                type: mongoose.Schema.Types.ObjectId,
                ref: 'User',
            },
            name: String,
            joinedAt: {
                type: Date,
                default: Date.now,
            },
        }
    ],
    startTime: {
        type: Date,
        default: Date.now,
    },
    endTime: Date,
}, {
    timestamps: true,
});

const Meeting = mongoose.model('Meeting', meetingSchema);

module.exports = Meeting;
