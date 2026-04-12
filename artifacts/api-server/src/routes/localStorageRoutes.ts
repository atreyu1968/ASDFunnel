import { Router, type IRouter, type Request, type Response } from "express";
import { LocalFileStorageService, ObjectNotFoundError } from "../lib/localFileStorage";

const router: IRouter = Router();
const localStorageService = new LocalFileStorageService();

localStorageService.init().catch(console.error);

const MAX_UPLOAD_SIZE = 50 * 1024 * 1024;

router.post("/storage/uploads/request-url", async (req: Request, res: Response) => {
  try {
    const { name, size, contentType } = req.body;
    if (size > MAX_UPLOAD_SIZE) {
      res.status(400).json({ error: `File too large. Maximum size is ${MAX_UPLOAD_SIZE / 1024 / 1024}MB` });
      return;
    }
    const objectPath = await localStorageService.getObjectEntityUploadURL();
    const proto = req.headers["x-forwarded-proto"] || req.protocol || "http";
    const host = req.headers["x-forwarded-host"] || req.headers.host;
    const baseUrl = process.env.APP_BASE_URL || (host ? `${proto}://${host}` : `http://localhost:${process.env.PORT || "5000"}`);
    const uploadURL = `${baseUrl}/api/storage/upload-local${objectPath}`;
    res.json({ uploadURL, objectPath, metadata: { name, size, contentType } });
  } catch (error) {
    req.log.error({ err: error }, "Error generating upload path");
    res.status(500).json({ error: "Failed to generate upload URL" });
  }
});

router.put("/storage/upload-local/objects/*path", (req: Request, res: Response) => {
  const raw = req.params.path;
  const wildcardPath = Array.isArray(raw) ? raw.join("/") : raw;
  const objectPath = `/objects/${wildcardPath}`;

  let totalSize = 0;
  const chunks: Buffer[] = [];

  req.on("data", (chunk: Buffer) => {
    totalSize += chunk.length;
    if (totalSize > MAX_UPLOAD_SIZE) {
      req.destroy();
      res.status(413).json({ error: "File too large" });
      return;
    }
    chunks.push(chunk);
  });

  req.on("error", (err) => {
    req.log?.error?.({ err }, "Upload stream error");
    if (!res.headersSent) {
      res.status(500).json({ error: "Upload failed" });
    }
  });

  req.on("end", async () => {
    if (res.headersSent) return;
    try {
      const data = Buffer.concat(chunks);
      const contentType = req.headers["content-type"] || "application/octet-stream";
      await localStorageService.saveUploadedFile(objectPath, data, contentType);
      res.status(200).json({ ok: true });
    } catch (error) {
      req.log?.error?.({ err: error }, "Error saving uploaded file");
      if (!res.headersSent) {
        res.status(500).json({ error: "Failed to save file" });
      }
    }
  });
});

router.get("/storage/objects/*path", async (req: Request, res: Response) => {
  try {
    const raw = req.params.path;
    const wildcardPath = Array.isArray(raw) ? raw.join("/") : raw;
    const objectPath = `/objects/${wildcardPath}`;
    const filePath = await localStorageService.getObjectEntityFile(objectPath);
    const { stream, contentType, size } = await localStorageService.downloadObject(filePath);
    res.setHeader("Content-Type", contentType);
    res.setHeader("Content-Length", String(size));
    res.setHeader("Cache-Control", "public, max-age=3600");
    stream.pipe(res);
  } catch (error) {
    if (error instanceof ObjectNotFoundError) {
      res.status(404).json({ error: "Object not found" });
      return;
    }
    req.log.error({ err: error }, "Error serving object");
    res.status(500).json({ error: "Failed to serve object" });
  }
});

export default router;
