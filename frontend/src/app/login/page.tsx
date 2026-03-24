"use client";
import React, { useState } from 'react';
import { authApi } from '@/lib/api';
import { useRouter } from 'next/navigation';
import { AlertCircle, Loader2 } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useRef } from 'react';

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
        <div className="min-h-screen flex flex-col items-center justify-center bg-blue-700 p-6">
            <div className="w-full max-w-[440px]">
                {/* Logo Section */}
                <div className="flex flex-col items-center mb-10">
                    <img src="/images/logo.png" alt="MasterSAT" className="w-20 h-20 object-contain mb-6 drop-shadow-md" />
                    <h1 className="text-3xl font-extrabold text-white tracking-tight">MasterSAT</h1>
                    <p className="mt-3 text-blue-100 font-medium text-center">Secure examination portal for the <br />MasterSAT Program</p>
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
                            <div className="flex items-center justify-between">
                                <label className="inline-flex items-center gap-2 text-sm text-slate-600 font-medium">
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
                </div>

                <div className="mt-6 text-center">
                    <span className="text-sm text-slate-500 font-medium">Don't have an account? </span>
                    <Link href="/register" className="text-sm font-bold text-blue-600 hover:text-blue-800 transition-colors">
                        Register Now
                    </Link>
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
