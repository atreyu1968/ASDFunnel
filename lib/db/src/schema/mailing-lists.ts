import { pgTable, text, serial, integer, timestamp, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { authorsTable } from "./authors";
import { booksTable } from "./books";

export const mailingListsTable = pgTable("mailing_lists", {
  id: serial("id").primaryKey(),
  authorId: integer("author_id").notNull().references(() => authorsTable.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  description: text("description"),
  language: text("language").notNull().default("es"),
  leadMagnetBookId: integer("lead_magnet_book_id").references(() => booksTable.id, { onDelete: "set null" }),
  landingPageUrl: text("landing_page_url"),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertMailingListSchema = createInsertSchema(mailingListsTable).omit({ id: true, createdAt: true });
export type InsertMailingList = z.infer<typeof insertMailingListSchema>;
export type MailingList = typeof mailingListsTable.$inferSelect;
