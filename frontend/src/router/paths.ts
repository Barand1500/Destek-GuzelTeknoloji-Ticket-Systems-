import type { Role } from "../types";
export function workspacePath(role: Role, suffix: string) {
  const prefix =
    role === "CUSTOMER" ? "customer" : role === "ADMIN" ? "admin" : "agent";
  return `/${prefix}/${suffix.replace(/^\/+/, "")}`;
}
export function roleHome(role: Role) {
  return workspacePath(role, role === "AGENT" ? "inbox" : "dashboard");
}
export function inboxPath(role: Role) {
  return workspacePath(
    role,
    role === "CUSTOMER"
      ? "tickets"
      : role === "ADMIN"
        ? "conversations"
        : "inbox",
  );
}
export function conversationPath(role: Role, id: string) {
  return workspacePath(
    role,
    `${role === "CUSTOMER" ? "tickets" : "conversations"}/${encodeURIComponent(id)}`,
  );
}
export function conversationLogPath(role: Role, id: string) {
  return `${conversationPath(role, id)}/log`;
}
