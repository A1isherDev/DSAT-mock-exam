"use client";

import { useMemo } from "react";
import DOMPurify from "dompurify";

export default function SafeHtml({
  html,
  ...divProps
}: React.HTMLAttributes<HTMLDivElement> & { html: string }) {
  const safe = useMemo(() => DOMPurify.sanitize(html), [html]);
  return <div {...divProps} dangerouslySetInnerHTML={{ __html: safe }} />;
}

