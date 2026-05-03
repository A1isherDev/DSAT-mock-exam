"use client";

import { useEffect, useRef } from "react";
import type { TelegramAuthUser } from "@/types/telegramAuth";

export type { TelegramAuthUser };

declare global {
    interface Window {
        onTelegramAuth?: (user: TelegramAuthUser) => void;
    }
}

type Props = {
    onAuth: (user: TelegramAuthUser) => void;
    /** Bot username without @. Prefer this from GET /users/telegram/config/ so login works with only server env. */
    botUsername?: string | null;
};

/**
 * Telegram Login Widget (https://core.telegram.org/widgets/login).
 * Uses ``botUsername`` when set, otherwise ``NEXT_PUBLIC_TELEGRAM_BOT_NAME``.
 */
export default function TelegramLoginButton({ onAuth, botUsername }: Props) {
    const containerRef = useRef<HTMLDivElement>(null);
    const onAuthRef = useRef(onAuth);
    useEffect(() => {
        onAuthRef.current = onAuth;
    }, [onAuth]);

    const bot = (botUsername ?? process.env.NEXT_PUBLIC_TELEGRAM_BOT_NAME)?.trim() || "";

    useEffect(() => {
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
        // Ask for DM access and verified phone when the user agrees (oauth.telegram.org embed).
        script.setAttribute("data-request-access", "phone write");
        script.setAttribute("data-onauth", "onTelegramAuth(user)");
        el.appendChild(script);

        return () => {
            delete window.onTelegramAuth;
            el.innerHTML = "";
        };
    }, [bot]);

    if (!bot) {
        return null;
    }

    return <div ref={containerRef} className="flex justify-center items-center min-h-[44px]" />;
}
