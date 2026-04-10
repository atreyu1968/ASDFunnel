import { Resend } from "resend";
import { eq } from "drizzle-orm";
import { db, emailSettingsTable, emailTemplatesTable } from "@workspace/db";

interface EmailPayload {
  to: string;
  subject: string;
  html: string;
  text?: string;
}

async function getSettings() {
  const [settings] = await db.select().from(emailSettingsTable).limit(1);
  return settings ?? null;
}

export async function isEmailConfigured(): Promise<boolean> {
  const settings = await getSettings();
  return !!(settings?.isConfigured && settings.apiKey && settings.fromEmail);
}

export async function sendEmail(payload: EmailPayload): Promise<{ success: boolean; error?: string; id?: string }> {
  const settings = await getSettings();

  if (!settings?.apiKey || !settings.fromEmail) {
    return { success: false, error: "Email no configurado. Ve a Configuración para ingresar tu API key de Resend." };
  }

  const resend = new Resend(settings.apiKey);

  try {
    const { data, error } = await resend.emails.send({
      from: settings.fromName
        ? `${settings.fromName} <${settings.fromEmail}>`
        : settings.fromEmail,
      to: payload.to,
      subject: payload.subject,
      html: payload.html,
      text: payload.text,
      replyTo: settings.replyToEmail ?? undefined,
    });

    if (error) {
      return { success: false, error: error.message };
    }

    return { success: true, id: data?.id };
  } catch (err: any) {
    return { success: false, error: err.message ?? "Error desconocido al enviar email" };
  }
}

export async function sendTemplateEmail(templateId: number, toEmail: string, variables?: Record<string, string>): Promise<{ success: boolean; error?: string; id?: string }> {
  const [template] = await db.select().from(emailTemplatesTable).where(eq(emailTemplatesTable.id, templateId));

  if (!template) {
    return { success: false, error: `Plantilla #${templateId} no encontrada` };
  }

  let html = template.bodyHtml ?? "";
  let subject = template.subject;
  let text = template.bodyText ?? undefined;

  if (variables) {
    for (const [key, value] of Object.entries(variables)) {
      const placeholder = `{{${key}}}`;
      html = html.replaceAll(placeholder, value);
      subject = subject.replaceAll(placeholder, value);
      if (text) text = text.replaceAll(placeholder, value);
    }
  }

  return sendEmail({ to: toEmail, subject, html, text });
}

export async function sendTestEmail(toEmail: string): Promise<{ success: boolean; message: string }> {
  const result = await sendEmail({
    to: toEmail,
    subject: "Lennox Hale - Email de prueba",
    html: `
      <div style="font-family: Georgia, serif; max-width: 600px; margin: 0 auto; padding: 40px 20px; background: #1a1a2e; color: #e0e0e0;">
        <h1 style="color: #d4a574; text-align: center; font-size: 24px;">Lennox Hale Publishing</h1>
        <hr style="border: 1px solid #333; margin: 20px 0;" />
        <p style="font-size: 16px; line-height: 1.6;">Este es un email de prueba desde tu panel de administración.</p>
        <p style="font-size: 16px; line-height: 1.6;">Si recibes este mensaje, tu configuración de Resend está funcionando correctamente.</p>
        <hr style="border: 1px solid #333; margin: 20px 0;" />
        <p style="font-size: 12px; color: #888; text-align: center;">Enviado desde el panel de Lennox Hale</p>
      </div>
    `,
  });

  if (result.success) {
    return { success: true, message: `Email de prueba enviado exitosamente a ${toEmail}` };
  }

  return { success: false, message: result.error ?? "Error al enviar email de prueba" };
}
