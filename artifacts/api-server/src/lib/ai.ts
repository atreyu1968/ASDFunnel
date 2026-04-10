import { db } from "@workspace/db";
import { emailSettingsTable } from "@workspace/db/schema";

export const LANG_NAMES: Record<string, string> = {
  es: "español",
  en: "English",
  fr: "français",
  de: "Deutsch",
  it: "italiano",
  pt: "português",
};

export interface AiConfig {
  provider: string;
  apiKey: string;
  model: string;
  baseUrl: string;
}

export async function getAiConfig(): Promise<AiConfig> {
  const [settings] = await db.select().from(emailSettingsTable).limit(1);
  if (!settings?.aiApiKey || !settings?.aiProvider) {
    throw new AiNotConfiguredError();
  }
  const baseUrl =
    settings.aiProvider === "deepseek"
      ? "https://api.deepseek.com"
      : settings.aiProvider === "openai"
        ? "https://api.openai.com"
        : `https://api.${settings.aiProvider}.com`;
  return {
    provider: settings.aiProvider,
    apiKey: settings.aiApiKey,
    model: settings.aiModel || "deepseek-chat",
    baseUrl,
  };
}

export class AiNotConfiguredError extends Error {
  constructor() {
    super("La configuración de IA no está configurada. Ve a Configuración para añadir tu API key.");
  }
}

export async function callAi(prompt: string, opts?: { temperature?: number; maxTokens?: number }): Promise<string> {
  const config = await getAiConfig();
  const response = await fetch(`${config.baseUrl}/v1/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${config.apiKey}`,
    },
    body: JSON.stringify({
      model: config.model,
      messages: [{ role: "user", content: prompt }],
      temperature: opts?.temperature ?? 0.7,
      max_tokens: opts?.maxTokens ?? 1500,
    }),
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new AiApiError(response.status, errText);
  }

  const result = (await response.json()) as any;
  return result.choices?.[0]?.message?.content || "";
}

export class AiApiError extends Error {
  status: number;
  constructor(status: number, body: string) {
    super(`AI API error (${status})`);
    this.status = status;
  }
}

export function parseJsonResponse(content: string): any {
  const jsonMatch = content.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error("No JSON found in AI response");
  return JSON.parse(jsonMatch[0]);
}

export function parseJsonArrayResponse(content: string): any[] {
  const jsonMatch = content.match(/\[[\s\S]*\]/);
  if (!jsonMatch) throw new Error("No JSON array found in AI response");
  return JSON.parse(jsonMatch[0]);
}
