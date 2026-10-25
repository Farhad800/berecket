import type { Tone } from "@/components/ui";

export const ORDER_TONE: Record<string, Tone> = { OPEN: "blue", COMPLETED: "green", CANCELLED: "gray" };
export const ENTRY_QC_TONE: Record<string, Tone> = { NOT_INSPECTED: "gray", APPROVED: "green", REJECTED: "red" };
export const MAINT_TONE: Record<string, Tone> = { OPEN: "red", IN_PROGRESS: "purple", WAITING_PARTS: "amber", COMPLETED: "blue", VERIFIED: "green", CANCELLED: "gray" };
export const ISSUE_TONE: Record<string, Tone> = { OPEN: "red", IN_PROGRESS: "purple", AWAITING_VERIFICATION: "amber", RESOLVED: "green", REOPENED: "red" };
export const SEVERITY_TONE: Record<string, Tone> = { MINOR: "gray", MAJOR: "amber", CRITICAL: "red" };
export const MOVE_TONE: Record<string, Tone> = { PRODUCTION: "green", QC_REJECT: "red", OUT: "blue", ADJUST: "amber", RECEIVE: "green", USE: "gray", INPUT: "green", OUTPUT: "amber", BUY: "blue", SELL: "purple" };
export const PRIORITY_TONE = { LOW: "gray", NORMAL: "blue", HIGH: "amber", URGENT: "red" } as const;
