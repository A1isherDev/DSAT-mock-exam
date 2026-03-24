"use client";
import React, { useEffect, useRef, useState } from 'react';
import { authApi } from '@/lib/api';
import { useRouter } from 'next/navigation';
import { AlertCircle, Loader2, LogIn } from 'lucide-react';
import Link from 'next/link';

declare global {
    interface Window {
        google?: any;
    }
}

export default function LoginPage() {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);
    const [rememberMe, setRememberMe] = useState(true);
    const [googleCredential, setGoogleCredential] = useState('');
    const [googleMissing, setGoogleMissing] = useState<string[]>([]);
    const [googleProfile, setGoogleProfile] = useState({ first_name: '', last_name: '', username: '' });
    const googleButtonRef = useRef<HTMLDivElement>(null);
    const router = useRouter();

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setError('');
        try {
            await authApi.login(email, password, rememberMe);
            router.push('/');
        } catch {
            setError('The email or password you entered is incorrect. Please try again.');
        } finally {
            setLoading(false);
        }
    };

    const handleGoogleCredential = async (credential: string, profile?: { first_name?: string; last_name?: string; username?: string }) => {
        setLoading(true);
        setError('');
        try {
            await authApi.googleAuth(credential, profile, rememberMe);
            router.push('/');
        } catch (err: any) {
            const missing = err?.response?.data?.missing_fields;
            if (Array.isArray(missing) && missing.length) {
                setGoogleCredential(credential);
                setGoogleMissing(missing);
                setError('Please complete missing profile fields to continue.');
            } else {
                setError(err?.response?.data?.detail || 'Google sign in failed.');
            }
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        if (!window.google || !googleButtonRef.current) return;
        const clientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;
        if (!clientId) return;

        window.google.accounts.id.initialize({
            client_id: clientId,
            callback: (response: any) => {
                if (response?.credential) {
                    handleGoogleCredential(response.credential);
                }
            },
        });
        googleButtonRef.current.innerHTML = "";
        window.google.accounts.id.renderButton(googleButtonRef.current, {
            theme: "outline",
            size: "large",
            shape: "pill",
            width: 360,
            text: "continue_with",
        });
    }, []);

    return (
        <div className="min-h-screen bg-gradient-to-br from-blue-900 via-blue-700 to-indigo-700 flex items-center justify-center p-6">
            <div className="w-full max-w-md">
                <div className="text-center mb-7">
                    <img src="/images/logo.png" alt="MasterSAT" className="mx-auto w-20 h-20 object-contain drop-shadow-lg" />
                    <h1 className="mt-4 text-3xl font-black text-white tracking-tight">MasterSAT</h1>
                    <p className="text-blue-100 mt-2 font-medium">Sign in to continue your preparation</p>
                </div>

                <div className="bg-white/95 backdrop-blur rounded-3xl border border-white/40 shadow-2xl p-8">
                    <form className="space-y-5" onSubmit={handleSubmit}>
                        {error && (
                            <div className="flex items-start gap-3 text-red-600 text-sm font-medium bg-red-50 p-4 rounded-xl border border-red-100 animate-in fade-in slide-in-from-top-2 duration-200">
                                <AlertCircle className="w-5 h-5 shrink-0" />
                                <span>{error}</span>
                            </div>
                        )}

                        <div className="space-y-4">
                            <div>
                                <label className="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-2 ml-1" htmlFor="email-address">
                                    Email or Username
                                </label>
                                <input
                                    id="email-address"
                                    type="text"
                                    required
                                    className="w-full px-4 py-3.5 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 font-medium placeholder-slate-400 focus:outline-none focus:ring-4 focus:ring-blue-100 focus:bg-white focus:border-blue-400 transition-all sm:text-sm"
                                    placeholder="name@example.com or username"
                                    value={email}
                                    onChange={(e) => setEmail(e.target.value)}
                                    disabled={loading}
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-2 ml-1" htmlFor="password">
                                    Password
                                </label>
                                <input
                                    id="password"
                                    type="password"
                                    required
                                    className="w-full px-4 py-3.5 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 font-medium placeholder-slate-400 focus:outline-none focus:ring-4 focus:ring-blue-100 focus:bg-white focus:border-blue-400 transition-all sm:text-sm"
                                    placeholder="••••••••"
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                    disabled={loading}
                                />
                            </div>
                            <div className="flex items-center justify-between">
                                <label className="inline-flex items-center gap-2 text-sm text-slate-600 font-semibold">
                                    <input
                                        type="checkbox"
                                        checked={rememberMe}
                                        onChange={(e) => setRememberMe(e.target.checked)}
                                        className="rounded border-slate-300 text-blue-600"
                                    />
                                    Remember me for 1 week
                                </label>
                            </div>
                        </div>

                        <div className="pt-1">
                            <button
                                type="submit"
                                disabled={loading}
                                className="w-full flex items-center justify-center py-3.5 px-6 bg-blue-600 text-white text-sm font-bold rounded-xl hover:bg-blue-700 focus:outline-none focus:ring-4 focus:ring-blue-100 transition-all active:scale-[0.98] shadow-lg shadow-blue-200 disabled:opacity-70 disabled:cursor-not-allowed group"
                            >
                                {loading ? (
                                    <Loader2 className="w-5 h-5 animate-spin" />
                                ) : (
                                    <>
                                        Sign In to Portal
                                        <LogIn className="w-4 h-4 ml-2 opacity-70" />
                                    </>
                                )}
                            </button>
                        </div>
                        <div className="flex items-center gap-3">
                            <div className="h-px bg-slate-200 flex-1" />
                            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">or</span>
                            <div className="h-px bg-slate-200 flex-1" />
                        </div>
                        <div className="flex justify-center">
                            <div ref={googleButtonRef} />
                        </div>
                        {googleMissing.length > 0 && (
                            <div className="space-y-3 pt-2">
                                {googleMissing.includes('first_name') && (
                                    <input
                                        type="text"
                                        placeholder="First name (min 3)"
                                        className="w-full px-4 py-3 border border-slate-200 rounded-xl"
                                        value={googleProfile.first_name}
                                        onChange={(e) => setGoogleProfile(prev => ({ ...prev, first_name: e.target.value }))}
                                    />
                                )}
                                {googleMissing.includes('last_name') && (
                                    <input
                                        type="text"
                                        placeholder="Last name (min 3)"
                                        className="w-full px-4 py-3 border border-slate-200 rounded-xl"
                                        value={googleProfile.last_name}
                                        onChange={(e) => setGoogleProfile(prev => ({ ...prev, last_name: e.target.value }))}
                                    />
                                )}
                                <button
                                    type="button"
                                    onClick={() => handleGoogleCredential(googleCredential, googleProfile)}
                                    className="w-full py-3 rounded-xl bg-slate-900 text-white font-bold"
                                >
                                    Continue with Google profile
                                </button>
                            </div>
                        )}
                    </form>
                    <div className="mt-5 text-center">
                        <span className="text-sm text-slate-500 font-medium">Don't have an account? </span>
                        <Link href="/register" className="text-sm font-bold text-blue-600 hover:text-blue-800 transition-colors">
                            Register Now
                        </Link>
                    </div>
                </div>
                <p className="mt-6 text-center text-xs text-blue-100 font-medium">© {new Date().getFullYear()} MasterSAT Center</p>
            </div>
        </div>
    );
}
