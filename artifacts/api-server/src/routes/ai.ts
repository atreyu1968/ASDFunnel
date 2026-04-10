import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { eq } from "drizzle-orm";
import {
  booksTable,
  seriesTable,
  authorsTable,
  emailTemplatesTable,
  landingPagesTable,
} from "@workspace/db/schema";
import { callAi, parseJsonResponse, parseJsonArrayResponse, LANG_NAMES, AiNotConfiguredError, AiApiError } from "../lib/ai";

const router: IRouter = Router();

const VALID_TEMPLATE_TYPES = ["welcome", "lead_magnet_delivery", "new_release", "series_update", "promotional", "re_engagement", "confirmation", "unsubscribe"] as const;
const VALID_LANGUAGES = ["es", "en", "fr", "de", "pt", "it"] as const;
const VALID_CONTENT_TYPES = ["landing_page", "email_template"] as const;

function isPositiveInt(v: any): v is number {
  return typeof v === "number" && Number.isInteger(v) && v > 0;
}

function handleAiError(error: any, req: any, res: any) {
  if (error instanceof AiNotConfiguredError) {
    res.status(400).json({ error: error.message });
    return;
  }
  if (error instanceof AiApiError) {
    req.log.error({ status: error.status }, "AI API error");
    res.status(500).json({ error: `Error de la API de IA (${error.status}). Verifica tu API key y modelo en Configuración.` });
    return;
  }
  req.log.error({ err: error }, "AI generation error");
  res.status(500).json({ error: "Error al generar contenido con IA" });
}

router.post("/ai/generate-email", async (req, res): Promise<void> => {
  try {
    const bookId = Number(req.body.bookId);
    const { templateType, language } = req.body;
    if (!isPositiveInt(bookId) || !templateType || !language) {
      res.status(400).json({ error: "bookId, templateType y language son requeridos" });
      return;
    }
    if (!(VALID_TEMPLATE_TYPES as readonly string[]).includes(templateType)) {
      res.status(400).json({ error: "templateType inválido" });
      return;
    }
    if (!(VALID_LANGUAGES as readonly string[]).includes(language)) {
      res.status(400).json({ error: "language inválido" });
      return;
    }

    const [book] = await db
      .select()
      .from(booksTable)
      .innerJoin(seriesTable, eq(booksTable.seriesId, seriesTable.id))
      .innerJoin(authorsTable, eq(seriesTable.authorId, authorsTable.id))
      .where(eq(booksTable.id, bookId));

    if (!book) {
      res.status(404).json({ error: "Libro no encontrado" });
      return;
    }

    const langName = LANG_NAMES[language] || language;
    const typeDescriptions: Record<string, string> = {
      welcome: "email de bienvenida al suscribirse a la lista",
      lead_magnet_delivery: "email de entrega del lead magnet (libro gratuito)",
      new_release: "email anunciando un nuevo lanzamiento",
      series_update: "email con actualización sobre la serie",
      promotional: "email promocional con oferta especial",
      re_engagement: "email de re-engagement para suscriptores inactivos",
      confirmation: "email de confirmación de suscripción (double opt-in)",
      unsubscribe: "email de confirmación de baja",
    };

    const prompt = `Eres un experto en email marketing para thrillers psicológicos. Genera un email de tipo "${typeDescriptions[templateType] || templateType}".

Libro: "${book.books.title}"
Autor: "${book.authors.penName}"
Serie: "${book.series.name}"
Descripción: "${book.books.description || "Thriller psicológico"}"
Idioma: ${langName}

Genera en ${langName} un JSON con:
{
  "name": "Nombre interno descriptivo del template (ej: 'Bienvenida - Sloane Keller ES')",
  "subject": "Asunto del email - atractivo y con urgencia (máx 80 caracteres)",
  "bodyHtml": "Contenido HTML completo del email con estilos inline. Usa colores oscuros (#1a1a2e fondo, #e2b659 acentos dorados, #ffffff texto). Incluye header con logo/título, cuerpo con copy persuasivo, CTA con botón dorado, footer. El HTML debe ser responsive.",
  "bodyText": "Versión texto plano del email"
}

El tono debe ser misterioso, intrigante, propio de thrillers psicológicos.
Usa {{subscriber_name}} para el nombre del suscriptor y {{unsubscribe_url}} para el link de baja.
Responde SOLO con el JSON, sin markdown.`;

    const content = await callAi(prompt, { maxTokens: 3000 });
    const generated = parseJsonResponse(content);

    res.json({
      success: true,
      name: generated.name || "",
      subject: generated.subject || "",
      bodyHtml: generated.bodyHtml || "",
      bodyText: generated.bodyText || "",
    });
  } catch (error: any) {
    handleAiError(error, req, res);
  }
});

router.post("/ai/translate", async (req, res): Promise<void> => {
  try {
    const { content, fromLanguage, toLanguage, contentType } = req.body;
    if (!content || !toLanguage || !contentType) {
      res.status(400).json({ error: "content, toLanguage y contentType son requeridos" });
      return;
    }
    if (typeof content !== "object" || content === null) {
      res.status(400).json({ error: "content debe ser un objeto" });
      return;
    }
    if (!(VALID_LANGUAGES as readonly string[]).includes(toLanguage)) {
      res.status(400).json({ error: "toLanguage inválido" });
      return;
    }
    if (!(VALID_CONTENT_TYPES as readonly string[]).includes(contentType)) {
      res.status(400).json({ error: "contentType inválido" });
      return;
    }

    const fromLang = LANG_NAMES[fromLanguage] || fromLanguage || "auto-detect";
    const toLang = LANG_NAMES[toLanguage] || toLanguage;

    let fieldsDescription = "";
    if (contentType === "landing_page") {
      fieldsDescription = `Los campos son: title, description, metaTitle, metaDescription, captureHeading, captureSubheading, captureButtonText`;
    } else if (contentType === "email_template") {
      fieldsDescription = `Los campos son: name, subject, bodyHtml, bodyText. Para bodyHtml, traduce SOLO el texto visible, manteniendo TODO el HTML/CSS intacto.`;
    }

    const prompt = `Eres un traductor profesional especializado en marketing editorial de thrillers psicológicos.

Traduce el siguiente contenido de ${fromLang} a ${toLang}.
Tipo de contenido: ${contentType}
${fieldsDescription}

Contenido a traducir:
${JSON.stringify(content, null, 2)}

Mantén el mismo tono misterioso e intrigante. Adapta expresiones idiomáticas al idioma destino.
Responde SOLO con un JSON con los mismos campos traducidos.`;

    const result = await callAi(prompt, { maxTokens: 3000 });
    const translated = parseJsonResponse(result);

    res.json({ success: true, translated });
  } catch (error: any) {
    handleAiError(error, req, res);
  }
});

router.post("/ai/generate-kdp", async (req, res): Promise<void> => {
  try {
    const bookId = Number(req.body.bookId);
    if (!isPositiveInt(bookId)) {
      res.status(400).json({ error: "bookId es requerido y debe ser un número válido" });
      return;
    }

    const [book] = await db
      .select()
      .from(booksTable)
      .innerJoin(seriesTable, eq(booksTable.seriesId, seriesTable.id))
      .innerJoin(authorsTable, eq(seriesTable.authorId, authorsTable.id))
      .where(eq(booksTable.id, bookId));

    if (!book) {
      res.status(404).json({ error: "Libro no encontrado" });
      return;
    }

    const lang = book.books.language || "es";
    const langName = LANG_NAMES[lang] || lang;

    const prompt = `Eres un experto en autopublicación y marketing de thrillers psicológicos. El libro se distribuye en múltiples plataformas (Amazon, Apple Books, Kobo, Barnes & Noble, Google Play) vía Draft2Digital (D2D).

Libro: "${book.books.title}"
Subtítulo: "${book.books.subtitle || ""}"
Autor: "${book.authors.penName}"
Serie: "${book.series.name}" (#${book.books.bookNumber})
Descripción existente: "${book.books.description || ""}"
Idioma: ${langName}

Genera en ${langName} un JSON con:
{
  "amazonDescription": "Descripción completa para tiendas online (800-2000 caracteres). Compatible con Amazon, Apple Books, Kobo, etc. Usa formato simple (<b>, <i>, <br>). Incluye gancho inicial, sinopsis sin spoilers, reseñas ficticias cortas, y CTA final.",
  "backCover": "Texto de contraportada (300-500 caracteres). Sinopsis breve que enganche.",
  "tagline": "Tagline de una línea para marketing (máx 100 caracteres)",
  "keywords": ["7 keywords/frases relevantes para búsquedas en tiendas de ebooks"],
  "categories": ["3 categorías BISAC sugeridas"],
  "comparableAuthors": "Perfecto para fans de [2-3 autores comparables del género]"
}

Responde SOLO con el JSON.`;

    const content = await callAi(prompt, { maxTokens: 2000 });
    const generated = parseJsonResponse(content);

    res.json({ success: true, ...generated });
  } catch (error: any) {
    handleAiError(error, req, res);
  }
});

router.post("/ai/generate-sequence", async (req, res): Promise<void> => {
  try {
    const bookId = Number(req.body.bookId);
    const { language } = req.body;
    const emailCount = Number(req.body.emailCount) || 5;
    if (!isPositiveInt(bookId) || !language) {
      res.status(400).json({ error: "bookId y language son requeridos" });
      return;
    }
    if (!(VALID_LANGUAGES as readonly string[]).includes(language)) {
      res.status(400).json({ error: "language inválido" });
      return;
    }
    if (emailCount < 2 || emailCount > 10) {
      res.status(400).json({ error: "emailCount debe estar entre 2 y 10" });
      return;
    }

    const [book] = await db
      .select()
      .from(booksTable)
      .innerJoin(seriesTable, eq(booksTable.seriesId, seriesTable.id))
      .innerJoin(authorsTable, eq(seriesTable.authorId, authorsTable.id))
      .where(eq(booksTable.id, bookId));

    if (!book) {
      res.status(404).json({ error: "Libro no encontrado" });
      return;
    }

    const langName = LANG_NAMES[language] || language;
    const count = emailCount;

    const prompt = `Eres un experto en secuencias de email nurturing para thrillers psicológicos.

Libro: "${book.books.title}"
Autor: "${book.authors.penName}"
Serie: "${book.series.name}"
Idioma: ${langName}

Genera una secuencia de ${count} emails de nurturing post-suscripción.
La secuencia debe:
- Email 1 (Día 0): Bienvenida + entrega del lead magnet
- Email 2 (Día 2): Valor - curiosidad sobre el mundo de la serie
- Email 3 (Día 5): Historia personal del autor / behind the scenes
- Email 4 (Día 8): Social proof + extracto exclusivo
- Email 5 (Día 12): Oferta del siguiente libro de la serie

Genera en ${langName} un JSON array:
[
  {
    "day": 0,
    "name": "Nombre interno",
    "subject": "Asunto atractivo",
    "bodyHtml": "HTML completo con estilos inline (fondo #1a1a2e, acentos #e2b659, texto #fff). Responsive. Usa {{subscriber_name}} y {{unsubscribe_url}}.",
    "bodyText": "Versión texto plano",
    "templateType": "welcome|lead_magnet_delivery|series_update|promotional|re_engagement"
  }
]

Responde SOLO con el JSON array.`;

    const content = await callAi(prompt, { maxTokens: 6000, temperature: 0.8 });
    const sequence = parseJsonArrayResponse(content);

    res.json({ success: true, sequence });
  } catch (error: any) {
    handleAiError(error, req, res);
  }
});

router.post("/ai/generate-subjects", async (req, res): Promise<void> => {
  try {
    const templateId = Number(req.body.templateId);
    const count = Math.min(Math.max(Number(req.body.count) || 5, 2), 10);
    if (!isPositiveInt(templateId)) {
      res.status(400).json({ error: "templateId es requerido y debe ser un número válido" });
      return;
    }

    const [template] = await db
      .select()
      .from(emailTemplatesTable)
      .where(eq(emailTemplatesTable.id, templateId));

    if (!template) {
      res.status(404).json({ error: "Template no encontrado" });
      return;
    }

    const langName = LANG_NAMES[template.language] || template.language;
    const variants = count || 5;

    const prompt = `Eres un experto en copywriting de email para thrillers psicológicos.

Template actual:
- Nombre: "${template.name}"
- Asunto actual: "${template.subject}"
- Tipo: ${template.templateType}
- Idioma: ${langName}

Contenido del email (resumen):
${template.bodyText || template.bodyHtml?.replace(/<[^>]*>/g, "").slice(0, 500) || ""}

Genera ${variants} variantes del asunto para A/B testing.
Cada variante debe usar una técnica diferente: urgencia, curiosidad, personalización, número/dato, pregunta, etc.

Genera en ${langName} un JSON array:
[
  {
    "subject": "Variante del asunto",
    "technique": "Técnica utilizada (urgencia/curiosidad/personalización/número/pregunta/exclusividad)",
    "reasoning": "Breve explicación de por qué funciona (1 línea)"
  }
]

Responde SOLO con el JSON array.`;

    const content = await callAi(prompt, { maxTokens: 1500 });
    const subjects = parseJsonArrayResponse(content);

    res.json({ success: true, subjects });
  } catch (error: any) {
    handleAiError(error, req, res);
  }
});

router.post("/ai/generate-series-summary", async (req, res): Promise<void> => {
  try {
    const seriesId = Number(req.body.seriesId);
    if (!isPositiveInt(seriesId)) {
      res.status(400).json({ error: "seriesId es requerido y debe ser un número válido" });
      return;
    }

    const [series] = await db
      .select()
      .from(seriesTable)
      .innerJoin(authorsTable, eq(seriesTable.authorId, authorsTable.id))
      .where(eq(seriesTable.id, seriesId));

    if (!series) {
      res.status(404).json({ error: "Serie no encontrada" });
      return;
    }

    const books = await db
      .select()
      .from(booksTable)
      .where(eq(booksTable.seriesId, seriesId))
      .orderBy(booksTable.bookNumber);

    if (books.length === 0) {
      res.status(400).json({ error: "La serie no tiene libros" });
      return;
    }

    const lang = series.series.language || "es";
    const langName = LANG_NAMES[lang] || lang;

    const booksInfo = books
      .map((b) => `#${b.bookNumber} "${b.title}": ${b.description || "Sin descripción"}`)
      .join("\n");

    const prompt = `Eres un experto en marketing editorial de thrillers psicológicos.

Serie: "${series.series.name}"
Autor: "${series.authors.penName}"
Género: "${series.series.genre || "Thriller psicológico"}"
Idioma: ${langName}

Libros de la serie:
${booksInfo}

Genera en ${langName} un JSON con:
{
  "description": "Descripción completa de la serie (300-600 caracteres). Debe presentar el arco narrativo general sin spoilers, creando intriga.",
  "tagline": "Tagline de la serie (máx 100 caracteres)",
  "readingOrder": "Guía breve del orden de lectura recomendado (100-200 caracteres)",
  "audienceHook": "Frase de gancho para la audiencia objetivo (máx 120 caracteres)"
}

Responde SOLO con el JSON.`;

    const content = await callAi(prompt, { maxTokens: 1500 });
    const generated = parseJsonResponse(content);

    res.json({ success: true, ...generated });
  } catch (error: any) {
    handleAiError(error, req, res);
  }
});

export default router;
