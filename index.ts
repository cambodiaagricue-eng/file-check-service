import app from "./app/app";
import { env } from "./config/env";
import { connectDatabases } from "./db/maindb";
import { createServer } from "http";
import { ensureSuperadmin } from "./services/bootstrap.service";
import { initWebSocketServer } from "./ws/realtime";
const PORT = env.PORT;

async function startApp() {
  try {
    await connectDatabases();
    await ensureSuperadmin();

    const server = createServer(app);
    initWebSocketServer(server);
    server.listen(PORT, () => {
      console.log(`Server is running on port ${PORT}`);
    });
  } catch (err) {
    console.error("Failed to start server", err);
    process.exit(1);
  }
}
void startApp();
