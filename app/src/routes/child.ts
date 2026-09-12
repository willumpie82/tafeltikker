import type { FastifyInstance } from "fastify";
import { eq } from "drizzle-orm";
import { db } from "../db/index.js";
import { children } from "../db/schema.js";
import { isValidPin, verifySecret } from "../auth/password.js";

export default async function childRoutes(app: FastifyInstance) {
  app.get("/api/child/avatars", async () => {
    const rows = await db
      .select({ id: children.id, name: children.name, avatarId: children.avatarId })
      .from(children);
    return rows;
  });

  app.post<{ Body: { childId: number; pin: string } }>("/api/child/login", async (request, reply) => {
    const { childId, pin } = request.body ?? {};

    if (!Number.isInteger(childId) || !isValidPin(String(pin ?? ""))) {
      return reply.code(400).send({ error: "invalid_request" });
    }

    const [child] = await db.select().from(children).where(eq(children.id, childId));
    if (!child) {
      return reply.code(401).send({ error: "invalid_credentials" });
    }

    const ok = await verifySecret(pin, child.pinHash);
    if (!ok) {
      return reply.code(401).send({ error: "invalid_credentials" });
    }

    request.childSession.set("childId", child.id);
    return { id: child.id, name: child.name, avatarId: child.avatarId };
  });

  app.get("/api/child/me", async (request, reply) => {
    const childId = request.childSession.get("childId");
    if (!childId) {
      return reply.code(401).send({ error: "not_authenticated" });
    }

    const [child] = await db
      .select({ id: children.id, name: children.name, avatarId: children.avatarId })
      .from(children)
      .where(eq(children.id, childId));

    if (!child) {
      request.childSession.delete();
      return reply.code(401).send({ error: "not_authenticated" });
    }

    return child;
  });

  app.post("/api/child/logout", async (request) => {
    request.childSession.delete();
    return { ok: true };
  });
}
