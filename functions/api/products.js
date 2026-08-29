import { json, bad, requireRole, readJson } from "./_utils.js";

function rowToProduct(row) {
    let obj = {};
    try { obj = JSON.parse(row.data) || {}; } catch (e) { obj = {}; }
    obj.id = row.id;
    obj.stock = Math.max(0, Number(row.stock) || 0);
    return obj;
}

function newId() { return "p_" + Date.now().toString(36) + Math.random().toString(36).slice(2, 8); }

// GET /api/products  -> public
export async function onRequestGet(context) {
    const { results } = await context.env.DB
        .prepare("SELECT id, data, stock FROM products ORDER BY updated_at DESC")
        .all();
    return json({ products: (results || []).map(rowToProduct) });
}

// POST /api/products  -> admin. Upsert one product (body = product object).
export async function onRequestPost(context) {
    const gate = await requireRole(context.request, context.env, "admin");
    if (gate.error) return gate.error;

    const body = await readJson(context.request);
    if (!body || typeof body !== "object") return bad(400, "invalid body");

    const id = String(body.id || newId());
    const hasStock = Object.prototype.hasOwnProperty.call(body, "stock");
    const stock = Number(body.stock);
    if (hasStock && (!Number.isInteger(stock) || stock < 0)) return bad(400, "invalid stock");
    const data = { ...body };
    delete data.id;
    delete data.stock;
    const now = Date.now();
    if (hasStock) {
        await context.env.DB
            .prepare("INSERT INTO products (id, data, stock, stock_updated_at, updated_at) VALUES (?, ?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET data = excluded.data, stock = excluded.stock, stock_updated_at = excluded.stock_updated_at, updated_at = excluded.updated_at")
            .bind(id, JSON.stringify(data), stock, now, now)
            .run();
    } else {
        await context.env.DB
            .prepare("INSERT INTO products (id, data, updated_at) VALUES (?, ?, ?) ON CONFLICT(id) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at")
            .bind(id, JSON.stringify(data), now)
            .run();
    }
    return json({ id, product: { ...data, id, stock: hasStock ? stock : 20 } });
}

// PATCH /api/products?id=... { stock } -> admin
export async function onRequestPatch(context) {
    const gate = await requireRole(context.request, context.env, "admin");
    if (gate.error) return gate.error;
    const id = new URL(context.request.url).searchParams.get("id");
    const body = await readJson(context.request);
    const stock = Number(body && body.stock);
    if (!id || !Number.isInteger(stock) || stock < 0) return bad(400, "invalid stock");
    const result = await context.env.DB.prepare("UPDATE products SET stock = ?, stock_updated_at = ? WHERE id = ?").bind(stock, Date.now(), id).run();
    if (!result.meta.changes) return bad(404, "product not found");
    return json({ id, stock });
}

// DELETE /api/products?id=...  -> admin
export async function onRequestDelete(context) {
    const gate = await requireRole(context.request, context.env, "admin");
    if (gate.error) return gate.error;
    const id = new URL(context.request.url).searchParams.get("id");
    if (!id) return bad(400, "missing id");
    await context.env.DB.prepare("DELETE FROM products WHERE id = ?").bind(id).run();
    return json({ ok: true });
}
