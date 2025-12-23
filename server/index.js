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

const meetings = {}; // { meetingId: { adminId: string } }

io.on('connection', (socket) => {
    console.log('User connected:', socket.id);

    socket.on('join-room', ({ meetingId, userId, name }) => {
        console.log('DEBUG JOIN-ROOM:', { meetingId, userId, name });
        socket.join(meetingId);
        socket.join(userId);

        // Store metadata
        socket.meetingId = meetingId;
        socket.userId = userId;

        // Admin Assignment Logic
        if (!meetings[meetingId]) {
            meetings[meetingId] = {
                adminId: userId,
                mutedUsers: new Set(),
                videoOffUsers: new Set(),
                kickedUsers: new Set(), // Restricted (needs approval)
                blockedUsers: new Set(), // Permanently banned
                participants: {} // { userId: { name, isOnline } }
            };
            console.log(`Meeting ${meetingId} created by ${name} (${userId}) - ADMIN`);
        }

        const meeting = meetings[meetingId];

        // Track participant
        if (!meeting.participants) meeting.participants = {};
        meeting.participants[userId] = { name, isOnline: true };

        // Check Restrictions
        if (meeting.blockedUsers && meeting.blockedUsers.has(userId)) {
            socket.emit('entry-denied', { reason: 'Host has blocked you from this meeting.' });
            return;
        }

        if (meeting.kickedUsers && meeting.kickedUsers.has(userId)) {
            socket.emit('entry-pending');
            // Notify Admin
            io.to(meeting.adminId).emit('entry-request', { userId, name });
            return;
        }

        const isAdmin = meeting.adminId === userId;
        const mutedUsers = Array.from(meeting.mutedUsers || []);
        const videoOffUsers = Array.from(meeting.videoOffUsers || []);
        socket.emit('room-role', { isAdmin, mutedUsers, videoOffUsers });

        console.log(`User ${name} (${userId}) joined room ${meetingId}. Is Admin: ${isAdmin}`);
        socket.to(meetingId).emit('user-connected', { userId, name });

        // Send full participants list to everyone in the room
        io.to(meetingId).emit('participants-list', Object.entries(meeting.participants).map(([id, p]) => ({
            userId: id,
            name: p.name,
            isOnline: p.isOnline
        })));
    });

    socket.on('kick-user', ({ meetingId, targetUserId }) => {
        const meeting = meetings[meetingId];
        if (meeting && meeting.adminId === socket.userId) {
            console.log(`Admin ${socket.userId} kicking ${targetUserId} from ${meetingId}`);

            // Add to Restricted list (needs approval to rejoin)
            if (!meeting.kickedUsers) meeting.kickedUsers = new Set();
            meeting.kickedUsers.add(targetUserId);

            io.to(targetUserId).emit('kicked');
            // Optimistically tell others they disconnected so UI updates faster
            io.to(meetingId).emit('user-disconnected', { userId: targetUserId });
        }
    });

    socket.on('admin-mute-user', ({ meetingId, targetUserId }) => {
        const meeting = meetings[meetingId];
        if (meeting && meeting.adminId === socket.userId) {
            console.log(`Admin ${socket.userId} hard muting ${targetUserId} in ${meetingId}`);
            if (!meeting.mutedUsers) meeting.mutedUsers = new Set();
            meeting.mutedUsers.add(targetUserId);

            io.to(targetUserId).emit('admin-muted'); // Keeps mic off locally
            io.to(meetingId).emit('user-hard-muted', { userId: targetUserId });
        }
    });

    socket.on('admin-unmute-user', ({ meetingId, targetUserId }) => {
        const meeting = meetings[meetingId];
        if (meeting && meeting.adminId === socket.userId) {
            console.log(`Admin ${socket.userId} hard unmuting ${targetUserId} in ${meetingId}`);
            if (meeting.mutedUsers) {
                meeting.mutedUsers.delete(targetUserId);
            }
            io.to(meetingId).emit('user-hard-unmuted', { userId: targetUserId });
        }
    });

    socket.on('admin-stop-video', ({ meetingId, targetUserId }) => {
        const meeting = meetings[meetingId];
        if (meeting && meeting.adminId === socket.userId) {
            console.log(`Admin ${socket.userId} hard stopping video for ${targetUserId} in ${meetingId}`);
            if (!meeting.videoOffUsers) meeting.videoOffUsers = new Set();
            meeting.videoOffUsers.add(targetUserId);

            io.to(meetingId).emit('user-hard-video-off', { userId: targetUserId });
        }
    });

    socket.on('admin-allow-video', ({ meetingId, targetUserId }) => {
        const meeting = meetings[meetingId];
        if (meeting && meeting.adminId === socket.userId) {
            console.log(`Admin ${socket.userId} allowing video for ${targetUserId} in ${meetingId}`);
            if (meeting.videoOffUsers) {
                meeting.videoOffUsers.delete(targetUserId);
            }
            io.to(meetingId).emit('user-hard-video-allow', { userId: targetUserId });
        }
    });

    // --- GLOBAL ADMIN CONTROLS ---

    socket.on('admin-mute-all', ({ meetingId }) => {
        const meeting = meetings[meetingId];
        if (meeting && meeting.adminId === socket.userId) {
            console.log(`Admin ${socket.userId} hard muting ALL in ${meetingId}`);

            const socketsInRoom = io.sockets.adapter.rooms.get(meetingId);
            if (socketsInRoom) {
                socketsInRoom.forEach(socketId => {
                    const s = io.sockets.sockets.get(socketId);
                    if (s && s.userId !== meeting.adminId) {
                        meeting.mutedUsers.add(s.userId);
                    }
                });
            }

            // Broadcast the full list of now muted users (or just a generic "all" event)
            // Sending generic "all" event is more efficient for this specific action
            const allMuted = Array.from(meeting.mutedUsers);
            io.to(meetingId).emit('all-users-hard-muted', { mutedUsers: allMuted });
        }
    });

    socket.on('admin-unmute-all', ({ meetingId }) => {
        const meeting = meetings[meetingId];
        if (meeting && meeting.adminId === socket.userId) {
            console.log(`Admin ${socket.userId} hard unmuting ALL in ${meetingId}`);
            // We clear the set, or specifically remove everyone currently in the room?
            // "Unmute All" usually implies clearing restrictions.
            meeting.mutedUsers.clear();
            io.to(meetingId).emit('all-users-hard-unmuted');
        }
    });

    socket.on('admin-stop-video-all', ({ meetingId }) => {
        const meeting = meetings[meetingId];
        if (meeting && meeting.adminId === socket.userId) {
            console.log(`Admin ${socket.userId} stopping ALL video in ${meetingId}`);

            const socketsInRoom = io.sockets.adapter.rooms.get(meetingId);
            if (socketsInRoom) {
                socketsInRoom.forEach(socketId => {
                    const s = io.sockets.sockets.get(socketId);
                    if (s && s.userId !== meeting.adminId) {
                        meeting.videoOffUsers.add(s.userId);
                    }
                });
            }
            const allVideoOff = Array.from(meeting.videoOffUsers);
            io.to(meetingId).emit('all-users-hard-video-off', { videoOffUsers: allVideoOff });
        }
    });

    socket.on('admin-allow-video-all', ({ meetingId }) => {
        const meeting = meetings[meetingId];
        if (meeting && meeting.adminId === socket.userId) {
            console.log(`Admin ${socket.userId} allowing ALL video in ${meetingId}`);
            meeting.videoOffUsers.clear();
            io.to(meetingId).emit('all-users-hard-video-allow');
        }
    });

    socket.on('admin-response-entry', ({ meetingId, targetUserId, approved }) => {
        const meeting = meetings[meetingId];
        if (meeting && meeting.adminId === socket.userId) {
            if (approved) {
                console.log(`Admin APPROVED re-entry for ${targetUserId}`);
                if (meeting.kickedUsers) meeting.kickedUsers.delete(targetUserId);
                io.to(targetUserId).emit('entry-approved');
            } else {
                console.log(`Admin DENIED re-entry for ${targetUserId}`);
                if (meeting.kickedUsers) meeting.kickedUsers.delete(targetUserId);
                if (!meeting.blockedUsers) meeting.blockedUsers = new Set();
                meeting.blockedUsers.add(targetUserId);
                io.to(targetUserId).emit('entry-denied', { reason: 'Host denied your request to join.' });
            }
        }
    });

    socket.on('offer', (data) => {
        // ... (existing logic)
        console.log(`Relaying OFFER from ${data.sender} to ${data.target}`);
        socket.to(data.target).emit('offer', {
            offer: data.offer,
            sender: data.sender,
            name: data.name
        });
    });

    socket.on('answer', (data) => {
        // ... (existing logic)
        console.log(`Relaying ANSWER from ${data.sender} to ${data.target}`);
        socket.to(data.target).emit('answer', {
            answer: data.answer,
            sender: data.sender
        });
    });

    socket.on('ice-candidate', (data) => {
        // ... (existing logic)
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
            const messageData = { meetingId, sender: senderId, senderName, text: text || '' };
            if (file) messageData.file = file;
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

            const meeting = meetings[socket.meetingId];
            if (meeting && meeting.participants[socket.userId]) {
                meeting.participants[socket.userId].isOnline = false;

                // Broadcast updated participants list
                io.to(socket.meetingId).emit('participants-list', Object.entries(meeting.participants).map(([id, p]) => ({
                    userId: id,
                    name: p.name,
                    isOnline: p.isOnline
                })));
            }

            // Clean up meeting if admin leaves? Or keep it specific logic?
            // For now, if everyone leaves, maybe clean up.
            // Simple cleanup: check room size.
            const room = io.sockets.adapter.rooms.get(socket.meetingId);
            if (!room || room.size === 0) {
                delete meetings[socket.meetingId];
                console.log(`Meeting ${socket.meetingId} ended and cleaned up.`);
            }
        }
    });
});

const PORT = process.env.PORT || 5000;

server.listen(PORT, () => {
    console.log(`Server running in ${process.env.NODE_ENV} mode on port ${PORT}`);
});
