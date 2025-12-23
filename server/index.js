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

const multer = require('multer');
const path = require('path');

app.use('/api/auth', authRoutes);
app.use('/api/meetings', meetingRoutes);
app.use('/api/ai', aiRoutes);

// Configure Multer for file uploads
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, 'uploads/');
    },
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, uniqueSuffix + path.extname(file.originalname));
    }
});

const upload = multer({ storage: storage });

// Serve uploaded files statically
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// File Upload Route
app.post('/api/upload', upload.single('file'), (req, res) => {
    if (!req.file) {
        return res.status(400).send('No file uploaded.');
    }

    // Construct public URL. Assuming server runs on same host/port 
    // In production, use process.env.BASE_URL
    const fileUrl = `${req.protocol}://${req.get('host')}/uploads/${req.file.filename}`;

    res.json({
        url: fileUrl,
        name: req.file.originalname,
        size: req.file.size,
        mimeType: req.file.mimetype
    });
});


app.get('/', (req, res) => {
    res.send('API is running...');
});

const io = new Server(server, {
    cors: {
        origin: '*',
        methods: ['GET', 'POST'],
    },
    maxHttpBufferSize: 1e8, // 100 MB to avoid disconnects on large files
});

io.on('connection', (socket) => {
    console.log('User connected:', socket.id);

    socket.on('join-room', ({ meetingId, userId, name }) => {
        console.log('DEBUG JOIN-ROOM:', { meetingId, userId, name });
        socket.join(meetingId);
        socket.join(userId); // Join a room with the user's ID for private messaging (signaling)

        // Store metadata for disconnect handling
        socket.meetingId = meetingId;
        socket.userId = userId;

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

    socket.on('start-screen-share', ({ meetingId, userId }) => {
        console.log(`User ${userId} started screen sharing in ${meetingId}`);
        socket.to(meetingId).emit('user-started-sharing', { userId });
    });

    socket.on('stop-screen-share', ({ meetingId, userId }) => {
        console.log(`User ${userId} stopped screen sharing in ${meetingId}`);
        socket.to(meetingId).emit('user-stopped-sharing', { userId });
    });

    socket.on('video-status-change', ({ meetingId, userId, isVideoOn }) => {
        console.log(`User ${userId} video status changed to ${isVideoOn}`);
        socket.to(meetingId).emit('user-video-status', { userId, isVideoOn });
    });

    socket.on('send-message', async ({ meetingId, text, file, senderId, senderName }) => {
        try {
            const messageData = {
                meetingId,
                sender: senderId,
                senderName,
                text: text || '',
            };

            if (file) {
                messageData.file = file;
            }

            const message = await Message.create(messageData);

            io.to(meetingId).emit('receive-message', {
                text: message.text,
                file: message.file,
                senderName: message.senderName,
                timestamp: message.createdAt,
            });
        } catch (error) {
            console.error('Error saving message:', error);
        }
    });

    socket.on('disconnect', () => {
        console.log('User disconnected:', socket.id);
        if (socket.meetingId && socket.userId) {
            console.log(`User ${socket.userId} left meeting ${socket.meetingId}`);
            socket.to(socket.meetingId).emit('user-disconnected', { userId: socket.userId });
        }
    });
});

const PORT = process.env.PORT || 5000;

server.listen(PORT, () => {
    console.log(`Server running in ${process.env.NODE_ENV} mode on port ${PORT}`);
});
