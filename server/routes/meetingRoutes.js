const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/authMiddleware');
const { createMeeting, getMeeting, scheduleMeeting, getScheduledMeetings } = require('../controllers/meetingController');

router.post('/', protect, createMeeting);
router.post('/schedule', protect, scheduleMeeting);
router.get('/scheduled', protect, getScheduledMeetings);
router.get('/:id', protect, getMeeting);

module.exports = router;
