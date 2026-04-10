import { pgTable, text, serial, integer, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { authorsTable } from "./authors";

export const seriesTable = pgTable("series", {
  id: serial("id").primaryKey(),
  authorId: integer("author_id").notNull().references(() => authorsTable.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  description: text("description"),
  genre: text("genre"),
  status: text("status").notNull().default("planned"),
  displayOrder: integer("display_order").notNull().default(0),
  crossoverFromSeriesId: integer("crossover_from_series_id"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertSeriesSchema = createInsertSchema(seriesTable).omit({ id: true, createdAt: true });
export type InsertSeries = z.infer<typeof insertSeriesSchema>;
export type Series = typeof seriesTable.$inferSelect;
