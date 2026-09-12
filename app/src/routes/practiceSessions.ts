import { and, eq } from "drizzle-orm";
import { db } from "../db/index.js";
import { practiceSessions } from "../db/schema.js";

export async function startPracticeSession(childId: number, module: "math" | "typing") {
  const [session] = await db.insert(practiceSessions).values({ childId, module }).returning();
  return session.id;
}

export async function findOwnedSession(childId: number, sessionId: number) {
  const [session] = await db
    .select()
    .from(practiceSessions)
    .where(and(eq(practiceSessions.id, sessionId), eq(practiceSessions.childId, childId)));
  return session ?? null;
}

export async function finishPracticeSession(
  childId: number,
  sessionId: number,
  outcome?: {
    status?: "completed" | "aborted";
    targetCount?: number;
    completedCount?: number;
    score?: number;
  },
) {
  const session = await findOwnedSession(childId, sessionId);
  if (!session) return null;

  const startedAt = new Date(session.startedAt + "Z");
  const durationSeconds = Math.max(0, Math.round((Date.now() - startedAt.getTime()) / 1000));

  await db
    .update(practiceSessions)
    .set({
      endedAt: new Date().toISOString(),
      durationSeconds,
      status: outcome?.status,
      targetCount: outcome?.targetCount,
      completedCount: outcome?.completedCount,
      score: outcome?.score,
    })
    .where(eq(practiceSessions.id, sessionId));

  return { durationSeconds };
}
