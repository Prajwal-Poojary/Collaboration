const mongoose = require('mongoose');

const scheduledMeetingSchema = new mongoose.Schema({
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
        default: 'Scheduled Meeting',
    },
    clientUrl: {
        type: String,
        default: 'http://localhost:5173'
    },
    scheduledAt: {
        type: Date,
        required: true,
    },
    attendeeEmails: [
        {
            type: String,
        }
    ],
    notifications: {
        thirtyMinSent: {
            type: Boolean,
            default: false,
        },
        fifteenMinSent: {
            type: Boolean,
            default: false,
        }
    },
    isEnded: {
        type: Boolean,
        default: false,
    }
}, {
    timestamps: true,
});

const ScheduledMeeting = mongoose.model('ScheduledMeeting', scheduledMeetingSchema);

module.exports = ScheduledMeeting;
