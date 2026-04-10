import { pgTable, text, serial, integer, timestamp, boolean, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { mailingListsTable } from "./mailing-lists";
import { emailTemplatesTable } from "./email-templates";

export const automationRulesTable = pgTable("automation_rules", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  description: text("description"),
  triggerType: text("trigger_type").notNull(),
  triggerConfig: jsonb("trigger_config"),
  actionType: text("action_type").notNull(),
  actionConfig: jsonb("action_config"),
  mailingListId: integer("mailing_list_id").references(() => mailingListsTable.id, { onDelete: "set null" }),
  emailTemplateId: integer("email_template_id").references(() => emailTemplatesTable.id, { onDelete: "set null" }),
  isActive: boolean("is_active").notNull().default(true),
  executionCount: integer("execution_count").notNull().default(0),
  lastExecutedAt: timestamp("last_executed_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertAutomationRuleSchema = createInsertSchema(automationRulesTable).omit({ id: true, createdAt: true, updatedAt: true, executionCount: true, lastExecutedAt: true });
export type InsertAutomationRule = z.infer<typeof insertAutomationRuleSchema>;
export type AutomationRule = typeof automationRulesTable.$inferSelect;
