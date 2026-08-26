import { json, bad, requireRole, readJson, pbkdf2Hex, safeEqual, genSalt, passwordError, getSessionVersion } from "./_utils.js";

// POST /api/change-password -> current admin only.
// The target account always comes from the signed-in session, never the request body.
export async function onRequestPost(context) {
    const gate = await requireRole(context.request, context.env, "admin");
    if (gate.error) return gate.error;

    const body = await readJson(context.request);
    if (!body) return bad(400, "invalid body");

    const currentPassword = String(body.currentPassword || "");
    const newPassword = String(body.newPassword || "");
    const confirmPassword = String(body.confirmPassword || "");
    if (!currentPassword || !newPassword || !confirmPassword) return bad(400, "all password fields are required");
    if (currentPassword.length > 200 || confirmPassword.length > 200) return bad(400, "password is too long");
    if (newPassword !== confirmPassword) return bad(400, "new passwords do not match");
    const policyError = passwordError(newPassword);
    if (policyError) return bad(400, policyError);

    const user = await context.env.DB
        .prepare("SELECT salt, iterations, hash FROM users WHERE username = ?")
        .bind(gate.user.sub)
        .first();
    if (!user) return bad(401, "unauthorized");

    const currentHash = await pbkdf2Hex(currentPassword, user.salt, user.iterations || 100000);
    if (!safeEqual(currentHash, user.hash)) return bad(400, "current password is incorrect");
    if (safeEqual(currentPassword, newPassword)) return bad(400, "new password must be different");

    const salt = genSalt();
    const iterations = 100000;
    const hash = await pbkdf2Hex(newPassword, salt, iterations);
    const currentVersion = parseInt(await getSessionVersion(context.env), 10) || 1;
    const nextVersion = currentVersion + 1;

    await context.env.DB.batch([
        context.env.DB
            .prepare("UPDATE users SET salt = ?, iterations = ?, hash = ?, algo = 'PBKDF2-SHA256' WHERE username = ?")
            .bind(salt, iterations, hash, gate.user.sub),
        context.env.DB
            .prepare("INSERT INTO meta (key, value) VALUES ('sessionVersion', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value")
            .bind(String(nextVersion))
    ]);

    return json({ ok: true });
}
