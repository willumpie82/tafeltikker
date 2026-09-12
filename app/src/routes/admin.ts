import type { FastifyInstance } from "fastify";
import { desc, eq } from "drizzle-orm";
import { db } from "../db/index.js";
import { parents, children, parentChild, feedback } from "../db/schema.js";
import { hashSecret } from "../auth/password.js";
import { requireAdmin } from "../auth/require.js";
import { applyChildUpdate, InvalidPinError, NothingToUpdateError } from "./childUpdates.js";

const PROMOTABLE_ROLES = new Set(["parent", "user_admin"]);

export default async function adminRoutes(app: FastifyInstance) {
  app.get("/api/admin/parents", async (request, reply) => {
    const admin = await requireAdmin(request);
    if (!admin) return reply.code(403).send({ error: "forbidden" });

    return db
      .select({ id: parents.id, username: parents.username, role: parents.role, createdAt: parents.createdAt })
      .from(parents)
      .orderBy(parents.username);
  });

  app.patch<{ Params: { id: string }; Body: { role?: string; password?: string } }>(
    "/api/admin/parents/:id",
    async (request, reply) => {
      const admin = await requireAdmin(request);
      if (!admin) return reply.code(403).send({ error: "forbidden" });

      const targetId = Number(request.params.id);
      const { role, password } = request.body ?? {};

      const updates: Partial<typeof parents.$inferInsert> = {};

      if (role !== undefined) {
        if (admin.role !== "system_admin") {
          return reply.code(403).send({ error: "forbidden" });
        }
        if (!PROMOTABLE_ROLES.has(role)) {
          return reply.code(400).send({ error: "invalid_role" });
        }
        updates.role = role as "parent" | "user_admin";
      }

      if (password) {
        updates.passwordHash = await hashSecret(password);
      }

      if (Object.keys(updates).length === 0) {
        return reply.code(400).send({ error: "nothing_to_update" });
      }

      const [updated] = await db
        .update(parents)
        .set(updates)
        .where(eq(parents.id, targetId))
        .returning({ id: parents.id, username: parents.username, role: parents.role });

      if (!updated) return reply.code(404).send({ error: "parent_not_found" });
      return updated;
    },
  );

  app.get("/api/admin/children", async (request, reply) => {
    const admin = await requireAdmin(request);
    if (!admin) return reply.code(403).send({ error: "forbidden" });

    const rows = await db
      .select({
        id: children.id,
        name: children.name,
        avatarId: children.avatarId,
        parentUsername: parents.username,
      })
      .from(children)
      .leftJoin(parentChild, eq(parentChild.childId, children.id))
      .leftJoin(parents, eq(parents.id, parentChild.parentId))
      .orderBy(children.name);

    // Group parent usernames per child (a child can have multiple parents later).
    const byChild = new Map<number, { id: number; name: string; avatarId: string; parentUsernames: string[] }>();
    for (const row of rows) {
      const entry = byChild.get(row.id) ?? { id: row.id, name: row.name, avatarId: row.avatarId, parentUsernames: [] };
      if (row.parentUsername) entry.parentUsernames.push(row.parentUsername);
      byChild.set(row.id, entry);
    }
    return [...byChild.values()];
  });

  app.patch<{ Params: { id: string }; Body: { name?: string; avatarId?: string; pin?: string } }>(
    "/api/admin/children/:id",
    async (request, reply) => {
      const admin = await requireAdmin(request);
      if (!admin) return reply.code(403).send({ error: "forbidden" });

      const childId = Number(request.params.id);
      try {
        const child = await applyChildUpdate(childId, request.body ?? {});
        if (!child) return reply.code(404).send({ error: "child_not_found" });
        return child;
      } catch (err) {
        if (err instanceof InvalidPinError) return reply.code(400).send({ error: "invalid_pin" });
        if (err instanceof NothingToUpdateError) return reply.code(400).send({ error: "nothing_to_update" });
        throw err;
      }
    },
  );

  app.get("/api/admin/feedback", async (request, reply) => {
    const admin = await requireAdmin(request);
    if (!admin) return reply.code(403).send({ error: "forbidden" });

    return db
      .select({
        id: feedback.id,
        message: feedback.message,
        createdAt: feedback.createdAt,
        parentUsername: parents.username,
      })
      .from(feedback)
      .innerJoin(parents, eq(parents.id, feedback.parentId))
      .orderBy(desc(feedback.createdAt));
  });
}
