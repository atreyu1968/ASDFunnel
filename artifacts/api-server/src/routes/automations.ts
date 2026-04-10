import { Router, type IRouter } from "express";
import { eq, and, desc, sql } from "drizzle-orm";
import { db, automationRulesTable, automationLogsTable, mailingListsTable, emailTemplatesTable, subscribersTable } from "@workspace/db";
import {
  ListAutomationRulesQueryParams,
  ListAutomationRulesResponse,
  ListAutomationRulesResponseItem,
  CreateAutomationRuleBody,
  GetAutomationRuleParams,
  GetAutomationRuleResponse,
  UpdateAutomationRuleBody,
  UpdateAutomationRuleParams,
  DeleteAutomationRuleParams,
  ToggleAutomationRuleParams,
  ExecuteAutomationRuleParams,
  ListAutomationLogsQueryParams,
  ListAutomationLogsResponse,
} from "@workspace/api-zod";

const router: IRouter = Router();

async function getRuleMeta(rule: { mailingListId: number | null; emailTemplateId: number | null }) {
  let mailingListName: string | null = null;
  let emailTemplateName: string | null = null;
  if (rule.mailingListId) {
    const [ml] = await db.select({ name: mailingListsTable.name }).from(mailingListsTable).where(eq(mailingListsTable.id, rule.mailingListId));
    mailingListName = ml?.name ?? null;
  }
  if (rule.emailTemplateId) {
    const [et] = await db.select({ name: emailTemplatesTable.name }).from(emailTemplatesTable).where(eq(emailTemplatesTable.id, rule.emailTemplateId));
    emailTemplateName = et?.name ?? null;
  }
  return { mailingListName, emailTemplateName };
}

router.get("/automation-rules", async (req, res): Promise<void> => {
  const query = ListAutomationRulesQueryParams.safeParse(req.query);
  if (!query.success) {
    res.status(400).json({ error: query.error.message });
    return;
  }

  const conditions = [];
  if (query.data.mailingListId) conditions.push(eq(automationRulesTable.mailingListId, query.data.mailingListId));
  if (query.data.triggerType) conditions.push(eq(automationRulesTable.triggerType, query.data.triggerType));
  if (query.data.isActive !== undefined) conditions.push(eq(automationRulesTable.isActive, query.data.isActive));

  const rules = await db
    .select()
    .from(automationRulesTable)
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(automationRulesTable.createdAt);

  const withMeta = await Promise.all(
    rules.map(async (r) => ({ ...r, ...(await getRuleMeta(r)) }))
  );

  res.json(ListAutomationRulesResponse.parse(withMeta));
});

router.post("/automation-rules", async (req, res): Promise<void> => {
  const parsed = CreateAutomationRuleBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [rule] = await db.insert(automationRulesTable).values({
    ...parsed.data,
    isActive: parsed.data.isActive ?? true,
  }).returning();

  const meta = await getRuleMeta(rule);
  res.status(201).json(ListAutomationRulesResponseItem.parse({ ...rule, ...meta }));
});

router.get("/automation-rules/:id", async (req, res): Promise<void> => {
  const params = GetAutomationRuleParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [rule] = await db.select().from(automationRulesTable).where(eq(automationRulesTable.id, params.data.id));
  if (!rule) {
    res.status(404).json({ error: "Automation rule not found" });
    return;
  }

  const meta = await getRuleMeta(rule);

  const logs = await db
    .select({
      id: automationLogsTable.id,
      ruleId: automationLogsTable.ruleId,
      subscriberId: automationLogsTable.subscriberId,
      status: automationLogsTable.status,
      action: automationLogsTable.action,
      details: automationLogsTable.details,
      executedAt: automationLogsTable.executedAt,
    })
    .from(automationLogsTable)
    .where(eq(automationLogsTable.ruleId, params.data.id))
    .orderBy(desc(automationLogsTable.executedAt))
    .limit(20);

  const logsWithMeta = await Promise.all(
    logs.map(async (l) => {
      let subscriberEmail: string | null = null;
      if (l.subscriberId) {
        const [sub] = await db.select({ email: subscribersTable.email }).from(subscribersTable).where(eq(subscribersTable.id, l.subscriberId));
        subscriberEmail = sub?.email ?? null;
      }
      return { ...l, ruleName: rule.name, subscriberEmail };
    })
  );

  res.json(GetAutomationRuleResponse.parse({ ...rule, ...meta, recentLogs: logsWithMeta }));
});

router.put("/automation-rules/:id", async (req, res): Promise<void> => {
  const params = UpdateAutomationRuleParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const parsed = UpdateAutomationRuleBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [rule] = await db.update(automationRulesTable).set({ ...parsed.data, updatedAt: new Date() }).where(eq(automationRulesTable.id, params.data.id)).returning();
  if (!rule) {
    res.status(404).json({ error: "Automation rule not found" });
    return;
  }

  const meta = await getRuleMeta(rule);
  res.json(ListAutomationRulesResponseItem.parse({ ...rule, ...meta }));
});

router.delete("/automation-rules/:id", async (req, res): Promise<void> => {
  const params = DeleteAutomationRuleParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const [rule] = await db.delete(automationRulesTable).where(eq(automationRulesTable.id, params.data.id)).returning();
  if (!rule) {
    res.status(404).json({ error: "Automation rule not found" });
    return;
  }
  res.sendStatus(204);
});

router.post("/automation-rules/:id/toggle", async (req, res): Promise<void> => {
  const params = ToggleAutomationRuleParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [existing] = await db.select().from(automationRulesTable).where(eq(automationRulesTable.id, params.data.id));
  if (!existing) {
    res.status(404).json({ error: "Automation rule not found" });
    return;
  }

  const [rule] = await db.update(automationRulesTable).set({ isActive: !existing.isActive, updatedAt: new Date() }).where(eq(automationRulesTable.id, params.data.id)).returning();

  const meta = await getRuleMeta(rule);
  res.json(ListAutomationRulesResponseItem.parse({ ...rule, ...meta }));
});

router.post("/automation-rules/:id/execute", async (req, res): Promise<void> => {
  const params = ExecuteAutomationRuleParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [rule] = await db.select().from(automationRulesTable).where(eq(automationRulesTable.id, params.data.id));
  if (!rule) {
    res.status(404).json({ error: "Automation rule not found" });
    return;
  }

  let executed = 0;
  let succeeded = 0;
  let failed = 0;
  let skipped = 0;
  const logs: any[] = [];

  if (rule.triggerType === "new_subscriber" && rule.mailingListId) {
    const subscribers = await db
      .select()
      .from(subscribersTable)
      .where(and(
        eq(subscribersTable.mailingListId, rule.mailingListId),
        eq(subscribersTable.status, "active")
      ));

    for (const sub of subscribers) {
      executed++;
      try {
        let actionDetail = "";
        if (rule.actionType === "assign_tag" && rule.actionConfig) {
          const tag = (rule.actionConfig as any).tag || "automated";
          const currentTags = sub.tags ? sub.tags.split(",").map((t: string) => t.trim()) : [];
          if (!currentTags.includes(tag)) {
            currentTags.push(tag);
            await db.update(subscribersTable).set({ tags: currentTags.join(", ") }).where(eq(subscribersTable.id, sub.id));
            actionDetail = `Tag "${tag}" assigned`;
            succeeded++;
          } else {
            actionDetail = `Tag "${tag}" already present`;
            skipped++;
          }
        } else if (rule.actionType === "send_email") {
          actionDetail = `Email queued for ${sub.email}`;
          succeeded++;
        } else if (rule.actionType === "send_lead_magnet") {
          actionDetail = `Lead magnet delivery queued for ${sub.email}`;
          succeeded++;
        } else {
          actionDetail = `Action "${rule.actionType}" executed for ${sub.email}`;
          succeeded++;
        }

        const [log] = await db.insert(automationLogsTable).values({
          ruleId: rule.id,
          subscriberId: sub.id,
          status: "success",
          action: actionDetail,
          details: { actionType: rule.actionType, email: sub.email },
        }).returning();

        logs.push({ ...log, ruleName: rule.name, subscriberEmail: sub.email });
      } catch {
        failed++;
        const [log] = await db.insert(automationLogsTable).values({
          ruleId: rule.id,
          subscriberId: sub.id,
          status: "failed",
          action: `Failed to execute ${rule.actionType}`,
        }).returning();
        logs.push({ ...log, ruleName: rule.name, subscriberEmail: sub.email });
      }
    }
  }

  await db.update(automationRulesTable).set({
    executionCount: sql`${automationRulesTable.executionCount} + 1`,
    lastExecutedAt: new Date(),
  }).where(eq(automationRulesTable.id, rule.id));

  res.json({ executed, succeeded, failed, skipped, logs });
});

router.get("/automation-logs", async (req, res): Promise<void> => {
  const query = ListAutomationLogsQueryParams.safeParse(req.query);
  if (!query.success) {
    res.status(400).json({ error: query.error.message });
    return;
  }

  const conditions = [];
  if (query.data.ruleId) conditions.push(eq(automationLogsTable.ruleId, query.data.ruleId));

  const limit = query.data.limit ?? 50;

  const logs = await db
    .select({
      id: automationLogsTable.id,
      ruleId: automationLogsTable.ruleId,
      subscriberId: automationLogsTable.subscriberId,
      status: automationLogsTable.status,
      action: automationLogsTable.action,
      details: automationLogsTable.details,
      executedAt: automationLogsTable.executedAt,
    })
    .from(automationLogsTable)
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(desc(automationLogsTable.executedAt))
    .limit(limit);

  const logsWithMeta = await Promise.all(
    logs.map(async (l) => {
      const [rule] = await db.select({ name: automationRulesTable.name }).from(automationRulesTable).where(eq(automationRulesTable.id, l.ruleId));
      let subscriberEmail: string | null = null;
      if (l.subscriberId) {
        const [sub] = await db.select({ email: subscribersTable.email }).from(subscribersTable).where(eq(subscribersTable.id, l.subscriberId));
        subscriberEmail = sub?.email ?? null;
      }
      return { ...l, ruleName: rule?.name ?? "", subscriberEmail };
    })
  );

  res.json(ListAutomationLogsResponse.parse(logsWithMeta));
});

export default router;
