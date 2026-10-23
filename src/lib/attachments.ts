import type { Permission } from "./permissions";

/** Which records can carry files, and the permissions to view / add them. */
export const ATTACHABLE = {
  MaintenanceRequest: { view: "maintenance:view", add: ["maintenance:create", "maintenance:edit"] },
  ServiceReport: { view: "service:view", add: ["service:create", "service:edit"] },
  QcInspection: { view: "qc:view", add: ["qc:create", "qc:edit"] },
  QualityIssue: { view: "qc:view", add: ["qc:create", "qc:edit", "production:edit", "maintenance:edit"] },
} as const satisfies Record<string, { view: Permission; add: Permission[] }>;

export type AttachableType = keyof typeof ATTACHABLE;
export const isAttachable = (v: string): v is AttachableType => v in ATTACHABLE;
