const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const bcrypt = require("bcryptjs");

const ADMIN_LOGIN = String(process.env.ADMIN_LOGIN || "admin");
const ADMIN_PASSWORD = "admin";
const ADMIN_PASSWORD_HASH = "";
const SESSION_SECRET = String(
  process.env.SESSION_SECRET || "change_this_session_secret_for_production"
);
const DB_PATH = process.env.DB_PATH
  ? path.resolve(process.env.DB_PATH)
  : path.join(process.cwd(), "data", "db.json");
const TMP_DB_PATH = "/tmp/site-db.json";
const BLOBS_STORE_NAME = String(process.env.NETLIFY_BLOBS_STORE || "site-db");
const NETLIFY_BLOBS_SITE_ID = String(process.env.NETLIFY_BLOBS_SITE_ID || process.env.NETLIFY_SITE_ID || "");
const NETLIFY_BLOBS_TOKEN = String(process.env.NETLIFY_BLOBS_TOKEN || process.env.NETLIFY_AUTH_TOKEN || "");
const FORCE_LOCAL_DB = String(process.env.FORCE_LOCAL_DB || "").toLowerCase() === "true";
const USE_BLOBS = !FORCE_LOCAL_DB;
const IS_NETLIFY_RUNTIME = process.env.NETLIFY === "true";
const CLOUDINARY_CLOUD_NAME = String(process.env.CLOUDINARY_CLOUD_NAME || "");
const CLOUDINARY_API_KEY = String(process.env.CLOUDINARY_API_KEY || "");
const CLOUDINARY_API_SECRET = String(process.env.CLOUDINARY_API_SECRET || "");

const INITIAL_DB = {
  products: [],
  inventoryLogs: [],
  orders: [],
  promoCodes: [],
  counters: { product: 1, order: 1, log: 1, promo: 1 },
};

let blobsModulePromise = null;
async function getBlobsStore() {
  if (!blobsModulePromise) blobsModulePromise = import("@netlify/blobs");
  const mod = await blobsModulePromise;
  if (NETLIFY_BLOBS_SITE_ID && NETLIFY_BLOBS_TOKEN) {
    try {
      return mod.getStore({
        name: BLOBS_STORE_NAME,
        siteID: NETLIFY_BLOBS_SITE_ID,
        token: NETLIFY_BLOBS_TOKEN,
      });
    } catch {
      // fallback to context-based store resolution
    }
  }
  return mod.getStore(BLOBS_STORE_NAME);
}

function effectiveDbPath() {
  if (process.env.NETLIFY === "true") return TMP_DB_PATH;
  return DB_PATH;
}

function nowIso() {
  return new Date().toISOString();
}

function toNum(v, fallback = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function json(statusCode, data, extraHeaders = {}) {
  return {
    statusCode,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
      Pragma: "no-cache",
      Expires: "0",
      ...extraHeaders,
    },
    body: JSON.stringify(data),
  };
}

function normalizeDb(db) {
  if (!db || typeof db !== "object") db = { ...INITIAL_DB };
  if (!Array.isArray(db.products)) db.products = [];
  if (!Array.isArray(db.inventoryLogs)) db.inventoryLogs = [];
  if (!Array.isArray(db.orders)) db.orders = [];
  if (!Array.isArray(db.promoCodes)) db.promoCodes = [];
  if (!db.counters || typeof db.counters !== "object") db.counters = {};
  if (!db.counters.product) db.counters.product = 1;
  if (!db.counters.order) db.counters.order = 1;
  if (!db.counters.log) db.counters.log = 1;
  if (!db.counters.promo) db.counters.promo = 1;
  return db;
}

async function readDb() {
  if (USE_BLOBS) {
    try {
      const store = await getBlobsStore();
      const raw = await store.get("db.json");
      if (!raw) {
        await store.set("db.json", JSON.stringify(INITIAL_DB));
        return { ...INITIAL_DB };
      }
      const db = normalizeDb(JSON.parse(raw));
      return db;
    } catch (err) {
      if (IS_NETLIFY_RUNTIME) {
        throw new Error(
          `Persistent storage is not configured. Set NETLIFY_BLOBS_STORE, NETLIFY_BLOBS_SITE_ID and NETLIFY_BLOBS_TOKEN. Original: ${err?.message || "unknown"}`
        );
      }
      // Local development fallback only.
    }
  }

  const primaryPath = effectiveDbPath();
  const fallbackPath = TMP_DB_PATH;
  const candidates = [primaryPath, fallbackPath].filter((v, i, a) => v && a.indexOf(v) === i);

  for (const dbPath of candidates) {
    try {
      const dir = path.dirname(dbPath);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      if (!fs.existsSync(dbPath)) {
        fs.writeFileSync(dbPath, JSON.stringify(INITIAL_DB, null, 2));
        return { ...INITIAL_DB };
      }
      const db = normalizeDb(JSON.parse(fs.readFileSync(dbPath, "utf-8")));
      return db;
    } catch {
      // try next candidate path
    }
  }

  throw new Error("No writable storage path available");
}

async function writeDb(db) {
  const normalized = normalizeDb(db);
  if (USE_BLOBS) {
    try {
      const store = await getBlobsStore();
      await store.set("db.json", JSON.stringify(normalized));
      return;
    } catch (err) {
      if (IS_NETLIFY_RUNTIME) {
        throw new Error(
          `Persistent storage is not configured. Set NETLIFY_BLOBS_STORE, NETLIFY_BLOBS_SITE_ID and NETLIFY_BLOBS_TOKEN. Original: ${err?.message || "unknown"}`
        );
      }
      // Local development fallback only.
    }
  }
  const primaryPath = effectiveDbPath();
  const fallbackPath = TMP_DB_PATH;
  const candidates = [primaryPath, fallbackPath].filter((v, i, a) => v && a.indexOf(v) === i);

  for (const dbPath of candidates) {
    try {
      const dir = path.dirname(dbPath);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(dbPath, JSON.stringify(normalized, null, 2));
      return;
    } catch {
      // try next candidate path
    }
  }

  throw new Error("No writable storage path available");
}

function parseCookies(cookieHeader) {
  const source = String(cookieHeader || "");
  const out = {};
  source.split(";").forEach((part) => {
    const idx = part.indexOf("=");
    if (idx <= 0) return;
    const key = part.slice(0, idx).trim();
    const value = part.slice(idx + 1).trim();
    out[key] = decodeURIComponent(value);
  });
  return out;
}

function sign(payload) {
  return crypto.createHmac("sha256", SESSION_SECRET).update(payload).digest("hex");
}

function signCloudinaryPayload(payload) {
  return crypto.createHash("sha1").update(`${payload}${CLOUDINARY_API_SECRET}`).digest("hex");
}

function createAdminToken() {
  const payload = JSON.stringify({
    login: ADMIN_LOGIN,
    exp: Date.now() + 1000 * 60 * 60 * 12,
  });
  const encoded = Buffer.from(payload).toString("base64url");
  const signature = sign(encoded);
  return `${encoded}.${signature}`;
}

function verifyAdminToken(token) {
  const raw = String(token || "");
  const [encoded, signature] = raw.split(".");
  if (!encoded || !signature) return false;
  if (sign(encoded) !== signature) return false;
  try {
    const payload = JSON.parse(Buffer.from(encoded, "base64url").toString("utf-8"));
    return payload?.login === ADMIN_LOGIN && Number(payload?.exp || 0) > Date.now();
  } catch {
    return false;
  }
}

function adminAuthed(event) {
  const cookies = parseCookies(event.headers?.cookie || event.headers?.Cookie);
  return verifyAdminToken(cookies.zhuchy_admin_token);
}

function setAuthCookie(token) {
  const secure = process.env.CONTEXT === "production" ? "; Secure" : "";
  return `zhuchy_admin_token=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=43200${secure}`;
}

function clearAuthCookie() {
  return "zhuchy_admin_token=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0";
}

async function verifyAdminPassword(rawPassword) {
  const raw = String(rawPassword || "");
  if (ADMIN_PASSWORD_HASH) return bcrypt.compare(raw, ADMIN_PASSWORD_HASH);
  return raw === ADMIN_PASSWORD;
}

function findProduct(db, productId) {
  return db.products.find((p) => String(p.id) === String(productId));
}

function resetCounter(db, key, collectionName) {
  const maxId = db[collectionName].reduce((max, item) => Math.max(max, toNum(item?.id, 0)), 0);
  db.counters[key] = maxId + 1;
}

function buildAnalytics(db) {
  const byDayMap = new Map();
  const salesByProduct = new Map();
  db.orders.forEach((o) => {
    const day = String(o.createdAt || "").slice(0, 10);
    let orderRevenue = toNum(o.total, 0);
    if (!orderRevenue) {
      orderRevenue = o.items.reduce((sum, it) => sum + toNum(it.qty) * toNum(it.price), 0);
    }
    o.items.forEach((it) => {
      const qty = toNum(it.qty, 0);
      const revenue = qty * toNum(it.price, 0);
      orderRevenue += revenue;
      const prev = salesByProduct.get(it.productId) || {
        productId: it.productId,
        productName: it.productName,
        qty: 0,
        revenue: 0,
      };
      prev.qty += qty;
      prev.revenue += revenue;
      salesByProduct.set(it.productId, prev);
    });
    byDayMap.set(day, (byDayMap.get(day) || 0) + orderRevenue);
  });
  const byDay = Array.from(byDayMap.entries())
    .map(([date, revenue]) => ({ date, revenue }))
    .sort((a, b) => (a.date > b.date ? 1 : -1));
  const topByQty = Array.from(salesByProduct.values())
    .sort((a, b) => b.qty - a.qty)
    .slice(0, 10);
  const topByRevenue = Array.from(salesByProduct.values())
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, 10);
  return {
    totalOrders: db.orders.length,
    totalProducts: db.products.length,
    totalRevenue: db.orders.reduce((sum, o) => {
      const total = toNum(o.total, 0);
      if (total) return sum + total;
      return sum + o.items.reduce((s, it) => s + toNum(it.qty) * toNum(it.price), 0);
    }, 0),
    byDay,
    topByQty,
    topByRevenue,
  };
}

function parseBody(event) {
  if (!event.body) return {};
  if (event.isBase64Encoded) {
    const raw = Buffer.from(event.body, "base64").toString("utf-8");
    return raw ? JSON.parse(raw) : {};
  }
  return JSON.parse(event.body);
}

function routeOf(event) {
  const qs = event.queryStringParameters || {};
  const routeFromQuery = String(qs.route || "").trim();
  if (routeFromQuery) {
    const normalized = `/api/${routeFromQuery.replace(/^\/+/, "")}`.replace(/\/+$/, "");
    return normalized || "/";
  }
  const headerPath = String(
    event.headers?.["x-original-path"] ||
      event.headers?.["x-nf-original-path"] ||
      event.headers?.["x-forwarded-path"] ||
      ""
  ).trim();
  if (headerPath) {
    const normalized = headerPath.replace(/\/+$/, "");
    return normalized || "/";
  }
  const p = String(event.path || "").replace(/\/+$/, "");
  return p || "/";
}

exports.handler = async (event) => {
  const method = String(event.httpMethod || "GET").toUpperCase();
  const route = routeOf(event);

  try {
    if (route === "/admin" && method === "GET") {
      return { statusCode: 302, headers: { Location: "/admin.html" }, body: "" };
    }

    if (route === "/api/admin/session" && method === "GET") {
      return json(200, { authenticated: adminAuthed(event) });
    }

    if (route === "/api/admin/login" && method === "POST") {
      const body = parseBody(event);
      const login = String(body?.login || "").trim();
      const password = String(body?.password || "");
      if (!login || !password) return json(400, { error: "login and password are required" });
      if (login !== ADMIN_LOGIN) return json(401, { error: "Invalid credentials" });
      const ok = await verifyAdminPassword(password);
      if (!ok) return json(401, { error: "Invalid credentials" });
      return json(200, { ok: true }, { "Set-Cookie": setAuthCookie(createAdminToken()) });
    }

    if (route === "/api/admin/logout" && method === "POST") {
      if (!adminAuthed(event)) return json(401, { error: "Unauthorized" });
      return json(200, { ok: true }, { "Set-Cookie": clearAuthCookie() });
    }

    if (route === "/api/upload-image-sign" && method === "POST") {
      if (!adminAuthed(event)) return json(401, { error: "Unauthorized" });
      if (!CLOUDINARY_CLOUD_NAME || !CLOUDINARY_API_KEY || !CLOUDINARY_API_SECRET) {
        return json(400, {
          error: "Cloudinary is not configured. Set CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET",
        });
      }
      const timestamp = Math.floor(Date.now() / 1000);
      const folder = "zhuchy-club/products";
      const signature = signCloudinaryPayload(`folder=${folder}&timestamp=${timestamp}`);
      return json(200, {
        cloudName: CLOUDINARY_CLOUD_NAME,
        apiKey: CLOUDINARY_API_KEY,
        folder,
        timestamp,
        signature,
      });
    }

    if (route === "/api/upload-image" && method === "POST") {
      return json(400, {
        error: "Use signed upload flow: first call /api/upload-image-sign, then upload to Cloudinary.",
      });
    }

    if (route === "/api/products" && method === "GET") {
      const db = await readDb();
      return json(200, db.products);
    }

    if (route === "/api/products" && method === "POST") {
      if (!adminAuthed(event)) return json(401, { error: "Unauthorized" });
      const db = await readDb();
      const body = parseBody(event);
      if (!body.name || !String(body.name).trim()) return json(400, { error: "name is required" });
      const product = {
        id: db.counters.product++,
        name: String(body.name).trim(),
        category: String(body.category || "other"),
        sale: body.sale === true || String(body.sale) === "true",
        price: toNum(body.price, 0),
        oldPrice: Math.max(0, toNum(body.oldPrice, 0)),
        stock: Math.max(0, toNum(body.stock, 0)),
        sizes: Array.isArray(body.sizes)
          ? body.sizes.map(String).filter(Boolean)
          : String(body.sizes || "")
              .split(",")
              .map((s) => s.trim())
              .filter(Boolean),
        colors: Array.isArray(body.colors)
          ? body.colors.map(String).filter(Boolean)
          : String(body.colors || "")
              .split(",")
              .map((s) => s.trim())
              .filter(Boolean),
        image: String(body.image || ""),
        description: String(body.description || ""),
        composition: String(body.composition || ""),
        care: String(body.care || ""),
        createdAt: nowIso(),
        updatedAt: nowIso(),
      };
      db.products.push(product);
      await writeDb(db);
      return json(201, product);
    }

    const productIdMatch = route.match(/^\/api\/products\/([^/]+)$/);
    if (productIdMatch && method === "GET") {
      const db = await readDb();
      const p = findProduct(db, productIdMatch[1]);
      if (!p) return json(404, { error: "Product not found" });
      return json(200, p);
    }
    if (productIdMatch && method === "PUT") {
      if (!adminAuthed(event)) return json(401, { error: "Unauthorized" });
      const db = await readDb();
      const p = findProduct(db, productIdMatch[1]);
      if (!p) return json(404, { error: "Product not found" });
      const body = parseBody(event);
      if (body.name !== undefined) p.name = String(body.name).trim();
      if (body.category !== undefined) p.category = String(body.category);
      if (body.sale !== undefined) p.sale = body.sale === true || String(body.sale) === "true";
      if (body.price !== undefined) p.price = Math.max(0, toNum(body.price, 0));
      if (body.oldPrice !== undefined) p.oldPrice = Math.max(0, toNum(body.oldPrice, 0));
      if (body.stock !== undefined) p.stock = Math.max(0, toNum(body.stock, 0));
      if (body.sizes !== undefined) {
        p.sizes = Array.isArray(body.sizes)
          ? body.sizes.map(String).filter(Boolean)
          : String(body.sizes)
              .split(",")
              .map((s) => s.trim())
              .filter(Boolean);
      }
      if (body.colors !== undefined) {
        p.colors = Array.isArray(body.colors)
          ? body.colors.map(String).filter(Boolean)
          : String(body.colors)
              .split(",")
              .map((s) => s.trim())
              .filter(Boolean);
      }
      if (body.image !== undefined) p.image = String(body.image || "");
      if (body.description !== undefined) p.description = String(body.description || "");
      if (body.composition !== undefined) p.composition = String(body.composition || "");
      if (body.care !== undefined) p.care = String(body.care || "");
      p.updatedAt = nowIso();
      await writeDb(db);
      return json(200, p);
    }
    if (productIdMatch && method === "DELETE") {
      if (!adminAuthed(event)) return json(401, { error: "Unauthorized" });
      const db = await readDb();
      const id = String(productIdMatch[1]);
      const before = db.products.length;
      db.products = db.products.filter((p) => String(p.id) !== id);
      if (db.products.length === before) return json(404, { error: "Product not found" });
      await writeDb(db);
      return json(200, { ok: true });
    }

    if (route === "/api/inventory" && method === "GET") {
      if (!adminAuthed(event)) return json(401, { error: "Unauthorized" });
      const db = await readDb();
      return json(200, {
        products: db.products.map((p) => ({
          id: p.id,
          name: p.name,
          stock: p.stock,
          category: p.category,
          sale: !!p.sale,
        })),
        logs: db.inventoryLogs.slice().sort((a, b) => b.id - a.id).slice(0, 50),
      });
    }

    if (route === "/api/admin/dashboard" && method === "GET") {
      if (!adminAuthed(event)) return json(401, { error: "Unauthorized" });
      const db = await readDb();
      const orders = db.orders
        .slice()
        .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
        .map((o) => {
          const subtotal = o.items.reduce((sum, it) => sum + toNum(it.qty) * toNum(it.price), 0);
          const discount = toNum(o.discountAmount, 0);
          const total = Math.max(0, subtotal - discount);
          return { ...o, subtotal, discount, total };
        });
      return json(200, {
        products: db.products,
        inventory: {
          products: db.products.map((p) => ({
            id: p.id,
            name: p.name,
            stock: p.stock,
            category: p.category,
            sale: !!p.sale,
          })),
          logs: db.inventoryLogs.slice().sort((a, b) => b.id - a.id).slice(0, 50),
        },
        orders,
        promos: db.promoCodes || [],
        analytics: buildAnalytics(db),
      });
    }

    if (route === "/api/inventory/delivery" && method === "POST") {
      if (!adminAuthed(event)) return json(401, { error: "Unauthorized" });
      const db = await readDb();
      const body = parseBody(event);
      const q = Math.max(1, toNum(body.qty, 0));
      const product = findProduct(db, body.productId);
      if (!product) return json(404, { error: "Product not found" });
      product.stock = Math.max(0, toNum(product.stock, 0) + q);
      product.updatedAt = nowIso();
      const log = {
        id: db.counters.log++,
        productId: product.id,
        qty: q,
        type: "delivery",
        note: String(body.note || ""),
        createdAt: nowIso(),
      };
      db.inventoryLogs.push(log);
      await writeDb(db);
      return json(201, { ok: true, product, log });
    }

    if (route === "/api/orders" && method === "GET") {
      if (!adminAuthed(event)) return json(401, { error: "Unauthorized" });
      const db = await readDb();
      const orders = db.orders
        .slice()
        .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
        .map((o) => {
          const subtotal = o.items.reduce((sum, it) => sum + toNum(it.qty) * toNum(it.price), 0);
          const discount = toNum(o.discountAmount, 0);
          const total = Math.max(0, subtotal - discount);
          return { ...o, subtotal, discount, total };
        });
      return json(200, orders);
    }

    if (route === "/api/orders" && method === "POST") {
      const db = await readDb();
      const body = parseBody(event);
      if (!body.customerName || !body.address || !Array.isArray(body.items) || !body.items.length) {
        return json(400, { error: "customerName, address, items are required" });
      }
      const normalizedItems = [];
      let subtotal = 0;
      for (const item of body.items) {
        const product = findProduct(db, item.productId);
        if (!product) return json(400, { error: `Product ${item.productId} not found` });
        const requestedQty = Math.max(1, toNum(item.qty, 1));
        const availableQty = Math.max(0, toNum(product.stock, 0));
        if (availableQty <= 0) return json(400, { error: `${product.name} is out of stock` });
        const qty = Math.min(requestedQty, availableQty);
        product.stock -= qty;
        normalizedItems.push({
          productId: product.id,
          productName: product.name,
          qty,
          price: product.price,
        });
        subtotal += qty * product.price;
      }
      const promoCode = String(body.promoCode || "")
        .trim()
        .toUpperCase();
      let promoApplied = null;
      let discountAmount = 0;
      if (promoCode) {
        const promo = (db.promoCodes || []).find((p) => p.code === promoCode && p.active);
        if (!promo) return json(400, { error: "Promo code not found or inactive" });
        if (promo.type === "percent") discountAmount = Math.round((subtotal * Math.min(100, promo.value)) / 100);
        else discountAmount = Math.min(subtotal, promo.value);
        promoApplied = { id: promo.id, code: promo.code, type: promo.type, value: promo.value };
      }
      const order = {
        id: db.counters.order++,
        customerName: String(body.customerName),
        phone: String(body.phone || ""),
        email: String(body.email || ""),
        address: String(body.address),
        status: "new",
        items: normalizedItems,
        promoCode: promoApplied ? promoApplied.code : "",
        promoApplied,
        subtotal,
        discountAmount,
        total: Math.max(0, subtotal - discountAmount),
        createdAt: nowIso(),
      };
      db.orders.push(order);
      await writeDb(db);
      return json(201, order);
    }

    const orderStatusMatch = route.match(/^\/api\/orders\/([^/]+)\/status$/);
    if (orderStatusMatch && method === "PUT") {
      if (!adminAuthed(event)) return json(401, { error: "Unauthorized" });
      const db = await readDb();
      const order = db.orders.find((o) => String(o.id) === String(orderStatusMatch[1]));
      if (!order) return json(404, { error: "Order not found" });
      const body = parseBody(event);
      order.status = String(body?.status || "new");
      await writeDb(db);
      return json(200, order);
    }

    if (route === "/api/promocodes" && method === "GET") {
      const db = await readDb();
      return json(200, db.promoCodes || []);
    }
    if (route === "/api/promocodes" && method === "POST") {
      if (!adminAuthed(event)) return json(401, { error: "Unauthorized" });
      const db = await readDb();
      const body = parseBody(event);
      const code = String(body.code || "").trim().toUpperCase();
      const type = String(body.type || "percent");
      const value = Math.max(0, toNum(body.value, 0));
      const active = body.active !== false;
      if (!code) return json(400, { error: "code is required" });
      if (!["percent", "fixed"].includes(type)) return json(400, { error: "type must be percent or fixed" });
      if (db.promoCodes.some((p) => p.code === code)) return json(400, { error: "Promo code already exists" });
      const promo = {
        id: db.counters.promo++,
        code,
        type,
        value,
        active,
        createdAt: nowIso(),
      };
      db.promoCodes.push(promo);
      await writeDb(db);
      return json(201, promo);
    }
    const promoDeleteMatch = route.match(/^\/api\/promocodes\/([^/]+)$/);
    if (promoDeleteMatch && method === "DELETE") {
      if (!adminAuthed(event)) return json(401, { error: "Unauthorized" });
      const db = await readDb();
      const id = String(promoDeleteMatch[1]);
      const before = db.promoCodes.length;
      db.promoCodes = db.promoCodes.filter((p) => String(p.id) !== id);
      if (before === db.promoCodes.length) return json(404, { error: "Promo code not found" });
      await writeDb(db);
      return json(200, { ok: true });
    }

    if (route === "/api/analytics" && method === "GET") {
      if (!adminAuthed(event)) return json(401, { error: "Unauthorized" });
      const db = await readDb();
      return json(200, buildAnalytics(db));
    }

    if (route === "/api/admin/parse-vitrine" && method === "POST") {
      if (!adminAuthed(event)) return json(401, { error: "Unauthorized" });
      const db = await readDb();
      const body = parseBody(event);
      const requestCount = Math.min(50, Math.max(1, toNum(body.count, 10)));
      const forceAdd = body.force === true || body.force === "true";
      const existingNames = new Set(db.products.map((p) => String(p.name).toLowerCase().trim()));

      function detectCat(name, desc) {
        const t = `${name} ${desc}`.toLowerCase();
        if (/платье|юбка|блуза|топ|бюстье|женск/.test(t)) return "womens";
        if (/брюки|пиджак|костюм|мужск|рубашк|джинс/.test(t)) { if (/женск|блуза|платье/.test(t)) return "womens"; return "mens"; }
        if (/сумк|ремень|кошелёк|кошелек|шапк|перчат|шарф|очки|аксессу/.test(t)) return "accessories";
        if (/унисекс|худи|свитшот|футболк|толстовк/.test(t)) return "unisex";
        return "other";
      }
      function catImg(cat, label) {
        const BG = { mens: "141414", womens: "1a1214", unisex: "12141a", accessories: "141a14", other: "1a1a1a" };
        return `https://placehold.co/800x1067/${BG[cat]||"1a1a1a"}/555555?text=${encodeURIComponent(label.slice(0,24))}`;
      }
      function rndInt(a,b){ return Math.floor(Math.random()*(b-a+1))+a; }
      function shuffle(arr){ const a=arr.slice(); for(let i=a.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[a[i],a[j]]=[a[j],a[i]];} return a; }

      const DEMO = [
        {name:"Рубашка оверсайз хлопок",price:5900,category:"mens",sizes:["S","M","L","XL"],colors:["Белый","Черный"],description:"Свободная рубашка из плотного хлопка.",composition:"100% хлопок",care:"Стирка при 40°C"},
        {name:"Куртка бомбер тёмная",price:14500,oldPrice:18000,category:"mens",sale:true,sizes:["S","M","L"],colors:["Черный"],description:"Классический бомбер с рибом-манжетами.",composition:"100% нейлон",care:"Химчистка"},
        {name:"Свитер объёмный шерсть",price:9800,category:"mens",sizes:["S","M","L","XL"],colors:["Серый","Черный"],description:"Вязаный свитер крупной вязки.",composition:"100% шерсть",care:"Ручная стирка"},
        {name:"Брюки со складками и стрелками",price:8400,category:"womens",sizes:["XS","S","M","L"],colors:["Черный","Серый"],description:"Классические брюки со стрелками.",composition:"65% полиэстер, 35% вискоза",care:"Химчистка"},
        {name:"Кардиган длинный вязаный",price:7600,category:"unisex",sizes:["S","M","L","XL"],colors:["Бежевый","Черный","Серый"],description:"Длинный кардиган rib-вязки.",composition:"50% шерсть, 50% акрил",care:"Ручная стирка"},
        {name:"Шорты-бермуды технические",price:5800,category:"mens",sizes:["S","M","L","XL"],colors:["Черный","Оливковый"],description:"Шорты длиной до колена с карманами.",composition:"100% полиэстер",care:"Стирка при 30°C"},
        {name:"Платье-рубашка midi",price:11500,category:"womens",sizes:["XS","S","M","L"],colors:["Черный","Белый"],description:"Платье-рубашка свободного кроя.",composition:"100% хлопок",care:"Стирка при 30°C"},
        {name:"Снуд-труба шерстяной",price:3200,category:"accessories",sizes:["ONE SIZE"],colors:["Черный","Серый"],description:"Шерстяной снуд двойной вязки.",composition:"100% мериносовая шерсть",care:"Ручная стирка"},
        {name:"Жилет стёганый утеплённый",price:7200,category:"unisex",sizes:["XS","S","M","L","XL"],colors:["Черный","Тёмно-зелёный"],description:"Лёгкий утеплённый жилет.",composition:"Нейлон / полиэстер",care:"Стирка при 30°C"},
        {name:"Пальто-кейп без рукавов",price:22000,oldPrice:28000,category:"womens",sale:true,sizes:["XS","S","M"],colors:["Черный"],description:"Пальто-кейп прямого силуэта.",composition:"80% шерсть, 20% полиэстер",care:"Химчистка"},
        {name:"Топ-бандо из бархата",price:4200,category:"womens",sizes:["XS","S","M"],colors:["Черный","Бордо"],description:"Облегающий топ-бандо с бархатной текстурой.",composition:"90% полиэстер, 10% эластан",care:"Стирка при 30°C"},
        {name:"Лонгслив технический zip",price:6500,category:"mens",sizes:["S","M","L","XL"],colors:["Черный"],description:"Технический лонгслив с молнией на груди.",composition:"92% полиэстер, 8% эластан",care:"Стирка при 30°C"},
        {name:"Мини-юбка кожаная",price:9200,oldPrice:11500,category:"womens",sale:true,sizes:["XS","S","M","L"],colors:["Черный"],description:"Мини-юбка из экокожи с боковой молнией.",composition:"100% полиуретан",care:"Протирать влажной тряпкой"},
        {name:"Парка тактическая тёмная",price:19800,category:"mens",sizes:["S","M","L","XL","XXL"],colors:["Черный","Тёмно-оливковый"],description:"Парка с множеством карманов и регулируемым капюшоном.",composition:"100% нейлон",care:"Стирка при 30°C"},
        {name:"Туника асимметричная льняная",price:7800,category:"womens",sizes:["XS","S","M","L"],colors:["Черный","Белый"],description:"Льняная туника с асимметричным краем.",composition:"100% лён",care:"Стирка при 40°C"},
        {name:"Борсетка кожаная матовая",price:5600,category:"accessories",sizes:["ONE SIZE"],colors:["Черный"],description:"Борсетка из матовой кожи с магнитной застёжкой.",composition:"Натуральная кожа",care:"Протирать влажной тряпкой"},
        {name:"Кепка 6-панельная",price:2400,category:"accessories",sizes:["ONE SIZE"],colors:["Черный","Серый"],description:"Структурированная кепка с плоским козырьком.",composition:"100% хлопок",care:"Протирать влажной тряпкой"},
        {name:"Джоггеры карго широкие",price:8900,category:"unisex",sizes:["XS","S","M","L","XL"],colors:["Черный","Графит"],description:"Широкие джоггеры с накладными карманами.",composition:"60% хлопок, 40% полиэстер",care:"Стирка при 40°C"},
        {name:"Ветровка оверсайз лёгкая",price:6400,category:"unisex",sizes:["S","M","L","XL"],colors:["Черный","Тёмно-синий"],description:"Лёгкая ветровка с упаковочным чехлом.",composition:"100% нейлон",care:"Стирка при 30°C"},
        {name:"Пиджак двубортный тёмный",price:23500,category:"mens",sizes:["S","M","L","XL"],colors:["Черный","Тёмно-серый"],description:"Строгий двубортный пиджак с острыми плечами.",composition:"55% шерсть, 45% полиэстер",care:"Химчистка"},
        {name:"Корсет на шнуровке",price:8700,oldPrice:10800,category:"womens",sale:true,sizes:["XS","S","M","L"],colors:["Черный"],description:"Жёсткий корсет с задней шнуровкой.",composition:"100% полиэстер",care:"Химчистка"},
        {name:"Шарф-палантин твиловый",price:4500,category:"accessories",sizes:["ONE SIZE"],colors:["Черный","Белый","Клетка"],description:"Лёгкий шарф-палантин из вискозного твила.",composition:"100% вискоза",care:"Химчистка"},
        {name:"Майка-сетка базовая",price:2800,category:"unisex",sizes:["XS","S","M","L","XL"],colors:["Черный","Белый"],description:"Базовая майка-сетка крупного плетения.",composition:"100% полиэстер",care:"Стирка при 30°C"},
        {name:"Дождевик нейлоновый капсула",price:5200,category:"unisex",sizes:["S","M","L","XL"],colors:["Черный","Тёмно-зелёный"],description:"Складной дождевик с проклеенными швами.",composition:"100% нейлон",care:"Стирка при 30°C"},
        {name:"Брюки из экокожи прямые",price:12800,category:"womens",sizes:["XS","S","M","L"],colors:["Черный"],description:"Прямые брюки из матовой экокожи.",composition:"100% полиуретан",care:"Протирать влажной тряпкой"},
        {name:"Трикотажная водолазка тонкая",price:4800,category:"unisex",sizes:["XS","S","M","L","XL"],colors:["Черный","Белый","Серый"],description:"Тонкая водолазка из трикотажа для layering.",composition:"80% вискоза, 20% нейлон",care:"Стирка при 30°C"},
        {name:"Укороченная куртка-косуха",price:21000,category:"womens",sizes:["XS","S","M"],colors:["Черный"],description:"Укороченная куртка-косуха из плотной экокожи.",composition:"100% полиуретан",care:"Протирать влажной тряпкой"},
        {name:"Флисовая кофта полар",price:6200,category:"unisex",sizes:["S","M","L","XL","XXL"],colors:["Черный","Серый","Тёмно-синий"],description:"Тёплая флисовая кофта с высоким воротником.",composition:"100% полиэстер",care:"Стирка при 40°C"},
        {name:"Клатч цепочка вечерний",price:7100,category:"accessories",sizes:["ONE SIZE"],colors:["Черный","Серебро"],description:"Металлический клатч на цепочке для вечерних выходов.",composition:"Металл / экокожа",care:"Протирать влажной тряпкой"},
        {name:"Широкий галстук тёмный",price:2100,category:"accessories",sizes:["ONE SIZE"],colors:["Черный","Тёмно-бордо"],description:"Широкий галстук из матовой ткани.",composition:"100% полиэстер",care:"Химчистка"},
        {name:"Рубашка льняная тёмная",price:6800,category:"mens",sizes:["S","M","L","XL"],colors:["Тёмно-серый","Черный"],description:"Лёгкая льняная рубашка с кармашком.",composition:"100% лён",care:"Стирка при 40°C"},
        {name:"Платье миди с разрезом",price:13500,category:"womens",sizes:["XS","S","M","L"],colors:["Черный"],description:"Платье миди из джерси с боковым разрезом.",composition:"95% вискоза, 5% эластан",care:"Стирка при 30°C"},
        {name:"Шорты спортивные двойные",price:4200,category:"unisex",sizes:["XS","S","M","L","XL"],colors:["Черный"],description:"Шорты с внутренними тайтсами.",composition:"88% полиэстер, 12% эластан",care:"Стирка при 40°C"},
        {name:"Сарафан многоярусный",price:9600,category:"womens",sizes:["XS","S","M","L"],colors:["Черный","Тёмно-синий"],description:"Многоярусный сарафан из лёгкой ткани.",composition:"100% вискоза",care:"Ручная стирка"},
        {name:"Тёплые леггинсы зимние",price:3400,category:"womens",sizes:["XS","S","M","L","XL"],colors:["Черный","Тёмно-серый"],description:"Флисовые леггинсы с высокой талией.",composition:"80% полиэстер, 20% эластан",care:"Стирка при 40°C"},
        {name:"Куртка пуховик сити",price:28500,category:"unisex",sizes:["S","M","L","XL"],colors:["Черный"],description:"Лёгкий городской пуховик с воротником-стойкой.",composition:"Нейлон / утеплитель 80%пух 20%перо",care:"Химчистка"},
        {name:"Двойная косуха с поясом",price:32000,oldPrice:40000,category:"womens",sale:true,sizes:["XS","S","M"],colors:["Черный"],description:"Байкерская куртка с двойными молниями.",composition:"Натуральная кожа",care:"Химчистка"},
        {name:"Рюкзак городской минимал",price:11200,category:"accessories",sizes:["ONE SIZE"],colors:["Черный"],description:"Компактный рюкзак с отделом для ноутбука.",composition:"Нейлон 600D",care:"Протирать влажной тряпкой"},
        {name:"Поло плотное пике",price:5400,category:"mens",sizes:["S","M","L","XL","XXL"],colors:["Черный","Белый","Серый"],description:"Классическое поло из плотного хлопка пике.",composition:"100% хлопок",care:"Стирка при 40°C"},
        {name:"Боди-бра без косточек",price:3900,category:"womens",sizes:["XS","S","M","L"],colors:["Черный","Телесный"],description:"Боди-бра из плотного микрофибры.",composition:"80% полиамид, 20% эластан",care:"Ручная стирка"},
        {name:"Перчатки кожаные тонкие",price:4100,category:"accessories",sizes:["S","M","L"],colors:["Черный","Тёмно-коричневый"],description:"Тонкие кожаные перчатки без подкладки.",composition:"Натуральная кожа",care:"Протирать влажной тряпкой"},
        {name:"Трикотажный костюм двойка",price:16800,oldPrice:21000,category:"unisex",sale:true,sizes:["XS","S","M","L","XL"],colors:["Черный","Серый"],description:"Мягкий трикотажный костюм из хлопкового джерси.",composition:"95% хлопок, 5% эластан",care:"Стирка при 30°C"},
        {name:"Жакет с пэчворком тёмный",price:18500,category:"unisex",sizes:["S","M","L","XL"],colors:["Черный/Тёмно-серый"],description:"Жакет с вставками из разных текстур.",composition:"Смесовые ткани",care:"Химчистка"},
        {name:"Трикотажный топ бюстье",price:3700,category:"womens",sizes:["XS","S","M","L"],colors:["Черный","Белый"],description:"Трикотажный топ в форме бюстье с широкими бретелями.",composition:"90% хлопок, 10% эластан",care:"Стирка при 30°C"},
        {name:"Плиссированная юбка миди",price:7900,category:"womens",sizes:["XS","S","M","L"],colors:["Черный","Тёмно-серый"],description:"Плиссированная юбка миди с эластичным поясом.",composition:"100% полиэстер",care:"Стирка при 30°C"},
        {name:"Бейзбольная куртка на кнопках",price:15600,category:"mens",sizes:["S","M","L","XL"],colors:["Черный","Черный/Белый"],description:"Бейсбольная куртка с рибом на манжетах.",composition:"65% шерсть, 35% полиэстер",care:"Химчистка"},
        {name:"Чокер кожаный со шипами",price:2200,category:"accessories",sizes:["ONE SIZE"],colors:["Черный"],description:"Чокер из натуральной кожи с металлическими шипами.",composition:"Натуральная кожа / металл",care:"Протирать влажной тряпкой"},
        {name:"Тренч оверсайз тёмный",price:26000,oldPrice:32000,category:"unisex",sale:true,sizes:["S","M","L","XL"],colors:["Черный","Тёмно-оливковый"],description:"Удлинённый тренч оверсайз с двубортной застёжкой.",composition:"60% хлопок, 40% полиэстер",care:"Химчистка"},
        {name:"Рукавички-митенки вязаные",price:1800,category:"accessories",sizes:["ONE SIZE"],colors:["Черный","Серый","Бежевый"],rndScription:"Вязаные митенки из шерстяной пряжи.",composition:"100% шерсть",care:"Ручная стирка"},
      ];

      const pool = shuffle(DEMO);
      const added = [], skipped = [];
      let addedCount = 0;
      for (const item of pool) {
        if (addedCount >= requestCount) break;
        let nameKey = String(item.name||"").toLowerCase().trim();
        if (!nameKey) continue;
        if (existingNames.has(nameKey) && !forceAdd) { skipped.push(item.name); continue; }
        let finalName = String(item.name).trim();
        if (existingNames.has(nameKey) && forceAdd) {
          const sfx = ` (${rndInt(10,99)})`;
          finalName = finalName + sfx;
          nameKey = finalName.toLowerCase();
        }
        existingNames.add(nameKey);
        const cat = item.category || detectCat(item.name, item.description||"");
        const image = (item.image && item.image.startsWith("http")) ? item.image : catImg(cat, finalName);
        const product = {
          id: db.counters.product++, name: finalName, category: cat, sale: !!item.sale,
          price: Math.max(0, toNum(item.price, 0)), oldPrice: Math.max(0, toNum(item.oldPrice, 0)),
          stock: rndInt(5,40),
          sizes: Array.isArray(item.sizes)?item.sizes:["S","M","L"],
          colors: Array.isArray(item.colors)?item.colors:["Черный"],
          image, description: String(item.description||"").slice(0,500),
          composition: String(item.composition||""), care: String(item.care||""),
          createdAt: nowIso(), updatedAt: nowIso(),
        };
        db.products.push(product);
        added.push(product);
        addedCount++;
      }
      await writeDb(db);
      return json(200, { ok: true, added: added.length, skipped: skipped.length, source: "demo" });
    }

    if (route === "/api/admin/generate-orders" && method === "POST") {
      if (!adminAuthed(event)) return json(401, { error: "Unauthorized" });
      const db = await readDb();
      const body = parseBody(event);
      const count = Math.min(100, Math.max(1, toNum(body.count, 5)));
      const products = db.products.filter((p) => toNum(p.stock,0) > 0);
      if (!products.length) return json(400, { error: "Нет товаров в каталоге" });

      const NAMES = ["Алексей Морозов","Мария Соколова","Дмитрий Волков","Елена Кузнецова","Иван Петров","Ольга Смирнова","Тимур Ахметов","Анна Лебедева","Сергей Попов","Наталья Козлова","Кирилл Новиков","Юлия Зайцева","Максим Орлов","Вера Белова"];
      const CITIES = ["Москва","Санкт-Петербург","Казань","Краснодар","Уфа","Новосибирск","Екатеринбург","Ростов-на-Дону","Самара","Челябинск"];
      const STREETS = ["ул. Ленина","ул. Мира","пр. Победы","ул. Советская","пр. Кирова","ул. Садовая","пр. Гагарина","ул. Пушкина"];
      const DELIVS = [{key:"pickup",label:"Самовывоз",cost:0},{key:"courier",label:"Курьер",cost:500},{key:"cdek",label:"СДЭК / ПВЗ",cost:350}];
      const PAYS = [{key:"card",label:"Картой онлайн"},{key:"sbp",label:"СБП"},{key:"receipt",label:"При получении"}];
      const STATUSES = ["new","new","processing","shipped","done","done","cancelled"];
      const PROMOS = (db.promoCodes||[]).filter((p)=>p.active);
      function rnd(a,b){return Math.floor(Math.random()*(b-a+1))+a;}
      function pick(arr){return arr[Math.floor(Math.random()*arr.length)];}

      const generated = [];
      for (let i = 0; i < count; i++) {
        const shuffled = products.slice().sort(()=>Math.random()-0.5);
        const numItems = rnd(1,3);
        const orderItems = [];
        let subtotal = 0;
        for (let j = 0; j < Math.min(numItems, shuffled.length); j++) {
          const p = shuffled[j]; const qty = rnd(1,2);
          orderItems.push({productId:p.id,productName:p.name,qty,price:p.price});
          subtotal += qty * p.price;
        }
        if (!orderItems.length) continue;
        const del = pick(DELIVS); const pay = pick(PAYS); const status = pick(STATUSES);
        let promoApplied = null; let discountAmount = 0;
        if (PROMOS.length && Math.random() < 0.35) {
          const promo = pick(PROMOS);
          discountAmount = promo.type === "percent" ? Math.round(subtotal*Math.min(100,promo.value)/100) : Math.min(subtotal,promo.value);
          promoApplied = {id:promo.id,code:promo.code,type:promo.type,value:promo.value};
        }
        const orderDate = new Date(Date.now() - rnd(0,90)*86400000);
        const order = {
          id:db.counters.order++, customerName:pick(NAMES),
          phone:`+7 (${rnd(900,999)}) ${rnd(100,999)}-${rnd(10,99)}-${rnd(10,99)}`,
          email:`user${rnd(100,9999)}@example.com`,
          address:`${pick(CITIES)}, ${pick(STREETS)}, ${rnd(1,200)}, кв. ${rnd(1,150)}`,
          comment:"", status,
          delivery:del.key, deliveryLabel:del.label, deliveryCost:del.cost,
          payment:pay.key, paymentLabel:pay.label,
          items:orderItems, promoCode:promoApplied?promoApplied.code:"", promoApplied,
          subtotal, discountAmount, total:Math.max(0,subtotal-discountAmount)+del.cost,
          createdAt:orderDate.toISOString(),
        };
        db.orders.push(order);
        generated.push(order);
      }
      await writeDb(db);
      return json(200, { ok: true, generated: generated.length });
    }

    if (route === "/api/admin/cleanup" && method === "POST") {
      if (!adminAuthed(event)) return json(401, { error: "Unauthorized" });
      const db = await readDb();
      const body = parseBody(event);
      const target = String(body?.target || "").trim().toLowerCase();
      const cleaned = [];

      if (target === "all") {
        db.products = [];
        db.inventoryLogs = [];
        db.orders = [];
        db.promoCodes = [];
        db.counters = { product: 1, order: 1, log: 1, promo: 1 };
        await writeDb(db);
        return json(200, { ok: true, cleaned: ["products", "inventory", "orders", "reports", "promocodes"] });
      }
      if (target === "orders") {
        db.orders = [];
        resetCounter(db, "order", "orders");
        cleaned.push("orders");
      }
      if (target === "inventory" || target === "deliveries" || target === "supplies") {
        db.inventoryLogs = [];
        resetCounter(db, "log", "inventoryLogs");
        cleaned.push("inventory");
      }
      if (target === "reports" || target === "analytics") {
        db.orders = [];
        resetCounter(db, "order", "orders");
        cleaned.push("reports");
      }
      if (target === "products") {
        db.products = [];
        resetCounter(db, "product", "products");
        cleaned.push("products");
      }
      if (target === "promocodes") {
        db.promoCodes = [];
        resetCounter(db, "promo", "promoCodes");
        cleaned.push("promocodes");
      }
      if (!cleaned.length) {
        return json(400, {
          error: "Unknown cleanup target. Use: orders, inventory, reports, products, promocodes, all",
        });
      }
      await writeDb(db);
      return json(200, { ok: true, cleaned });
    }

    return json(404, { error: "Not found" });
  } catch (err) {
    return json(500, { error: err?.message || "Internal error" });
  }
};
