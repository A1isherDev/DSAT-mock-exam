"use client";
import { Trash2, Underline, X } from "lucide-react";
import type { HighlightStyle } from "./offsets";
import type { HighlightPopover as PopoverState } from "./useHighlighter";

interface HighlightPopoverProps {
  popover: PopoverState;
  onPick: (style: HighlightStyle) => void;
  onRemove: () => void;
  onClose: () => void;
}

const SWATCHES: Array<{ style: Exclude<HighlightStyle, "underline">; bg: string; label: string }> = [
  { style: "yellow", bg: "#fde047", label: "Yellow highlight" },
  { style: "blue", bg: "#93c5fd", label: "Blue highlight" },
  { style: "pink", bg: "#f9a8d4", label: "Pink highlight" },
];

/**
 * Highlight toolbar shown after selecting text or clicking an existing mark:
 * pick a colour, switch to underline, delete the highlight, or close. Anchored
 * just above the selection. Tagged `data-hl-popover` so the highlighter's
 * document mouseup handler ignores clicks inside it.
 */
export function HighlightPopover({ popover, onPick, onRemove, onClose }: HighlightPopoverProps) {
  const current = popover.target.style ?? "yellow";
  return (
    <div
      data-hl-popover
      role="toolbar"
      aria-label="Highlight options"
      className="fixed z-[70] flex -translate-x-1/2 -translate-y-full items-center gap-1 rounded-xl border border-slate-200 bg-white px-1.5 py-1 shadow-xl"
      style={{ left: popover.x, top: popover.y - 10 }}
    >
      {SWATCHES.map((s) => (
        <button
          key={s.style}
          type="button"
          title={s.label}
          aria-label={s.label}
          aria-pressed={current === s.style}
          onClick={() => onPick(s.style)}
          className={`h-6 w-6 rounded-md transition-transform hover:scale-110 ${
            current === s.style ? "ring-2 ring-slate-900 ring-offset-1" : "ring-1 ring-slate-200"
          }`}
          style={{ backgroundColor: s.bg }}
        />
      ))}

      <span className="mx-0.5 h-5 w-px bg-slate-200" />

      <button
        type="button"
        title="Underline"
        aria-label="Underline"
        aria-pressed={current === "underline"}
        onClick={() => onPick("underline")}
        className={`flex h-6 w-6 items-center justify-center rounded-md text-slate-600 hover:bg-slate-100 ${
          current === "underline" ? "bg-blue-50 text-blue-700" : ""
        }`}
      >
        <Underline className="h-4 w-4" />
      </button>

      <button
        type="button"
        title="Remove highlight"
        aria-label="Remove highlight"
        onClick={onRemove}
        className="flex h-6 w-6 items-center justify-center rounded-md text-slate-600 hover:bg-red-50 hover:text-red-600"
      >
        <Trash2 className="h-4 w-4" />
      </button>

      <span className="mx-0.5 h-5 w-px bg-slate-200" />

      <button
        type="button"
        title="Close"
        aria-label="Close"
        onClick={onClose}
        className="flex h-6 w-6 items-center justify-center rounded-md text-slate-400 hover:bg-slate-100 hover:text-slate-700"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}
