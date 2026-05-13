"use client";

/**
 * /admin — Legacy gateway redirect.
 *
 * This route is kept alive for backward-compatibility (bookmarks, external
 * links).  All functionality has been migrated to the two modern consoles:
 *
 *   /ops     — Operational console   (classrooms, assignments, users, midterms)
 *   /builder — Questions console     (question bank, assessments, mock exams)
 *
 * Admins are forwarded to /ops automatically; the page renders a brief
 * "redirecting" state while the router navigates so there is no flash.
 */

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import AuthGuard from "@/components/AuthGuard";

function AdminGateway() {
  const router = useRouter();

  useEffect(() => {
    router.replace("/ops");
  }, [router]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background text-foreground">
      <div className="flex flex-col items-center gap-4">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
        <p className="text-sm text-muted-foreground">Redirecting to the Operations console…</p>
        <p className="text-xs text-muted-foreground/60">
          Bookmark{" "}
          <a href="/ops" className="underline hover:text-foreground">/ops</a>
          {" "}or{" "}
          <a href="/builder" className="underline hover:text-foreground">/builder</a>
          {" "}to skip this redirect in the future.
        </p>
      </div>
    </div>
  );
}

export default function AdminPage() {
  return (
    <AuthGuard adminOnly>
      <AdminGateway />
    </AuthGuard>
  );
}
