import { Router, type Request, type Response } from "express";
import crypto from "crypto";

const router = Router();

const activeSessions = new Set<string>();

function verifyPassword(plain: string, stored: string): boolean {
  const parts = stored.split(":");
  if (parts.length !== 2) return false;
  const [salt, hash] = parts;
  return new Promise<boolean>((resolve) => {
    crypto.scrypt(plain, salt, 64, (err, key) => {
      if (err) { resolve(false); return; }
      resolve(key.toString("hex") === hash);
    });
  }) as unknown as boolean;
}

async function verifyPasswordAsync(plain: string, stored: string): Promise<boolean> {
  const parts = stored.split(":");
  if (parts.length !== 2) return false;
  const [salt, hash] = parts;
  return new Promise<boolean>((resolve) => {
    crypto.scrypt(plain, salt, 64, (err, key) => {
      if (err) { resolve(false); return; }
      resolve(key.toString("hex") === hash);
    });
  });
}

router.post("/auth/login", async (req: Request, res: Response): Promise<void> => {
  const { password } = req.body as { password?: string };
  const storedHash = process.env.ADMIN_PASSWORD_HASH;

  if (!storedHash) {
    res.status(500).json({ error: "Contraseña de admin no configurada en el servidor" });
    return;
  }

  if (!password) {
    res.status(400).json({ error: "Contraseña requerida" });
    return;
  }

  const valid = await verifyPasswordAsync(password, storedHash);
  if (!valid) {
    res.status(401).json({ error: "Contraseña incorrecta" });
    return;
  }

  const token = crypto.randomBytes(32).toString("hex");
  activeSessions.add(token);

  const secure = process.env.SECURE_COOKIES === "true";
  res.cookie("asd_session", token, {
    httpOnly: true,
    secure,
    sameSite: "lax",
    maxAge: 7 * 24 * 60 * 60 * 1000,
    path: "/",
  });

  res.json({ ok: true });
});

router.get("/auth/check", (req: Request, res: Response): void => {
  const token = req.cookies?.asd_session;
  if (!token || !activeSessions.has(token)) {
    res.status(401).json({ authenticated: false });
    return;
  }
  res.json({ authenticated: true });
});

router.post("/auth/logout", (req: Request, res: Response): void => {
  const token = req.cookies?.asd_session;
  if (token) {
    activeSessions.delete(token);
  }
  res.clearCookie("asd_session", { path: "/" });
  res.json({ ok: true });
});

export { activeSessions };
export default router;
