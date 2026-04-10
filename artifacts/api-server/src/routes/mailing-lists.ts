import { Router, type IRouter } from "express";
import { eq, and, sql } from "drizzle-orm";
import { db, mailingListsTable, authorsTable, booksTable, subscribersTable } from "@workspace/db";
import {
  CreateMailingListBody,
  GetMailingListParams,
  ListMailingListsQueryParams,
  ListMailingListsResponse,
  ListMailingListsResponseItem,
  GetMailingListResponse,
  UpdateMailingListBody,
  UpdateMailingListParams,
  DeleteMailingListParams,
} from "@workspace/api-zod";

const router: IRouter = Router();

router.get("/mailing-lists", async (req, res): Promise<void> => {
  const query = ListMailingListsQueryParams.safeParse(req.query);
  if (!query.success) {
    res.status(400).json({ error: query.error.message });
    return;
  }

  const conditions = [];
  if (query.data.authorId) conditions.push(eq(mailingListsTable.authorId, query.data.authorId));
  if (query.data.language) conditions.push(eq(mailingListsTable.language, query.data.language));

  const lists = await db
    .select({
      id: mailingListsTable.id,
      authorId: mailingListsTable.authorId,
      authorPenName: authorsTable.penName,
      name: mailingListsTable.name,
      description: mailingListsTable.description,
      language: mailingListsTable.language,
      leadMagnetBookId: mailingListsTable.leadMagnetBookId,
      landingPageUrl: mailingListsTable.landingPageUrl,
      isActive: mailingListsTable.isActive,
      createdAt: mailingListsTable.createdAt,
      subscriberCount: sql<number>`(SELECT COUNT(*) FROM subscribers WHERE subscribers.mailing_list_id = ${mailingListsTable.id} AND subscribers.status = 'active')::int`,
    })
    .from(mailingListsTable)
    .innerJoin(authorsTable, eq(mailingListsTable.authorId, authorsTable.id))
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(mailingListsTable.createdAt);

  const withBookTitles = await Promise.all(
    lists.map(async (l) => {
      let leadMagnetBookTitle = null;
      if (l.leadMagnetBookId) {
        const [book] = await db.select({ title: booksTable.title }).from(booksTable).where(eq(booksTable.id, l.leadMagnetBookId));
        leadMagnetBookTitle = book?.title ?? null;
      }
      return { ...l, leadMagnetBookTitle };
    })
  );

  res.json(ListMailingListsResponse.parse(withBookTitles));
});

router.post("/mailing-lists", async (req, res): Promise<void> => {
  const parsed = CreateMailingListBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [author] = await db.select({ penName: authorsTable.penName }).from(authorsTable).where(eq(authorsTable.id, parsed.data.authorId));
  if (!author) {
    res.status(400).json({ error: "Author not found" });
    return;
  }

  if (parsed.data.leadMagnetBookId) {
    const [book] = await db.select({ id: booksTable.id }).from(booksTable).where(eq(booksTable.id, parsed.data.leadMagnetBookId));
    if (!book) {
      res.status(400).json({ error: "Lead magnet book not found" });
      return;
    }
  }

  try {
    const [list] = await db.insert(mailingListsTable).values({
      ...parsed.data,
      isActive: parsed.data.isActive ?? true,
    }).returning();

    let leadMagnetBookTitle = null;
    if (list.leadMagnetBookId) {
      const [book] = await db.select({ title: booksTable.title }).from(booksTable).where(eq(booksTable.id, list.leadMagnetBookId));
      leadMagnetBookTitle = book?.title ?? null;
    }

    res.status(201).json(ListMailingListsResponseItem.parse({
      ...list,
      authorPenName: author.penName,
      subscriberCount: 0,
      leadMagnetBookTitle,
    }));
  } catch (err: any) {
    if (err?.code === "23505") {
      res.status(409).json({ error: "A mailing list with this name already exists" });
      return;
    }
    throw err;
  }
});

router.get("/mailing-lists/:id", async (req, res): Promise<void> => {
  const params = GetMailingListParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [list] = await db
    .select({
      id: mailingListsTable.id,
      authorId: mailingListsTable.authorId,
      authorPenName: authorsTable.penName,
      name: mailingListsTable.name,
      description: mailingListsTable.description,
      language: mailingListsTable.language,
      leadMagnetBookId: mailingListsTable.leadMagnetBookId,
      landingPageUrl: mailingListsTable.landingPageUrl,
      isActive: mailingListsTable.isActive,
      createdAt: mailingListsTable.createdAt,
      subscriberCount: sql<number>`(SELECT COUNT(*) FROM subscribers WHERE subscribers.mailing_list_id = ${mailingListsTable.id} AND subscribers.status = 'active')::int`,
    })
    .from(mailingListsTable)
    .innerJoin(authorsTable, eq(mailingListsTable.authorId, authorsTable.id))
    .where(eq(mailingListsTable.id, params.data.id));

  if (!list) {
    res.status(404).json({ error: "Mailing list not found" });
    return;
  }

  let leadMagnetBookTitle = null;
  if (list.leadMagnetBookId) {
    const [book] = await db.select({ title: booksTable.title }).from(booksTable).where(eq(booksTable.id, list.leadMagnetBookId));
    leadMagnetBookTitle = book?.title ?? null;
  }

  const subscribers = await db
    .select({
      id: subscribersTable.id,
      email: subscribersTable.email,
      firstName: subscribersTable.firstName,
      lastName: subscribersTable.lastName,
      language: subscribersTable.language,
      source: subscribersTable.source,
      status: subscribersTable.status,
      mailingListId: subscribersTable.mailingListId,
      tags: subscribersTable.tags,
      subscribedAt: subscribersTable.subscribedAt,
      unsubscribedAt: subscribersTable.unsubscribedAt,
    })
    .from(subscribersTable)
    .where(eq(subscribersTable.mailingListId, params.data.id))
    .orderBy(subscribersTable.subscribedAt);

  const subsWithMeta = subscribers.map((s) => ({
    ...s,
    mailingListName: list.name,
    authorPenName: list.authorPenName,
  }));

  res.json(GetMailingListResponse.parse({
    ...list,
    leadMagnetBookTitle,
    subscribers: subsWithMeta,
  }));
});

router.put("/mailing-lists/:id", async (req, res): Promise<void> => {
  const params = UpdateMailingListParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const parsed = UpdateMailingListBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [list] = await db.update(mailingListsTable).set(parsed.data).where(eq(mailingListsTable.id, params.data.id)).returning();
  if (!list) {
    res.status(404).json({ error: "Mailing list not found" });
    return;
  }

  const [author] = await db.select({ penName: authorsTable.penName }).from(authorsTable).where(eq(authorsTable.id, list.authorId));
  const subCount = await db.select({ count: sql<number>`count(*)::int` }).from(subscribersTable).where(and(eq(subscribersTable.mailingListId, list.id), eq(subscribersTable.status, "active")));

  let leadMagnetBookTitle = null;
  if (list.leadMagnetBookId) {
    const [book] = await db.select({ title: booksTable.title }).from(booksTable).where(eq(booksTable.id, list.leadMagnetBookId));
    leadMagnetBookTitle = book?.title ?? null;
  }

  res.json(ListMailingListsResponseItem.parse({
    ...list,
    authorPenName: author?.penName ?? "",
    subscriberCount: subCount[0]?.count ?? 0,
    leadMagnetBookTitle,
  }));
});

router.delete("/mailing-lists/:id", async (req, res): Promise<void> => {
  const params = DeleteMailingListParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const [list] = await db.delete(mailingListsTable).where(eq(mailingListsTable.id, params.data.id)).returning();
  if (!list) {
    res.status(404).json({ error: "Mailing list not found" });
    return;
  }
  res.sendStatus(204);
});

export default router;
