import ReactDOM from "react-dom/client";
import {
  BrowserRouter,
  Navigate,
  Route,
  Routes,
  useLocation,
  useParams,
} from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AuthPage, AuthProvider, useAuth } from "./features/auth/Auth";
import { Layout } from "./components/Layout";
import {
  NewTicket,
  TicketDetail,
  ConversationLog,
  TicketList,
} from "./features/tickets/Tickets";
import { Dashboard } from "./pages/Dashboard";
import { Realtime } from "./components/Realtime";
import { RequireRole } from "./components/RequireRole";
import {
  conversationPath,
  inboxPath,
  roleHome,
  workspacePath,
} from "./router/paths";
import {
  UsersPage,
  CustomersPage,
  DepartmentsPage,
  TagsPage,
  WebsitesPage,
  SavedRepliesPage,
  NotificationsPage,
  ActivityLogsPage,
  IntegrationsPage,
  ProfilePage,
  PhoneSupportPage,
} from "./pages/Management";
import "./styles.css";
const client = new QueryClient({
  defaultOptions: { queries: { retry: 1, staleTime: 15000 } },
});
function LegacyRedirect({ suffix }: { suffix?: string }) {
  const { user, loading } = useAuth();
  const { id } = useParams();
  const { search, hash } = useLocation();
  if (loading) return <div className="loading-screen">Loading...</div>;
  if (!user) return <Navigate to="/auth" replace />;
  const target = id
    ? conversationPath(user.role, id)
    : suffix === "tickets"
      ? inboxPath(user.role)
      : suffix === "new"
        ? user.role === "CUSTOMER"
          ? workspacePath(user.role, "tickets/new")
          : roleHome(user.role)
        : suffix
          ? workspacePath(user.role, suffix)
          : roleHome(user.role);
  return <Navigate to={target + search + hash} replace />;
}
ReactDOM.createRoot(document.getElementById("root")!).render(
  <QueryClientProvider client={client}>
    <BrowserRouter>
      <AuthProvider>
        <Realtime />
        <Routes>
          <Route path="/" element={<Navigate to="/auth" replace />} />
          <Route path="/auth" element={<AuthPage />} />
          <Route path="/register" element={<Navigate to="/auth" replace />} />
          <Route element={<Layout />}>
            <Route element={<RequireRole roles={["CUSTOMER"]} />}>
              <Route path="/customer" element={<LegacyRedirect />} />
              <Route path="/customer/dashboard" element={<Dashboard />} />
              <Route path="/customer/tickets" element={<TicketList />} />
              <Route path="/customer/tickets/new" element={<NewTicket />} />
              <Route path="/customer/tickets/:id" element={<TicketDetail />} />
              <Route path="/customer/tickets/:id/log" element={<ConversationLog />} />
              <Route path="/customer/profile" element={<ProfilePage />} />
              <Route
                path="/customer/notifications"
                element={<NotificationsPage />}
              />
            </Route>
            <Route element={<RequireRole roles={["AGENT", "SUPERVISOR"]} />}>
              <Route path="/agent" element={<LegacyRedirect />} />
              <Route path="/agent/dashboard" element={<Dashboard />} />
              <Route path="/agent/inbox" element={<TicketList />} />
              <Route
                path="/agent/conversations/:id"
                element={<TicketDetail />}
              />
              <Route path="/agent/conversations/:id/log" element={<ConversationLog />} />
              <Route path="/agent/customers" element={<CustomersPage />} />
              <Route path="/agent/phone-support" element={<PhoneSupportPage />} />
              <Route
                path="/agent/saved-replies"
                element={<SavedRepliesPage />}
              />
              <Route path="/agent/profile" element={<ProfilePage />} />
              <Route
                path="/agent/notifications"
                element={<NotificationsPage />}
              />
            </Route>
            <Route element={<RequireRole roles={["ADMIN"]} />}>
              <Route path="/admin" element={<LegacyRedirect />} />
              <Route path="/admin/dashboard" element={<Dashboard />} />
              <Route path="/admin/conversations" element={<TicketList />} />
              <Route
                path="/admin/conversations/:id"
                element={<TicketDetail />}
              />
              <Route path="/admin/conversations/:id/log" element={<ConversationLog />} />
              <Route path="/admin/customers" element={<CustomersPage />} />
              <Route path="/admin/phone-support" element={<PhoneSupportPage />} />
              <Route path="/admin/users" element={<UsersPage />} />
              <Route path="/admin/departments" element={<DepartmentsPage />} />
              <Route path="/admin/tags" element={<TagsPage />} />
              <Route path="/admin/websites" element={<WebsitesPage />} />
              <Route
                path="/admin/saved-replies"
                element={<SavedRepliesPage />}
              />
              <Route
                path="/admin/activity-logs"
                element={<ActivityLogsPage />}
              />
              <Route path="/admin/settings" element={<Navigate to="/admin/integrations" replace />} />
              <Route path="/admin/integrations" element={<IntegrationsPage />} />
              <Route path="/admin/profile" element={<ProfilePage />} />
              <Route
                path="/admin/notifications"
                element={<NotificationsPage />}
              />
            </Route>
          </Route>
          <Route path="/tickets/:id" element={<LegacyRedirect />} />
          <Route
            path="/tickets/new"
            element={<LegacyRedirect suffix="new" />}
          />
          {[
            "dashboard",
            "tickets",
            "new",
            "profile",
            "notifications",
            "customers",
            "saved-replies",
            "users",
            "departments",
            "tags",
            "websites",
            "activity-logs",
            "settings",
          ].map((suffix) => (
            <Route
              key={suffix}
              path={`/${suffix}`}
              element={<LegacyRedirect suffix={suffix} />}
            />
          ))}
          <Route path="*" element={<LegacyRedirect />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  </QueryClientProvider>,
);
