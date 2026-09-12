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
