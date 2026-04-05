"use client";
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Cookies from 'js-cookie';

export default function AuthGuard({ children, isOptional = false, adminOnly = false }: { children: React.ReactNode; isOptional?: boolean; adminOnly?: boolean }) {
    const [isAuthenticated, setIsAuthenticated] = useState(false);
    const [isLoading, setIsLoading] = useState(true);
    const router = useRouter();

    useEffect(() => {
        const token = Cookies.get('access_token');
        const isAdmin = Cookies.get('is_admin') === 'true';
        const isFrozen = Cookies.get('is_frozen') === 'true';

        if (!token && !isOptional) {
            router.push('/login');
        } else if (isFrozen && !isAdmin && !isOptional) {
            router.push('/frozen');
        } else if (adminOnly && !isAdmin && !isOptional) {
            router.push('/'); // Redirect non-admins to home
        } else {
            setIsAuthenticated(!!token);
            setIsLoading(false);
        }
    }, [router, isOptional, adminOnly]);

    if (isLoading && !isOptional) return <div className="min-h-screen bg-background flex items-center justify-center"><div className="animate-pulse h-10 w-10 rounded-full bg-primary/20"></div></div>;

    return <>{children}</>;
}
