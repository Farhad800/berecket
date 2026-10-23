"use client";

import { removePushSubscriptionAction, savePushSubscriptionAction } from "@/app/actions/push";

export type PushState = "unsupported" | "ios-install" | "denied" | "off" | "on" | "loading";

const b64ToBytes = (b64: string) => {
  const pad = "=".repeat((4 - (b64.length % 4)) % 4);
  const raw = atob((b64 + pad).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
};
const isIos = () => /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
const standalone = () => matchMedia("(display-mode: standalone)").matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;

async function registration() {
  if (!("serviceWorker" in navigator)) return null;
  await navigator.serviceWorker.register("/sw.js").catch(() => null);
  return navigator.serviceWorker.ready;
}

export async function currentState(): Promise<PushState> {
  if (typeof window === "undefined") return "loading";
  const supported = "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
  if (!supported) return isIos() && !standalone() ? "ios-install" : "unsupported";
  if (Notification.permission === "denied") return "denied";
  const reg = await registration();
  const sub = await reg?.pushManager.getSubscription();
  return sub && Notification.permission === "granted" ? "on" : "off";
}

export async function getEndpoint() {
  const reg = await registration();
  return (await reg?.pushManager.getSubscription())?.endpoint ?? null;
}

/** Asks for permission (must be called from a tap) and registers this device. */
export async function turnOn(publicKey: string): Promise<{ ok: boolean; error?: string }> {
  const perm = await Notification.requestPermission();
  if (perm !== "granted") return { ok: false, error: perm === "denied" ? "denied" : "dismissed" };
  return subscribe(publicKey);
}

export async function subscribe(publicKey: string): Promise<{ ok: boolean; error?: string }> {
  const reg = await registration();
  if (!reg) return { ok: false, error: "unsupported" };
  let sub = await reg.pushManager.getSubscription();
  // A subscription made with an old key can't receive our pushes — replace it.
  const key = sub?.options.applicationServerKey;
  if (sub && key && btoa(String.fromCharCode(...new Uint8Array(key))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "") !== publicKey) {
    await sub.unsubscribe().catch(() => {});
    sub = null;
  }
  sub ??= await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64ToBytes(publicKey) });
  const res = await savePushSubscriptionAction(sub.toJSON());
  return res.ok ? { ok: true } : { ok: false, error: res.error };
}

/** Stops notifications on this device (also used when signing out on a shared phone). */
export async function turnOff() {
  const reg = await registration();
  const sub = await reg?.pushManager.getSubscription();
  if (!sub) return;
  await removePushSubscriptionAction(sub.endpoint).catch(() => {});
  await sub.unsubscribe().catch(() => {});
}
