"use client";
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { authApi } from '@/lib/api';
import { useRouter } from 'next/navigation';
import { AlertCircle, Loader2, LogIn } from 'lucide-react';
import Link from 'next/link';
import TelegramLoginButton, { type TelegramAuthUser } from '@/components/TelegramLoginButton';

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

    const handleTelegramAuth = useCallback(
        async (user: TelegramAuthUser) => {
            setLoading(true);
            setError('');
            try {
                await authApi.telegramAuth(user, rememberMe);
                router.push('/');
            } catch (err: any) {
                setError(err?.response?.data?.detail || 'Telegram orqali kirish muvaffaqiyatsiz.');
            } finally {
                setLoading(false);
            }
        },
        [rememberMe, router],
    );

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
        <div className="min-h-screen app-bg flex items-center justify-center p-6 transition-colors duration-500">
            <div className="w-full max-w-md">
                <div className="text-center mb-7">
                    <img src="/images/logo.png" alt="MasterSAT" className="mx-auto w-20 h-20 object-contain drop-shadow-xl" />
                    <h1 className="mt-4 text-3xl font-black text-slate-900 tracking-tight">MasterSAT</h1>
                    <p className="text-slate-500 mt-2 font-medium">Sign in to continue your preparation</p>
                </div>

                <div className="hero-shell p-8 transition-colors duration-300">
                    <form className="space-y-5" onSubmit={handleSubmit}>
                        {error && (
                            <div className="flex items-start gap-3 text-red-600 dark:text-red-400 text-sm font-medium bg-red-50 dark:bg-red-900/20 p-4 rounded-xl border border-red-100 dark:border-red-900/50 animate-in fade-in slide-in-from-top-2 duration-200">
                                <AlertCircle className="w-5 h-5 shrink-0" />
                                <span>{error}</span>
                            </div>
                        )}

                        <div className="space-y-4">
                            <div>
                                <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest mb-2 ml-1" htmlFor="email-address">
                                    Email or Username
                                </label>
                                <input
                                    id="email-address"
                                    type="text"
                                    required
                                    className="input-modern font-medium sm:text-sm"
                                    placeholder="name@example.com or username"
                                    value={email}
                                    onChange={(e) => setEmail(e.target.value)}
                                    disabled={loading}
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest mb-2 ml-1" htmlFor="password">
                                    Password
                                </label>
                                <input
                                    id="password"
                                    type="password"
                                    required
                                    className="input-modern font-medium sm:text-sm"
                                    placeholder="••••••••"
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                    disabled={loading}
                                />
                            </div>
                            <div className="flex items-center justify-between">
                                <label className="inline-flex items-center gap-2 text-sm text-slate-600 dark:text-slate-400 font-semibold cursor-pointer">
                                    <input
                                        type="checkbox"
                                        checked={rememberMe}
                                        onChange={(e) => setRememberMe(e.target.checked)}
                                        className="rounded border-slate-300 dark:border-slate-700 text-blue-600 dark:text-blue-500 focus:ring-blue-500 bg-white dark:bg-slate-900"
                                    />
                                    Remember me for 1 week
                                </label>
                            </div>
                        </div>

                        <div className="pt-1">
                            <button
                                type="submit"
                                disabled={loading}
                                className="w-full btn-primary disabled:opacity-70 disabled:cursor-not-allowed group"
                            >
                                {loading ? (
                                    <Loader2 className="w-5 h-5 animate-spin" />
                                ) : (
                                    <>
                                        Sign In to Portal
                                        <LogIn className="w-4 h-4 ml-2 opacity-70 group-hover:opacity-100 transition-opacity" />
                                    </>
                                )}
                            </button>
                        </div>
                        <div className="flex items-center gap-3">
                            <div className="h-px bg-slate-200 dark:bg-slate-800 flex-1" />
                            <span className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest">or</span>
                            <div className="h-px bg-slate-200 dark:bg-slate-800 flex-1" />
                        </div>
                        <div className="flex flex-col items-center gap-4">
                            <div className="flex justify-center bg-white dark:bg-white rounded-full mx-auto w-fit p-1">
                                <div ref={googleButtonRef} className="dark:mix-blend-normal" />
                            </div>
                            {process.env.NEXT_PUBLIC_TELEGRAM_BOT_NAME ? (
                                <div className="w-full flex flex-col items-center gap-2">
                                    <span className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest">
                                        Telegram bilan kirish
                                    </span>
                                    <TelegramLoginButton onAuth={handleTelegramAuth} />
                                </div>
                            ) : null}
                        </div>
                        {googleMissing.length > 0 && (
                            <div className="space-y-3 pt-2">
                                {googleMissing.includes('first_name') && (
                                    <input
                                        type="text"
                                        placeholder="First name (min 3)"
                                        className="w-full px-4 py-3 border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/50 text-slate-900 dark:text-white rounded-xl focus:outline-none focus:border-blue-500 transition-colors"
                                        value={googleProfile.first_name}
                                        onChange={(e) => setGoogleProfile(prev => ({ ...prev, first_name: e.target.value }))}
                                    />
                                )}
                                {googleMissing.includes('last_name') && (
                                    <input
                                        type="text"
                                        placeholder="Last name (min 3)"
                                        className="w-full px-4 py-3 border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/50 text-slate-900 dark:text-white rounded-xl focus:outline-none focus:border-blue-500 transition-colors"
                                        value={googleProfile.last_name}
                                        onChange={(e) => setGoogleProfile(prev => ({ ...prev, last_name: e.target.value }))}
                                    />
                                )}
                                <button
                                    type="button"
                                    onClick={() => handleGoogleCredential(googleCredential, googleProfile)}
                                    className="w-full py-3 rounded-xl bg-slate-900 dark:bg-slate-800 text-white font-bold hover:bg-slate-800 dark:hover:bg-slate-700 transition-colors"
                                >
                                    Continue with Google profile
                                </button>
                            </div>
                        )}
                    </form>
                    <div className="mt-5 text-center">
                        <span className="text-sm text-slate-500 dark:text-slate-400 font-medium">Don't have an account? </span>
                        <Link href="/register" className="text-sm font-bold text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300 transition-colors">
                            Register Now
                        </Link>
                    </div>
                </div>
                <p className="mt-6 text-center text-xs text-slate-400 font-medium">© {new Date().getFullYear()} MasterSAT Center</p>
            </div>
        </div>
    );
}
