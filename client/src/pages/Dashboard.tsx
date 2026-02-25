import React, { useState, useContext, useEffect } from 'react';
import { AuthContext } from '../context/AuthContext';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Video, Plus, User as UserIcon, LogOut, ArrowRight, Clock, Calendar, CalendarPlus, X } from 'lucide-react';
import { v4 as uuidv4 } from 'uuid';
import axios from 'axios';

const Dashboard = () => {
    const { user, logout } = useContext(AuthContext)!;
    const navigate = useNavigate();
    const [meetingId, setMeetingId] = useState('');
    const [greeting, setGreeting] = useState('');
    const [currentTime, setCurrentTime] = useState(new Date());

    // Schedule States
    const [showScheduleModal, setShowScheduleModal] = useState(false);
    const [scheduleTitle, setScheduleTitle] = useState('');
    const [scheduleDate, setScheduleDate] = useState('');
    const [scheduleTime, setScheduleTime] = useState('');
    const [attendeeEmails, setAttendeeEmails] = useState('');
    const [isScheduling, setIsScheduling] = useState(false);
    const [upcomingMeetings, setUpcomingMeetings] = useState<any[]>([]);

    useEffect(() => {
        const hour = new Date().getHours();
        if (hour < 12) setGreeting('Good Morning');
        else if (hour < 18) setGreeting('Good Afternoon');
        else setGreeting('Good Evening');

        const timer = setInterval(() => setCurrentTime(new Date()), 60000);

        fetchUpcomingMeetings();

        return () => clearInterval(timer);
    }, []);

    const fetchUpcomingMeetings = async () => {
        try {
            const userStr = localStorage.getItem('user');
            if (!userStr) return;
            const userData = JSON.parse(userStr);
            const token = userData.token;

            const { data } = await axios.get('/api/meetings/scheduled', {
                headers: { Authorization: `Bearer ${token}` }
            });
            setUpcomingMeetings(data);
        } catch (error) {
            console.error('Error fetching scheduled meetings:', error);
        }
    };

    const handleEndMeeting = async (meetingId: string) => {
        if (!window.confirm("Are you sure you want to end this meeting? It will no longer be accessible.")) return;

        try {
            const userStr = localStorage.getItem('user');
            if (!userStr) return;
            const userData = JSON.parse(userStr);
            const token = userData.token;

            await axios.post(`/api/meetings/scheduled/${meetingId}/end`, {}, {
                headers: { Authorization: `Bearer ${token}` }
            });
            fetchUpcomingMeetings();
        } catch (error) {
            console.error('Error ending scheduled meeting:', error);
            alert('Failed to end meeting.');
        }
    };

    const createMeeting = () => {
        const newId = uuidv4();
        navigate(`/meeting/${newId}`);
    };

    const joinMeeting = (e: React.FormEvent) => {
        e.preventDefault();
        if (meetingId.trim()) {
            navigate(`/meeting/${meetingId}`);
        }
    };

    const handleScheduleMeeting = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!scheduleDate || !scheduleTime) return;

        setIsScheduling(true);
        try {
            const userStr = localStorage.getItem('user');
            if (!userStr) throw new Error("Not logged in");
            const userData = JSON.parse(userStr);
            const token = userData.token;

            const scheduledAt = new Date(`${scheduleDate}T${scheduleTime}`).toISOString();

            // Handle comma separated emails
            const emails = attendeeEmails
                .split(',')
                .map(email => email.trim())
                .filter(email => email !== '');

            await axios.post('/api/meetings/schedule', {
                title: scheduleTitle,
                scheduledAt,
                attendeeEmails: emails
            }, {
                headers: { Authorization: `Bearer ${token}` }
            });

            setShowScheduleModal(false);
            setScheduleTitle('');
            setScheduleDate('');
            setScheduleTime('');
            setAttendeeEmails('');
            fetchUpcomingMeetings();

        } catch (error) {
            console.error('Error scheduling meeting:', error);
            alert('Failed to schedule meeting.');
        } finally {
            setIsScheduling(false);
        }
    };

    return (
        <div className="min-h-screen relative overflow-hidden bg-black text-white selection:bg-indigo-500/30 font-sans">
            {/* Ambient Background */}
            <div className="absolute inset-0 overflow-hidden pointer-events-none">
                <div className="absolute top-[-10%] left-[-10%] w-[80vw] h-[80vw] bg-indigo-900/10 rounded-full blur-[150px] animate-pulse-slow" />
                <div className="absolute bottom-[-10%] right-[-10%] w-[80vw] h-[80vw] bg-purple-900/10 rounded-full blur-[150px] animate-pulse-slow delay-1000" />
                <div className="absolute top-[40%] left-[30%] w-[40vw] h-[40vw] bg-cyan-900/5 rounded-full blur-[120px] animate-float" />

                {/* Grid Overlay */}
                <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.02)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.02)_1px,transparent_1px)] bg-[size:4rem_4rem] [mask-image:radial-gradient(ellipse_60%_60%_at_50%_50%,black,transparent)]" />
            </div>

            <header className="fixed top-0 w-full z-50 px-8 py-6 flex justify-between items-center backdrop-blur-sm">
                <div className="flex items-center gap-3 group cursor-pointer" onClick={() => navigate('/')}>
                    <div className="relative">
                        <div className="absolute inset-0 bg-indigo-500 blur-lg opacity-20 group-hover:opacity-40 transition-opacity rounded-full" />
                        <div className="relative bg-gradient-to-tr from-[#1a1a1a] to-[#2a2a2a] border border-white/10 p-2.5 rounded-xl shadow-xl transition-transform group-hover:scale-105">
                            <Video size={24} className="text-indigo-400" />
                        </div>
                    </div>
                    <h1 className="text-2xl font-bold font-display tracking-tight text-white group-hover:text-indigo-200 transition-colors">
                        Void<span className="text-indigo-500">.</span>
                    </h1>
                </div>

                <div className="flex items-center gap-6">
                    <div className="hidden md:flex items-center gap-4 text-sm text-gray-400 font-medium bg-white/5 px-4 py-2 rounded-full border border-white/5 backdrop-blur-md">
                        <span className="flex items-center gap-2">
                            <Calendar size={14} className="text-indigo-400" />
                            {currentTime.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' })}
                        </span>
                        <span className="w-px h-3 bg-white/10" />
                        <span className="flex items-center gap-2">
                            <Clock size={14} className="text-purple-400" />
                            {currentTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </span>
                    </div>

                    <div className="flex items-center gap-4 pl-6 border-l border-white/5">
                        <div className="flex items-center gap-3">
                            <div className="text-right hidden sm:block">
                                <div className="text-sm font-semibold text-white">{user?.name}</div>
                                <div className="text-xs text-indigo-400">Pro Plan</div>
                            </div>
                            <div className="w-10 h-10 rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 p-[2px]">
                                <div className="w-full h-full rounded-full bg-[#1a1a1a] flex items-center justify-center text-sm font-bold">
                                    {user?.name?.charAt(0)}
                                </div>
                            </div>
                        </div>
                        <button
                            onClick={logout}
                            className="p-2.5 rounded-full hover:bg-white/5 text-gray-400 hover:text-red-400 transition-all border border-transparent hover:border-red-500/20"
                            title="Sign Out"
                        >
                            <LogOut size={20} />
                        </button>
                    </div>
                </div>
            </header>

            <main className="relative z-10 flex flex-col justify-center min-h-screen max-w-6xl mx-auto px-6 pt-24 pb-10">
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.6 }}
                    className="mb-12"
                >
                    <h2 className="text-5xl md:text-6xl font-bold font-display tracking-tight mb-4 bg-clip-text text-transparent bg-gradient-to-r from-white via-white to-gray-500">
                        {greeting}, <br />
                        <span className="text-transparent bg-clip-text bg-gradient-to-r from-indigo-400 to-purple-400">
                            {user?.name?.split(' ')[0]}
                        </span>
                    </h2>
                    <p className="text-xl text-gray-400 max-w-xl leading-relaxed">
                        Ready to collaborate? Start a new session, schedule one for later, or jump right into your team.
                    </p>
                </motion.div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-6 items-stretch mb-12">
                    {/* New Meeting Card */}
                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.2, duration: 0.5 }}
                        className="group relative cursor-pointer"
                        onClick={createMeeting}
                    >
                        <div className="absolute inset-0 bg-gradient-to-br from-indigo-600 to-purple-600 rounded-3xl blur opacity-25 group-hover:opacity-40 transition-opacity duration-500" />
                        <div className="relative h-full bg-[#121212] border border-white/10 rounded-3xl p-6 flex flex-col justify-between overflow-hidden group-hover:border-indigo-500/30 transition-all duration-300">
                            <div className="absolute top-0 right-0 p-6 opacity-10 group-hover:opacity-20 transition-opacity transform group-hover:scale-110 duration-500">
                                <Video size={100} />
                            </div>

                            <div className="space-y-4 relative z-10">
                                <div className="w-12 h-12 bg-indigo-500/20 rounded-2xl flex items-center justify-center border border-indigo-500/20 group-hover:bg-indigo-500/30 transition-colors">
                                    <Plus size={24} className="text-indigo-400" />
                                </div>
                                <div>
                                    <h3 className="text-2xl font-bold mb-2">Instant Meeting</h3>
                                    <p className="text-sm text-gray-400">Create a new secure meeting space instantly.</p>
                                </div>
                            </div>

                            <div className="mt-8 flex items-center text-sm font-medium text-indigo-400 group-hover:text-indigo-300 transition-colors">
                                Start Session <ArrowRight size={16} className="ml-2 transform group-hover:translate-x-1 transition-transform" />
                            </div>
                        </div>
                    </motion.div>

                    {/* Schedule Meeting Card */}
                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.3, duration: 0.5 }}
                        className="group relative cursor-pointer"
                        onClick={() => setShowScheduleModal(true)}
                    >
                        <div className="absolute inset-0 bg-gradient-to-br from-blue-600 to-cyan-600 rounded-3xl blur opacity-25 group-hover:opacity-40 transition-opacity duration-500" />
                        <div className="relative h-full bg-[#121212] border border-white/10 rounded-3xl p-6 flex flex-col justify-between overflow-hidden group-hover:border-blue-500/30 transition-all duration-300">
                            <div className="absolute top-0 right-0 p-6 opacity-10 group-hover:opacity-20 transition-opacity transform group-hover:scale-110 duration-500">
                                <CalendarPlus size={100} />
                            </div>

                            <div className="space-y-4 relative z-10">
                                <div className="w-12 h-12 bg-blue-500/20 rounded-2xl flex items-center justify-center border border-blue-500/20 group-hover:bg-blue-500/30 transition-colors">
                                    <CalendarPlus size={24} className="text-blue-400" />
                                </div>
                                <div>
                                    <h3 className="text-2xl font-bold mb-2">Schedule</h3>
                                    <p className="text-sm text-gray-400">Plan ahead and automatically invite participants.</p>
                                </div>
                            </div>

                            <div className="mt-8 flex items-center text-sm font-medium text-blue-400 group-hover:text-blue-300 transition-colors">
                                Plan Meeting <ArrowRight size={16} className="ml-2 transform group-hover:translate-x-1 transition-transform" />
                            </div>
                        </div>
                    </motion.div>

                    {/* Join Meeting Card */}
                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.4, duration: 0.5 }}
                        className="group relative"
                    >
                        <div className="absolute inset-0 bg-gradient-to-br from-pink-600 to-orange-600 rounded-3xl blur opacity-0 group-hover:opacity-20 transition-opacity duration-500" />
                        <div className="relative h-full bg-[#121212] border border-white/10 rounded-3xl p-6 flex flex-col justify-between overflow-hidden group-hover:border-pink-500/30 transition-all duration-300">
                            <div className="space-y-4">
                                <div className="w-12 h-12 bg-pink-500/20 rounded-2xl flex items-center justify-center border border-pink-500/20 group-hover:bg-pink-500/30 transition-colors">
                                    <UserIcon size={24} className="text-pink-400" />
                                </div>
                                <div>
                                    <h3 className="text-2xl font-bold mb-2">Join Meeting</h3>
                                    <p className="text-sm text-gray-400">Enter a code to connect with your team.</p>
                                </div>
                            </div>

                            <form onSubmit={joinMeeting} className="mt-6 relative">
                                <div className="relative group/input flex items-center">
                                    <input
                                        type="text"
                                        placeholder="Meeting Code"
                                        className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 pr-20 text-sm focus:outline-none focus:border-pink-500/50 focus:ring-1 focus:ring-pink-500/50 transition-all placeholder:text-gray-600"
                                        value={meetingId}
                                        onChange={(e) => setMeetingId(e.target.value)}
                                    />
                                    <button
                                        type="submit"
                                        disabled={!meetingId}
                                        className="absolute right-1.5 px-4 py-1.5 bg-white/10 hover:bg-pink-600 disabled:opacity-30 disabled:hover:bg-white/10 text-white rounded-lg text-sm font-medium transition-all duration-300"
                                    >
                                        Join
                                    </button>
                                </div>
                            </form>
                        </div>
                    </motion.div>
                </div>

                {/* Upcoming Meetings List */}
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.5, duration: 0.5 }}
                    className="bg-[#121212] border border-white/10 rounded-3xl p-8"
                >
                    <h3 className="text-2xl font-bold mb-6 flex items-center gap-2">
                        <Calendar size={24} className="text-indigo-400" /> Upcoming Meetings
                    </h3>

                    {upcomingMeetings.length === 0 ? (
                        <p className="text-gray-400 text-center py-8">No upcoming meetings scheduled.</p>
                    ) : (
                        <div className="space-y-4">
                            {upcomingMeetings.map((meeting) => (
                                <div key={meeting._id} className="flex flex-col md:flex-row items-center justify-between p-4 bg-black/40 border border-white/5 rounded-xl hover:border-indigo-500/30 transition-colors">
                                    <div className="flex flex-col md:flex-row items-start md:items-center gap-2 md:gap-6 w-full md:w-auto mb-4 md:mb-0">
                                        <div className="flex flex-col">
                                            <span className="text-lg font-semibold">{meeting.title}</span>
                                            <span className="text-sm text-gray-400">Host: {meeting.host?.name || 'Unknown'}</span>
                                        </div>
                                        <div className="flex items-center gap-2 text-sm text-indigo-300 bg-indigo-500/10 px-3 py-1.5 rounded-lg">
                                            <Clock size={16} />
                                            {new Date(meeting.scheduledAt).toLocaleString()}
                                        </div>
                                    </div>
                                    <div className="flex flex-col md:flex-row gap-2 w-full md:w-auto mt-4 md:mt-0">
                                        <button
                                            onClick={() => navigate(`/meeting/${meeting.meetingId}`)}
                                            className="w-full md:w-auto px-6 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl font-medium transition-colors"
                                        >
                                            Join
                                        </button>
                                        {user && user._id === meeting.host?._id && (
                                            <button
                                                onClick={() => handleEndMeeting(meeting.meetingId)}
                                                className="w-full md:w-auto px-6 py-2 bg-red-500/10 border border-red-500/20 hover:bg-red-500/20 text-red-500 rounded-xl font-medium transition-colors"
                                            >
                                                End
                                            </button>
                                        )}
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </motion.div>

                {/* Footer / Quick Links */}
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: 0.6 }}
                    className="mt-16 pt-8 border-t border-white/5 flex flex-col md:flex-row justify-between items-center text-sm text-gray-500"
                >
                    <p>© 2026 Void Collaboration. All rights reserved.</p>
                    <div className="flex gap-6 mt-4 md:mt-0">
                        <span className="hover:text-white cursor-pointer transition-colors">Help Center</span>
                        <span className="hover:text-white cursor-pointer transition-colors">Privacy</span>
                        <span className="hover:text-white cursor-pointer transition-colors">Terms</span>
                    </div>
                </motion.div>
            </main>

            {/* Schedule Meeting Modal */}
            <AnimatePresence>
                {showScheduleModal && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
                    >
                        <motion.div
                            initial={{ scale: 0.95, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            exit={{ scale: 0.95, opacity: 0 }}
                            className="bg-[#121212] border border-white/10 rounded-2xl p-6 md:p-8 w-full max-w-lg shadow-2xl relative"
                        >
                            <button
                                onClick={() => setShowScheduleModal(false)}
                                className="absolute top-4 right-4 text-gray-400 hover:text-white transition-colors"
                            >
                                <X size={24} />
                            </button>

                            <h2 className="text-2xl font-bold mb-6 flex items-center gap-3">
                                <CalendarPlus className="text-blue-500" />
                                Schedule a Meeting
                            </h2>

                            <form onSubmit={handleScheduleMeeting} className="space-y-5">
                                <div>
                                    <label className="block text-sm font-medium text-gray-400 mb-2">Meeting Title</label>
                                    <input
                                        type="text"
                                        required
                                        placeholder="e.g. Weekly Standup"
                                        value={scheduleTitle}
                                        onChange={(e) => setScheduleTitle(e.target.value)}
                                        className="w-full bg-black/50 border border-white/10 rounded-xl px-4 py-3 focus:outline-none focus:border-blue-500/50 transition-colors"
                                    />
                                </div>
                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <label className="block text-sm font-medium text-gray-400 mb-2">Date</label>
                                        <input
                                            type="date"
                                            required
                                            value={scheduleDate}
                                            onChange={(e) => setScheduleDate(e.target.value)}
                                            min={new Date().toISOString().split('T')[0]} // Cannot schedule in the past
                                            className="w-full bg-black/50 border border-white/10 rounded-xl px-4 py-3 focus:outline-none focus:border-blue-500/50 transition-colors [color-scheme:dark]"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-gray-400 mb-2">Time</label>
                                        <input
                                            type="time"
                                            required
                                            value={scheduleTime}
                                            onChange={(e) => setScheduleTime(e.target.value)}
                                            className="w-full bg-black/50 border border-white/10 rounded-xl px-4 py-3 focus:outline-none focus:border-blue-500/50 transition-colors [color-scheme:dark]"
                                        />
                                    </div>
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-400 mb-2">
                                        Attendee Emails <span className="text-xs text-gray-500">(comma separated)</span>
                                    </label>
                                    <input
                                        type="text"
                                        placeholder="john@example.com, jane@example.com"
                                        value={attendeeEmails}
                                        onChange={(e) => setAttendeeEmails(e.target.value)}
                                        className="w-full bg-black/50 border border-white/10 rounded-xl px-4 py-3 focus:outline-none focus:border-blue-500/50 transition-colors"
                                    />
                                </div>

                                <button
                                    type="submit"
                                    disabled={isScheduling}
                                    className="w-full py-4 mt-6 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white rounded-xl font-medium transition-colors"
                                >
                                    {isScheduling ? 'Scheduling...' : 'Schedule Meeting'}
                                </button>
                            </form>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
};

export default Dashboard;
