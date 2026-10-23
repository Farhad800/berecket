"use server";

import { z } from "zod";
import { headers } from "next/headers";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { run, UserError } from "@/lib/action";
import { pushEnabled, sendOne } from "@/lib/push";

const subSchema = z.object({
  endpoint: z.string().url().max(1000).refine((u) => u.startsWith("https://"), "Invalid endpoint"),
  keys: z.object({ p256dh: z.string().min(10).max(200), auth: z.string().min(8).max(100) }),
});

/** Saves this device so it receives push notifications for the signed-in employee. */
export async function savePushSubscriptionAction(sub: unknown) {
  return run(async () => {
    const me = await requireUser();
    if (!pushEnabled()) throw new UserError("Push notifications are not set up on the server yet.");
    const v = subSchema.parse(sub);
    const userAgent = (await headers()).get("user-agent")?.slice(0, 300) ?? null;
    // An endpoint belongs to one browser; if someone else signs in on it, it moves to them.
    await db.pushSubscription.upsert({
      where: { endpoint: v.endpoint },
      update: { userId: me.id, p256dh: v.keys.p256dh, auth: v.keys.auth, userAgent, failures: 0 },
      create: { userId: me.id, endpoint: v.endpoint, p256dh: v.keys.p256dh, auth: v.keys.auth, userAgent },
    });
  });
}

export async function removePushSubscriptionAction(endpoint: string) {
  return run(async () => {
    const me = await requireUser();
    await db.pushSubscription.deleteMany({ where: { endpoint: String(endpoint).slice(0, 1000), userId: me.id } });
  });
}

/** Sends a test notification to this device only. */
export async function testPushAction(endpoint: string, title: string, body: string) {
  return run(async () => {
    const me = await requireUser();
    const s = await db.pushSubscription.findFirst({ where: { endpoint: String(endpoint).slice(0, 1000), userId: me.id } });
    if (!s) throw new UserError("This device isn't registered yet. Turn notifications on first.");
    const ok = await sendOne(s, { title: String(title).slice(0, 100), body: String(body).slice(0, 200), url: "/notifications", tag: "test" });
    if (!ok) throw new UserError("The test couldn't be delivered. Turn notifications off and on again.");
  });
}
