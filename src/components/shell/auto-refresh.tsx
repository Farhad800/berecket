"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

/**
 * Keeps shared screens current when another employee changes data:
 * re-fetches server data every `seconds` while the tab is visible, and on focus.
 */
export default function AutoRefresh({ seconds = 30 }: { seconds?: number }) {
  const router = useRouter();
  useEffect(() => {
    const tick = () => document.visibilityState === "visible" && router.refresh();
    const id = setInterval(tick, seconds * 1000);
    addEventListener("focus", tick);
    return () => {
      clearInterval(id);
      removeEventListener("focus", tick);
    };
  }, [router, seconds]);
  return null;
}
