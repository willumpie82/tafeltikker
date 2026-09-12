import type { FastifyInstance } from "fastify";
import { eq } from "drizzle-orm";
import { db } from "../db/index.js";
import { parents, parentInvites } from "../db/schema.js";
import { hashSecret } from "../auth/password.js";

async function findValidInvite(token: string) {
  const [invite] = await db.select().from(parentInvites).where(eq(parentInvites.token, token));
  if (!invite || invite.usedAt) return null;
  if (new Date(invite.expiresAt).getTime() < Date.now()) return null;
  return invite;
}

export default async function registerRoutes(app: FastifyInstance) {
  app.get<{ Params: { token: string } }>("/api/register/:token", async (request) => {
    const invite = await findValidInvite(request.params.token);
    return { valid: Boolean(invite) };
  });

  app.post<{ Body: { token: string; username: string; password: string } }>("/api/register", async (request, reply) => {
    const { token, username, password } = request.body ?? {};
    if (!token || !username?.trim() || !password) {
      return reply.code(400).send({ error: "invalid_request" });
    }

    const invite = await findValidInvite(token);
    if (!invite) {
      return reply.code(400).send({ error: "invalid_invite" });
    }

    const [existing] = await db.select().from(parents).where(eq(parents.username, username.trim()));
    if (existing) {
      return reply.code(409).send({ error: "username_taken" });
    }

    const [parent] = await db
      .insert(parents)
      .values({ username: username.trim(), passwordHash: await hashSecret(password), role: "parent" })
      .returning({ id: parents.id, username: parents.username, role: parents.role });

    await db
      .update(parentInvites)
      .set({ usedBy: parent.id, usedAt: new Date().toISOString() })
      .where(eq(parentInvites.id, invite.id));

    request.parentSession.set("parentId", parent.id);
    return parent;
  });
}
