const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const bcrypt = require("bcryptjs");

const ADMIN_LOGIN = String(process.env.ADMIN_LOGIN || "admin");
const ADMIN_PASSWORD = String(process.env.ADMIN_PASSWORD || "change_me_please");
const ADMIN_PASSWORD_HASH = String(process.env.ADMIN_PASSWORD_HASH || "");
const SESSION_SECRET = String(
  process.env.SESSION_SECRET || "change_this_session_secret_for_production"
);
const DB_PATH = process.env.DB_PATH
  ? path.resolve(process.env.DB_PATH)
  : path.join(process.cwd(), "data", "db.json");
const BLOBS_STORE_NAME = String(process.env.NETLIFY_BLOBS_STORE || "site-db");
const USE_BLOBS = process.env.NETLIFY === "true" || process.env.CONTEXT;
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
  return mod.getStore(BLOBS_STORE_NAME);
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
    const store = await getBlobsStore();
    const raw = await store.get("db.json");
    if (!raw) {
      await store.set("db.json", JSON.stringify(INITIAL_DB));
      return { ...INITIAL_DB };
    }
    const db = normalizeDb(JSON.parse(raw));
    await store.set("db.json", JSON.stringify(db));
    return db;
  }

  const dir = path.dirname(DB_PATH);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  if (!fs.existsSync(DB_PATH)) {
    fs.writeFileSync(DB_PATH, JSON.stringify(INITIAL_DB, null, 2));
    return { ...INITIAL_DB };
  }
  const db = normalizeDb(JSON.parse(fs.readFileSync(DB_PATH, "utf-8")));
  fs.writeFileSync(DB_PATH, JSON.stringify(db, null, 2));
  return db;
}

async function writeDb(db) {
  const normalized = normalizeDb(db);
  if (USE_BLOBS) {
    const store = await getBlobsStore();
    await store.set("db.json", JSON.stringify(normalized));
    return;
  }
  const dir = path.dirname(DB_PATH);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(DB_PATH, JSON.stringify(normalized, null, 2));
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
        const qty = Math.max(1, toNum(item.qty, 1));
        if (product.stock < qty) return json(400, { error: `Not enough stock for ${product.name}` });
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
      return json(200, {
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
      });
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
