import type { Tone } from "@/components/ui";

export const JOB_TONE: Record<string, Tone> = { PLANNED: "blue", IN_PROGRESS: "purple", PAUSED: "amber", COMPLETED: "green", CANCELLED: "gray" };
export const QC_TONE: Record<string, Tone> = { PENDING: "amber", RELEASED: "blue", APPROVED: "green", PARTIAL: "amber", HOLD: "red", REJECTED: "red" };
