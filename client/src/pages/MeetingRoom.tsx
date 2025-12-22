import { useEffect, useRef, useState, useContext } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import io from 'socket.io-client';
import { AuthContext } from '../context/AuthContext';
import { motion } from 'framer-motion';
import { Mic, MicOff, Video, VideoOff, PhoneOff, Share, MessageSquare, Users } from 'lucide-react';

interface Peer {
    userId: string;
    stream: MediaStream;
    name?: string;
}

interface UserConnectedPayload {
    userId: string;
    name: string;
}

interface OfferPayload {
    offer: RTCSessionDescriptionInit;
    sender: string;
    name: string;
}

interface AnswerPayload {
    answer: RTCSessionDescriptionInit;
    sender: string;
}

interface IceCandidatePayload {
    candidate: RTCIceCandidate;
    sender: string;
}

interface ChatMessage {
    text: string;
    senderName: string;
    timestamp: string;
}

const MeetingRoom = () => {
    const { id: meetingId } = useParams<{ id: string }>();
    const { user } = useContext(AuthContext)!;
    const navigate = useNavigate();

    console.log("MeetingRoom Params:", { meetingId, user });

    const [socket, setSocket] = useState<any | null>(null);
    const [stream, setStream] = useState<MediaStream | null>(null);
    const [peers, setPeers] = useState<Peer[]>([]);
    const [messages, setMessages] = useState<ChatMessage[]>([]);
    const [showChat, setShowChat] = useState(false);
    const [newMessage, setNewMessage] = useState('');

    const [isMicOn, setIsMicOn] = useState(true);
    const [isVideoOn, setIsVideoOn] = useState(true);

    const myVideoRef = useRef<HTMLVideoElement>(null);
    const peersRef = useRef<{ [key: string]: RTCPeerConnection }>({});
    const [screenSharingId, setScreenSharingId] = useState<string | null>(null);
    const [videoStatus, setVideoStatus] = useState<{ [key: string]: boolean }>({});

    // Helper to keep ref in sync for existing logic if needed, though we will use VideoDisplay mostly
    useEffect(() => {
        if (myVideoRef.current && stream) {
            myVideoRef.current.srcObject = stream;
        }
    }, [stream]);

    const createPeerConnection = (targetUserId: string, socketToUse: any, name?: string, streamToUse?: MediaStream) => {
        console.log(`Creating PeerConnection for ${targetUserId} with stream:`, !!streamToUse);
        const peerConnection = new RTCPeerConnection({
            iceServers: [
                { urls: 'stun:stun.l.google.com:19302' },
                { urls: 'stun:global.stun.twilio.com:3478' }
            ]
        });

        peerConnection.onicecandidate = (event) => {
            if (event.candidate) {
                console.log('Sending ICE candidate to', targetUserId);
                socketToUse.emit('ice-candidate', {
                    target: targetUserId,
                    candidate: event.candidate,
                    sender: user?._id
                });
            }
        };

        peerConnection.ontrack = (event) => {
            console.log('Received track from', targetUserId);
            setPeers(prev => {
                if (!prev.find(p => p.userId === targetUserId)) {
                    return [...prev, { userId: targetUserId, stream: event.streams[0], name }];
                }
                return prev;
            });
        };

        if (streamToUse) {
            streamToUse.getTracks().forEach(track => peerConnection.addTrack(track, streamToUse));
        }

        peersRef.current[targetUserId] = peerConnection;
        return peerConnection;
    };

    useEffect(() => {
        const newSocket = io('http://localhost:5000');
        setSocket(newSocket);

        navigator.mediaDevices.getUserMedia({ video: true, audio: true })
            .then((currentStream) => {
                setStream(currentStream);
                if (myVideoRef.current) {
                    myVideoRef.current.srcObject = currentStream;
                }

                newSocket.emit('join-room', { meetingId, userId: user?._id, name: user?.name });

                newSocket.on('user-connected', ({ userId, name }: UserConnectedPayload) => {
                    console.log('User connected event received:', userId);
                    // Pass newSocket and currentStream explicitly
                    const peerConnection = createPeerConnection(userId, newSocket, name, currentStream);
                    peerConnection.createOffer().then(offer => {
                        console.log('Created Offer for', userId);
                        peerConnection.setLocalDescription(offer);
                        newSocket.emit('offer', {
                            target: userId,
                            offer: offer,
                            sender: user?._id,
                            name: user?.name
                        });
                        console.log('Sent Offer to', userId);
                    }).catch(err => console.error('Error creating offer:', err));
                });

                newSocket.on('offer', async ({ offer, sender, name }: OfferPayload) => {
                    console.log('Received Offer from', sender);
                    // Pass newSocket and currentStream explicitly
                    const peerConnection = createPeerConnection(sender, newSocket, name, currentStream);
                    await peerConnection.setRemoteDescription(offer);
                    const answer = await peerConnection.createAnswer();
                    await peerConnection.setLocalDescription(answer);
                    newSocket.emit('answer', {
                        target: sender,
                        answer: answer,
                        sender: user?._id
                    });
                    console.log('Sent Answer to', sender);
                });

                newSocket.on('answer', async ({ answer, sender }: AnswerPayload) => {
                    const peerConnection = peersRef.current[sender];
                    if (peerConnection) {
                        await peerConnection.setRemoteDescription(answer);
                    }
                });

                newSocket.on('ice-candidate', async ({ candidate, sender }: IceCandidatePayload) => {
                    const peerConnection = peersRef.current[sender];
                    if (peerConnection) {
                        await peerConnection.addIceCandidate(candidate);
                    }
                });

                newSocket.on('receive-message', (message: ChatMessage) => {
                    setMessages(prev => [...prev, message]);
                });

                newSocket.on('user-started-sharing', ({ userId }: { userId: string }) => {
                    console.log('User started sharing:', userId);
                    setScreenSharingId(userId);
                });

                newSocket.on('user-stopped-sharing', () => {
                    console.log('User stopped sharing');
                    setScreenSharingId(null);
                });

                newSocket.on('user-video-status', ({ userId, isVideoOn }: { userId: string, isVideoOn: boolean }) => {
                    setVideoStatus(prev => ({ ...prev, [userId]: isVideoOn }));
                });

            })
            .catch(err => console.error('Error accessing media:', err));

        return () => {
            newSocket.disconnect();
            if (stream) {
                stream.getTracks().forEach(track => track.stop());
            }
            Object.values(peersRef.current).forEach(pc => pc.close());
        };
    }, [meetingId, user]);

    const toggleMic = () => {
        if (stream) {
            const audioTrack = stream.getAudioTracks()[0];
            if (audioTrack) {
                audioTrack.enabled = !isMicOn;
                setIsMicOn(!isMicOn);
            }
        }
    };

    const toggleVideo = () => {
        if (stream) {
            const videoTrack = stream.getVideoTracks()[0];
            if (videoTrack) {
                videoTrack.enabled = !isVideoOn;
                setIsVideoOn(!isVideoOn);
                // Update local status map immediately for UI consistency
                if (user?._id) {
                    setVideoStatus(prev => ({ ...prev, [user._id]: !isVideoOn }));
                }
                socket.emit('video-status-change', {
                    meetingId,
                    userId: user?._id,
                    isVideoOn: !isVideoOn
                });
            }
        }
    };

    const sendMessage = (e: React.FormEvent) => {
        e.preventDefault();
        if (newMessage.trim() && socket) {
            socket.emit('send-message', {
                meetingId,
                text: newMessage,
                senderId: user?._id,
                senderName: user?.name
            });
            setNewMessage('');
        }
    };

    const shareScreen = () => {
        navigator.mediaDevices.getDisplayMedia({ video: true })
            .then(screenStream => {
                const screenTrack = screenStream.getVideoTracks()[0];

                if (stream) {
                    const videoTrack = stream.getVideoTracks()[0];
                    stream.removeTrack(videoTrack);
                    stream.addTrack(screenTrack);
                    setStream(new MediaStream([screenTrack, ...stream.getAudioTracks()]));

                    // Notify server
                    socket.emit('start-screen-share', { meetingId, userId: user?._id });
                    setScreenSharingId(user?._id || null);

                    // Replace track for all peers
                    Object.values(peersRef.current).forEach(pc => {
                        const sender = pc.getSenders().find(s => s.track?.kind === 'video');
                        if (sender) {
                            sender.replaceTrack(screenTrack);
                        }
                    });

                    screenTrack.onended = () => {
                        // Notify server
                        socket.emit('stop-screen-share', { meetingId, userId: user?._id });
                        setScreenSharingId(null);

                        // Revert to camera
                        navigator.mediaDevices.getUserMedia({ video: true })
                            .then(camStream => {
                                const camTrack = camStream.getVideoTracks()[0];
                                stream.removeTrack(screenTrack);
                                stream.addTrack(camTrack);
                                setStream(new MediaStream([camTrack, ...stream.getAudioTracks()]));

                                Object.values(peersRef.current).forEach(pc => {
                                    const sender = pc.getSenders().find(s => s.track?.kind === 'video');
                                    if (sender) {
                                        sender.replaceTrack(camTrack);
                                    }
                                });
                            });
                    };
                }
            })
            .catch(err => console.error("Failed to share screen:", err));
    };

    const leaveMeeting = () => {
        navigate('/dashboard');
    };

    return (
        <div className="h-screen bg-black flex flex-col relative overflow-hidden text-white">
            {/* Ambient Background */}
            <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-indigo-900/20 via-black to-black z-0 pointer-events-none" />

            {/* Header */}
            <div className="absolute top-0 left-0 right-0 p-6 z-20 flex justify-between items-center bg-gradient-to-b from-black/80 to-transparent pointer-events-none">
                <div className="flex items-center gap-3 pointer-events-auto">
                    <div className="glass-panel px-4 py-2 flex items-center gap-2 rounded-full bg-white/5 border-white/10">
                        <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
                        <span className="font-display font-medium tracking-wide text-sm">{meetingId}</span>
                    </div>
                </div>
            </div>

            <div className="flex flex-1 overflow-hidden relative z-10 p-6 pt-20 pb-24 gap-6">
                <div className={`flex-1 transition-all duration-500 ease-in-out ${showChat ? 'w-2/3' : 'w-full'}`}>
                    {screenSharingId ? (
                        // Spotlight Layout
                        <div className="flex gap-4 h-full">
                            <div className="flex-1 relative bg-gray-900/50 rounded-3xl overflow-hidden border border-white/10 shadow-2xl">
                                {screenSharingId === user?._id ? (
                                    <VideoDisplay
                                        stream={stream}
                                        name={`You (${user?.name})`}
                                        isLocal={true}
                                        isMirrored={false}
                                        isVideoOn={videoStatus[user?._id] ?? isVideoOn}
                                    />
                                ) : (
                                    (() => {
                                        const sharer = peers.find(p => p.userId === screenSharingId);
                                        return sharer ? (
                                            <VideoDisplay
                                                stream={sharer.stream}
                                                name={sharer.name}
                                                isVideoOn={videoStatus[sharer.userId] ?? true}
                                            />
                                        ) : <div className="flex items-center justify-center h-full text-white">Sharer not found</div>;
                                    })()
                                )}
                            </div>
                            <div className="w-1/4 flex flex-col gap-4 overflow-y-auto custom-scrollbar pr-2">
                                {screenSharingId !== user?._id && (
                                    <div className="h-48 flex-shrink-0">
                                        <VideoDisplay
                                            stream={stream}
                                            name={`You (${user?.name})`}
                                            isLocal={true}
                                            isMirrored={true}
                                            isVideoOn={user?._id ? (videoStatus[user._id] ?? isVideoOn) : isVideoOn}
                                        />
                                    </div>
                                )}
                                {peers.filter(p => p.userId !== screenSharingId).map(peer => (
                                    <div key={peer.userId} className="h-48 flex-shrink-0">
                                        <VideoDisplay
                                            stream={peer.stream}
                                            name={peer.name}
                                            isVideoOn={videoStatus[peer.userId] ?? true}
                                        />
                                    </div>
                                ))}
                            </div>
                        </div>
                    ) : (
                        // Grid Layout
                        <div className={`grid gap-4 h-full ${peers.length === 0 ? 'grid-cols-1 max-w-4xl mx-auto' :
                            peers.length === 1 ? 'grid-cols-1 md:grid-cols-2' :
                                'grid-cols-1 md:grid-cols-2 lg:grid-cols-3'
                            }`}>

                            <VideoDisplay stream={stream} name={`You (${user?.name})`} isLocal={true} isMirrored={true} isVideoOn={videoStatus[user?._id] ?? isVideoOn} />

                            {peers.map((peer) => (
                                <VideoDisplay key={peer.userId} stream={peer.stream} name={peer.name} isVideoOn={videoStatus[peer.userId] ?? true} />
                            ))}
                        </div>
                    )}
                </div>

                {/* Chat Panel */}
                {showChat && (
                    <motion.div
                        initial={{ x: "100%", opacity: 0 }}
                        animate={{ x: 0, opacity: 1 }}
                        exit={{ x: "100%", opacity: 0 }}
                        transition={{ type: "spring", damping: 25, stiffness: 200 }}
                        className="w-96 glass-panel border-l border-white/10 flex flex-col absolute right-6 top-20 bottom-24 bg-black/40 backdrop-blur-xl z-30 overflow-hidden shadow-2xl"
                    >
                        <div className="p-4 border-b border-white/10 bg-white/5 flex justify-between items-center">
                            <span className="font-display font-bold">Meeting Chat</span>
                            <button onClick={() => setShowChat(false)} className="hover:bg-white/10 p-1 rounded-md transition-colors">
                                <span className="sr-only">Close</span>
                                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18" /><path d="m6 6 12 12" /></svg>
                            </button>
                        </div>
                        <div className="flex-1 p-4 overflow-y-auto space-y-4 custom-scrollbar">
                            {messages.map((msg, idx) => (
                                <div key={idx} className="flex flex-col gap-1 anim-fade-in">
                                    <div className="flex items-baseline justify-between gap-2">
                                        <span className="text-xs font-bold text-indigo-400">{msg.senderName}</span>
                                        <span className="text-[10px] text-gray-500">{new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                                    </div>
                                    <div className="bg-white/10 p-3 rounded-2xl rounded-tl-sm text-sm leading-relaxed text-gray-200">
                                        {msg.text}
                                    </div>
                                </div>
                            ))}
                        </div>
                        <form onSubmit={sendMessage} className="p-4 border-t border-white/10 bg-white/5">
                            <div className="relative">
                                <input
                                    type="text"
                                    value={newMessage}
                                    onChange={(e) => setNewMessage(e.target.value)}
                                    placeholder="Type a message..."
                                    className="w-full bg-black/20 border border-white/10 rounded-xl px-4 py-3 pr-10 text-white focus:outline-none focus:border-indigo-500/50 focus:ring-1 focus:ring-indigo-500/50 transition-all text-sm"
                                />
                                <button
                                    type="submit"
                                    disabled={!newMessage.trim()}
                                    className="absolute right-2 top-2 p-1.5 bg-indigo-500 rounded-lg text-white hover:bg-indigo-600 disabled:opacity-50 disabled:hover:bg-indigo-500 transition-colors"
                                >
                                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m22 2-7 20-4-9-9-4Z" /><path d="M22 2 11 13" /></svg>
                                </button>
                            </div>
                        </form>
                    </motion.div>
                )}
            </div>

            {/* Control Bar */}
            <div className="absolute bottom-8 left-1/2 transform -translate-x-1/2 z-30">
                <div className="glass-panel px-8 py-4 rounded-full flex items-center gap-6 bg-black/40 border-white/10 shadow-2xl backdrop-blur-xl hover:scale-105 transition-transform duration-300">
                    <button onClick={toggleMic} className={`p-4 rounded-full transition-all duration-300 ${isMicOn ? 'bg-white/10 hover:bg-white/20 text-white' : 'bg-red-500 hover:bg-red-600 text-white shadow-lg shadow-red-500/30'}`}>
                        {isMicOn ? <Mic size={22} /> : <MicOff size={22} />}
                    </button>

                    <button onClick={toggleVideo} className={`p-4 rounded-full transition-all duration-300 ${isVideoOn ? 'bg-white/10 hover:bg-white/20 text-white' : 'bg-red-500 hover:bg-red-600 text-white shadow-lg shadow-red-500/30'}`}>
                        {isVideoOn ? <Video size={22} /> : <VideoOff size={22} />}
                    </button>

                    <button onClick={shareScreen} className="p-4 rounded-full bg-white/10 hover:bg-indigo-500 hover:text-white hover:shadow-lg hover:shadow-indigo-500/30 text-gray-300 transition-all duration-300" title="Share Screen">
                        <Share size={22} />
                    </button>

                    <button onClick={() => setShowChat(!showChat)} className={`p-4 rounded-full transition-all duration-300 relative ${showChat ? 'bg-indigo-500 text-white shadow-lg shadow-indigo-500/30' : 'bg-white/10 hover:bg-indigo-500 hover:text-white text-gray-300'}`}>
                        <MessageSquare size={22} />
                        {messages.length > 0 && !showChat && (
                            <span className="absolute top-0 right-0 w-3 h-3 bg-red-500 rounded-full border-2 border-black" />
                        )}
                    </button>

                    <button className="p-4 rounded-full bg-white/10 hover:bg-indigo-500 hover:text-white hover:shadow-lg hover:shadow-indigo-500/30 text-gray-300 transition-all duration-300">
                        <Users size={22} />
                    </button>

                    <div className="w-px h-10 bg-white/10 mx-2" />

                    <button onClick={leaveMeeting} className="p-4 rounded-full bg-red-500/80 hover:bg-red-600 text-white transition-all duration-300 shadow-lg shadow-red-500/20 group w-16 hover:w-32 flex items-center justify-center overflow-hidden">
                        <div className="flex items-center gap-2">
                            <PhoneOff size={24} className="flex-shrink-0" />
                            <span className="hidden group-hover:block font-medium whitespace-nowrap text-sm">Leave</span>
                        </div>
                    </button>
                </div>
            </div>
        </div>
    );
};

const VideoDisplay = ({ stream, name, isLocal = false, isMirrored = false, isMicOn = true, isVideoOn = true }: { stream: MediaStream | null, name?: string, isLocal?: boolean, isMirrored?: boolean, isMicOn?: boolean, isVideoOn?: boolean }) => {
    const videoRef = useRef<HTMLVideoElement>(null);

    useEffect(() => {
        if (videoRef.current && stream) {
            videoRef.current.srcObject = stream;
        }
    }, [stream]);

    // Generate random color from name
    const getInitials = (name?: string) => name ? name.charAt(0).toUpperCase() : '?';
    const getColor = (name?: string) => {
        const colors = ['bg-red-500', 'bg-blue-500', 'bg-green-500', 'bg-yellow-500', 'bg-purple-500', 'bg-pink-500', 'bg-indigo-500', 'bg-teal-500'];
        let hash = 0;
        if (name) {
            for (let i = 0; i < name.length; i++) {
                hash = name.charCodeAt(i) + ((hash << 5) - hash);
            }
        }
        return colors[Math.abs(hash) % colors.length];
    };

    return (
        <motion.div
            layout
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            className="relative bg-gray-900/50 rounded-3xl overflow-hidden border border-white/10 shadow-2xl group ring-1 ring-white/5 w-full h-full flex items-center justify-center bg-zinc-900"
        >
            {isVideoOn ? (
                <video
                    ref={videoRef}
                    muted={isLocal} // Always mute local video
                    autoPlay
                    playsInline
                    className={`w-full h-full object-cover ${isMirrored ? 'transform scale-x-[-1]' : ''}`}
                />
            ) : (
                <div className={`w-24 h-24 rounded-full flex items-center justify-center text-4xl font-bold text-white shadow-lg ${getColor(name)}`}>
                    {getInitials(name)}
                </div>
            )}

            <div className="absolute bottom-4 left-4 glass-panel px-3 py-1.5 rounded-lg flex items-center gap-2 backdrop-blur-md bg-black/40 border-none">
                <span className="text-xs font-semibold tracking-wide text-white">{name || 'Participant'}</span>
                {isLocal && !isMicOn && <MicOff size={12} className="text-red-400" />}
            </div>
        </motion.div>
    );
};

export default MeetingRoom;
