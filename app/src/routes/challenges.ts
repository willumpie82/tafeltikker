import type { FastifyInstance } from "fastify";
import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import { db } from "../db/index.js";
import { challenges, challengeTables, mathAttempts, practiceSessions } from "../db/schema.js";
import { requireChildId, requireParentId } from "../auth/require.js";
import { assertOwnsChild } from "./parent.js";

type ChallengeRow = typeof challenges.$inferSelect;

// Mirrors the parent dashboard's factConfidence formula (see
// parent-dashboard-metrics.md) — duplicated rather than shared across the
// client/server boundary, same as avatarId/stickerId aren't shared either.
function factConfidence(correct: number, total: number, avgElapsedMs: number | null): number {
  const accuracy = total > 0 ? correct / total : 0;
  const speedFactor = avgElapsedMs ? Math.min(1, Math.max(0.5, 3000 / avgElapsedMs)) : 1;
  return Math.round(accuracy * speedFactor * 100);
}

async function computeTableConfidenceProgress(childId: number, tableNumbers: number[]): Promise<number> {
  if (tableNumbers.length === 0) return 0;

  const rows = await db
    .select({
      tableNumber: mathAttempts.tableNumber,
      operandB: mathAttempts.operandB,
      total: sql<number>`count(*)`,
      correct: sql<number>`sum(${mathAttempts.correct})`,
      avgElapsedMs: sql<number | null>`avg(${mathAttempts.elapsedMs})`,
    })
    .from(mathAttempts)
    .where(and(eq(mathAttempts.childId, childId), inArray(mathAttempts.tableNumber, tableNumbers)))
    .groupBy(mathAttempts.tableNumber, mathAttempts.operandB);

  const byFact = new Map(rows.map((r) => [`${r.tableNumber}x${r.operandB}`, r]));

  // Untried facts count as 0, not "skipped" — otherwise a challenge could be
  // completed by only drilling the easy facts in a table and ignoring the
  // rest.
  let sum = 0;
  let count = 0;
  for (const tableNumber of tableNumbers) {
    for (let multiplier = 1; multiplier <= 10; multiplier++) {
      const fact = byFact.get(`${tableNumber}x${multiplier}`);
      sum += fact ? factConfidence(fact.correct, fact.total, fact.avgElapsedMs) : 0;
      count++;
    }
  }
  return Math.round(sum / count);
}

async function computeTimePlayedProgressMinutes(challenge: ChallengeRow): Promise<number> {
  const modules: ("math" | "typing")[] = [];
  if (challenge.countsMath) modules.push("math");
  if (challenge.countsTyping) modules.push("typing");
  if (modules.length === 0) return 0;

  const [row] = await db
    .select({ totalSeconds: sql<number>`coalesce(sum(${practiceSessions.durationSeconds}), 0)` })
    .from(practiceSessions)
    .where(
      and(
        eq(practiceSessions.childId, challenge.childId),
        inArray(practiceSessions.module, modules),
        sql`${practiceSessions.startedAt} >= ${challenge.startedAt}`,
      ),
    );
  return Math.floor((row?.totalSeconds ?? 0) / 60);
}

async function getChallengeTableNumbers(challengeId: number): Promise<number[]> {
  const rows = await db.select({ tableNumber: challengeTables.tableNumber }).from(challengeTables).where(eq(challengeTables.challengeId, challengeId));
  return rows.map((r) => r.tableNumber).sort((a, b) => a - b);
}

/**
 * Computes current progress and, if not already completed and the target is
 * now met, stamps completedAt permanently. Safe to call repeatedly (e.g. on
 * every read) — a challenge already completed is left untouched even if
 * later progress would have dropped below target.
 */
async function evaluateChallenge(challenge: ChallengeRow): Promise<{ progress: number; target: number; completedAt: string | null; tableNumbers?: number[] }> {
  if (challenge.type === "time_played") {
    const progress = await computeTimePlayedProgressMinutes(challenge);
    const target = challenge.targetMinutes ?? 0;
    let completedAt = challenge.completedAt;
    if (!completedAt && progress >= target) {
      completedAt = new Date().toISOString();
      await db.update(challenges).set({ completedAt }).where(eq(challenges.id, challenge.id));
    }
    return { progress, target, completedAt };
  }

  const tableNumbers = await getChallengeTableNumbers(challenge.id);
  const progress = await computeTableConfidenceProgress(challenge.childId, tableNumbers);
  const target = challenge.targetConfidence ?? 0;
  let completedAt = challenge.completedAt;
  if (!completedAt && progress >= target) {
    completedAt = new Date().toISOString();
    await db.update(challenges).set({ completedAt }).where(eq(challenges.id, challenge.id));
  }
  return { progress, target, completedAt, tableNumbers };
}

/** Called after a math attempt is logged — re-evaluates this child's open table_confidence challenges. */
export async function checkTableConfidenceChallenges(childId: number): Promise<void> {
  const rows = await db
    .select()
    .from(challenges)
    .where(and(eq(challenges.childId, childId), eq(challenges.type, "table_confidence"), isNull(challenges.completedAt)));
  for (const row of rows) await evaluateChallenge(row);
}

/** Called after a practice session finishes — re-evaluates this child's open time_played challenges. */
export async function checkTimePlayedChallenges(childId: number): Promise<void> {
  const rows = await db
    .select()
    .from(challenges)
    .where(and(eq(challenges.childId, childId), eq(challenges.type, "time_played"), isNull(challenges.completedAt)));
  for (const row of rows) await evaluateChallenge(row);
}

async function listChallengesWithProgress(childId: number) {
  const rows = await db.select().from(challenges).where(eq(challenges.childId, childId));
  return Promise.all(
    rows.map(async (row) => {
      const evaluated = await evaluateChallenge(row);
      return {
        id: row.id,
        type: row.type,
        stickerId: row.stickerId,
        targetMinutes: row.targetMinutes,
        countsMath: row.countsMath,
        countsTyping: row.countsTyping,
        targetConfidence: row.targetConfidence,
        tableNumbers: evaluated.tableNumbers,
        createdAt: row.createdAt,
        startedAt: row.startedAt,
        completedAt: evaluated.completedAt,
        progress: evaluated.progress,
        target: evaluated.target,
      };
    }),
  );
}

type CreateChallengeBody = {
  type: "time_played" | "table_confidence";
  stickerId: string;
  targetMinutes?: number;
  countsMath?: boolean;
  countsTyping?: boolean;
  targetConfidence?: number;
  tableNumbers?: number[];
};

export default async function challengesRoutes(app: FastifyInstance) {
  app.get<{ Params: { id: string } }>("/api/parent/children/:id/challenges", async (request, reply) => {
    const parentId = requireParentId(request);
    if (!parentId) return reply.code(401).send({ error: "not_authenticated" });

    const childId = Number(request.params.id);
    if (!(await assertOwnsChild(parentId, childId))) return reply.code(404).send({ error: "child_not_found" });

    return listChallengesWithProgress(childId);
  });

  app.post<{ Params: { id: string }; Body: CreateChallengeBody }>("/api/parent/children/:id/challenges", async (request, reply) => {
    const parentId = requireParentId(request);
    if (!parentId) return reply.code(401).send({ error: "not_authenticated" });

    const childId = Number(request.params.id);
    if (!(await assertOwnsChild(parentId, childId))) return reply.code(404).send({ error: "child_not_found" });

    const body = request.body ?? ({} as CreateChallengeBody);
    if (!body.stickerId?.trim()) return reply.code(400).send({ error: "invalid_request" });

    if (body.type === "time_played") {
      const countsMath = Boolean(body.countsMath);
      const countsTyping = Boolean(body.countsTyping);
      if (!Number.isFinite(body.targetMinutes) || body.targetMinutes! <= 0 || (!countsMath && !countsTyping)) {
        return reply.code(400).send({ error: "invalid_request" });
      }
      const [row] = await db
        .insert(challenges)
        .values({
          childId,
          createdBy: parentId,
          type: "time_played",
          stickerId: body.stickerId,
          targetMinutes: Math.round(body.targetMinutes!),
          countsMath,
          countsTyping,
        })
        .returning();
      return { id: row.id };
    }

    if (body.type === "table_confidence") {
      const tableNumbers = Array.isArray(body.tableNumbers) ? [...new Set(body.tableNumbers)].filter((n) => Number.isInteger(n) && n >= 1 && n <= 10) : [];
      if (tableNumbers.length === 0 || !Number.isFinite(body.targetConfidence) || body.targetConfidence! <= 0 || body.targetConfidence! > 100) {
        return reply.code(400).send({ error: "invalid_request" });
      }
      const [row] = await db
        .insert(challenges)
        .values({
          childId,
          createdBy: parentId,
          type: "table_confidence",
          stickerId: body.stickerId,
          targetConfidence: Math.round(body.targetConfidence!),
        })
        .returning();
      await db.insert(challengeTables).values(tableNumbers.map((tableNumber) => ({ challengeId: row.id, tableNumber })));
      return { id: row.id };
    }

    return reply.code(400).send({ error: "invalid_request" });
  });

  app.post<{ Params: { id: string; challengeId: string } }>("/api/parent/children/:id/challenges/:challengeId/reset", async (request, reply) => {
    const parentId = requireParentId(request);
    if (!parentId) return reply.code(401).send({ error: "not_authenticated" });

    const childId = Number(request.params.id);
    if (!(await assertOwnsChild(parentId, childId))) return reply.code(404).send({ error: "child_not_found" });

    const challengeId = Number(request.params.challengeId);
    const [challenge] = await db.select().from(challenges).where(and(eq(challenges.id, challengeId), eq(challenges.childId, childId)));
    if (!challenge) return reply.code(404).send({ error: "challenge_not_found" });

    await db
      .update(challenges)
      .set({ completedAt: null, startedAt: new Date().toISOString() })
      .where(eq(challenges.id, challengeId));

    return { ok: true };
  });

  app.get("/api/child/challenges", async (request, reply) => {
    const childId = requireChildId(request);
    if (!childId) return reply.code(401).send({ error: "not_authenticated" });

    return listChallengesWithProgress(childId);
  });
}
