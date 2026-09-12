import type { FastifyInstance } from "fastify";
import { db } from "../db/index.js";
import { mathAttempts } from "../db/schema.js";
import { requireChildId } from "../auth/require.js";
import { startPracticeSession, findOwnedSession, finishPracticeSession } from "./practiceSessions.js";

export default async function mathRoutes(app: FastifyInstance) {
  app.post("/api/child/math/sessions", async (request, reply) => {
    const childId = requireChildId(request);
    if (!childId) return reply.code(401).send({ error: "not_authenticated" });

    const sessionId = await startPracticeSession(childId, "math");
    return { sessionId };
  });

  app.post<{
    Params: { id: string };
    Body: { tableNumber: number; operandA: number; operandB: number; answer: number; hintUsed: boolean; elapsedMs?: number };
  }>("/api/child/math/sessions/:id/attempts", async (request, reply) => {
    const childId = requireChildId(request);
    if (!childId) return reply.code(401).send({ error: "not_authenticated" });

    const sessionId = Number(request.params.id);
    const { tableNumber, operandA, operandB, answer, hintUsed, elapsedMs } = request.body ?? {};

    if (![tableNumber, operandA, operandB, answer].every(Number.isInteger)) {
      return reply.code(400).send({ error: "invalid_request" });
    }

    const session = await findOwnedSession(childId, sessionId);
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
      elapsedMs: Number.isFinite(elapsedMs) ? Math.round(elapsedMs!) : null,
    });

    return { correct, correctAnswer };
  });

  app.post<{ Params: { id: string } }>("/api/child/math/sessions/:id/finish", async (request, reply) => {
    const childId = requireChildId(request);
    if (!childId) return reply.code(401).send({ error: "not_authenticated" });

    const result = await finishPracticeSession(childId, Number(request.params.id));
    if (!result) return reply.code(404).send({ error: "session_not_found" });
    return result;
  });
}
