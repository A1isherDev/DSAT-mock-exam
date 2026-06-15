import { beforeEach, describe, expect, it } from "vitest";
import { applyHighlights, clearHighlights, mergeRanges, rangeToOffsets, subtractRange } from "../highlight/offsets";

describe("mergeRanges", () => {
  it("merges overlapping and adjacent ranges, drops empties", () => {
    expect(mergeRanges([{ start: 0, end: 5 }, { start: 4, end: 8 }])).toEqual([{ start: 0, end: 8 }]);
    expect(mergeRanges([{ start: 0, end: 3 }, { start: 3, end: 6 }])).toEqual([{ start: 0, end: 6 }]);
    expect(mergeRanges([{ start: 0, end: 2 }, { start: 5, end: 7 }])).toEqual([{ start: 0, end: 2 }, { start: 5, end: 7 }]);
    expect(mergeRanges([{ start: 2, end: 2 }])).toEqual([]);
  });

  it("does NOT merge overlapping ranges of different styles", () => {
    const merged = mergeRanges([
      { start: 0, end: 5, style: "yellow" },
      { start: 4, end: 8, style: "blue" },
    ]);
    expect(merged).toHaveLength(2);
    expect(merged.map((r) => r.style)).toEqual(["yellow", "blue"]);
  });
});

describe("subtractRange", () => {
  it("splits a range around an interior hole, preserving style", () => {
    expect(subtractRange([{ start: 0, end: 10, style: "pink" }], { start: 3, end: 6 })).toEqual([
      { start: 0, end: 3, style: "pink" },
      { start: 6, end: 10, style: "pink" },
    ]);
  });
  it("leaves non-overlapping ranges untouched and removes fully-covered ones", () => {
    expect(subtractRange([{ start: 0, end: 2 }], { start: 5, end: 9 })).toEqual([{ start: 0, end: 2 }]);
    expect(subtractRange([{ start: 4, end: 6 }], { start: 0, end: 9 })).toEqual([]);
  });
});

describe("applyHighlights / clearHighlights (jsdom)", () => {
  let container: HTMLElement;
  beforeEach(() => {
    container = document.createElement("div");
    container.innerHTML = "The quick brown fox";
    document.body.appendChild(container);
  });

  it("wraps the requested character range in a mark", () => {
    applyHighlights(container, [{ start: 4, end: 9 }]); // "quick"
    const marks = container.querySelectorAll("mark.ts-highlight");
    expect(marks).toHaveLength(1);
    expect(marks[0].textContent).toBe("quick");
    expect(container.textContent).toBe("The quick brown fox"); // text preserved
  });

  it("clearHighlights restores the original text", () => {
    applyHighlights(container, [{ start: 4, end: 9 }]);
    clearHighlights(container);
    expect(container.querySelectorAll("mark.ts-highlight")).toHaveLength(0);
    expect(container.textContent).toBe("The quick brown fox");
  });

  it("re-applying is idempotent (no nested marks)", () => {
    applyHighlights(container, [{ start: 4, end: 9 }]);
    applyHighlights(container, [{ start: 4, end: 9 }]);
    expect(container.querySelectorAll("mark.ts-highlight")).toHaveLength(1);
  });

  it("rangeToOffsets round-trips a DOM Range back to offsets", () => {
    const textNode = container.firstChild as Text;
    const range = document.createRange();
    range.setStart(textNode, 4);
    range.setEnd(textNode, 9);
    expect(rangeToOffsets(container, range)).toEqual({ start: 4, end: 9 });
  });

  it("paints the mark according to its style (data attribute + colour)", () => {
    applyHighlights(container, [{ start: 4, end: 9, style: "blue" }]);
    const mark = container.querySelector("mark.ts-highlight") as HTMLElement;
    expect(mark.dataset.hlStyle).toBe("blue");
    expect(mark.style.backgroundColor).not.toBe("");
  });

  it("renders adjacent different-style ranges as separate marks", () => {
    applyHighlights(container, [
      { start: 0, end: 3, style: "yellow" },
      { start: 4, end: 9, style: "pink" },
    ]);
    expect(container.querySelectorAll("mark.ts-highlight")).toHaveLength(2);
  });
});
