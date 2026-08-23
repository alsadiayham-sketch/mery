import { json, bad, authenticate } from "./_utils.js";

// GET /api/session -> { user }  (validates the token + sessionVersion)
export async function onRequestGet(context) {
    const user = await authenticate(context.request, context.env);
    if (!user) return bad(401, "unauthorized");
    return json({ user: { username: user.sub, name: user.name, role: user.role } });
}
