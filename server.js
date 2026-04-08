require("dotenv").config();

const express = require("express");
const fs = require("fs");
const path = require("path");
const multer = require("multer");
const session = require("express-session");
const bcrypt = require("bcryptjs");
const { v2: cloudinary } = require("cloudinary");

const app = express();
const PORT = process.env.PORT || 8080;
const DB_PATH = process.env.DB_PATH
  ? path.resolve(process.env.DB_PATH)
  : path.join(__dirname, "data", "db.json");
const UPLOADS_DIR = path.join(__dirname, "uploads");
const IS_PROD = process.env.NODE_ENV === "production";
const ADMIN_LOGIN = String(process.env.ADMIN_LOGIN || "admin");
const ADMIN_PASSWORD = String(process.env.ADMIN_PASSWORD || "change_me_please");
const ADMIN_PASSWORD_HASH = String(process.env.ADMIN_PASSWORD_HASH || "");
const SESSION_SECRET = String(
  process.env.SESSION_SECRET || "change_this_session_secret_for_production"
);
const CLOUDINARY_CLOUD_NAME = String(process.env.CLOUDINARY_CLOUD_NAME || "");
const CLOUDINARY_API_KEY = String(process.env.CLOUDINARY_API_KEY || "");
const CLOUDINARY_API_SECRET = String(process.env.CLOUDINARY_API_SECRET || "");

const HAS_CLOUDINARY = !!(
  (CLOUDINARY_CLOUD_NAME && CLOUDINARY_API_KEY && CLOUDINARY_API_SECRET) ||
  process.env.CLOUDINARY_URL
);
if (HAS_CLOUDINARY) {
  cloudinary.config({
    cloud_name: CLOUDINARY_CLOUD_NAME || undefined,
    api_key: CLOUDINARY_API_KEY || undefined,
    api_secret: CLOUDINARY_API_SECRET || undefined,
    secure: true,
  });
}

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
if (IS_PROD) app.set("trust proxy", 1);
app.use(
  session({
    name: "zhuchy_admin_sid",
    secret: SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      sameSite: "lax",
      secure: IS_PROD,
      maxAge: 1000 * 60 * 60 * 12,
    },
  })
);
app.use((req, res, next) => {
  const protectedStatic = ["/admin", "/admin.html", "/js/admin.js", "/css/admin.css"].includes(
    req.path
  );
  if (!protectedStatic) return next();
  if (req.session?.isAdmin === true) return next();
  return res.redirect("/admin-login.html");
});
app.use(express.static(__dirname));
app.use("/uploads", express.static(UPLOADS_DIR));

async function verifyAdminPassword(rawPassword) {
  const raw = String(rawPassword || "");
  if (ADMIN_PASSWORD_HASH) {
    return bcrypt.compare(raw, ADMIN_PASSWORD_HASH);
  }
  return raw === ADMIN_PASSWORD;
}

function requireAdminApi(req, res, next) {
  if (req.session?.isAdmin === true) return next();
  return res.status(401).json({ error: "Unauthorized" });
}

function requireAdminPage(req, res, next) {
  if (req.session?.isAdmin === true) return next();
  return res.redirect("/admin-login.html");
}

function ensureDb() {
  if (!fs.existsSync(UPLOADS_DIR)) {
    fs.mkdirSync(UPLOADS_DIR, { recursive: true });
  }
  const dbDir = path.dirname(DB_PATH);
  if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true });
  }
  if (!fs.existsSync(DB_PATH)) {
    fs.writeFileSync(
      DB_PATH,
      JSON.stringify(
        {
          products: [],
          inventoryLogs: [],
          orders: [],
          promoCodes: [],
          counters: { product: 1, order: 1, log: 1, promo: 1 },
        },
        null,
        2
      )
    );
  }
  // Миграции схемы для уже существующей базы
  const db = JSON.parse(fs.readFileSync(DB_PATH, "utf-8"));
  if (!Array.isArray(db.products)) db.products = [];
  if (!Array.isArray(db.inventoryLogs)) db.inventoryLogs = [];
  if (!Array.isArray(db.orders)) db.orders = [];
  if (!Array.isArray(db.promoCodes)) db.promoCodes = [];
  if (!db.counters) db.counters = { product: 1, order: 1, log: 1, promo: 1 };
  if (!db.counters.product) db.counters.product = 1;
  if (!db.counters.order) db.counters.order = 1;
  if (!db.counters.log) db.counters.log = 1;
  if (!db.counters.promo) db.counters.promo = 1;
  if (Array.isArray(db.products)) {
    db.products = db.products.map((product) => {
      const normalized = { ...product };
      const isLegacySaleCategory = String(normalized.category || "") === "sale";
      if (normalized.sale === undefined) normalized.sale = isLegacySaleCategory;
      if (isLegacySaleCategory) normalized.category = "other";
      if (normalized.oldPrice === undefined) normalized.oldPrice = 0;
      if (normalized.sale) {
        const current = Math.max(0, toNum(normalized.price, 0));
        const old = Math.max(0, toNum(normalized.oldPrice, 0));
        if (current > 0 && old <= current) {
          normalized.oldPrice = Math.round(current * 1.25);
        }
      }
      return normalized;
    });
  }
  fs.writeFileSync(DB_PATH, JSON.stringify(db, null, 2));
}

const upload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, UPLOADS_DIR),
    filename: (_req, file, cb) => {
      const ext = path.extname(file.originalname || "").toLowerCase() || ".jpg";
      const safeExt = [".jpg", ".jpeg", ".png", ".webp", ".gif"].includes(ext)
        ? ext
        : ".jpg";
      cb(null, `${Date.now()}-${Math.round(Math.random() * 1e9)}${safeExt}`);
    },
  }),
  limits: { fileSize: 5 * 1024 * 1024 },
});

function readDb() {
  ensureDb();
  return JSON.parse(fs.readFileSync(DB_PATH, "utf-8"));
}

function writeDb(db) {
  fs.writeFileSync(DB_PATH, JSON.stringify(db, null, 2));
}

function nowIso() {
  return new Date().toISOString();
}

function toNum(v, fallback = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function findProduct(db, productId) {
  return db.products.find((p) => String(p.id) === String(productId));
}

function resetCounter(db, key, collectionName) {
  const maxId = db[collectionName].reduce((max, item) => Math.max(max, toNum(item?.id, 0)), 0);
  db.counters[key] = maxId + 1;
}

app.get("/api/products", (_req, res) => {
  const db = readDb();
  res.json(db.products);
});

app.get("/api/products/:id", (req, res) => {
  const db = readDb();
  const product = findProduct(db, req.params.id);
  if (!product) return res.status(404).json({ error: "Product not found" });
  res.json(product);
});

app.post("/api/upload-image", requireAdminApi, upload.single("image"), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: "image file is required" });
  if (HAS_CLOUDINARY) {
    try {
      const uploaded = await cloudinary.uploader.upload(req.file.path, {
        folder: "zhuchy-club/products",
        resource_type: "image",
      });
      fs.unlink(req.file.path, () => {});
      return res.status(201).json({ url: uploaded.secure_url });
    } catch (err) {
      console.error("Cloudinary upload failed:", err.message);
      // fallback to local file if Cloudinary temporarily unavailable
    }
  }
  const localUrl = `/uploads/${req.file.filename}`;
  return res.status(201).json({ url: localUrl });
});

app.post("/api/products", requireAdminApi, (req, res) => {
  const db = readDb();
  const body = req.body || {};

  if (!body.name || !String(body.name).trim()) {
    return res.status(400).json({ error: "name is required" });
  }

  const id = db.counters.product++;
  const product = {
    id,
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
  writeDb(db);
  res.status(201).json(product);
});

app.put("/api/products/:id", requireAdminApi, (req, res) => {
  const db = readDb();
  const product = findProduct(db, req.params.id);
  if (!product) return res.status(404).json({ error: "Product not found" });

  const body = req.body || {};
  if (body.name !== undefined) product.name = String(body.name).trim();
  if (body.category !== undefined) product.category = String(body.category);
  if (body.sale !== undefined) {
    product.sale = body.sale === true || String(body.sale) === "true";
  }
  if (body.price !== undefined) product.price = Math.max(0, toNum(body.price, 0));
  if (body.oldPrice !== undefined) {
    product.oldPrice = Math.max(0, toNum(body.oldPrice, 0));
  }
  if (body.stock !== undefined) product.stock = Math.max(0, toNum(body.stock, 0));
  if (body.sizes !== undefined) {
    product.sizes = Array.isArray(body.sizes)
      ? body.sizes.map(String).filter(Boolean)
      : String(body.sizes)
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean);
  }
  if (body.colors !== undefined) {
    product.colors = Array.isArray(body.colors)
      ? body.colors.map(String).filter(Boolean)
      : String(body.colors)
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean);
  }
  if (body.image !== undefined) product.image = String(body.image || "");
  if (body.description !== undefined) {
    product.description = String(body.description || "");
  }
  if (body.composition !== undefined) {
    product.composition = String(body.composition || "");
  }
  if (body.care !== undefined) {
    product.care = String(body.care || "");
  }
  product.updatedAt = nowIso();

  writeDb(db);
  res.json(product);
});

app.delete("/api/products/:id", requireAdminApi, (req, res) => {
  const db = readDb();
  const id = String(req.params.id);
  const before = db.products.length;
  db.products = db.products.filter((p) => String(p.id) !== id);
  if (db.products.length === before) {
    return res.status(404).json({ error: "Product not found" });
  }
  writeDb(db);
  res.json({ ok: true });
});

app.get("/api/inventory", requireAdminApi, (_req, res) => {
  const db = readDb();
  res.json({
    products: db.products.map((p) => ({
      id: p.id,
      name: p.name,
      stock: p.stock,
      category: p.category,
      sale: !!p.sale,
    })),
    logs: db.inventoryLogs.slice().sort((a, b) => b.id - a.id).slice(0, 50),
  });
});

app.post("/api/inventory/delivery", requireAdminApi, (req, res) => {
  const db = readDb();
  const { productId, qty, note } = req.body || {};
  const q = Math.max(1, toNum(qty, 0));
  const product = findProduct(db, productId);
  if (!product) return res.status(404).json({ error: "Product not found" });

  product.stock = Math.max(0, toNum(product.stock, 0) + q);
  product.updatedAt = nowIso();

  const log = {
    id: db.counters.log++,
    productId: product.id,
    qty: q,
    type: "delivery",
    note: String(note || ""),
    createdAt: nowIso(),
  };
  db.inventoryLogs.push(log);
  writeDb(db);
  res.status(201).json({ ok: true, product, log });
});

app.get("/api/orders", requireAdminApi, (_req, res) => {
  const db = readDb();
  const orders = db.orders
    .slice()
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
    .map((o) => {
      const subtotal = o.items.reduce((sum, it) => sum + toNum(it.qty) * toNum(it.price), 0);
      const discount = toNum(o.discountAmount, 0);
      const total = Math.max(0, subtotal - discount);
      return { ...o, subtotal, discount, total };
    });
  res.json(orders);
});

app.get("/api/promocodes", (_req, res) => {
  const db = readDb();
  res.json(db.promoCodes || []);
});

app.post("/api/promocodes", requireAdminApi, (req, res) => {
  const db = readDb();
  const body = req.body || {};
  const code = String(body.code || "").trim().toUpperCase();
  const type = String(body.type || "percent");
  const value = Math.max(0, toNum(body.value, 0));
  const active = body.active !== false;

  if (!code) return res.status(400).json({ error: "code is required" });
  if (!["percent", "fixed"].includes(type)) {
    return res.status(400).json({ error: "type must be percent or fixed" });
  }
  if (db.promoCodes.some((p) => p.code === code)) {
    return res.status(400).json({ error: "Promo code already exists" });
  }

  const promo = {
    id: db.counters.promo++,
    code,
    type,
    value,
    active,
    createdAt: nowIso(),
  };
  db.promoCodes.push(promo);
  writeDb(db);
  res.status(201).json(promo);
});

app.delete("/api/promocodes/:id", requireAdminApi, (req, res) => {
  const db = readDb();
  const id = String(req.params.id);
  const before = db.promoCodes.length;
  db.promoCodes = db.promoCodes.filter((p) => String(p.id) !== id);
  if (before === db.promoCodes.length) {
    return res.status(404).json({ error: "Promo code not found" });
  }
  writeDb(db);
  res.json({ ok: true });
});

app.post("/api/orders", (req, res) => {
  const db = readDb();
  const body = req.body || {};

  if (!body.customerName || !body.address || !Array.isArray(body.items) || !body.items.length) {
    return res.status(400).json({ error: "customerName, address, items are required" });
  }

  const normalizedItems = [];
  let subtotal = 0;
  for (const item of body.items) {
    const product = findProduct(db, item.productId);
    if (!product) return res.status(400).json({ error: `Product ${item.productId} not found` });
    const qty = Math.max(1, toNum(item.qty, 1));
    if (product.stock < qty) {
      return res.status(400).json({ error: `Not enough stock for ${product.name}` });
    }
    product.stock -= qty;
    normalizedItems.push({
      productId: product.id,
      productName: product.name,
      qty,
      price: product.price,
    });
    subtotal += qty * product.price;
  }

  // Промокод (опционально)
  const promoCode = String(body.promoCode || "")
    .trim()
    .toUpperCase();
  let promoApplied = null;
  let discountAmount = 0;
  if (promoCode) {
    const promo = (db.promoCodes || []).find((p) => p.code === promoCode && p.active);
    if (!promo) {
      return res.status(400).json({ error: "Promo code not found or inactive" });
    }
    if (promo.type === "percent") {
      discountAmount = Math.round((subtotal * Math.min(100, promo.value)) / 100);
    } else {
      discountAmount = Math.min(subtotal, promo.value);
    }
    promoApplied = {
      id: promo.id,
      code: promo.code,
      type: promo.type,
      value: promo.value,
    };
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
  writeDb(db);
  res.status(201).json(order);
});

app.put("/api/orders/:id/status", requireAdminApi, (req, res) => {
  const db = readDb();
  const order = db.orders.find((o) => String(o.id) === String(req.params.id));
  if (!order) return res.status(404).json({ error: "Order not found" });
  order.status = String(req.body?.status || "new");
  writeDb(db);
  res.json(order);
});

app.get("/api/analytics", requireAdminApi, (_req, res) => {
  const db = readDb();

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

  res.json({
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
});

app.post("/api/admin/cleanup", requireAdminApi, (req, res) => {
  const db = readDb();
  const target = String(req.body?.target || "").trim().toLowerCase();
  const cleaned = [];

  if (target === "all") {
    db.products = [];
    db.inventoryLogs = [];
    db.orders = [];
    db.promoCodes = [];
    db.counters = { product: 1, order: 1, log: 1, promo: 1 };
    writeDb(db);
    return res.json({ ok: true, cleaned: ["products", "inventory", "orders", "reports", "promocodes"] });
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
    return res.status(400).json({
      error: "Unknown cleanup target. Use: orders, inventory, reports, products, promocodes, all",
    });
  }

  writeDb(db);
  return res.json({ ok: true, cleaned });
});

app.post("/api/admin/login", async (req, res) => {
  const login = String(req.body?.login || "").trim();
  const password = String(req.body?.password || "");
  if (!login || !password) {
    return res.status(400).json({ error: "login and password are required" });
  }
  if (login !== ADMIN_LOGIN) {
    return res.status(401).json({ error: "Invalid credentials" });
  }
  const passwordOk = await verifyAdminPassword(password);
  if (!passwordOk) {
    return res.status(401).json({ error: "Invalid credentials" });
  }
  req.session.isAdmin = true;
  req.session.adminLogin = login;
  return res.json({ ok: true });
});

app.post("/api/admin/logout", requireAdminApi, (req, res) => {
  req.session.destroy(() => {
    res.clearCookie("zhuchy_admin_sid");
    res.json({ ok: true });
  });
});

app.get("/api/admin/session", (req, res) => {
  res.json({ authenticated: req.session?.isAdmin === true });
});

app.get("/admin", requireAdminPage, (_req, res) => {
  res.sendFile(path.join(__dirname, "admin.html"));
});

app.get("/admin.html", requireAdminPage, (_req, res) => {
  res.sendFile(path.join(__dirname, "admin.html"));
});

ensureDb();
app.listen(PORT, () => {
  if (!ADMIN_PASSWORD_HASH && ADMIN_PASSWORD === "change_me_please") {
    console.warn(
      "WARNING: Set ADMIN_PASSWORD or ADMIN_PASSWORD_HASH in environment for secure admin access."
    );
  }
  if (SESSION_SECRET === "change_this_session_secret_for_production") {
    console.warn("WARNING: Set SESSION_SECRET in environment for production.");
  }
  if (!HAS_CLOUDINARY) {
    console.warn(
      "INFO: Cloudinary is not configured. Image uploads are stored locally in /uploads."
    );
  }
  console.log(`Server started: http://localhost:${PORT}`);
});

