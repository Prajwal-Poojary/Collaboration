const express = require('express');
const router = express.Router();
const multer = require('multer');
const { protect } = require('../middleware/authMiddleware');
const { transcribe, summarize } = require('../controllers/aiController');

const upload = multer({ dest: 'uploads/' });

router.post('/transcribe', protect, upload.single('audio'), transcribe);
router.post('/summarize', protect, summarize);

module.exports = router;
