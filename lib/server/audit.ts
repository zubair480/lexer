import { nanoid } from "nanoid";
import type { AuditEntry } from "@/shared/contract";
import { prisma } from "@/lib/server/db";

export async function logAudit(e: {
  actor: string;
  action: string;
  targetType: string;
  targetId: string;
  note?: string;
}): Promise<void> {
  try {
    await prisma.auditLog.create({
      data: {
        id: nanoid(),
        actor: e.actor,
        action: e.action,
        targetType: e.targetType,
        targetId: e.targetId,
        note: e.note ?? null,
      },
    });
  } catch (err) {
    // Audit logging must never break the caller.
    console.error("[audit] failed to log", e.action, err);
  }
}

export async function listAudit(): Promise<AuditEntry[]> {
  const rows = await prisma.auditLog.findMany({ orderBy: { createdAt: "desc" } });
  return rows.map((r) => ({
    id: r.id,
    actor: r.actor,
    action: r.action,
    targetType: r.targetType,
    targetId: r.targetId,
    ...(r.note != null ? { note: r.note } : {}),
    createdAt: r.createdAt.toISOString(),
  }));
}
