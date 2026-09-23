import "dotenv/config";
import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import bcrypt from "bcrypt";
import type { AddressInfo } from "node:net";

// Tests create unique fixtures and remove only those fixture IDs. Never reset a database.
process.env.NODE_ENV = "test";
const { app } = await import("../src/app.js");
const { db } = await import("../src/config/db.js");

test("MySQL: ticket lifecycle and authorization boundaries", async (t) => {
  const server = app.listen(0, "127.0.0.1");
  await new Promise<void>((resolve) => server.once("listening", resolve));
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/v1`;
  const prefix = randomUUID();
  const password = `Test-${randomUUID()}`;
  const hash = await bcrypt.hash(password, 12);
  const userIds: string[] = [];
  const departmentIds: string[] = [];
  const conversationIds: string[] = [];
  type Login = {
    accessToken: string;
    cookie: string;
    user: { id: string; role: string };
  };
  async function request(
    path: string,
    method = "GET",
    body?: unknown,
    session?: Login,
    cookie?: string,
    origin?: string,
  ) {
    const response = await fetch(base + path, {
      method,
      headers: {
        "Content-Type": "application/json",
        ...(session ? { Authorization: `Bearer ${session.accessToken}` } : {}),
        ...(cookie ? { Cookie: cookie } : {}),
        ...(origin ? { Origin: origin } : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const json = await response.json();
    return {
      status: response.status,
      json,
      cookie: response.headers.get("set-cookie")?.split(";")[0] ?? "",
    };
  }
  async function login(email: string): Promise<Login> {
    const r = await request("/auth/login", "POST", { email, password });
    assert.equal(r.status, 200);
    return { ...r.json.data, cookie: r.cookie };
  }
  async function customer(label: string): Promise<Login> {
    const r = await request("/auth/register", "POST", {
      name: `Test ${label}`,
      email: `${label}-${prefix}@example.test`,
      password,
    });
    assert.equal(r.status, 201);
    userIds.push(r.json.data.user.id);
    return { ...r.json.data, cookie: r.cookie };
  }
  try {
    const department = await db.department.create({
      data: { name: `Test ${prefix}` },
    });
    departmentIds.push(department.id);
    const otherDepartment = await db.department.create({
      data: { name: `Other ${prefix}` },
    });
    departmentIds.push(otherDepartment.id);
    async function staff(
      label: string,
      role: "ADMIN" | "AGENT" | "SUPERVISOR",
      departmentId = department.id,
    ) {
      const u = await db.user.create({
        data: {
          name: `Test ${label}`,
          email: `${label}-${prefix}@example.test`,
          passwordHash: hash,
          role,
          departments: { create: { departmentId } },
        },
      });
      userIds.push(u.id);
      return login(u.email);
    }
    const owner = await customer("owner");
    const outsider = await customer("outsider");
    const admin = await staff("admin", "ADMIN");
    const agent = await staff("agent", "AGENT");
    const otherAgent = await staff("other-agent", "AGENT", otherDepartment.id);
    const supervisor = await staff("supervisor", "SUPERVISOR");
    const outsideSupervisor = await staff(
      "outside-supervisor",
      "SUPERVISOR",
      otherDepartment.id,
    );
    let conversationId = "";
    await t.test(
      "unauthenticated access is rejected and role escalation cannot be registered",
      async () => {
        assert.equal((await request("/conversations")).status, 401);
        assert.equal(
          (
            await request("/auth/register", "POST", {
              name: "Fake Admin",
              email: `bad-${prefix}@example.test`,
              password,
              role: "ADMIN",
            })
          ).status,
          400,
        );
        const user = await db.user.findUniqueOrThrow({
          where: { id: owner.user.id },
        });
        assert.notEqual(user.passwordHash, password);
        assert.ok(await bcrypt.compare(password, user.passwordHash));
        const me = await request("/auth/me", "GET", undefined, owner);
        assert.equal(me.json.data.passwordHash, undefined);
        assert.equal(me.json.data.role, "CUSTOMER");
      },
    );
    await t.test(
      "customer creates a persisted ticket with its first message",
      async () => {
        const r = await request(
          "/conversations",
          "POST",
          {
            subject: "Ödeme sırasında hata alıyorum",
            message: "Kartımdan ödeme yapamıyorum.",
            departmentId: department.id,
            priority: "HIGH",
          },
          owner,
        );
        assert.equal(r.status, 201);
        conversationId = r.json.data.id;
        conversationIds.push(conversationId);
        assert.equal(r.json.data.customer.id, owner.user.id);
        assert.equal(r.json.data.status, "OPEN");
        assert.ok(Number.isInteger(r.json.data.number));
        assert.equal(
          (
            await request(
              `/conversations/${conversationId}/messages`,
              "GET",
              undefined,
              owner,
            )
          ).json.data[0].body,
          "Kartımdan ödeme yapamıyorum.",
        );
        assert.equal(await db.conversation.count({ where: { id: conversationId } }), 1);
      },
    );
    await t.test(
      "other customers and staff outside the department cannot read or reply",
      async () => {
        for (const actor of [outsider, otherAgent, outsideSupervisor]) {
          assert.equal(
            (await request(`/conversations/${conversationId}`, "GET", undefined, actor))
              .status,
            404,
          );
          assert.equal(
            (
              await request(
                `/conversations/${conversationId}/messages`,
                "GET",
                undefined,
                actor,
              )
            ).status,
            404,
          );
          assert.equal(
            (
              await request(
                `/conversations/${conversationId}/messages`,
                "POST",
                { body: "Unauthorized reply" },
                actor,
              )
            ).status,
            404,
          );
          assert.equal(
            (
              await request(
                `/conversations?search=${encodeURIComponent("Ödeme sırasında")}`,
                "GET",
                undefined,
                actor,
              )
            ).json.pagination.total,
            0,
          );
        }
      },
    );
    await t.test(
      "only managers assign a department member; supervisor scope is enforced",
      async () => {
        assert.equal(
          (
            await request(
              `/conversations/${conversationId}`,
              "PATCH",
              { assignedAgentId: agent.user.id },
              owner,
            )
          ).status,
          403,
        );
        assert.equal(
          (
            await request(
              `/conversations/${conversationId}`,
              "PATCH",
              { assignedAgentId: agent.user.id },
              agent,
            )
          ).status,
          403,
        );
        assert.equal(
          (
            await request(
              `/conversations/${conversationId}`,
              "PATCH",
              { assignedAgentId: agent.user.id },
              outsideSupervisor,
            )
          ).status,
          404,
        );
        assert.equal(
          (
            await request(
              `/conversations/${conversationId}`,
              "PATCH",
              { assignedAgentId: otherAgent.user.id },
              admin,
            )
          ).status,
          400,
        );
        assert.equal(
          (
            await request(
              `/conversations/${conversationId}`,
              "PATCH",
              { assignedAgentId: agent.user.id },
              supervisor,
            )
          ).status,
          200,
        );
        assert.equal(
          (await request(`/conversations/${conversationId}`, "GET", undefined, agent))
            .status,
          200,
        );
      },
    );
    await t.test(
      "agent reply is visible to the customer but internal notes are excluded",
      async () => {
        assert.equal(
          (
            await request(
              `/conversations/${conversationId}/messages`,
              "POST",
              { body: "Bankanızla kontrol ediyoruz." },
              agent,
            )
          ).status,
          201,
        );
        assert.equal(
          (
            await request(
              `/conversations/${conversationId}/messages`,
              "POST",
              { body: "Private investigation", isInternalNote: true },
              agent,
            )
          ).status,
          201,
        );
        const visible = await request(
          `/conversations/${conversationId}/messages`,
          "GET",
          undefined,
          owner,
        );
        assert.equal(visible.json.pagination.total, 3);
        assert.ok(
          visible.json.data.every(
            (m: { type: string }) => m.type !== 'INTERNAL_NOTE',
          ),
        );
        assert.equal(
          (
            await request(
              `/conversations/${conversationId}/messages`,
              "GET",
              undefined,
              agent,
            )
          ).json.pagination.total,
          4,
        );
        assert.equal(
          (
            await request(
              `/conversations/${conversationId}/messages`,
              "POST",
              { body: "Forged note", isInternalNote: true },
              owner,
            )
          ).status,
          403,
        );
      },
    );
    await t.test(
      "customer cannot mutate status or priority; agent can resolve then close",
      async () => {
        assert.equal(
          (
            await request(
              `/conversations/${conversationId}`,
              "PATCH",
              { status: "RESOLVED" },
              owner,
            )
          ).status,
          403,
        );
        assert.equal(
          (
            await request(
              `/conversations/${conversationId}`,
              "PATCH",
              { priority: "URGENT" },
              owner,
            )
          ).status,
          403,
        );
        assert.equal(
          (
            await request(
              `/conversations/${conversationId}`,
              "PATCH",
              { status: "RESOLVED" },
              agent,
            )
          ).status,
          200,
        );
        assert.equal(
          (await request(`/conversations/${conversationId}`, "GET", undefined, owner)).json
            .data.status,
          "RESOLVED",
        );
        const closed = await request(
          `/conversations/${conversationId}`,
          "PATCH",
          { status: "CLOSED" },
          agent,
        );
        assert.ok(closed.json.data.closedAt);
        assert.equal(
          (
            await request(
              `/conversations/${conversationId}/messages`,
              "POST",
              { body: "After close" },
              owner,
            )
          ).status,
          409,
        );
        const reopened = await request(
          `/conversations/${conversationId}`,
          "PATCH",
          { status: "OPEN" },
          agent,
        );
        assert.equal(reopened.json.data.closedAt, null);
      },
    );
    await t.test("unassignment preserves queue visibility but revokes reply permission", async () => {
      assert.equal(
        (
          await request(
            `/conversations/${conversationId}`,
            "PATCH",
            { assignedAgentId: null },
            admin,
          )
        ).status,
        200,
      );
      assert.equal(
        (await request(`/conversations/${conversationId}`, "GET", undefined, agent)).status,
        200,
      );
      assert.equal(
        (
          await request(
            `/conversations/${conversationId}/messages`,
            "POST",
            { body: "Stale access" },
            agent,
          )
        ).status,
        409,
      );
    });
    await t.test(
      "pagination, server-side search and strict input validation work",
      async () => {
        const r = await request(
          "/conversations",
          "POST",
          {
            subject: "İkinci test talebim",
            message: "Test",
            departmentId: department.id,
          },
          owner,
        );
        assert.equal(r.status, 201);
        conversationIds.push(r.json.data.id);
        const page1 = await request(
          "/conversations?limit=1&page=1",
          "GET",
          undefined,
          owner,
        );
        const page2 = await request(
          "/conversations?limit=1&page=2",
          "GET",
          undefined,
          owner,
        );
        assert.equal(page1.json.data.length, 1);
        assert.equal(page1.json.pagination.total, 2);
        assert.notEqual(page1.json.data[0].id, page2.json.data[0].id);
        assert.equal(
          (await request("/conversations?limit=1000", "GET", undefined, owner))
            .status,
          400,
        );
        assert.equal(
          (await request("/conversations/not-a-uuid", "GET", undefined, owner))
            .status,
          400,
        );
        assert.equal(
          (await request("/conversations?search=ikinci", "GET", undefined, owner))
            .json.pagination.total,
          1,
        );
        assert.equal(
          (
            await request(
              `/conversations/${conversationId}`,
              "PATCH",
              { customerId: outsider.user.id },
              admin,
            )
          ).status,
          400,
        );
        assert.equal(
          (
            await request(
              `/conversations/${conversationId}/messages`,
              "POST",
              { body: "   " },
              owner,
            )
          ).status,
          400,
        );
      },
    );
    await t.test(
      "dashboard respects customer ownership; activity records are persisted",
      async () => {
        assert.equal(
          (await request("/dashboard", "GET", undefined, owner)).json.data
            .total,
          2,
        );
        assert.equal(
          (await request("/dashboard", "GET", undefined, outsider)).json.data
            .total,
          0,
        );
        assert.ok(
          (await db.activityLog.count({ where: { entityId: conversationId } })) >= 7,
        );
      },
    );
    await t.test(
      "refresh tokens rotate, concurrent replay loses, logout revokes bearer access",
      async () => {
        const session = await login(`owner-${prefix}@example.test`);
        const attempts = await Promise.all([
          request("/auth/refresh", "POST", {}, undefined, session.cookie),
          request("/auth/refresh", "POST", {}, undefined, session.cookie),
        ]);
        assert.deepEqual(attempts.map((a) => a.status).sort(), [200, 401]);
        const winner = attempts.find((a) => a.status === 200)!;
        assert.notEqual(winner.cookie, session.cookie);
        assert.equal(
          (
            await request(
              "/auth/refresh",
              "POST",
              {},
              undefined,
              session.cookie,
            )
          ).status,
          401,
        );
        assert.equal(
          (
            await request(
              "/auth/logout",
              "POST",
              {},
              undefined,
              winner.cookie,
              "https://evil.example",
            )
          ).status,
          403,
        );
        assert.equal(
          (await request("/auth/logout", "POST", {}, undefined, winner.cookie))
            .status,
          200,
        );
        assert.equal(
          (
            await request("/auth/me", "GET", undefined, {
              ...session,
              accessToken: winner.json.data.accessToken,
            })
          ).status,
          401,
        );
        assert.equal(
          (await request("/auth/refresh", "POST", {}, undefined, winner.cookie))
            .status,
          401,
        );
      },
    );
  } finally {
    await db.activityLog.deleteMany({ where: { userId: { in: userIds } } });
    await db.conversationMessage.deleteMany({
      where: { conversationId: { in: conversationIds } },
    });
    await db.conversation.deleteMany({ where: { id: { in: conversationIds } } });
    await db.user.deleteMany({ where: { id: { in: userIds } } });
    await db.department.deleteMany({ where: { id: { in: departmentIds } } });
    await db.$disconnect();
    await new Promise<void>((resolve, reject) =>
      server.close((e) => (e ? reject(e) : resolve())),
    );
  }
});
