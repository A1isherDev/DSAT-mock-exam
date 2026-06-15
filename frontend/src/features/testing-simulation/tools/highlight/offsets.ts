/**
 * DOM ↔ character-offset highlighting. Highlights are stored as `{start,end}`
 * character ranges over a container's visible text, NOT as serialized HTML — so
 * they survive React re-renders without clobbering the rendered question, and
 * never interact with the exam engine.
 */
/** Visual styles a highlight can carry. */
export type HighlightStyle = "yellow" | "blue" | "pink" | "underline";
export const DEFAULT_HIGHLIGHT_STYLE: HighlightStyle = "yellow";

export interface HighlightRange {
  start: number;
  end: number;
  /** Defaults to yellow when absent (back-compat with pre-colour ranges). */
  style?: HighlightStyle;
}

const MARK = "ts-highlight";

const HL_BG: Record<Exclude<HighlightStyle, "underline">, string> = {
  yellow: "#fef08a",
  blue: "#bfdbfe",
  pink: "#fbcfe8",
};

const styleOf = (r: HighlightRange): HighlightStyle => r.style ?? DEFAULT_HIGHLIGHT_STYLE;

/** Paint a single mark element according to its style. */
function paintMark(mark: HTMLElement, style: HighlightStyle): void {
  mark.dataset.hlStyle = style;
  if (style === "underline") {
    mark.style.backgroundColor = "transparent";
    mark.style.textDecoration = "underline";
    mark.style.textDecorationColor = "#2563eb";
    mark.style.textDecorationThickness = "2px";
  } else {
    mark.style.backgroundColor = HL_BG[style];
    mark.style.color = "inherit";
  }
}

/**
 * Remove the [hole.start, hole.end) span from every range (splitting where it
 * lands inside one). Used so re-highlighting or recolouring a region never
 * leaves overlapping marks of different colours.
 */
export function subtractRange(ranges: HighlightRange[], hole: { start: number; end: number }): HighlightRange[] {
  const out: HighlightRange[] = [];
  for (const r of ranges) {
    if (hole.end <= r.start || hole.start >= r.end) {
      out.push(r);
      continue;
    }
    if (r.start < hole.start) out.push({ start: r.start, end: hole.start, style: r.style });
    if (hole.end < r.end) out.push({ start: hole.end, end: r.end, style: r.style });
  }
  return out.filter((r) => r.end > r.start);
}

function textNodesWithOffsets(container: HTMLElement): Array<{ node: Text; start: number }> {
  const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT);
  const list: Array<{ node: Text; start: number }> = [];
  let acc = 0;
  let n = walker.nextNode();
  while (n) {
    const text = n as Text;
    list.push({ node: text, start: acc });
    acc += text.length;
    n = walker.nextNode();
  }
  return list;
}

/** Character offsets of a selection Range relative to the container's text. */
export function rangeToOffsets(container: HTMLElement, range: Range): HighlightRange | null {
  const nodes = textNodesWithOffsets(container);
  let start = -1;
  let end = -1;
  for (const { node, start: base } of nodes) {
    if (node === range.startContainer) start = base + range.startOffset;
    if (node === range.endContainer) end = base + range.endOffset;
  }
  if (start < 0 || end < 0 || end <= start) return null;
  return { start, end };
}

/** Merge overlapping/adjacent ranges of the SAME style so re-applying never
 * double-wraps. Differently-styled ranges are kept separate (a blue highlight
 * next to a yellow one stays two marks). */
export function mergeRanges(ranges: HighlightRange[]): HighlightRange[] {
  const sorted = [...ranges].filter((r) => r.end > r.start).sort((a, b) => a.start - b.start || a.end - b.end);
  const out: HighlightRange[] = [];
  for (const r of sorted) {
    const last = out[out.length - 1];
    if (last && styleOf(last) === styleOf(r) && r.start <= last.end) {
      last.end = Math.max(last.end, r.end);
    } else {
      out.push({ ...r });
    }
  }
  return out;
}

/** Remove all highlight marks, restoring plain text/structure. */
export function clearHighlights(container: HTMLElement): void {
  container.querySelectorAll(`mark.${MARK}`).forEach((mark) => {
    const parent = mark.parentNode;
    if (!parent) return;
    while (mark.firstChild) parent.insertBefore(mark.firstChild, mark);
    parent.removeChild(mark);
  });
  container.normalize();
}

/** Apply highlight ranges by wrapping the covered text in <mark> elements. */
export function applyHighlights(container: HTMLElement, ranges: HighlightRange[]): void {
  clearHighlights(container);
  const merged = mergeRanges(ranges);
  if (merged.length === 0) return;

  const nodes = textNodesWithOffsets(container);
  // Collect per-text-node spans first, then wrap in reverse document order so
  // splitting earlier nodes never invalidates references we haven't used yet.
  const spans: Array<{ node: Text; localStart: number; localEnd: number; style: HighlightStyle }> = [];
  for (const { node, start: base } of nodes) {
    const nodeEnd = base + node.length;
    for (const r of merged) {
      const s = Math.max(r.start, base);
      const e = Math.min(r.end, nodeEnd);
      if (e > s) spans.push({ node, localStart: s - base, localEnd: e - base, style: styleOf(r) });
    }
  }
  for (let i = spans.length - 1; i >= 0; i--) {
    const { node, localStart, localEnd, style } = spans[i];
    try {
      const range = document.createRange();
      range.setStart(node, localStart);
      range.setEnd(node, localEnd);
      const mark = document.createElement("mark");
      mark.className = MARK;
      paintMark(mark, style);
      range.surroundContents(mark);
    } catch {
      /* skip a span that can't be cleanly wrapped */
    }
  }
}

/** If a click landed on a highlight mark, return it (for the remove popover). */
export function markFromEvent(target: EventTarget | null): HTMLElement | null {
  let el = target as HTMLElement | null;
  while (el) {
    if (el.tagName === "MARK" && el.classList.contains(MARK)) return el;
    el = el.parentElement;
  }
  return null;
}

/** Offsets (and style) covered by a specific mark element, so it can be
 * removed or recoloured in storage. */
export function offsetsOfMark(container: HTMLElement, mark: HTMLElement): HighlightRange | null {
  const range = document.createRange();
  range.selectNodeContents(mark);
  const off = rangeToOffsets(container, range);
  if (!off) return null;
  const style = (mark.dataset.hlStyle as HighlightStyle | undefined) ?? DEFAULT_HIGHLIGHT_STYLE;
  return { ...off, style };
}
