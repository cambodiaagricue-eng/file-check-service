import app from "./app/app";
import { env } from "./config/env";
import { connectDatabases } from "./db/maindb";
const PORT = env.PORT;

async function startApp() {
  try {
    await connectDatabases();
    app.listen(PORT, () => {
      console.log(`Server is running on port ${PORT}`);
    });
  } catch (err) {
    console.error("Failed to start server", err);
    process.exit(1);
  }
}
void startApp();
