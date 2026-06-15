"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  applyHighlights,
  clearHighlights,
  DEFAULT_HIGHLIGHT_STYLE,
  type HighlightRange,
  type HighlightStyle,
  markFromEvent,
  offsetsOfMark,
  rangeToOffsets,
  subtractRange,
} from "./offsets";
import { readRanges, writeRanges } from "./highlightStore";

interface UseHighlighterArgs {
  /** Resolve the highlightable container live from the DOM. */
  getContainer: () => HTMLElement | null;
  attemptId: number | string;
  questionId: number | undefined;
  active: boolean;
}

export interface HighlightPopover {
  x: number;
  y: number;
  /** The range (with its current style) this popover acts on. */
  target: HighlightRange;
}

/**
 * Selection highlighting for the passage. Fully isolated: persists to
 * localStorage, paints by wrapping text nodes, and exposes a colour/underline +
 * remove popover. Never touches answers, autosave, or the timer.
 *
 * Colours are per-range; the last-used colour becomes the default for the next
 * selection (Bluebook-style). Re-highlighting or recolouring a region subtracts
 * any overlap first so marks never stack.
 */
export function useHighlighter({ getContainer, attemptId, questionId, active }: UseHighlighterArgs) {
  const [popover, setPopover] = useState<HighlightPopover | null>(null);
  const [activeStyle, setActiveStyle] = useState<HighlightStyle>(DEFAULT_HIGHLIGHT_STYLE);
  const activeStyleRef = useRef(activeStyle);
  activeStyleRef.current = activeStyle;

  // Paint stored highlights whenever the question changes (and shortly after, to
  // win against the post-commit KaTeX re-render). Also drops any open popover.
  useEffect(() => {
    if (questionId == null) return;
    setPopover(null);
    const paint = () => {
      const c = getContainer();
      if (c) applyHighlights(c, readRanges(attemptId, questionId));
    };
    paint();
    const t = setTimeout(paint, 140);
    return () => clearTimeout(t);
  }, [questionId, attemptId, getContainer]);

  useEffect(() => {
    if (!active || questionId == null) return;

    const onMouseUp = (e: MouseEvent) => {
      const c = getContainer();
      if (!c) return;
      const sel = window.getSelection();

      // New selection inside the container → highlight with the active colour.
      if (sel && !sel.isCollapsed && sel.rangeCount > 0 && c.contains(sel.anchorNode) && c.contains(sel.focusNode)) {
        const range = sel.getRangeAt(0);
        const off = rangeToOffsets(c, range);
        if (off) {
          const styled: HighlightRange = { ...off, style: activeStyleRef.current };
          const next = [...subtractRange(readRanges(attemptId, questionId), off), styled];
          applyHighlights(c, writeRanges(attemptId, questionId, next));
          const rect = range.getBoundingClientRect();
          setPopover({ x: rect.left + rect.width / 2, y: rect.top, target: styled });
        }
        sel.removeAllRanges();
        return;
      }

      // Click on an existing mark → open the popover for it.
      const mark = markFromEvent(e.target);
      if (mark) {
        const off = offsetsOfMark(c, mark);
        if (off) setPopover({ x: e.clientX, y: e.clientY, target: off });
        return;
      }

      // Click anywhere else (not on the popover itself) → dismiss.
      if (!(e.target as HTMLElement | null)?.closest?.("[data-hl-popover]")) setPopover(null);
    };

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setPopover(null);
    };

    document.addEventListener("mouseup", onMouseUp);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mouseup", onMouseUp);
      document.removeEventListener("keydown", onKey);
    };
  }, [active, questionId, attemptId, getContainer]);

  // Recolour / restyle the popover's target range.
  const setStyle = useCallback(
    (style: HighlightStyle) => {
      setActiveStyle(style);
      const c = getContainer();
      if (!c || !popover || questionId == null) return;
      const restyled: HighlightRange = { ...popover.target, style };
      const next = [...subtractRange(readRanges(attemptId, questionId), popover.target), restyled];
      applyHighlights(c, writeRanges(attemptId, questionId, next));
      setPopover({ ...popover, target: restyled });
    },
    [getContainer, popover, attemptId, questionId],
  );

  const removeHighlight = useCallback(() => {
    const c = getContainer();
    if (!c || !popover || questionId == null) {
      setPopover(null);
      return;
    }
    const kept = subtractRange(readRanges(attemptId, questionId), popover.target);
    applyHighlights(c, writeRanges(attemptId, questionId, kept));
    setPopover(null);
  }, [getContainer, popover, attemptId, questionId]);

  const clearAll = useCallback(() => {
    const c = getContainer();
    if (c) clearHighlights(c);
    if (questionId != null) writeRanges(attemptId, questionId, []);
    setPopover(null);
  }, [getContainer, attemptId, questionId]);

  return { popover, activeStyle, setStyle, dismissPopover: () => setPopover(null), removeHighlight, clearAll };
}
