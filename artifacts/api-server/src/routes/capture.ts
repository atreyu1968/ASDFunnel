import { Router, type IRouter } from "express";
import { eq, and, sql } from "drizzle-orm";
import { db, subscribersTable, mailingListsTable, landingPagesTable, emailTemplatesTable } from "@workspace/db";
import {
  CaptureEmailBody,
  CaptureByLandingPageBody,
  CaptureByLandingPageParams,
} from "@workspace/api-zod";
import { isEmailConfigured, sendTemplateEmail } from "../lib/email-service";
import { generateToken } from "./confirmation";
import { getBaseUrl } from "../lib/baseUrl";

const router: IRouter = Router();

async function sendConfirmationEmail(subscriberId: number, email: string, language: string, token: string, mailingListId: number, baseUrl: string): Promise<void> {
  const emailReady = await isEmailConfigured();
  if (!emailReady) return;

  const [confirmTemplate] = await db
    .select()
    .from(emailTemplatesTable)
    .where(and(
      eq(emailTemplatesTable.templateType, "confirmation"),
      eq(emailTemplatesTable.language, language),
      eq(emailTemplatesTable.isActive, true),
    ));

  if (confirmTemplate) {
    await sendTemplateEmail(confirmTemplate.id, email, {
      email,
      subscriber_email: email,
      confirmation_url: `${baseUrl}/api/confirm/${token}`,
      unsubscribe_url: `${baseUrl}/api/unsubscribe/${token}`,
    });
  }
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
    .select({ id: subscribersTable.id, status: subscribersTable.status })
    .from(subscribersTable)
    .where(and(
      eq(subscribersTable.email, parsed.data.email),
      eq(subscribersTable.mailingListId, parsed.data.mailingListId)
    ));

  if (existing) {
    res.json({ success: true, message: "Ya estás suscrito a esta lista", subscriberId: existing.id, alreadySubscribed: true, automationsTriggered: 0 });
    return;
  }

  const token = generateToken();

  const [subscriber] = await db.insert(subscribersTable).values({
    email: parsed.data.email,
    firstName: parsed.data.firstName ?? null,
    lastName: parsed.data.lastName ?? null,
    language: parsed.data.language,
    source: "capture",
    status: "pending",
    mailingListId: parsed.data.mailingListId,
    tags: parsed.data.tags ?? null,
    confirmationToken: token,
  }).returning();

  await sendConfirmationEmail(subscriber.id, parsed.data.email, parsed.data.language, token, parsed.data.mailingListId, getBaseUrl(req));

  res.json({
    success: true,
    message: "Te hemos enviado un email de confirmación. Revisa tu bandeja de entrada.",
    subscriberId: subscriber.id,
    alreadySubscribed: false,
    automationsTriggered: 0,
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
    res.json({ success: true, message: "Ya estás suscrito a esta lista", subscriberId: existing.id, alreadySubscribed: true, automationsTriggered: 0 });
    return;
  }

  const token = generateToken();

  const [subscriber] = await db.insert(subscribersTable).values({
    email: parsed.data.email,
    firstName: parsed.data.firstName ?? null,
    lastName: parsed.data.lastName ?? null,
    language: landingPage.language,
    source: "capture",
    status: "pending",
    mailingListId: landingPage.mailingListId,
    confirmationToken: token,
  }).returning();

  await sendConfirmationEmail(subscriber.id, parsed.data.email, landingPage.language, token, landingPage.mailingListId, getBaseUrl(req));

  res.json({
    success: true,
    message: "Te hemos enviado un email de confirmación. Revisa tu bandeja de entrada.",
    subscriberId: subscriber.id,
    alreadySubscribed: false,
    automationsTriggered: 0,
  });
});

export default router;
