type RenderOptions = {
  root?: HTMLElement | null;
};

function katexAutoRenderAvailable(): boolean {
  if (typeof window === "undefined") return false;
  return typeof (window as any).renderMathInElement === "function";
}

/**
 * Deterministic math rendering: KaTeX auto-render only.
 * - SSR-safe (no-op server-side)
 * - Idempotent / safe to call repeatedly
 */
export function renderMath(options?: RenderOptions) {
  if (typeof window === "undefined") return;
  if (!katexAutoRenderAvailable()) return;

  const root = options?.root ?? document.body;
  if (!root) return;

  try {
    (window as any).renderMathInElement(root, {
      delimiters: [
        { left: "$$", right: "$$", display: true },
        { left: "\\[", right: "\\]", display: true },
        { left: "\\(", right: "\\)", display: false },
        { left: "$", right: "$", display: false },
      ],
      throwOnError: false,
      // KaTeX auto-render option (supported by contrib/auto-render)
      trust: false,
    });
  } catch {
    // Rendering must never crash the runner.
  }
}

