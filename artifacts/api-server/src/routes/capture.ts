import { Router, type IRouter } from "express";
import { eq, and, sql } from "drizzle-orm";
import { db, subscribersTable, mailingListsTable, authorsTable, landingPagesTable, automationRulesTable, automationLogsTable, emailTemplatesTable } from "@workspace/db";
import {
  CaptureEmailBody,
  CaptureByLandingPageBody,
  CaptureByLandingPageParams,
} from "@workspace/api-zod";

const router: IRouter = Router();

async function processAutomations(subscriberId: number, mailingListId: number, email: string): Promise<number> {
  let triggered = 0;

  const rules = await db
    .select()
    .from(automationRulesTable)
    .where(and(
      eq(automationRulesTable.triggerType, "new_subscriber"),
      eq(automationRulesTable.isActive, true),
    ));

  for (const rule of rules) {
    if (rule.mailingListId && rule.mailingListId !== mailingListId) continue;

    try {
      let actionDetail = "";

      if (rule.actionType === "assign_tag" && rule.actionConfig) {
        const tag = (rule.actionConfig as any).tag || "new";
        const [sub] = await db.select({ tags: subscribersTable.tags }).from(subscribersTable).where(eq(subscribersTable.id, subscriberId));
        const currentTags = sub?.tags ? sub.tags.split(",").map((t: string) => t.trim()) : [];
        if (!currentTags.includes(tag)) {
          currentTags.push(tag);
          await db.update(subscribersTable).set({ tags: currentTags.join(", ") }).where(eq(subscribersTable.id, subscriberId));
        }
        actionDetail = `Tag "${tag}" auto-assigned to ${email}`;
      } else if (rule.actionType === "send_email" || rule.actionType === "welcome_sequence") {
        actionDetail = `Welcome email queued for ${email}`;
      } else if (rule.actionType === "send_lead_magnet") {
        actionDetail = `Lead magnet delivery queued for ${email}`;
      } else {
        actionDetail = `Action "${rule.actionType}" triggered for ${email}`;
      }

      await db.insert(automationLogsTable).values({
        ruleId: rule.id,
        subscriberId,
        status: "success",
        action: actionDetail,
        details: { trigger: "capture", email, mailingListId },
      });

      await db.update(automationRulesTable).set({
        executionCount: sql`${automationRulesTable.executionCount} + 1`,
        lastExecutedAt: new Date(),
      }).where(eq(automationRulesTable.id, rule.id));

      triggered++;
    } catch {
      await db.insert(automationLogsTable).values({
        ruleId: rule.id,
        subscriberId,
        status: "failed",
        action: `Failed to execute ${rule.actionType} for ${email}`,
      });
    }
  }

  return triggered;
}

router.post("/capture", async (req, res): Promise<void> => {
  const parsed = CaptureEmailBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [list] = await db
    .select()
    .from(mailingListsTable)
    .where(eq(mailingListsTable.id, parsed.data.mailingListId));

  if (!list) {
    res.status(400).json({ success: false, message: "Lista de correo no encontrada", alreadySubscribed: false, automationsTriggered: 0 });
    return;
  }

  const [existing] = await db
    .select({ id: subscribersTable.id })
    .from(subscribersTable)
    .where(and(
      eq(subscribersTable.email, parsed.data.email),
      eq(subscribersTable.mailingListId, parsed.data.mailingListId)
    ));

  if (existing) {
    res.json({ success: true, message: "Ya estas suscrito a esta lista", subscriberId: existing.id, alreadySubscribed: true, automationsTriggered: 0 });
    return;
  }

  const [subscriber] = await db.insert(subscribersTable).values({
    email: parsed.data.email,
    firstName: parsed.data.firstName ?? null,
    lastName: parsed.data.lastName ?? null,
    language: parsed.data.language,
    source: "capture",
    status: "active",
    mailingListId: parsed.data.mailingListId,
    tags: parsed.data.tags ?? null,
  }).returning();

  const automationsTriggered = await processAutomations(subscriber.id, parsed.data.mailingListId, parsed.data.email);

  res.json({
    success: true,
    message: "Suscripcion exitosa",
    subscriberId: subscriber.id,
    alreadySubscribed: false,
    automationsTriggered,
  });
});

router.post("/capture/by-landing-page/:landingPageId", async (req, res): Promise<void> => {
  const params = CaptureByLandingPageParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const parsed = CaptureByLandingPageBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [landingPage] = await db
    .select()
    .from(landingPagesTable)
    .where(eq(landingPagesTable.id, params.data.landingPageId));

  if (!landingPage) {
    res.status(404).json({ success: false, message: "Landing page no encontrada", alreadySubscribed: false, automationsTriggered: 0 });
    return;
  }

  if (!landingPage.mailingListId) {
    res.status(400).json({ success: false, message: "Esta landing page no tiene una lista de correo asociada", alreadySubscribed: false, automationsTriggered: 0 });
    return;
  }

  const [existing] = await db
    .select({ id: subscribersTable.id })
    .from(subscribersTable)
    .where(and(
      eq(subscribersTable.email, parsed.data.email),
      eq(subscribersTable.mailingListId, landingPage.mailingListId)
    ));

  if (existing) {
    res.json({ success: true, message: "Ya estas suscrito a esta lista", subscriberId: existing.id, alreadySubscribed: true, automationsTriggered: 0 });
    return;
  }

  const [subscriber] = await db.insert(subscribersTable).values({
    email: parsed.data.email,
    firstName: parsed.data.firstName ?? null,
    lastName: parsed.data.lastName ?? null,
    language: landingPage.language,
    source: "capture",
    status: "active",
    mailingListId: landingPage.mailingListId,
  }).returning();

  const automationsTriggered = await processAutomations(subscriber.id, landingPage.mailingListId, parsed.data.email);

  res.json({
    success: true,
    message: "Suscripcion exitosa",
    subscriberId: subscriber.id,
    alreadySubscribed: false,
    automationsTriggered,
  });
});

export default router;
