import { startIyzicoPayments } from './services/iyzico-payments.service.js';
import { app } from "./app.js";
import { db } from "./config/db.js";
import { env } from "./config/env.js";
import { attachSockets } from './sockets/index.js';
import { startInboundEmailPolling, stopInboundEmailPolling } from "./services/inbound-email.service.js";
import { verifySupportEmail, smtpFailureReason } from './services/mailer.service.js';
import { startAnnouncementQueue } from './services/announcements.service.js';
import { startOutboundQueue, stopOutboundQueue } from './services/outbound-queue.service.js';
import { startCreditAlerts } from './services/credit-alerts.service.js';
import { getLicenseStatus } from './services/license.service.js';
await db.$connect();
const stopAnnouncementQueue = await startAnnouncementQueue();
if (env.LICENSE_ENABLED) {
  void getLicenseStatus({ forceRefresh: true })
    .then(status => console.log('Lisans durumu:', status.valid ? `geçerli (${status.companyName ?? env.LICENSE_DOMAIN})` : `geçersiz (${status.reason}: ${status.message})`))
    .catch(error => console.error('Lisans kontrolü başarısız:', error instanceof Error ? error.message : String(error)));
}
void verifySupportEmail().then(result => console.log('SMTP bağlantısı:', result.configured ? 'hazır' : 'yapılandırılmamış')).catch(error => console.error('SMTP bağlantısı kurulamadı:', smtpFailureReason(error)));
startInboundEmailPolling();
startOutboundQueue();
const stopCreditAlerts = startCreditAlerts(db);
const stopCreditRenewals = startIyzicoPayments();
const server = app.listen(env.PORT, env.HOST, () =>
  console.log(`Helpdesk API: http://localhost:${env.PORT}`),
);
const io=attachSockets(server);
server.on('error',(error:NodeJS.ErrnoException)=>{console.error(error.code==='EADDRINUSE'?`API portu ${env.PORT} kullanımda. Kök dizinde npm run dev kullanın.`:error.message);void stopCreditAlerts().then(() => db.$disconnect()).finally(()=>process.exit(1));});
const shutdown = () =>
  io.close(async () => {
    await stopInboundEmailPolling();
    await stopOutboundQueue();
    await stopCreditAlerts();
    await stopCreditRenewals();
    stopAnnouncementQueue();
    void db.$disconnect().finally(() => process.exit(0));
  });
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
