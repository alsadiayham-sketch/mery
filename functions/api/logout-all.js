import { json, requireRole, bumpSessionVersion } from "./_utils.js";

// POST /api/logout-all -> admin. Bumps sessionVersion so every existing
// token (including this admin's) becomes invalid on the next request.
export async function onRequestPost(context) {
    const gate = await requireRole(context.request, context.env, "admin");
    if (gate.error) return gate.error;
    const next = await bumpSessionVersion(context.env);
    return json({ sessionVersion: next });
}
