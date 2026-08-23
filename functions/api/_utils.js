// Shared helpers for the floria secure API (Cloudflare Pages Functions + D1).
// Underscore-prefixed: NOT routed, importable by other functions.

const enc = new TextEncoder();
const dec = new TextDecoder();

export function json(data, status = 200, extraHeaders = {}) {
    return new Response(JSON.stringify(data), {
        status,
        headers: { "Content-Type": "application/json; charset=utf-8", ...extraHeaders }
    });
}

export function bad(status, message) { return json({ error: message }, status); }

// ---- base64url ----
function b64urlFromBytes(buf) {
    const arr = new Uint8Array(buf);
    let bin = "";
    for (let i = 0; i < arr.length; i++) bin += String.fromCharCode(arr[i]);
    return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function b64urlFromStr(str) { return b64urlFromBytes(enc.encode(str)); }
function strFromB64url(s) {
    s = s.replace(/-/g, "+").replace(/_/g, "/");
    while (s.length % 4) s += "=";
    const bin = atob(s);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return dec.decode(bytes);
}

// ---- hex ----
function toHex(buf) {
    const b = new Uint8Array(buf);
    let h = "";
    for (let i = 0; i < b.length; i++) h += b[i].toString(16).padStart(2, "0");
    return h;
}
function fromHex(hex) {
    const len = Math.floor(hex.length / 2);
    const out = new Uint8Array(len);
    for (let i = 0; i < len; i++) out[i] = parseInt(hex.substr(i * 2, 2), 16);
    return out;
}

// ---- password hashing (PBKDF2-SHA256) ----
export function genSalt() {
    const b = new Uint8Array(16);
    crypto.getRandomValues(b);
    return toHex(b);
}

// PBKDF2 iteration count. Capped at 100k to stay within the Cloudflare
// Workers free-tier per-request CPU budget (150k trips the limit -> 1101).
export async function pbkdf2Hex(password, saltHex, iterations = 100000) {
    const key = await crypto.subtle.importKey("raw", enc.encode(password), { name: "PBKDF2" }, false, ["deriveBits"]);
    const bits = await crypto.subtle.deriveBits(
        { name: "PBKDF2", salt: fromHex(saltHex), iterations, hash: "SHA-256" },
        key,
        256
    );
    return toHex(bits);
}

export async function makeUserRecord(name, role, password) {
    const salt = genSalt();
    const iterations = 100000;
    const hash = await pbkdf2Hex(password, salt, iterations);
    return { name: String(name || ""), role: role === "worker" ? "worker" : "admin", salt, iterations, hash, algo: "PBKDF2-SHA256" };
}

export function safeEqual(a, b) {
    if (typeof a !== "string" || typeof b !== "string" || a.length !== b.length) return false;
    let diff = 0;
    for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
    return diff === 0;
}

// ---- signed session tokens (HMAC-SHA256, JWT-like) ----
async function hmac(secret, data) {
    const key = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
    const sig = await crypto.subtle.sign("HMAC", key, enc.encode(data));
    return b64urlFromBytes(sig);
}

export async function signToken(secret, payload) {
    const header = b64urlFromStr(JSON.stringify({ alg: "HS256", typ: "JWT" }));
    const body = b64urlFromStr(JSON.stringify(payload));
    const sig = await hmac(secret, header + "." + body);
    return header + "." + body + "." + sig;
}

export async function verifyToken(secret, token) {
    if (!token || typeof token !== "string") return null;
    const parts = token.split(".");
    if (parts.length !== 3) return null;
    const expected = await hmac(secret, parts[0] + "." + parts[1]);
    if (!safeEqual(expected, parts[2])) return null;
    let payload;
    try { payload = JSON.parse(strFromB64url(parts[1])); } catch (e) { return null; }
    if (!payload || typeof payload.exp !== "number" || payload.exp < Math.floor(Date.now() / 1000)) return null;
    return payload;
}

export function getBearer(request) {
    const h = request.headers.get("Authorization") || "";
    const m = h.match(/^Bearer\s+(.+)$/i);
    return m ? m[1] : null;
}

export async function getSessionVersion(env) {
    const row = await env.DB.prepare("SELECT value FROM meta WHERE key = 'sessionVersion'").first();
    return row ? String(row.value) : "1";
}

// Returns the verified token payload, or null. Also enforces the global
// sessionVersion (so "log out everyone" invalidates existing tokens).
export async function authenticate(request, env) {
    if (!env.AUTH_SECRET) return null;
    const payload = await verifyToken(env.AUTH_SECRET, getBearer(request));
    if (!payload) return null;
    const sv = await getSessionVersion(env);
    if (String(payload.sv) !== sv) return null;
    return payload;
}

// Gate a request. role=null -> any authenticated user; role='admin' -> admins only.
export async function requireRole(request, env, role) {
    const user = await authenticate(request, env);
    if (!user) return { error: bad(401, "unauthorized"), user: null };
    if (role && user.role !== role) return { error: bad(403, "forbidden"), user: null };
    return { error: null, user };
}

export async function readJson(request) {
    try { return await request.json(); } catch (e) { return null; }
}
