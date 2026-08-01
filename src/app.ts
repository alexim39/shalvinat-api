import compression from "compression";
import cors from "cors";
import express from "express";
import rateLimit from "express-rate-limit";
import helmet from "helmet";
import morgan from "morgan";
import { env } from "./config/env.js";
import { auditTrail } from "./middleware/audit.js";
import { errorHandler, notFoundHandler } from "./middleware/error-handler.js";
import { requestContext } from "./middleware/request-context.js";
import { accountingRouter } from "./routes/accounting.routes.js";
import { adminRouter } from "./routes/admin.routes.js";
import { authRouter } from "./routes/auth.routes.js";
import { bedRouter } from "./routes/bed.routes.js";
import { billingRouter } from "./routes/billing.routes.js";
import { clinicalRouter } from "./routes/clinical.routes.js";
import { directorRouter } from "./routes/director.routes.js";
import { labRouter } from "./routes/lab.routes.js";
import { managementRouter } from "./routes/management.routes.js";
import { notificationRouter } from "./routes/notification.routes.js";
import { nursingRouter } from "./routes/nursing.routes.js";
import { patientRouter } from "./routes/patient.routes.js";
import { pharmacyRouter } from "./routes/pharmacy.routes.js";
import { radiologyRouter } from "./routes/radiology.routes.js";
import { visitRouter } from "./routes/visit.routes.js";

export function createApp() {
  const app = express();

  app.set("trust proxy", 1);
  app.use(requestContext);
  app.use(
    helmet({
      crossOriginResourcePolicy: { policy: "cross-origin" },
    }),
  );
  app.use(
    cors({
      origin: env.CLIENT_ORIGIN.split(",").map((o) => o.trim()),
      credentials: true,
    }),
  );
  app.use(compression());
  app.use(express.json({ limit: "1mb" }));
  app.use(express.urlencoded({ extended: true }));
  app.use(morgan(env.NODE_ENV === "production" ? "combined" : "dev"));
  app.use(
    rateLimit({
      windowMs: 15 * 60 * 1000,
      limit: 500,
      standardHeaders: true,
      legacyHeaders: false,
    }),
  );

  if (env.NODE_ENV === "production") {
    app.use((req, res, next) => {
      if (req.secure || req.header("x-forwarded-proto") === "https") {
        return next();
      }
      return res.redirect(301, `https://${req.headers.host}${req.originalUrl}`);
    });
  }

  app.get("/health", (_req, res) => {
    res.json({ status: "ok", service: "shalvinat-hms-api" });
  });

  app.use(auditTrail);
  app.use(`${env.API_PREFIX}/auth`, authRouter);
  app.use(`${env.API_PREFIX}/patients`, patientRouter);
  app.use(`${env.API_PREFIX}/accounting`, accountingRouter);
  app.use(`${env.API_PREFIX}/visits`, visitRouter);
  app.use(`${env.API_PREFIX}/beds`, bedRouter);
  app.use(`${env.API_PREFIX}/billing`, billingRouter);
  app.use(`${env.API_PREFIX}/nursing`, nursingRouter);
  app.use(`${env.API_PREFIX}/clinical`, clinicalRouter);
  app.use(`${env.API_PREFIX}/pharmacy`, pharmacyRouter);
  app.use(`${env.API_PREFIX}/lab`, labRouter);
  app.use(`${env.API_PREFIX}/radiology`, radiologyRouter);
  app.use(`${env.API_PREFIX}/management`, managementRouter);
  app.use(`${env.API_PREFIX}/director`, directorRouter);
  app.use(`${env.API_PREFIX}/admin`, adminRouter);
  app.use(`${env.API_PREFIX}/notifications`, notificationRouter);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
