import { Navigate, useParams } from "react-router-dom";
import { IntegrationsPage } from "../features/management/Account";

export function IntegrationsHubPage() {
  const { section } = useParams();
  if (section !== "channels") {
    return <Navigate to="/admin/integrations/channels" replace />;
  }
  return <IntegrationsPage />;
}
