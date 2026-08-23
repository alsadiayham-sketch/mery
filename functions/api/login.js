import { json, bad, pbkdf2Hex, safeEqual, signToken, getSessionVersion, readJson } from "./_utils.js";

// POST /api/login  { username, password } -> { token, user }
// Credentials are compared server-side; the browser never receives any hash.
// Lookup is a parameterized exact-match query, so SQL injection is impossible.
export async function onRequestPost(context) {
    const { request, env } = context;
    if (!env.AUTH_SECRET) return bad(500, "server not configured");
    const body = await readJson(request);
    if (!body) return bad(400, "invalid body");

    const username = String(body.username || "").trim();
    const password = String(body.password || "");
    if (!username || !password || username.length > 80 || password.length > 200) {
        return bad(400, "missing credentials");
    }

    const row = await env.DB
        .prepare("SELECT username, name, role, salt, iterations, hash FROM users WHERE username = ?")
        .bind(username)
        .first();

    // Generic error + always-run hash would be ideal; we keep it simple but
    // return an identical message for "no user" and "wrong password".
    if (!row) return bad(401, "invalid credentials");

    const computed = await pbkdf2Hex(password, row.salt, row.iterations || 100000);
    if (!safeEqual(computed, row.hash)) return bad(401, "invalid credentials");

    const sv = await getSessionVersion(env);
    const now = Math.floor(Date.now() / 1000);
    const payload = {
        sub: row.username,
        name: row.name,
        role: row.role,
        sv: Number(sv),
        iat: now,
        exp: now + 60 * 60 * 12 // 12h
    };
    const token = await signToken(env.AUTH_SECRET, payload);
    return json({ token, user: { username: row.username, name: row.name, role: row.role } });
}
