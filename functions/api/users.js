import { json, bad, requireRole, makeUserRecord, pbkdf2Hex, genSalt, readJson } from "./_utils.js";

// Users are sensitive: only admins may touch this endpoint, and we NEVER
// return salt/hash to the client. Passwords are write-only.

// GET /api/users -> admin. Returns safe fields only.
export async function onRequestGet(context) {
    const gate = await requireRole(context.request, context.env, "admin");
    if (gate.error) return gate.error;
    const { results } = await context.env.DB
        .prepare("SELECT username, name, role FROM users ORDER BY username ASC")
        .all();
    return json({ users: results || [] });
}

// POST /api/users -> admin. Create or update a user.
// body: { username, name, role, password? }  (password required on create)
export async function onRequestPost(context) {
    const gate = await requireRole(context.request, context.env, "admin");
    if (gate.error) return gate.error;
    const body = await readJson(context.request);
    if (!body) return bad(400, "invalid body");

    const username = String(body.username || "").trim();
    if (!username || username.length > 80) return bad(400, "invalid username");
    const name = String(body.name || username);
    const role = body.role === "worker" ? "worker" : "admin";
    const password = body.password ? String(body.password) : "";

    const existing = await context.env.DB
        .prepare("SELECT username FROM users WHERE username = ?")
        .bind(username)
        .first();

    if (!existing) {
        if (!password) return bad(400, "password required for new user");
        const rec = await makeUserRecord(name, role, password);
        await context.env.DB
            .prepare("INSERT INTO users (username, name, role, salt, iterations, hash, algo, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)")
            .bind(username, rec.name, rec.role, rec.salt, rec.iterations, rec.hash, rec.algo, Date.now())
            .run();
        return json({ user: { username, name: rec.name, role: rec.role } });
    }

    // Update name/role, and password only if provided.
    if (password) {
        const salt = genSalt();
        const iterations = 100000;
        const hash = await pbkdf2Hex(password, salt, iterations);
        await context.env.DB
            .prepare("UPDATE users SET name = ?, role = ?, salt = ?, iterations = ?, hash = ?, algo = 'PBKDF2-SHA256' WHERE username = ?")
            .bind(name, role, salt, iterations, hash, username)
            .run();
    } else {
        await context.env.DB
            .prepare("UPDATE users SET name = ?, role = ? WHERE username = ?")
            .bind(name, role, username)
            .run();
    }
    return json({ user: { username, name, role } });
}

// DELETE /api/users?username=... -> admin. Refuses to remove the last admin.
export async function onRequestDelete(context) {
    const gate = await requireRole(context.request, context.env, "admin");
    if (gate.error) return gate.error;
    const username = new URL(context.request.url).searchParams.get("username");
    if (!username) return bad(400, "missing username");

    const target = await context.env.DB
        .prepare("SELECT role FROM users WHERE username = ?")
        .bind(username)
        .first();
    if (!target) return json({ ok: true });

    if (target.role === "admin") {
        const row = await context.env.DB
            .prepare("SELECT COUNT(*) AS c FROM users WHERE role = 'admin'")
            .first();
        if (row && row.c <= 1) return bad(400, "cannot remove the last admin");
    }
    await context.env.DB.prepare("DELETE FROM users WHERE username = ?").bind(username).run();
    return json({ ok: true });
}
