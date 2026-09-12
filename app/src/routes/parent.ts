import type { FastifyInstance } from "fastify";
import { and, desc, eq, sql } from "drizzle-orm";
import { db } from "../db/index.js";
import { parents, children, parentChild, practiceSessions, mathAttempts, typingAttempts, feedback } from "../db/schema.js";
import { hashSecret, isValidPin, verifySecret } from "../auth/password.js";
import { requireParentId } from "../auth/require.js";
import { applyChildUpdate, InvalidPinError, NothingToUpdateError } from "./childUpdates.js";

async function assertOwnsChild(parentId: number, childId: number): Promise<boolean> {
  const [link] = await db
    .select()
    .from(parentChild)
    .where(and(eq(parentChild.parentId, parentId), eq(parentChild.childId, childId)));
  return Boolean(link);
}

export default async function parentRoutes(app: FastifyInstance) {
  app.post<{ Body: { username: string; password: string } }>("/api/parent/login", async (request, reply) => {
    const { username, password } = request.body ?? {};
    if (!username || !password) {
      return reply.code(400).send({ error: "invalid_request" });
    }

    const [parent] = await db.select().from(parents).where(eq(parents.username, username));
    if (!parent || !(await verifySecret(password, parent.passwordHash))) {
      return reply.code(401).send({ error: "invalid_credentials" });
    }

    request.parentSession.set("parentId", parent.id);
    return { id: parent.id, username: parent.username, role: parent.role };
  });

  app.post("/api/parent/logout", async (request) => {
    request.parentSession.delete();
    return { ok: true };
  });

  app.get("/api/parent/me", async (request, reply) => {
    const parentId = requireParentId(request);
    if (!parentId) return reply.code(401).send({ error: "not_authenticated" });

    const [parent] = await db
      .select({ id: parents.id, username: parents.username, role: parents.role })
      .from(parents)
      .where(eq(parents.id, parentId));
    if (!parent) {
      request.parentSession.delete();
      return reply.code(401).send({ error: "not_authenticated" });
    }
    return parent;
  });

  app.get("/api/parent/children", async (request, reply) => {
    const parentId = requireParentId(request);
    if (!parentId) return reply.code(401).send({ error: "not_authenticated" });

    const rows = await db
      .select({ id: children.id, name: children.name, avatarId: children.avatarId })
      .from(children)
      .innerJoin(parentChild, eq(parentChild.childId, children.id))
      .where(eq(parentChild.parentId, parentId));

    return rows;
  });

  app.post<{ Body: { name: string; avatarId: string; pin: string } }>("/api/parent/children", async (request, reply) => {
    const parentId = requireParentId(request);
    if (!parentId) return reply.code(401).send({ error: "not_authenticated" });

    const { name, avatarId, pin } = request.body ?? {};
    if (!name?.trim() || !avatarId || !isValidPin(String(pin ?? ""))) {
      return reply.code(400).send({ error: "invalid_request" });
    }

    const [child] = await db
      .insert(children)
      .values({ name: name.trim(), avatarId, pinHash: await hashSecret(pin) })
      .returning({ id: children.id, name: children.name, avatarId: children.avatarId });

    await db.insert(parentChild).values({ parentId, childId: child.id });

    return child;
  });

  app.patch<{ Params: { id: string }; Body: { name?: string; avatarId?: string; pin?: string } }>(
    "/api/parent/children/:id",
    async (request, reply) => {
      const parentId = requireParentId(request);
      if (!parentId) return reply.code(401).send({ error: "not_authenticated" });

      const childId = Number(request.params.id);
      if (!(await assertOwnsChild(parentId, childId))) {
        return reply.code(404).send({ error: "child_not_found" });
      }

      try {
        return await applyChildUpdate(childId, request.body ?? {});
      } catch (err) {
        if (err instanceof InvalidPinError) return reply.code(400).send({ error: "invalid_pin" });
        if (err instanceof NothingToUpdateError) return reply.code(400).send({ error: "nothing_to_update" });
        throw err;
      }
    },
  );

  app.get<{ Params: { id: string } }>("/api/parent/children/:id/stats", async (request, reply) => {
    const parentId = requireParentId(request);
    if (!parentId) return reply.code(401).send({ error: "not_authenticated" });

    const childId = Number(request.params.id);
    if (!(await assertOwnsChild(parentId, childId))) {
      return reply.code(404).send({ error: "child_not_found" });
    }

    const [timeRow] = await db
      .select({
        totalSeconds: sql<number>`coalesce(sum(${practiceSessions.durationSeconds}), 0)`,
        todaySeconds: sql<number>`coalesce(sum(case when date(${practiceSessions.startedAt}) = date('now') then ${practiceSessions.durationSeconds} else 0 end), 0)`,
        weekSeconds: sql<number>`coalesce(sum(case when date(${practiceSessions.startedAt}) >= date('now', '-6 days') then ${practiceSessions.durationSeconds} else 0 end), 0)`,
      })
      .from(practiceSessions)
      .where(eq(practiceSessions.childId, childId));

    const perTable = await db
      .select({
        tableNumber: mathAttempts.tableNumber,
        total: sql<number>`count(*)`,
        correct: sql<number>`sum(${mathAttempts.correct})`,
      })
      .from(mathAttempts)
      .where(eq(mathAttempts.childId, childId))
      .groupBy(mathAttempts.tableNumber)
      .orderBy(mathAttempts.tableNumber);

    const trend = await db
      .select({
        day: sql<string>`date(${mathAttempts.answeredAt})`,
        total: sql<number>`count(*)`,
        correct: sql<number>`sum(${mathAttempts.correct})`,
      })
      .from(mathAttempts)
      .where(and(eq(mathAttempts.childId, childId), sql`date(${mathAttempts.answeredAt}) >= date('now', '-6 days')`))
      .groupBy(sql`date(${mathAttempts.answeredAt})`)
      .orderBy(sql`date(${mathAttempts.answeredAt})`);

    const perTypingLevel = await db
      .select({
        level: typingAttempts.level,
        total: sql<number>`count(*)`,
        avgAccuracy: sql<number>`round(avg(${typingAttempts.accuracy}), 1)`,
        avgWpm: sql<number>`round(avg(${typingAttempts.wpm}), 1)`,
      })
      .from(typingAttempts)
      .where(eq(typingAttempts.childId, childId))
      .groupBy(typingAttempts.level);

    return {
      time: timeRow,
      perTable,
      trend,
      perTypingLevel,
    };
  });

  app.get("/api/parent/feedback", async (request, reply) => {
    const parentId = requireParentId(request);
    if (!parentId) return reply.code(401).send({ error: "not_authenticated" });

    return db
      .select({
        id: feedback.id,
        message: feedback.message,
        status: feedback.status,
        response: feedback.response,
        createdAt: feedback.createdAt,
      })
      .from(feedback)
      .where(eq(feedback.parentId, parentId))
      .orderBy(desc(feedback.createdAt));
  });

  app.post<{ Body: { message: string } }>("/api/parent/feedback", async (request, reply) => {
    const parentId = requireParentId(request);
    if (!parentId) return reply.code(401).send({ error: "not_authenticated" });

    const message = request.body?.message?.trim();
    if (!message) {
      return reply.code(400).send({ error: "invalid_request" });
    }

    const [row] = await db
      .insert(feedback)
      .values({ parentId, message })
      .returning({ id: feedback.id, message: feedback.message, createdAt: feedback.createdAt });

    return row;
  });
}
