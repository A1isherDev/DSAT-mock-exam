"use client";

import { useEffect, useState } from "react";
import { FileImage, FileText, FileType2, Trash2 } from "lucide-react";
import { isImageMimeOrName, isPdfMimeOrName } from "@/lib/homeworkFileDisplay";
import { cn } from "@/lib/cn";

type Props = {
  name: string;
  remoteUrl?: string | null;
  localFile?: File | null;
  fileType?: string;
  /** Preferred open URL (e.g. absolute submission file URL) */
  href?: string;
  onRemove?: () => void;
  removeDisabled?: boolean;
  badge?: string;
  className?: string;
};

function previewKind(localFile: File | null | undefined, mime: string, fileName: string) {
  if (localFile) {
    if (localFile.type.startsWith("image/")) return "image";
    if (isPdfMimeOrName(localFile.type, localFile.name)) return "pdf";
    if (isImageMimeOrName(localFile.type, localFile.name)) return "image";
    return "doc";
  }
  if (isImageMimeOrName(mime, fileName)) return "image";
  if (isPdfMimeOrName(mime, fileName)) return "pdf";
  return "doc";
}

export default function HomeworkFilePreviewTile({
  name,
  remoteUrl,
  localFile,
  fileType,
  href,
  onRemove,
  removeDisabled,
  badge,
  className,
}: Props) {
  const mime = fileType || localFile?.type || "";
  const [blobUrl, setBlobUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!localFile) {
      setBlobUrl(null);
      return;
    }
    const u = URL.createObjectURL(localFile);
    setBlobUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [localFile]);

  const kind = previewKind(localFile ?? null, mime, name);
  const imgSrc =
    kind === "image" && localFile && blobUrl
      ? blobUrl
      : kind === "image" && remoteUrl
        ? remoteUrl
        : null;

  const openUrl = href || remoteUrl || undefined;

  const previewInner = (
    <div
      className={cn(
        "relative flex h-36 items-center justify-center overflow-hidden bg-slate-100 dark:bg-slate-800/90",
        kind === "pdf" && "bg-red-50 dark:bg-red-950/40",
      )}
    >
      {imgSrc ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={imgSrc} alt="" className="max-h-full max-w-full object-contain" loading="lazy" />
      ) : kind === "pdf" ? (
        <div className="flex flex-col items-center gap-2 p-4 text-center">
          <div className="flex h-14 w-12 items-center justify-center rounded-sm bg-white shadow-md ring-1 ring-red-200 dark:bg-slate-900 dark:ring-red-900/50">
            <span className="text-[10px] font-black uppercase tracking-tighter text-red-600 dark:text-red-400">PDF</span>
          </div>
          <FileText className="h-10 w-10 text-red-500/90 dark:text-red-400/80" strokeWidth={1.5} aria-hidden />
        </div>
      ) : (
        <div className="flex flex-col items-center gap-2 p-4 text-slate-500 dark:text-slate-400">
          <div className="flex h-14 w-11 items-center justify-center rounded-md border border-slate-200 bg-white shadow-sm dark:border-slate-600 dark:bg-slate-900">
            <FileType2 className="h-7 w-7" strokeWidth={1.25} />
          </div>
          <FileImage className="h-6 w-6 opacity-60" aria-hidden />
        </div>
      )}
    </div>
  );

  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-xl border border-slate-200/90 bg-card shadow-sm transition hover:border-primary/35 hover:shadow-md dark:border-slate-600 dark:hover:border-primary/30",
        className,
      )}
    >
      <div className="relative">
        {openUrl ? (
          <a href={openUrl} target="_blank" rel="noreferrer" className="block focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/80">
            {previewInner}
          </a>
        ) : (
          previewInner
        )}
        {onRemove ? (
          <button
            type="button"
            disabled={removeDisabled}
            onClick={(e) => {
              e.stopPropagation();
              onRemove();
            }}
            className="absolute right-2 top-2 z-10 rounded-lg bg-white/95 p-1.5 text-slate-600 shadow-sm ring-1 ring-slate-200/80 transition hover:bg-rose-50 hover:text-rose-600 disabled:pointer-events-none disabled:opacity-40 dark:bg-slate-900/95 dark:text-slate-300 dark:ring-slate-600 dark:hover:bg-rose-950/50"
            aria-label={`Remove ${name}`}
          >
            <Trash2 className="h-4 w-4" />
          </button>
        ) : null}
      </div>
      <div className="border-t border-slate-200/80 bg-white/95 px-3 py-2.5 dark:border-slate-700 dark:bg-slate-950/60">
        {openUrl ? (
          <a
            href={openUrl}
            target="_blank"
            rel="noreferrer"
            className="block truncate text-xs font-semibold text-indigo-600 hover:underline dark:text-indigo-400"
            title={name}
          >
            {name}
          </a>
        ) : (
          <p className="truncate text-xs font-semibold text-slate-900 dark:text-slate-100" title={name}>
            {name}
          </p>
        )}
        {badge ? <p className="mt-0.5 truncate text-[10px] font-medium text-slate-500 dark:text-slate-400">{badge}</p> : null}
      </div>
    </div>
  );
}
