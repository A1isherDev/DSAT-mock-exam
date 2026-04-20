"use client";

import { useEffect, useMemo, useRef } from "react";
import DOMPurify from "dompurify";

export default function SafeHtml({
  html,
  ...divProps
}: React.HTMLAttributes<HTMLDivElement> & { html: string }) {
  const safe = useMemo(() => DOMPurify.sanitize(html), [html]);
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const w = window as unknown as {
      MathJax?: { typesetPromise?: (elements?: Element[]) => Promise<unknown> };
    };
    const typeset = w?.MathJax?.typesetPromise;
    if (typeof typeset !== "function") return;

    let cancelled = false;
    // Defer until DOM updates settle (helps after state changes).
    const raf = window.requestAnimationFrame(() => {
      if (cancelled) return;
      void typeset([el]).catch(() => {
        /* ignore MathJax errors; HTML still renders */
      });
    });
    return () => {
      cancelled = true;
      window.cancelAnimationFrame(raf);
    };
  }, [safe]);

  return <div ref={ref} {...divProps} dangerouslySetInnerHTML={{ __html: safe }} />;
}

