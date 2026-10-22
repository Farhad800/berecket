"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { run } from "@/lib/action";

/** People can only mark their OWN notifications as read. */
export async function markReadAction(id?: string) {
  return run(async () => {
    const me = await requireUser();
    await db.notification.updateMany({
      where: { userId: me.id, readAt: null, ...(id ? { id } : {}) },
      data: { readAt: new Date() },
    });
    revalidatePath("/notifications");
  });
}
