import { pgTable, text, serial, integer, timestamp } from "drizzle-orm/pg-core";
import { booksTable } from "./books";

export const activityTable = pgTable("activity", {
  id: serial("id").primaryKey(),
  bookId: integer("book_id").notNull().references(() => booksTable.id, { onDelete: "cascade" }),
  action: text("action").notNull(),
  timestamp: timestamp("timestamp").defaultNow().notNull(),
});

export type Activity = typeof activityTable.$inferSelect;
