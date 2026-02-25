require('dotenv').config();
const nodemailer = require('nodemailer');

const transporter = nodemailer.createTransport({
    service: process.env.EMAIL_SERVICE || 'gmail',
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS
    }
});

async function main() {
    try {
        console.log("Sending test email using:", process.env.EMAIL_USER);
        await transporter.sendMail({
            from: process.env.EMAIL_USER,
            to: process.env.EMAIL_USER,
            subject: "Test email",
            text: "This is a test to verify Nodemailer EAUTH is fixed."
        });
        console.log("SUCCESS");
    } catch (e) {
        console.error("FAIL", e);
    }
}
main();
