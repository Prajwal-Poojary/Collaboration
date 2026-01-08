import React, { useState, useContext, useEffect } from 'react';
import { AuthContext } from '../context/AuthContext';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Video, Plus, User as UserIcon, LogOut, ArrowRight, Clock, Calendar } from 'lucide-react';
import { v4 as uuidv4 } from 'uuid';

const Dashboard = () => {
    const { user, logout } = useContext(AuthContext)!;
    const navigate = useNavigate();
    const [meetingId, setMeetingId] = useState('');
    const [greeting, setGreeting] = useState('');
    const [currentTime, setCurrentTime] = useState(new Date());

    useEffect(() => {
        const hour = new Date().getHours();
        if (hour < 12) setGreeting('Good Morning');
        else if (hour < 18) setGreeting('Good Afternoon');
        else setGreeting('Good Evening');

        const timer = setInterval(() => setCurrentTime(new Date()), 60000);
        return () => clearInterval(timer);
    }, []);

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

            <main className="relative z-10 flex flex-col justify-center min-h-screen max-w-6xl mx-auto px-6 pt-20 pb-10">
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.6 }}
                    className="mb-16"
                >
                    <h2 className="text-5xl md:text-6xl font-bold font-display tracking-tight mb-4 bg-clip-text text-transparent bg-gradient-to-r from-white via-white to-gray-500">
                        {greeting}, <br />
                        <span className="text-transparent bg-clip-text bg-gradient-to-r from-indigo-400 to-purple-400">
                            {user?.name?.split(' ')[0]}
                        </span>
                    </h2>
                    <p className="text-xl text-gray-400 max-w-xl leading-relaxed">
                        Ready to collaborate? Start a new session or jump into an existing one with your team.
                    </p>
                </motion.div>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 items-stretch">
                    {/* New Meeting Card */}
                    <motion.div
                        initial={{ opacity: 0, x: -20 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: 0.2, duration: 0.5 }}
                        className="group relative cursor-pointer"
                        onClick={createMeeting}
                    >
                        <div className="absolute inset-0 bg-gradient-to-br from-indigo-600 to-purple-600 rounded-3xl blur opacity-25 group-hover:opacity-40 transition-opacity duration-500" />
                        <div className="relative h-full bg-[#121212] border border-white/10 rounded-3xl p-8 flex flex-col justify-between overflow-hidden group-hover:border-indigo-500/30 transition-all duration-300">
                            <div className="absolute top-0 right-0 p-8 opacity-10 group-hover:opacity-20 transition-opacity transform group-hover:scale-110 duration-500">
                                <Video size={120} />
                            </div>

                            <div className="space-y-6 relative z-10">
                                <div className="w-14 h-14 bg-indigo-500/20 rounded-2xl flex items-center justify-center border border-indigo-500/20 group-hover:bg-indigo-500/30 transition-colors">
                                    <Plus size={28} className="text-indigo-400" />
                                </div>
                                <div>
                                    <h3 className="text-3xl font-bold mb-2">Instant Meeting</h3>
                                    <p className="text-gray-400">Create a new secure meeting space and invite others instantly.</p>
                                </div>
                            </div>

                            <div className="mt-8 flex items-center font-medium text-indigo-400 group-hover:text-indigo-300 transition-colors">
                                Start Session <ArrowRight size={18} className="ml-2 transform group-hover:translate-x-1 transition-transform" />
                            </div>
                        </div>
                    </motion.div>

                    {/* Join Meeting Card */}
                    <motion.div
                        initial={{ opacity: 0, x: 20 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: 0.3, duration: 0.5 }}
                        className="group relative"
                    >
                        <div className="absolute inset-0 bg-gradient-to-br from-purple-600 to-pink-600 rounded-3xl blur opacity-0 group-hover:opacity-20 transition-opacity duration-500" />
                        <div className="relative h-full bg-[#121212] border border-white/10 rounded-3xl p-8 flex flex-col justify-between overflow-hidden group-hover:border-purple-500/30 transition-all duration-300">
                            <div className="space-y-6">
                                <div className="w-14 h-14 bg-purple-500/20 rounded-2xl flex items-center justify-center border border-purple-500/20 group-hover:bg-purple-500/30 transition-colors">
                                    <UserIcon size={28} className="text-purple-400" />
                                </div>
                                <div>
                                    <h3 className="text-3xl font-bold mb-2">Join Meeting</h3>
                                    <p className="text-gray-400">Enter a code to connect with your team.</p>
                                </div>
                            </div>

                            <form onSubmit={joinMeeting} className="mt-8 relative">
                                <div className="relative group/input">
                                    <input
                                        type="text"
                                        placeholder="Meeting Code"
                                        className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-4 pr-32 text-lg focus:outline-none focus:border-purple-500/50 focus:ring-1 focus:ring-purple-500/50 transition-all placeholder:text-gray-600"
                                        value={meetingId}
                                        onChange={(e) => setMeetingId(e.target.value)}
                                    />
                                    <button
                                        type="submit"
                                        disabled={!meetingId}
                                        className="absolute right-2 top-2 bottom-2 px-6 bg-white/10 hover:bg-purple-600 disabled:opacity-30 disabled:hover:bg-white/10 text-white rounded-lg font-medium transition-all duration-300"
                                    >
                                        Join
                                    </button>
                                </div>
                            </form>
                        </div>
                    </motion.div>
                </div>

                {/* Footer / Quick Links */}
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: 0.6 }}
                    className="mt-20 pt-8 border-t border-white/5 flex flex-col md:flex-row justify-between items-center text-sm text-gray-500"
                >
                    <p>© 2026 Void Collaboration. All rights reserved.</p>
                    <div className="flex gap-6 mt-4 md:mt-0">
                        <span className="hover:text-white cursor-pointer transition-colors">Help Center</span>
                        <span className="hover:text-white cursor-pointer transition-colors">Privacy</span>
                        <span className="hover:text-white cursor-pointer transition-colors">Terms</span>
                    </div>
                </motion.div>
            </main>
        </div>
    );
};

export default Dashboard;
