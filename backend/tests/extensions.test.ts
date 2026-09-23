import "dotenv/config";
import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { unlink } from "node:fs/promises";
import path from "node:path";
import type { AddressInfo } from "node:net";
import bcrypt from "bcrypt";
import { io as connect, type Socket } from "socket.io-client";

process.env.NODE_ENV = "test";
const { app } = await import("../src/app.js");
const { db } = await import("../src/config/db.js");
const { env } = await import("../src/config/env.js");
const { uploadRoot } = await import("../src/services/uploads.service.js");
const { attachSockets } = await import("../src/sockets/index.js");

interface Session { accessToken: string; cookie: string; user: { id: string } }
interface Attachment { id: string; originalName: string; mimeType: string; size: number }
interface Message { id: string; body: string; type: string; attachments: Attachment[] }
interface Ticket {
  id: string; departmentId: string; assignedAgentId: string | null;
  firstResponseAt: string | null; resolvedAt: string | null; closedAt: string | null;
  tags: { tag: { id: string } }[];
}
interface Envelope<T> { data: T; error?: { code: string } }

test("MySQL: attachments, tags, transfers, lifecycle and realtime privacy", async (t) => {
  const server = app.listen(0, "127.0.0.1");
  const realtime = attachSockets(server);
  await new Promise<void>((resolve) => server.once("listening", resolve));
  const origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const base = origin + "/api/v1";
  const prefix = randomUUID();
  const password = `Test-${randomUUID()}`;
  const hash = await bcrypt.hash(password, 12);
  const userIds: string[] = [], departmentIds: string[] = [], conversationIds: string[] = [], tagIds: string[] = [];
  const sockets: Socket[] = [];

  async function request<T = unknown>(url: string, method = "GET", body?: unknown, session?: Session) {
    const multipart = body instanceof FormData;
    const response = await fetch(base + url, {
      method,
      headers: {
        ...(multipart ? {} : { "Content-Type": "application/json" }),
        ...(session ? { Authorization: `Bearer ${session.accessToken}` } : {}),
      },
      body: body === undefined ? undefined : multipart ? body : JSON.stringify(body),
    });
    const json = await response.json() as Envelope<T>;
    return { status: response.status, json, cookie: response.headers.get("set-cookie")?.split(";")[0] ?? "" };
  }
  async function user(label: string, role: "CUSTOMER" | "AGENT" | "ADMIN", departmentId?: string): Promise<Session> {
    const record = await db.user.create({ data: {
      name: `Extension ${label}`, email: `${label}-${prefix}@example.test`, passwordHash: hash, role,
      ...(departmentId ? { departments: { create: { departmentId } } } : {}),
    } });
    userIds.push(record.id);
    const result = await request<Omit<Session, "cookie">>("/auth/login", "POST", { email: record.email, password });
    assert.equal(result.status, 200);
    return { ...result.json.data, cookie: result.cookie };
  }
  function form(fields: Record<string, string>, files: { name: string; type: string; content: BlobPart }[] = []) {
    const data = new FormData();
    for (const [key, value] of Object.entries(fields)) data.set(key, value);
    for (const file of files) data.append("files", new Blob([file.content], { type: file.type }), file.name);
    return data;
  }
  function openSocket(token: string) {
    const socket = connect(origin, { auth: { token }, transports: ["websocket"], reconnection: false, autoConnect: false });
    sockets.push(socket);
    return socket;
  }
  function event(socket: Socket, name: string, timeout = 4000): Promise<void> {
    return new Promise((resolve, reject) => {
      const listener = () => { clearTimeout(timer); resolve(); };
      const timer = setTimeout(() => { socket.off(name, listener); reject(new Error(`Missing socket event: ${name}`)); }, timeout);
      socket.once(name, listener);
    });
  }
  try {
    const department = await db.department.create({ data: { name: `Extensions ${prefix}` } });
    departmentIds.push(department.id);
    const target = await db.department.create({ data: { name: `Transfer ${prefix}` } });
    departmentIds.push(target.id);
    const owner = await user("owner", "CUSTOMER");
    const outsider = await user("outsider", "CUSTOMER");
    const admin = await user("admin", "ADMIN");
    const agent = await user("agent", "AGENT", department.id);
    let conversationId = "", publicAttachmentId = "", privateAttachmentId = "";

    await t.test("multipart creation persists text attachments without leaking storage keys", async () => {
      const created = await request<Ticket>("/conversations", "POST", form({
        subject: "Attachment support test", message: "Please inspect the attachment", departmentId: department.id,
      }, [{ name: "receipt.txt", type: "text/plain", content: "Fixture receipt: 42" }]), owner);
      if (created.json.data?.id) conversationIds.push(created.json.data.id);
      assert.equal(created.status, 201);
      conversationId = created.json.data.id;
      const messages = await request<Message[]>(`/conversations/${conversationId}/messages`, "GET", undefined, owner);
      assert.equal(messages.status, 200);
      assert.equal(messages.json.data[0].attachments.length, 1);
      const attachment = messages.json.data[0].attachments[0];
      publicAttachmentId = attachment.id;
      assert.equal(attachment.originalName, "receipt.txt");
      assert.equal(JSON.stringify(messages.json).includes("storageKey"), false);
      const download = await fetch(base + `/attachments/${attachment.id}`, { headers: { Authorization: `Bearer ${owner.accessToken}` } });
      assert.equal(download.status, 200);
      assert.equal(await download.text(), "Fixture receipt: 42");
      assert.match(download.headers.get("content-disposition") ?? "", /attachment.*receipt\.txt/);
      assert.equal(download.headers.get("cache-control"), "private, no-store");
      assert.equal((await request(`/attachments/${attachment.id}`)).status, 401);
      assert.equal((await request(`/attachments/${attachment.id}`, "GET", undefined, outsider)).status, 404);
      assert.equal((await request(`/conversations/${conversationId}`, "PATCH", { assignedAgentId: agent.user.id }, admin)).status, 200);
    });

    await t.test("MIME mismatches, disguised binaries, excessive file counts and oversized files are rejected atomically", async () => {
      const before = await db.conversationMessage.count({ where: { conversationId } });
      const cases = [
        [{ name: "bad.txt", type: "image/png", content: "text" }],
        [{ name: "fake.png", type: "image/png", content: "not a PNG" }],
        [{ name: "script.exe", type: "application/octet-stream", content: "MZ" }],
        [{ name: "null.txt", type: "text/plain", content: "bad\0text" }],
        Array.from({ length: 6 }, (_, index) => ({ name: `${index}.txt`, type: "text/plain", content: "small" })),
        [{ name: "large.txt", type: "text/plain", content: "x".repeat(env.MAX_FILE_SIZE + 1) }],
      ];
      for (const files of cases) {
        const result = await request(`/conversations/${conversationId}/messages`, "POST", form({ body: "Invalid upload" }, files), owner);
        assert.equal(result.status, 400, JSON.stringify(result.json));
      }
      assert.equal(await db.conversationMessage.count({ where: { conversationId } }), before);
      assert.equal(await db.conversationAttachment.count({ where: { message: { conversationId } } }), 1);
    });

    await t.test("internal note attachments are private and do not count as first responses", async () => {
      const result = await request<Message>(`/conversations/${conversationId}/messages`, "POST", form({ body: "Private investigation", isInternalNote: "true" }, [
        { name: "internal.txt", type: "text/plain", content: "Staff secret" },
      ]), agent);
      assert.equal(result.status, 201);
      privateAttachmentId = result.json.data.attachments[0].id;
      assert.equal(JSON.stringify(result.json).includes("storageKey"), false);
      assert.equal((await db.conversation.findUniqueOrThrow({ where: { id: conversationId } })).firstResponseAt, null);
      for (const actor of [owner, outsider]) assert.equal((await request(`/attachments/${privateAttachmentId}`, "GET", undefined, actor)).status, 404);
      const visible = await request<Message[]>(`/conversations/${conversationId}/messages`, "GET", undefined, owner);
      assert.ok(visible.json.data.every(message => message.type !== 'INTERNAL_NOTE'));
      const download = await fetch(base + `/attachments/${privateAttachmentId}`, { headers: { Authorization: `Bearer ${agent.accessToken}` } });
      assert.equal(download.status, 200);
      assert.equal(await download.text(), "Staff secret");
    });

    await t.test("tags reject duplicate, unknown and unauthorized updates without partial changes", async () => {
      const tag = await db.tag.create({ data: { name: `Extension ${prefix}` } });
      tagIds.push(tag.id);
      const updated = await request<Ticket>(`/conversations/${conversationId}`, "PATCH", { tagIds: [tag.id] }, agent);
      assert.equal(updated.status, 200);
      assert.deepEqual(updated.json.data.tags.map(item => item.tag.id), [tag.id]);
      for (const invalid of [[tag.id, tag.id], [randomUUID()], ["invalid"]]) {
        assert.equal((await request(`/conversations/${conversationId}`, "PATCH", { tagIds: invalid }, agent)).status, 400);
      }
      assert.equal((await request(`/conversations/${conversationId}`, "PATCH", { tagIds: [] }, owner)).status, 403);
      assert.equal(await db.conversationTag.count({ where: { conversationId, tagId: tag.id } }), 1);
      assert.equal((await request(`/conversations/${conversationId}`, "PATCH", { tagIds: [] }, agent)).status, 200);
      assert.equal(await db.conversationTag.count({ where: { conversationId } }), 0);
    });

    await t.test("socket authentication rejects invalid and revoked sessions; notes never notify customers", async () => {
      const invalid = openSocket("invalid-token");
      const rejected = event(invalid, "connect_error"); invalid.connect(); await rejected;
      assert.equal(invalid.connected, false);
      const customerSocket = openSocket(owner.accessToken), staffSocket = openSocket(agent.accessToken);
      const ready = Promise.all([event(customerSocket, "connect"), event(staffSocket, "connect")]);
      customerSocket.connect(); staffSocket.connect(); await ready;
      const customerEvents: string[] = [];
      customerSocket.onAny(name => customerEvents.push(name));
      const noteDelivered = event(staffSocket, "conversation:message:new");
      assert.equal((await request(`/conversations/${conversationId}/messages`, "POST", { body: "Another private note", isInternalNote: true }, agent)).status, 201);
      await noteDelivered;
      await new Promise(resolve => setTimeout(resolve, 100));
      assert.equal(customerEvents.length, 0);
      const replyDelivered = event(customerSocket, "conversation:message:new");
      assert.equal((await request(`/conversations/${conversationId}/messages`, "POST", { body: "Public response" }, agent)).status, 201);
      await replyDelivered;
      assert.ok(customerEvents.includes("conversation:message:new"));

      const temporary = await user("revoked", "CUSTOMER");
      const live = openSocket(temporary.accessToken);
      const liveReady = event(live, "connect"); live.connect(); await liveReady;
      const logout = await fetch(base + "/auth/logout", { method: "POST", headers: { Cookie: temporary.cookie } });
      assert.equal(logout.status, 200);
      const disconnected = event(live, "disconnect");
      assert.equal((await request(`/conversations/${conversationId}/messages`, "POST", { body: "Session verification trigger" }, agent)).status, 201);
      await disconnected;
      const revoked = openSocket(temporary.accessToken);
      const revokedRejected = event(revoked, "connect_error"); revoked.connect(); await revokedRejected;
      for (const socket of sockets) socket.disconnect();
    });

    await t.test("first response is preserved while resolution and close timestamps follow reopen transitions", async () => {
      const initial = await db.conversation.findUniqueOrThrow({ where: { id: conversationId } });
      assert.ok(initial.firstResponseAt);
      const patch = (status: string) => request<Ticket>(`/conversations/${conversationId}`, "PATCH", { status }, agent);
      const resolved = await patch("RESOLVED");
      assert.equal(resolved.status, 200);
      assert.ok(resolved.json.data.resolvedAt);
      assert.equal(resolved.json.data.closedAt, null);
      const closed = await patch("CLOSED");
      assert.equal(closed.status, 200);
      assert.equal(closed.json.data.resolvedAt, resolved.json.data.resolvedAt);
      assert.ok(closed.json.data.closedAt);
      assert.equal((await request(`/conversations/${conversationId}/messages`, "POST", { body: "Closed reply" }, owner)).status, 409);
      const reopened = await patch("OPEN");
      assert.equal(reopened.status, 200);
      assert.equal(reopened.json.data.closedAt, null);
      assert.equal(reopened.json.data.resolvedAt, null);
      assert.equal(reopened.json.data.firstResponseAt, initial.firstResponseAt.toISOString());
    });

    await t.test("department transfer clears prior assignment and removes access to attachments", async () => {
      assert.equal((await request(`/conversations/${conversationId}`, "PATCH", { departmentId: target.id }, agent)).status, 403);
      const transferred = await request<Ticket>(`/conversations/${conversationId}`, "PATCH", { departmentId: target.id }, admin);
      assert.equal(transferred.status, 200);
      assert.equal(transferred.json.data.departmentId, target.id);
      assert.equal(transferred.json.data.assignedAgentId, null);
      assert.equal((await request(`/conversations/${conversationId}`, "GET", undefined, agent)).status, 404);
      assert.equal((await request(`/attachments/${privateAttachmentId}`, "GET", undefined, agent)).status, 404);
      assert.equal((await request(`/conversations/${conversationId}`, "GET", undefined, owner)).status, 200);
    });

    await t.test("soft deletion blocks detail, messages and downloads while retaining records", async () => {
      assert.equal((await request(`/conversations/${conversationId}`, "DELETE", undefined, owner)).status, 403);
      assert.equal((await request(`/conversations/${conversationId}`, "DELETE", undefined, admin)).status, 200);
      assert.ok((await db.conversation.findUniqueOrThrow({ where: { id: conversationId } })).deletedAt);
      for (const actor of [owner, admin]) {
        for (const route of [`/conversations/${conversationId}`, `/conversations/${conversationId}/messages`, `/attachments/${publicAttachmentId}`, `/attachments/${privateAttachmentId}`]) {
          assert.equal((await request(route, "GET", undefined, actor)).status, 404);
        }
        assert.equal((await request(`/conversations/${conversationId}/messages`, "POST", { body: "Deleted reply" }, actor)).status, 404);
      }
      assert.ok(await db.conversationMessage.count({ where: { conversationId } }));
    });
  } finally {
    for (const socket of sockets) socket.disconnect();
    await new Promise<void>(resolve => realtime.close(() => resolve()));
    const attachments = await db.conversationAttachment.findMany({ where: { message: { conversationId: { in: conversationIds } } }, select: { storageKey: true } });
    for (const { storageKey } of attachments) {
      const filePath = path.resolve(uploadRoot, storageKey);
      assert.equal(path.dirname(filePath), path.resolve(uploadRoot), "Fixture cleanup must stay inside upload root");
      await unlink(filePath).catch((error: NodeJS.ErrnoException) => { if (error.code !== "ENOENT") throw error; });
    }
    await db.activityLog.deleteMany({ where: { userId: { in: userIds } } });
    await db.conversationMessage.deleteMany({ where: { conversationId: { in: conversationIds } } });
    await db.conversation.deleteMany({ where: { id: { in: conversationIds } } });
    await db.tag.deleteMany({ where: { id: { in: tagIds } } });
    await db.user.deleteMany({ where: { id: { in: userIds } } });
    await db.department.deleteMany({ where: { id: { in: departmentIds } } });
    await db.$disconnect();
  }
});
