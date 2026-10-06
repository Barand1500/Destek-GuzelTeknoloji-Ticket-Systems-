export type Role = "ADMIN" | "SUPERVISOR" | "AGENT" | "CUSTOMER";
export type AccessRole = { id: string; name: string; permissions: string[]; scope: string };
export type StaffSkill = { name: string; category: string; level: 'BEGINNER' | 'INTERMEDIATE' | 'ADVANCED' | 'EXPERT' };
export type User = { id: string; name: string; email: string | null; phone?: string | null; company?: string | null; staffNote?: string | null; extraPhones?: string | null; extraEmails?: string | null; role: Role; accessRoleId?: string | null; accessRole?: AccessRole | null; departmentIds?: string[] };
export type Department = { id: string; name: string };
export type Tag={id:string;name:string;code:string;color:string};
export type Website={id:string;name:string;url:string;isActive:boolean;guideFileCount?:number};
export type Attachment={id:string;originalName:string;size:number;mimeType:string};
export type Status = string;
export type Priority = string;
export type ConversationChannel = "TICKET" | "EMAIL" | "SMS" | "WHATSAPP" | "LIVE_CHAT";
export type MessageType = "CUSTOMER_MESSAGE" | "AGENT_REPLY" | "INTERNAL_NOTE" | "SYSTEM";
export const channels: Record<ConversationChannel,string> = {TICKET:"Destek talebi",EMAIL:"E-posta",SMS:"SMS",WHATSAPP:"WhatsApp",LIVE_CHAT:"Canlı sohbet"};
export type Conversation = {
  channel: ConversationChannel;
  customerId: string;
  assignedAgentId: string | null;
  departmentId: string;
  resolvedAt: string | null;
  closedAt: string | null;
  id: string;
  number: number;
  subject: string;
  websiteUrl?: string | null;
  website?: Website | null;
  customer: User;
  createdBy?: User | null;
  assignedAgent: User | null;
  department: Department;
  status: Status;
  priority: Priority;
  createdAt: string;
  updatedAt: string;
  firstResponseAt?: string | null;
  responseTimeStartAt?: string | null;
  responseTimeAt?: string | null;
  customerMessageCount?: number;
  assignedAgentMessageCount?: number;
  canAddInternalNote?: boolean;
  tags:{tag:Tag;tagId:string}[];
};
export type Message = {
  type: MessageType;
  conversationId: string;
  id: string;
  author: User | null;
  body: string;
  createdAt: string;
  attachments:Attachment[];
  mentions?: Array<{ user: { id: string; name: string } }>;
};
export type Page<T> = {
  data: T[];
  responseTimeRules?: { responseFastFromMinutes: number; responseFastToMinutes: number; responseNormalFromMinutes: number; responseNormalToMinutes: number; responseLateFromMinutes: number; responseLateToMinutes: number; responseFastColor: string; responseNormalColor: string; responseLateColor: string };
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
