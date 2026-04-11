import { Router, type IRouter } from "express";
import { eq, and, sql } from "drizzle-orm";
import { db, seriesTable, authorsTable, booksTable } from "@workspace/db";
import { callAi, parseJsonResponse, LANG_NAMES, AiNotConfiguredError, AiApiError } from "../lib/ai";
import {
  CreateSeriesBody,
  GetSeriesParams,
  ListSeriesQueryParams,
  ListSeriesResponse,
  ListSeriesResponseItem,
  GetSeriesResponse,
  UpdateSeriesBody,
  UpdateSeriesParams,
  DeleteSeriesParams,
} from "@workspace/api-zod";

const router: IRouter = Router();

router.get("/series", async (req, res): Promise<void> => {
  const query = ListSeriesQueryParams.safeParse(req.query);
  if (!query.success) {
    res.status(400).json({ error: query.error.message });
    return;
  }

  const conditions = [];
  if (query.data.authorId) conditions.push(eq(seriesTable.authorId, query.data.authorId));
  if (query.data.language) conditions.push(eq(seriesTable.language, query.data.language));

  const seriesList = await db
    .select({
      id: seriesTable.id,
      authorId: seriesTable.authorId,
      name: seriesTable.name,
      description: seriesTable.description,
      genre: seriesTable.genre,
      language: seriesTable.language,
      status: seriesTable.status,
      displayOrder: seriesTable.displayOrder,
      crossoverFromSeriesId: seriesTable.crossoverFromSeriesId,
      authorPenName: authorsTable.penName,
      createdAt: seriesTable.createdAt,
      bookCount: sql<number>`(SELECT COUNT(*) FROM books WHERE books.series_id = ${seriesTable.id})::int`,
    })
    .from(seriesTable)
    .innerJoin(authorsTable, eq(seriesTable.authorId, authorsTable.id))
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(seriesTable.displayOrder);

  const withCrossover = await Promise.all(
    seriesList.map(async (s) => {
      let crossoverFromSeriesName = null;
      if (s.crossoverFromSeriesId) {
        const [crossSeries] = await db.select({ name: seriesTable.name }).from(seriesTable).where(eq(seriesTable.id, s.crossoverFromSeriesId));
        crossoverFromSeriesName = crossSeries?.name ?? null;
      }
      return { ...s, crossoverFromSeriesName };
    })
  );

  res.json(ListSeriesResponse.parse(withCrossover));
});

router.post("/series", async (req, res): Promise<void> => {
  const parsed = CreateSeriesBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [series] = await db.insert(seriesTable).values({
    ...parsed.data,
    language: parsed.data.language ?? "es",
    status: parsed.data.status ?? "planned",
    displayOrder: parsed.data.displayOrder ?? 0,
  }).returning();

  const [author] = await db.select({ penName: authorsTable.penName }).from(authorsTable).where(eq(authorsTable.id, series.authorId));

  res.status(201).json(ListSeriesResponseItem.parse({
    ...series,
    authorPenName: author?.penName ?? "",
    bookCount: 0,
    crossoverFromSeriesName: null,
  }));
});

router.get("/series/:id", async (req, res): Promise<void> => {
  const params = GetSeriesParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [series] = await db
    .select({
      id: seriesTable.id,
      authorId: seriesTable.authorId,
      name: seriesTable.name,
      description: seriesTable.description,
      genre: seriesTable.genre,
      language: seriesTable.language,
      status: seriesTable.status,
      displayOrder: seriesTable.displayOrder,
      crossoverFromSeriesId: seriesTable.crossoverFromSeriesId,
      authorPenName: authorsTable.penName,
      createdAt: seriesTable.createdAt,
    })
    .from(seriesTable)
    .innerJoin(authorsTable, eq(seriesTable.authorId, authorsTable.id))
    .where(eq(seriesTable.id, params.data.id));

  if (!series) {
    res.status(404).json({ error: "Series not found" });
    return;
  }

  let crossoverFromSeriesName = null;
  if (series.crossoverFromSeriesId) {
    const [crossSeries] = await db.select({ name: seriesTable.name }).from(seriesTable).where(eq(seriesTable.id, series.crossoverFromSeriesId));
    crossoverFromSeriesName = crossSeries?.name ?? null;
  }

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
      crossoverToSeriesId: booksTable.crossoverToSeriesId,
      createdAt: booksTable.createdAt,
    })
    .from(booksTable)
    .where(eq(booksTable.seriesId, params.data.id))
    .orderBy(booksTable.bookNumber);

  const booksWithMeta = books.map((b) => ({
    ...b,
    seriesName: series.name,
    authorPenName: series.authorPenName,
  }));

  res.json(GetSeriesResponse.parse({
    ...series,
    crossoverFromSeriesName,
    books: booksWithMeta,
  }));
});

router.put("/series/:id", async (req, res): Promise<void> => {
  const params = UpdateSeriesParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const parsed = UpdateSeriesBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [series] = await db.update(seriesTable).set(parsed.data).where(eq(seriesTable.id, params.data.id)).returning();
  if (!series) {
    res.status(404).json({ error: "Series not found" });
    return;
  }

  const [author] = await db.select({ penName: authorsTable.penName }).from(authorsTable).where(eq(authorsTable.id, series.authorId));
  const bookCount = await db.select({ count: sql<number>`count(*)::int` }).from(booksTable).where(eq(booksTable.seriesId, series.id));

  res.json(ListSeriesResponseItem.parse({
    ...series,
    authorPenName: author?.penName ?? "",
    bookCount: bookCount[0]?.count ?? 0,
    crossoverFromSeriesName: null,
  }));
});

router.delete("/series/:id", async (req, res): Promise<void> => {
  const params = DeleteSeriesParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const [series] = await db.delete(seriesTable).where(eq(seriesTable.id, params.data.id)).returning();
  if (!series) {
    res.status(404).json({ error: "Series not found" });
    return;
  }
  res.sendStatus(204);
});

router.post("/series/:id/generate-spinoff-guide", async (req, res): Promise<void> => {
  try {
    const seriesId = parseInt(req.params.id);
    if (isNaN(seriesId) || seriesId <= 0) {
      res.status(400).json({ error: "ID de serie inválido" });
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
    if (error instanceof AiNotConfiguredError) {
      res.status(400).json({ error: error.message });
      return;
    }
    if (error instanceof AiApiError) {
      req.log.error({ status: error.status }, "AI API error");
      res.status(500).json({ error: `Error de la API de IA (${error.status}). Verifica tu API key y modelo en Configuración.` });
      return;
    }
    req.log.error({ err: error }, "AI spinoff guide generation error");
    res.status(500).json({ error: "Error al generar guía de spin-off" });
  }
});

export default router;
