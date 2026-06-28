"use client";

import { usePathname } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import AuthGuard from "@/components/AuthGuard";
import { authApi } from "@/lib/api";
import { useMe } from "@/hooks/useMe";
import { cn } from "@/lib/cn";
import { AppShell } from "./AppShell";
import { studentNav } from "./navConfig";

/** Wires the generic AppShell with student auth, identity, and IA. */
export default function StudentAppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const queryClient = useQueryClient();
  const { isAuthenticated, me, globalInteractionBlockedHard } = useMe();

  const m = me as { first_name?: string; last_name?: string; profile_image_url?: string | null } | undefined;
  const name = [m?.first_name, m?.last_name].filter(Boolean).join(" ").trim() || undefined;

  // The assessment runner is an immersive, exam-style takeover (like the
  // pastpaper /exam route): no sidebar/header — only the testing simulation.
  // Rendering the shell here would also trap the runner's `fixed inset-0 z-50`
  // exam view inside the shell <main>'s z-10 stacking context, letting the
  // header/sidebar poke through (especially in full screen). Mount it bare.
  const isImmersiveRunner = /^\/assessments\/attempt\/[^/]+/.test(pathname || "");
  if (isImmersiveRunner) {
    return (
      <AuthGuard>
        <div
          className={cn(
            "min-h-dvh bg-background",
            globalInteractionBlockedHard && "pointer-events-none select-none",
          )}
          aria-busy={globalInteractionBlockedHard || undefined}
        >
          {children}
        </div>
      </AuthGuard>
    );
  }

  return (
    <AuthGuard>
      <AppShell
        brand={{ name: "MasterSAT", logoSrc: "/images/logo.png" }}
        nav={studentNav}
        pathname={pathname}
        user={isAuthenticated ? { name, avatarUrl: m?.profile_image_url ?? null } : null}
        onSignOut={() => authApi.logout(queryClient)}
      >
        <div className={cn(globalInteractionBlockedHard && "pointer-events-none select-none")} aria-busy={globalInteractionBlockedHard || undefined}>
          {children}
        </div>
      </AppShell>
    </AuthGuard>
  );
}
