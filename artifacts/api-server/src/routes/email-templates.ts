import { Router, type IRouter } from "express";
import { eq, and } from "drizzle-orm";
import { db, emailTemplatesTable, mailingListsTable } from "@workspace/db";
import {
  ListEmailTemplatesQueryParams,
  ListEmailTemplatesResponse,
  ListEmailTemplatesResponseItem,
  CreateEmailTemplateBody,
  GetEmailTemplateParams,
  GetEmailTemplateResponse,
  UpdateEmailTemplateBody,
  UpdateEmailTemplateParams,
  DeleteEmailTemplateParams,
} from "@workspace/api-zod";

const router: IRouter = Router();

async function getMailingListName(id: number | null | undefined): Promise<string | null> {
  if (!id) return null;
  const [ml] = await db.select({ name: mailingListsTable.name }).from(mailingListsTable).where(eq(mailingListsTable.id, id));
  return ml?.name ?? null;
}

router.get("/email-templates", async (req, res): Promise<void> => {
  const query = ListEmailTemplatesQueryParams.safeParse(req.query);
  if (!query.success) {
    res.status(400).json({ error: query.error.message });
    return;
  }

  const conditions = [];
  if (query.data.language) conditions.push(eq(emailTemplatesTable.language, query.data.language));
  if (query.data.templateType) conditions.push(eq(emailTemplatesTable.templateType, query.data.templateType));
  if (query.data.mailingListId) conditions.push(eq(emailTemplatesTable.mailingListId, query.data.mailingListId));

  const templates = await db
    .select()
    .from(emailTemplatesTable)
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(emailTemplatesTable.createdAt);

  const withMeta = await Promise.all(
    templates.map(async (t) => ({
      ...t,
      mailingListName: await getMailingListName(t.mailingListId),
    }))
  );

  res.json(ListEmailTemplatesResponse.parse(withMeta));
});

router.post("/email-templates", async (req, res): Promise<void> => {
  const parsed = CreateEmailTemplateBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [template] = await db.insert(emailTemplatesTable).values({
    ...parsed.data,
    isActive: parsed.data.isActive ?? true,
  }).returning();

  const mailingListName = await getMailingListName(template.mailingListId);

  res.status(201).json(ListEmailTemplatesResponseItem.parse({ ...template, mailingListName }));
});

router.get("/email-templates/:id", async (req, res): Promise<void> => {
  const params = GetEmailTemplateParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [template] = await db.select().from(emailTemplatesTable).where(eq(emailTemplatesTable.id, params.data.id));
  if (!template) {
    res.status(404).json({ error: "Email template not found" });
    return;
  }

  const mailingListName = await getMailingListName(template.mailingListId);
  res.json(GetEmailTemplateResponse.parse({ ...template, mailingListName }));
});

router.put("/email-templates/:id", async (req, res): Promise<void> => {
  const params = UpdateEmailTemplateParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const parsed = UpdateEmailTemplateBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [template] = await db.update(emailTemplatesTable).set({ ...parsed.data, updatedAt: new Date() }).where(eq(emailTemplatesTable.id, params.data.id)).returning();
  if (!template) {
    res.status(404).json({ error: "Email template not found" });
    return;
  }

  const mailingListName = await getMailingListName(template.mailingListId);
  res.json(ListEmailTemplatesResponseItem.parse({ ...template, mailingListName }));
});

router.delete("/email-templates/:id", async (req, res): Promise<void> => {
  const params = DeleteEmailTemplateParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const [template] = await db.delete(emailTemplatesTable).where(eq(emailTemplatesTable.id, params.data.id)).returning();
  if (!template) {
    res.status(404).json({ error: "Email template not found" });
    return;
  }
  res.sendStatus(204);
});

export default router;
