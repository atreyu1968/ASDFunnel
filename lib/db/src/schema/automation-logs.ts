import { pgTable, text, serial, integer, timestamp, jsonb } from "drizzle-orm/pg-core";
import { automationRulesTable } from "./automation-rules";
import { subscribersTable } from "./subscribers";

export const automationLogsTable = pgTable("automation_logs", {
  id: serial("id").primaryKey(),
  ruleId: integer("rule_id").notNull().references(() => automationRulesTable.id, { onDelete: "cascade" }),
  subscriberId: integer("subscriber_id").references(() => subscribersTable.id, { onDelete: "set null" }),
  status: text("status").notNull().default("success"),
  action: text("action").notNull(),
  details: jsonb("details"),
  executedAt: timestamp("executed_at").defaultNow().notNull(),
});

export type AutomationLog = typeof automationLogsTable.$inferSelect;
