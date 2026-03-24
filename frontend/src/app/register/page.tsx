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
        <div className="min-h-screen flex flex-col items-center justify-center bg-slate-50 p-6">
            <div className="w-full max-w-[440px]">
                <div className="flex flex-col items-center mb-10">
                    <img src="/images/logo.png" alt="Master SAT" className="w-16 h-16 object-contain mb-6 drop-shadow-sm" />
                    <h1 className="text-3xl font-extrabold text-slate-900 tracking-tight">Create Account</h1>
                    <p className="mt-3 text-slate-500 font-medium text-center">Join MasterSAT Program</p>
                </div>

                <div className="bg-white rounded-[32px] shadow-xl shadow-slate-200/50 border border-slate-200 p-10">
                    <form className="space-y-6" onSubmit={handleSubmit}>
                        {error && (
                            <div className="flex items-start gap-3 text-red-600 text-sm font-medium bg-red-50 p-4 rounded-xl border border-red-100 animate-in fade-in slide-in-from-top-2 duration-200">
                                <AlertCircle className="w-5 h-5 shrink-0" />
                                <span>{error}</span>
                            </div>
                        )}

                        <div className="space-y-5">
                            <div className="flex gap-4">
                                <div className="w-1/2">
                                    <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-2 ml-1" htmlFor="firstName">
                                        First Name
                                    </label>
                                    <input
                                        id="firstName"
                                        type="text"
                                        required
                                        className="w-full px-5 py-4 bg-slate-50 border border-slate-200 rounded-2xl text-slate-900 font-medium placeholder-slate-400 focus:outline-none focus:ring-4 focus:ring-blue-100 focus:bg-white focus:border-blue-400 transition-all sm:text-sm"
                                        placeholder="John"
                                        value={firstName}
                                        onChange={(e) => setFirstName(e.target.value)}
                                        disabled={loading}
                                    />
                                </div>
                                <div className="w-1/2">
                                    <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-2 ml-1" htmlFor="lastName">
                                        Last Name
                                    </label>
                                    <input
                                        id="lastName"
                                        type="text"
                                        required
                                        className="w-full px-5 py-4 bg-slate-50 border border-slate-200 rounded-2xl text-slate-900 font-medium placeholder-slate-400 focus:outline-none focus:ring-4 focus:ring-blue-100 focus:bg-white focus:border-blue-400 transition-all sm:text-sm"
                                        placeholder="Doe"
                                        value={lastName}
                                        onChange={(e) => setLastName(e.target.value)}
                                        disabled={loading}
                                    />
                                </div>
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-2 ml-1" htmlFor="username">
                                    Username
                                </label>
                                <input
                                    id="username"
                                    type="text"
                                    required
                                    className="w-full px-5 py-4 bg-slate-50 border border-slate-200 rounded-2xl text-slate-900 font-medium placeholder-slate-400 focus:outline-none focus:ring-4 focus:ring-blue-100 focus:bg-white focus:border-blue-400 transition-all sm:text-sm"
                                    placeholder="johndoe123"
                                    value={username}
                                    onChange={(e) => setUsername(e.target.value)}
                                    disabled={loading}
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-2 ml-1" htmlFor="email-address">
                                    Email Address
                                </label>
                                <input
                                    id="email-address"
                                    type="email"
                                    required
                                    className="w-full px-5 py-4 bg-slate-50 border border-slate-200 rounded-2xl text-slate-900 font-medium placeholder-slate-400 focus:outline-none focus:ring-4 focus:ring-blue-100 focus:bg-white focus:border-blue-400 transition-all sm:text-sm"
                                    placeholder="name@example.com"
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
                                        Register Now
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
                    </form>
                    
                    <div className="mt-6 text-center">
                        <span className="text-sm text-slate-500 font-medium">Already have an account? </span>
                        <Link href="/login" className="text-sm font-bold text-blue-600 hover:text-blue-800">
                            Sign In
                        </Link>
                    </div>
                </div>

                <div className="mt-10 text-center">
                    <p className="text-xs font-medium text-slate-400">
                        © {new Date().getFullYear()} MasterSAT Center
                    </p>
                </div>
            </div>
        </div>
    );
}
