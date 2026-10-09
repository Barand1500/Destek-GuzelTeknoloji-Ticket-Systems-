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
import { GuideHubPage } from "./pages/GuideHub";
import { IntegrationsHubPage } from "./pages/IntegrationsHub";
import { SurveysPage } from "./pages/Surveys";
import { Realtime } from "./components/Realtime";
import { RequireRole } from "./components/RequireRole";
import { RolesPage } from './features/management/Roles';
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
  ReportsPage,
  ResponseTimeRulesPage,
  StaffPresencePage,
  ProfilePage,
  PhoneSupportPage,
  FilesPage,
} from "./pages/Management";
import "./styles.css";
import { CalendarPage } from "./features/announcements/CalendarModal";
import "./readability.css";
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
              <Route
                path="/customer/tickets/:id/log"
                element={<ConversationLog />}
              />
              <Route path="/customer/profile" element={<ProfilePage />} />
              <Route path="/customer/files" element={<Navigate to="/customer/dashboard" replace />} />
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
              <Route
                path="/agent/conversations/:id/log"
                element={<ConversationLog />}
              />
              <Route path="/agent/customers" element={<CustomersPage />} />
              <Route path="/agent/users" element={<UsersPage />} />
              <Route
                path="/agent/phone-support"
                element={<PhoneSupportPage />}
              />
              <Route
                path="/agent/saved-replies"
                element={<SavedRepliesPage />}
              />
              <Route path="/agent/profile" element={<ProfilePage />} />
              <Route path="/agent/files" element={<FilesPage />} />
              <Route path="/agent/calendar" element={<CalendarPage />} />
              <Route
                path="/agent/notifications"
                element={<NotificationsPage />}
              />
              <Route
                path="/agent/staff-presence"
                element={<StaffPresencePage />}
              />
              <Route
                path="/agent/project-guide"
                element={<Navigate to="/agent/guide/projects" replace />}
              />
              <Route
                path="/agent/guide"
                element={<Navigate to="/agent/guide/projects" replace />}
              />
              <Route path="/agent/guide/:section" element={<GuideHubPage />} />
              <Route path="/agent/surveys" element={<SurveysPage />} />
            </Route>
            <Route element={<RequireRole roles={["ADMIN"]} />}>
              <Route
                path="/admin/guide"
                element={<Navigate to="/admin/guide/system" replace />}
              />
              <Route path="/admin" element={<LegacyRedirect />} />
              <Route path="/admin/dashboard" element={<Dashboard />} />
              <Route path="/admin/conversations" element={<TicketList />} />
              <Route
                path="/admin/conversations/:id"
                element={<TicketDetail />}
              />
              <Route
                path="/admin/conversations/:id/log"
                element={<ConversationLog />}
              />
              <Route path="/admin/customers" element={<CustomersPage />} />
              <Route
                path="/admin/phone-support"
                element={<PhoneSupportPage />}
              />
              <Route path="/admin/users" element={<UsersPage />} />
              <Route path="/admin/roles" element={<RolesPage />} />
              <Route path="/admin/departments" element={<DepartmentsPage />} />
              <Route path="/admin/tags" element={<TagsPage />} />
              <Route path="/admin/websites" element={<WebsitesPage />} />
              <Route
                path="/admin/project-guide"
                element={<Navigate to="/admin/guide/projects" replace />}
              />
              <Route path="/admin/guide/:section" element={<GuideHubPage />} />
              <Route path="/admin/surveys" element={<SurveysPage />} />
              <Route path="/admin/reports" element={<ReportsPage />} />
              <Route
                path="/admin/saved-replies"
                element={<SavedRepliesPage />}
              />
              <Route
                path="/admin/activity-logs"
                element={<ActivityLogsPage />}
              />
              <Route path="/admin/calendar" element={<CalendarPage />} />
              <Route path="/admin/files" element={<FilesPage />} />
              <Route
                path="/admin/settings"
                element={<Navigate to="/admin/integrations/channels" replace />}
              />
              <Route
                path="/admin/integrations"
                element={<Navigate to="/admin/integrations/channels" replace />}
              />
              <Route
                path="/admin/integrations/:section"
                element={<IntegrationsHubPage />}
              />
              <Route
                path="/admin/response-time-rules"
                element={<ResponseTimeRulesPage />}
              />
              <Route
                path="/admin/notification-settings"
                element={
                  <Navigate to="/admin/integrations/channels" replace />
                }
              />
              <Route
                path="/admin/staff-presence"
                element={<StaffPresencePage />}
              />
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
            "calendar",
            "files",
            "reports",
            "settings",
            "staff-presence",
            "project-guide",
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
