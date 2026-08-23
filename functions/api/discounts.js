import { json, bad, requireRole, readJson } from "./_utils.js";

function rowToDiscount(row) {
    let obj = {};
    try { obj = JSON.parse(row.data) || {}; } catch (e) { obj = {}; }
    obj.id = row.id;
    return obj;
}
function newId() { return "d_" + Date.now().toString(36) + Math.random().toString(36).slice(2, 8); }

// GET /api/discounts -> public (storefront needs active discounts)
export async function onRequestGet(context) {
    const { results } = await context.env.DB
        .prepare("SELECT id, data FROM discounts ORDER BY updated_at DESC")
        .all();
    return json({ discounts: (results || []).map(rowToDiscount) });
}

// POST /api/discounts -> admin
export async function onRequestPost(context) {
    const gate = await requireRole(context.request, context.env, "admin");
    if (gate.error) return gate.error;
    const body = await readJson(context.request);
    if (!body || typeof body !== "object") return bad(400, "invalid body");
    const id = String(body.id || newId());
    const data = { ...body };
    delete data.id;
    await context.env.DB
        .prepare("INSERT INTO discounts (id, data, updated_at) VALUES (?, ?, ?) ON CONFLICT(id) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at")
        .bind(id, JSON.stringify(data), Date.now())
        .run();
    return json({ id, discount: { ...data, id } });
}

// DELETE /api/discounts?id=... -> admin
export async function onRequestDelete(context) {
    const gate = await requireRole(context.request, context.env, "admin");
    if (gate.error) return gate.error;
    const id = new URL(context.request.url).searchParams.get("id");
    if (!id) return bad(400, "missing id");
    await context.env.DB.prepare("DELETE FROM discounts WHERE id = ?").bind(id).run();
    return json({ ok: true });
}
