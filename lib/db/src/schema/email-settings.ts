import { pgTable, text, serial, timestamp, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const emailSettingsTable = pgTable("email_settings", {
  id: serial("id").primaryKey(),
  provider: text("provider").notNull().default("resend"),
  apiKey: text("api_key"),
  fromEmail: text("from_email"),
  fromName: text("from_name"),
  replyToEmail: text("reply_to_email"),
  isConfigured: boolean("is_configured").default(false).notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertEmailSettingsSchema = createInsertSchema(emailSettingsTable).omit({ id: true, updatedAt: true });
export type InsertEmailSettings = z.infer<typeof insertEmailSettingsSchema>;
export type EmailSettings = typeof emailSettingsTable.$inferSelect;
