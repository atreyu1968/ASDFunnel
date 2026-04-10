import { Router, type IRouter } from "express";
import { eq, and, sql } from "drizzle-orm";
import { db, subscribersTable, mailingListsTable, authorsTable } from "@workspace/db";
import { generateToken } from "./confirmation";
import {
  CreateSubscriberBody,
  GetSubscriberParams,
  ListSubscribersQueryParams,
  ListSubscribersResponse,
  ListSubscribersResponseItem,
  UpdateSubscriberBody,
  UpdateSubscriberParams,
  DeleteSubscriberParams,
  ImportSubscribersBody,
  ImportSubscribersResponse,
} from "@workspace/api-zod";

const router: IRouter = Router();

router.get("/subscribers", async (req, res): Promise<void> => {
  const query = ListSubscribersQueryParams.safeParse(req.query);
  if (!query.success) {
    res.status(400).json({ error: query.error.message });
    return;
  }

  const conditions = [];
  if (query.data.mailingListId) conditions.push(eq(subscribersTable.mailingListId, query.data.mailingListId));
  if (query.data.status) conditions.push(eq(subscribersTable.status, query.data.status));
  if (query.data.source) conditions.push(eq(subscribersTable.source, query.data.source));
  if (query.data.language) conditions.push(eq(subscribersTable.language, query.data.language));

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
      mailingListName: mailingListsTable.name,
      authorPenName: authorsTable.penName,
      tags: subscribersTable.tags,
      subscribedAt: subscribersTable.subscribedAt,
      unsubscribedAt: subscribersTable.unsubscribedAt,
    })
    .from(subscribersTable)
    .innerJoin(mailingListsTable, eq(subscribersTable.mailingListId, mailingListsTable.id))
    .innerJoin(authorsTable, eq(mailingListsTable.authorId, authorsTable.id))
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(subscribersTable.subscribedAt);

  res.json(ListSubscribersResponse.parse(subscribers));
});

router.post("/subscribers", async (req, res): Promise<void> => {
  const parsed = CreateSubscriberBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [listInfo] = await db
    .select({ mailingListName: mailingListsTable.name, authorPenName: authorsTable.penName })
    .from(mailingListsTable)
    .innerJoin(authorsTable, eq(mailingListsTable.authorId, authorsTable.id))
    .where(eq(mailingListsTable.id, parsed.data.mailingListId));

  if (!listInfo) {
    res.status(400).json({ error: "Mailing list not found" });
    return;
  }

  try {
    const [subscriber] = await db.insert(subscribersTable).values({
      ...parsed.data,
      status: "active",
      confirmationToken: generateToken(),
      confirmedAt: new Date(),
    }).returning();

    res.status(201).json(ListSubscribersResponseItem.parse({
      ...subscriber,
      mailingListName: listInfo.mailingListName,
      authorPenName: listInfo.authorPenName,
    }));
  } catch (err: any) {
    if (err?.code === "23505") {
      res.status(409).json({ error: "This email is already subscribed to this list" });
      return;
    }
    throw err;
  }
});

router.get("/subscribers/:id", async (req, res): Promise<void> => {
  const params = GetSubscriberParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [subscriber] = await db
    .select({
      id: subscribersTable.id,
      email: subscribersTable.email,
      firstName: subscribersTable.firstName,
      lastName: subscribersTable.lastName,
      language: subscribersTable.language,
      source: subscribersTable.source,
      status: subscribersTable.status,
      mailingListId: subscribersTable.mailingListId,
      mailingListName: mailingListsTable.name,
      authorPenName: authorsTable.penName,
      tags: subscribersTable.tags,
      subscribedAt: subscribersTable.subscribedAt,
      unsubscribedAt: subscribersTable.unsubscribedAt,
    })
    .from(subscribersTable)
    .innerJoin(mailingListsTable, eq(subscribersTable.mailingListId, mailingListsTable.id))
    .innerJoin(authorsTable, eq(mailingListsTable.authorId, authorsTable.id))
    .where(eq(subscribersTable.id, params.data.id));

  if (!subscriber) {
    res.status(404).json({ error: "Subscriber not found" });
    return;
  }

  res.json(ListSubscribersResponseItem.parse(subscriber));
});

router.put("/subscribers/:id", async (req, res): Promise<void> => {
  const params = UpdateSubscriberParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const parsed = UpdateSubscriberBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const updateData: Record<string, unknown> = { ...parsed.data };
  if (parsed.data.status === "unsubscribed") {
    updateData.unsubscribedAt = new Date();
  }

  const [subscriber] = await db.update(subscribersTable).set(updateData).where(eq(subscribersTable.id, params.data.id)).returning();
  if (!subscriber) {
    res.status(404).json({ error: "Subscriber not found" });
    return;
  }

  const [listInfo] = await db
    .select({ mailingListName: mailingListsTable.name, authorPenName: authorsTable.penName })
    .from(mailingListsTable)
    .innerJoin(authorsTable, eq(mailingListsTable.authorId, authorsTable.id))
    .where(eq(mailingListsTable.id, subscriber.mailingListId));

  res.json(ListSubscribersResponseItem.parse({
    ...subscriber,
    mailingListName: listInfo?.mailingListName ?? "",
    authorPenName: listInfo?.authorPenName ?? "",
  }));
});

router.delete("/subscribers/:id", async (req, res): Promise<void> => {
  const params = DeleteSubscriberParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const [subscriber] = await db.delete(subscribersTable).where(eq(subscribersTable.id, params.data.id)).returning();
  if (!subscriber) {
    res.status(404).json({ error: "Subscriber not found" });
    return;
  }
  res.sendStatus(204);
});

router.post("/subscribers/import", async (req, res): Promise<void> => {
  const parsed = ImportSubscribersBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [list] = await db.select().from(mailingListsTable).where(eq(mailingListsTable.id, parsed.data.mailingListId));
  if (!list) {
    res.status(404).json({ error: "Mailing list not found" });
    return;
  }

  let imported = 0;
  let duplicates = 0;
  let errors = 0;

  for (const sub of parsed.data.subscribers) {
    try {
      const existing = await db.select({ id: subscribersTable.id })
        .from(subscribersTable)
        .where(and(
          eq(subscribersTable.email, sub.email),
          eq(subscribersTable.mailingListId, parsed.data.mailingListId)
        ));

      if (existing.length > 0) {
        duplicates++;
        continue;
      }

      await db.insert(subscribersTable).values({
        email: sub.email,
        firstName: sub.firstName ?? null,
        lastName: sub.lastName ?? null,
        language: sub.language ?? list.language,
        source: "import",
        status: "active",
        mailingListId: parsed.data.mailingListId,
        tags: sub.tags ?? null,
        confirmationToken: generateToken(),
        confirmedAt: new Date(),
      });
      imported++;
    } catch {
      errors++;
    }
  }

  res.json(ImportSubscribersResponse.parse({
    imported,
    duplicates,
    errors,
    total: parsed.data.subscribers.length,
  }));
});

export default router;
