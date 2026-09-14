import type { FastifyRequest } from "fastify";
import { and, eq } from "drizzle-orm";
import { db } from "../db/index.js";
import { parents, groupAdmins } from "../db/schema.js";

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

/**
 * Passes for a site-wide admin (who manages any group) or a parent with a
 * matching `group_admins` row for this specific group. This is a
 * dashboard-authenticated action — it reads `parentSession`, not any
 * group-trust cookie.
 */
export async function requireGroupAdmin(request: FastifyRequest, groupId: number): Promise<{ parentId: number } | null> {
  const parentId = requireParentId(request);
  if (!parentId) return null;

  const [parent] = await db.select({ role: parents.role }).from(parents).where(eq(parents.id, parentId));
  if (!parent) return null;
  if (parent.role === "system_admin" || parent.role === "user_admin") return { parentId };

  const [admin] = await db
    .select({ parentId: groupAdmins.parentId })
    .from(groupAdmins)
    .where(and(eq(groupAdmins.groupId, groupId), eq(groupAdmins.parentId, parentId)));
  if (!admin) return null;

  return { parentId };
}
