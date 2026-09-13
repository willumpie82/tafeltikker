import { eq, inArray } from "drizzle-orm";
import { db } from "../db/index.js";
import { children, parentChild, mathAttempts, typingAttempts, practiceSessions, challenges, challengeTables } from "../db/schema.js";
import { hashSecret, isValidPin } from "../auth/password.js";

export type ChildUpdateInput = { name?: string; avatarId?: string; pin?: string; aviLevel?: string };

export class InvalidPinError extends Error {}
export class NothingToUpdateError extends Error {}

/** Shared by the parent's own child editor and the admin child editor. */
export async function applyChildUpdate(childId: number, input: ChildUpdateInput) {
  const { name, avatarId, pin, aviLevel } = input;
  if (pin !== undefined && !isValidPin(pin)) {
    throw new InvalidPinError();
  }

  const updates: Partial<typeof children.$inferInsert> = {};
  if (name?.trim()) updates.name = name.trim();
  if (avatarId) updates.avatarId = avatarId;
  if (pin) updates.pinHash = await hashSecret(pin);
  if (aviLevel) updates.aviLevel = aviLevel;

  if (Object.keys(updates).length === 0) {
    throw new NothingToUpdateError();
  }

  const [child] = await db
    .update(children)
    .set(updates)
    .where(eq(children.id, childId))
    .returning({ id: children.id, name: children.name, avatarId: children.avatarId, aviLevel: children.aviLevel });

  return child;
}

/**
 * Permanently deletes a child and everything that references it — practice
 * history, challenges, and the parent link(s). Foreign keys are enforced
 * (`PRAGMA foreign_keys = ON`), so dependents must go first, in dependency
 * order, inside one transaction so a failure partway through doesn't leave
 * the child half-deleted. Shared by the parent's own child editor and the
 * admin child editor, same as applyChildUpdate.
 */
export function deleteChild(childId: number): void {
  db.transaction((tx) => {
    const childChallengeIds = tx.select({ id: challenges.id }).from(challenges).where(eq(challenges.childId, childId)).all().map((c) => c.id);
    if (childChallengeIds.length > 0) {
      tx.delete(challengeTables).where(inArray(challengeTables.challengeId, childChallengeIds)).run();
    }
    tx.delete(challenges).where(eq(challenges.childId, childId)).run();
    tx.delete(mathAttempts).where(eq(mathAttempts.childId, childId)).run();
    tx.delete(typingAttempts).where(eq(typingAttempts.childId, childId)).run();
    tx.delete(practiceSessions).where(eq(practiceSessions.childId, childId)).run();
    tx.delete(parentChild).where(eq(parentChild.childId, childId)).run();
    tx.delete(children).where(eq(children.id, childId)).run();
  });
}
