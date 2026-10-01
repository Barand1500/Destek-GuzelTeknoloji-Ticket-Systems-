import { db } from "../config/db.js";
import { EventEmitter } from "node:events";

type PresenceUpdate = {
  path: string;
  page: string;
  visible: boolean;
  lastActivityAt: number;
};

type PresenceState = PresenceUpdate & {
  sockets: Set<string>;
  connectedAt: number;
  lastSeenAt: number;
};

export type PresenceChanged = {
  id: string;
  state: "ONLINE" | "IDLE" | "OFFLINE";
  page: string;
  path: string;
  lastActivityAt: string | null;
  lastSeenAt: string | null;
};

const states = new Map<string, PresenceState>();
const idleTimers = new Map<string, NodeJS.Timeout>();
const publishedStates = new Map<string, string>();
export const presenceEvents = new EventEmitter();
let idleMinutesCache = 5;
let settingsPromise: ReturnType<typeof getPresenceSettings> | null = null;

async function ensurePresenceSettings() {
  settingsPromise ??= getPresenceSettings();
  const settings = await settingsPromise;
  idleMinutesCache = settings.presenceIdleMinutes;
  return settings;
}

function presenceChanged(userId: string): PresenceChanged {
  const presence = states.get(userId);
  const connected = Boolean(presence?.sockets.size);
  const idle = Boolean(presence && connected && (!presence.visible || Date.now() - presence.lastActivityAt >= idleMinutesCache * 60_000));
  return {
    id: userId,
    state: connected ? (idle ? "IDLE" : "ONLINE") : "OFFLINE",
    page: connected ? presence?.page ?? "Bağlandı" : "Çevrimdışı",
    path: connected ? presence?.path ?? "" : "",
    lastActivityAt: presence ? new Date(presence.lastActivityAt).toISOString() : null,
    lastSeenAt: presence ? new Date(presence.lastSeenAt).toISOString() : null,
  };
}

function publishPresence(userId: string) {
  const payload = presenceChanged(userId);
  const fingerprint = JSON.stringify({
    state: payload.state,
    page: payload.page,
    path: payload.path,
    lastSeenAt: payload.state === "OFFLINE" ? payload.lastSeenAt : null,
  });
  if (publishedStates.get(userId) === fingerprint) return;
  publishedStates.set(userId, fingerprint);
  presenceEvents.emit("changed", payload);
}

function scheduleIdle(userId: string) {
  const existing = idleTimers.get(userId);
  if (existing) clearTimeout(existing);
  idleTimers.delete(userId);
  const presence = states.get(userId);
  if (!presence?.sockets.size || !presence.visible) {
    publishPresence(userId);
    return;
  }
  const remaining = idleMinutesCache * 60_000 - (Date.now() - presence.lastActivityAt);
  if (remaining <= 0) {
    publishPresence(userId);
    return;
  }
  const timer = setTimeout(() => {
    idleTimers.delete(userId);
    publishPresence(userId);
  }, remaining + 25);
  timer.unref();
  idleTimers.set(userId, timer);
}

export async function connectPresence(userId: string, socketId: string) {
  await ensurePresenceSettings();
  const now = Date.now();
  const current = states.get(userId);
  if (current) {
    current.sockets.add(socketId);
    current.lastSeenAt = now;
    scheduleIdle(userId);
    publishPresence(userId);
    return;
  }
  states.set(userId, { sockets: new Set([socketId]), connectedAt: now, lastSeenAt: now, lastActivityAt: now, path: "", page: "Bağlandı", visible: true });
  scheduleIdle(userId);
  publishPresence(userId);
}

export function updatePresence(userId: string, socketId: string, input: PresenceUpdate) {
  const current = states.get(userId);
  if (!current || !current.sockets.has(socketId)) return;
  current.path = input.path.slice(0, 300);
  current.page = input.page.slice(0, 120);
  current.visible = input.visible;
  current.lastActivityAt = Math.min(Date.now(), Math.max(current.lastActivityAt, input.lastActivityAt));
  current.lastSeenAt = Date.now();
  scheduleIdle(userId);
  publishPresence(userId);
}

export function disconnectPresence(userId: string, socketId: string) {
  const current = states.get(userId);
  if (!current) return;
  current.sockets.delete(socketId);
  current.lastSeenAt = Date.now();
  scheduleIdle(userId);
  publishPresence(userId);
}

export async function getPresenceSettings() {
  return db.systemSettings.upsert({ where: { id: "default" }, update: {}, create: { id: "default" } });
}

export async function updatePresenceSettings(idleMinutes: number) {
  const settings = await db.systemSettings.upsert({ where: { id: "default" }, update: { presenceIdleMinutes: idleMinutes }, create: { id: "default", presenceIdleMinutes: idleMinutes } });
  idleMinutesCache = settings.presenceIdleMinutes;
  settingsPromise = Promise.resolve(settings);
  for (const userId of states.keys()) scheduleIdle(userId);
  return settings;
}

export async function staffPresence() {
  const [settings, staff] = await Promise.all([
    ensurePresenceSettings(),
    db.user.findMany({
      where: { role: { in: ["ADMIN", "SUPERVISOR", "AGENT"] }, isActive: true, deletedAt: null },
      select: { id: true, name: true, email: true, role: true, departments: { select: { department: { select: { name: true } } } } },
      orderBy: { name: "asc" },
    }),
  ]);
  const ids = staff.map((person) => person.id);
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);
  const [conversations, replyGroups, lastReplies] = await Promise.all([
    db.conversation.findMany({
      where: { assignedAgentId: { in: ids }, deletedAt: null },
      select: { assignedAgentId: true, status: true, resolvedAt: true, createdAt: true, firstResponseAt: true },
    }),
    db.conversationMessage.groupBy({
      by: ["authorId", "conversationId"],
      where: { authorId: { in: ids }, type: "AGENT_REPLY" },
      _max: { createdAt: true },
    }),
    db.conversationMessage.findMany({
      where: { authorId: { in: ids }, type: "AGENT_REPLY" },
      distinct: ["authorId"],
      orderBy: { createdAt: "desc" },
      select: { authorId: true, createdAt: true },
    }),
  ]);
  const now = Date.now();
  const idleMs = settings.presenceIdleMinutes * 60_000;
  return {
    idleMinutes: settings.presenceIdleMinutes,
    updatedAt: new Date().toISOString(),
    staff: staff.map((person) => {
      const presence = states.get(person.id);
      const assigned = conversations.filter((item) => item.assignedAgentId === person.id);
      const answered = replyGroups.filter((item) => item.authorId === person.id);
      const responseDurations = assigned.flatMap((item) => item.firstResponseAt ? [item.firstResponseAt.getTime() - item.createdAt.getTime()] : []);
      const connected = Boolean(presence?.sockets.size);
      const idle = Boolean(presence && connected && (!presence.visible || now - presence.lastActivityAt >= idleMs));
      return {
        id: person.id,
        name: person.name,
        email: person.email,
        role: person.role,
        departments: person.departments.map((item) => item.department.name),
        state: connected ? (idle ? "IDLE" : "ONLINE") : "OFFLINE",
        page: connected ? presence?.page ?? "Bağlandı" : "Çevrimdışı",
        path: connected ? presence?.path ?? "" : "",
        lastActivityAt: presence ? new Date(presence.lastActivityAt).toISOString() : null,
        lastSeenAt: presence ? new Date(presence.lastSeenAt).toISOString() : null,
        openAssigned: assigned.filter((item) => !["RESOLVED", "CLOSED"].includes(item.status)).length,
        answeredToday: answered.filter((item) => (item._max.createdAt?.getTime() ?? 0) >= startOfDay.getTime()).length,
        answeredTotal: answered.length,
        resolvedToday: assigned.filter((item) => item.resolvedAt && item.resolvedAt >= startOfDay).length,
        averageFirstResponseMinutes: responseDurations.length ? Math.round(responseDurations.reduce((sum, value) => sum + value, 0) / responseDurations.length / 60_000) : null,
        lastReplyAt: lastReplies.find((item) => item.authorId === person.id)?.createdAt.toISOString() ?? null,
      };
    }),
  };
}
