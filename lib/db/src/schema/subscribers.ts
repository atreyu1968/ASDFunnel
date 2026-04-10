import { pgTable, text, serial, integer, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { mailingListsTable } from "./mailing-lists";

export const subscribersTable = pgTable("subscribers", {
  id: serial("id").primaryKey(),
  email: text("email").notNull(),
  firstName: text("first_name"),
  lastName: text("last_name"),
  language: text("language").notNull().default("es"),
  source: text("source").notNull().default("manual"),
  status: text("status").notNull().default("active"),
  mailingListId: integer("mailing_list_id").notNull().references(() => mailingListsTable.id, { onDelete: "cascade" }),
  tags: text("tags"),
  subscribedAt: timestamp("subscribed_at").defaultNow().notNull(),
  unsubscribedAt: timestamp("unsubscribed_at"),
});

export const insertSubscriberSchema = createInsertSchema(subscribersTable).omit({ id: true, subscribedAt: true });
export type InsertSubscriber = z.infer<typeof insertSubscriberSchema>;
export type Subscriber = typeof subscribersTable.$inferSelect;
