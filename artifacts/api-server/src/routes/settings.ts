import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, emailSettingsTable } from "@workspace/db";
import {
  UpdateEmailSettingsBody,
  TestEmailSettingsBody,
} from "@workspace/api-zod";
import { sendTestEmail } from "../lib/email-service";

const router: IRouter = Router();

router.get("/settings/email", async (_req, res): Promise<void> => {
  let [settings] = await db.select().from(emailSettingsTable).limit(1);

  if (!settings) {
    [settings] = await db.insert(emailSettingsTable).values({
      provider: "resend",
      isConfigured: false,
    }).returning();
  }

  const masked = {
    ...settings,
    apiKey: settings.apiKey ? `${settings.apiKey.slice(0, 8)}${"•".repeat(20)}` : null,
    aiApiKey: settings.aiApiKey ? `${settings.aiApiKey.slice(0, 8)}${"•".repeat(20)}` : null,
    updatedAt: settings.updatedAt.toISOString(),
  };

  res.json(masked);
});

router.put("/settings/email", async (req, res): Promise<void> => {
  const parsed = UpdateEmailSettingsBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  let [existing] = await db.select().from(emailSettingsTable).limit(1);

  const updateData: Record<string, any> = {
    updatedAt: new Date(),
  };

  if (parsed.data.provider !== undefined) updateData.provider = parsed.data.provider;
  if (parsed.data.apiKey !== undefined) updateData.apiKey = parsed.data.apiKey;
  if (parsed.data.fromEmail !== undefined) updateData.fromEmail = parsed.data.fromEmail;
  if (parsed.data.fromName !== undefined) updateData.fromName = parsed.data.fromName;
  if (parsed.data.replyToEmail !== undefined) updateData.replyToEmail = parsed.data.replyToEmail;
  if (parsed.data.aiProvider !== undefined) updateData.aiProvider = parsed.data.aiProvider;
  if (parsed.data.aiApiKey !== undefined) updateData.aiApiKey = parsed.data.aiApiKey;
  if (parsed.data.aiModel !== undefined) updateData.aiModel = parsed.data.aiModel;

  const hasKey = parsed.data.apiKey ?? existing?.apiKey;
  const hasFrom = parsed.data.fromEmail ?? existing?.fromEmail;
  updateData.isConfigured = !!(hasKey && hasFrom);

  const hasAiKey = parsed.data.aiApiKey ?? existing?.aiApiKey;
  const hasAiProvider = parsed.data.aiProvider ?? existing?.aiProvider;
  updateData.aiConfigured = !!(hasAiKey && hasAiProvider);

  let settings;
  if (existing) {
    [settings] = await db.update(emailSettingsTable)
      .set(updateData)
      .where(eq(emailSettingsTable.id, existing.id))
      .returning();
  } else {
    [settings] = await db.insert(emailSettingsTable).values({
      provider: parsed.data.provider ?? "resend",
      apiKey: parsed.data.apiKey ?? null,
      fromEmail: parsed.data.fromEmail ?? null,
      fromName: parsed.data.fromName ?? null,
      replyToEmail: parsed.data.replyToEmail ?? null,
      aiProvider: parsed.data.aiProvider ?? null,
      aiApiKey: parsed.data.aiApiKey ?? null,
      aiModel: parsed.data.aiModel ?? null,
      isConfigured: !!(parsed.data.apiKey && parsed.data.fromEmail),
      aiConfigured: !!(parsed.data.aiApiKey && parsed.data.aiProvider),
    }).returning();
  }

  const masked = {
    ...settings,
    apiKey: settings.apiKey ? `${settings.apiKey.slice(0, 8)}${"•".repeat(20)}` : null,
    aiApiKey: settings.aiApiKey ? `${settings.aiApiKey.slice(0, 8)}${"•".repeat(20)}` : null,
    updatedAt: settings.updatedAt.toISOString(),
  };

  res.json(masked);
});

router.post("/settings/email/test", async (req, res): Promise<void> => {
  const parsed = TestEmailSettingsBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const result = await sendTestEmail(parsed.data.toEmail);
  res.json(result);
});

export default router;
