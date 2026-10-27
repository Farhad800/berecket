"use client";
import { useEffect } from "react";

/** Stops the mouse wheel from changing a number box (rate, price, amount) while the page is scrolled over it. */
export default function NoWheelNumbers() {
  useEffect(() => {
    const onWheel = (e: WheelEvent) => {
      const el = document.activeElement;
      if (el instanceof HTMLInputElement && el.type === "number" && e.target === el) el.blur();
    };
    document.addEventListener("wheel", onWheel, { passive: true, capture: true });
    return () => document.removeEventListener("wheel", onWheel, { capture: true });
  }, []);
  return null;
}
