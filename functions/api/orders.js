import { json, bad, requireRole, authenticate, readJson } from "./_utils.js";

function rowToOrder(row) {
    let obj = {};
    try { obj = JSON.parse(row.data) || {}; } catch (e) { obj = {}; }
    obj.id = row.id;
    obj.status = row.status;
    obj.createdAt = row.created_at;
    return obj;
}
function newId() { return "o_" + Date.now().toString(36) + Math.random().toString(36).slice(2, 8); }

// GET /api/orders        -> list, any authenticated user (admin or worker)
// GET /api/orders?id=... -> PUBLIC single-order lookup (order tracking by id)
export async function onRequestGet(context) {
    const id = new URL(context.request.url).searchParams.get("id");
    if (id) {
        const row = await context.env.DB
            .prepare("SELECT id, data, status, created_at FROM orders WHERE id = ?")
            .bind(id)
            .first();
        if (!row) return json({ order: null }, 404);
        return json({ order: rowToOrder(row) });
    }
    const gate = await requireRole(context.request, context.env, null);
    if (gate.error) return gate.error;
    const { results } = await context.env.DB
        .prepare("SELECT id, data, status, created_at FROM orders ORDER BY created_at DESC")
        .all();
    return json({ orders: (results || []).map(rowToOrder) });
}

// POST /api/orders -> PUBLIC (checkout). Stores the order; returns its id.
export async function onRequestPost(context) {
    const body = await readJson(context.request);
    if (!body || typeof body !== "object") return bad(400, "invalid body");
    const id = String(body.id || newId());
    const status = String(body.status || "new");
    const data = { ...body };
    delete data.id;
    delete data.status;
    delete data.createdAt;
    const now = Date.now();
    await context.env.DB
        .prepare("INSERT INTO orders (id, data, status, created_at) VALUES (?, ?, ?, ?)")
        .bind(id, JSON.stringify(data), status, now)
        .run();
    return json({ id, order: { ...data, id, status, createdAt: now } });
}

// PATCH /api/orders?id=...  body { status } -> any authenticated user
export async function onRequestPatch(context) {
    const gate = await requireRole(context.request, context.env, null);
    if (gate.error) return gate.error;
    const id = new URL(context.request.url).searchParams.get("id");
    if (!id) return bad(400, "missing id");
    const body = await readJson(context.request);
    if (!body || !body.status) return bad(400, "missing status");
    await context.env.DB
        .prepare("UPDATE orders SET status = ? WHERE id = ?")
        .bind(String(body.status), id)
        .run();
    return json({ ok: true });
}

// DELETE /api/orders?id=... -> admin only
export async function onRequestDelete(context) {
    const gate = await requireRole(context.request, context.env, "admin");
    if (gate.error) return gate.error;
    const id = new URL(context.request.url).searchParams.get("id");
    if (!id) return bad(400, "missing id");
    await context.env.DB.prepare("DELETE FROM orders WHERE id = ?").bind(id).run();
    return json({ ok: true });
}
