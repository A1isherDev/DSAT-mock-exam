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

        if (!token && !isOptional) {
            router.push('/login');
        } else if (adminOnly && !isAdmin && !isOptional) {
            router.push('/'); // Redirect non-admins to home
        } else {
            setIsAuthenticated(!!token);
            setIsLoading(false);
        }
    }, [router, isOptional, adminOnly]);

    if (isLoading && !isOptional) return <div className="min-h-screen bg-slate-50 flex items-center justify-center"><div className="animate-pulse bg-blue-100 h-10 w-10 rounded-full"></div></div>;

    return <>{children}</>;
}
