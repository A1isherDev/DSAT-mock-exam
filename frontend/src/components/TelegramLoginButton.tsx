"use client";

import { useEffect, useRef } from "react";

export type TelegramAuthUser = {
    id: number;
    first_name?: string;
    last_name?: string;
    username?: string;
    photo_url?: string;
    auth_date: number;
    hash: string;
};

declare global {
    interface Window {
        onTelegramAuth?: (user: TelegramAuthUser) => void;
    }
}

type Props = {
    onAuth: (user: TelegramAuthUser) => void;
};

/**
 * Telegram Login Widget (https://core.telegram.org/widgets/login).
 * Set NEXT_PUBLIC_TELEGRAM_BOT_NAME to the bot username without @.
 */
export default function TelegramLoginButton({ onAuth }: Props) {
    const containerRef = useRef<HTMLDivElement>(null);
    const onAuthRef = useRef(onAuth);
    onAuthRef.current = onAuth;

    useEffect(() => {
        const bot = process.env.NEXT_PUBLIC_TELEGRAM_BOT_NAME;
        const el = containerRef.current;
        if (!bot || !el) return;

        window.onTelegramAuth = (user: TelegramAuthUser) => onAuthRef.current(user);
        el.innerHTML = "";
        const script = document.createElement("script");
        script.src = "https://telegram.org/js/telegram-widget.js?22";
        script.async = true;
        script.setAttribute("data-telegram-login", bot);
        script.setAttribute("data-size", "large");
        script.setAttribute("data-radius", "8");
        script.setAttribute("data-request-access", "write");
        script.setAttribute("data-onauth", "onTelegramAuth(user)");
        el.appendChild(script);

        return () => {
            delete window.onTelegramAuth;
            el.innerHTML = "";
        };
    }, []);

    if (!process.env.NEXT_PUBLIC_TELEGRAM_BOT_NAME) {
        return null;
    }

    return <div ref={containerRef} className="flex justify-center items-center min-h-[44px]" />;
}
