import { PrismaMariaDb } from "@prisma/adapter-mariadb";
import { PrismaClient } from "../generated/prisma/client.js";
import { env } from "./env.js";
const url = new URL(env.DATABASE_URL);
export const db = new PrismaClient({
  adapter: new PrismaMariaDb({
    host: url.hostname,
    // Local MySQL caching_sha2_password needs the RSA key after its auth cache is cleared.
    allowPublicKeyRetrieval: ['127.0.0.1', 'localhost', '[::1]', '::1'].includes(url.hostname),
    port: Number(url.port || 3306),
    user: decodeURIComponent(url.username),
    password: decodeURIComponent(url.password),
    database: url.pathname.slice(1),
    connectionLimit: 10,
    charset: "utf8mb4",
  }),
});
