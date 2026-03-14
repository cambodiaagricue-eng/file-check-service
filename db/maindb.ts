import mongoose, { Connection } from "mongoose";
import { env } from "../config/env";

let mainDbConnection: Connection | null = null;
let documentDbConnection: Connection | null = null;

export async function connectDatabases(): Promise<void> {
  const mainUri = env.MONGODB_MAIN_URI;
  const documentUri = env.MONGODB_DOCUMENT_URI;

  try {
    mainDbConnection = mongoose.createConnection(mainUri, {
      serverSelectionTimeoutMS: 8000,
      maxPoolSize: 20,
    });
    documentDbConnection = mongoose.createConnection(documentUri, {
      serverSelectionTimeoutMS: 8000,
      maxPoolSize: 20,
    });

    await Promise.all([
      mainDbConnection.asPromise(),
      documentDbConnection.asPromise(),
    ]);

    console.log("Connected to Main MongoDB");
    console.log("Connected to Document/Audit MongoDB");
  } catch (err) {
    console.error("Failed to connect to MongoDB databases", err);
    process.exit(1);
  }
}

export function getMainDbConnection(): Connection {
  if (!mainDbConnection) {
    throw new Error("Main DB connection has not been initialized.");
  }
  return mainDbConnection;
}

export function getDocumentDbConnection(): Connection {
  if (!documentDbConnection) {
    throw new Error("Document DB connection has not been initialized.");
  }
  return documentDbConnection;
}
