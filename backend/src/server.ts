import { app } from "./app.js";
import { db } from "./config/db.js";
import { env } from "./config/env.js";
await db.$connect();
const server = app.listen(env.PORT, "127.0.0.1", () =>
  console.log(`Helpdesk API: http://localhost:${env.PORT}`),
);
const shutdown = () =>
  server.close(() => {
    void db.$disconnect().finally(() => process.exit(0));
  });
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
