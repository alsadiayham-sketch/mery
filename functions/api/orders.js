import { json, bad, requireRole, authenticate, readJson } from "./_utils.js";

function rowToOrder(row) {
    let obj = {};
    try { obj = JSON.parse(row.data) || {}; } catch (e) { obj = {}; }
    obj.id = row.id;
    obj.status = row.status;
    obj.createdAt = row.created_at;
    return obj;
}
function newId() {
    const bytes = new Uint8Array(12);
    crypto.getRandomValues(bytes);
    return "ORD-" + Array.from(bytes, value => value.toString(16).padStart(2, "0")).join("").toUpperCase();
}

function cleanText(value, maxLength) {
    return String(value || "").trim().slice(0, maxLength);
}

function cleanPhone(value) {
    return String(value || "").replace(/[^\d+]/g, "").slice(0, 16);
}

const DEFAULT_DELIVERY_ZONES = [
    { id: "westbank", name: "الضفة", price: 20 },
    { id: "jerusalem", name: "القدس", price: 30 },
    { id: "inside", name: "الداخل", price: 60 }
];
const DEFAULT_PICKUP_LOCATIONS = [{ id: "main", name: "نقطة الاستلام الرئيسية", address: "" }];

async function loadShippingConfig(env) {
    const row = await env.DB.prepare("SELECT data FROM settings WHERE key = ?").bind("config").first();
    let settings = {};
    try { settings = row ? JSON.parse(row.data) || {} : {}; } catch (e) {}
    const zones = Array.isArray(settings.deliveryZones) ? settings.deliveryZones.map((zone, index) => ({
        id: cleanText(zone && zone.id, 50) || "zone_" + index,
        name: cleanText(zone && zone.name, 80),
        price: Math.max(0, Math.round(Number(zone && zone.price) || 0))
    })).filter(zone => zone.name) : DEFAULT_DELIVERY_ZONES;
    const pickupLocations = Array.isArray(settings.pickupLocations) ? settings.pickupLocations.map((location, index) => ({
        id: cleanText(location && location.id, 50) || "pickup_" + index,
        name: cleanText(location && location.name, 100),
        address: cleanText(location && location.address, 250)
    })).filter(location => location.name) : DEFAULT_PICKUP_LOCATIONS;
    return { zones, pickupLocations };
}

function normalizePhone(value) {
    return String(value || "").replace(/\D/g, "");
}

function getSizeLabel(sizeData) {
    const size = String(sizeData && sizeData.size ? sizeData.size : "").trim();
    if (!size || size === "-") return "";
    const unit = sizeData && sizeData.unit ? String(sizeData.unit) : "";
    const suffix = unit === "g" ? " غرام" : unit === "cm" ? " سم" : unit === "ml" ? " مل" : "";
    return size + suffix;
}

async function loadDiscounts(env) {
    const { results } = await env.DB.prepare("SELECT data FROM discounts").all();
    return (results || []).map(row => {
        try { return JSON.parse(row.data) || {}; } catch (e) { return {}; }
    });
}

function getDiscountPercent(product, discounts) {
    let percent = Math.max(0, Math.min(99, Number(product.discount) || 0));
    const today = new Date().toISOString().slice(0, 10);
    discounts.forEach(discount => {
        if (discount.expiresAt && discount.expiresAt < today) return;
        const values = Array.isArray(discount.values)
            ? discount.values
            : String(discount.value || "").split(",").map(value => value.trim()).filter(Boolean);
        if (discount.type === "all" ||
            (discount.type === "brand" && values.includes(product.brand)) ||
            (discount.type === "category" && values.includes(product.category))) {
            percent = Math.max(percent, Math.max(0, Math.min(99, Number(discount.percentage) || 0)));
        }
    });
    return percent;
}

async function buildTrustedItems(items, env) {
    const discounts = await loadDiscounts(env);
    const trustedItems = [];
    let pricingPending = false;

    for (const rawItem of items.slice(0, 50)) {
        if (rawItem && rawItem.type === "custom_package") {
            pricingPending = true;
            trustedItems.push({
                type: "custom_package",
                id: "pkg_" + crypto.randomUUID(),
                name: "علبة مخصصة",
                sets: Array.isArray(rawItem.sets) ? rawItem.sets.slice(0, 10).map(setItem => ({
                    chocolateType: cleanText(setItem && setItem.chocolateType, 40),
                    filling: cleanText(setItem && setItem.filling, 40),
                    qty: Math.max(1, Math.min(50, parseInt(setItem && setItem.qty, 10) || 1))
                })) : [],
                wrapperColor: cleanText(rawItem.wrapperColor, 40),
                notes: cleanText(rawItem.notes, 300),
                delivery: rawItem.delivery === "pickup" ? "pickup" : "delivery",
                customerName: cleanText(rawItem.customerName, 100),
                customerPhone: cleanPhone(rawItem.customerPhone),
                customerLocation: cleanText(rawItem.customerLocation, 250),
                qty: 1,
                pricePending: true
            });
            continue;
        }

        // Older cached checkout pages send productId, while the current cart
        // representation uses id. Accept both so a cached static page cannot
        // make an otherwise valid checkout fail during a deployment update.
        const productId = cleanText(rawItem && (rawItem.id || rawItem.productId), 100);
        if (!productId) continue;
        const row = await env.DB.prepare("SELECT data, stock FROM products WHERE id = ?").bind(productId).first();
        if (!row) continue;
        let product;
        try { product = JSON.parse(row.data) || {}; } catch (e) { continue; }
        if (product.status === "soldout") continue;

        const sizes = Array.isArray(product.sizes) && product.sizes.length ? product.sizes : [];
        if (!sizes.length) continue;
        const sizeIdx = Math.max(0, Math.min(sizes.length - 1, parseInt(rawItem.sizeIdx, 10) || 0));
        const sizeData = sizes[sizeIdx];
        const originalPrice = Math.max(0, Number(sizeData.price) || 0);
        const discountPercent = getDiscountPercent(product, discounts);
        const price = discountPercent > 0 ? Math.round(originalPrice * (1 - discountPercent / 100)) : originalPrice;
        const qty = Math.max(1, Math.min(20, parseInt(rawItem.qty, 10) || 1));

        trustedItems.push({
            id: productId,
            name: cleanText(product.name, 160),
            brand: cleanText(product.brand, 100),
            category: cleanText(product.category, 100),
            sizeIdx,
            sizeLabel: getSizeLabel(sizeData),
            qty,
            price,
            lineTotal: price * qty
        });
    }

    return { items: trustedItems, pricingPending };
}

function getRequestedStock(items) {
    const requested = new Map();
    items.forEach(item => {
        if (!item.pricePending) requested.set(item.id, (requested.get(item.id) || 0) + item.qty);
    });
    return requested;
}

// GET /api/orders -> list, any authenticated user (admin or worker).
// Public tracking requires both the high-entropy order id and matching phone,
// and returns status-only data without customer PII.
export async function onRequestGet(context) {
    const url = new URL(context.request.url);
    const id = url.searchParams.get("id");
    if (id) {
        const phone = normalizePhone(url.searchParams.get("phone"));
        if (phone.length < 9) return bad(400, "phone required");
        const row = await context.env.DB
            .prepare("SELECT id, data, status, created_at FROM orders WHERE id = ?")
            .bind(id)
            .first();
        if (!row) return json({ order: null });
        const order = rowToOrder(row);
        if (normalizePhone(order.customerPhone) !== phone) return json({ order: null });
        return json({
            order: {
                id: order.id,
                status: order.status,
                createdAt: order.createdAt,
                date: order.date || order.createdAt
            }
        });
    }
    const gate = await requireRole(context.request, context.env, null);
    if (gate.error) return gate.error;
    const { results } = await context.env.DB
        .prepare("SELECT id, data, status, created_at FROM orders ORDER BY created_at DESC")
        .all();
    return json({ orders: (results || []).map(rowToOrder) });
}

// POST /api/orders -> PUBLIC (checkout). Stores the order; returns its id.
export async function onRequestPost(context) {
    const body = await readJson(context.request);
    if (!body || typeof body !== "object") return bad(400, "invalid body");

    const customerName = cleanText(body.customerName, 100);
    const customerPhone = cleanPhone(body.customerPhone);
    if (!customerName || normalizePhone(customerPhone).length < 9) return bad(400, "invalid customer");
    if (!Array.isArray(body.items) || !body.items.length) return bad(400, "invalid items");

    const trusted = await buildTrustedItems(body.items, context.env);
    if (!trusted.items.length || trusted.items.length !== body.items.length) return bad(400, "invalid items");
    const requestedStock = getRequestedStock(trusted.items);
    const shortages = [];
    for (const [productId, requested] of requestedStock) {
        const row = await context.env.DB.prepare("SELECT data, stock FROM products WHERE id = ?").bind(productId).first();
        if (!row || Number(row.stock) < requested) {
            let product = {};
            try { product = row ? JSON.parse(row.data) || {} : {}; } catch (e) {}
            shortages.push({ productId, name: cleanText(product.name, 160), requested, available: row ? Math.max(0, Number(row.stock) || 0) : 0 });
        }
    }
    if (shortages.length) return json({ error: "insufficient_stock", shortages }, 409);

    const shippingConfig = await loadShippingConfig(context.env);
    const delivery = body.delivery === "pickup" ? "pickup" : "delivery";
    const region = delivery === "pickup" ? "pickup" : cleanText(body.region, 50);
    const deliveryZone = delivery === "delivery"
        ? shippingConfig.zones.find(zone => zone.id === region)
        : null;
    const requestedPickupLocation = cleanText(body.pickupLocationId, 50);
    const pickupLocation = delivery === "pickup"
        ? shippingConfig.pickupLocations.find(location => location.id === requestedPickupLocation) ||
            (shippingConfig.pickupLocations.length === 1 ? shippingConfig.pickupLocations[0] : null)
        : null;
    if ((delivery === "delivery" && !deliveryZone) || (delivery === "pickup" && !pickupLocation)) return bad(400, "invalid delivery option");
    const subtotal = trusted.items.reduce((sum, item) => sum + (Number(item.lineTotal) || 0), 0);
    const deliveryCost = delivery === "pickup" ? 0 : deliveryZone.price;
    const total = subtotal + deliveryCost;
    const now = Date.now();
    const id = newId();
    const status = "new";
    const data = {
        customerName,
        customerPhone,
        address: delivery === "delivery" ? cleanText(body.address, 300) : "",
        notes: cleanText(body.notes, 500),
        delivery,
        region,
        regionName: deliveryZone ? deliveryZone.name : "",
        pickupLocationId: pickupLocation ? pickupLocation.id : "",
        pickupLocationName: pickupLocation ? pickupLocation.name : "",
        pickupLocationAddress: pickupLocation ? pickupLocation.address : "",
        items: trusted.items,
        subtotal,
        deliveryCost,
        total,
        totalDisplay: trusted.pricingPending ? "يحدد بعد تأكيد الإدارة" : "₪" + total,
        pricingPending: trusted.pricingPending,
        date: new Date(now).toISOString()
    };
    const statements = [];
    requestedStock.forEach((requested, productId) => {
        statements.push(context.env.DB.prepare("UPDATE products SET stock = stock - ?, stock_updated_at = ? WHERE id = ?").bind(requested, now, productId));
    });
    statements.push(context.env.DB
        .prepare("INSERT INTO orders (id, data, status, created_at) VALUES (?, ?, ?, ?)")
        .bind(id, JSON.stringify(data), status, now));
    try {
        await context.env.DB.batch(statements);
    } catch (error) {
        if (String(error && error.message || error).includes("CHECK constraint failed")) {
            return json({ error: "insufficient_stock" }, 409);
        }
        return bad(500, "could not save order");
    }
    return json({ id, order: { ...data, id, status, createdAt: now } });
}

// PATCH /api/orders?id=...  body { status } -> any authenticated user
export async function onRequestPatch(context) {
    const gate = await requireRole(context.request, context.env, null);
    if (gate.error) return gate.error;
    const id = new URL(context.request.url).searchParams.get("id");
    if (!id) return bad(400, "missing id");
    const body = await readJson(context.request);
    if (!body || !body.status) return bad(400, "missing status");
    const status = String(body.status);
    if (!["new", "processing", "completed", "cancelled"].includes(status)) return bad(400, "invalid status");
    await context.env.DB
        .prepare("UPDATE orders SET status = ? WHERE id = ?")
        .bind(status, id)
        .run();
    return json({ ok: true });
}

// DELETE /api/orders?id=... -> admin only
export async function onRequestDelete(context) {
    const gate = await requireRole(context.request, context.env, "admin");
    if (gate.error) return gate.error;
    const id = new URL(context.request.url).searchParams.get("id");
    if (!id) return bad(400, "missing id");
    await context.env.DB.prepare("DELETE FROM orders WHERE id = ?").bind(id).run();
    return json({ ok: true });
}
