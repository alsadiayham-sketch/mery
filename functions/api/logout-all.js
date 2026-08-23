import { json, requireRole, getSessionVersion } from "./_utils.js";

// POST /api/logout-all -> admin. Bumps sessionVersion so every existing
// token (including this admin's) becomes invalid on the next request.
export async function onRequestPost(context) {
    const gate = await requireRole(context.request, context.env, "admin");
    if (gate.error) return gate.error;
    const current = parseInt(await getSessionVersion(context.env), 10) || 1;
    const next = current + 1;
    await context.env.DB
        .prepare("INSERT INTO meta (key, value) VALUES ('sessionVersion', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value")
        .bind(String(next))
        .run();
    return json({ sessionVersion: next });
}
