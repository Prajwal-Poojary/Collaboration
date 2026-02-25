const cron = require('node-cron');
const nodemailer = require('nodemailer');
const ScheduledMeeting = require('../models/ScheduledMeeting');

let transporter;

const getTransporter = () => {
    if (!transporter) {
        transporter = nodemailer.createTransport({
            service: process.env.EMAIL_SERVICE || 'gmail',
            auth: {
                user: process.env.EMAIL_USER,
                pass: process.env.EMAIL_PASS
            }
        });
    }
    return transporter;
};

const sendMeetingReminder = async (meeting, timeRemainingStr) => {
    const clientUrl = meeting.clientUrl || process.env.CLIENT_URL || 'http://localhost:5173';
    const meetingLink = `${clientUrl}/meeting/${meeting.meetingId}`;

    // Prepare the list of recipients
    const recipients = new Set(meeting.attendeeEmails);
    if (meeting.host && meeting.host.email) {
        recipients.add(meeting.host.email);
    }

    if (recipients.size === 0) return;

    const mailOptions = {
        from: `Void Meetings <${process.env.EMAIL_USERNAME}>`,
        to: Array.from(recipients).join(','),
        subject: `Reminder: ${meeting.title} starts in ${timeRemainingStr}`,
        text: `Hello,\n\nThis is a friendly reminder that the meeting "${meeting.title}" is scheduled to start in ${timeRemainingStr}.\n\nYou can join the meeting using the following link:\n${meetingLink}\n\nSee you soon!`,
        html: `
            <div style="font-family: Arial, sans-serif; padding: 20px;">
                <h2 style="color: #4f46e5;">Meeting Reminder</h2>
                <p>Hello,</p>
                <p>This is a friendly reminder that the meeting <strong>"${meeting.title}"</strong> is scheduled to start in <strong>${timeRemainingStr}</strong>.</p>
                <p>You can join the meeting using the following link:</p>
                <a href="${meetingLink}" style="display: inline-block; padding: 10px 20px; margin: 10px 0; font-size: 16px; color: #fff; background-color: #4f46e5; text-decoration: none; border-radius: 5px;">Join Meeting</a>
                <p>See you soon!</p>
            </div>
        `
    };

    try {
        await getTransporter().sendMail(mailOptions);
        console.log(`[Cron] Reminder sent for meeting ${meeting.meetingId} (${timeRemainingStr})`);
    } catch (error) {
        console.error(`[Cron] Error sending reminder for meeting ${meeting.meetingId}:`, error);
    }
};

const startCronJobs = () => {
    // Run every minute
    cron.schedule('* * * * *', async () => {
        try {
            const now = new Date();
            // We want to find meetings that are in exactly 30 mins or 15 mins (with a 1 minute tolerance)

            // 30 Minutes from now
            const thirtyMinsFromNowStart = new Date(now.getTime() + 30 * 60000);
            const thirtyMinsFromNowEnd = new Date(now.getTime() + 31 * 60000);

            // 15 Minutes from now
            const fifteenMinsFromNowStart = new Date(now.getTime() + 15 * 60000);
            const fifteenMinsFromNowEnd = new Date(now.getTime() + 16 * 60000);

            console.log(`[Cron] Checking for meetings at ${now.toISOString()}`);
            console.log(`[Cron] 30m window: ${thirtyMinsFromNowStart.toISOString()} to ${thirtyMinsFromNowEnd.toISOString()}`);

            // Fetch meetings that need 30 min notification
            const thirtyMinMeetings = await ScheduledMeeting.find({
                scheduledAt: { $gte: thirtyMinsFromNowStart, $lte: thirtyMinsFromNowEnd },
                'notifications.thirtyMinSent': false
            }).populate('host', 'name email');

            console.log(`[Cron] Found ${thirtyMinMeetings.length} meetings for 30m reminder.`);

            for (let meeting of thirtyMinMeetings) {
                await sendMeetingReminder(meeting, '30 minutes');
                meeting.notifications.thirtyMinSent = true;
                await meeting.save();
            }

            // Fetch meetings that need 15 min notification
            const fifteenMinMeetings = await ScheduledMeeting.find({
                scheduledAt: { $gte: fifteenMinsFromNowStart, $lte: fifteenMinsFromNowEnd },
                'notifications.fifteenMinSent': false
            }).populate('host', 'name email');

            console.log(`[Cron] Found ${fifteenMinMeetings.length} meetings for 15m reminder.`);

            for (let meeting of fifteenMinMeetings) {
                await sendMeetingReminder(meeting, '15 minutes');
                meeting.notifications.fifteenMinSent = true;
                await meeting.save();
            }

        } catch (error) {
            console.error('[Cron] Error processing scheduled meetings:', error);
        }
    });

    console.log('[Cron] Meeting notification scheduler started.');
};

module.exports = { startCronJobs };
