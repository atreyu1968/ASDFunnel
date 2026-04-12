import { Router, type IRouter, type Request, type Response } from "express";
import { eq, sql } from "drizzle-orm";
import {
  db,
  landingPagesTable,
  authorsTable,
  seriesTable,
  booksTable,
} from "@workspace/db";

const router: IRouter = Router();

interface EntityInfo {
  name: string;
  authorPenName: string;
  authorDomain: string | null;
  seriesName?: string;
  bookTitle?: string;
  bookCoverUrl?: string | null;
  books2readUrl?: string | null;
  description?: string | null;
}

async function getEntityInfo(entityType: string, entityId: number): Promise<EntityInfo | null> {
  if (entityType === "author") {
    const [author] = await db.select().from(authorsTable).where(eq(authorsTable.id, entityId));
    if (!author) return null;
    return {
      name: author.penName,
      authorPenName: author.penName,
      authorDomain: author.domain,
      description: author.bio,
    };
  }

  if (entityType === "series") {
    const [s] = await db.select().from(seriesTable).where(eq(seriesTable.id, entityId));
    if (!s) return null;
    const [author] = await db.select().from(authorsTable).where(eq(authorsTable.id, s.authorId));
    return {
      name: s.name,
      authorPenName: author?.penName || "",
      authorDomain: author?.domain || null,
      seriesName: s.name,
      description: s.description,
    };
  }

  if (entityType === "book") {
    const [book] = await db.select().from(booksTable).where(eq(booksTable.id, entityId));
    if (!book) return null;
    const [s] = await db.select().from(seriesTable).where(eq(seriesTable.id, book.seriesId));
    const [author] = s
      ? await db.select().from(authorsTable).where(eq(authorsTable.id, s.authorId))
      : [null];
    return {
      name: book.title,
      authorPenName: author?.penName || "",
      authorDomain: author?.domain || null,
      seriesName: s?.name,
      bookTitle: book.title,
      bookCoverUrl: book.coverImageUrl,
      books2readUrl: book.books2readUrl,
      description: book.description,
    };
  }

  return null;
}

async function findAuthorByDomain(host: string) {
  const cleanHost = host.replace(/:\d+$/, "").toLowerCase().replace(/^www\./, "");
  const authors = await db.select().from(authorsTable);
  return authors.find(a => {
    if (!a.domain) return false;
    const d = a.domain.toLowerCase().replace(/^www\./, "");
    return d === cleanHost;
  }) || null;
}

async function findLandingByPath(authorId: number, lang: string, slug: string) {
  const allPublished = await db.select().from(landingPagesTable)
    .where(eq(landingPagesTable.isPublished, true));

  const authorSeries = await db.select().from(seriesTable).where(eq(seriesTable.authorId, authorId));
  const seriesIds = authorSeries.map(s => s.id);

  let bookIds: number[] = [];
  if (seriesIds.length > 0) {
    const authorBooks = await db.select({ id: booksTable.id }).from(booksTable)
      .where(sql`${booksTable.seriesId} IN (${sql.join(seriesIds.map(id => sql`${id}`), sql`, `)})`);
    bookIds = authorBooks.map(b => b.id);
  }

  const authorPages = allPublished.filter(p => {
    if (p.entityType === "author" && p.entityId === authorId) return true;
    if (p.entityType === "series" && seriesIds.includes(p.entityId)) return true;
    if (p.entityType === "book" && bookIds.includes(p.entityId)) return true;
    return false;
  });

  return authorPages.find(p => {
    const urlPath = p.url.replace(/^https?:\/\/[^/]+/, "");
    return urlPath === `/${lang}/${slug}` && p.language === lang;
  }) || authorPages.find(p => {
    const urlPath = p.url.replace(/^https?:\/\/[^/]+/, "");
    return urlPath === `/${lang}/${slug}`;
  }) || null;
}

async function renderAuthorIndex(authorId: number, authorName: string, lang: string) {
  const allPublished = await db.select().from(landingPagesTable)
    .where(eq(landingPagesTable.isPublished, true));

  const authorSeries = await db.select().from(seriesTable).where(eq(seriesTable.authorId, authorId));
  const seriesIds = authorSeries.map(s => s.id);

  let bookIds: number[] = [];
  if (seriesIds.length > 0) {
    const authorBooks = await db.select({ id: booksTable.id }).from(booksTable)
      .where(sql`${booksTable.seriesId} IN (${sql.join(seriesIds.map(id => sql`${id}`), sql`, `)})`);
    bookIds = authorBooks.map(b => b.id);
  }

  const authorPages = allPublished.filter(p => {
    if (p.entityType === "author" && p.entityId === authorId) return true;
    if (p.entityType === "series" && seriesIds.includes(p.entityId)) return true;
    if (p.entityType === "book" && bookIds.includes(p.entityId)) return true;
    return false;
  });

  const authorPage = authorPages.find(p => p.entityType === "author" && p.language === lang)
    || authorPages.find(p => p.entityType === "author");

  if (authorPage) {
    return authorPage;
  }

  const langPages = authorPages.filter(p => p.language === lang);
  if (langPages.length === 1) return langPages[0];

  return null;
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function renderLandingHtml(page: typeof landingPagesTable.$inferSelect, entity: EntityInfo): string {
  const title = page.metaTitle || page.title || entity.name;
  const description = page.metaDescription || page.description || entity.description || "";
  const heading = page.captureHeading || `Suscríbete a ${entity.authorPenName}`;
  const subheading = page.captureSubheading || "Recibe contenido exclusivo directamente en tu bandeja de entrada.";
  const buttonText = page.captureButtonText || "Suscribirse";
  const captureUrl = `/api/capture/by-landing-page/${page.id}`;

  const coverSection = entity.bookCoverUrl
    ? `<div class="cover-section">
        <img src="${escapeHtml(entity.bookCoverUrl)}" alt="${escapeHtml(entity.name)}" class="book-cover" />
       </div>`
    : "";

  const books2readSection = entity.books2readUrl
    ? `<div class="books2read-section">
        <a href="${escapeHtml(entity.books2readUrl)}" target="_blank" rel="noopener" class="books2read-btn">
          &#128218; Comprar en tu tienda favorita
        </a>
       </div>`
    : "";

  const seriesBadge = entity.seriesName
    ? `<span class="series-badge">${escapeHtml(entity.seriesName)}</span>`
    : "";

  const entityDescription = page.description || entity.description || "";

  return `<!DOCTYPE html>
<html lang="${escapeHtml(page.language)}">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(title)}</title>
  <meta name="description" content="${escapeHtml(description)}">
  <meta property="og:title" content="${escapeHtml(title)}">
  <meta property="og:description" content="${escapeHtml(description)}">
  <meta property="og:type" content="website">
  ${entity.bookCoverUrl ? `<meta property="og:image" content="${escapeHtml(entity.bookCoverUrl)}">` : ""}
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: 'Georgia', 'Times New Roman', serif;
      background: linear-gradient(135deg, #0f0f23 0%, #1a1a2e 50%, #16213e 100%);
      color: #e0e0e0;
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .container { max-width: 640px; width: 100%; margin: 2rem auto; padding: 2rem; }
    .card {
      background: rgba(255,255,255,0.05);
      border: 1px solid rgba(255,255,255,0.1);
      border-radius: 16px;
      padding: 3rem 2.5rem;
      backdrop-filter: blur(10px);
      box-shadow: 0 25px 50px rgba(0,0,0,0.5);
    }
    .author-name {
      text-align: center; font-size: 0.85rem; text-transform: uppercase;
      letter-spacing: 3px; color: #8b8ba7; margin-bottom: 0.5rem;
    }
    .series-badge {
      display: inline-block; background: rgba(139, 92, 246, 0.2); color: #a78bfa;
      padding: 0.25rem 0.75rem; border-radius: 20px; font-size: 0.8rem; margin-bottom: 1rem;
    }
    .cover-section { text-align: center; margin: 1.5rem 0; }
    .book-cover {
      max-width: 220px; width: 100%; border-radius: 8px;
      box-shadow: 0 15px 35px rgba(0,0,0,0.4);
    }
    h1 { font-size: 1.8rem; text-align: center; margin: 1.5rem 0 0.75rem; color: #fff; line-height: 1.3; }
    .subheading { text-align: center; color: #a0a0b8; font-size: 1.05rem; line-height: 1.6; margin-bottom: 1.5rem; }
    .description { text-align: center; color: #8b8ba7; font-size: 0.95rem; line-height: 1.6; margin-bottom: 2rem; font-style: italic; }
    .capture-form { display: flex; flex-direction: column; gap: 0.75rem; margin-top: 1.5rem; }
    .form-row { display: flex; gap: 0.75rem; }
    .form-row input { flex: 1; }
    input[type="text"], input[type="email"] {
      width: 100%; padding: 0.85rem 1rem; border: 1px solid rgba(255,255,255,0.15);
      border-radius: 8px; background: rgba(255,255,255,0.08); color: #fff;
      font-size: 1rem; font-family: inherit; transition: border-color 0.3s;
    }
    input::placeholder { color: #6b6b80; }
    input:focus { outline: none; border-color: #8b5cf6; box-shadow: 0 0 0 3px rgba(139, 92, 246, 0.2); }
    .submit-btn {
      width: 100%; padding: 0.95rem; background: linear-gradient(135deg, #8b5cf6, #6d28d9);
      color: #fff; border: none; border-radius: 8px; font-size: 1.05rem; font-weight: 600;
      cursor: pointer; transition: transform 0.2s, box-shadow 0.2s; font-family: inherit; letter-spacing: 0.5px;
    }
    .submit-btn:hover { transform: translateY(-2px); box-shadow: 0 8px 25px rgba(139, 92, 246, 0.4); }
    .submit-btn:disabled { opacity: 0.6; cursor: not-allowed; transform: none; }
    .privacy-note { text-align: center; font-size: 0.75rem; color: #6b6b80; margin-top: 0.75rem; }
    .message { text-align: center; padding: 1rem; border-radius: 8px; margin-top: 1rem; display: none; }
    .message.success { background: rgba(34, 197, 94, 0.15); color: #4ade80; border: 1px solid rgba(34, 197, 94, 0.3); }
    .message.error { background: rgba(239, 68, 68, 0.15); color: #f87171; border: 1px solid rgba(239, 68, 68, 0.3); }
    .books2read-section { text-align: center; margin: 1.5rem 0; }
    .books2read-btn {
      display: inline-block; padding: 0.7rem 1.5rem; background: rgba(255,255,255,0.1);
      color: #e0e0e0; text-decoration: none; border-radius: 8px;
      border: 1px solid rgba(255,255,255,0.15); transition: all 0.3s; font-size: 0.95rem;
    }
    .books2read-btn:hover { background: rgba(255,255,255,0.15); border-color: #8b5cf6; }
    .divider { height: 1px; background: rgba(255,255,255,0.1); margin: 2rem 0; }
    @media (max-width: 480px) { .card { padding: 2rem 1.5rem; } h1 { font-size: 1.4rem; } .form-row { flex-direction: column; } }
  </style>
</head>
<body>
  <div class="container">
    <div class="card">
      <p class="author-name">${escapeHtml(entity.authorPenName)}</p>
      ${seriesBadge ? `<div style="text-align:center">${seriesBadge}</div>` : ""}
      ${coverSection}
      <h1>${escapeHtml(heading)}</h1>
      <p class="subheading">${escapeHtml(subheading)}</p>
      ${entityDescription ? `<p class="description">${escapeHtml(entityDescription)}</p>` : ""}
      ${books2readSection}
      ${page.mailingListId ? `
      <div class="divider"></div>
      <form class="capture-form" id="captureForm">
        <div class="form-row">
          <input type="text" name="firstName" placeholder="Nombre" />
          <input type="text" name="lastName" placeholder="Apellido" />
        </div>
        <input type="email" name="email" placeholder="Tu email" required />
        <button type="submit" class="submit-btn" id="submitBtn">${escapeHtml(buttonText)}</button>
        <p class="privacy-note">Tu privacidad es importante. No compartiremos tu email con nadie.</p>
      </form>
      <div class="message success" id="successMsg"></div>
      <div class="message error" id="errorMsg"></div>
      ` : ""}
    </div>
  </div>
  ${page.mailingListId ? `
  <script>
    document.getElementById('captureForm').addEventListener('submit', async function(e) {
      e.preventDefault();
      var btn = document.getElementById('submitBtn');
      var successMsg = document.getElementById('successMsg');
      var errorMsg = document.getElementById('errorMsg');
      btn.disabled = true;
      btn.textContent = 'Enviando...';
      successMsg.style.display = 'none';
      errorMsg.style.display = 'none';
      try {
        var formData = new FormData(this);
        var res = await fetch('${captureUrl}', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            email: formData.get('email'),
            firstName: formData.get('firstName') || undefined,
            lastName: formData.get('lastName') || undefined,
          }),
        });
        var data = await res.json();
        if (data.success) {
          successMsg.textContent = data.message;
          successMsg.style.display = 'block';
          this.reset();
        } else {
          errorMsg.textContent = data.message || 'Error al suscribirse.';
          errorMsg.style.display = 'block';
        }
      } catch (err) {
        errorMsg.textContent = 'Error de conexión. Inténtalo de nuevo.';
        errorMsg.style.display = 'block';
      } finally {
        btn.disabled = false;
        btn.textContent = '${escapeHtml(buttonText)}';
      }
    });
  </script>
  ` : ""}
</body>
</html>`;
}

function render404(lang: string): string {
  const msg = lang === "es" ? "Página no encontrada" : "Page not found";
  return `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>${msg}</title>
<style>body{font-family:sans-serif;background:#0f0f23;color:#e0e0e0;display:flex;align-items:center;justify-content:center;min-height:100vh;}
.c{text-align:center}h1{font-size:4rem;color:#8b5cf6}p{color:#8b8ba7;margin-top:1rem}</style>
</head><body><div class="c"><h1>404</h1><p>${msg}</p></div></body></html>`;
}

router.get("/api/public/landing-page/:id", async (req: Request, res: Response): Promise<void> => {
  const id = parseInt(String(req.params.id));
  if (isNaN(id)) { res.status(400).send("ID inválido"); return; }

  const [page] = await db.select().from(landingPagesTable).where(eq(landingPagesTable.id, id));
  if (!page || !page.isPublished) { res.status(404).send("Página no encontrada"); return; }

  const entity = await getEntityInfo(page.entityType, page.entityId);
  if (!entity) { res.status(404).send("Página no encontrada"); return; }

  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.send(renderLandingHtml(page, entity));
});

router.get("/api/public/landing-pages/by-domain", async (req: Request, res: Response): Promise<void> => {
  const domain = (req.query.domain as string || "").toLowerCase().trim();
  if (!domain) { res.status(400).json({ error: "Parámetro 'domain' requerido" }); return; }

  const author = await findAuthorByDomain(domain);
  if (!author) { res.status(404).json({ error: "Autor no encontrado para este dominio" }); return; }

  const allPages = await db.select().from(landingPagesTable).where(eq(landingPagesTable.isPublished, true));
  const authorSeries = await db.select().from(seriesTable).where(eq(seriesTable.authorId, author.id));
  const seriesIds = authorSeries.map(s => s.id);
  let bookIds: number[] = [];
  if (seriesIds.length > 0) {
    const authorBooks = await db.select({ id: booksTable.id }).from(booksTable)
      .where(sql`${booksTable.seriesId} IN (${sql.join(seriesIds.map(id => sql`${id}`), sql`, `)})`);
    bookIds = authorBooks.map(b => b.id);
  }
  const pages = allPages.filter(p => {
    if (p.entityType === "author" && p.entityId === author.id) return true;
    if (p.entityType === "series" && seriesIds.includes(p.entityId)) return true;
    if (p.entityType === "book" && bookIds.includes(p.entityId)) return true;
    return false;
  });

  res.json({ author: { id: author.id, penName: author.penName, domain: author.domain }, pages });
});

router.get("/:lang/:slug", async (req: Request, res: Response): Promise<void> => {
  const lang = String(req.params.lang);
  const slug = String(req.params.slug);
  if (!lang || !slug) { res.status(404).send(render404("es")); return; }
  if (!/^[a-z]{2}$/.test(lang)) { res.status(404).send(render404("es")); return; }

  const host = (req.hostname || String(req.headers.host || "")).replace(/:\d+$/, "").toLowerCase();

  const adminDomain = (process.env.ADMIN_DOMAIN || "").toLowerCase().replace(/^www\./, "");
  if (adminDomain && host.replace(/^www\./, "") === adminDomain) {
    (res as any).skipToNext = true;
    return;
  }

  const author = await findAuthorByDomain(host);

  if (author) {
    const page = await findLandingByPath(author.id, lang, slug);
    if (page) {
      const entity = await getEntityInfo(page.entityType, page.entityId);
      if (entity) {
        res.setHeader("Content-Type", "text/html; charset=utf-8");
        res.send(renderLandingHtml(page, entity));
        return;
      }
    }
    res.status(404).send(render404(lang));
    return;
  }

  const allPublished = await db.select().from(landingPagesTable)
    .where(eq(landingPagesTable.isPublished, true));
  const targetPath = `/${lang}/${slug}`;
  const page = allPublished.find(p => {
    const urlPath = p.url.replace(/^https?:\/\/[^/]+/, "");
    return urlPath === targetPath;
  });

  if (page) {
    const entity = await getEntityInfo(page.entityType, page.entityId);
    if (entity) {
      res.setHeader("Content-Type", "text/html; charset=utf-8");
      res.send(renderLandingHtml(page, entity));
      return;
    }
  }

  res.status(404).send(render404(lang));
});

router.get("/", async (req: Request, res: Response, next: Function): Promise<void> => {
  const host = (req.hostname || String(req.headers.host || "")).replace(/:\d+$/, "").toLowerCase();

  const adminDomain = (process.env.ADMIN_DOMAIN || "").toLowerCase().replace(/^www\./, "");
  if (adminDomain && host.replace(/^www\./, "") === adminDomain) {
    next();
    return;
  }

  const author = await findAuthorByDomain(host);
  if (!author) {
    next();
    return;
  }

  const defaultLang = "es";
  const page = await renderAuthorIndex(author.id, author.penName, defaultLang);
  if (page) {
    const entity = await getEntityInfo(page.entityType, page.entityId);
    if (entity) {
      res.setHeader("Content-Type", "text/html; charset=utf-8");
      res.send(renderLandingHtml(page, entity));
      return;
    }
  }

  const allPublished = await db.select().from(landingPagesTable)
    .where(eq(landingPagesTable.isPublished, true));
  const authorSeries = await db.select().from(seriesTable).where(eq(seriesTable.authorId, author.id));
  const seriesIds = authorSeries.map(s => s.id);
  let bookIds: number[] = [];
  if (seriesIds.length > 0) {
    const authorBooks = await db.select({ id: booksTable.id }).from(booksTable)
      .where(sql`${booksTable.seriesId} IN (${sql.join(seriesIds.map(id => sql`${id}`), sql`, `)})`);
    bookIds = authorBooks.map(b => b.id);
  }
  const authorPages = allPublished.filter(p => {
    if (p.entityType === "author" && p.entityId === author.id) return true;
    if (p.entityType === "series" && seriesIds.includes(p.entityId)) return true;
    if (p.entityType === "book" && bookIds.includes(p.entityId)) return true;
    return false;
  });

  if (authorPages.length > 0) {
    const entity = await getEntityInfo(authorPages[0].entityType, authorPages[0].entityId);
    if (entity) {
      res.setHeader("Content-Type", "text/html; charset=utf-8");
      res.send(renderLandingHtml(authorPages[0], entity));
      return;
    }
  }

  res.status(404).send(render404(defaultLang));
});

export default router;
