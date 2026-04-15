"use client";
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Cookies from 'js-cookie';
import { getPermissionList } from '@/lib/permissions';

export default function AuthGuard({ children, isOptional = false, adminOnly = false }: { children: React.ReactNode; isOptional?: boolean; adminOnly?: boolean }) {
    const [isAuthenticated, setIsAuthenticated] = useState(false);
    const [isLoading, setIsLoading] = useState(true);
    const router = useRouter();

    useEffect(() => {
        const token = Cookies.get('access_token');
        const perms = getPermissionList();
        const role = Cookies.get("role") || "";
        const consoleMode = Cookies.get("lms_console") || "";
        const isTester = role === "test_admin";
        const hasStaffAccess =
            perms.includes("*") ||
            perms.includes("manage_users") ||
            perms.includes("assign_access") ||
            perms.includes("manage_tests");
        const isFrozen = Cookies.get('is_frozen') === 'true';

        if (!token && !isOptional) {
            router.push('/login');
        } else if (isFrozen && !hasStaffAccess && !isOptional) {
            router.push('/frozen');
        } else if (adminOnly && (!hasStaffAccess || (consoleMode === "admin" && isTester)) && !isOptional) {
            router.push('/'); // Redirect non-admins to home
        } else {
            setIsAuthenticated(!!token);
            setIsLoading(false);
        }
    }, [router, isOptional, adminOnly]);

    if (isLoading && !isOptional) return <div className="min-h-screen bg-background flex items-center justify-center"><div className="animate-pulse h-10 w-10 rounded-full bg-primary/20"></div></div>;

    return <>{children}</>;
}
