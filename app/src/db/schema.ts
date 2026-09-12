import { sqliteTable, text, integer, primaryKey } from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";

export const parents = sqliteTable("parents", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  username: text("username").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
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
