import { randomBytes } from "node:crypto";
import type { FastifyInstance } from "fastify";
import { desc, eq } from "drizzle-orm";
import { db } from "../db/index.js";
import { parents, children, parentChild, feedback, parentInvites } from "../db/schema.js";
import { hashSecret, isValidPin } from "../auth/password.js";
import { requireAdmin } from "../auth/require.js";
import { applyChildUpdate, InvalidPinError, NothingToUpdateError } from "./childUpdates.js";

const PROMOTABLE_ROLES = new Set(["parent", "user_admin"]);
const DEFAULT_INVITE_EXPIRY_DAYS = 7;

/**
 * PUBLIC_BASE_URL should be set once this instance is reachable at a real
 * domain (e.g. https://tafeltikker.oldemans.nl) behind the reverse proxy —
 * otherwise invite links would embed whatever host/port the admin happened
 * to load admin.html from (fine for LAN-only use, wrong once exposed).
 */
function baseUrl(request: { protocol: string; headers: { host?: string } }): string {
  return process.env.PUBLIC_BASE_URL ?? `${request.protocol}://${request.headers.host}`;
}

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

  app.post<{ Body: { name: string; avatarId: string; pin: string; parentIds: number[] } }>(
    "/api/admin/children",
    async (request, reply) => {
      const admin = await requireAdmin(request);
      if (!admin) return reply.code(403).send({ error: "forbidden" });

      const { name, avatarId, pin, parentIds } = request.body ?? {};
      if (!name?.trim() || !avatarId || !isValidPin(String(pin ?? "")) || !Array.isArray(parentIds) || parentIds.length === 0) {
        return reply.code(400).send({ error: "invalid_request" });
      }

      const [child] = await db
        .insert(children)
        .values({ name: name.trim(), avatarId, pinHash: await hashSecret(pin) })
        .returning({ id: children.id, name: children.name, avatarId: children.avatarId });

      await db.insert(parentChild).values(parentIds.map((parentId) => ({ parentId, childId: child.id })));

      return child;
    },
  );

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

  app.post<{ Body: { expiresInDays?: number } }>("/api/admin/invites", async (request, reply) => {
    const admin = await requireAdmin(request);
    if (!admin) return reply.code(403).send({ error: "forbidden" });

    const days = request.body?.expiresInDays;
    const expiryDays = Number.isFinite(days) && days! > 0 ? days! : DEFAULT_INVITE_EXPIRY_DAYS;

    const token = randomBytes(24).toString("base64url");
    const expiresAt = new Date(Date.now() + expiryDays * 24 * 60 * 60 * 1000).toISOString();

    const [invite] = await db
      .insert(parentInvites)
      .values({ token, createdBy: admin.parentId, expiresAt })
      .returning({ token: parentInvites.token, expiresAt: parentInvites.expiresAt });

    return { ...invite, url: `${baseUrl(request)}/register.html?token=${invite.token}` };
  });

  app.get("/api/admin/invites", async (request, reply) => {
    const admin = await requireAdmin(request);
    if (!admin) return reply.code(403).send({ error: "forbidden" });

    const rows = await db
      .select({
        id: parentInvites.id,
        token: parentInvites.token,
        expiresAt: parentInvites.expiresAt,
        usedAt: parentInvites.usedAt,
        usedByUsername: parents.username,
        createdAt: parentInvites.createdAt,
      })
      .from(parentInvites)
      .leftJoin(parents, eq(parents.id, parentInvites.usedBy))
      .orderBy(desc(parentInvites.createdAt));

    const now = Date.now();
    return rows.map((row) => ({
      ...row,
      url: `${baseUrl(request)}/register.html?token=${row.token}`,
      status: row.usedAt ? "used" : new Date(row.expiresAt).getTime() < now ? "expired" : "pending",
    }));
  });
}
