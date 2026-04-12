import { Router, type IRouter } from "express";
import { eq, and, sql } from "drizzle-orm";
import { db, subscribersTable, mailingListsTable, emailTemplatesTable, booksTable } from "@workspace/db";
import { isEmailConfigured, sendTemplateEmail } from "../lib/email-service";
import { generateDownloadUrl } from "./downloads";
import { getBaseUrl } from "../lib/baseUrl";
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

  const downloadLinks: { format: string; url: string }[] = [];
  const [mailingList] = await db
    .select({ leadMagnetBookId: mailingListsTable.leadMagnetBookId })
    .from(mailingListsTable)
    .where(eq(mailingListsTable.id, subscriber.mailingListId));

  if (mailingList?.leadMagnetBookId) {
    const [book] = await db
      .select({
        id: booksTable.id,
        title: booksTable.title,
        downloadEpubPath: booksTable.downloadEpubPath,
        downloadPdfPath: booksTable.downloadPdfPath,
        downloadAzw3Path: booksTable.downloadAzw3Path,
      })
      .from(booksTable)
      .where(eq(booksTable.id, mailingList.leadMagnetBookId));

    if (book) {
      const baseUrl = getBaseUrl(req);
      if (book.downloadEpubPath) downloadLinks.push({ format: "epub", url: generateDownloadUrl(book.id, "epub", baseUrl) });
      if (book.downloadPdfPath) downloadLinks.push({ format: "pdf", url: generateDownloadUrl(book.id, "pdf", baseUrl) });
      if (book.downloadAzw3Path) downloadLinks.push({ format: "azw3", url: generateDownloadUrl(book.id, "azw3", baseUrl) });
    }
  }

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
          const templateVars: Record<string, string> = {
            email: subscriber.email,
            subscriber_email: subscriber.email,
            confirmation_url: "",
            unsubscribe_url: `{{unsubscribe_url}}`,
          };
          if (rule.actionType === "send_lead_magnet" && downloadLinks.length > 0) {
            const dlHtml = downloadLinks.map(dl =>
              `<a href="${dl.url}" style="display:inline-block;margin:5px 10px 5px 0;padding:10px 20px;background-color:#d4a017;color:#0f172a;text-decoration:none;border-radius:6px;font-weight:bold;">Descargar ${dl.format.toUpperCase()}</a>`
            ).join("\n");
            templateVars.download_links = dlHtml;
            templateVars.download_url = downloadLinks[0].url;
          }
          const result = await sendTemplateEmail(rule.emailTemplateId, subscriber.email, templateVars);
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

  res.json({
    success: true,
    message: "Email confirmado exitosamente. ¡Bienvenido!",
    alreadyConfirmed: false,
    downloadLinks: downloadLinks.length > 0 ? downloadLinks : undefined,
  });
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
