import { Router, type IRouter } from "express";
import { eq, sql, desc, asc } from "drizzle-orm";
import { db, authorsTable, seriesTable, booksTable, activityTable, mailingListsTable, subscribersTable, automationRulesTable, landingPagesTable } from "@workspace/db";
import {
  GetDashboardSummaryResponse,
  GetPublicationCalendarResponse,
  GetFunnelOverviewResponse,
  GetSeriesProgressResponse,
  GetRecentActivityResponse,
  GetSubscriberStatsResponse,
} from "@workspace/api-zod";

const router: IRouter = Router();

router.get("/dashboard/summary", async (_req, res): Promise<void> => {
  const [authorCount] = await db.select({ count: sql<number>`count(*)::int` }).from(authorsTable);
  const [seriesCount] = await db.select({ count: sql<number>`count(*)::int` }).from(seriesTable);
  const [bookCount] = await db.select({ count: sql<number>`count(*)::int` }).from(booksTable);
  const [publishedCount] = await db.select({ count: sql<number>`count(*)::int` }).from(booksTable).where(eq(booksTable.status, "published"));
  const [scheduledCount] = await db.select({ count: sql<number>`count(*)::int` }).from(booksTable).where(eq(booksTable.status, "scheduled"));
  const [productionCount] = await db.select({ count: sql<number>`count(*)::int` }).from(booksTable).where(eq(booksTable.status, "production"));
  const [draftCount] = await db.select({ count: sql<number>`count(*)::int` }).from(booksTable).where(eq(booksTable.status, "draft"));

  const [leadMagnetCount] = await db.select({ count: sql<number>`count(*)::int` }).from(booksTable).where(eq(booksTable.funnelRole, "lead_magnet"));
  const [trafficEntryCount] = await db.select({ count: sql<number>`count(*)::int` }).from(booksTable).where(eq(booksTable.funnelRole, "traffic_entry"));
  const [coreOfferCount] = await db.select({ count: sql<number>`count(*)::int` }).from(booksTable).where(eq(booksTable.funnelRole, "core_offer"));
  const [crossoverCount] = await db.select({ count: sql<number>`count(*)::int` }).from(booksTable).where(eq(booksTable.funnelRole, "crossover_bridge"));

  const [subscriberCount] = await db.select({ count: sql<number>`count(*)::int` }).from(subscribersTable).where(eq(subscribersTable.status, "active"));
  const [activeListCount] = await db.select({ count: sql<number>`count(*)::int` }).from(mailingListsTable).where(eq(mailingListsTable.isActive, true));
  const [activeAutomationsCount] = await db.select({ count: sql<number>`count(*)::int` }).from(automationRulesTable).where(eq(automationRulesTable.isActive, true));
  const [landingPageCount] = await db.select({ count: sql<number>`count(*)::int` }).from(landingPagesTable);

  const nextReleaseBooks = await db
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
    .where(eq(booksTable.status, "scheduled"))
    .orderBy(asc(booksTable.scheduledDate))
    .limit(1);

  res.json(GetDashboardSummaryResponse.parse({
    totalAuthors: authorCount.count,
    totalSeries: seriesCount.count,
    totalBooks: bookCount.count,
    publishedBooks: publishedCount.count,
    scheduledBooks: scheduledCount.count,
    inProductionBooks: productionCount.count,
    draftBooks: draftCount.count,
    nextRelease: nextReleaseBooks[0] ?? null,
    booksByFunnelRole: {
      leadMagnet: leadMagnetCount.count,
      trafficEntry: trafficEntryCount.count,
      coreOffer: coreOfferCount.count,
      crossoverBridge: crossoverCount.count,
    },
    totalSubscribers: subscriberCount.count,
    activeMailingLists: activeListCount.count,
    activeAutomations: activeAutomationsCount.count,
    totalLandingPages: landingPageCount.count,
  }));
});

router.get("/dashboard/publication-calendar", async (_req, res): Promise<void> => {
  const books = await db
    .select({
      bookId: booksTable.id,
      title: booksTable.title,
      seriesName: seriesTable.name,
      authorPenName: authorsTable.penName,
      language: booksTable.language,
      scheduledDate: booksTable.scheduledDate,
      publicationDate: booksTable.publicationDate,
      status: booksTable.status,
      funnelRole: booksTable.funnelRole,
      bookNumber: booksTable.bookNumber,
    })
    .from(booksTable)
    .innerJoin(seriesTable, eq(booksTable.seriesId, seriesTable.id))
    .innerJoin(authorsTable, eq(seriesTable.authorId, authorsTable.id))
    .orderBy(asc(booksTable.scheduledDate), asc(booksTable.publicationDate));

  res.json(GetPublicationCalendarResponse.parse(books));
});

router.get("/dashboard/funnel-overview", async (_req, res): Promise<void> => {
  const roles = [
    { role: "lead_magnet", label: "Lead Magnet" },
    { role: "traffic_entry", label: "Entrada de Trafico" },
    { role: "core_offer", label: "Oferta Principal" },
    { role: "crossover_bridge", label: "Puente Crossover" },
  ];

  const stages = await Promise.all(
    roles.map(async ({ role, label }) => {
      const books = await db
        .select({
          id: booksTable.id,
          title: booksTable.title,
          seriesName: seriesTable.name,
          status: booksTable.status,
          pricingStrategy: booksTable.pricingStrategy,
          price: booksTable.price,
        })
        .from(booksTable)
        .innerJoin(seriesTable, eq(booksTable.seriesId, seriesTable.id))
        .where(eq(booksTable.funnelRole, role));

      return { role, label, count: books.length, books };
    })
  );

  res.json(GetFunnelOverviewResponse.parse({ stages }));
});

router.get("/dashboard/series-progress", async (_req, res): Promise<void> => {
  const allSeries = await db
    .select({
      seriesId: seriesTable.id,
      seriesName: seriesTable.name,
      authorPenName: authorsTable.penName,
      language: seriesTable.language,
      status: seriesTable.status,
    })
    .from(seriesTable)
    .innerJoin(authorsTable, eq(seriesTable.authorId, authorsTable.id))
    .orderBy(seriesTable.displayOrder);

  const progress = await Promise.all(
    allSeries.map(async (s) => {
      const [total] = await db.select({ count: sql<number>`count(*)::int` }).from(booksTable).where(eq(booksTable.seriesId, s.seriesId));
      const [published] = await db.select({ count: sql<number>`count(*)::int` }).from(booksTable).where(sql`${booksTable.seriesId} = ${s.seriesId} AND ${booksTable.status} = 'published'`);
      const [scheduled] = await db.select({ count: sql<number>`count(*)::int` }).from(booksTable).where(sql`${booksTable.seriesId} = ${s.seriesId} AND ${booksTable.status} = 'scheduled'`);
      const [draft] = await db.select({ count: sql<number>`count(*)::int` }).from(booksTable).where(sql`${booksTable.seriesId} = ${s.seriesId} AND ${booksTable.status} = 'draft'`);

      const crossoverBooks = await db.select({ crossoverToSeriesId: booksTable.crossoverToSeriesId })
        .from(booksTable)
        .where(sql`${booksTable.seriesId} = ${s.seriesId} AND ${booksTable.crossoverToSeriesId} IS NOT NULL`)
        .limit(1);

      let crossoverToSeriesName = null;
      if (crossoverBooks.length > 0 && crossoverBooks[0].crossoverToSeriesId) {
        const [crossSeries] = await db.select({ name: seriesTable.name }).from(seriesTable).where(eq(seriesTable.id, crossoverBooks[0].crossoverToSeriesId));
        crossoverToSeriesName = crossSeries?.name ?? null;
      }

      const totalCount = total.count;
      const publishedCount = published.count;
      const progressPercent = totalCount > 0 ? Math.round((publishedCount / totalCount) * 100) : 0;

      return {
        ...s,
        totalBooks: totalCount,
        publishedBooks: publishedCount,
        scheduledBooks: scheduled.count,
        draftBooks: draft.count,
        progressPercent,
        hasCrossover: crossoverBooks.length > 0,
        crossoverToSeriesName,
      };
    })
  );

  res.json(GetSeriesProgressResponse.parse(progress));
});

router.get("/dashboard/recent-activity", async (_req, res): Promise<void> => {
  const activities = await db
    .select({
      id: activityTable.id,
      bookId: activityTable.bookId,
      bookTitle: booksTable.title,
      seriesName: seriesTable.name,
      action: activityTable.action,
      timestamp: activityTable.timestamp,
    })
    .from(activityTable)
    .innerJoin(booksTable, eq(activityTable.bookId, booksTable.id))
    .innerJoin(seriesTable, eq(booksTable.seriesId, seriesTable.id))
    .orderBy(desc(activityTable.timestamp))
    .limit(20);

  res.json(GetRecentActivityResponse.parse(activities));
});

router.get("/dashboard/subscriber-stats", async (_req, res): Promise<void> => {
  const [totalSubs] = await db.select({ count: sql<number>`count(*)::int` }).from(subscribersTable);
  const [activeSubs] = await db.select({ count: sql<number>`count(*)::int` }).from(subscribersTable).where(eq(subscribersTable.status, "active"));
  const [unsubs] = await db.select({ count: sql<number>`count(*)::int` }).from(subscribersTable).where(eq(subscribersTable.status, "unsubscribed"));
  const [bounced] = await db.select({ count: sql<number>`count(*)::int` }).from(subscribersTable).where(eq(subscribersTable.status, "bounced"));
  const [totalLists] = await db.select({ count: sql<number>`count(*)::int` }).from(mailingListsTable);
  const [activeLists] = await db.select({ count: sql<number>`count(*)::int` }).from(mailingListsTable).where(eq(mailingListsTable.isActive, true));

  const byLanguage = await db
    .select({ language: subscribersTable.language, count: sql<number>`count(*)::int` })
    .from(subscribersTable)
    .groupBy(subscribersTable.language);

  const byAuthor = await db
    .select({ authorPenName: authorsTable.penName, count: sql<number>`count(*)::int` })
    .from(subscribersTable)
    .innerJoin(mailingListsTable, eq(subscribersTable.mailingListId, mailingListsTable.id))
    .innerJoin(authorsTable, eq(mailingListsTable.authorId, authorsTable.id))
    .groupBy(authorsTable.penName);

  const bySource = await db
    .select({ source: subscribersTable.source, count: sql<number>`count(*)::int` })
    .from(subscribersTable)
    .groupBy(subscribersTable.source);

  const recentSubs = await db
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
    .orderBy(desc(subscribersTable.subscribedAt))
    .limit(10);

  const growthByMonth = await db
    .select({
      month: sql<string>`to_char(${subscribersTable.subscribedAt}, 'YYYY-MM')`,
      count: sql<number>`count(*)::int`,
    })
    .from(subscribersTable)
    .groupBy(sql`to_char(${subscribersTable.subscribedAt}, 'YYYY-MM')`)
    .orderBy(sql`to_char(${subscribersTable.subscribedAt}, 'YYYY-MM')`);

  res.json(GetSubscriberStatsResponse.parse({
    totalSubscribers: totalSubs.count,
    activeSubscribers: activeSubs.count,
    unsubscribed: unsubs.count,
    bounced: bounced.count,
    totalMailingLists: totalLists.count,
    activeMailingLists: activeLists.count,
    subscribersByLanguage: byLanguage,
    subscribersByAuthor: byAuthor,
    subscribersBySource: bySource,
    recentSubscribers: recentSubs,
    growthByMonth,
  }));
});

export default router;
