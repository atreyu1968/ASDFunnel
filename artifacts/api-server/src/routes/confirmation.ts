import { Router, type IRouter } from "express";
import { eq, and, sql } from "drizzle-orm";
import { db, subscribersTable, mailingListsTable, emailTemplatesTable } from "@workspace/db";
import { isEmailConfigured, sendTemplateEmail } from "../lib/email-service";
import crypto from "crypto";

const router: IRouter = Router();

router.get("/confirm/:token", async (req, res): Promise<void> => {
  const { token } = req.params;

  const [subscriber] = await db
    .select({
      id: subscribersTable.id,
      email: subscribersTable.email,
      status: subscribersTable.status,
      mailingListId: subscribersTable.mailingListId,
      language: subscribersTable.language,
      confirmationToken: subscribersTable.confirmationToken,
    })
    .from(subscribersTable)
    .where(eq(subscribersTable.confirmationToken, token));

  if (!subscriber) {
    res.status(404).json({ success: false, message: "Token de confirmación inválido o expirado", alreadyConfirmed: false });
    return;
  }

  if (subscriber.status === "active") {
    res.json({ success: true, message: "Tu email ya fue confirmado anteriormente", alreadyConfirmed: true });
    return;
  }

  await db
    .update(subscribersTable)
    .set({
      status: "active",
      confirmedAt: new Date(),
    })
    .where(eq(subscribersTable.id, subscriber.id));

  const { automationRulesTable, automationLogsTable } = await import("@workspace/db");
  const rules = await db
    .select()
    .from(automationRulesTable)
    .where(and(
      eq(automationRulesTable.triggerType, "new_subscriber"),
      eq(automationRulesTable.isActive, true),
    ));

  for (const rule of rules) {
    if (rule.mailingListId && rule.mailingListId !== subscriber.mailingListId) continue;

    try {
      let actionDetail = "";

      if (rule.actionType === "assign_tag" && rule.actionConfig) {
        const tag = (rule.actionConfig as any).tag || "new";
        const [sub] = await db.select({ tags: subscribersTable.tags }).from(subscribersTable).where(eq(subscribersTable.id, subscriber.id));
        const currentTags = sub?.tags ? sub.tags.split(",").map((t: string) => t.trim()) : [];
        if (!currentTags.includes(tag)) {
          currentTags.push(tag);
          await db.update(subscribersTable).set({ tags: currentTags.join(", ") }).where(eq(subscribersTable.id, subscriber.id));
        }
        actionDetail = `Tag "${tag}" auto-assigned to ${subscriber.email}`;
      } else if ((rule.actionType === "send_email" || rule.actionType === "welcome_sequence" || rule.actionType === "send_lead_magnet") && rule.emailTemplateId) {
        const emailReady = await isEmailConfigured();
        if (emailReady) {
          const result = await sendTemplateEmail(rule.emailTemplateId, subscriber.email, {
            email: subscriber.email,
            subscriber_email: subscriber.email,
            confirmation_url: "",
            unsubscribe_url: `{{unsubscribe_url}}`,
          });
          actionDetail = result.success
            ? `Email enviado a ${subscriber.email} (template #${rule.emailTemplateId})`
            : `Error enviando email: ${result.error}`;
        } else {
          actionDetail = `Email pendiente — Resend no configurado`;
        }
      } else {
        actionDetail = `Acción "${rule.actionType}" ejecutada para ${subscriber.email}`;
      }

      await db.insert(automationLogsTable).values({
        ruleId: rule.id,
        subscriberId: subscriber.id,
        status: "success",
        action: actionDetail,
        details: { trigger: "confirmation", email: subscriber.email },
      });

      await db.update(automationRulesTable).set({
        executionCount: sql`${automationRulesTable.executionCount} + 1`,
        lastExecutedAt: new Date(),
      }).where(eq(automationRulesTable.id, rule.id));
    } catch {
      // silently log failure
    }
  }

  res.json({ success: true, message: "Email confirmado exitosamente. ¡Bienvenido!", alreadyConfirmed: false });
});

router.get("/unsubscribe/:token", async (req, res): Promise<void> => {
  const { token } = req.params;

  const [subscriber] = await db
    .select({
      id: subscribersTable.id,
      email: subscribersTable.email,
      status: subscribersTable.status,
      mailingListId: subscribersTable.mailingListId,
      language: subscribersTable.language,
    })
    .from(subscribersTable)
    .where(eq(subscribersTable.confirmationToken, token));

  if (!subscriber) {
    res.status(404).json({ valid: false });
    return;
  }

  const [list] = await db
    .select({ name: mailingListsTable.name })
    .from(mailingListsTable)
    .where(eq(mailingListsTable.id, subscriber.mailingListId));

  const maskedEmail = subscriber.email.replace(/^(.{2})(.*)(@.*)$/, (_, a, b, c) => a + "*".repeat(b.length) + c);

  res.json({
    valid: true,
    email: maskedEmail,
    listName: list?.name ?? "Lista desconocida",
    language: subscriber.language,
  });
});

router.post("/unsubscribe/:token", async (req, res): Promise<void> => {
  const { token } = req.params;

  const [subscriber] = await db
    .select({
      id: subscribersTable.id,
      email: subscribersTable.email,
      status: subscribersTable.status,
      mailingListId: subscribersTable.mailingListId,
      language: subscribersTable.language,
    })
    .from(subscribersTable)
    .where(eq(subscribersTable.confirmationToken, token));

  if (!subscriber) {
    res.status(404).json({ success: false, message: "Token inválido" });
    return;
  }

  if (subscriber.status === "unsubscribed") {
    res.json({ success: true, message: "Ya te habías dado de baja anteriormente" });
    return;
  }

  await db
    .update(subscribersTable)
    .set({
      status: "unsubscribed",
      unsubscribedAt: new Date(),
    })
    .where(eq(subscribersTable.id, subscriber.id));

  const emailReady = await isEmailConfigured();
  if (emailReady) {
    const [unsubTemplate] = await db
      .select()
      .from(emailTemplatesTable)
      .where(and(
        eq(emailTemplatesTable.templateType, "unsubscribe"),
        eq(emailTemplatesTable.language, subscriber.language),
        eq(emailTemplatesTable.isActive, true),
      ));

    if (unsubTemplate) {
      await sendTemplateEmail(unsubTemplate.id, subscriber.email, {
        email: subscriber.email,
        subscriber_email: subscriber.email,
      });
    }
  }

  res.json({ success: true, message: "Te has dado de baja exitosamente. Lamentamos verte partir." });
});

export function generateToken(): string {
  return crypto.randomBytes(32).toString("hex");
}

export default router;
