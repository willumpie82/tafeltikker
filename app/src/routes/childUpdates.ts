import { eq } from "drizzle-orm";
import { db } from "../db/index.js";
import { children } from "../db/schema.js";
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
