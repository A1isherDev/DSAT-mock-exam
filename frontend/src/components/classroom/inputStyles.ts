/**
 * Shared form control styles — explicit text/background so typed text never inherits
 * low-contrast colors from glass cards (`.cr-surface`).
 */
const crControlBase =
  "w-full rounded-xl border border-slate-300/95 bg-white px-4 py-2.5 text-sm font-normal text-slate-900 shadow-sm transition-[border-color,box-shadow,background-color] duration-200 placeholder:text-slate-500 hover:border-slate-400/90 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/25 dark:border-slate-500 dark:bg-slate-950 dark:text-slate-50 dark:placeholder:text-slate-400 dark:hover:border-slate-400 dark:focus:border-blue-400";

export const crInputClass = `${crControlBase} [color-scheme:light] dark:[color-scheme:dark]`;

/** Long-form answers — taller box, visible caret, easy to resize. */
export const crTextareaClass = `${crControlBase} min-h-[12rem] resize-y py-3 leading-relaxed [caret-color:#0f172a] dark:[caret-color:#f8fafc] [color-scheme:light] dark:[color-scheme:dark]`;

export const crInputInvalidClass =
  "border-red-300 focus:border-red-400 focus:ring-red-500/20 dark:border-red-800 aria-invalid:border-red-400";

export const crSelectClass = `${crInputClass} appearance-none pr-10`;
