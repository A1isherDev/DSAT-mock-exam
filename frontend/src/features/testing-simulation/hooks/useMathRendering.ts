"use client";
import { useEffect } from "react";
import { renderMath } from "@/lib/mathRender";

/**
 * Renders KaTeX math for the current question and keeps it stable.
 *
 * The challenge: question HTML is injected by `SafeHtml` via
 * `dangerouslySetInnerHTML`, and the exact moment it lands in the DOM (initial
 * commit, a second React commit, or an async payload) is not deterministic. A
 * one-shot render keyed only to `resetKey` therefore sometimes fires *before*
 * the content exists and never renders it — leaving raw `\(…\)` on screen.
 *
 * The original implementation used a permanent `document.body` MutationObserver,
 * which rendered reliably but re-ran on every DOM change including the
 * once-per-second clock tick.
 *
 * This version takes the middle path: whenever `resetKey` changes (a new
 * question/module) it renders immediately and across the next few frames, AND
 * runs a MutationObserver that *auto-disconnects* after a short settle window.
 * That reliably catches late/async content but stops observing well before it
 * could react to clock ticks, so a question's math renders once and then stays
 * frozen — like the read-only review page. `renderMath` is idempotent (it skips
 * already-rendered `.katex` nodes), so the repeated calls are cheap no-ops.
 */
export function useMathRendering(enabled: boolean, resetKey: unknown): void {
  useEffect(() => {
    if (!enabled) return;

    const run = () => renderMath({ root: document.body });

    // Immediate + across the next few frames: covers content present now and
    // content committed a tick later.
    run();
    const raf = requestAnimationFrame(run);
    const timers = [30, 120, 300, 700].map((ms) => setTimeout(run, ms));

    // Short-lived observer: catches async/late-arriving question HTML, then
    // disconnects so steady-state DOM churn (the clock) never triggers a
    // re-render. Re-armed on every resetKey change.
    const observer = new MutationObserver(() => run());
    observer.observe(document.body, { childList: true, subtree: true, characterData: true });
    const stopObserving = setTimeout(() => observer.disconnect(), 2500);

    // Re-render once KaTeX finishes loading (cold-start race condition).
    const onReady = () => run();
    window.addEventListener("katex:ready", onReady);

    return () => {
      cancelAnimationFrame(raf);
      timers.forEach(clearTimeout);
      clearTimeout(stopObserving);
      observer.disconnect();
      window.removeEventListener("katex:ready", onReady);
    };
  }, [enabled, resetKey]);
}
