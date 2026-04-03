"use client";
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { authApi, usersApi } from "@/lib/api";
import { useRouter } from 'next/navigation';
import { AlertCircle, Loader2, UserPlus } from 'lucide-react';
import Link from 'next/link';
import TelegramLoginButton, { type TelegramAuthUser } from '@/components/TelegramLoginButton';

declare global {
    interface Window {
        google?: any;
    }
}

export default function RegisterPage() {
    const [firstName, setFirstName] = useState('');
    const [lastName, setLastName] = useState('');
    const [username, setUsername] = useState('');
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);
    const googleButtonRef = useRef<HTMLDivElement>(null);
    const router = useRouter();
    const [telegramCfg, setTelegramCfg] = useState<{ enabled: boolean; bot_username: string | null } | null>(null);

    useEffect(() => {
        usersApi
            .getTelegramWidgetConfig()
            .then(setTelegramCfg)
            .catch(() => setTelegramCfg({ enabled: false, bot_username: null }));
    }, []);

    const handleTelegramAuth = useCallback(
        async (user: TelegramAuthUser) => {
            setLoading(true);
            setError('');
            try {
                await authApi.telegramAuth(user, true);
                router.push('/');
            } catch (err: any) {
                setError(err?.response?.data?.detail || 'Telegram orqali ro‘yxatdan o‘tish muvaffaqiyatsiz.');
            } finally {
                setLoading(false);
            }
        },
        [router],
    );

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setError('');
        if (firstName.trim().length < 3 || lastName.trim().length < 3 || username.trim().length < 3) {
            setError('First name, last name, and username must be at least 3 characters.');
            setLoading(false);
            return;
        }
        try {
            await authApi.register(firstName, lastName, username, email, password);
            // Auto login after registration
            await authApi.login(email, password);
            router.push('/');
        } catch (err: any) {
            let msg = 'Registration failed. Please check your details.';
            if (err.response?.data) {
                if (err.response.data.detail) msg = err.response.data.detail;
                else if (err.response.data.email) msg = err.response.data.email[0];
                else if (err.response.data.username) msg = err.response.data.username[0];
                else if (err.response.data.first_name) msg = err.response.data.first_name[0];
                else if (err.response.data.last_name) msg = err.response.data.last_name[0];
                else if (err.response.data.password) msg = err.response.data.password[0];
                else if (typeof err.response.data === 'object' && Object.keys(err.response.data).length > 0) {
                    const firstError = Object.values(err.response.data)[0];
                    if (Array.isArray(firstError)) msg = firstError[0];
                }
            }
            setError(msg);
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
            callback: async (response: any) => {
                if (!response?.credential) return;
                try {
                    await authApi.googleAuth(response.credential, undefined, true);
                    router.push('/');
                } catch (err: any) {
                    setError(err?.response?.data?.detail || 'Google sign up failed.');
                }
            },
        });
        googleButtonRef.current.innerHTML = "";
        window.google.accounts.id.renderButton(googleButtonRef.current, {
            theme: "outline",
            size: "large",
            shape: "pill",
            width: 360,
            text: "signup_with",
        });
    }, [router]);

    return (
        <div className="min-h-screen app-bg flex items-center justify-center p-6 transition-colors duration-500">
            <div className="w-full max-w-md">
                <div className="flex flex-col items-center mb-8">
                    <img src="/images/logo.png" alt="Master SAT" className="w-20 h-20 object-contain mb-4 drop-shadow-xl" />
                    <h1 className="text-3xl font-extrabold text-slate-900 tracking-tight">Create Account</h1>
                    <p className="mt-2 text-slate-500 font-medium text-center">Join MasterSAT Program</p>
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
                            <div className="flex gap-4">
                                <div className="w-1/2">
                                    <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest mb-2 ml-1" htmlFor="firstName">
                                        First Name
                                    </label>
                                    <input
                                        id="firstName"
                                        type="text"
                                        required
                                        className="input-modern font-medium sm:text-sm"
                                        placeholder="John"
                                        value={firstName}
                                        onChange={(e) => setFirstName(e.target.value)}
                                        disabled={loading}
                                    />
                                </div>
                                <div className="w-1/2">
                                    <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest mb-2 ml-1" htmlFor="lastName">
                                        Last Name
                                    </label>
                                    <input
                                        id="lastName"
                                        type="text"
                                        required
                                        className="input-modern font-medium sm:text-sm"
                                        placeholder="Doe"
                                        value={lastName}
                                        onChange={(e) => setLastName(e.target.value)}
                                        disabled={loading}
                                    />
                                </div>
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest mb-2 ml-1" htmlFor="username">
                                    Username
                                </label>
                                <input
                                    id="username"
                                    type="text"
                                    required
                                    className="input-modern font-medium sm:text-sm"
                                    placeholder="johndoe123"
                                    value={username}
                                    onChange={(e) => setUsername(e.target.value)}
                                    disabled={loading}
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest mb-2 ml-1" htmlFor="email-address">
                                    Email Address
                                </label>
                                <input
                                    id="email-address"
                                    type="email"
                                    required
                                    className="input-modern font-medium sm:text-sm"
                                    placeholder="name@example.com"
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
                        </div>

                        <div className="pt-2">
                            <button
                                type="submit"
                                disabled={loading}
                                className="w-full btn-primary disabled:opacity-70 disabled:cursor-not-allowed group"
                            >
                                {loading ? (
                                    <Loader2 className="w-5 h-5 animate-spin" />
                                ) : (
                                    <>
                                        Register Now
                                        <UserPlus className="w-4 h-4 ml-2 opacity-70 group-hover:opacity-100 transition-opacity" />
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
                            <div className="w-full flex flex-col items-center gap-2">
                                <span className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest">
                                    Telegram bilan ro‘yxatdan o‘tish
                                </span>
                                {telegramCfg === null ? (
                                    <Loader2 className="w-6 h-6 animate-spin text-slate-400" />
                                ) : telegramCfg.enabled && telegramCfg.bot_username ? (
                                    <TelegramLoginButton
                                        botUsername={telegramCfg.bot_username}
                                        onAuth={handleTelegramAuth}
                                    />
                                ) : (
                                    <p className="text-center text-xs text-slate-500 dark:text-slate-400 max-w-sm px-2">
                                        Telegram orqali ro‘yxatdan o‘tish hozircha yo‘q. Administrator{" "}
                                        <code className="text-[10px] bg-slate-100 dark:bg-slate-800 px-1 rounded">
                                            TELEGRAM_BOT_TOKEN
                                        </code>{" "}
                                        va BotFather Web Login domenini sozlasin.
                                    </p>
                                )}
                            </div>
                        </div>
                    </form>
                    
                    <div className="mt-5 text-center">
                        <span className="text-sm text-slate-500 dark:text-slate-400 font-medium">Already have an account? </span>
                        <Link href="/login" className="text-sm font-bold text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300 transition-colors">
                            Sign In
                        </Link>
                    </div>
                </div>

            </div>
            <p className="absolute bottom-6 text-center text-xs text-slate-400 font-medium">© {new Date().getFullYear()} MasterSAT Center</p>
        </div>
    );
}
