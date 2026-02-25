require('dotenv').config();
const mongoose = require('mongoose');
const ScheduledMeeting = require('./models/ScheduledMeeting');

mongoose.connect(process.env.MONGO_URI).then(async () => {
    console.log("Connected");
    const meetings = await ScheduledMeeting.find().sort({ createdAt: -1 }).limit(2);
    console.log("Meetings:", JSON.stringify(meetings, null, 2));
    process.exit(0);
}).catch(e => {
    console.error(e);
    process.exit(1);
});
