import { json, bad, requireRole, readJson } from "./_utils.js";

const KEY = "config";

// GET /api/settings -> public (whatsapp number, hero text, about, links...)
export async function onRequestGet(context) {
    const row = await context.env.DB
        .prepare("SELECT data FROM settings WHERE key = ?")
        .bind(KEY)
        .first();
    let data = {};
    if (row) { try { data = JSON.parse(row.data) || {}; } catch (e) { data = {}; } }
    return json({ settings: data });
}

// POST /api/settings -> admin (replace settings object)
export async function onRequestPost(context) {
    const gate = await requireRole(context.request, context.env, "admin");
    if (gate.error) return gate.error;
    const body = await readJson(context.request);
    if (!body || typeof body !== "object") return bad(400, "invalid body");
    await context.env.DB
        .prepare("INSERT INTO settings (key, data) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET data = excluded.data")
        .bind(KEY, JSON.stringify(body))
        .run();
    return json({ settings: body });
}
