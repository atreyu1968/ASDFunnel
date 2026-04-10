import { pgTable, text, serial, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const authorsTable = pgTable("authors", {
  id: serial("id").primaryKey(),
  penName: text("pen_name").notNull(),
  realName: text("real_name"),
  bio: text("bio"),
  genreFocus: text("genre_focus"),
  brandDescription: text("brand_description"),
  domain: text("domain"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertAuthorSchema = createInsertSchema(authorsTable).omit({ id: true, createdAt: true });
export type InsertAuthor = z.infer<typeof insertAuthorSchema>;
export type Author = typeof authorsTable.$inferSelect;
