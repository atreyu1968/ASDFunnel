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

    const seriesContext = await getSeriesContext(book.books.seriesId, bookId);

    const prompt = `Eres un experto en email marketing para thrillers psicológicos. Genera un email de tipo "${typeDescriptions[templateType] || templateType}".

Libro: "${book.books.title}"
Autor: "${book.authors.penName}"
Serie: "${book.series.name}" (#${book.books.bookNumber})
Descripción de la serie: "${book.series.description || ""}"
Descripción del libro: "${book.books.description || "Thriller psicológico"}"
Idioma: ${langName}
${seriesContext}

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

async function getSeriesContext(seriesId: number, currentBookId: number): Promise<string> {
  const otherBooks = await db
    .select()
    .from(booksTable)
    .where(eq(booksTable.seriesId, seriesId))
    .orderBy(booksTable.bookNumber);

  const siblings = otherBooks.filter(b => b.id !== currentBookId);
  if (siblings.length === 0) return "";

  const booksInfo = siblings
    .map(b => `  - Libro #${b.bookNumber} "${b.title}": ${b.description || "Sin descripción"}`)
    .join("\n");

  return `
CONTEXTO DE LA SERIE (libros anteriores/existentes):
${booksInfo}

IMPORTANTE: Mantén la coherencia con los libros existentes de la serie. Los personajes principales, el protagonista, el universo narrativo y el tono deben ser consistentes. Este es el libro #${otherBooks.find(b => b.id === currentBookId)?.bookNumber || "?"} de la serie, NO cambies al protagonista ni inventes personajes que contradigan los libros anteriores. El nuevo libro debe continuar o expandir las tramas existentes.`;
}

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
    const seriesContext = await getSeriesContext(book.books.seriesId, bookId);

    const prompt = `Eres un experto en autopublicación y marketing de thrillers psicológicos. El libro se distribuye en múltiples plataformas (Amazon, Apple Books, Kobo, Barnes & Noble, Google Play) vía Draft2Digital (D2D).

Libro: "${book.books.title}"
Subtítulo: "${book.books.subtitle || ""}"
Autor: "${book.authors.penName}"
Serie: "${book.series.name}" (#${book.books.bookNumber})
Descripción de la serie: "${book.series.description || ""}"
Descripción existente del libro: "${book.books.description || ""}"
Idioma: ${langName}
${seriesContext}

Genera en ${langName} un JSON con:
{
  "amazonDescription": "Descripción completa para tiendas online (800-2000 caracteres). Compatible con Amazon, Apple Books, Kobo, etc. Usa formato simple (<b>, <i>, <br>). Incluye gancho inicial, sinopsis sin spoilers, reseñas ficticias cortas, y CTA final. DEBE ser coherente con los libros anteriores de la serie.",
  "backCover": "Texto de contraportada (300-500 caracteres). Sinopsis breve que enganche y sea coherente con la serie.",
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
    const seriesContext = await getSeriesContext(book.books.seriesId, bookId);

    const prompt = `Eres un experto en secuencias de email nurturing para thrillers psicológicos.

Libro: "${book.books.title}"
Autor: "${book.authors.penName}"
Serie: "${book.series.name}" (#${book.books.bookNumber})
Descripción del libro: "${book.books.description || ""}"
Idioma: ${langName}
${seriesContext}

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

router.post("/ai/generate-spinoff-guide", async (req, res): Promise<void> => {
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

    let parentSeriesInfo = "";
    if (series.series.crossoverFromSeriesId) {
      const [parentSeries] = await db
        .select()
        .from(seriesTable)
        .where(eq(seriesTable.id, series.series.crossoverFromSeriesId));

      if (parentSeries) {
        const parentBooks = await db
          .select()
          .from(booksTable)
          .where(eq(booksTable.seriesId, parentSeries.id))
          .orderBy(booksTable.bookNumber);

        const parentBooksInfo = parentBooks
          .map((b) => `#${b.bookNumber} "${b.title}": ${b.description || "Sin descripción"}`)
          .join("\n");

        parentSeriesInfo = `
Serie original (de la que es spin-off):
  Nombre: "${parentSeries.name}"
  Género: "${parentSeries.genre || "Thriller psicológico"}"
  Descripción: "${parentSeries.description || ""}"
  Libros:
${parentBooksInfo}`;
      }
    }

    const spinoffBooks = await db
      .select()
      .from(booksTable)
      .where(eq(booksTable.seriesId, seriesId))
      .orderBy(booksTable.bookNumber);

    const spinoffBooksInfo = spinoffBooks.length > 0
      ? spinoffBooks.map((b) => `#${b.bookNumber} "${b.title}": ${b.description || "Sin descripción"}`).join("\n")
      : "Aún no tiene libros definidos";

    const lang = series.series.language || "es";
    const langName = LANG_NAMES[lang] || lang;

    const prompt = `Eres un experto en desarrollo de series de thrillers psicológicos y planificación editorial de spin-offs.

Serie spin-off: "${series.series.name}"
Autor: "${series.authors.penName}"
Género: "${series.series.genre || "Thriller psicológico"}"
Descripción: "${series.series.description || ""}"
Idioma: ${langName}
Libros del spin-off:
${spinoffBooksInfo}
${parentSeriesInfo}

Genera en ${langName} una guía completa para desarrollar este spin-off. Responde con un JSON:
{
  "connectionStrategy": "Estrategia detallada de conexión con la serie original: qué personajes, tramas o elementos del universo reutilizar y cómo. (200-400 caracteres)",
  "uniqueAngle": "Ángulo único del spin-off: qué lo diferencia de la serie original y por qué los lectores lo querrán leer. (150-300 caracteres)",
  "suggestedBooks": [
    {
      "number": 1,
      "suggestedTitle": "Título sugerido",
      "premise": "Premisa del libro (100-200 caracteres)",
      "connectionToOriginal": "Cómo se conecta con la serie original (80-150 caracteres)"
    }
  ],
  "crossPromotionIdeas": "Ideas para promoción cruzada entre la serie original y el spin-off (200-400 caracteres)",
  "timelineRecommendation": "Recomendación de cronología narrativa respecto a la serie original (100-200 caracteres)",
  "targetAudience": "Audiencia objetivo del spin-off y cómo atraer tanto lectores existentes como nuevos (150-300 caracteres)"
}

Sugiere 3-5 libros en suggestedBooks.
Responde SOLO con el JSON.`;

    const content = await callAi(prompt, { maxTokens: 2500 });
    const generated = parseJsonResponse(content);

    res.json({ success: true, ...generated });
  } catch (error: any) {
    handleAiError(error, req, res);
  }
});

router.post("/ai/proofread", async (req, res): Promise<void> => {
  try {
    const bookId = req.body.bookId ? Number(req.body.bookId) : null;
    const rawText = req.body.text as string | undefined;

    if (!bookId && !rawText) {
      res.status(400).json({ error: "Se requiere bookId (para usar el manuscrito subido) o text (texto directo)" });
      return;
    }

    let textToProofread = rawText || "";
    let authorPenName = "";
    let genre = "";
    let seriesName = "";
    let bookTitle = "";
    let language = "es";

    if (bookId) {
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

      authorPenName = book.authors.penName;
      genre = book.series.genre || "Thriller psicológico";
      seriesName = book.series.name;
      bookTitle = book.books.title;
      language = book.books.language || "es";

      if (!rawText && book.books.manuscriptPath) {
        try {
          const { ObjectStorageService } = await import("../lib/objectStorage");
          const mammoth = (await import("mammoth")).default;
          const storageService = new ObjectStorageService();
          const objectFile = await storageService.getObjectEntityFile(book.books.manuscriptPath);
          const [downloadResponse] = await objectFile.download();
          const docxBuffer = Buffer.from(downloadResponse);
          const { value: extracted } = await mammoth.extractRawText({ buffer: docxBuffer });
          textToProofread = extracted;
        } catch (storageErr: any) {
          res.status(400).json({ error: "No se pudo leer el manuscrito. Sube un documento .docx o pega el texto directamente." });
          return;
        }
      }
    }

    if (!textToProofread || textToProofread.trim().length < 50) {
      res.status(400).json({ error: "El texto es demasiado corto para corregir (mínimo 50 caracteres)" });
      return;
    }

    const langName = LANG_NAMES[language] || language;
    const BLOCK_SIZE = 6000;
    const blocks: string[] = [];
    const paragraphs = textToProofread.split(/\n\n+/);
    let currentBlock = "";

    for (const para of paragraphs) {
      if (currentBlock.length + para.length + 2 > BLOCK_SIZE && currentBlock.length > 0) {
        blocks.push(currentBlock.trim());
        currentBlock = para;
      } else {
        currentBlock += (currentBlock ? "\n\n" : "") + para;
      }
    }
    if (currentBlock.trim()) blocks.push(currentBlock.trim());

    if (blocks.length === 0) {
      res.status(400).json({ error: "No se encontró texto válido para corregir" });
      return;
    }

    const contextInfo = bookId
      ? `Libro: "${bookTitle}" | Autor: "${authorPenName}" | Serie: "${seriesName}" | Género: ${genre} | Idioma: ${langName}`
      : `Idioma: ${langName}`;

    const correctedBlocks: string[] = [];
    const changesSummary: string[] = [];
    const glitchesFound: { block: number; type: string; description: string; original: string; fixed: string }[] = [];

    for (let i = 0; i < blocks.length; i++) {
      const block = blocks[i];

      const prompt = `Eres un AUDITOR DE CALIDAD EDITORIAL FORENSE. Tu misión es detectar y corregir TODOS los defectos de un texto, especialmente los generados por IA. Eres implacable, meticuloso y NUNCA das un texto por bueno sin haberlo pasado por CADA una de las 14 fases de control. Un solo error que se te escape es un fallo profesional.

CONTEXTO: ${contextInfo}
Bloque ${i + 1} de ${blocks.length}

════════════════════════════════════════════════════════
PROTOCOLO DE AUDITORÍA — 14 FASES (ejecuta TODAS sin excepción)
════════════════════════════════════════════════════════

━━━ GRUPO A: GLITCHES ESTRUCTURALES DE IA (CRÍTICOS) ━━━

FASE 1 — SOLAPAMIENTO DE DIÁLOGO
Un parlamento que empieza con una frase, se interrumpe, y esa MISMA frase reaparece más adelante en el mismo bloque.
EJEMPLO: "Hay que seguir —Una foto borrosa [...] Hay que seguir las reglas."
→ "Hay que seguir" está al inicio y al final. La IA pegó dos versiones del mismo diálogo.
CORRECCIÓN: Eliminar la versión incompleta, dejar solo la completa.

FASE 2 — CORTE A MITAD DE FRASE
Una oración empieza, se corta con raya (—) y lo que sigue NO es la continuación lógica sino un diálogo o idea DIFERENTE.
EJEMPLO: "Si ella se entera de que estás —Sloane, esto es una trampa."
→ "Si ella se entera de que estás [¿qué?]" nunca se completa. Después del guion empieza otra idea.
CORRECCIÓN: Buscar si la frase completa existe en otro punto. Si no, reconstruirla de forma coherente.

FASE 3 — BUCLE DE ACCIÓN / DESCRIPCIÓN
Una frase descriptiva o de acción se repite textualmente (o casi) en el mismo párrafo o en párrafos contiguos.
EJEMPLO: "Un fragmento óseo, Jaren se frotó la frente [...] Un fragmento óseo, un metal forzado..."
→ "Un fragmento óseo" aparece DOS veces porque la IA regeneró el mismo pasaje.
CORRECCIÓN: Fusionar ambas apariciones en una sola, conservando el contenido más completo.

FASE 4 — PÁRRAFOS CLONADOS
Dos o más párrafos (2+ oraciones) con contenido idéntico o casi idéntico en distintas partes del texto.
CORRECCIÓN: Eliminar los duplicados, conservando la versión más pulida.

FASE 5 — CAMBIO BRUSCO DE PERSPECTIVA / VOZ NARRATIVA
El texto pasa sin transición de 3ª persona a 1ª, o de narrador omnisciente a limitado, o cambia de personaje POV sin marca.
EJEMPLO: "Sloane observó la puerta. Yo sabía que era una trampa."
CORRECCIÓN: Unificar la voz narrativa manteniendo la dominante.

FASE 6 — RUPTURA DE CONTINUIDAD TEMPORAL
Acciones que ocurren en orden ilógico: un personaje reacciona ANTES de que ocurra el estímulo, o una escena nocturna pasa a ser diurna sin transición.
EJEMPLO: "Sloane respondió al disparo. Entonces sonó el disparo."
CORRECCIÓN: Reordenar las acciones en secuencia lógica.

FASE 7 — PERSONAJE FANTASMA / TELETRANSPORTADO
Un personaje que se fue de la escena reaparece hablando o actuando sin haber vuelto. O un personaje presente desaparece sin explicación.
EJEMPLO: "Jaren salió del despacho. [...] —Es una trampa —dijo Jaren, cruzado de brazos junto a la ventana."
CORRECCIÓN: Añadir transición mínima o eliminar la contradicción.

━━━ GRUPO B: DEFECTOS DE LENGUAJE DE IA (MEDIOS) ━━━

FASE 8 — MULETILLAS Y FÓRMULAS REPETITIVAS
Frases que la IA usa obsesivamente: "un escalofrío recorrió su espalda", "el silencio era ensordecedor", "algo se rompió dentro de ella", "no pudo evitar pensar", "una sonrisa que no alcanzaba sus ojos", "la tensión se podía cortar con un cuchillo", "sus nudillos se pusieron blancos", "el corazón le latía con fuerza". Busca CUALQUIER expresión cliché que aparezca más de una vez en el bloque.
CORRECCIÓN: Sustituir por descripciones más originales que preserven el tono del autor.

FASE 9 — SOBRE-EXPLICACIÓN EMOCIONAL
El texto MUESTRA una emoción con acción y luego la EXPLICA redundantemente.
EJEMPLO: "Apretó los puños. Estaba furioso." → "Apretó los puños" ya implica furia.
CORRECCIÓN: Eliminar la explicación redundante, dejar solo la acción.

FASE 10 — TRANSICIONES ARTIFICIALES
Frases de conexión forzadas que suenan a resumen o a narrador de documental.
EJEMPLO: "Lo que no sabía era que...", "Poco podía imaginar que...", "Sin saberlo, acababa de..."
CORRECCIÓN: Reformular con técnica narrativa (mostrar, no decir).

FASE 11 — DIÁLOGOS INFORMATIVOS ANTINATURALES
Personajes que se explican cosas que ambos ya saben, solo para informar al lector.
EJEMPLO: "—Como sabes, llevamos tres años en este caso y tu padre era el fiscal general."
CORRECCIÓN: Reformular para que el diálogo sea natural (o convertir en narración).

━━━ GRUPO C: CORRECCIÓN TÉCNICA EDITORIAL ━━━

FASE 12 — ORTOTIPOGRAFÍA RAE (${langName})
- Acentuación, concordancia género/número, tiempos verbales
- Puntuación correcta (comas, puntos, punto y coma)
- Uso correcto de mayúsculas
- Signos de apertura (¿ ¡) siempre presentes

FASE 13 — FORMATO DE DIÁLOGOS LITERARIOS
- Raya (—) para abrir diálogo, NUNCA guion corto (-) ni comillas
- Incisos del narrador: —texto —dijo Nombre— continuación.
- Puntuación correcta dentro y fuera de los incisos
- Cada intervención en párrafo separado

FASE 14 — COHERENCIA LÉXICA Y REGISTRO
- Un mismo objeto/lugar/personaje debe llamarse igual en todo el texto
- Registro lingüístico uniforme (no mezclar coloquial con académico sin justificación)
- Evitar anglicismos innecesarios salvo que sean parte del estilo del autor

━━━ REGLA DE ORO ━━━
NO alteres la trama. NO elimines escenas. NO suavices el tono. NO reescribas párrafos enteros que funcionen bien. Eres un bisturí, no una excavadora. Intervén solo donde haya un defecto real.

════════════════════════════════════════════════════════
FORMATO DE RESPUESTA (JSON estricto):
════════════════════════════════════════════════════════
{
  "correctedText": "Texto corregido COMPLETO con TODOS los defectos eliminados.",
  "glitches": [
    {
      "type": "solapamiento_dialogo | corte_frase | bucle_accion | parrafo_clonado | cambio_perspectiva | ruptura_temporal | personaje_fantasma | muletilla_ia | sobre_explicacion | transicion_artificial | dialogo_informativo | ortotipografico | formato_dialogo | coherencia_lexica",
      "severity": "critico | medio | menor",
      "original": "Cita EXACTA del fragmento con error (máx 120 chars)",
      "fixed": "Cómo quedó corregido (máx 120 chars)",
      "description": "Explicación concisa del defecto"
    }
  ],
  "stats": {
    "glitchesDetected": 0,
    "criticalErrors": 0,
    "typographicFixes": 0,
    "qualityScore": 0
  }
}

ESCALA qualityScore:
- 10 = Impecable (imposible en texto de IA sin corrección previa)
- 8-9 = Solo errores menores tipográficos
- 6-7 = Defectos medios (muletillas, sobre-explicaciones)
- 4-5 = Glitches estructurales corregidos (solapamientos, cortes)
- 1-3 = Múltiples glitches críticos graves
- Máximo 7 si no encuentras NINGÚN glitch en texto de IA (es que los estás pasando por alto)

TEXTO A AUDITAR:
---
${block}
---

Responde SOLO con el JSON, sin markdown.`;

      const content = await callAi(prompt, { maxTokens: 8000 });
      const result = parseJsonResponse(content);
      correctedBlocks.push(result.correctedText || block);

      if (result.glitches && Array.isArray(result.glitches)) {
        for (const g of result.glitches) {
          glitchesFound.push({
            block: i + 1,
            type: g.type || "desconocido",
            description: g.description || "",
            original: g.original || "",
            fixed: g.fixed || "",
          });
          changesSummary.push(`[Bloque ${i + 1}] [${(g.severity || "").toUpperCase()}] ${g.type}: ${g.description}`);
        }
      }

      if (result.changes && Array.isArray(result.changes)) {
        changesSummary.push(...result.changes.map((c: string) => `[Bloque ${i + 1}] ${c}`));
      }
    }

    const fullCorrectedText = correctedBlocks.join("\n\n");

    const totalGlitches = glitchesFound.length;
    const criticalGlitches = glitchesFound.filter(g =>
      ["solapamiento_dialogo", "corte_frase", "bucle_accion", "parrafo_clonado"].includes(g.type)
    ).length;

    res.json({
      success: true,
      originalLength: textToProofread.length,
      correctedLength: fullCorrectedText.length,
      blocksProcessed: blocks.length,
      correctedText: fullCorrectedText,
      changes: changesSummary,
      glitches: glitchesFound,
      stats: {
        totalGlitches,
        criticalGlitches,
        typographicFixes: totalGlitches - criticalGlitches,
      },
    });
  } catch (error: any) {
    handleAiError(error, req, res);
  }
});

export default router;
