"use client";
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Cookies from 'js-cookie';
import { getPermissionList } from '@/lib/permissions';
import { usersApi } from '@/lib/api';

function consoleFromHostname(): "admin" | "questions" | "main" {
    if (typeof window === "undefined") return "main";
    const h = String(window.location.hostname || "").toLowerCase();
    const labels = h.split(".").filter(Boolean);
    if (!labels.length) return "main";
    if (labels[0] === "admin" || h.startsWith("admin.")) return "admin";
    if (labels[0] === "questions" || h.startsWith("questions.")) return "questions";
    if (labels.length >= 2 && labels[1] === "questions") return "questions";
    return "main";
}

export default function AuthGuard({ children, isOptional = false, adminOnly = false }: { children: React.ReactNode; isOptional?: boolean; adminOnly?: boolean }) {
    const [isAuthenticated, setIsAuthenticated] = useState(false);
    const [isLoading, setIsLoading] = useState(true);
    const router = useRouter();

    useEffect(() => {
        let cancelled = false;
        const run = async () => {
            const hasSessionHint =
                !!Cookies.get("lms_user") || !!Cookies.get("role") || !!Cookies.get("is_admin");
            const consoleMode = consoleFromHostname();
            const isFrozen = Cookies.get('is_frozen') === 'true';

            if (!hasSessionHint && !isOptional) {
                router.push('/login');
                return;
            }

            // Single source of truth for identity: /users/me.
            // This also refreshes the cached lms_user cookie via persistMeCookie() in login flows.
            let me: any = null;
            try {
                me = hasSessionHint ? await usersApi.getMe() : null;
            } catch (e: any) {
                const status = e?.response?.status;
                // If the token is invalid/expired, do not allow UI drift: force re-auth.
                if (status === 401 && !isOptional) {
                    // Let the axios interceptor handle cookie clearing + redirect.
                    router.push('/login');
                    return;
                }
                me = null;
            }
            const role = String(me?.role || "").toLowerCase();
            const perms = getPermissionList();

            const isTester = role === "test_admin";
            const isStudent = role === "student";
            const hasStaffAccess =
                perms.includes("*") ||
                perms.includes("manage_users") ||
                perms.includes("assign_access") ||
                perms.includes("manage_tests");

            if (isFrozen && !hasStaffAccess && !isOptional) {
                router.push('/frozen');
                return;
            }
            if (consoleMode === "questions" && isStudent && !isOptional) {
                router.push('/');
                return;
            }
            if (consoleMode === "admin" && (isStudent || isTester) && !isOptional) {
                router.push('/');
                return;
            }
            if (adminOnly && (!hasStaffAccess || (consoleMode === "admin" && isTester)) && !isOptional) {
                router.push('/');
                return;
            }
            if (!cancelled) {
                setIsAuthenticated(!!me);
                setIsLoading(false);
            }
        };
        void run();
        return () => { cancelled = true; };
    }, [router, isOptional, adminOnly]);

    if (isLoading && !isOptional) return <div className="min-h-screen bg-background flex items-center justify-center"><div className="animate-pulse h-10 w-10 rounded-full bg-primary/20"></div></div>;

    return <>{children}</>;
}
