import type { FastifyInstance } from "fastify";
import { and, eq } from "drizzle-orm";
import { db } from "../db/index.js";
import { practiceSessions, mathAttempts } from "../db/schema.js";

function requireChild(request: { childSession: { get(key: "childId"): number | undefined } }) {
  return request.childSession.get("childId");
}

export default async function mathRoutes(app: FastifyInstance) {
  app.post("/api/child/math/sessions", async (request, reply) => {
    const childId = requireChild(request);
    if (!childId) return reply.code(401).send({ error: "not_authenticated" });

    const [session] = await db
      .insert(practiceSessions)
      .values({ childId, module: "math" })
      .returning();

    return { sessionId: session.id };
  });

  app.post<{
    Params: { id: string };
    Body: { tableNumber: number; operandA: number; operandB: number; answer: number; hintUsed: boolean };
  }>("/api/child/math/sessions/:id/attempts", async (request, reply) => {
    const childId = requireChild(request);
    if (!childId) return reply.code(401).send({ error: "not_authenticated" });

    const sessionId = Number(request.params.id);
    const { tableNumber, operandA, operandB, answer, hintUsed } = request.body ?? {};

    if (![tableNumber, operandA, operandB, answer].every(Number.isInteger)) {
      return reply.code(400).send({ error: "invalid_request" });
    }

    const [session] = await db
      .select()
      .from(practiceSessions)
      .where(and(eq(practiceSessions.id, sessionId), eq(practiceSessions.childId, childId)));

    if (!session) {
      return reply.code(404).send({ error: "session_not_found" });
    }

    const correctAnswer = operandA * operandB;
    const correct = answer === correctAnswer;

    await db.insert(mathAttempts).values({
      sessionId,
      childId,
      tableNumber,
      operandA,
      operandB,
      correct,
      hintUsed: Boolean(hintUsed),
    });

    return { correct, correctAnswer };
  });

  app.post<{ Params: { id: string } }>("/api/child/math/sessions/:id/finish", async (request, reply) => {
    const childId = requireChild(request);
    if (!childId) return reply.code(401).send({ error: "not_authenticated" });

    const sessionId = Number(request.params.id);
    const [session] = await db
      .select()
      .from(practiceSessions)
      .where(and(eq(practiceSessions.id, sessionId), eq(practiceSessions.childId, childId)));

    if (!session) {
      return reply.code(404).send({ error: "session_not_found" });
    }

    const startedAt = new Date(session.startedAt + "Z");
    const durationSeconds = Math.max(0, Math.round((Date.now() - startedAt.getTime()) / 1000));

    await db
      .update(practiceSessions)
      .set({ endedAt: new Date().toISOString(), durationSeconds })
      .where(eq(practiceSessions.id, sessionId));

    return { durationSeconds };
  });
}
