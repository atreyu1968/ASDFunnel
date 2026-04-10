import { Router, type IRouter } from "express";
import { eq, and, sql } from "drizzle-orm";
import { db, seriesTable, authorsTable, booksTable } from "@workspace/db";
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

export default router;
