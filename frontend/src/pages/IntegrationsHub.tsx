import { Mail, Unplug } from "lucide-react";
import { Navigate, NavLink, useParams } from "react-router-dom";
import {
  IntegrationsPage,
  NotificationSettingsPage,
} from "../features/management/Account";

export function IntegrationsHubPage() {
  const { section } = useParams();
  const active = section === "notifications" ? "notifications" : "channels";

  if (section !== active) {
    return <Navigate to={`/admin/integrations/${active}`} replace />;
  }

  return (
    <div className="integrations-hub">
      <header className="integrations-hub-header">
        <div>
          <span className="eyebrow">AYARLAR</span>
          <h1>Entegrasyonlar</h1>
          <p>
            İletişim kanallarını ve otomatik e-posta metinlerini tek yerden
            yönetin.
          </p>
        </div>
        <nav
          className="integrations-hub-tabs"
          aria-label="Entegrasyon bölümleri"
        >
          <NavLink
            to="/admin/integrations/channels"
            aria-current={active === "channels" ? "page" : undefined}
          >
            <Unplug size={17} /> Kanal Entegrasyonları
          </NavLink>
          <NavLink
            to="/admin/integrations/notifications"
            aria-current={active === "notifications" ? "page" : undefined}
          >
            <Mail size={17} /> E-posta Bildirimleri
          </NavLink>
        </nav>
      </header>
      <div
        className="integrations-hub-content"
        role="region"
        aria-label={
          active === "channels"
            ? "Kanal Entegrasyonları"
            : "E-posta Bildirimleri"
        }
      >
        {active === "channels" ? (
          <IntegrationsPage />
        ) : (
          <NotificationSettingsPage />
        )}
      </div>
    </div>
  );
}
