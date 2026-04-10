import { Router, type IRouter } from "express";
import { eq, and } from "drizzle-orm";
import { db, landingPagesTable, authorsTable, seriesTable, booksTable, mailingListsTable } from "@workspace/db";
import {
  ListLandingPagesQueryParams,
  ListLandingPagesResponse,
  ListLandingPagesResponseItem,
  CreateLandingPageBody,
  GetLandingPageParams,
  GetLandingPageResponse,
  UpdateLandingPageBody,
  UpdateLandingPageParams,
  DeleteLandingPageParams,
} from "@workspace/api-zod";

const router: IRouter = Router();

async function getEntityName(entityType: string, entityId: number): Promise<string> {
  if (entityType === "author") {
    const [a] = await db.select({ name: authorsTable.penName }).from(authorsTable).where(eq(authorsTable.id, entityId));
    return a?.name ?? "";
  }
  if (entityType === "series") {
    const [s] = await db.select({ name: seriesTable.name }).from(seriesTable).where(eq(seriesTable.id, entityId));
    return s?.name ?? "";
  }
  if (entityType === "book") {
    const [b] = await db.select({ name: booksTable.title }).from(booksTable).where(eq(booksTable.id, entityId));
    return b?.name ?? "";
  }
  return "";
}

async function getMailingListName(id: number | null): Promise<string | null> {
  if (!id) return null;
  const [ml] = await db.select({ name: mailingListsTable.name }).from(mailingListsTable).where(eq(mailingListsTable.id, id));
  return ml?.name ?? null;
}

router.get("/landing-pages", async (req, res): Promise<void> => {
  const query = ListLandingPagesQueryParams.safeParse(req.query);
  if (!query.success) {
    res.status(400).json({ error: query.error.message });
    return;
  }

  const conditions = [];
  if (query.data.entityType) conditions.push(eq(landingPagesTable.entityType, query.data.entityType));
  if (query.data.entityId) conditions.push(eq(landingPagesTable.entityId, query.data.entityId));
  if (query.data.language) conditions.push(eq(landingPagesTable.language, query.data.language));

  const pages = await db
    .select()
    .from(landingPagesTable)
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(landingPagesTable.createdAt);

  const withMeta = await Promise.all(
    pages.map(async (p) => ({
      ...p,
      entityName: await getEntityName(p.entityType, p.entityId),
      mailingListName: await getMailingListName(p.mailingListId),
    }))
  );

  res.json(ListLandingPagesResponse.parse(withMeta));
});

router.post("/landing-pages", async (req, res): Promise<void> => {
  const parsed = CreateLandingPageBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const entityName = await getEntityName(parsed.data.entityType, parsed.data.entityId);
  if (!entityName) {
    res.status(400).json({ error: `${parsed.data.entityType} not found` });
    return;
  }

  const [page] = await db.insert(landingPagesTable).values({
    ...parsed.data,
    isPublished: parsed.data.isPublished ?? false,
  }).returning();

  const mailingListName = await getMailingListName(page.mailingListId);

  res.status(201).json(ListLandingPagesResponseItem.parse({
    ...page,
    entityName,
    mailingListName,
  }));
});

router.get("/landing-pages/:id", async (req, res): Promise<void> => {
  const params = GetLandingPageParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [page] = await db.select().from(landingPagesTable).where(eq(landingPagesTable.id, params.data.id));
  if (!page) {
    res.status(404).json({ error: "Landing page not found" });
    return;
  }

  const entityName = await getEntityName(page.entityType, page.entityId);
  const mailingListName = await getMailingListName(page.mailingListId);

  res.json(GetLandingPageResponse.parse({ ...page, entityName, mailingListName }));
});

router.put("/landing-pages/:id", async (req, res): Promise<void> => {
  const params = UpdateLandingPageParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const parsed = UpdateLandingPageBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [page] = await db.update(landingPagesTable).set({ ...parsed.data, updatedAt: new Date() }).where(eq(landingPagesTable.id, params.data.id)).returning();
  if (!page) {
    res.status(404).json({ error: "Landing page not found" });
    return;
  }

  const entityName = await getEntityName(page.entityType, page.entityId);
  const mailingListName = await getMailingListName(page.mailingListId);

  res.json(ListLandingPagesResponseItem.parse({ ...page, entityName, mailingListName }));
});

router.delete("/landing-pages/:id", async (req, res): Promise<void> => {
  const params = DeleteLandingPageParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const [page] = await db.delete(landingPagesTable).where(eq(landingPagesTable.id, params.data.id)).returning();
  if (!page) {
    res.status(404).json({ error: "Landing page not found" });
    return;
  }
  res.sendStatus(204);
});

export default router;
