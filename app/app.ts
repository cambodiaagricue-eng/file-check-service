import express from "express";
import type { Application } from "express";
import cors from "cors";
import { env } from "../config/env";
import { errorMiddleware } from "../middleware/error.middleware";

import documentRoute from "../controller/documentServiceController";
import authRouter from "../routes/auth.routes";

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
app.use("/api/documents", documentRoute);
app.use(errorMiddleware);

export default app;
