"use client";
import React, { useState } from 'react';
import { authApi } from '@/lib/api';
import { useRouter } from 'next/navigation';
import { BookOpen, AlertCircle, Loader2 } from 'lucide-react';

export default function LoginPage() {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);
    const router = useRouter();

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setError('');
        try {
            await authApi.login(email, password);
            router.push('/');
        } catch {
            setError('The email or password you entered is incorrect. Please try again.');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="min-h-screen flex flex-col items-center justify-center bg-slate-50 p-6">
            <div className="w-full max-w-[440px]">
                {/* Logo Section */}
                <div className="flex flex-col items-center mb-10">
                    <div className="w-16 h-16 bg-blue-600 rounded-2xl flex items-center justify-center text-white shadow-xl shadow-blue-200 mb-6 transition-transform hover:scale-105 duration-300">
                        <BookOpen className="w-10 h-10" />
                    </div>
                    <h1 className="text-3xl font-extrabold text-slate-900 tracking-tight">MasterSAT</h1>
                    <p className="mt-3 text-slate-500 font-medium text-center">Secure examination portal for the <br />MasterSAT Program</p>
                </div>

                {/* Card */}
                <div className="bg-white rounded-[32px] shadow-xl shadow-slate-200/50 border border-slate-200 p-10">
                    <form className="space-y-6" onSubmit={handleSubmit}>
                        {error && (
                            <div className="flex items-start gap-3 text-red-600 text-sm font-medium bg-red-50 p-4 rounded-xl border border-red-100 animate-in fade-in slide-in-from-top-2 duration-200">
                                <AlertCircle className="w-5 h-5 shrink-0" />
                                <span>{error}</span>
                            </div>
                        )}

                        <div className="space-y-5">
                            <div>
                                <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-2 ml-1" htmlFor="email-address">
                                    Email or Username
                                </label>
                                <input
                                    id="email-address"
                                    type="text"
                                    required
                                    className="w-full px-5 py-4 bg-slate-50 border border-slate-200 rounded-2xl text-slate-900 font-medium placeholder-slate-400 focus:outline-none focus:ring-4 focus:ring-blue-100 focus:bg-white focus:border-blue-400 transition-all sm:text-sm"
                                    placeholder="name@example.com or username"
                                    value={email}
                                    onChange={(e) => setEmail(e.target.value)}
                                    disabled={loading}
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-2 ml-1" htmlFor="password">
                                    Password
                                </label>
                                <input
                                    id="password"
                                    type="password"
                                    required
                                    className="w-full px-5 py-4 bg-slate-50 border border-slate-200 rounded-2xl text-slate-900 font-medium placeholder-slate-400 focus:outline-none focus:ring-4 focus:ring-blue-100 focus:bg-white focus:border-blue-400 transition-all sm:text-sm"
                                    placeholder="••••••••"
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                    disabled={loading}
                                />
                            </div>
                        </div>

                        <div>
                            <button
                                type="submit"
                                disabled={loading}
                                className="w-full flex items-center justify-center py-4 px-6 bg-blue-600 text-white text-sm font-bold rounded-2xl hover:bg-blue-700 focus:outline-none focus:ring-4 focus:ring-blue-100 transition-all active:scale-[0.98] shadow-lg shadow-blue-200 disabled:opacity-70 disabled:cursor-not-allowed group"
                            >
                                {loading ? (
                                    <Loader2 className="w-5 h-5 animate-spin" />
                                ) : (
                                    <>
                                        Sign In to Portal
                                        <BookOpen className="w-4 h-4 ml-2 opacity-30 group-hover:opacity-100 transition-opacity" />
                                    </>
                                )}
                            </button>
                        </div>
                    </form>
                </div>

                <div className="mt-6 text-center">
                    <span className="text-sm text-slate-500 font-medium">Don't have an account? </span>
                    <a href="/register" className="text-sm font-bold text-blue-600 hover:text-blue-800 transition-colors">
                        Register Now
                    </a>
                </div>

                <div className="mt-10 text-center">
                    <p className="text-xs font-medium text-slate-400">
                        Unauthorized access is prohibited. <br />
                        © {new Date().getFullYear()} MasterSAT Center
                    </p>
                </div>
            </div>
        </div>
    );
}
