import type { FastifyRequest } from "fastify";
import { eq } from "drizzle-orm";
import { db } from "../db/index.js";
import { parents } from "../db/schema.js";

export function requireChildId(request: FastifyRequest): number | undefined {
  return request.childSession.get("childId");
}

export function requireParentId(request: FastifyRequest): number | undefined {
  return request.parentSession.get("parentId");
}

export type AdminRole = "user_admin" | "system_admin";

/** Loads the session's parent and confirms they hold an admin role (either tier). */
export async function requireAdmin(request: FastifyRequest): Promise<{ parentId: number; role: AdminRole } | null> {
  const parentId = requireParentId(request);
  if (!parentId) return null;

  const [parent] = await db.select({ role: parents.role }).from(parents).where(eq(parents.id, parentId));
  if (!parent || parent.role === "parent") return null;

  return { parentId, role: parent.role };
}
