import express from "express";
import type { Application } from "express";
import cors from "cors";
import errorHandler from "../middleware/errorhandelller";
import dotenv from "dotenv";
dotenv.config();

import documentRoute from "../controller/documentServiceController";

const app: Application = express();

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(errorHandler);
app.use(
  cors({
    origin: "*",
  }),
);

app.get("/", (req, res) => {
  res.send("Hello World!");
});

app.use("/api/documents", documentRoute);

export default app;
