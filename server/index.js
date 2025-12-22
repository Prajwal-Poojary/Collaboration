const express = require('express');
const dotenv = require('dotenv');
const cors = require('cors');
const http = require('http');
const { Server } = require('socket.io');
const connectDB = require('./config/db');
const authRoutes = require('./routes/authRoutes');
const meetingRoutes = require('./routes/meetingRoutes');
const aiRoutes = require('./routes/aiRoutes');
const Message = require('./models/Message');


dotenv.config();

connectDB();

const app = express();
const server = http.createServer(app);

app.use(cors());
app.use(express.json());

app.use('/api/auth', authRoutes);
app.use('/api/meetings', meetingRoutes);
app.use('/api/ai', aiRoutes);


app.get('/', (req, res) => {
    res.send('API is running...');
});

const io = new Server(server, {
    cors: {
        origin: '*',
        methods: ['GET', 'POST'],
    },
});

io.on('connection', (socket) => {
    console.log('User connected:', socket.id);

    socket.on('join-room', ({ meetingId, userId, name }) => {
        console.log('DEBUG JOIN-ROOM:', { meetingId, userId, name });
        socket.join(meetingId);
        socket.join(userId); // Join a room with the user's ID for private messaging (signaling)
        console.log(`User ${name} (${userId}) joined room ${meetingId} and personal room ${userId}`);
        socket.to(meetingId).emit('user-connected', { userId, name });
    });

    socket.on('offer', (data) => {
        console.log(`Relaying OFFER from ${data.sender} to ${data.target}`);
        socket.to(data.target).emit('offer', {
            offer: data.offer,
            sender: data.sender,
            name: data.name
        });
    });

    socket.on('answer', (data) => {
        console.log(`Relaying ANSWER from ${data.sender} to ${data.target}`);
        socket.to(data.target).emit('answer', {
            answer: data.answer,
            sender: data.sender
        });
    });

    socket.on('ice-candidate', (data) => {
        console.log(`Relaying ICE CANDIDATE from ${data.sender} to ${data.target}`);
        socket.to(data.target).emit('ice-candidate', {
            candidate: data.candidate,
            sender: data.sender
        });
    });

    socket.on('send-message', async ({ meetingId, text, senderId, senderName }) => {
        try {
            const message = await Message.create({
                meetingId,
                sender: senderId,
                senderName,
                text,
            });
            io.to(meetingId).emit('receive-message', {
                text,
                senderName,
                timestamp: message.createdAt,
            });
        } catch (error) {
            console.error('Error saving message:', error);
        }
    });

    socket.on('disconnect', () => {
        console.log('User disconnected:', socket.id);
    });
});

const PORT = process.env.PORT || 5000;

server.listen(PORT, () => {
    console.log(`Server running in ${process.env.NODE_ENV} mode on port ${PORT}`);
});
