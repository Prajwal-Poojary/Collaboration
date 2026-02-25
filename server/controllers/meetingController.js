const Meeting = require('../models/Meeting');
const ScheduledMeeting = require('../models/ScheduledMeeting');
const { v4: uuidv4 } = require('uuid');

// @desc    Create new meeting
// @route   POST /api/meetings
// @access  Private
const createMeeting = async (req, res) => {
    const { title } = req.body;
    const meetingId = uuidv4();

    const meeting = await Meeting.create({
        meetingId,
        host: req.user._id,
        title: title || 'New Meeting',
        participants: [],
    });

    res.status(201).json(meeting);
};

// @desc    Get meeting info
// @route   GET /api/meetings/:id
// @access  Private
const getMeeting = async (req, res) => {
    const meeting = await Meeting.findOne({ meetingId: req.params.id });

    if (meeting) {
        res.json(meeting);
    } else {
        res.status(404).json({ message: 'Meeting not found' });
    }
};

// @desc    Schedule a meeting
// @route   POST /api/meetings/schedule
// @access  Private
const scheduleMeeting = async (req, res) => {
    const { title, scheduledAt, attendeeEmails } = req.body;
    const meetingId = uuidv4();

    try {
        const scheduledMeeting = await ScheduledMeeting.create({
            meetingId,
            host: req.user._id,
            title: title || 'Scheduled Meeting',
            scheduledAt,
            attendeeEmails: attendeeEmails || [],
        });

        res.status(201).json(scheduledMeeting);
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Server Error scheduling meeting' });
    }
};

// @desc    Get scheduled meetings
// @route   GET /api/meetings/scheduled
// @access  Private
const getScheduledMeetings = async (req, res) => {
    try {
        // Need meetings where user is host OR they are explicitly in the attendeeEmails
        // Only return meetings that haven't been ended yet
        const currentEmail = req.user.email;
        const upcomingMeetings = await ScheduledMeeting.find({
            isEnded: false,
            $or: [
                { host: req.user._id },
                { attendeeEmails: currentEmail }
            ]
        })
            .populate('host', 'name email')
            .sort({ scheduledAt: 1 }); // Sort by soonest

        res.json(upcomingMeetings);
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Server Error fetching scheduled meetings' });
    }
};

// @desc    End a scheduled meeting
// @route   POST /api/meetings/scheduled/:id/end
// @access  Private
const endScheduledMeeting = async (req, res) => {
    try {
        const meeting = await ScheduledMeeting.findOne({ meetingId: req.params.id });
        if (!meeting) {
            return res.status(404).json({ message: 'Scheduled meeting not found' });
        }

        // Only host can end it
        if (meeting.host.toString() !== req.user._id.toString()) {
            return res.status(403).json({ message: 'Not authorized to end this meeting' });
        }

        meeting.isEnded = true;
        await meeting.save();
        res.json({ message: 'Meeting ended successfully' });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Server Error ending meeting' });
    }
};

module.exports = { createMeeting, getMeeting, scheduleMeeting, getScheduledMeetings, endScheduledMeeting };
