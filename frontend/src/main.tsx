import ReactDOM from "react-dom/client";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AuthPage, AuthProvider } from "./features/auth/Auth";
import { Layout } from "./components/Layout";
import {
  NewTicket,
  TicketDetail,
  TicketList,
} from "./features/tickets/Tickets";
import { Dashboard } from "./pages/Dashboard";
import "./styles.css";
const client = new QueryClient({
  defaultOptions: { queries: { retry: 1, staleTime: 15000 } },
});
ReactDOM.createRoot(document.getElementById("root")!).render(
  <QueryClientProvider client={client}>
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<AuthPage />} />
          <Route path="/register" element={<AuthPage register />} />
          <Route element={<Layout />}>
            <Route path="/dashboard" element={<Dashboard />} />
            <Route path="/tickets" element={<TicketList />} />
            <Route path="/tickets/:id" element={<TicketDetail />} />
            <Route path="/new" element={<NewTicket />} />
          </Route>
          <Route path="*" element={<Navigate to="/tickets" replace />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  </QueryClientProvider>,
);
