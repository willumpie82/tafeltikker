import Database from "better-sqlite3";
import { E2E_DB_PATH } from "./constants.js";

// Direct DB access for the handful of things that are impractical to drive
// through real wall-clock time in a test (e.g. a "played for 30 minutes"
// challenge) — bypassing the wait, not the feature under test. Everything
// else goes through the real UI.

export function getChildId(name: string): number {
  const db = new Database(E2E_DB_PATH, { readonly: true });
  try {
    const row = db.prepare("SELECT id FROM children WHERE name = ?").get(name) as { id: number } | undefined;
    if (!row) throw new Error(`No seeded child named "${name}"`);
    return row.id;
  } finally {
    db.close();
  }
}

export function getLatestSessionId(childId: number): number {
  const db = new Database(E2E_DB_PATH, { readonly: true });
  try {
    const row = db.prepare("SELECT id FROM practice_sessions WHERE child_id = ? ORDER BY id DESC LIMIT 1").get(childId) as { id: number } | undefined;
    if (!row) throw new Error(`No practice session found for child ${childId}`);
    return row.id;
  } finally {
    db.close();
  }
}

/**
 * Overwrites a (already-finished) session's stored duration, to simulate a
 * long play session without the test actually waiting that long. Must be
 * called after /finish, which otherwise overwrites duration_seconds with
 * the real (tiny) elapsed time itself.
 */
export function setSessionDurationSeconds(sessionId: number, seconds: number) {
  const db = new Database(E2E_DB_PATH);
  try {
    db.prepare("UPDATE practice_sessions SET duration_seconds = ? WHERE id = ?").run(seconds, sessionId);
  } finally {
    db.close();
  }
}
