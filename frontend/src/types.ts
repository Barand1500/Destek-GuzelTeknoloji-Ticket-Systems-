export type Role = "ADMIN" | "SUPERVISOR" | "AGENT" | "CUSTOMER";
export type User = { id: string; name: string; email: string; role: Role };
export type Department = { id: string; name: string };
export type Status = "OPEN" | "PENDING" | "IN_PROGRESS" | "RESOLVED" | "CLOSED";
export type Priority = "LOW" | "NORMAL" | "HIGH" | "URGENT";
export type Ticket = {
  id: string;
  number: number;
  subject: string;
  customer: User;
  assignedAgent: User | null;
  department: Department;
  status: Status;
  priority: Priority;
  createdAt: string;
  updatedAt: string;
};
export type Message = {
  id: string;
  author: User;
  body: string;
  isInternalNote: boolean;
  createdAt: string;
};
export type Page<T> = {
  data: T[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
};
export const statuses: Record<Status, string> = {
  OPEN: "Açık",
  PENDING: "Beklemede",
  IN_PROGRESS: "İşlemde",
  RESOLVED: "Çözüldü",
  CLOSED: "Kapalı",
};
export const priorities: Record<Priority, string> = {
  LOW: "Düşük",
  NORMAL: "Normal",
  HIGH: "Yüksek",
  URGENT: "Acil",
};
export const roles: Record<Role, string> = {
  ADMIN: "Yönetici",
  SUPERVISOR: "Departman sorumlusu",
  AGENT: "Destek uzmanı",
  CUSTOMER: "Müşteri",
};
