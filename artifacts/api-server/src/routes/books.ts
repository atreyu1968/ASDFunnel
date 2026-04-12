import { Router, type IRouter } from "express";
import { eq, and, sql } from "drizzle-orm";
import { db, booksTable, seriesTable, authorsTable, activityTable, landingPagesTable } from "@workspace/db";
import { callAi, parseJsonResponse, LANG_NAMES, AiNotConfiguredError, AiApiError } from "../lib/ai";
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

function dateToISO(d: Date | string | null | undefined): string | null {
  if (!d) return null;
  if (d instanceof Date) return d.toISOString();
  return String(d);
}

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
      downloadEpubPath: booksTable.downloadEpubPath,
      downloadPdfPath: booksTable.downloadPdfPath,
      downloadAzw3Path: booksTable.downloadAzw3Path,
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

  res.json(books.map(b => ({ ...b, publicationDate: dateToISO(b.publicationDate), scheduledDate: dateToISO(b.scheduledDate), createdAt: dateToISO(b.createdAt) })));
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
    if (effectiveDate && lmDate && new Date(effectiveDate) <= new Date(lmDate instanceof Date ? lmDate.toISOString() : String(lmDate))) {
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
      if (effectiveDate && new Date(effectiveDate) <= new Date(teDate instanceof Date ? teDate.toISOString() : String(teDate))) {
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
    dateToISO(parsed.data.scheduledDate),
    dateToISO(parsed.data.publicationDate)
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

  res.status(201).json({
    ...book,
    publicationDate: dateToISO(book.publicationDate),
    scheduledDate: dateToISO(book.scheduledDate),
    createdAt: dateToISO(book.createdAt),
    seriesName: seriesInfo?.seriesName ?? "",
    authorPenName: seriesInfo?.authorPenName ?? "",
  });
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
      downloadEpubPath: booksTable.downloadEpubPath,
      downloadPdfPath: booksTable.downloadPdfPath,
      downloadAzw3Path: booksTable.downloadAzw3Path,
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

  res.json({ ...book, publicationDate: dateToISO(book.publicationDate), scheduledDate: dateToISO(book.scheduledDate), createdAt: dateToISO(book.createdAt) });
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
    dateToISO(mergedScheduledDate),
    dateToISO(mergedPublicationDate),
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

  res.json({
    ...book,
    publicationDate: dateToISO(book.publicationDate),
    scheduledDate: dateToISO(book.scheduledDate),
    createdAt: dateToISO(book.createdAt),
    seriesName: seriesInfo?.seriesName ?? "",
    authorPenName: seriesInfo?.authorPenName ?? "",
  });
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

    const lang = book.books.language || "es";
    const langName = LANG_NAMES[lang] || lang;

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

    const content = await callAi(prompt);
    const generated = parseJsonResponse(content);

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
    if (error instanceof AiNotConfiguredError) {
      res.status(400).json({ error: error.message });
      return;
    }
    if (error instanceof AiApiError) {
      req.log.error({ status: error.status }, "AI API error");
      res.status(500).json({ error: `Error de la API de IA (${error.status}). Verifica tu API key y modelo en Configuración.` });
      return;
    }
    req.log.error({ err: error }, "Error processing manuscript");
    res.status(500).json({ error: "Error procesando manuscrito" });
  }
});

const VALID_DOWNLOAD_FORMATS = ["epub", "pdf", "azw3"] as const;
const FORMAT_TO_FIELD: Record<string, "downloadEpubPath" | "downloadPdfPath" | "downloadAzw3Path"> = {
  epub: "downloadEpubPath",
  pdf: "downloadPdfPath",
  azw3: "downloadAzw3Path",
};

router.post("/books/:id/upload-download", async (req, res): Promise<void> => {
  const bookId = Number(req.params.id);
  if (isNaN(bookId)) {
    res.status(400).json({ error: "Invalid book ID" });
    return;
  }

  const { format, objectPath } = req.body;
  if (!format || !VALID_DOWNLOAD_FORMATS.includes(format)) {
    res.status(400).json({ error: "Formato inválido. Usa: epub, pdf, azw3" });
    return;
  }
  if (!objectPath || typeof objectPath !== "string") {
    res.status(400).json({ error: "objectPath requerido" });
    return;
  }
  if (!objectPath.match(/^(\/api\/storage)?\/objects\//) && !objectPath.startsWith("/objects/")) {
    res.status(400).json({ error: "objectPath inválido — debe ser una ruta de almacenamiento interna" });
    return;
  }

  const [existing] = await db.select().from(booksTable).where(eq(booksTable.id, bookId));
  if (!existing) {
    res.status(404).json({ error: "Book not found" });
    return;
  }

  const field = FORMAT_TO_FIELD[format];
  await db.update(booksTable).set({ [field]: objectPath }).where(eq(booksTable.id, bookId));

  res.json({ success: true, bookId, format, objectPath });
});

router.delete("/books/:id/download/:format", async (req, res): Promise<void> => {
  const bookId = Number(req.params.id);
  const format = String(req.params.format);
  if (isNaN(bookId) || !VALID_DOWNLOAD_FORMATS.includes(format as any)) {
    res.status(400).json({ error: "Parámetros inválidos" });
    return;
  }

  const field = FORMAT_TO_FIELD[format];
  await db.update(booksTable).set({ [field]: null }).where(eq(booksTable.id, bookId));
  res.json({ success: true });
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
