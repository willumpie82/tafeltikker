import { sqliteTable, text, integer, real, primaryKey, index } from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";

export const parents = sqliteTable("parents", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  username: text("username").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  role: text("role", { enum: ["parent", "user_admin", "system_admin"] })
    .notNull()
    .default("parent"),
  createdAt: text("created_at").notNull().default(sql`(current_timestamp)`),
});

export const children = sqliteTable("children", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  avatarId: text("avatar_id").notNull(),
  pinHash: text("pin_hash").notNull(),
  // Which AVI (Dutch reading-level) word/sentence tier the typing module
  // draws from — not validated against a fixed list server-side, same as
  // avatarId isn't; the client-side WORD_LEVELS list in typing-content.ts
  // is authoritative. A parent assigns this, not the child.
  aviLevel: text("avi_level").notNull().default("avi_m4_e4"),
  createdAt: text("created_at").notNull().default(sql`(current_timestamp)`),
});

export const parentChild = sqliteTable(
  "parent_child",
  {
    parentId: integer("parent_id")
      .notNull()
      .references(() => parents.id),
    childId: integer("child_id")
      .notNull()
      .references(() => children.id),
  },
  (table) => [primaryKey({ columns: [table.parentId, table.childId] })],
);

export const practiceSessions = sqliteTable(
  "practice_sessions",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    childId: integer("child_id")
      .notNull()
      .references(() => children.id),
    module: text("module", { enum: ["math", "typing"] }).notNull(),
    startedAt: text("started_at").notNull().default(sql`(current_timestamp)`),
    endedAt: text("ended_at"),
    durationSeconds: integer("duration_seconds"),
    // Nullable: older sessions (before this was tracked) and any session a
    // client never called /finish on (tab closed mid-exercise) have none of
    // these set.
    status: text("status", { enum: ["completed", "aborted"] }),
    targetCount: integer("target_count"),
    completedCount: integer("completed_count"),
    score: real("score"),
  },
  (table) => [index("practice_sessions_child_idx").on(table.childId, table.startedAt)],
);

export const mathAttempts = sqliteTable(
  "math_attempts",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    sessionId: integer("session_id")
      .notNull()
      .references(() => practiceSessions.id),
    childId: integer("child_id")
      .notNull()
      .references(() => children.id),
    tableNumber: integer("table_number").notNull(),
    operandA: integer("operand_a").notNull(),
    operandB: integer("operand_b").notNull(),
    correct: integer("correct", { mode: "boolean" }).notNull(),
    hintUsed: integer("hint_used", { mode: "boolean" }).notNull().default(false),
    elapsedMs: integer("elapsed_ms"),
    // Nullable: rows logged before this was tracked have no difficulty on
    // record. Treated as "easy" (the lowest tier) wherever it matters, e.g.
    // a table-confidence challenge requiring at least "medium" — an unknown
    // difficulty shouldn't be assumed to satisfy a higher bar.
    difficulty: text("difficulty", { enum: ["easy", "medium", "hard"] }),
    answeredAt: text("answered_at").notNull().default(sql`(current_timestamp)`),
  },
  (table) => [index("math_attempts_child_idx").on(table.childId, table.answeredAt)],
);

export const typingAttempts = sqliteTable(
  "typing_attempts",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    sessionId: integer("session_id")
      .notNull()
      .references(() => practiceSessions.id),
    childId: integer("child_id")
      .notNull()
      .references(() => children.id),
    level: text("level", { enum: ["letters", "words", "sentences"] }).notNull(),
    promptText: text("prompt_text").notNull(),
    typedText: text("typed_text").notNull(),
    wpm: real("wpm").notNull(),
    accuracy: real("accuracy").notNull(),
    answeredAt: text("answered_at").notNull().default(sql`(current_timestamp)`),
  },
  (table) => [index("typing_attempts_child_idx").on(table.childId, table.answeredAt)],
);

export const feedback = sqliteTable("feedback", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  parentId: integer("parent_id")
    .notNull()
    .references(() => parents.id),
  message: text("message").notNull(),
  status: text("status", { enum: ["new", "accepted", "need_info", "planned", "fixed", "declined"] })
    .notNull()
    .default("new"),
  response: text("response"),
  createdAt: text("created_at").notNull().default(sql`(current_timestamp)`),
});

export const challenges = sqliteTable("challenges", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  childId: integer("child_id")
    .notNull()
    .references(() => children.id),
  createdBy: integer("created_by")
    .notNull()
    .references(() => parents.id),
  type: text("type", { enum: ["time_played", "table_confidence"] }).notNull(),
  stickerId: text("sticker_id").notNull(),
  // Only "private" is ever written/read in v1 — column exists so a later
  // "public" phase (gated on a family/group concept that doesn't exist
  // yet) doesn't need a migration.
  visibility: text("visibility", { enum: ["private"] })
    .notNull()
    .default("private"),
  // time_played only:
  targetMinutes: integer("target_minutes"),
  countsMath: integer("counts_math", { mode: "boolean" }),
  countsTyping: integer("counts_typing", { mode: "boolean" }),
  // table_confidence only (selected tables live in challengeTables). Null
  // (challenges created before this existed) is treated as "easy" — the
  // lowest tier, so any attempt satisfies it, same as before this field
  // existed.
  targetConfidence: integer("target_confidence"),
  requiredDifficulty: text("required_difficulty", { enum: ["easy", "medium", "hard"] }),
  createdAt: text("created_at").notNull().default(sql`(current_timestamp)`),
  // Where the counter/window begins; equals createdAt initially, reset to
  // "now" by a manual parent reset.
  startedAt: text("started_at").notNull().default(sql`(current_timestamp)`),
  // Set once, permanently — never cleared except by an explicit reset, so
  // progress dropping after completion doesn't revoke the sticker.
  completedAt: text("completed_at"),
});

export const challengeTables = sqliteTable(
  "challenge_tables",
  {
    challengeId: integer("challenge_id")
      .notNull()
      .references(() => challenges.id),
    tableNumber: integer("table_number").notNull(),
  },
  (table) => [primaryKey({ columns: [table.challengeId, table.tableNumber] })],
);

export const parentInvites = sqliteTable("parent_invites", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  token: text("token").notNull().unique(),
  createdBy: integer("created_by")
    .notNull()
    .references(() => parents.id),
  expiresAt: text("expires_at").notNull(),
  usedBy: integer("used_by").references(() => parents.id),
  usedAt: text("used_at"),
  createdAt: text("created_at").notNull().default(sql`(current_timestamp)`),
});
