import { Router, type IRouter } from "express";
import healthRouter from "./health";
import authorsRouter from "./authors";
import seriesRouter from "./series";
import booksRouter from "./books";
import mailingListsRouter from "./mailing-lists";
import subscribersRouter from "./subscribers";
import dashboardRouter from "./dashboard";
import landingPagesRouter from "./landing-pages";
import emailTemplatesRouter from "./email-templates";
import automationsRouter from "./automations";
import captureRouter from "./capture";
import confirmationRouter from "./confirmation";
import settingsRouter from "./settings";
import aiRouter from "./ai";

const isReplit = !!process.env.REPL_ID;

let storageRouter: IRouter;
if (isReplit) {
  storageRouter = (await import("./storage")).default;
} else {
  storageRouter = (await import("./localStorageRoutes")).default;
}

const router: IRouter = Router();

router.use(healthRouter);
router.use(authorsRouter);
router.use(seriesRouter);
router.use(booksRouter);
router.use(mailingListsRouter);
router.use(subscribersRouter);
router.use(dashboardRouter);
router.use(landingPagesRouter);
router.use(emailTemplatesRouter);
router.use(automationsRouter);
router.use(captureRouter);
router.use(confirmationRouter);
router.use(settingsRouter);
router.use(storageRouter);
router.use(aiRouter);

export default router;
