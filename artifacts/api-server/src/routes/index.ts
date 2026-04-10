import { Router, type IRouter } from "express";
import healthRouter from "./health";
import authorsRouter from "./authors";
import seriesRouter from "./series";
import booksRouter from "./books";
import mailingListsRouter from "./mailing-lists";
import subscribersRouter from "./subscribers";
import dashboardRouter from "./dashboard";

const router: IRouter = Router();

router.use(healthRouter);
router.use(authorsRouter);
router.use(seriesRouter);
router.use(booksRouter);
router.use(mailingListsRouter);
router.use(subscribersRouter);
router.use(dashboardRouter);

export default router;
