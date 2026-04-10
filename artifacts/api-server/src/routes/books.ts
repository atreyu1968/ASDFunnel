import { Router, type IRouter } from "express";
import { eq, and, sql } from "drizzle-orm";
import { db, booksTable, seriesTable, authorsTable, activityTable } from "@workspace/db";
import {
  CreateBookBody,
  GetBookParams,
  ListBooksQueryParams,
  ListBooksResponse,
  ListBooksResponseItem,
  UpdateBookBody,
  UpdateBookParams,
  DeleteBookParams,
} from "@workspace/api-zod";

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

router.post("/books", async (req, res): Promise<void> => {
  const parsed = CreateBookBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
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
