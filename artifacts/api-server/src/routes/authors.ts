import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, authorsTable } from "@workspace/db";
import {
  CreateAuthorBody,
  GetAuthorParams,
  ListAuthorsResponseItem,
  ListAuthorsResponse,
  UpdateAuthorBody,
  UpdateAuthorParams,
  DeleteAuthorParams,
} from "@workspace/api-zod";

const router: IRouter = Router();

router.get("/authors", async (_req, res): Promise<void> => {
  const authors = await db.select().from(authorsTable).orderBy(authorsTable.createdAt);
  res.json(ListAuthorsResponse.parse(authors));
});

router.post("/authors", async (req, res): Promise<void> => {
  const parsed = CreateAuthorBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const [author] = await db.insert(authorsTable).values(parsed.data).returning();
  res.status(201).json(ListAuthorsResponseItem.parse(author));
});

router.get("/authors/:id", async (req, res): Promise<void> => {
  const params = GetAuthorParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const [author] = await db.select().from(authorsTable).where(eq(authorsTable.id, params.data.id));
  if (!author) {
    res.status(404).json({ error: "Author not found" });
    return;
  }
  res.json(ListAuthorsResponseItem.parse(author));
});

router.put("/authors/:id", async (req, res): Promise<void> => {
  const params = UpdateAuthorParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const parsed = UpdateAuthorBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const [author] = await db.update(authorsTable).set(parsed.data).where(eq(authorsTable.id, params.data.id)).returning();
  if (!author) {
    res.status(404).json({ error: "Author not found" });
    return;
  }
  res.json(ListAuthorsResponseItem.parse(author));
});

router.delete("/authors/:id", async (req, res): Promise<void> => {
  const params = DeleteAuthorParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const [author] = await db.delete(authorsTable).where(eq(authorsTable.id, params.data.id)).returning();
  if (!author) {
    res.status(404).json({ error: "Author not found" });
    return;
  }
  res.sendStatus(204);
});

export default router;
