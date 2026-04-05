/** Shared form control styles — 8px grid, blue focus, 200ms transitions */
export const crInputClass =
  "w-full rounded-xl border border-slate-200/90 bg-white/95 px-4 py-2.5 text-sm text-slate-900 shadow-sm transition-[border-color,box-shadow,background-color] duration-200 placeholder:text-slate-400 hover:border-slate-300/90 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 dark:border-slate-600 dark:bg-slate-900/70 dark:text-slate-100 dark:placeholder:text-slate-500 dark:hover:border-slate-500 dark:focus:border-blue-500";

export const crInputInvalidClass =
  "border-red-300 focus:border-red-400 focus:ring-red-500/20 dark:border-red-800 aria-invalid:border-red-400";

export const crSelectClass = `${crInputClass} appearance-none pr-10`;
