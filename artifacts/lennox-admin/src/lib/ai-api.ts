const API_BASE = import.meta.env.BASE_URL?.replace(/\/$/, "") || "";

export async function aiGenerateEmail(bookId: number, templateType: string, language: string) {
  const res = await fetch(`${API_BASE}api/ai/generate-email`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ bookId, templateType, language }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Error al generar email");
  return data;
}

export async function aiTranslate(content: Record<string, any>, fromLanguage: string, toLanguage: string, contentType: "landing_page" | "email_template") {
  const res = await fetch(`${API_BASE}api/ai/translate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ content, fromLanguage, toLanguage, contentType }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Error al traducir");
  return data.translated;
}

export async function aiGenerateKdp(bookId: number) {
  const res = await fetch(`${API_BASE}api/ai/generate-kdp`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ bookId }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Error al generar ficha editorial");
  return data;
}

export async function aiGenerateSequence(bookId: number, language: string, emailCount?: number) {
  const res = await fetch(`${API_BASE}api/ai/generate-sequence`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ bookId, language, emailCount }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Error al generar secuencia");
  return data.sequence;
}

export async function aiGenerateSubjects(templateId: number, count?: number) {
  const res = await fetch(`${API_BASE}api/ai/generate-subjects`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ templateId, count }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Error al generar asuntos");
  return data.subjects;
}

export async function aiGenerateSeriesSummary(seriesId: number) {
  const res = await fetch(`${API_BASE}api/ai/generate-series-summary`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ seriesId }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Error al generar resumen");
  return data;
}

export async function aiProofread(params: { bookId?: number; text?: string }) {
  const res = await fetch(`${API_BASE}api/ai/proofread`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(params),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Error al corregir texto");
  return data as {
    success: boolean;
    originalLength: number;
    correctedLength: number;
    blocksProcessed: number;
    correctedText: string;
    changes: string[];
    glitches?: { block: number; type: string; description: string; original: string; fixed: string }[];
    stats?: { totalGlitches: number; criticalGlitches: number; typographicFixes: number };
  };
}

export async function aiGenerateSpinoffGuide(seriesId: number) {
  const res = await fetch(`${API_BASE}api/series/${seriesId}/generate-spinoff-guide`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Error al generar guía de spin-off");
  return data;
}
