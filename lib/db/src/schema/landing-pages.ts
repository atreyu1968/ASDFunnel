import { pgTable, text, serial, integer, timestamp, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const landingPagesTable = pgTable("landing_pages", {
  id: serial("id").primaryKey(),
  entityType: text("entity_type").notNull(),
  entityId: integer("entity_id").notNull(),
  language: text("language").notNull().default("es"),
  url: text("url").notNull(),
  title: text("title"),
  description: text("description"),
  metaTitle: text("meta_title"),
  metaDescription: text("meta_description"),
  captureHeading: text("capture_heading"),
  captureSubheading: text("capture_subheading"),
  captureButtonText: text("capture_button_text"),
  mailingListId: integer("mailing_list_id"),
  isPublished: boolean("is_published").notNull().default(false),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertLandingPageSchema = createInsertSchema(landingPagesTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertLandingPage = z.infer<typeof insertLandingPageSchema>;
export type LandingPage = typeof landingPagesTable.$inferSelect;
