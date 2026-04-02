import express from "express";
import type { Application } from "express";
import cors from "cors";
import { env } from "../config/env";
import { errorMiddleware } from "../middleware/error.middleware";
import { requireAuth } from "../middleware/auth.middleware";
import { requireOnboardingCompleted } from "../middleware/onboarding.middleware";

import documentRoute from "../controller/documentServiceController";
import authRouter from "../routes/auth.routes";
import onboardingRouter from "../routes/onboarding.routes";
import walletRouter from "../routes/wallet.routes";
import marketplaceRouter from "../routes/marketplace.routes";
import poolOrderRouter from "../routes/poolOrder.routes";
import adminRouter from "../routes/admin.routes";
import agentRouter from "../routes/agent.routes";
import publicRouter from "../routes/public.routes";
import { learningRouter, publicLearningRouter } from "../routes/learning.routes";

const app: Application = express();

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(
  cors({
    origin: env.CORS_ORIGIN.split(",").map((x) => x.trim()),
    credentials: true,
  }),
);

app.get("/", (req, res) => {
  res.send("API is healthy");
});

app.use("/api/v1/auth", authRouter);
app.use("/api/v1/public", publicRouter);
app.use("/api/v1/onboarding", onboardingRouter);
app.use("/api/v1/wallet", walletRouter);
app.use("/api/v1/marketplace", marketplaceRouter);
app.use("/api/v1/pool-orders", poolOrderRouter);
app.use("/api/v1/admin", adminRouter);
app.use("/api/v1/agent", agentRouter);
app.use("/api/v1/learning", learningRouter);
app.use("/api/v1/public", publicLearningRouter);
app.use("/api/documents", requireAuth, requireOnboardingCompleted, documentRoute);
app.use(errorMiddleware);

export default app;
