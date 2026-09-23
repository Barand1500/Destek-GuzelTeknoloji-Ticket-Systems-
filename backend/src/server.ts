import { app } from "./app.js";
import { db } from "./config/db.js";
import { env } from "./config/env.js";
import { attachSockets } from './sockets/index.js';
import { startInboundEmailPolling, stopInboundEmailPolling } from "./services/inbound-email.service.js";
import { verifySupportEmail, smtpFailureReason } from './services/mailer.service.js';
await db.$connect();
void verifySupportEmail().then(result => console.log('SMTP bağlantısı:', result.configured ? 'hazır' : 'yapılandırılmamış')).catch(error => console.error('SMTP bağlantısı kurulamadı:', smtpFailureReason(error)));
startInboundEmailPolling();
const server = app.listen(env.PORT, env.HOST, () =>
  console.log(`Helpdesk API: http://localhost:${env.PORT}`),
);
const io=attachSockets(server);
server.on('error',(error:NodeJS.ErrnoException)=>{console.error(error.code==='EADDRINUSE'?`API portu ${env.PORT} kullanımda. Kök dizinde npm run dev kullanın.`:error.message);void db.$disconnect().finally(()=>process.exit(1));});
const shutdown = () =>
  io.close(() => {
    stopInboundEmailPolling();
    void db.$disconnect().finally(() => process.exit(0));
  });
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
