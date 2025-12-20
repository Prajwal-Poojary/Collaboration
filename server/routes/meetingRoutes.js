const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/authMiddleware');
const { createMeeting, getMeeting } = require('../controllers/meetingController');

router.post('/', protect, createMeeting);
router.get('/:id', protect, getMeeting);

module.exports = router;
