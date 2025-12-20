import React, { useState, useContext } from 'react';
import { AuthContext } from '../context/AuthContext';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Video, Plus, User as UserIcon, LogOut } from 'lucide-react';
import { v4 as uuidv4 } from 'uuid';

const Dashboard = () => {
    const { user, logout } = useContext(AuthContext)!;
    const navigate = useNavigate();
    const [meetingId, setMeetingId] = useState('');

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
        <div className="min-h-screen relative overflow-hidden bg-black text-white selection:bg-indigo-500/30">
            {/* Dynamic Background Elements */}
            <div className="absolute top-0 left-0 w-full h-full overflow-hidden z-0">
                <div className="absolute top-[-20%] left-[20%] w-[600px] h-[600px] bg-indigo-600/20 rounded-full blur-[120px] animate-pulse" />
                <div className="absolute bottom-[-10%] right-[-10%] w-[500px] h-[500px] bg-purple-600/20 rounded-full blur-[120px] animate-pulse delay-700" />
                <div className="absolute top-[40%] right-[30%] w-[300px] h-[300px] bg-cyan-600/10 rounded-full blur-[100px] animate-float" />
            </div>

            <header className="flex justify-between items-center mb-12 p-6 z-10 relative">
                <div className="flex items-center gap-3">
                    <div className="bg-gradient-to-tr from-indigo-500 to-purple-600 p-2.5 rounded-xl shadow-lg shadow-indigo-500/20">
                        <Video size={24} className="text-white" />
                    </div>
                    <h1 className="text-3xl font-bold font-display tracking-tight text-white">Collab.</h1>
                </div>

                <div className="flex items-center gap-6">
                    <div className="hidden md:flex items-center gap-3 glass-panel px-4 py-2 rounded-full border-none bg-white/5">
                        <div className="w-8 h-8 rounded-full bg-gradient-to-r from-pink-500 to-rose-500 flex items-center justify-center text-xs font-bold">
                            {user?.name?.charAt(0)}
                        </div>
                        <span className="text-sm font-medium text-gray-200">{user?.name}</span>
                    </div>
                    <button onClick={logout} className="p-2.5 hover:bg-white/10 rounded-full transition-all text-gray-400 hover:text-red-400" title="Logout">
                        <LogOut size={20} />
                    </button>
                </div>
            </header>

            <main className="max-w-5xl mx-auto px-6 relative z-10">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                    {/* New Meeting Card */}
                    <motion.div
                        initial={{ opacity: 0, x: -20 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: 0.2 }}
                        className="glass-panel p-10 flex flex-col items-start justify-between min-h-[300px] group hover:border-indigo-500/30 transition-all duration-500"
                    >
                        <div className="space-y-4">
                            <div className="bg-indigo-500/20 p-4 rounded-2xl w-fit group-hover:bg-indigo-500/30 transition-colors">
                                <Plus size={32} className="text-indigo-400" />
                            </div>
                            <div>
                                <h2 className="text-3xl font-bold font-display mb-2">New Meeting</h2>
                                <p className="text-gray-400 leading-relaxed max-w-sm">
                                    Start an instant meeting with high-definition video and AI-powered tools.
                                </p>
                            </div>
                        </div>
                        <button onClick={createMeeting} className="btn-primary w-full flex items-center justify-center gap-3 mt-8 group-hover:translate-y-[-2px] transition-transform">
                            <Video size={20} />
                            Start Instant Meeting
                        </button>
                    </motion.div>

                    {/* Join Meeting Card */}
                    <motion.div
                        initial={{ opacity: 0, x: 20 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: 0.3 }}
                        className="glass-panel p-10 flex flex-col items-start justify-between min-h-[300px] group hover:border-purple-500/30 transition-all duration-500"
                    >
                        <div className="space-y-4 w-full">
                            <div className="bg-purple-500/20 p-4 rounded-2xl w-fit group-hover:bg-purple-500/30 transition-colors">
                                <UserIcon size={32} className="text-purple-400" />
                            </div>
                            <div>
                                <h2 className="text-3xl font-bold font-display mb-2">Join Meeting</h2>
                                <p className="text-gray-400 leading-relaxed">
                                    Enter a code or link to jump into an existing collaboration session.
                                </p>
                            </div>
                        </div>
                        <form onSubmit={joinMeeting} className="w-full mt-8">
                            <div className="relative">
                                <input
                                    type="text"
                                    placeholder="Enter meeting code"
                                    className="input-field text-center font-display text-lg tracking-wider bg-black/40 focus:bg-black/60 border-white/5 focus:border-purple-500/50 h-14"
                                    value={meetingId}
                                    onChange={(e) => setMeetingId(e.target.value)}
                                />
                                <button
                                    type="submit"
                                    disabled={!meetingId}
                                    className="absolute right-2 top-2 bottom-2 px-6 bg-white/10 hover:bg-white/20 text-white rounded-lg font-medium transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                    Join
                                </button>
                            </div>
                        </form>
                    </motion.div>
                </div>
            </main>
        </div>
    );
};

export default Dashboard;
