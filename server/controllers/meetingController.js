const Meeting = require('../models/Meeting');
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

module.exports = { createMeeting, getMeeting };
