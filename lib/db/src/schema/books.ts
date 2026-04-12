import { pgTable, text, serial, integer, timestamp, doublePrecision } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { seriesTable } from "./series";

export const booksTable = pgTable("books", {
  id: serial("id").primaryKey(),
  seriesId: integer("series_id").notNull().references(() => seriesTable.id, { onDelete: "cascade" }),
  bookNumber: integer("book_number").notNull(),
  title: text("title").notNull(),
  subtitle: text("subtitle"),
  description: text("description"),
  language: text("language").notNull().default("es"),
  wordCount: integer("word_count"),
  funnelRole: text("funnel_role").notNull().default("core_offer"),
  pricingStrategy: text("pricing_strategy").notNull().default("full_price"),
  price: doublePrecision("price"),
  promotionalPrice: doublePrecision("promotional_price"),
  status: text("status").notNull().default("draft"),
  publicationDate: timestamp("publication_date"),
  scheduledDate: timestamp("scheduled_date"),
  distributionChannel: text("distribution_channel"),
  asin: text("asin"),
  isbn: text("isbn"),
  books2readUrl: text("books2read_url"),
  coverImageUrl: text("cover_image_url"),
  manuscriptPath: text("manuscript_path"),
  downloadEpubPath: text("download_epub_path"),
  downloadPdfPath: text("download_pdf_path"),
  downloadAzw3Path: text("download_azw3_path"),
  crossoverToSeriesId: integer("crossover_to_series_id"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertBookSchema = createInsertSchema(booksTable).omit({ id: true, createdAt: true });
export type InsertBook = z.infer<typeof insertBookSchema>;
export type Book = typeof booksTable.$inferSelect;
