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
