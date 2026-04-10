import { Router, type IRouter } from "express";
import { eq, and, sql } from "drizzle-orm";
import { db, booksTable, seriesTable, authorsTable, activityTable, landingPagesTable, emailSettingsTable } from "@workspace/db";
import {
  CreateBookBody,
  GetBookParams,
  ListBooksQueryParams,
  ListBooksResponse,
  ListBooksResponseItem,
  UpdateBookBody,
  UpdateBookParams,
  DeleteBookParams,
  UploadManuscriptBody,
} from "@workspace/api-zod";
import { ObjectStorageService } from "../lib/objectStorage";
import mammoth from "mammoth";

const router: IRouter = Router();

router.get("/books", async (req, res): Promise<void> => {
  const query = ListBooksQueryParams.safeParse(req.query);
  if (!query.success) {
    res.status(400).json({ error: query.error.message });
    return;
  }

  const conditions = [];
  if (query.data.seriesId) conditions.push(eq(booksTable.seriesId, query.data.seriesId));
  if (query.data.status) conditions.push(eq(booksTable.status, query.data.status));
  if (query.data.funnelRole) conditions.push(eq(booksTable.funnelRole, query.data.funnelRole));
  if (query.data.language) conditions.push(eq(booksTable.language, query.data.language));

  const books = await db
    .select({
      id: booksTable.id,
      seriesId: booksTable.seriesId,
      bookNumber: booksTable.bookNumber,
      title: booksTable.title,
      subtitle: booksTable.subtitle,
      description: booksTable.description,
      language: booksTable.language,
      wordCount: booksTable.wordCount,
      funnelRole: booksTable.funnelRole,
      pricingStrategy: booksTable.pricingStrategy,
      price: booksTable.price,
      promotionalPrice: booksTable.promotionalPrice,
      status: booksTable.status,
      publicationDate: booksTable.publicationDate,
      scheduledDate: booksTable.scheduledDate,
      distributionChannel: booksTable.distributionChannel,
      asin: booksTable.asin,
      isbn: booksTable.isbn,
      coverImageUrl: booksTable.coverImageUrl,
      manuscriptPath: booksTable.manuscriptPath,
      crossoverToSeriesId: booksTable.crossoverToSeriesId,
      seriesName: seriesTable.name,
      authorPenName: authorsTable.penName,
      createdAt: booksTable.createdAt,
    })
    .from(booksTable)
    .innerJoin(seriesTable, eq(booksTable.seriesId, seriesTable.id))
    .innerJoin(authorsTable, eq(seriesTable.authorId, authorsTable.id))
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(booksTable.createdAt);

  res.json(ListBooksResponse.parse(books));
});

async function validateFunnelOrder(seriesId: number, funnelRole: string | undefined, status: string | undefined, scheduledDate: string | null | undefined, publicationDate: string | null | undefined, excludeBookId?: number): Promise<string | null> {
  if (!funnelRole || !seriesId) return null;

  const seriesBooks = await db
    .select({
      id: booksTable.id,
      funnelRole: booksTable.funnelRole,
      status: booksTable.status,
      scheduledDate: booksTable.scheduledDate,
      publicationDate: booksTable.publicationDate,
    })
    .from(booksTable)
    .where(eq(booksTable.seriesId, seriesId));

  const otherBooks = excludeBookId ? seriesBooks.filter(b => b.id !== excludeBookId) : seriesBooks;

  const effectiveDate = publicationDate || scheduledDate;

  if (funnelRole === "traffic_entry" && (status === "published" || status === "scheduled")) {
    const leadMagnet = otherBooks.find(b => b.funnelRole === "lead_magnet");
    if (!leadMagnet) {
      return "No se puede publicar/programar el libro de entrada sin un lead magnet en la misma serie.";
    }
    if (leadMagnet.status !== "published") {
      return "El lead magnet debe estar publicado antes de publicar/programar el libro de entrada.";
    }
    const lmDate = leadMagnet.publicationDate || leadMagnet.scheduledDate;
    if (effectiveDate && lmDate && new Date(effectiveDate) <= new Date(lmDate as string)) {
      return "La fecha del libro de entrada debe ser posterior a la fecha de publicación del lead magnet.";
    }
  }

  if (funnelRole === "core_offer" && (status === "published" || status === "scheduled")) {
    const trafficEntry = otherBooks.find(b => b.funnelRole === "traffic_entry");
    if (trafficEntry) {
      const teDate = trafficEntry.publicationDate || trafficEntry.scheduledDate;
      if (!teDate) {
        return "El libro de entrada debe tener fecha antes de programar ofertas principales.";
      }
      if (effectiveDate && new Date(effectiveDate) <= new Date(teDate as string)) {
        return "La fecha de la oferta principal debe ser posterior a la fecha del libro de entrada.";
      }
    }
    const leadMagnet = otherBooks.find(b => b.funnelRole === "lead_magnet");
    if (leadMagnet && leadMagnet.status !== "published") {
      return "El lead magnet debe estar publicado antes de programar ofertas principales.";
    }
  }

  return null;
}

router.post("/books", async (req, res): Promise<void> => {
  const parsed = CreateBookBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const funnelError = await validateFunnelOrder(
    parsed.data.seriesId,
    parsed.data.funnelRole,
    parsed.data.status,
    parsed.data.scheduledDate,
    parsed.data.publicationDate
  );
  if (funnelError) {
    res.status(400).json({ error: funnelError });
    return;
  }

  const [book] = await db.insert(booksTable).values(parsed.data).returning();

  const [seriesInfo] = await db
    .select({ seriesName: seriesTable.name, authorPenName: authorsTable.penName })
    .from(seriesTable)
    .innerJoin(authorsTable, eq(seriesTable.authorId, authorsTable.id))
    .where(eq(seriesTable.id, book.seriesId));

  await db.insert(activityTable).values({
    bookId: book.id,
    action: "created",
  });

  res.status(201).json(ListBooksResponseItem.parse({
    ...book,
    seriesName: seriesInfo?.seriesName ?? "",
    authorPenName: seriesInfo?.authorPenName ?? "",
  }));
});

router.get("/books/:id", async (req, res): Promise<void> => {
  const params = GetBookParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [book] = await db
    .select({
      id: booksTable.id,
      seriesId: booksTable.seriesId,
      bookNumber: booksTable.bookNumber,
      title: booksTable.title,
      subtitle: booksTable.subtitle,
      description: booksTable.description,
      language: booksTable.language,
      wordCount: booksTable.wordCount,
      funnelRole: booksTable.funnelRole,
      pricingStrategy: booksTable.pricingStrategy,
      price: booksTable.price,
      promotionalPrice: booksTable.promotionalPrice,
      status: booksTable.status,
      publicationDate: booksTable.publicationDate,
      scheduledDate: booksTable.scheduledDate,
      distributionChannel: booksTable.distributionChannel,
      asin: booksTable.asin,
      isbn: booksTable.isbn,
      coverImageUrl: booksTable.coverImageUrl,
      manuscriptPath: booksTable.manuscriptPath,
      crossoverToSeriesId: booksTable.crossoverToSeriesId,
      seriesName: seriesTable.name,
      authorPenName: authorsTable.penName,
      createdAt: booksTable.createdAt,
    })
    .from(booksTable)
    .innerJoin(seriesTable, eq(booksTable.seriesId, seriesTable.id))
    .innerJoin(authorsTable, eq(seriesTable.authorId, authorsTable.id))
    .where(eq(booksTable.id, params.data.id));

  if (!book) {
    res.status(404).json({ error: "Book not found" });
    return;
  }

  res.json(ListBooksResponseItem.parse(book));
});

router.put("/books/:id", async (req, res): Promise<void> => {
  const params = UpdateBookParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const parsed = UpdateBookBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [oldBook] = await db.select().from(booksTable).where(eq(booksTable.id, params.data.id));
  if (!oldBook) {
    res.status(404).json({ error: "Book not found" });
    return;
  }

  const mergedFunnelRole = parsed.data.funnelRole ?? oldBook.funnelRole;
  const mergedStatus = parsed.data.status ?? oldBook.status;
  const mergedScheduledDate = parsed.data.scheduledDate !== undefined ? parsed.data.scheduledDate : oldBook.scheduledDate;
  const mergedPublicationDate = parsed.data.publicationDate !== undefined ? parsed.data.publicationDate : oldBook.publicationDate;

  const funnelError = await validateFunnelOrder(
    oldBook.seriesId,
    mergedFunnelRole ?? undefined,
    mergedStatus ?? undefined,
    mergedScheduledDate ? String(mergedScheduledDate) : null,
    mergedPublicationDate ? String(mergedPublicationDate) : null,
    params.data.id
  );
  if (funnelError) {
    res.status(400).json({ error: funnelError });
    return;
  }

  const [book] = await db.update(booksTable).set(parsed.data).where(eq(booksTable.id, params.data.id)).returning();
  if (!book) {
    res.status(404).json({ error: "Book not found" });
    return;
  }

  if (oldBook && oldBook.status !== book.status) {
    await db.insert(activityTable).values({
      bookId: book.id,
      action: `status_changed_to_${book.status}`,
    });
  }

  const [seriesInfo] = await db
    .select({ seriesName: seriesTable.name, authorPenName: authorsTable.penName })
    .from(seriesTable)
    .innerJoin(authorsTable, eq(seriesTable.authorId, authorsTable.id))
    .where(eq(seriesTable.id, book.seriesId));

  res.json(ListBooksResponseItem.parse({
    ...book,
    seriesName: seriesInfo?.seriesName ?? "",
    authorPenName: seriesInfo?.authorPenName ?? "",
  }));
});

router.post("/books/:id/upload-manuscript", async (req, res): Promise<void> => {
  const bookId = Number(req.params.id);
  if (isNaN(bookId)) {
    res.status(400).json({ error: "Invalid book ID" });
    return;
  }

  const parsed = UploadManuscriptBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [book] = await db
    .select()
    .from(booksTable)
    .innerJoin(seriesTable, eq(booksTable.seriesId, seriesTable.id))
    .innerJoin(authorsTable, eq(seriesTable.authorId, authorsTable.id))
    .where(eq(booksTable.id, bookId));

  if (!book) {
    res.status(404).json({ error: "Book not found" });
    return;
  }

  if (!parsed.data.generateLandingPage) {
    await db.update(booksTable)
      .set({ manuscriptPath: parsed.data.manuscriptObjectPath })
      .where(eq(booksTable.id, bookId));
    res.json({ success: true, bookId, title: "", description: "", hook: "", callToAction: "" });
    return;
  }

  try {
    const storageService = new ObjectStorageService();
    const objectFile = await storageService.getObjectEntityFile(parsed.data.manuscriptObjectPath);
    const [downloadResponse] = await objectFile.download();
    const docxBuffer = Buffer.from(downloadResponse);
    const { value: text } = await mammoth.extractRawText({ buffer: docxBuffer });

    await db.update(booksTable)
      .set({ manuscriptPath: parsed.data.manuscriptObjectPath })
      .where(eq(booksTable.id, bookId));

    const excerpt = text.slice(0, 8000);

    const [settings] = await db.select().from(emailSettingsTable).limit(1);
    if (!settings?.aiApiKey || !settings?.aiProvider) {
      res.status(400).json({ error: "La configuración de IA no está configurada. Ve a Configuración para añadir tu API key de DeepSeek." });
      return;
    }

    const lang = book.books.language || "es";
    const langNames: Record<string, string> = { es: "español", en: "English", fr: "français", de: "Deutsch", it: "italiano", pt: "português" };
    const langName = langNames[lang] || lang;

    const prompt = `Eres un experto en marketing editorial de thrillers psicológicos. Analiza este extracto de manuscrito y genera contenido para una landing page de captación de emails.

Libro: "${book.books.title}"
Autor: "${book.authors.penName}"
Serie: "${book.series.name}"
Idioma del contenido: ${langName}

Extracto del manuscrito:
---
${excerpt}
---

Genera en ${langName} un JSON con estos campos exactos:
{
  "title": "Título atractivo para la landing page (máx 80 caracteres)",
  "description": "Descripción cautivadora del libro (150-300 caracteres). Debe crear urgencia y misterio.",
  "hook": "Gancho principal - una frase que enganche al lector (máx 120 caracteres)",
  "callToAction": "Texto del botón de captación (máx 40 caracteres)",
  "metaTitle": "Meta título SEO (máx 60 caracteres)",
  "metaDescription": "Meta descripción SEO (máx 160 caracteres)"
}

Responde SOLO con el JSON, sin markdown ni explicaciones.`;

    const baseUrl = settings.aiProvider === "deepseek" 
      ? "https://api.deepseek.com" 
      : settings.aiProvider === "openai" 
        ? "https://api.openai.com" 
        : `https://api.${settings.aiProvider}.com`;

    const aiResponse = await fetch(`${baseUrl}/v1/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${settings.aiApiKey}`,
      },
      body: JSON.stringify({
        model: settings.aiModel || "deepseek-chat",
        messages: [{ role: "user", content: prompt }],
        temperature: 0.7,
        max_tokens: 1000,
      }),
    });

    if (!aiResponse.ok) {
      const errText = await aiResponse.text();
      req.log.error({ status: aiResponse.status, body: errText }, "AI API error");
      res.status(500).json({ error: `Error de la API de IA (${aiResponse.status}). Verifica tu API key y modelo en Configuración.` });
      return;
    }

    const aiResult = await aiResponse.json() as any;
    const content = aiResult.choices?.[0]?.message?.content || "";

    let generated: any;
    try {
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      generated = JSON.parse(jsonMatch ? jsonMatch[0] : content);
    } catch {
      res.status(500).json({ error: "No se pudo parsear la respuesta de la IA" });
      return;
    }

    let landingPageId: number | null = null;
    if (generated.title && generated.description) {
      const [lp] = await db.insert(landingPagesTable).values({
        entityType: "book",
        entityId: bookId,
        language: lang,
        title: generated.title,
        description: generated.description,
        metaTitle: generated.metaTitle || generated.title,
        metaDescription: generated.metaDescription || generated.description,
        url: "",
        isPublished: false,
      }).returning();
      landingPageId = lp.id;
    }

    res.json({
      success: true,
      bookId,
      landingPageId,
      title: generated.title || "",
      description: generated.description || "",
      hook: generated.hook || "",
      callToAction: generated.callToAction || "",
    });
  } catch (error: any) {
    res.status(500).json({ error: `Error procesando manuscrito: ${error.message}` });
  }
});

router.delete("/books/:id", async (req, res): Promise<void> => {
  const params = DeleteBookParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const [book] = await db.delete(booksTable).where(eq(booksTable.id, params.data.id)).returning();
  if (!book) {
    res.status(404).json({ error: "Book not found" });
    return;
  }
  res.sendStatus(204);
});

export default router;
