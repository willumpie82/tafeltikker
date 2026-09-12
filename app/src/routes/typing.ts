import type { FastifyInstance } from "fastify";
import { db } from "../db/index.js";
import { typingAttempts } from "../db/schema.js";
import { requireChildId } from "../auth/require.js";
import { startPracticeSession, findOwnedSession, finishPracticeSession } from "./practiceSessions.js";

const LEVELS = new Set(["letters", "words", "sentences"]);

// Prefers keystroke-level counts (every character actually typed, including
// ones later backspaced) when the client sends them — comparing only the
// final submitted string always reads 100% once a typo is corrected, which
// hides real mistakes. Falls back to a final-string comparison for older
// clients/rows that don't have keystroke counts.
function computeAccuracy(
  prompt: string,
  typed: string,
  totalKeystrokes?: number,
  correctKeystrokes?: number,
): number {
  if (Number.isFinite(totalKeystrokes) && totalKeystrokes! > 0) {
    return Math.round(((correctKeystrokes ?? 0) / totalKeystrokes!) * 1000) / 10;
  }

  const len = Math.max(prompt.length, typed.length) || 1;
  let correct = 0;
  for (let i = 0; i < Math.min(prompt.length, typed.length); i++) {
    if (prompt[i] === typed[i]) correct++;
  }
  return Math.round((correct / len) * 1000) / 10;
}

function computeWpm(prompt: string, elapsedMs: number): number {
  const minutes = Math.max(elapsedMs, 300) / 60000;
  const words = prompt.length / 5;
  return Math.round((words / minutes) * 10) / 10;
}

export default async function typingRoutes(app: FastifyInstance) {
  app.post("/api/child/typing/sessions", async (request, reply) => {
    const childId = requireChildId(request);
    if (!childId) return reply.code(401).send({ error: "not_authenticated" });

    const sessionId = await startPracticeSession(childId, "typing");
    return { sessionId };
  });

  app.post<{
    Params: { id: string };
    Body: {
      level: string;
      promptText: string;
      typedText: string;
      elapsedMs: number;
      totalKeystrokes?: number;
      correctKeystrokes?: number;
    };
  }>("/api/child/typing/sessions/:id/attempts", async (request, reply) => {
    const childId = requireChildId(request);
    if (!childId) return reply.code(401).send({ error: "not_authenticated" });

    const sessionId = Number(request.params.id);
    const { level, promptText, typedText, elapsedMs, totalKeystrokes, correctKeystrokes } = request.body ?? {};

    if (!LEVELS.has(level) || typeof promptText !== "string" || typeof typedText !== "string" || !Number.isFinite(elapsedMs)) {
      return reply.code(400).send({ error: "invalid_request" });
    }

    const session = await findOwnedSession(childId, sessionId);
    if (!session) {
      return reply.code(404).send({ error: "session_not_found" });
    }

    const accuracy = computeAccuracy(promptText, typedText, totalKeystrokes, correctKeystrokes);
    const wpm = computeWpm(promptText, elapsedMs);

    await db.insert(typingAttempts).values({
      sessionId,
      childId,
      level: level as "letters" | "words" | "sentences",
      promptText,
      typedText,
      wpm,
      accuracy,
    });

    return { accuracy, wpm };
  });

  app.post<{
    Params: { id: string };
    Body: { status?: "completed" | "aborted"; targetCount?: number; completedCount?: number; score?: number };
  }>("/api/child/typing/sessions/:id/finish", async (request, reply) => {
    const childId = requireChildId(request);
    if (!childId) return reply.code(401).send({ error: "not_authenticated" });

    const result = await finishPracticeSession(childId, Number(request.params.id), request.body ?? {});
    if (!result) return reply.code(404).send({ error: "session_not_found" });
    return result;
  });
}
