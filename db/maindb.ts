import mongoose, { Connection } from "mongoose";
import { env } from "../config/env";
import { getWalletTransactionModel } from "../models/walletTransaction.model";

let mainDbConnection: Connection | null = null;
let documentDbConnection: Connection | null = null;

async function ensureWalletTransactionIndexes(connection: Connection) {
  const WalletTransaction = getWalletTransactionModel(connection);
  const collection = WalletTransaction.collection;
  const indexes = await collection.indexes();
  const legacyIndex = indexes.find((index) => index.name === "paymentOrderId_1");

  if (legacyIndex) {
    await collection.dropIndex("paymentOrderId_1");
  }

  await WalletTransaction.syncIndexes();
}

export async function connectDatabases(): Promise<void> {
  const mainUri = env.MONGODB_MAIN_URI;
  const documentUri = env.MONGODB_DOCUMENT_URI;

  try {
    mainDbConnection = mongoose.createConnection(mainUri, {
      serverSelectionTimeoutMS: env.NODE_ENV === "production" ? 5000 : 8000,
      maxPoolSize: 20,
    });
    documentDbConnection = mongoose.createConnection(documentUri, {
      serverSelectionTimeoutMS: env.NODE_ENV === "production" ? 2500 : 8000,
      maxPoolSize: 20,
    });

    await mainDbConnection.asPromise();
    console.log("Connected to Main MongoDB");

    if (env.NODE_ENV !== "production") {
      await ensureWalletTransactionIndexes(mainDbConnection);
    } else {
      void ensureWalletTransactionIndexes(mainDbConnection).catch((error) => {
        console.error("Failed to sync wallet transaction indexes in background", error);
      });
    }

    void documentDbConnection.asPromise()
      .then(() => {
        console.log("Connected to Document/Audit MongoDB");
      })
      .catch((error) => {
        console.error("Document/Audit MongoDB connection failed", error);
      });
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
