import { randomUUID } from "crypto";
import path from "path";
import fs from "fs/promises";
import { existsSync, createReadStream } from "fs";
import { Readable } from "stream";

const UPLOAD_DIR = process.env.UPLOAD_DIR || path.resolve(process.cwd(), "uploads");

export class ObjectNotFoundError extends Error {
  constructor() {
    super("Object not found");
    this.name = "ObjectNotFoundError";
    Object.setPrototypeOf(this, ObjectNotFoundError.prototype);
  }
}

async function ensureDir(dir: string) {
  if (!existsSync(dir)) {
    await fs.mkdir(dir, { recursive: true });
  }
}

function resolveAndContain(base: string, relativePath: string): string {
  const resolved = path.resolve(base, relativePath);
  const normalizedBase = path.resolve(base);
  if (!resolved.startsWith(normalizedBase + path.sep) && resolved !== normalizedBase) {
    throw new Error("Path traversal detected");
  }
  return resolved;
}

export class LocalFileStorageService {
  private uploadDir: string;

  constructor() {
    this.uploadDir = path.resolve(UPLOAD_DIR);
  }

  async init() {
    await ensureDir(this.uploadDir);
  }

  async getObjectEntityUploadURL(): Promise<string> {
    await ensureDir(path.join(this.uploadDir, "uploads"));
    const objectId = randomUUID();
    const localPath = `/objects/uploads/${objectId}`;
    return localPath;
  }

  normalizeObjectEntityPath(rawPath: string): string {
    if (rawPath.startsWith("/objects/")) {
      return rawPath;
    }
    return rawPath;
  }

  async saveUploadedFile(objectPath: string, data: Buffer, contentType?: string): Promise<void> {
    const relativePath = objectPath.startsWith("/objects/") ? objectPath.slice(9) : objectPath;
    const filePath = resolveAndContain(this.uploadDir, relativePath);
    await ensureDir(path.dirname(filePath));
    await fs.writeFile(filePath, data);
    if (contentType) {
      await fs.writeFile(filePath + ".meta", JSON.stringify({ contentType }));
    }
  }

  async getObjectEntityFile(objectPath: string): Promise<string> {
    if (!objectPath.startsWith("/objects/")) {
      throw new ObjectNotFoundError();
    }
    const relativePath = objectPath.slice(9);
    const filePath = resolveAndContain(this.uploadDir, relativePath);
    if (!existsSync(filePath)) {
      throw new ObjectNotFoundError();
    }
    return filePath;
  }

  async downloadObject(filePath: string): Promise<{ stream: Readable; contentType: string; size: number }> {
    const resolvedFile = path.resolve(filePath);
    const resolvedBase = path.resolve(this.uploadDir);
    if (!resolvedFile.startsWith(resolvedBase + path.sep) && resolvedFile !== resolvedBase) {
      throw new ObjectNotFoundError();
    }

    const stats = await fs.stat(filePath);
    let contentType = "application/octet-stream";
    const metaPath = filePath + ".meta";
    if (existsSync(metaPath)) {
      try {
        const meta = JSON.parse(await fs.readFile(metaPath, "utf-8"));
        contentType = meta.contentType || contentType;
      } catch {}
    } else {
      const ext = path.extname(filePath).toLowerCase();
      const mimeMap: Record<string, string> = {
        ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png",
        ".gif": "image/gif", ".webp": "image/webp", ".svg": "image/svg+xml",
        ".pdf": "application/pdf",
        ".epub": "application/epub+zip",
        ".azw3": "application/vnd.amazon.ebook",
        ".mobi": "application/x-mobipocket-ebook",
        ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      };
      contentType = mimeMap[ext] || contentType;
    }
    return {
      stream: createReadStream(filePath),
      contentType,
      size: stats.size,
    };
  }
}
