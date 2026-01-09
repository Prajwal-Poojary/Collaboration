const express = require('express');
const dotenv = require('dotenv');
const cors = require('cors');
const http = require('http');
const path = require('path');
const { Server } = require('socket.io');
const connectDB = require('./config/db');
const authRoutes = require('./routes/authRoutes');
const meetingRoutes = require('./routes/meetingRoutes');

const Message = require('./models/Message');
const Document = require('./models/Document');


const envPath = path.join(__dirname, '.env');
dotenv.config({ path: envPath });

connectDB();

const app = express();
const server = http.createServer(app);

app.use(cors());
app.use(express.json());

const multer = require('multer');
// Path already imported at top

app.use('/api/auth', authRoutes);
app.use('/api/meetings', meetingRoutes);


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


    socket.on('join-room', ({ meetingId, userId, name }) => {
        console.log(`[Socket] User ${userId} (${name}) attempting to join room ${meetingId}. Socket ID: ${socket.id}`);

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
                whiteboardElements: [], // Initialize whiteboard state
                participants: {}, // { userId: { name, isOnline } }
                whiteboardOwnerId: null, // Track who owns the whiteboard
                activeSpeakers: new Map() // { userId: { volume, timestamp } }
            };

        }

        const meeting = meetings[meetingId];

        // Track participant
        if (!meeting.participants) meeting.participants = {};

        // Initialize or update existing participant
        if (!meeting.participants[userId]) {
            meeting.participants[userId] = {
                name,
                isOnline: true,
                totalDuration: 0,
                lastJoinTime: Date.now()
            };
        } else {
            meeting.participants[userId].isOnline = true;
            meeting.participants[userId].lastJoinTime = Date.now();
        }

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


        socket.to(meetingId).emit('user-connected', { userId, name });
        console.log(`[Socket] user-connected emitted to room ${meetingId} for user ${userId}`);

        // If whiteboard is active, tell the new user
        if (meeting.whiteboardOwnerId) {
            socket.emit('whiteboard-started', { ownerId: meeting.whiteboardOwnerId });
            // And send state
            if (meeting.whiteboardElements) {
                socket.emit('wb-update-elements', meeting.whiteboardElements);
            }
        }

        // Send full participants list to everyone in the room
        io.to(meetingId).emit('participants-list', Object.entries(meeting.participants).map(([id, p]) => ({
            userId: id,
            name: p.name,
            isOnline: p.isOnline,
            totalDuration: p.totalDuration,
            lastJoinTime: p.lastJoinTime
        })));
    });

    socket.on('kick-user', ({ meetingId, targetUserId }) => {
        const meeting = meetings[meetingId];
        if (meeting && meeting.adminId === socket.userId) {


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

            if (!meeting.mutedUsers) meeting.mutedUsers = new Set();
            meeting.mutedUsers.add(targetUserId);

            io.to(targetUserId).emit('admin-muted'); // Keeps mic off locally
            io.to(meetingId).emit('user-hard-muted', { userId: targetUserId });
        }
    });

    socket.on('admin-unmute-user', ({ meetingId, targetUserId }) => {
        const meeting = meetings[meetingId];
        if (meeting && meeting.adminId === socket.userId) {

            if (meeting.mutedUsers) {
                meeting.mutedUsers.delete(targetUserId);
            }
            io.to(meetingId).emit('user-hard-unmuted', { userId: targetUserId });
        }
    });

    socket.on('admin-stop-video', ({ meetingId, targetUserId }) => {
        const meeting = meetings[meetingId];
        if (meeting && meeting.adminId === socket.userId) {

            if (!meeting.videoOffUsers) meeting.videoOffUsers = new Set();
            meeting.videoOffUsers.add(targetUserId);

            io.to(meetingId).emit('user-hard-video-off', { userId: targetUserId });
        }
    });

    socket.on('admin-allow-video', ({ meetingId, targetUserId }) => {
        const meeting = meetings[meetingId];
        if (meeting && meeting.adminId === socket.userId) {

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

            // We clear the set, or specifically remove everyone currently in the room?
            // "Unmute All" usually implies clearing restrictions.
            meeting.mutedUsers.clear();
            io.to(meetingId).emit('all-users-hard-unmuted');
        }
    });

    socket.on('admin-stop-video-all', ({ meetingId }) => {
        const meeting = meetings[meetingId];
        if (meeting && meeting.adminId === socket.userId) {


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

            meeting.videoOffUsers.clear();
            io.to(meetingId).emit('all-users-hard-video-allow');
        }
    });

    socket.on('admin-response-entry', ({ meetingId, targetUserId, approved }) => {
        const meeting = meetings[meetingId];
        if (meeting && meeting.adminId === socket.userId) {
            if (approved) {

                if (meeting.kickedUsers) meeting.kickedUsers.delete(targetUserId);
                io.to(targetUserId).emit('entry-approved');
            } else {

                if (meeting.kickedUsers) meeting.kickedUsers.delete(targetUserId);
                if (!meeting.blockedUsers) meeting.blockedUsers = new Set();
                meeting.blockedUsers.add(targetUserId);
                io.to(targetUserId).emit('entry-denied', { reason: 'Host denied your request to join.' });
            }
        }
    });

    socket.on('offer', (data) => {
        console.log(`[WebRTC] Offer from ${data.sender} to ${data.target}`);

        socket.to(data.target).emit('offer', {
            offer: data.offer,
            sender: data.sender,
            name: data.name
        });
    });

    socket.on('answer', (data) => {
        // ... (existing logic)

        socket.to(data.target).emit('answer', {
            answer: data.answer,
            sender: data.sender
        });
    });

    socket.on('ice-candidate', (data) => {
        // ... (existing logic)

        socket.to(data.target).emit('ice-candidate', {
            candidate: data.candidate,
            sender: data.sender
        });
    });

    socket.on('start-screen-share', ({ meetingId, userId }) => {

        socket.to(meetingId).emit('user-started-sharing', { userId });
    });

    socket.on('stop-screen-share', ({ meetingId, userId }) => {

        socket.to(meetingId).emit('user-stopped-sharing', { userId });
    });

    socket.on('video-status-change', ({ meetingId, userId, isVideoOn }) => {

        socket.to(meetingId).emit('user-video-status', { userId, isVideoOn });
    });

    socket.on('audio-level', ({ meetingId, userId, volume }) => {
        const meeting = meetings[meetingId];
        if (meeting && meeting.activeSpeakers) {
            meeting.activeSpeakers.set(userId, { volume, timestamp: Date.now() });
        }
    });

    // --- WHITEBOARD EVENTS ---
    socket.on('start-whiteboard', ({ meetingId }) => {

        const meeting = meetings[meetingId];
        if (meeting) {
            // If already open, just join? Or exclusive?
            // "Only the participant who clicks... is allowed... others view only"
            // Implies if I click and it's not open, I become owner.
            // If it IS open, do I takeover? Or just view?
            // "User clicks Whiteboard -> Grant edit permission to that user -> Set all others to view-only"
            // This implies "First to click" or "User clicks to Start".
            // Let's assume: If no owner, setter becomes owner. If owner exists, join as viewer.

            if (!meeting.whiteboardOwnerId) {
                meeting.whiteboardOwnerId = socket.userId;

            }

            // Broadcast to everyone (including sender so they know they are owner)
            io.to(meetingId).emit('whiteboard-started', { ownerId: meeting.whiteboardOwnerId });

            if (meeting.whiteboardElements) {
                socket.emit('wb-update-elements', meeting.whiteboardElements);
            }
        }
    });

    socket.on('stop-whiteboard', ({ meetingId }) => {
        const meeting = meetings[meetingId];
        if (meeting && meeting.whiteboardOwnerId === socket.userId) {

            meeting.whiteboardOwnerId = null;
            io.to(meetingId).emit('whiteboard-stopped');
        } else {

        }
    });

    // New State-based Sync
    socket.on('wb-update', ({ meetingId, elements }) => {
        const meeting = meetings[meetingId];
        if (meeting) {
            meeting.whiteboardElements = elements; // Persist state
            // Broadcast to others
            socket.to(meetingId).emit('wb-update-elements', elements);
        }
    });

    socket.on('wb-request-state', ({ meetingId }) => {
        const meeting = meetings[meetingId];
        if (meeting && meeting.whiteboardElements) {
            socket.emit('wb-update-elements', meeting.whiteboardElements);
        }
    });

    socket.on('whiteboard-clear', ({ meetingId }) => {
        const meeting = meetings[meetingId];
        if (meeting) {
            meeting.whiteboardElements = [];
            socket.to(meetingId).emit('wb-update-elements', []);
        }
    });

    // --- DOCUMENT EDITOR EVENTS ---

    socket.on('get-document', async ({ meetingId }) => {
        const meeting = meetings[meetingId];
        if (meeting) {
            // If there are other people in the meeting, ask them for the latest state (in-memory sync)
            const otherSockets = await io.in(meetingId).fetchSockets();
            const peer = otherSockets.find(s => s.userId !== socket.userId);

            if (peer) {
                // Ask peer for state

                io.to(peer.id).emit('doc-request-state', { requesterId: socket.id });
            } else {
                // Load from DB
                try {
                    let doc = await Document.findOne({ meetingId });
                    if (!doc) {
                        doc = await Document.create({ meetingId, content: '' });
                    }
                    socket.emit('doc-load', { content: doc.content });
                } catch (err) {
                    console.error('Error loading document:', err);
                }
            }
        }
    });

    socket.on('doc-sync-state', ({ content, requesterId }) => {
        // Peer provided state, forward to requester
        io.to(requesterId).emit('doc-load', { content });
    });

    socket.on('send-changes', ({ meetingId, delta }) => {
        // Broadcast changes to everyone else
        socket.to(meetingId).emit('receive-changes', delta);
    });

    socket.on('save-document', async ({ meetingId, content }) => {
        try {
            await Document.findOneAndUpdate(
                { meetingId },
                { content, lastUpdated: new Date() },
                { upsert: true, new: true }
            );

        } catch (err) {
            console.error('Error saving document:', err);
        }
    });

    socket.on('doc-start', ({ meetingId }) => {
        io.to(meetingId).emit('doc-started');
    });

    socket.on('doc-stop', ({ meetingId }) => {
        io.to(meetingId).emit('doc-stopped');
    });

    socket.on('cursor-change', ({ meetingId, range, userName, color }) => {
        socket.to(meetingId).emit('cursor-update', {
            userId: socket.userId,
            userName,
            range,
            color
        });
    });

    // Cleanup on disconnect
    // Logic moved to disconnect handler but we should double check here if we need specific listeners

    // Active Speaker Broadcaster Interval (This should ideal run per meeting or global loop)
    // For simplicity, we can trigger it or have a global loop. 
    // Let's attach a specific interval for the meeting if not exists, or just use a global set interval if we want.
    // Given the structure, let's just create a global interval that iterates all meetings. 
    // BUT we don't have a global loop easily here without keeping track of intervals.
    // Let's lazy-init the interval on meeting creation? 
    // No, `meetings` object is flat. We can iterate it.

    // NOTE: In a real scalable app, use Redis or dedicated service.

    // We'll insert the socket listener above. For the broadcast loop:
    if (!global.activeSpeakerInterval) {
        global.activeSpeakerInterval = setInterval(() => {
            const now = Date.now();
            for (const meetingId in meetings) {
                const meeting = meetings[meetingId];
                if (meeting.activeSpeakers && meeting.activeSpeakers.size > 0) {
                    // Prune old speakers (> 2 seconds silence)
                    for (const [uid, data] of meeting.activeSpeakers) {
                        if (now - data.timestamp > 2000) {
                            meeting.activeSpeakers.delete(uid);
                        }
                    }

                    // Sort by volume
                    const sorted = Array.from(meeting.activeSpeakers.entries())
                        .sort((a, b) => b[1].volume - a[1].volume)
                        .slice(0, 4) // Top 4
                        .map(([uid]) => uid);

                    io.to(meetingId).emit('active-speakers', { speakers: sorted });
                }
            }
        }, 500); // Broadcast every 500ms
    }


    socket.on('send-message', async ({ meetingId, text, file, senderId, senderName }) => {
        try {
            const messageData = { meetingId, sender: senderId, senderName, text: text || '' };
            if (file) messageData.file = file;

            // Try to persist
            const message = await Message.create(messageData);

            // Broadcast after persistence to ensure ID and timestamps are available
            io.to(meetingId).emit('receive-message', {
                _id: message._id.toString(),
                text: message.text,
                file: message.file,
                senderId: message.sender.toString(),
                senderName: message.senderName,
                timestamp: message.createdAt,
                isEdited: message.isEdited
            });
        } catch (error) {
            console.error('Error saving message (chat works ephemerally):', error);
        }
    });

    socket.on('edit-message', async ({ meetingId, messageId, newText, senderId }) => {
        try {
            const message = await Message.findById(messageId);
            if (message && message.sender.toString() === senderId) {
                message.text = newText;
                message.isEdited = true;
                await message.save();
                io.to(meetingId).emit('message-edited', { messageId, newText });
            }
        } catch (error) {
            console.error('Error editing message:', error);
        }
    });

    socket.on('disconnect', () => {
        console.log(`[Socket] Disconnected: ${socket.id}. Was in meeting: ${socket.meetingId}`);

        if (socket.meetingId && socket.userId) {

            const meeting = meetings[socket.meetingId];
            let userName = '';

            if (meeting && meeting.participants[socket.userId]) {
                userName = meeting.participants[socket.userId].name;
            }

            socket.to(socket.meetingId).emit('user-disconnected', { userId: socket.userId, name: userName });

            if (meeting && meeting.participants[socket.userId]) {
                const participant = meeting.participants[socket.userId];

                // Calculate and add session duration
                if (participant.isOnline && participant.lastJoinTime) {
                    participant.totalDuration += (Date.now() - participant.lastJoinTime);
                }

                participant.isOnline = false;

                // Broadcast updated participants list
                io.to(socket.meetingId).emit('participants-list', Object.entries(meeting.participants).map(([id, p]) => ({
                    userId: id,
                    name: p.name,
                    isOnline: p.isOnline,
                    totalDuration: p.totalDuration,
                    totalDuration: p.totalDuration,
                    lastJoinTime: p.lastJoinTime
                })));

                // If owner left, close whiteboard?
                if (meeting.whiteboardOwnerId === socket.userId) {

                    meeting.whiteboardOwnerId = null;
                    io.to(socket.meetingId).emit('whiteboard-stopped');
                }
            }

            // Clean up meeting if admin leaves? Or keep it specific logic?
            // For now, if everyone leaves, maybe clean up.
            // Simple cleanup: check room size.
            const room = io.sockets.adapter.rooms.get(socket.meetingId);
            if (!room || room.size === 0) {
                delete meetings[socket.meetingId];

            }
        }
    });
});

const PORT = process.env.PORT || 5000;

server.listen(PORT, () => {
    console.log(`Server running in ${process.env.NODE_ENV} mode on port ${PORT}`);
});
