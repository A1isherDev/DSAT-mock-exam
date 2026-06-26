import type React from "react";

/**
 * Spawn a click ripple inside a `.cr-ripple` host element.
 * 1:1 with the MasterSAT mockup's `rippleExpand` effect: a currentColor disc
 * that expands from the pointer and fades out. The host must carry the
 * `cr-ripple` class (position: relative; overflow: hidden).
 */
export function spawnRipple(e: React.PointerEvent<HTMLElement> | React.MouseEvent<HTMLElement>) {
  const host = e.currentTarget as HTMLElement;
  const rect = host.getBoundingClientRect();
  const size = Math.max(rect.width, rect.height);
  const cx = "clientX" in e ? e.clientX : rect.left + rect.width / 2;
  const cy = "clientY" in e ? e.clientY : rect.top + rect.height / 2;
  const dot = document.createElement("span");
  dot.className = "cr-ripple-dot";
  dot.style.width = `${size}px`;
  dot.style.height = `${size}px`;
  dot.style.left = `${cx - rect.left}px`;
  dot.style.top = `${cy - rect.top}px`;
  dot.addEventListener("animationend", () => dot.remove());
  host.appendChild(dot);
}
