import type { FastifyInstance } from "fastify";
import { and, desc, eq, sql } from "drizzle-orm";
import { db } from "../db/index.js";
import { parents, children, parentChild, practiceSessions, mathAttempts, typingAttempts, feedback } from "../db/schema.js";
import { hashSecret, isValidPin, verifySecret } from "../auth/password.js";
import { requireParentId } from "../auth/require.js";
import { applyChildUpdate, InvalidPinError, NothingToUpdateError } from "./childUpdates.js";

export async function assertOwnsChild(parentId: number, childId: number): Promise<boolean> {
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
      .select({ id: children.id, name: children.name, avatarId: children.avatarId, aviLevel: children.aviLevel })
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

  app.patch<{ Params: { id: string }; Body: { name?: string; avatarId?: string; pin?: string; aviLevel?: string } }>(
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

    // Per individual fact (table x multiplier) — lets the dashboard show
    // which specific facts are shaky, not just the table as a whole.
    const perFact = await db
      .select({
        tableNumber: mathAttempts.tableNumber,
        operandB: mathAttempts.operandB,
        total: sql<number>`count(*)`,
        correct: sql<number>`sum(${mathAttempts.correct})`,
        avgElapsedMs: sql<number | null>`avg(${mathAttempts.elapsedMs})`,
      })
      .from(mathAttempts)
      .where(eq(mathAttempts.childId, childId))
      .groupBy(mathAttempts.tableNumber, mathAttempts.operandB)
      .orderBy(mathAttempts.tableNumber, mathAttempts.operandB);

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

    // Per individual QWERTY letter, aggregated from every attempt at that
    // level containing it — grouping by the literal prompt text (like
    // perFact does for math facts) falls apart for Woorden/Zinnetjes:
    // a specific word only ever gets attempted a handful of times, and the
    // pool can grow arbitrarily, so a per-word bar carries too little
    // signal to mean anything. Attributing each attempt's accuracy/wpm to
    // every letter it contains gives every level the same physical-
    // keyboard view — for "Letters" this is unchanged from before, since
    // its prompt already is a single letter.
    const rawTypingAttempts = await db
      .select({
        level: typingAttempts.level,
        promptText: typingAttempts.promptText,
        accuracy: typingAttempts.accuracy,
        wpm: typingAttempts.wpm,
      })
      .from(typingAttempts)
      .where(eq(typingAttempts.childId, childId));

    const letterTotals = new Map<string, { level: string; letter: string; total: number; accuracySum: number; wpmSum: number }>();
    for (const attempt of rawTypingAttempts) {
      const letters = new Set(attempt.promptText.toLowerCase().replace(/[^a-z]/g, ""));
      for (const letter of letters) {
        const key = `${attempt.level}:${letter}`;
        const entry = letterTotals.get(key) ?? { level: attempt.level, letter, total: 0, accuracySum: 0, wpmSum: 0 };
        entry.total++;
        entry.accuracySum += attempt.accuracy;
        entry.wpmSum += attempt.wpm;
        letterTotals.set(key, entry);
      }
    }

    const perTypingLetter = [...letterTotals.values()].map((entry) => ({
      level: entry.level,
      letter: entry.letter,
      total: entry.total,
      avgAccuracy: Math.round((entry.accuracySum / entry.total) * 10) / 10,
      avgWpm: Math.round((entry.wpmSum / entry.total) * 10) / 10,
    }));

    // Last runs (either module), newest first — sessions never explicitly
    // finished (browser closed mid-exercise) have no status and are left
    // out rather than shown as a misleading "completed".
    const recentSessions = await db
      .select({
        id: practiceSessions.id,
        module: practiceSessions.module,
        status: practiceSessions.status,
        targetCount: practiceSessions.targetCount,
        completedCount: practiceSessions.completedCount,
        score: practiceSessions.score,
        startedAt: practiceSessions.startedAt,
        // A math session is played at one fixed difficulty throughout (it's
        // chosen once before starting, with no in-session switch), so any
        // one of its attempts is representative. Null for typing sessions,
        // which have no rows in math_attempts at all.
        difficulty: sql<string | null>`(select ${mathAttempts.difficulty} from ${mathAttempts} where ${mathAttempts.sessionId} = ${practiceSessions.id} limit 1)`,
      })
      .from(practiceSessions)
      .where(and(eq(practiceSessions.childId, childId), sql`${practiceSessions.status} is not null`))
      .orderBy(desc(practiceSessions.startedAt))
      .limit(10);

    return {
      time: timeRow,
      perTable,
      perFact,
      trend,
      perTypingLevel,
      perTypingLetter,
      recentSessions,
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
