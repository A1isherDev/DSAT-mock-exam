/* eslint-disable react-hooks/globals -- test harness exposes a re-render trigger via a module var */
import { useState, act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import SafeHtml from "../SafeHtml";

let bump: () => void;
function Parent() {
  const [tick, setTick] = useState(0);
  bump = () => setTick((t) => t + 1);
  return (
    <div data-tick={tick}>
      <SafeHtml id="sh" html="The quick brown fox jumps" />
    </div>
  );
}

describe("SafeHtml — runtime mutations survive re-renders", () => {
  let host: HTMLElement;
  beforeEach(() => {
    host = document.createElement("div");
    document.body.appendChild(host);
  });
  afterEach(() => {
    document.body.innerHTML = "";
  });

  it("does not re-apply innerHTML when html is unchanged (preserves <mark> + text nodes)", async () => {
    const root = createRoot(host);
    await act(async () => {
      root.render(<Parent />);
    });

    const el = document.getElementById("sh")!;
    expect(el.textContent).toBe("The quick brown fox jumps");

    // Simulate the highlighter mutating the DOM: wrap "quick" in a <mark>.
    const textNode = el.firstChild as Text;
    const range = document.createRange();
    range.setStart(textNode, 4);
    range.setEnd(textNode, 9);
    const mark = document.createElement("mark");
    mark.className = "ts-annot";
    range.surroundContents(mark);
    const markedNode = el.querySelector("mark.ts-annot");
    expect(markedNode?.textContent).toBe("quick");

    // A parent re-render with the SAME html must NOT wipe the injected mark.
    await act(async () => {
      bump();
    });
    expect(el.querySelector("mark.ts-annot")?.textContent).toBe("quick");

    await act(async () => {
      root.unmount();
    });
  });

  it("does update the DOM when html actually changes", async () => {
    function Switcher({ html }: { html: string }) {
      return <SafeHtml id="sh2" html={html} />;
    }
    const root = createRoot(host);
    await act(async () => {
      root.render(<Switcher html="first" />);
    });
    expect(document.getElementById("sh2")!.textContent).toBe("first");
    await act(async () => {
      root.render(<Switcher html="second" />);
    });
    expect(document.getElementById("sh2")!.textContent).toBe("second");
    await act(async () => {
      root.unmount();
    });
  });
});
