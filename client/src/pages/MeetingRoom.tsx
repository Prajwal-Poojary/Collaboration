import { useEffect, useRef, useState, useContext } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import io from 'socket.io-client';
import axios from 'axios';
import { AuthContext } from '../context/AuthContext';
import { motion } from 'framer-motion';
import { Mic, MicOff, Video, VideoOff, PhoneOff, Share, MessageSquare, Users, Info, Copy, Check, X, Smile, Paperclip, FileText, Download, Shield } from 'lucide-react';
import EmojiPicker, { Theme, type EmojiClickData } from 'emoji-picker-react';

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

interface Participant {
    userId: string;
    name: string;
    isOnline: boolean;
}

interface ChatMessage {
    text: string;
    senderName: string;
    timestamp: string;
    file?: {
        name: string;
        data: string;
        mimeType: string;
        size: number;
    };
    // Client-side tracking fields
    localId?: string;
    isUploading?: boolean;
    uploadProgress?: number;
    isDownloading?: boolean;
    downloadProgress?: number;
}

const MeetingRoom = () => {
    const { id: meetingId } = useParams<{ id: string }>();
    const { user } = useContext(AuthContext)!;
    const navigate = useNavigate();

    console.log("MeetingRoom Params:", { meetingId, user });

    const [socket, setSocket] = useState<any | null>(null);
    const [stream, setStream] = useState<MediaStream | null>(null);
    const [peers, setPeers] = useState<Peer[]>([]);
    const [allParticipants, setAllParticipants] = useState<Participant[]>([]);
    const [messages, setMessages] = useState<ChatMessage[]>([]);
    const [showChat, setShowChat] = useState(false);
    const [newMessage, setNewMessage] = useState('');
    const [showParticipants, setShowParticipants] = useState(false);
    const [showMeetingInfo, setShowMeetingInfo] = useState(false);
    const [showEmojiPicker, setShowEmojiPicker] = useState(false);
    const [copied, setCopied] = useState(false);
    const [toastMessage, setToastMessage] = useState<string | null>(null);

    const showToast = (message: string) => {
        setToastMessage(message);
        setTimeout(() => setToastMessage(null), 3000);
    };

    const [isMicOn, setIsMicOn] = useState(true);
    const [isVideoOn, setIsVideoOn] = useState(true);

    const myVideoRef = useRef<HTMLVideoElement>(null);
    const peersRef = useRef<{ [key: string]: RTCPeerConnection }>({});
    const streamRef = useRef<MediaStream | null>(null);
    const [screenSharingId, setScreenSharingId] = useState<string | null>(null);
    const [videoStatus, setVideoStatus] = useState<{ [key: string]: boolean }>({});

    // Restricted Entry State
    const [isWaitingForApproval, setIsWaitingForApproval] = useState(false);
    const [entryRequests, setEntryRequests] = useState<{ userId: string; name: string }[]>([]);

    // Keep streamRef synced with state
    useEffect(() => {
        streamRef.current = stream;
        if (myVideoRef.current && stream) {
            myVideoRef.current.srcObject = stream;
        }
    }, [stream]);

    const createPeerConnection = (targetUserId: string, socketToUse: any, name?: string) => {
        console.log(`Creating PeerConnection for ${targetUserId}`);
        const peerConnection = new RTCPeerConnection({
            iceServers: [
                { urls: 'stun:stun.l.google.com:19302' },
                { urls: 'stun:global.stun.twilio.com:3478' }
            ]
        });

        peerConnection.onicecandidate = (event) => {
            if (event.candidate) {
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

        // Add local tracks - ALWAYS use the current stream from ref
        if (streamRef.current) {
            streamRef.current.getTracks().forEach(track => {
                if (streamRef.current) {
                    peerConnection.addTrack(track, streamRef.current);
                }
            });
        }

        peersRef.current[targetUserId] = peerConnection;
        return peerConnection;
    };

    useEffect(() => {
        const newSocket = io('http://localhost:5000');
        setSocket(newSocket);

        navigator.mediaDevices.getUserMedia({ video: true, audio: true })
            .then((initialStream) => {
                setStream(initialStream);
                // We don't need to set srcObject here because the partial useEffect above handles it when stream state updates

                newSocket.emit('join-room', { meetingId, userId: user?._id, name: user?.name });

                newSocket.on('room-role', ({ isAdmin, mutedUsers, videoOffUsers }: { isAdmin: boolean, mutedUsers?: string[], videoOffUsers?: string[] }) => {
                    setIsAdmin(isAdmin);
                    if (mutedUsers) {
                        setHardMutedUsers(mutedUsers);
                    }
                    if (videoOffUsers) {
                        setHardVideoOffUsers(videoOffUsers);
                    }
                });

                newSocket.on('kicked', () => {
                    alert('You have been kicked from the meeting.');
                    navigate('/dashboard');
                });

                newSocket.on('user-hard-muted', ({ userId }: { userId: string }) => {
                    setHardMutedUsers(prev => [...prev, userId]);
                    if (user?._id === userId) {
                        setIsMicOn(false);
                        if (streamRef.current) {
                            streamRef.current.getAudioTracks().forEach(track => {
                                track.enabled = false;
                            });
                        }
                        alert('You have been muted by the host.');
                    }
                });

                newSocket.on('user-hard-unmuted', ({ userId }: { userId: string }) => {
                    setHardMutedUsers(prev => prev.filter(id => id !== userId));
                    if (user?._id === userId) {
                        alert('The host has unmuted you. You can now use your microphone.');
                    }
                });

                newSocket.on('user-hard-video-off', ({ userId }: { userId: string }) => {
                    setHardVideoOffUsers(prev => [...prev, userId]);
                    if (user?._id === userId) {
                        setIsVideoOn(false);
                        if (streamRef.current) {
                            streamRef.current.getVideoTracks().forEach(track => {
                                track.enabled = false;
                            });
                        }
                        if (socket) {
                            socket.emit('video-status-change', {
                                meetingId,
                                userId: user?._id,
                                isVideoOn: false
                            });
                        }
                        setVideoStatus(prev => ({ ...prev, [userId]: false }));
                        alert('Your camera has been disabled by the host.');
                    }
                });

                newSocket.on('user-hard-video-allow', ({ userId }: { userId: string }) => {
                    setHardVideoOffUsers(prev => prev.filter(id => id !== userId));
                    if (user?._id === userId) {
                        alert('The host has allowed your camera. You can now turn it on.');
                    }
                });

                // --- RESTRICTED ENTRY LISTENERS ---
                newSocket.on('entry-pending', () => {
                    setIsWaitingForApproval(true);
                });

                newSocket.on('entry-denied', ({ reason }: { reason: string }) => {
                    alert(reason || 'Access denied.');
                    navigate('/dashboard');
                });

                newSocket.on('entry-approved', () => {
                    setIsWaitingForApproval(false);
                    // Re-attempt join logic now that we are approved
                    newSocket.emit('join-room', { meetingId, userId: user?._id, name: user?.name });
                });

                newSocket.on('entry-request', (request: { userId: string; name: string }) => {
                    setEntryRequests(prev => [...prev, request]);
                    // Optional: Play a sound
                });

                newSocket.on('admin-muted', () => {
                    // Legacy/Fallback
                });

                // --- GLOBAL UPDATES (Mute All / Video All) ---
                newSocket.on('all-users-hard-muted', ({ mutedUsers }: { mutedUsers: string[] }) => {
                    setHardMutedUsers(mutedUsers); // Sync list
                    // If I am in the list (which I should be if not admin), mute me
                    if (mutedUsers.includes(user?._id || '')) {
                        setIsMicOn(false);
                        if (streamRef.current) {
                            streamRef.current.getAudioTracks().forEach(track => {
                                track.enabled = false;
                            });
                        }
                        alert('Host has muted everyone.');
                    } else if (isAdmin) {
                        showToast("Everyone has been muted.");
                    }
                });

                newSocket.on('all-users-hard-unmuted', () => {
                    setHardMutedUsers([]);
                    if (!isAdmin) alert('Host has unmuted everyone. You can now use your microphone.');
                    if (isAdmin) showToast("Everyone has been unmuted.");
                });

                newSocket.on('all-users-hard-video-off', ({ videoOffUsers }: { videoOffUsers: string[] }) => {
                    setHardVideoOffUsers(videoOffUsers);
                    if (videoOffUsers.includes(user?._id || '')) {
                        setIsVideoOn(false);
                        if (streamRef.current) {
                            streamRef.current.getVideoTracks().forEach(track => {
                                track.enabled = false;
                            });
                        }
                        if (socket) {
                            socket.emit('video-status-change', {
                                meetingId,
                                userId: user?._id,
                                isVideoOn: false
                            });
                        }
                        setVideoStatus(prev => ({ ...prev, [user?._id || '']: false }));
                        alert('Host has disabled everyone\'s camera.');
                    } else if (isAdmin) {
                        showToast("Everyone's camera has been disabled.");
                    }
                });

                newSocket.on('all-users-hard-video-allow', () => {
                    setHardVideoOffUsers([]);
                    if (!isAdmin) alert('Host has allowed everyone\'s camera.');
                    if (isAdmin) showToast("Everyone's camera access enabled.");
                });

                newSocket.on('user-connected', ({ userId, name }: UserConnectedPayload) => {
                    console.log('User connected event received:', userId);
                    const peerConnection = createPeerConnection(userId, newSocket, name);
                    peerConnection.createOffer().then(offer => {
                        peerConnection.setLocalDescription(offer);
                        newSocket.emit('offer', {
                            target: userId,
                            offer: offer,
                            sender: user?._id,
                            name: user?.name
                        });
                    }).catch(err => console.error('Error creating offer:', err));
                });

                newSocket.on('offer', async ({ offer, sender, name }: OfferPayload) => {
                    console.log('Received Offer from', sender);
                    const peerConnection = createPeerConnection(sender, newSocket, name);
                    await peerConnection.setRemoteDescription(offer);
                    const answer = await peerConnection.createAnswer();
                    await peerConnection.setLocalDescription(answer);
                    newSocket.emit('answer', {
                        target: sender,
                        answer: answer,
                        sender: user?._id
                    });
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

                newSocket.on('user-disconnected', ({ userId }: { userId: string }) => {
                    console.log('User disconnected:', userId);
                    if (peersRef.current[userId]) {
                        peersRef.current[userId].close();
                        delete peersRef.current[userId];
                    }
                    setPeers(prev => prev.filter(p => p.userId !== userId));
                    setVideoStatus(prev => {
                        const newStatus = { ...prev };
                        delete newStatus[userId];
                        return newStatus;
                    });
                });

                newSocket.on('user-video-status', ({ userId, isVideoOn }: { userId: string, isVideoOn: boolean }) => {
                    setVideoStatus(prev => ({ ...prev, [userId]: isVideoOn }));
                });

                newSocket.on('participants-list', (list: Participant[]) => {
                    console.log('Received participants list:', list);
                    setAllParticipants(list);
                });

            })
            .catch(err => console.error('Error accessing media:', err));

        return () => {
            newSocket.disconnect();
            if (streamRef.current) {
                streamRef.current.getTracks().forEach(track => track.stop());
            }
            Object.values(peersRef.current).forEach(pc => pc.close());
        };
        // Use user._id and user.name for stability instead of the whole user object
    }, [meetingId, user?._id, user?.name]);

    const toggleMic = () => {
        // Check if hard muted
        const isHardMuted = user?._id && hardMutedUsers.includes(user._id);
        if (isHardMuted) {
            alert('You have been muted by the host and cannot unmute yourself.');
            return;
        }

        if (stream) {
            const audioTrack = stream.getAudioTracks()[0];
            if (audioTrack) {
                audioTrack.enabled = !isMicOn;
                setIsMicOn(!isMicOn);
            }
        }
    };

    const toggleVideo = () => {
        // Check if hard video off
        const isHardVideoOff = user?._id && hardVideoOffUsers.includes(user._id);
        if (isHardVideoOff) {
            alert('Your camera has been disabled by the host and cannot be turned on.');
            return;
        }

        if (stream) {
            const videoTrack = stream.getVideoTracks()[0];
            if (videoTrack) {
                const newStatus = !isVideoOn;
                videoTrack.enabled = newStatus;
                setIsVideoOn(newStatus);
                // Update local status map immediately for UI consistency
                if (user?._id) {
                    setVideoStatus(prev => ({ ...prev, [user._id]: newStatus }));
                }
                if (socket) {
                    socket.emit('video-status-change', {
                        meetingId,
                        userId: user?._id,
                        isVideoOn: newStatus
                    });
                }
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
                    const newStream = new MediaStream([screenTrack, ...stream.getAudioTracks()]);
                    setStream(newStream);

                    // Notify server
                    if (socket) {
                        socket.emit('start-screen-share', { meetingId, userId: user?._id });
                    }
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
                        if (socket) {
                            socket.emit('stop-screen-share', { meetingId, userId: user?._id });
                        }
                        setScreenSharingId(null);

                        // Revert to camera
                        navigator.mediaDevices.getUserMedia({ video: true })
                            .then(camStream => {
                                const camTrack = camStream.getVideoTracks()[0];
                                const currentStream = streamRef.current;
                                if (currentStream) {
                                    currentStream.removeTrack(screenTrack);
                                    currentStream.addTrack(camTrack);
                                    const revertedStream = new MediaStream([camTrack, ...currentStream.getAudioTracks()]);
                                    setStream(revertedStream);

                                    // Ensure audio state is preserved if it was muted
                                    revertedStream.getAudioTracks().forEach(track => {
                                        track.enabled = isMicOn;
                                    });
                                    // Ensure video state is preserved if it was off (though usually we want it on after stop share?)
                                    // Actually usually stop share -> camera on specificly.
                                    // But let's respect isVideoOn state if possible, or force it true?
                                    // Typically returning from share implies we want video back.
                                    // `camStream` comes with enabled tracks.
                                    // Let's ensure we match `isVideoOn`
                                    camTrack.enabled = isVideoOn;

                                    Object.values(peersRef.current).forEach(pc => {
                                        const sender = pc.getSenders().find(s => s.track?.kind === 'video');
                                        if (sender) {
                                            sender.replaceTrack(camTrack);
                                        }
                                    });
                                }
                            });
                    };
                }
            })
            .catch(err => console.error("Failed to share screen:", err));
    };

    const fileInputRef = useRef<HTMLInputElement>(null);

    const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file && socket) {
            // Create a temporary local message for progress tracking
            const tempId = Date.now().toString();
            const tempMessage: ChatMessage = {
                text: '',
                senderName: user?.name || 'You',
                timestamp: new Date().toISOString(),
                file: {
                    name: file.name,
                    data: '', // Will be filled with URL after upload
                    mimeType: file.type,
                    size: file.size
                },
                localId: tempId,
                isUploading: true,
                uploadProgress: 0
            };

            setMessages(prev => [...prev, tempMessage]);

            const formData = new FormData();
            formData.append('file', file);

            try {
                const response = await axios.post('http://localhost:5000/api/upload', formData, {
                    headers: { 'Content-Type': 'multipart/form-data' },
                    onUploadProgress: (progressEvent) => {
                        const percentCompleted = Math.round((progressEvent.loaded * 100) / (progressEvent.total || file.size));
                        setMessages(prev => prev.map(msg =>
                            msg.localId === tempId ? { ...msg, uploadProgress: percentCompleted } : msg
                        ));
                    }
                });

                const { url } = response.data;

                // Send message via socket
                socket.emit('send-message', {
                    meetingId,
                    text: '',
                    file: {
                        name: file.name,
                        data: url, // Store URL in data field
                        mimeType: file.type,
                        size: file.size
                    },
                    senderId: user?._id,
                    senderName: user?.name
                });

                // Remove temp message (it will be replaced by the socket broadcast)
                // Or better, update it to finished state. 
                // Since socket broadcast appends, we should remove the temp one to avoid duplicates if possible.
                // But socket broadcast comes with server timestamp.
                // Let's filter out the temp message once the real one arrives? 
                // Simpler: Just remove the temp message from state now (or let user see completion for a split second)
                // Actually, let's just mark isUploading false and let the socket duplicate it? No, duplicates are bad.
                // We'll remove the temp message in the catch/finally or rely on socket to append "real" one.
                // To avoid flash, we could match by some ID, but server creates ID.
                // Let's just remove it for now.
                setMessages(prev => prev.filter(msg => msg.localId !== tempId));

            } catch (error) {
                console.error("Upload failed", error);
                // Ideally show error state
                setMessages(prev => prev.filter(msg => msg.localId !== tempId));
                alert("File upload failed");
            }
        }
        if (e.target) e.target.value = '';
    };

    const handleDownload = async (fileUrl: string, fileName: string, index: number) => {
        setMessages(prev => prev.map((msg, i) =>
            i === index ? { ...msg, isDownloading: true, downloadProgress: 0 } : msg
        ));

        try {
            const response = await axios.get(fileUrl, {
                responseType: 'blob',
                onDownloadProgress: (progressEvent) => {
                    const percentCompleted = Math.round((progressEvent.loaded * 100) / (progressEvent.total || 0));
                    setMessages(prev => prev.map((msg, i) =>
                        i === index ? { ...msg, downloadProgress: percentCompleted } : msg
                    ));
                }
            });

            // Create download link
            const url = window.URL.createObjectURL(new Blob([response.data]));
            const link = document.createElement('a');
            link.href = url;
            link.setAttribute('download', fileName);
            document.body.appendChild(link);
            link.click();
            link.remove();

            // Cleanup
            setTimeout(() => {
                setMessages(prev => prev.map((msg, i) =>
                    i === index ? { ...msg, isDownloading: false, downloadProgress: 0 } : msg
                ));
            }, 1000); // Keep 100% visible for a second

        } catch (error) {
            console.error("Download failed", error);
            alert("Download failed");
            setMessages(prev => prev.map((msg, i) =>
                i === index ? { ...msg, isDownloading: false } : msg
            ));
        }
    };


    const leaveMeeting = () => {
        navigate('/dashboard');
    };

    const emojiPickerRef = useRef<HTMLDivElement>(null);
    const emojiButtonRef = useRef<HTMLButtonElement>(null);

    useEffect(() => {
        function handleClickOutside(event: MouseEvent) {
            if (showEmojiPicker &&
                emojiPickerRef.current &&
                !emojiPickerRef.current.contains(event.target as Node) &&
                emojiButtonRef.current &&
                !emojiButtonRef.current.contains(event.target as Node)) {
                setShowEmojiPicker(false);
            }
        }

        document.addEventListener("mousedown", handleClickOutside);
        return () => {
            document.removeEventListener("mousedown", handleClickOutside);
        };
    }, [showEmojiPicker]);

    const [isAdmin, setIsAdmin] = useState(false);
    const [hardMutedUsers, setHardMutedUsers] = useState<string[]>([]);
    const [hardVideoOffUsers, setHardVideoOffUsers] = useState<string[]>([]);

    // Admin Actions
    const kickUser = (targetUserId: string) => {
        if (socket && isAdmin) {
            socket.emit('kick-user', { meetingId, targetUserId });
        }
    };

    const adminMuteUser = (targetUserId: string) => {
        if (socket && isAdmin) {
            socket.emit('admin-mute-user', { meetingId, targetUserId });
        }
    };

    const adminUnmuteUser = (targetUserId: string) => {
        if (socket && isAdmin) {
            socket.emit('admin-unmute-user', { meetingId, targetUserId });
        }
    };

    const adminStopVideo = (targetUserId: string) => {
        if (socket && isAdmin) {
            socket.emit('admin-stop-video', { meetingId, targetUserId });
        }
    };

    const adminAllowVideo = (targetUserId: string) => {
        if (socket && isAdmin) {
            socket.emit('admin-allow-video', { meetingId, targetUserId });
        }
    };



    const handleEntryResponse = (targetUserId: string, approved: boolean) => {
        if (socket) {
            socket.emit('admin-response-entry', { meetingId, targetUserId, approved });
            setEntryRequests(prev => prev.filter(req => req.userId !== targetUserId));
        }
    };

    if (isWaitingForApproval) {
        return (
            <div className="h-screen w-screen bg-slate-950 flex flex-col items-center justify-center text-white space-y-6">
                <div className="p-4 bg-yellow-500/20 rounded-full animate-pulse">
                    <Shield size={64} className="text-yellow-500" />
                </div>
                <h2 className="text-3xl font-bold">Waiting for Host Approval</h2>
                <p className="text-gray-400 max-w-md text-center">
                    You were previously removed from this meeting. The host has been notified of your request to rejoin.
                </p>
                <div className="flex items-center gap-2 text-sm text-gray-500">
                    <div className="w-2 h-2 bg-indigo-500 rounded-full animate-bounce" />
                    <div className="w-2 h-2 bg-indigo-500 rounded-full animate-bounce delay-75" />
                    <div className="w-2 h-2 bg-indigo-500 rounded-full animate-bounce delay-150" />
                </div>
                <button
                    onClick={() => navigate('/dashboard')}
                    className="mt-8 px-6 py-2 bg-white/10 hover:bg-white/20 rounded-lg transition-colors"
                >
                    Cancel Request
                </button>
            </div>
        );
    }

    return (
        <div className="flex h-screen w-screen bg-slate-950 text-white overflow-hidden relative selection:bg-indigo-500/30">
            {/* Toast Notification */}
            {toastMessage && (
                <div className="absolute top-20 left-1/2 -translate-x-1/2 z-[60]">
                    <motion.div
                        initial={{ opacity: 0, y: -20, scale: 0.9 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0 }}
                        className="bg-zinc-800/90 backdrop-blur-md text-white px-6 py-3 rounded-full shadow-2xl border border-white/10 flex items-center gap-3"
                    >
                        <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
                        <span className="font-medium text-sm tracking-wide">{toastMessage}</span>
                    </motion.div>
                </div>
            )}

            {/* Admin Entry Requests Panel */}
            {isAdmin && entryRequests.length > 0 && (
                <div className="absolute top-4 left-1/2 -translate-x-1/2 z-50 flex flex-col gap-2 w-full max-w-md">
                    {entryRequests.map((req) => (
                        <motion.div
                            initial={{ opacity: 0, y: -20 }}
                            animate={{ opacity: 1, y: 0 }}
                            key={req.userId}
                            className="bg-slate-900/90 backdrop-blur-md border border-indigo-500/30 p-4 rounded-xl shadow-2xl flex items-center justify-between"
                        >
                            <div className="flex items-center gap-3">
                                <div className="p-2 bg-indigo-500/20 rounded-full text-indigo-400">
                                    <Shield size={20} />
                                </div>
                                <div>
                                    <p className="font-bold">{req.name}</p>
                                    <p className="text-xs text-gray-400">Requesting to rejoin</p>
                                </div>
                            </div>
                            <div className="flex gap-2">
                                <button
                                    onClick={() => handleEntryResponse(req.userId, false)}
                                    className="p-2 bg-red-500/20 hover:bg-red-500/40 text-red-400 rounded-lg transition-colors"
                                    title="Block Permanently"
                                >
                                    <X size={18} />
                                </button>
                                <button
                                    onClick={() => handleEntryResponse(req.userId, true)}
                                    className="p-2 bg-green-500/20 hover:bg-green-500/40 text-green-400 rounded-lg transition-colors"
                                    title="Allow Entry"
                                >
                                    <Check size={18} />
                                </button>
                            </div>
                        </motion.div>
                    ))}
                </div>
            )}
            {/* Ambient Background */}
            <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-indigo-900/20 via-black to-black z-0 pointer-events-none" />

            {/* Header */}
            <div className="absolute top-0 left-0 right-0 p-6 z-20 flex justify-between items-center bg-gradient-to-b from-black/80 to-transparent pointer-events-none">
                <div className="flex items-center gap-3 pointer-events-auto">
                    <button
                        onClick={() => setShowMeetingInfo(true)}
                        className="glass-panel px-4 py-2 flex items-center gap-2 rounded-full bg-white/5 border-white/10 hover:bg-white/10 transition-colors pointer-events-auto"
                    >
                        <Info size={18} className="text-gray-300" />
                        <span className="font-display font-medium tracking-wide text-sm text-gray-300">Meeting Info</span>
                    </button>
                </div>
            </div>

            {/* Meeting Info Modal */}
            {showMeetingInfo && (
                <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
                    <motion.div
                        initial={{ opacity: 0, scale: 0.95 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.95 }}
                        className="bg-zinc-900 border border-white/10 rounded-2xl p-6 w-full max-w-md shadow-2xl relative"
                    >
                        <button
                            onClick={() => setShowMeetingInfo(false)}
                            className="absolute top-4 right-4 text-gray-400 hover:text-white transition-colors"
                        >
                            <X size={20} />
                        </button>

                        <h3 className="text-xl font-display font-bold text-white mb-2">Meeting Details</h3>
                        <p className="text-gray-400 text-sm mb-6">Share the meeting code with others you want to invite.</p>

                        <div className="space-y-4">
                            <div>
                                <label className="block text-xs font-semibold text-indigo-400 uppercase tracking-wider mb-2">Meeting Code</label>
                                <div className="flex items-center gap-2">
                                    <div className="flex-1 bg-black/40 border border-white/10 rounded-xl px-4 py-3 font-mono text-sm text-gray-200">
                                        {meetingId}
                                    </div>
                                    <button
                                        onClick={() => {
                                            navigator.clipboard.writeText(meetingId || '');
                                            setCopied(true);
                                            setTimeout(() => setCopied(false), 2000);
                                        }}
                                        className="p-3 bg-white/5 border border-white/10 rounded-xl hover:bg-white/10 transition-colors text-gray-300 hover:text-white"
                                        title="Copy Code"
                                    >
                                        {copied ? <Check size={20} className="text-green-500" /> : <Copy size={20} />}
                                    </button>
                                </div>
                            </div>
                        </div>
                    </motion.div>
                </div>
            )}

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
                                        isMicOn={isMicOn}
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
                                        <div className="h-48 flex-shrink-0">
                                            <VideoDisplay
                                                stream={stream}
                                                name={`You (${user?.name})`}
                                                isLocal={true}
                                                isMirrored={true}
                                                isVideoOn={user?._id ? (videoStatus[user._id] ?? isVideoOn) : isVideoOn}
                                                isMicOn={isMicOn}
                                            />
                                        </div>
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

                            <VideoDisplay
                                stream={stream}
                                name={`You (${user?.name})`}
                                isLocal={true}
                                isMirrored={true}
                                isVideoOn={user?._id ? (videoStatus[user._id] ?? isVideoOn) : isVideoOn}
                                isMicOn={isMicOn}
                            />

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
                            {messages.map((msg, index) => (
                                <div key={index} className="flex flex-col gap-1 anim-fade-in">
                                    <div className="flex items-baseline justify-between gap-2">
                                        <span className="text-xs font-bold text-indigo-400">{msg.senderName}</span>
                                        <span className="text-[10px] text-gray-500">{new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                                    </div>
                                    <div className="bg-white/10 p-3 rounded-2xl rounded-tl-sm text-sm leading-relaxed text-gray-200 min-w-[200px]">
                                        {msg.file && msg.file.data ? (
                                            <div className="flex flex-col gap-2">
                                                <div className="flex items-center gap-3 bg-white/5 p-2 rounded-lg border border-white/10 group/file">
                                                    <div className="p-2 bg-indigo-500/20 rounded-lg text-indigo-400">
                                                        <FileText size={24} />
                                                    </div>
                                                    <div className="flex-1 min-w-0">
                                                        <div className="font-medium text-white truncate max-w-[150px]">{msg.file.name}</div>
                                                        <div className="text-xs text-gray-400">{(msg.file.size / 1024).toFixed(1)} KB</div>
                                                    </div>
                                                    {msg.isUploading ? (
                                                        <div className="text-xs text-indigo-400 font-medium">{msg.uploadProgress}%</div>
                                                    ) : msg.isDownloading ? (
                                                        <div className="text-xs text-green-400 font-medium">{msg.downloadProgress}%</div>
                                                    ) : (
                                                        <button
                                                            onClick={() => handleDownload(msg.file!.data, msg.file!.name, index)}
                                                            className="p-2 bg-white/10 rounded-lg hover:bg-white/20 text-gray-400 hover:text-white transition-colors"
                                                            title="Download"
                                                        >
                                                            <Download size={16} />
                                                        </button>
                                                    )}
                                                </div>
                                                {(msg.isUploading || msg.isDownloading) && (
                                                    <div className="w-full h-1 bg-white/10 rounded-full overflow-hidden">
                                                        <div
                                                            className={`h-full transition-all duration-200 ${msg.isUploading ? 'bg-indigo-500' : 'bg-green-500'}`}
                                                            style={{ width: `${msg.isUploading ? msg.uploadProgress : msg.downloadProgress}%` }}
                                                        />
                                                    </div>
                                                )}
                                            </div>
                                        ) : (
                                            msg.text
                                        )}
                                    </div>
                                </div>
                            ))}
                        </div>
                        <form onSubmit={sendMessage} className="p-4 border-t border-white/10 bg-white/5 relative">
                            {showEmojiPicker && (
                                <div ref={emojiPickerRef} className="absolute bottom-full left-4 mb-2 z-50 shadow-2xl rounded-xl overflow-hidden">
                                    <EmojiPicker
                                        theme={Theme.DARK}
                                        onEmojiClick={(emojiData: EmojiClickData) => {
                                            setNewMessage(prev => prev + emojiData.emoji);
                                        }}
                                        width={320}
                                        height={400}
                                        previewConfig={{ showPreview: false }}
                                    />
                                </div>
                            )}
                            <div className="relative flex items-center gap-2">
                                <button
                                    ref={emojiButtonRef}
                                    type="button"
                                    onClick={() => setShowEmojiPicker(!showEmojiPicker)}
                                    className={`p-3 rounded-xl transition-colors ${showEmojiPicker ? 'bg-indigo-500/20 text-indigo-400' : 'bg-black/20 hover:bg-white/10 text-gray-400 hover:text-white'} border border-white/10`}
                                >
                                    <Smile size={20} />
                                </button>
                                <button
                                    type="button"
                                    onClick={() => fileInputRef.current?.click()}
                                    className="p-3 bg-black/20 border border-white/10 rounded-xl hover:bg-white/10 text-gray-400 hover:text-white transition-colors"
                                    title="Attach File"
                                >
                                    <Paperclip size={20} />
                                </button>
                                <input
                                    type="file"
                                    ref={fileInputRef}
                                    onChange={handleFileSelect}
                                    className="hidden"
                                />
                                <div className="relative flex-1">
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
                            </div>
                        </form>
                    </motion.div>
                )}

                {/* Participants Panel */}
                {showParticipants && (
                    <motion.div
                        initial={{ x: "100%", opacity: 0 }}
                        animate={{ x: 0, opacity: 1 }}
                        exit={{ x: "100%", opacity: 0 }}
                        transition={{ type: "spring", damping: 25, stiffness: 200 }}
                        className="w-80 glass-panel border-l border-white/10 flex flex-col absolute right-6 top-20 bottom-24 bg-black/40 backdrop-blur-xl z-30 overflow-hidden shadow-2xl"
                    >
                        <div className="p-4 border-b border-white/10 bg-white/5 flex flex-col gap-3">
                            <div className="flex justify-between items-center">
                                <span className="font-display font-bold">Participants ({allParticipants.length})</span>
                                <button onClick={() => setShowParticipants(false)} className="hover:bg-white/10 p-1 rounded-md transition-colors">
                                    <span className="sr-only">Close</span>
                                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18" /><path d="m6 6 12 12" /></svg>
                                </button>
                            </div>

                            {/* Global Admin Controls */}
                            {isAdmin && (
                                <div className="mt-2 space-y-3 p-3 bg-indigo-500/5 rounded-xl border border-indigo-500/10">
                                    <h3 className="text-[10px] uppercase tracking-wider font-bold text-indigo-300 mb-1">Host Controls</h3>

                                    <div className="space-y-2">
                                        <div className="grid grid-cols-2 gap-2">
                                            <button
                                                onClick={() => socket?.emit('admin-mute-all', { meetingId })}
                                                className="group flex items-center justify-center gap-2 p-2 rounded-lg bg-red-500/10 hover:bg-red-500/20 border border-red-500/10 hover:border-red-500/30 transition-all active:scale-95"
                                                title="Mute everyone in the meeting"
                                            >
                                                <div className="p-1 rounded bg-red-500/20 text-red-300 group-hover:text-red-200">
                                                    <MicOff size={14} />
                                                </div>
                                                <span className="text-xs font-medium text-red-200 group-hover:text-white">Mute All</span>
                                            </button>

                                            <button
                                                onClick={() => socket?.emit('admin-unmute-all', { meetingId })}
                                                className="group flex items-center justify-center gap-2 p-2 rounded-lg bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/10 hover:border-emerald-500/30 transition-all active:scale-95"
                                                title="Allow everyone to unmute"
                                            >
                                                <div className="p-1 rounded bg-emerald-500/20 text-emerald-300 group-hover:text-emerald-200">
                                                    <Mic size={14} />
                                                </div>
                                                <span className="text-xs font-medium text-emerald-200 group-hover:text-white">Unmute All</span>
                                            </button>
                                        </div>

                                        <div className="grid grid-cols-2 gap-2">
                                            <button
                                                onClick={() => socket?.emit('admin-stop-video-all', { meetingId })}
                                                className="group flex items-center justify-center gap-2 p-2 rounded-lg bg-red-500/10 hover:bg-red-500/20 border border-red-500/10 hover:border-red-500/30 transition-all active:scale-95"
                                                title="Disable everyone's camera"
                                            >
                                                <div className="p-1 rounded bg-red-500/20 text-red-300 group-hover:text-red-200">
                                                    <VideoOff size={14} />
                                                </div>
                                                <span className="text-xs font-medium text-red-200 group-hover:text-white">Video Off</span>
                                            </button>

                                            <button
                                                onClick={() => socket?.emit('admin-allow-video-all', { meetingId })}
                                                className="group flex items-center justify-center gap-2 p-2 rounded-lg bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/10 hover:border-emerald-500/30 transition-all active:scale-95"
                                                title="Allow everyone's camera"
                                            >
                                                <div className="p-1 rounded bg-emerald-500/20 text-emerald-300 group-hover:text-emerald-200">
                                                    <Video size={14} />
                                                </div>
                                                <span className="text-xs font-medium text-emerald-200 group-hover:text-white">Allow Cam</span>
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>
                        <div className="flex-1 p-4 overflow-y-auto space-y-4 custom-scrollbar">
                            {/* Participants */}
                            {allParticipants.map(participant => {
                                const isMe = participant.userId === user?._id;

                                return (
                                    <div key={participant.userId} className="flex items-center gap-3 p-2 rounded-xl hover:bg-white/5 transition-colors border border-transparent hover:border-white/5 group">
                                        <div className="relative">
                                            <div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold text-white ${participant.isOnline ? 'bg-indigo-500' : 'bg-gray-700 opacity-60'}`}>
                                                {participant.name?.charAt(0).toUpperCase() || '?'}
                                                {(isMe && isAdmin) && (
                                                    <div className="absolute -top-1 -right-1 bg-yellow-500 rounded-full p-0.5 border border-black" title="Host">
                                                        <Shield size={10} className="text-black fill-current" />
                                                    </div>
                                                )}
                                            </div>
                                            <div className={`absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-slate-900 ${participant.isOnline ? 'bg-green-500' : 'bg-gray-500'}`} />
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <div className="font-medium text-sm flex items-center gap-2">
                                                <span className={participant.isOnline ? 'text-white' : 'text-gray-500'}>
                                                    {participant.name}
                                                </span>
                                                {isMe && <span className="text-[10px] bg-white/10 px-1.5 py-0.5 rounded text-gray-400">You</span>}
                                                {!participant.isOnline && <span className="text-[10px] bg-white/5 px-1.5 py-0.5 rounded text-gray-500 border border-white/5">Offline</span>}
                                            </div>
                                            {participant.isOnline ? (
                                                <div className="flex gap-2 text-[10px] text-gray-400">
                                                    <span>{isMe ? (isMicOn ? 'Mic On' : 'Mic Off') : 'Connected'}</span>
                                                </div>
                                            ) : (
                                                <div className="text-[10px] text-gray-600">Session record</div>
                                            )}

                                            {isAdmin && !isMe && participant.isOnline && (
                                                <div className="flex gap-2 mt-1 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity">
                                                    {/* Mic Control */}
                                                    {hardMutedUsers.includes(participant.userId) ? (
                                                        <button
                                                            onClick={() => adminUnmuteUser(participant.userId)}
                                                            className="p-1.5 bg-green-500/10 hover:bg-green-500 text-green-400 hover:text-white rounded-lg transition-colors text-xs flex items-center gap-1"
                                                            title="Unmute User"
                                                        >
                                                            <Check size={14} />
                                                        </button>
                                                    ) : (
                                                        <button
                                                            onClick={() => adminMuteUser(participant.userId)}
                                                            className="p-1.5 bg-red-500/10 hover:bg-red-500 text-red-400 hover:text-white rounded-lg transition-colors text-xs flex items-center gap-1"
                                                            title="Mute User"
                                                        >
                                                            <MicOff size={14} />
                                                        </button>
                                                    )}

                                                    {/* Video Control */}
                                                    {hardVideoOffUsers.includes(participant.userId) ? (
                                                        <button
                                                            onClick={() => adminAllowVideo(participant.userId)}
                                                            className="p-1.5 bg-green-500/10 hover:bg-green-500 text-green-400 hover:text-white rounded-lg transition-colors text-xs flex items-center gap-1"
                                                            title="Allow Video"
                                                        >
                                                            <Video size={14} />
                                                        </button>
                                                    ) : (
                                                        <button
                                                            onClick={() => adminStopVideo(participant.userId)}
                                                            className="p-1.5 bg-red-500/10 hover:bg-red-500 text-red-400 hover:text-white rounded-lg transition-colors text-xs flex items-center gap-1"
                                                            title="Disable Video"
                                                        >
                                                            <VideoOff size={14} />
                                                        </button>
                                                    )}

                                                    <button
                                                        onClick={() => kickUser(participant.userId)}
                                                        className="p-1.5 bg-red-500/10 hover:bg-red-500 text-red-400 hover:text-white rounded-lg transition-colors text-xs flex items-center gap-1"
                                                        title="Kick User"
                                                    >
                                                        <X size={14} />
                                                    </button>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
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

                    <button onClick={() => { setShowChat(!showChat); setShowParticipants(false); }} className={`p-4 rounded-full transition-all duration-300 relative ${showChat ? 'bg-indigo-500 text-white shadow-lg shadow-indigo-500/30' : 'bg-white/10 hover:bg-indigo-500 hover:text-white text-gray-300'}`}>
                        <MessageSquare size={22} />
                        {messages.length > 0 && !showChat && (
                            <span className="absolute top-0 right-0 w-3 h-3 bg-red-500 rounded-full border-2 border-black" />
                        )}
                    </button>

                    <button onClick={() => { setShowParticipants(!showParticipants); setShowChat(false); }} className={`p-4 rounded-full transition-all duration-300 ${showParticipants ? 'bg-indigo-500 text-white shadow-lg shadow-indigo-500/30' : 'bg-white/10 hover:bg-indigo-500 hover:text-white text-gray-300'}`}>
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
    }, [stream, isVideoOn]);

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
