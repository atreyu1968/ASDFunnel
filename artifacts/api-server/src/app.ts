import express, { type Express } from "express";
import path from "path";
import cors from "cors";
import cookieParser from "cookie-parser";
import pinoHttp from "pino-http";
import router from "./routes";
import authRouter from "./routes/auth";
import publicLandingRouter from "./routes/public-landing";
import { requireAuth } from "./middleware/auth";
import { logger } from "./lib/logger";

const app: Express = express();

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);
app.use(cors({ origin: true, credentials: true }));
app.use(cookieParser());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use("/api", authRouter);

app.use(requireAuth);

app.use("/api", router);

app.use(publicLandingRouter);

if (process.env.NODE_ENV === "production") {
  const frontendDist = process.env.FRONTEND_DIST_PATH
    || path.resolve(__dirname, "..", "..", "lennox-admin", "dist", "public");
  app.use(express.static(frontendDist));
  app.get("*", (_req, res) => {
    res.sendFile(path.join(frontendDist, "index.html"));
  });
}

export default app;
