import { Router, type Request, type Response } from "express";
import crypto from "crypto";
import path from "path";
import { eq } from "drizzle-orm";
import { db, booksTable } from "@workspace/db";

const router = Router();

const DOWNLOAD_SECRET = process.env.SESSION_SECRET || process.env.ADMIN_PASSWORD_HASH || "dev-only-insecure";
const DOWNLOAD_EXPIRY_MS = 24 * 60 * 60 * 1000;

export function generateDownloadToken(bookId: number, format: string): string {
  const expires = Date.now() + DOWNLOAD_EXPIRY_MS;
  const payload = `${bookId}:${format}:${expires}`;
  const signature = crypto
    .createHmac("sha256", DOWNLOAD_SECRET)
    .update(payload)
    .digest("hex");
  const token = Buffer.from(`${payload}:${signature}`).toString("base64url");
  return token;
}

export function generateDownloadUrl(bookId: number, format: string): string {
  const token = generateDownloadToken(bookId, format);
  const baseUrl = process.env.APP_BASE_URL || `http://localhost:${process.env.PORT || 5000}`;
  return `${baseUrl}/api/public/download/${token}`;
}

function verifyDownloadToken(token: string): { bookId: number; format: string } | null {
  try {
    const decoded = Buffer.from(token, "base64url").toString("utf-8");
    const parts = decoded.split(":");
    if (parts.length !== 4) return null;

    const [bookIdStr, format, expiresStr, signature] = parts;
    const bookId = parseInt(bookIdStr);
    const expires = parseInt(expiresStr);

    if (isNaN(bookId) || isNaN(expires)) return null;
    if (Date.now() > expires) return null;

    const payload = `${bookId}:${format}:${expires}`;
    const expected = crypto
      .createHmac("sha256", DOWNLOAD_SECRET)
      .update(payload)
      .digest("hex");

    if (!crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) {
      return null;
    }

    return { bookId, format };
  } catch {
    return null;
  }
}

const FORMAT_FIELDS: Record<string, "downloadEpubPath" | "downloadPdfPath" | "downloadAzw3Path"> = {
  epub: "downloadEpubPath",
  pdf: "downloadPdfPath",
  azw3: "downloadAzw3Path",
};

const FORMAT_NAMES: Record<string, string> = {
  epub: "epub",
  pdf: "pdf",
  azw3: "azw3",
};

router.get("/public/download/:token", async (req: Request, res: Response): Promise<void> => {
  const tokenParam = String(req.params.token);
  const result = verifyDownloadToken(tokenParam);

  if (!result) {
    res.status(403).send(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>Enlace expirado</title>
<style>body{font-family:system-ui;display:flex;justify-content:center;align-items:center;min-height:100vh;margin:0;background:#0f172a;color:#e2e8f0}
.c{text-align:center;max-width:400px;padding:2rem}h1{color:#f59e0b;font-size:2rem}p{margin-top:1rem;color:#94a3b8}</style></head>
<body><div class="c"><h1>Enlace expirado</h1><p>Este enlace de descarga ha expirado o no es valido. Contacta al autor para solicitar uno nuevo.</p></div></body></html>`);
    return;
  }

  const { bookId, format } = result;
  const field = FORMAT_FIELDS[format];
  if (!field) {
    res.status(400).send("Formato no valido");
    return;
  }

  const [book] = await db.select().from(booksTable).where(eq(booksTable.id, bookId));
  if (!book) {
    res.status(404).send("Libro no encontrado");
    return;
  }

  const filePath = book[field];
  if (!filePath) {
    res.status(404).send("Archivo no disponible en este formato");
    return;
  }

  const ext = FORMAT_NAMES[format] || format;
  const safeTitle = (book.title || "libro").replace(/[^a-zA-Z0-9_-]/g, "_");
  const filename = `${safeTitle}.${ext}`;

  const isReplit = !!process.env.REPL_ID;

  try {
    if (isReplit) {
      const { ObjectStorageService } = await import("../lib/objectStorage");
      const storageService = new ObjectStorageService();
      const objectPath = filePath.replace(/^\/api\/storage/, "");
      const objectFile = await storageService.getObjectEntityFile(objectPath);
      const [data] = await objectFile.download();
      const buffer = Buffer.from(data);

      const mimeMap: Record<string, string> = {
        epub: "application/epub+zip",
        pdf: "application/pdf",
        azw3: "application/vnd.amazon.ebook",
      };

      res.setHeader("Content-Type", mimeMap[format] || "application/octet-stream");
      res.setHeader("Content-Length", String(buffer.length));
      res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
      res.setHeader("Cache-Control", "no-store");
      res.send(buffer);
    } else {
      const { LocalFileStorageService, ObjectNotFoundError } = await import("../lib/localFileStorage");
      const storage = new LocalFileStorageService();
      await storage.init();

      const objectPath = filePath.startsWith("/api/storage") ? filePath.replace("/api/storage", "") : filePath;
      const resolvedPath = await storage.getObjectEntityFile(objectPath);
      const { stream, contentType, size } = await storage.downloadObject(resolvedPath);

      res.setHeader("Content-Type", contentType);
      res.setHeader("Content-Length", String(size));
      res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
      res.setHeader("Cache-Control", "no-store");
      stream.pipe(res);
    }
  } catch (error: any) {
    if (error?.name === "ObjectNotFoundError" || error?.message?.includes("not found")) {
      res.status(404).send("Archivo no encontrado en el servidor");
      return;
    }
    res.status(500).send("Error al descargar el archivo");
  }
});

export default router;
