import "dotenv/config";
import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import bcrypt from "bcrypt";
import type { AddressInfo } from "node:net";

process.env.NODE_ENV = "test";
const { app } = await import("../src/app.js");
const { db } = await import("../src/config/db.js");

test("management: CRUD, staff scope and credential protection", async (t) => {
  const server = app.listen(0, "127.0.0.1");
  await new Promise<void>((resolve) => server.once("listening", resolve));
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/v1`;
  const prefix = randomUUID();
  const password = `Management-${randomUUID()}`;
  const passwordHash = await bcrypt.hash(password, 12);
  const userIds: string[] = [],
    departmentIds: string[] = [],
    conversationIds: string[] = [],
    tagIds: string[] = [];
  async function request(
    path: string,
    token: string,
    method = "GET",
    body?: unknown,
  ) {
    const response = await fetch(base + path, {
      method,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    return { status: response.status, json: await response.json() };
  }
  async function login(email: string) {
    const r = await request("/auth/login", "", "POST", { email, password });
    assert.equal(r.status, 200);
    return r.json.data.accessToken as string;
  }
  try {
    const department = await db.department.create({
      data: { name: `Management ${prefix}` },
    });
    departmentIds.push(department.id);
    const otherDepartment = await db.department.create({
      data: { name: `Outside ${prefix}` },
    });
    departmentIds.push(otherDepartment.id);
    async function fixture(
      label: string,
      role: "ADMIN" | "SUPERVISOR" | "AGENT" | "CUSTOMER",
      departmentId?: string,
    ) {
      const user = await db.user.create({
        data: {
          name: `${label} ${prefix}`,
          email: `${label}-${prefix}@example.test`,
          passwordHash,
          role,
          ...(departmentId
            ? { departments: { create: { departmentId } } }
            : {}),
        },
      });
      userIds.push(user.id);
      return { ...user, token: await login(user.email) };
    }
    const admin = await fixture("admin", "ADMIN");
    const agent = await fixture("agent", "AGENT", department.id);
    const supervisor = await fixture("supervisor", "SUPERVISOR", department.id);
    const customer = await fixture("customer", "CUSTOMER");
    const outsider = await fixture("outsider", "CUSTOMER");
    const now = new Date();
    const ticket = await db.conversation.create({
      data: {
        customerId: customer.id,
        departmentId: department.id,
        assignedAgentId: agent.id,
        subject: `Management ${prefix}`,
        searchSubject: `management ${prefix}`,
        createdAt: new Date(now.getTime() - 600000),
        firstResponseAt: new Date(now.getTime() - 300000),
      },
    });
    conversationIds.push(ticket.id);
    const outside = await db.conversation.create({
      data: {
        customerId: outsider.id,
        departmentId: otherDepartment.id,
        subject: `Outside ${prefix}`,
        searchSubject: `outside ${prefix}`,
      },
    });
    conversationIds.push(outside.id);
    await t.test(
      "administration is forbidden to customers and agents",
      async () => {
        for (const token of [customer.token, agent.token])
          for (const path of ["/users", "/activity-logs", "/reports"])
            assert.equal((await request(path, token)).status, 403);
        assert.equal((await request("/customers", customer.token)).status, 403);
        assert.equal(
          (
            await request("/settings", customer.token, "PATCH", {
              companyName: "Denied",
            })
          ).status,
          403,
        );
        assert.equal(
          (await request("/saved-replies", customer.token)).status,
          403,
        );
      },
    );
    await t.test(
      "user CRUD validates memberships, assignments and self protection",
      async () => {
        const created = await request("/users", admin.token, "POST", {
          name: `created ${prefix}`,
          email: `created-${prefix}@example.test`,
          password,
          role: "AGENT",
          departmentIds: [department.id],
        });
        assert.equal(created.status, 201);
        userIds.push(created.json.data.id);
        assert.equal(created.json.data.passwordHash, undefined);
        assert.equal(
          (await request(`/users/${created.json.data.id}`, admin.token)).json
            .data.departments[0].departmentId,
          department.id,
        );
        assert.equal(
          (
            await request(
              `/users/${created.json.data.id}`,
              admin.token,
              "PATCH",
              { name: "Updated fixture" },
            )
          ).status,
          200,
        );
        assert.equal(
          (
            await request(`/users/${agent.id}`, admin.token, "PATCH", {
              departmentIds: [otherDepartment.id],
            })
          ).status,
          409,
        );
        assert.equal(
          (
            await request(`/users/${agent.id}`, admin.token, "PATCH", {
              isActive: false,
            })
          ).status,
          409,
        );
        assert.equal(
          (
            await request(`/users/${admin.id}`, admin.token, "PATCH", {
              isActive: false,
            })
          ).status,
          409,
        );
        assert.equal(
          (
            await request(`/users/${admin.id}`, admin.token, "PATCH", {
              role: "CUSTOMER",
            })
          ).status,
          409,
        );
        assert.equal(
          (
            await request(
              `/users/${created.json.data.id}`,
              admin.token,
              "PATCH",
              { isActive: false },
            )
          ).status,
          200,
        );
        assert.equal(
          (await request(`/users?search=${prefix}&limit=1`, admin.token)).json
            .data.length,
          1,
        );
      },
    );
    await t.test("staff can register different callers with shared contact details", async () => {
      const contact = { email: `shared-${prefix}@example.test`, phone: "05551234567", company: "Shared Company" };
      const first = await request("/customers", agent.token, "POST", { ...contact, name: "First caller" });
      const second = await request("/customers", agent.token, "POST", { ...contact, name: "Second caller" });
      assert.equal(first.status, 201);
      assert.equal(second.status, 201);
      assert.notEqual(first.json.data.id, second.json.data.id);
      userIds.push(first.json.data.id, second.json.data.id);
      const updated = await request(`/customers/${first.json.data.id}`, agent.token, "PATCH", { phone: "05557654321", email: "" });
      assert.equal(updated.status, 200);
      assert.equal(updated.json.data.phone, "05557654321");
      assert.equal(updated.json.data.email, null);
        const direct = await request(`/customers/${first.json.data.id}`, admin.token);
      assert.equal(direct.status, 200);
      assert.equal(direct.json.data.id, first.json.data.id);
    });
    await t.test(
      "customer directory and reports respect department visibility",
      async () => {
        const customers = await request(
          `/customers?search=${prefix}`,
          supervisor.token,
        );
        assert.deepEqual(
          customers.json.data.map((u: { id: string }) => u.id),
          [customer.id],
        );
        const reports = await request("/reports?limit=1", supervisor.token);
        assert.equal(reports.status, 200);
        assert.equal(reports.json.data.total, 1);
        assert.equal(reports.json.data.firstResponseMinutes, 5);
        assert.equal(reports.json.data.daily.length, 30);
        assert.ok(reports.json.data.agents.length <= 1);
      },
    );
    await t.test(
      "tags validate color and saved replies enforce authorship",
      async () => {
        assert.equal(
          (await request("/tags", agent.token, "POST", { name: "Denied" }))
            .status,
          403,
        );
        assert.equal(
          (
            await request("/tags", admin.token, "POST", {
              name: prefix,
              code: prefix.replaceAll('-', '').toUpperCase(),
              color: "red",
            })
          ).status,
          400,
        );
        const tag = await request("/tags", admin.token, "POST", {
          name: prefix,
          code: prefix.replaceAll('-', '').toUpperCase(),
          color: "#123456",
        });
        assert.equal(tag.status, 201);
        tagIds.push(tag.json.data.id);
        assert.equal(
          (
            await request(`/tags/${tag.json.data.id}`, admin.token, "PATCH", {
              color: "#654321",
            })
          ).status,
          200,
        );
        const reply = await request("/saved-replies", agent.token, "POST", {
          title: `Reply ${prefix}`,
          body: "Reusable answer",
        });
        assert.equal(reply.status, 201);
        assert.equal(
          (
            await request(
              `/saved-replies/${reply.json.data.id}`,
              supervisor.token,
              "PATCH",
              { body: "Denied" },
            )
          ).status,
          404,
        );
        assert.equal(
          (
            await request(
              `/saved-replies/${reply.json.data.id}`,
              agent.token,
              "PATCH",
              { body: "Updated answer" },
            )
          ).status,
          200,
        );
        assert.equal(
          (
            await request(
              `/saved-replies/${reply.json.data.id}`,
              admin.token,
              "DELETE",
            )
          ).status,
          200,
        );
        assert.equal(
          (await request(`/tags/${tag.json.data.id}`, admin.token, "DELETE"))
            .status,
          200,
        );
      },
    );
    await t.test(
      "notifications are private and stale conversation access is filtered",
      async () => {
        const own = await db.notification.create({
          data: {
            userId: customer.id,
            conversationId: ticket.id,
            type: "test",
            title: "Own",
            message: "Own message",
          },
        });
        await db.notification.create({
          data: {
            userId: customer.id,
            conversationId: outside.id,
            type: "test",
            title: "Hidden",
            message: "Hidden message",
          },
        });
        const list = await request("/notifications", customer.token);
        assert.deepEqual(
          list.json.data.map((n: { id: string }) => n.id),
          [own.id],
        );
        assert.equal(list.json.unreadCount, 1);
        assert.equal(
          (
            await request(
              `/notifications/${own.id}/read`,
              outsider.token,
              "PATCH",
            )
          ).status,
          404,
        );
        assert.equal(
          (
            await request(
              `/notifications/${own.id}/read`,
              customer.token,
              "PATCH",
            )
          ).status,
          200,
        );
        assert.equal(
          (await request("/notifications?isRead=false", customer.token)).json
            .pagination.total,
          0,
        );
      },
    );
    await t.test(
      "department deletion preserves history and allows restoring the same name; passive departments remain visible",
      async () => {
        assert.equal(
          (
            await request(
              `/departments/${department.id}`,
              admin.token,
              "DELETE",
            )
          ).status,
          200,
        );
        assert.equal((await db.department.findUniqueOrThrow({ where: { id: department.id } })).isActive, false);
        assert.ok(!(await request(`/departments?includeInactive=true&search=${prefix}`, admin.token)).json.data.some((row: { id: string }) => row.id === department.id));
        assert.ok(await db.departmentAgent.findFirst({ where: { departmentId: department.id, userId: agent.id } }));
        assert.equal((await request(`/conversations/${ticket.id}`, agent.token)).status, 200);
        assert.equal((await request('/conversations', admin.token, 'POST', { customerId: customer.id, departmentId: department.id, subject: 'Archived department test', message: 'Must be rejected' })).status, 400);
        assert.ok(!(await request('/departments?limit=100', admin.token)).json.data.some((row: { id: string }) => row.id === department.id));
        const queued = await db.conversation.create({ data: { customerId: customer.id, departmentId: department.id, subject: 'Existing queued request', searchSubject: 'existing queued request' } });
        conversationIds.push(queued.id);
        assert.equal((await request(`/conversations/${queued.id}`, agent.token)).status, 200);
        assert.equal((await request(`/conversations/${queued.id}/assign-to-me`, agent.token, 'POST', {})).status, 200);
        const empty = await db.department.create({
          data: { name: `Empty ${prefix}` },
        });
        departmentIds.push(empty.id);
        assert.equal(
          (await request(`/departments/${empty.id}`, admin.token, "DELETE"))
            .json.data.isActive,
          false,
        );
        assert.equal(
          (
            await request('/departments', admin.token, "POST", {
              name: empty.name,
            })
          ).json.data.isActive,
          true,
        );
        assert.equal((await request(`/departments/${empty.id}`, admin.token, 'PATCH', { isActive: false })).status, 200);
        assert.ok((await request(`/departments?includeInactive=true&search=${prefix}`, admin.token)).json.data.some((row: { id: string; isActive: boolean }) => row.id === empty.id && !row.isActive));
        const restored = await request('/departments', admin.token, 'POST', { name: empty.name });
        assert.equal(restored.status, 201);
        assert.equal(restored.json.data.id, empty.id);
        assert.equal((await request('/departments', admin.token, 'POST', { name: empty.name })).status, 409);
      },
    );
    await t.test('deleting staff removes directory entry, revokes access and returns open assignments to the queue', async () => {
      const staff = await fixture('delete-staff', 'AGENT', otherDepartment.id);
      const assigned = await db.conversation.create({ data: { subject: 'Delete staff assignment', searchSubject: 'delete staff assignment', customerId: customer.id, departmentId: otherDepartment.id, assignedAgentId: staff.id } });
      conversationIds.push(assigned.id);
      assert.equal((await request(`/users/${staff.id}`, customer.token, 'DELETE')).status, 403);
      assert.equal((await request(`/users/${admin.id}`, admin.token, 'DELETE')).status, 409);
      assert.equal((await request(`/users/${staff.id}`, admin.token, 'DELETE')).status, 200);
      assert.equal((await request(`/users/${staff.id}`, admin.token)).status, 404);
      assert.equal((await request(`/users/${staff.id}`, admin.token, 'PATCH', { isActive: true })).status, 404);
      assert.equal((await request('/auth/me', staff.token)).status, 401);
      assert.equal((await db.conversation.findUniqueOrThrow({ where: { id: assigned.id } })).assignedAgentId, null);
      assert.ok(!(await request(`/users?search=delete-staff`, admin.token)).json.data.some((row: { id: string }) => row.id === staff.id));
    });
    await t.test(
      "profile credential edits verify current password and revoke other sessions",
      async () => {
        const secondToken = await login(customer.email);
        const email = `changed-${prefix}@example.test`;
        assert.equal(
          (await request("/profile", customer.token, "PATCH", { email }))
            .status,
          400,
        );
        assert.equal(
          (
            await request("/profile", customer.token, "PATCH", {
              email,
              currentPassword: "wrong",
            })
          ).status,
          400,
        );
        const updated = await request("/profile", customer.token, "PATCH", {
          email,
          currentPassword: password,
        });
        assert.equal(updated.status, 200);
        assert.equal(updated.json.data.email, email);
        assert.equal(updated.json.data.passwordHash, undefined);
        assert.equal((await request("/profile", secondToken)).status, 401);
        assert.equal((await request("/profile", customer.token)).status, 200);
        const logs = await request(
          `/activity-logs?userId=${customer.id}`,
          admin.token,
        );
        assert.ok(
          logs.json.data.some(
            (log: { action: string }) => log.action === "profile.updated",
          ),
        );
        assert.ok(!JSON.stringify(logs.json).includes(password));
      },
    );
  } finally {
    try {
      if (userIds.length || departmentIds.length) {
        await db.activityLog.deleteMany({ where: { userId: { in: userIds } } });
        await db.conversationMessage.deleteMany({
          where: { conversationId: { in: conversationIds } },
        });
        await db.conversation.deleteMany({ where: { id: { in: conversationIds } } });
        await db.tag.deleteMany({ where: { id: { in: tagIds } } });
        await db.user.deleteMany({ where: { id: { in: userIds } } });
        await db.department.deleteMany({
          where: { id: { in: departmentIds } },
        });
      }
    } finally {
      await Promise.all([
        db.$disconnect(),
        new Promise<void>((resolve, reject) =>
          server.close((error) => (error ? reject(error) : resolve())),
        ),
      ]);
    }
  }
});
