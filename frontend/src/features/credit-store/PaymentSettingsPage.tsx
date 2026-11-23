import { PaymentSettings } from './PaymentSettings';
import { AkbankSettings } from './AkbankSettings';
import { NestpayGateways } from './NestpayGateways';
import { Heading } from '../management/shared';
import { useAuth } from '../auth/Auth';
import { hasPermission } from '../auth/permissions';
import './credit-store.css';

export function PaymentSettingsPage() {
  const { user } = useAuth();
  return <main className="page credit-sales-page">
    <Heading title="Ödeme Ayarları" description="Ödeme sağlayıcısını, bağlantı bilgilerini yönetin." />
    <div className="credit-sales-sections">
      <AkbankSettings editable={hasPermission(user, 'integrations.update')} />
      <PaymentSettings editable={hasPermission(user, 'integrations.update')} />
      <NestpayGateways editable={hasPermission(user, 'integrations.update')} />
    </div>
  </main>;
}
