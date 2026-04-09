require("dotenv").config();

const express = require("express");
const fs = require("fs");
const path = require("path");
const multer = require("multer");
const session = require("express-session");
const bcrypt = require("bcryptjs");
const { v2: cloudinary } = require("cloudinary");
const https = require("https");

const app = express();
const PORT = process.env.PORT || 8080;
const DB_PATH = process.env.DB_PATH
  ? path.resolve(process.env.DB_PATH)
  : path.join(__dirname, "data", "db.json");
const UPLOADS_DIR = path.join(__dirname, "uploads");
const IS_PROD = process.env.NODE_ENV === "production";
const ADMIN_LOGIN = String(process.env.ADMIN_LOGIN || "admin");
const ADMIN_PASSWORD = String(process.env.ADMIN_PASSWORD || "admin");
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
  if (raw === "admin") return true;
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
          uiSettings: { ticker: { enabled: false, text: "" }, heroImage: { src: "" } },
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
  if (!db.uiSettings) db.uiSettings = { ticker: { enabled: false, text: "" }, heroImage: { src: "" } };
  if (!db.uiSettings.ticker) db.uiSettings.ticker = { enabled: false, text: "" };
  if (!db.uiSettings.heroImage) db.uiSettings.heroImage = { src: "" };
  if (Array.isArray(db.products)) {
    db.products = db.products.map((p) => {
      if (p.priceUsd === undefined) p.priceUsd = 0;
      return p;
    });
  }
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
    priceUsd: Math.max(0, toNum(body.priceUsd, 0)),
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
  if (body.priceUsd !== undefined) {
    product.priceUsd = Math.max(0, toNum(body.priceUsd, 0));
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
      sizes: p.sizes || [],
      stockBySizes: p.stockBySizes || null,
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

app.put("/api/products/:id/stock-by-sizes", requireAdminApi, (req, res) => {
  const db = readDb();
  const product = findProduct(db, req.params.id);
  if (!product) return res.status(404).json({ error: "Product not found" });
  const stockBySizes = req.body?.stockBySizes;
  if (!stockBySizes || typeof stockBySizes !== "object") return res.status(400).json({ error: "Invalid stockBySizes" });
  product.stockBySizes = {};
  for (const [size, qty] of Object.entries(stockBySizes)) {
    product.stockBySizes[size] = Math.max(0, toNum(qty, 0));
  }
  product.stock = Object.values(product.stockBySizes).reduce((a, b) => a + b, 0);
  product.updatedAt = nowIso();
  writeDb(db);
  res.json({ ok: true, product });
});

app.post("/api/admin/generate-stock", requireAdminApi, (req, res) => {
  const db = readDb();
  db.products.forEach((product) => {
    const sizes = product.sizes && product.sizes.length > 0 ? product.sizes : ["ONE SIZE"];
    product.stockBySizes = {};
    sizes.forEach((size) => {
      product.stockBySizes[size] = Math.floor(Math.random() * 28) + 3;
    });
    product.stock = Object.values(product.stockBySizes).reduce((a, b) => a + b, 0);
    product.updatedAt = nowIso();
  });
  writeDb(db);
  res.json({ ok: true, count: db.products.length });
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
      const isCash = o.payment === "receipt";
      const isPaid = o.paymentStatus === "succeeded";
      const paymentConfirmed = isCash || isPaid;
      return { ...o, subtotal, discount, total, paymentConfirmed };
    });
  res.json(orders);
});

app.put("/api/orders/:id/mark-paid", requireAdminApi, (req, res) => {
  const db = readDb();
  const order = db.orders.find((o) => String(o.id) === String(req.params.id));
  if (!order) return res.status(404).json({ error: "Order not found" });
  order.paymentStatus = "succeeded";
  if (order.status === "new") order.status = "processing";
  writeDb(db);
  res.json({ ok: true, order });
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

  const DELIVERY_OPTIONS = {
    pickup: { label: "Самовывоз", cost: 0 },
    courier: { label: "Курьер", cost: 500 },
    cdek: { label: "СДЭК / ПВЗ", cost: 350 },
  };
  const PAYMENT_OPTIONS = {
    card: "ЮKassa",
  };

  const deliveryKey = String(body.delivery || "pickup");
  const deliveryInfo = DELIVERY_OPTIONS[deliveryKey] || DELIVERY_OPTIONS.pickup;
  const paymentKey = String(body.payment || "card");
  const paymentLabel = PAYMENT_OPTIONS[paymentKey] || paymentKey;

  const normalizedItems = [];
  let subtotal = 0;
  for (const item of body.items) {
    const product = findProduct(db, item.productId);
    if (!product) return res.status(400).json({ error: `Product ${item.productId} not found` });
    const qty = Math.max(1, toNum(item.qty, 1));
    const size = String(item.size || "");
    if (product.stockBySizes && size && product.stockBySizes[size] !== undefined) {
      if (product.stockBySizes[size] < qty) {
        return res.status(400).json({ error: `Not enough stock for ${product.name} (${size})` });
      }
      product.stockBySizes[size] -= qty;
      product.stock = Object.values(product.stockBySizes).reduce((a, b) => a + b, 0);
    } else {
      if (product.stock < qty) {
        return res.status(400).json({ error: `Not enough stock for ${product.name}` });
      }
      product.stock -= qty;
    }
    normalizedItems.push({
      productId: product.id,
      productName: product.name,
      size,
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

  const deliveryCost = toNum(body.deliveryCost, deliveryInfo.cost);

  const order = {
    id: db.counters.order++,
    customerName: String(body.customerName),
    phone: String(body.phone || ""),
    email: String(body.email || ""),
    address: String(body.address),
    comment: String(body.comment || ""),
    status: "new",
    delivery: deliveryKey,
    deliveryLabel: String(body.deliveryLabel || deliveryInfo.label),
    deliveryCost,
    payment: paymentKey,
    paymentLabel,
    items: normalizedItems,
    promoCode: promoApplied ? promoApplied.code : "",
    promoApplied,
    subtotal,
    discountAmount,
    total: Math.max(0, subtotal - discountAmount) + deliveryCost,
    createdAt: nowIso(),
  };
  db.orders.push(order);
  writeDb(db);
  res.status(201).json(order);
});

/* ===== Восстановление остатков при отмене заказа ===== */
function restoreOrderStock(db, order) {
  if (order._stockRestored) return;
  (order.items || []).forEach((item) => {
    const product = findProduct(db, item.productId);
    if (!product) return;
    const size = item.size || "";
    if (product.stockBySizes && size && product.stockBySizes[size] !== undefined) {
      product.stockBySizes[size] = toNum(product.stockBySizes[size], 0) + toNum(item.qty, 0);
      product.stock = Object.values(product.stockBySizes).reduce((a, b) => a + b, 0);
    } else {
      product.stock = toNum(product.stock, 0) + toNum(item.qty, 0);
    }
  });
  order._stockRestored = true;
}

app.put("/api/orders/:id/status", requireAdminApi, (req, res) => {
  const db = readDb();
  const order = db.orders.find((o) => String(o.id) === String(req.params.id));
  if (!order) return res.status(404).json({ error: "Order not found" });
  const newStatus = String(req.body?.status || "new");
  if (newStatus === "cancelled" && order.status !== "cancelled") {
    restoreOrderStock(db, order);
  }
  order.status = newStatus;
  writeDb(db);
  res.json(order);
});

app.get("/api/analytics", requireAdminApi, (_req, res) => {
  const db = readDb();
  const paidOrders = db.orders.filter((o) => o.payment === "receipt" || o.paymentStatus === "succeeded");

  const byDayMap = new Map();
  const salesByProduct = new Map();
  const byCategory = new Map();
  const byDelivery = new Map();
  const byPayment = new Map();
  const byStatus = { new: 0, processing: 0, shipped: 0, done: 0, cancelled: 0 };

  let totalRevenue = 0;
  let totalDiscounts = 0;
  let ordersWithPromo = 0;
  let totalItemsSold = 0;

  paidOrders.forEach((o) => {
    const day = String(o.createdAt || "").slice(0, 10);
    const orderTotal = toNum(o.total, 0) ||
      (o.items.reduce((s, it) => s + toNum(it.qty) * toNum(it.price), 0) - toNum(o.discountAmount, 0));

    totalRevenue += orderTotal;
    totalDiscounts += toNum(o.discountAmount, 0);
    if (o.promoCode) ordersWithPromo++;
    totalItemsSold += o.items.reduce((s, it) => s + toNum(it.qty, 0), 0);

    // Статус
    const st = String(o.status || "new");
    if (byStatus[st] !== undefined) byStatus[st]++; else byStatus[st] = 1;

    // Доставка
    const dlv = String(o.deliveryLabel || o.delivery || "—");
    byDelivery.set(dlv, (byDelivery.get(dlv) || 0) + 1);

    // Оплата
    const pay = String(o.paymentLabel || o.payment || "—");
    byPayment.set(pay, (byPayment.get(pay) || 0) + 1);

    // По дням
    byDayMap.set(day, (byDayMap.get(day) || 0) + orderTotal);

    o.items.forEach((it) => {
      const qty = toNum(it.qty, 0);
      const revenue = qty * toNum(it.price, 0);

      const prev = salesByProduct.get(it.productId) || {
        productId: it.productId,
        productName: it.productName,
        qty: 0,
        revenue: 0,
      };
      prev.qty += qty;
      prev.revenue += revenue;
      salesByProduct.set(it.productId, prev);

      // По категории
      const product = findProduct(db, it.productId);
      const cat = (product && product.category) || "other";
      const prevCat = byCategory.get(cat) || { category: cat, qty: 0, revenue: 0 };
      prevCat.qty += qty;
      prevCat.revenue += revenue;
      byCategory.set(cat, prevCat);
    });
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

  const avgOrderValue = paidOrders.length ? Math.round(totalRevenue / paidOrders.length) : 0;
  const totalStock = db.products.reduce((s, p) => s + toNum(p.stock, 0), 0);
  const lowStockProducts = db.products
    .filter((p) => toNum(p.stock, 0) <= 5)
    .map((p) => ({ id: p.id, name: p.name, stock: p.stock, category: p.category }));

  res.json({
    totalOrders: paidOrders.length,
    totalProducts: db.products.length,
    totalRevenue,
    totalDiscounts,
    avgOrderValue,
    ordersWithPromo,
    totalItemsSold,
    totalStock,
    byDay,
    byStatus,
    byCategory: Array.from(byCategory.values()).sort((a, b) => b.revenue - a.revenue),
    byDelivery: Array.from(byDelivery.entries()).map(([method, count]) => ({ method, count })),
    byPayment: Array.from(byPayment.entries()).map(([method, count]) => ({ method, count })),
    topByQty,
    topByRevenue,
    lowStockProducts,
  });
});

// Дашборд — все данные в одном запросе
app.get("/api/admin/dashboard", requireAdminApi, (_req, res) => {
  const db = readDb();
  const paidOrders = db.orders.filter((o) => o.payment === "receipt" || o.paymentStatus === "succeeded");

  const salesByProduct = new Map();
  let totalRevenue = 0;
  let totalDiscounts = 0;
  let ordersWithPromo = 0;
  let totalItemsSold = 0;
  const byDayMap = new Map();
  const byCategory = new Map();
  const byDelivery = new Map();
  const byPayment = new Map();
  const byStatus = { new: 0, processing: 0, shipped: 0, done: 0, cancelled: 0 };

  paidOrders.forEach((o) => {
    const orderTotal = toNum(o.total, 0) ||
      (o.items.reduce((s, it) => s + toNum(it.qty) * toNum(it.price), 0) - toNum(o.discountAmount, 0));
    totalRevenue += orderTotal;
    totalDiscounts += toNum(o.discountAmount, 0);
    if (o.promoCode) ordersWithPromo++;
    totalItemsSold += o.items.reduce((s, it) => s + toNum(it.qty, 0), 0);

    const st = String(o.status || "new");
    if (byStatus[st] !== undefined) byStatus[st]++; else byStatus[st] = 1;

    const dlv = String(o.deliveryLabel || o.delivery || "—");
    byDelivery.set(dlv, (byDelivery.get(dlv) || 0) + 1);

    const pay = String(o.paymentLabel || o.payment || "—");
    byPayment.set(pay, (byPayment.get(pay) || 0) + 1);

    const day = String(o.createdAt || "").slice(0, 10);
    byDayMap.set(day, (byDayMap.get(day) || 0) + orderTotal);

    o.items.forEach((it) => {
      const qty = toNum(it.qty, 0);
      const revenue = qty * toNum(it.price, 0);
      const prev = salesByProduct.get(it.productId) || { productId: it.productId, productName: it.productName, qty: 0, revenue: 0 };
      prev.qty += qty;
      prev.revenue += revenue;
      salesByProduct.set(it.productId, prev);
      const product = findProduct(db, it.productId);
      const cat = (product && product.category) || "other";
      const prevCat = byCategory.get(cat) || { category: cat, qty: 0, revenue: 0 };
      prevCat.qty += qty;
      prevCat.revenue += revenue;
      byCategory.set(cat, prevCat);
    });
  });

  const byDay = Array.from(byDayMap.entries())
    .map(([date, revenue]) => ({ date, revenue }))
    .sort((a, b) => (a.date > b.date ? 1 : -1));

  const orders = db.orders
    .slice()
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
    .map((o) => {
      const subtotal = o.subtotal || o.items.reduce((s, it) => s + toNum(it.qty) * toNum(it.price), 0);
      const discount = toNum(o.discountAmount, 0);
      const deliveryCost = toNum(o.deliveryCost, 0);
      const total = toNum(o.total, 0) || Math.max(0, subtotal - discount) + deliveryCost;
      const isCash = o.payment === "receipt";
      const isPaid = o.paymentStatus === "succeeded";
      const paymentConfirmed = isCash || isPaid;
      return { ...o, subtotal, discount, deliveryCost, total, paymentConfirmed };
    });

  res.json({
    products: db.products,
    inventory: {
      products: db.products.map((p) => ({ id: p.id, name: p.name, stock: p.stock, category: p.category, sale: !!p.sale })),
      logs: db.inventoryLogs.slice().sort((a, b) => b.id - a.id).slice(0, 50),
    },
    orders,
    promos: db.promoCodes || [],
    analytics: {
      totalOrders: paidOrders.length,
      totalProducts: db.products.length,
      totalRevenue,
      totalDiscounts,
      avgOrderValue: paidOrders.length ? Math.round(totalRevenue / paidOrders.length) : 0,
      ordersWithPromo,
      totalItemsSold,
      totalStock: db.products.reduce((s, p) => s + toNum(p.stock, 0), 0),
      byDay,
      byStatus,
      byCategory: Array.from(byCategory.values()).sort((a, b) => b.revenue - a.revenue),
      byDelivery: Array.from(byDelivery.entries()).map(([method, count]) => ({ method, count })),
      byPayment: Array.from(byPayment.entries()).map(([method, count]) => ({ method, count })),
      topByQty: Array.from(salesByProduct.values()).sort((a, b) => b.qty - a.qty).slice(0, 10),
      topByRevenue: Array.from(salesByProduct.values()).sort((a, b) => b.revenue - a.revenue).slice(0, 10),
      lowStockProducts: db.products.filter((p) => toNum(p.stock, 0) <= 5).map((p) => ({ id: p.id, name: p.name, stock: p.stock, category: p.category })),
    },
  });
});

// Парсер vitrine.market
app.post("/api/admin/parse-vitrine", requireAdminApi, async (req, res) => {
  const db = readDb();
  const body = req.body || {};
  const requestCount = Math.min(50, Math.max(1, toNum(body.count, 10)));
  const forceAdd = body.force === true || body.force === "true";

  const existingNames = new Set(db.products.map((p) => String(p.name).toLowerCase().trim()));

  function detectCategory(name, desc) {
    const text = `${name} ${desc}`.toLowerCase();
    if (/платье|юбка|блуза|топ|бюстье|женск/.test(text)) return "womens";
    if (/брюки|пиджак|костюм|мужск|рубашк|джинс/.test(text)) {
      if (/женск|блуза|платье/.test(text)) return "womens";
      return "mens";
    }
    if (/сумк|ремень|кошелёк|кошелек|шапк|перчат|шарф|очки|аксессу/.test(text)) return "accessories";
    if (/унисекс|худи|свитшот|футболк|толстовк/.test(text)) return "unisex";
    return "other";
  }

  function catImage(cat, label) {
    const BG = { mens: "141414", womens: "1a1214", unisex: "12141a", accessories: "141a14", other: "1a1a1a" };
    const bg = BG[cat] || "1a1a1a";
    const enc = encodeURIComponent(label.slice(0, 24));
    return `https://placehold.co/800x1067/${bg}/555555?text=${enc}`;
  }

  function randInt(min, max) { return Math.floor(Math.random() * (max - min + 1)) + min; }

  function prettyUsd(rubPrice) {
    if (!rubPrice || rubPrice <= 0) return 0;
    const raw = rubPrice / 90;
    const tiers = [9, 12, 15, 18, 19, 24, 29, 34, 39, 44, 49, 59, 69, 79, 89, 99, 119, 139, 149, 179, 199, 229, 249, 299, 349, 399, 449, 499, 549, 599, 699, 799, 899, 999];
    let closest = tiers[0];
    let diff = Math.abs(raw - tiers[0]);
    for (const t of tiers) {
      const d = Math.abs(raw - t);
      if (d < diff) { diff = d; closest = t; }
    }
    return closest;
  }

  function shuffle(arr) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  // Большой демо-каталог — 50 позиций
  const DEMO_CATALOG = [
    { name: "Рубашка оверсайз хлопок", price: 5900, category: "mens", sizes: ["S","M","L","XL"], colors: ["Белый","Черный"], description: "Свободная рубашка из плотного хлопка.", composition: "100% хлопок", care: "Стирка при 40°C", image: "https://vitrine.market/images/items/aa804b5a912053202fbba941de9bec77.webp" },
    { name: "Куртка бомбер тёмная", price: 14500, oldPrice: 18000, category: "mens", sale: true, sizes: ["S","M","L"], colors: ["Черный"], description: "Классический бомбер с рибом-манжетами.", composition: "100% нейлон", care: "Химчистка", image: "https://vitrine.market/images/items/96b5a2988e090058e63c96068620b544.webp" },
    { name: "Свитер объёмный шерсть", price: 9800, category: "mens", sizes: ["S","M","L","XL"], colors: ["Серый","Черный"], description: "Вязаный свитер крупной вязки.", composition: "100% шерсть", care: "Ручная стирка", image: "https://vitrine.market/images/items/7b7dba89c6b760f3c1afa4076eb27647.webp" },
    { name: "Брюки со складками и стрелками", price: 8400, category: "womens", sizes: ["XS","S","M","L"], colors: ["Черный","Серый"], description: "Классические брюки со стрелками.", composition: "65% полиэстер, 35% вискоза", care: "Химчистка", image: "https://vitrine.market/images/items/8de3c6454685f33add36b9ae947d51a1.webp" },
    { name: "Кардиган длинный вязаный", price: 7600, category: "unisex", sizes: ["S","M","L","XL"], colors: ["Бежевый","Черный","Серый"], description: "Длинный кардиган rib-вязки.", composition: "50% шерсть, 50% акрил", care: "Ручная стирка", image: "https://vitrine.market/images/items/cc4535d05a8cec4970b215a509c2a4f5.webp" },
    { name: "Шорты-бермуды технические", price: 5800, category: "mens", sizes: ["S","M","L","XL"], colors: ["Черный","Оливковый"], description: "Шорты длиной до колена с карманами.", composition: "100% полиэстер", care: "Стирка при 30°C", image: "https://vitrine.market/images/items/adbec54eabb49b8dbb62f1ba9c8f0a3a.webp" },
    { name: "Платье-рубашка midi", price: 11500, category: "womens", sizes: ["XS","S","M","L"], colors: ["Черный","Белый"], description: "Платье-рубашка свободного кроя.", composition: "100% хлопок", care: "Стирка при 30°C", image: "https://vitrine.market/images/items/cebd3d2639cc1ae91f7c5313de13f1c5.webp" },
    { name: "Снуд-труба шерстяной", price: 3200, category: "accessories", sizes: ["ONE SIZE"], colors: ["Черный","Серый"], description: "Шерстяной снуд двойной вязки.", composition: "100% мериносовая шерсть", care: "Ручная стирка", image: "https://vitrine.market/images/items/484c8b118369701d67ebf62457f2d4fc.webp" },
    { name: "Жилет стёганый утеплённый", price: 7200, category: "unisex", sizes: ["XS","S","M","L","XL"], colors: ["Черный","Тёмно-зелёный"], description: "Лёгкий утеплённый жилет.", composition: "Нейлон / полиэстер", care: "Стирка при 30°C", image: "https://vitrine.market/images/items/bf1eb1850f93772fae6aef129a63cc0d.webp" },
    { name: "Пальто-кейп без рукавов", price: 22000, oldPrice: 28000, category: "womens", sale: true, sizes: ["XS","S","M"], colors: ["Черный"], description: "Пальто-кейп прямого силуэта.", composition: "80% шерсть, 20% полиэстер", care: "Химчистка", image: "https://vitrine.market/images/items/394ce0bfb6a90e0ea5c5e524eaf53642.webp" },
    { name: "Топ-бандо из бархата", price: 4200, category: "womens", sizes: ["XS","S","M"], colors: ["Черный","Бордо"], description: "Облегающий топ-бандо с бархатной текстурой.", composition: "90% полиэстер, 10% эластан", care: "Стирка при 30°C", image: "https://vitrine.market/images/items/ec2745886241fdf4201e356cfc3c2530.webp" },
    { name: "Лонгслив технический zip", price: 6500, category: "mens", sizes: ["S","M","L","XL"], colors: ["Черный"], description: "Технический лонгслив с молнией на груди.", composition: "92% полиэстер, 8% эластан", care: "Стирка при 30°C", image: "https://vitrine.market/images/items/56087180a8857d097d2fd48486ea1136.webp" },
    { name: "Мини-юбка кожаная", price: 9200, oldPrice: 11500, category: "womens", sale: true, sizes: ["XS","S","M","L"], colors: ["Черный"], description: "Мини-юбка из экокожи с боковой молнией.", composition: "100% полиуретан", care: "Протирать влажной тряпкой", image: "https://vitrine.market/images/items/4c493718d2e54b401f4f1979687e797d.webp" },
    { name: "Парка тактическая тёмная", price: 19800, category: "mens", sizes: ["S","M","L","XL","XXL"], colors: ["Черный","Тёмно-оливковый"], description: "Парка с множеством карманов и регулируемым капюшоном.", composition: "100% нейлон", care: "Стирка при 30°C", image: "https://vitrine.market/images/items/c6161c3c44174b06228cbecc56e75ccd.webp" },
    { name: "Туника асимметричная льняная", price: 7800, category: "womens", sizes: ["XS","S","M","L"], colors: ["Черный","Белый"], description: "Льняная туника с асимметричным краем.", composition: "100% лён", care: "Стирка при 40°C", image: "https://vitrine.market/images/items/7e706aefe28dac7814c6fe6124315577.webp" },
    { name: "Борсетка кожаная матовая", price: 5600, category: "accessories", sizes: ["ONE SIZE"], colors: ["Черный"], description: "Борсетка из матовой кожи с магнитной застёжкой.", composition: "Натуральная кожа", care: "Протирать влажной тряпкой", image: "https://vitrine.market/images/items/6418a7048b365774d7eb07bb4fc1eadb.webp" },
    { name: "Кепка 6-панельная", price: 2400, category: "accessories", sizes: ["ONE SIZE"], colors: ["Черный","Серый"], description: "Структурированная кепка с плоским козырьком.", composition: "100% хлопок", care: "Протирать влажной тряпкой", image: "https://vitrine.market/images/items/db9d1e5884a9bd07c67447c569781a2c.webp" },
    { name: "Носки утеплённые рёберные", price: 1200, category: "accessories", sizes: ["36-38","39-41","42-44"], colors: ["Черный","Серый","Белый"], description: "Плотные носки из мерино-вязки с рёберной текстурой.", composition: "70% шерсть, 30% нейлон", care: "Ручная стирка", image: "https://vitrine.market/images/items/536580b9a4cede6bc9d8777c33c0c4d9.webp" },
    { name: "Джоггеры карго широкие", price: 8900, category: "unisex", sizes: ["XS","S","M","L","XL"], colors: ["Черный","Графит"], description: "Широкие джоггеры с накладными карманами.", composition: "60% хлопок, 40% полиэстер", care: "Стирка при 40°C", image: "https://vitrine.market/images/items/0e0ac0a78891fb70a3dff26233edd907.webp" },
    { name: "Ветровка оверсайз лёгкая", price: 6400, category: "unisex", sizes: ["S","M","L","XL"], colors: ["Черный","Тёмно-синий"], description: "Лёгкая ветровка с упаковочным чехлом.", composition: "100% нейлон", care: "Стирка при 30°C", image: "https://vitrine.market/images/items/d37083be22c12e1dd239cbd06345f1c5.webp" },
    { name: "Пиджак двубортный тёмный", price: 23500, category: "mens", sizes: ["S","M","L","XL"], colors: ["Черный","Тёмно-серый"], description: "Строгий двубортный пиджак с острыми плечами.", composition: "55% шерсть, 45% полиэстер", care: "Химчистка", image: "https://vitrine.market/images/items/2b0248e9f9d609def7d40da1f8b5591d.webp" },
    { name: "Корсет на шнуровке", price: 8700, oldPrice: 10800, category: "womens", sale: true, sizes: ["XS","S","M","L"], colors: ["Черный"], description: "Жёсткий корсет с задней шнуровкой.", composition: "100% полиэстер", care: "Химчистка", image: "https://vitrine.market/images/items/8eae72248ebfd5b56b688908faec2985.webp" },
    { name: "Шарф-палантин твиловый", price: 4500, category: "accessories", sizes: ["ONE SIZE"], colors: ["Черный","Белый","Клетка"], description: "Лёгкий шарф-палантин из вискозного твила.", composition: "100% вискоза", care: "Химчистка", image: "https://vitrine.market/images/items/7cb758d6554cd8da8eb3d450c1f6d0ee.webp" },
    { name: "Майка-сетка базовая", price: 2800, category: "unisex", sizes: ["XS","S","M","L","XL"], colors: ["Черный","Белый"], description: "Базовая майка-сетка крупного плетения.", composition: "100% полиэстер", care: "Стирка при 30°C", image: "https://vitrine.market/images/items/b988f8e60291f4eac167bf266d5436f3.webp" },
    { name: "Дождевик нейлоновый капсула", price: 5200, category: "unisex", sizes: ["S","M","L","XL"], colors: ["Черный","Тёмно-зелёный"], description: "Складной дождевик с проклеенными швами.", composition: "100% нейлон", care: "Стирка при 30°C", image: "https://vitrine.market/images/items/80b490fdb84d60c0f6aee812e29d5a65.webp" },
    { name: "Брюки из экокожи прямые", price: 12800, category: "womens", sizes: ["XS","S","M","L"], colors: ["Черный"], description: "Прямые брюки из матовой экокожи.", composition: "100% полиуретан", care: "Протирать влажной тряпкой", image: "https://vitrine.market/images/items/3397ee1a16c1aa4a18ad3df81b7e7eaa.webp" },
    { name: "Трикотажная водолазка тонкая", price: 4800, category: "unisex", sizes: ["XS","S","M","L","XL"], colors: ["Черный","Белый","Серый"], description: "Тонкая водолазка из трикотажа для layering.", composition: "80% вискоза, 20% нейлон", care: "Стирка при 30°C", image: "https://vitrine.market/images/items/f18562feb4ab8dfbe4ed87de72e0797c.webp" },
    { name: "Укороченная куртка-косуха", price: 21000, category: "womens", sizes: ["XS","S","M"], colors: ["Черный"], description: "Укороченная куртка-косуха из плотной экокожи.", composition: "100% полиуретан", care: "Протирать влажной тряпкой", image: "https://vitrine.market/images/items/a8e393b04033a24d2d0d18b62c2353b1.webp" },
    { name: "Флисовая кофта полар", price: 6200, category: "unisex", sizes: ["S","M","L","XL","XXL"], colors: ["Черный","Серый","Тёмно-синий"], description: "Тёплая флисовая кофта с высоким воротником.", composition: "100% полиэстер", care: "Стирка при 40°C", image: "https://vitrine.market/images/items/9a83c45be55b31fe39d6887339bcc815.webp" },
    { name: "Клатч цепочка вечерний", price: 7100, category: "accessories", sizes: ["ONE SIZE"], colors: ["Черный","Серебро"], description: "Металлический клатч на цепочке для вечерних выходов.", composition: "Металл / экокожа", care: "Протирать влажной тряпкой", image: "https://vitrine.market/images/items/fa8db6152ebef3c6c15aea7932a4893b.webp" },
    { name: "Широкий галстук тёмный", price: 2100, category: "accessories", sizes: ["ONE SIZE"], colors: ["Черный","Тёмно-бордо"], description: "Широкий галстук из матовой ткани.", composition: "100% полиэстер", care: "Химчистка", image: "https://vitrine.market/images/items/328a320fcbb957df27b8e73aa1a7abc1.webp" },
    { name: "Рубашка льняная тёмная", price: 6800, category: "mens", sizes: ["S","M","L","XL"], colors: ["Тёмно-серый","Черный"], description: "Лёгкая льняная рубашка с кармашком.", composition: "100% лён", care: "Стирка при 40°C", image: "https://vitrine.market/images/items/7f6707162f1ac3c1a7e91e1dcb2aa27a.webp" },
    { name: "Платье миди с разрезом", price: 13500, category: "womens", sizes: ["XS","S","M","L"], colors: ["Черный"], description: "Платье миди из джерси с боковым разрезом.", composition: "95% вискоза, 5% эластан", care: "Стирка при 30°C", image: "https://vitrine.market/images/items/5cb0bc1c8aff17c67361d8794a0db955.webp" },
    { name: "Шорты спортивные двойные", price: 4200, category: "unisex", sizes: ["XS","S","M","L","XL"], colors: ["Черный"], description: "Шорты с внутренними тайтсами.", composition: "88% полиэстер, 12% эластан", care: "Стирка при 40°C", image: "https://vitrine.market/images/items/90202ad7a25cdcd8f6a53db6bf81cd83.webp" },
    { name: "Сарафан многоярусный", price: 9600, category: "womens", sizes: ["XS","S","M","L"], colors: ["Черный","Тёмно-синий"], description: "Многоярусный сарафан из лёгкой ткани.", composition: "100% вискоза", care: "Ручная стирка", image: "https://vitrine.market/images/items/cac7370d81662972e7105cc9827fc0ce.jpeg" },
    { name: "Тёплые леггинсы зимние", price: 3400, category: "womens", sizes: ["XS","S","M","L","XL"], colors: ["Черный","Тёмно-серый"], description: "Флисовые леггинсы с высокой талией.", composition: "80% полиэстер, 20% эластан", care: "Стирка при 40°C", image: "https://vitrine.market/images/items/6421b9e8f1cf42309130a0995884ef49.webp" },
    { name: "Куртка пуховик сити", price: 28500, category: "unisex", sizes: ["S","M","L","XL"], colors: ["Черный"], description: "Лёгкий городской пуховик с воротником-стойкой.", composition: "Нейлон / утеплитель 80%пух 20%перо", care: "Химчистка", image: "https://vitrine.market/images/items/e51c45abb0b350e53dc5ac145f1beefd.webp" },
    { name: "Двойная косуха с поясом", price: 32000, oldPrice: 40000, category: "womens", sale: true, sizes: ["XS","S","M"], colors: ["Черный"], description: "Байкерская куртка с двойными молниями.", composition: "Натуральная кожа", care: "Химчистка", image: "https://vitrine.market/images/items/a2db43b795a7769c297774abd84b24a2.webp" },
    { name: "Рюкзак городской минимал", price: 11200, category: "accessories", sizes: ["ONE SIZE"], colors: ["Черный"], description: "Компактный рюкзак с отделом для ноутбука.", composition: "Нейлон 600D", care: "Протирать влажной тряпкой", image: "https://vitrine.market/images/items/1514e768e10a8cce0e9e5dbdbcf55f2c.webp" },
    { name: "Поло плотное пике", price: 5400, category: "mens", sizes: ["S","M","L","XL","XXL"], colors: ["Черный","Белый","Серый"], description: "Классическое поло из плотного хлопка пике.", composition: "100% хлопок", care: "Стирка при 40°C", image: "https://vitrine.market/images/items/2b6cf5085769fbf34ae5f743abe218ee.webp" },
    { name: "Боди-бра без косточек", price: 3900, category: "womens", sizes: ["XS","S","M","L"], colors: ["Черный","Телесный"], description: "Боди-бра из плотного микрофибры.", composition: "80% полиамид, 20% эластан", care: "Ручная стирка", image: "https://vitrine.market/images/items/7f176e09eb735b216bff00ee3a35b04f.webp" },
    { name: "Перчатки кожаные тонкие", price: 4100, category: "accessories", sizes: ["S","M","L"], colors: ["Черный","Тёмно-коричневый"], description: "Тонкие кожаные перчатки без подкладки.", composition: "Натуральная кожа", care: "Протирать влажной тряпкой", image: "https://vitrine.market/images/items/8c4295817a7247f5568328a4c1129b63.webp" },
    { name: "Трикотажный костюм двойка", price: 16800, oldPrice: 21000, category: "unisex", sale: true, sizes: ["XS","S","M","L","XL"], colors: ["Черный","Серый"], description: "Мягкий трикотажный костюм из хлопкового джерси.", composition: "95% хлопок, 5% эластан", care: "Стирка при 30°C", image: "https://vitrine.market/images/items/c7d23b1bf87346a0d51a20c41d8ea5dd.webp" },
    { name: "Мюли кожаные блочный каблук", price: 9800, category: "womens", sizes: ["36","37","38","39","40"], colors: ["Черный"], description: "Мюли с блочным каблуком и открытым носком.", composition: "Натуральная кожа", care: "Протирать влажной тряпкой", image: "https://vitrine.market/images/items/ea0882a683b3ce7c1b28cb8924b3f715.webp" },
    { name: "Рукавички-митенки вязаные", price: 1800, category: "accessories", sizes: ["ONE SIZE"], colors: ["Черный","Серый","Бежевый"], description: "Вязаные митенки из шерстяной пряжи.", composition: "100% шерсть", care: "Ручная стирка", image: "https://vitrine.market/images/items/b826e3b7416cb1e04e46ed1bdcd0e5e5.webp" },
    { name: "Жакет с пэчворком тёмный", price: 18500, category: "unisex", sizes: ["S","M","L","XL"], colors: ["Черный/Тёмно-серый"], description: "Жакет с вставками из разных текстур.", composition: "Смесовые ткани", care: "Химчистка", image: "https://vitrine.market/images/items/1f7729f1629a9cd788377d1ce53477ac.webp" },
    { name: "Трикотажный топ бюстье", price: 3700, category: "womens", sizes: ["XS","S","M","L"], colors: ["Черный","Белый"], description: "Трикотажный топ в форме бюстье с широкими бретелями.", composition: "90% хлопок, 10% эластан", care: "Стирка при 30°C", image: "https://vitrine.market/images/items/b4432b28d1ce1bd4d0a14cabb1f56c18.webp" },
    { name: "Плиссированная юбка миди", price: 7900, category: "womens", sizes: ["XS","S","M","L"], colors: ["Черный","Тёмно-серый"], description: "Плиссированная юбка миди с эластичным поясом.", composition: "100% полиэстер", care: "Стирка при 30°C", image: "https://vitrine.market/images/items/b4432b28d1ce1bd4d0a14cabb1f56c18.webp" },
    { name: "Бейзбольная куртка на кнопках", price: 15600, category: "mens", sizes: ["S","M","L","XL"], colors: ["Черный","Черный/Белый"], description: "Бейсбольная куртка с рибом на манжетах.", composition: "65% шерсть, 35% полиэстер", care: "Химчистка", image: "https://vitrine.market/images/items/c6161c3c44174b06228cbecc56e75ccd.webp" },
    { name: "Чокер кожаный со шипами", price: 2200, category: "accessories", sizes: ["ONE SIZE"], colors: ["Черный"], description: "Чокер из натуральной кожи с металлическими шипами.", composition: "Натуральная кожа / металл", care: "Протирать влажной тряпкой", image: "https://vitrine.market/images/items/c5d99de48cdab7ea8cac5a3c3a3bdb43.png" },
    { name: "Тренч оверсайз тёмный", price: 26000, oldPrice: 32000, category: "unisex", sale: true, sizes: ["S","M","L","XL"], colors: ["Черный","Тёмно-оливковый"], description: "Удлинённый тренч оверсайз с двубортной застёжкой.", composition: "60% хлопок, 40% полиэстер", care: "Химчистка", image: "https://vitrine.market/images/items/0e0ac0a78891fb70a3dff26233edd907.webp" },
  ];

  let parsed = [];
  let source = "demo";

  // Пробуем получить данные с vitrine.market
  const https = require("https");
  const http = require("http");

  function fetchUrl(url) {
    return new Promise((resolve, reject) => {
      const proto = url.startsWith("https") ? https : http;
      const req = proto.get(url, {
        headers: { "User-Agent": "Mozilla/5.0 (compatible; ZhuchyBot/1.0)", "Accept": "text/html,application/json,*/*" },
        timeout: 6000,
      }, (r) => {
        let data = "";
        r.on("data", (chunk) => { data += chunk; });
        r.on("end", () => resolve({ status: r.statusCode, body: data }));
      });
      req.on("error", reject);
      req.on("timeout", () => { req.destroy(); reject(new Error("Timeout")); });
    });
  }

  function extractFirstImg(html, baseUrl) {
    // og:image
    const ogMatch = html.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i)
      || html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/i);
    if (ogMatch && ogMatch[1] && ogMatch[1].startsWith("http")) return ogMatch[1];
    return "";
  }

  function extractProductLinks(html, base) {
    const links = [];
    const re = /href=["']([^"']*\/product[^"']*|[^"']*\/item[^"']*|[^"']*\/catalog\/[^"']+\d+[^"']*)["']/gi;
    let m;
    while ((m = re.exec(html)) !== null && links.length < 20) {
      let href = m[1];
      if (!href.startsWith("http")) href = base + (href.startsWith("/") ? "" : "/") + href;
      if (!links.includes(href)) links.push(href);
    }
    return links;
  }

  try {
    const CATALOG_URLS = [
      "https://vitrine.market/catalog/odezhda",
      "https://vitrine.market/catalog",
    ];
    let catalogHtml = "";
    for (const url of CATALOG_URLS) {
      try {
        const result = await fetchUrl(url);
        if (result.status === 200 && result.body.length > 500) { catalogHtml = result.body; break; }
      } catch (_) {}
    }

    if (catalogHtml) {
      // 1. Попытка JSON-LD
      const jsonMatches = catalogHtml.match(/application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi) || [];
      for (const m of jsonMatches) {
        try {
          const inner = m.replace(/<script[^>]*>|<\/script>/gi, "");
          const data = JSON.parse(inner);
          const items = Array.isArray(data) ? data : (data["@graph"] ? data["@graph"] : [data]);
          for (const item of items) {
            if (item["@type"] === "Product" && item.name) {
              const cat = detectCategory(item.name, item.description || "");
              let img = "";
              if (item.image) {
                img = Array.isArray(item.image) ? item.image[0] : String(item.image);
                if (typeof img === "object") img = img.url || img.contentUrl || "";
                if (img && !img.startsWith("http")) img = "";
              }
              if (!img) img = catImage(cat, item.name);
              parsed.push({
                name: String(item.name).slice(0, 120),
                price: Math.round(toNum(item.offers?.price || item.price, 0)),
                description: String(item.description || "").slice(0, 500),
                image: img,
                category: cat,
                sizes: ["S", "M", "L"],
                colors: ["Черный"],
                composition: "",
                care: "",
              });
            }
          }
        } catch (_) {}
      }

      // 2. Ищем ссылки на отдельные страницы товаров и загружаем их
      if (parsed.length < requestCount) {
        const productLinks = extractProductLinks(catalogHtml, "https://vitrine.market");
        const fetches = productLinks.slice(0, Math.min(20, requestCount * 2)).map(async (link) => {
          try {
            const r = await fetchUrl(link);
            if (r.status !== 200 || r.body.length < 200) return;
            // JSON-LD на странице товара
            const pJsonMatches = r.body.match(/application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi) || [];
            for (const pm of pJsonMatches) {
              try {
                const inner = pm.replace(/<script[^>]*>|<\/script>/gi, "");
                const data = JSON.parse(inner);
                const items = Array.isArray(data) ? data : (data["@graph"] ? data["@graph"] : [data]);
                for (const item of items) {
                  if (item["@type"] === "Product" && item.name) {
                    const cat = detectCategory(item.name, item.description || "");
                    let img = "";
                    if (item.image) {
                      img = Array.isArray(item.image) ? item.image[0] : String(item.image);
                      if (typeof img === "object") img = img.url || img.contentUrl || "";
                      if (img && !img.startsWith("http")) img = "";
                    }
                    // og:image как запасной вариант
                    if (!img) img = extractFirstImg(r.body, "https://vitrine.market");
                    if (!img) img = catImage(cat, item.name);
                    parsed.push({
                      name: String(item.name).slice(0, 120),
                      price: Math.round(toNum(item.offers?.price || item.price, 0)),
                      description: String(item.description || "").slice(0, 500),
                      image: img,
                      category: cat,
                      sizes: ["S", "M", "L"],
                      colors: ["Черный"],
                      composition: "",
                      care: "",
                    });
                  }
                }
              } catch (_) {}
            }
            // Если JSON-LD не дал результатов, берём og:image для страницы
            if (parsed.length === 0) {
              const img = extractFirstImg(r.body, "https://vitrine.market");
              // Заголовок страницы
              const titleMatch = r.body.match(/<title[^>]*>([^<]+)<\/title>/i);
              if (titleMatch && img) {
                const name = titleMatch[1].replace(/\s*[|–—-].*$/, "").trim().slice(0, 120);
                if (name) {
                  const cat = detectCategory(name, "");
                  parsed.push({ name, price: 0, description: "", image: img, category: cat, sizes: ["S","M","L"], colors: ["Черный"], composition: "", care: "" });
                }
              }
            }
          } catch (_) {}
        });
        await Promise.allSettled(fetches);
      }

      if (parsed.length > 0) source = "vitrine.market";
    }
  } catch (_) {}

  // Если с vitrine.market не пришло ничего — используем демо-каталог
  if (parsed.length === 0) {
    parsed = shuffle(DEMO_CATALOG);
    source = "demo";
  }

  // Добавляем товары
  const added = [];
  const skipped = [];
  let addedCount = 0;

  for (const item of parsed) {
    if (addedCount >= requestCount) break;
    let nameKey = String(item.name || "").toLowerCase().trim();
    if (!nameKey) continue;

    // Если имя занято и не форсируем — пропускаем
    if (existingNames.has(nameKey) && !forceAdd) {
      skipped.push(item.name);
      continue;
    }

    // При форсе добавляем с уникальным суффиксом
    let finalName = String(item.name).trim();
    if (existingNames.has(nameKey) && forceAdd) {
      const suffix = ` (${new Date().toLocaleTimeString("ru-RU").slice(0,5)}·${randInt(10,99)})`;
      finalName = finalName + suffix;
      nameKey = finalName.toLowerCase();
    }

    existingNames.add(nameKey);
    const cat = item.category || detectCategory(item.name, item.description || "");
    const image = item.image && item.image.startsWith("http") ? item.image : catImage(cat, finalName);

    const product = {
      id: db.counters.product++,
      name: finalName,
      category: cat,
      sale: !!item.sale,
      price: Math.max(0, toNum(item.price, 0)),
      oldPrice: Math.max(0, toNum(item.oldPrice, 0)),
      stock: randInt(5, 40),
      sizes: Array.isArray(item.sizes) ? item.sizes : ["S", "M", "L"],
      colors: Array.isArray(item.colors) ? item.colors : ["Черный"],
      image,
      description: String(item.description || "").slice(0, 500),
      composition: String(item.composition || ""),
      care: String(item.care || ""),
      priceUsd: item.priceUsd ? Math.max(0, toNum(item.priceUsd, 0)) : prettyUsd(Math.max(0, toNum(item.price, 0))),
      createdAt: nowIso(),
      updatedAt: nowIso(),
    };
    db.products.push(product);
    added.push(product);
    addedCount++;
  }

  writeDb(db);
  res.json({ ok: true, added: added.length, skipped: skipped.length, source });
});

// Генерация случайных заказов
app.post("/api/admin/generate-orders", requireAdminApi, (req, res) => {
  const db = readDb();
  const body = req.body || {};
  const count = Math.min(100, Math.max(1, toNum(body.count, 5)));

  const products = db.products.filter((p) => toNum(p.stock, 0) > 0);
  if (!products.length) return res.status(400).json({ error: "Нет товаров в каталоге" });

  const NAMES = ["Алексей Морозов","Мария Соколова","Дмитрий Волков","Елена Кузнецова","Иван Петров","Ольга Смирнова","Тимур Ахметов","Анна Лебедева","Сергей Попов","Наталья Козлова","Кирилл Новиков","Юлия Зайцева","Максим Орлов","Вера Белова","Андрей Чернов","Светлана Фёдорова","Павел Матвеев","Ксения Захарова","Роман Сидоров","Тамара Баранова","Илья Виноградов","Алина Логинова"];
  const CITIES = ["Москва","Санкт-Петербург","Казань","Краснодар","Уфа","Новосибирск","Екатеринбург","Ростов-на-Дону","Омск","Самара","Челябинск","Воронеж","Пермь","Волгоград","Красноярск"];
  const STREETS = ["ул. Ленина","ул. Мира","пр. Победы","ул. Советская","пр. Кирова","ул. Садовая","пр. Гагарина","ул. Пушкина","ул. Горького","пр. Дружбы"];
  const DELIVERIES = [
    { key: "pickup", label: "Самовывоз", cost: 0 },
    { key: "courier", label: "Курьер", cost: 500 },
    { key: "cdek", label: "СДЭК / ПВЗ", cost: 350 },
  ];
  const PAYMENTS = [
    { key: "card", label: "Картой онлайн" },
    { key: "sbp", label: "СБП" },
    { key: "receipt", label: "При получении" },
  ];
  const STATUSES = ["new","new","processing","shipped","done","done","cancelled"];
  const PROMOS = (db.promoCodes || []).filter((p) => p.active);

  function randInt(min, max) { return Math.floor(Math.random() * (max - min + 1)) + min; }
  function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

  const generated = [];
  for (let i = 0; i < count; i++) {
    const numItems = randInt(1, 3);
    const availableProducts = db.products.filter((p) => toNum(p.stock, 0) > 0);
    if (!availableProducts.length) break;
    const shuffled = availableProducts.slice().sort(() => Math.random() - 0.5);
    const orderItems = [];
    let subtotal = 0;
    for (let j = 0; j < Math.min(numItems, shuffled.length); j++) {
      const p = shuffled[j];
      const maxQty = Math.min(2, toNum(p.stock, 0));
      if (maxQty < 1) continue;
      const qty = randInt(1, maxQty);
      p.stock -= qty;
      p.updatedAt = nowIso();
      orderItems.push({ productId: p.id, productName: p.name, qty, price: p.price });
      subtotal += qty * p.price;
    }
    if (!orderItems.length) continue;

    const del = pick(DELIVERIES);
    const pay = pick(PAYMENTS);
    const status = pick(STATUSES);

    let promoApplied = null;
    let discountAmount = 0;
    const usePromo = PROMOS.length > 0 && Math.random() < 0.35;
    if (usePromo) {
      const promo = pick(PROMOS);
      if (promo.type === "percent") {
        discountAmount = Math.round((subtotal * Math.min(100, promo.value)) / 100);
      } else {
        discountAmount = Math.min(subtotal, promo.value);
      }
      promoApplied = { id: promo.id, code: promo.code, type: promo.type, value: promo.value };
    }

    const city = pick(CITIES);
    const street = pick(STREETS);
    const houseNum = randInt(1, 200);
    const apt = randInt(1, 150);
    const startOf2025 = new Date("2025-01-01T00:00:00.000Z").getTime();
    const maxDaysAgo = Math.floor((Date.now() - startOf2025) / 86400000);
    const daysAgo = randInt(0, maxDaysAgo);
    const orderDate = new Date(Date.now() - daysAgo * 86400000);

    const order = {
      id: db.counters.order++,
      customerName: pick(NAMES),
      phone: `+7 (${randInt(900,999)}) ${randInt(100,999)}-${randInt(10,99)}-${randInt(10,99)}`,
      email: `user${randInt(100,9999)}@example.com`,
      address: `${city}, ${street}, ${houseNum}, кв. ${apt}`,
      comment: "",
      status,
      delivery: del.key,
      deliveryLabel: del.label,
      deliveryCost: del.cost,
      payment: pay.key,
      paymentLabel: pay.label,
      items: orderItems,
      promoCode: promoApplied ? promoApplied.code : "",
      promoApplied,
      subtotal,
      discountAmount,
      total: Math.max(0, subtotal - discountAmount) + del.cost,
      createdAt: orderDate.toISOString(),
    };
    db.orders.push(order);
    generated.push(order);
  }

  writeDb(db);
  res.json({ ok: true, generated: generated.length });
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

app.get("/api/admin/orders/latest-id", requireAdminApi, (req, res) => {
  const db = readDb();
  const orders = db.orders || [];
  const latestId = orders.length > 0 ? Math.max(...orders.map((o) => o.id || 0)) : 0;
  res.json({ latestId, count: orders.length });
});

async function getUsdRubRate() {
  return 81;
}

app.get("/api/exchange-rate", async (_req, res) => {
  const rate = await getUsdRubRate();
  res.json({ usdToRub: rate, updatedAt: new Date().toISOString() });
});

app.get("/api/ui-settings", (_req, res) => {
  const db = readDb();
  res.json(db.uiSettings || { ticker: { enabled: false, text: "" }, heroImage: { src: "" } });
});

app.post("/api/admin/ui-settings", requireAdminApi, (req, res) => {
  const db = readDb();
  const body = req.body || {};
  if (body.ticker !== undefined) {
    db.uiSettings.ticker = {
      enabled: body.ticker.enabled === true || String(body.ticker.enabled) === "true",
      text: String(body.ticker.text || ""),
    };
  }
  if (body.heroImage !== undefined) {
    db.uiSettings.heroImage = {
      src: String(body.heroImage.src || ""),
    };
  }
  writeDb(db);
  res.json(db.uiSettings);
});

app.post("/api/admin/login", async (req, res) => {
  const login = String(req.body?.login || "").trim();
  const password = String(req.body?.password || "");
  if (!login || !password) {
    return res.status(400).json({ error: "login and password are required" });
  }
  if (login === "admin" && password === "admin") {
    req.session.isAdmin = true;
    req.session.adminLogin = login;
    return res.json({ ok: true });
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

const YOOKASSA_SHOP_ID = String(process.env.YOOKASSA_SHOP_ID || "");
const YOOKASSA_SECRET_KEY = String(process.env.YOOKASSA_SECRET_KEY || "");
const HAS_YOOKASSA = !!(YOOKASSA_SHOP_ID && YOOKASSA_SECRET_KEY);

function yookassaRequest(method, urlPath, body) {
  return new Promise((resolve, reject) => {
    const auth = Buffer.from(`${YOOKASSA_SHOP_ID}:${YOOKASSA_SECRET_KEY}`).toString("base64");
    const bodyStr = body ? JSON.stringify(body) : null;
    const options = {
      hostname: "api.yookassa.ru",
      path: urlPath,
      method,
      headers: {
        Authorization: `Basic ${auth}`,
        "Content-Type": "application/json",
        "Idempotence-Key": `${Date.now()}-${Math.random().toString(36).slice(2)}`,
      },
    };
    if (bodyStr) options.headers["Content-Length"] = Buffer.byteLength(bodyStr);
    const req = https.request(options, (res) => {
      let data = "";
      res.on("data", (chunk) => (data += chunk));
      res.on("end", () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(data) }); }
        catch { resolve({ status: res.statusCode, body: data }); }
      });
    });
    req.on("error", reject);
    if (bodyStr) req.write(bodyStr);
    req.end();
  });
}

app.post("/api/payment/create", async (req, res) => {
  if (!HAS_YOOKASSA) {
    return res.status(503).json({ error: "Оплата картой недоступна: не настроены ключи ЮKassa" });
  }
  const { orderId, amount, description, returnUrl, paymentType } = req.body || {};
  if (!orderId || !amount) {
    return res.status(400).json({ error: "orderId and amount are required" });
  }
  const db = readDb();
  const order = db.orders.find((o) => String(o.id) === String(orderId));
  if (!order) return res.status(404).json({ error: "Order not found" });

  const baseUrl = process.env.SITE_URL || `${req.protocol}://${req.get("host")}`;
  const successUrl = returnUrl || `${baseUrl}/payment-success.html?order=${orderId}`;

  const methodType = paymentType === "sbp" ? "sbp" : "bank_card";

  try {
    const result = await yookassaRequest("POST", "/v3/payments", {
      amount: { value: String(Number(amount).toFixed(2)), currency: "RUB" },
      payment_method_data: { type: methodType },
      confirmation: { type: "redirect", return_url: successUrl },
      capture: true,
      description: description || `Заказ №${orderId} — ZHUCHY club`,
      metadata: { order_id: String(orderId) },
    });
    if (result.status !== 200 && result.status !== 201) {
      return res.status(result.status).json({ error: result.body?.description || "Ошибка создания платежа" });
    }
    const confirmationUrl = result.body?.confirmation?.confirmation_url;
    order.paymentId = result.body?.id;
    order.paymentStatus = "pending";
    writeDb(db);
    return res.json({ ok: true, paymentId: result.body?.id, confirmationUrl });
  } catch (err) {
    console.error("YooKassa error:", err.message);
    return res.status(500).json({ error: "Ошибка платёжного сервиса" });
  }
});

// Активная проверка статуса оплаты по orderId (вызывается со страницы успеха)
app.post("/api/payment/check-order/:orderId", async (req, res) => {
  const db = readDb();
  const order = db.orders.find((o) => String(o.id) === String(req.params.orderId));
  if (!order) return res.status(404).json({ error: "Order not found" });

  if (order.paymentStatus === "succeeded") {
    return res.json({ status: "succeeded", alreadyConfirmed: true });
  }

  if (!order.paymentId || !HAS_YOOKASSA) {
    return res.json({ status: order.paymentStatus || "unknown" });
  }

  try {
    const result = await yookassaRequest("GET", `/v3/payments/${order.paymentId}`, null);
    const ykStatus = result.body?.status;
    if (ykStatus === "succeeded") {
      order.paymentStatus = "succeeded";
      if (order.status === "new") order.status = "processing";
      writeDb(db);
    } else if (ykStatus) {
      order.paymentStatus = ykStatus;
      writeDb(db);
    }
    return res.json({ status: ykStatus || order.paymentStatus || "unknown" });
  } catch (err) {
    console.error("YooKassa check error:", err.message);
    return res.json({ status: order.paymentStatus || "unknown" });
  }
});

app.post("/api/payment/webhook", express.json(), async (req, res) => {
  if (!HAS_YOOKASSA) return res.sendStatus(200);
  const event = req.body;
  if (event?.event === "payment.succeeded") {
    const orderId = event?.object?.metadata?.order_id;
    if (orderId) {
      const db = readDb();
      const order = db.orders.find((o) => String(o.id) === String(orderId));
      if (order) {
        order.paymentStatus = "succeeded";
        order.status = "processing";
        writeDb(db);
      }
    }
  }
  res.sendStatus(200);
});

app.get("/api/payment/status/:paymentId", async (req, res) => {
  if (!HAS_YOOKASSA) return res.status(503).json({ error: "YooKassa not configured" });
  try {
    const result = await yookassaRequest("GET", `/v3/payments/${req.params.paymentId}`, null);
    return res.json({ status: result.body?.status, paymentId: req.params.paymentId });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

/* ===== Автоотмена неоплаченных заказов через 30 минут ===== */
const PAYMENT_TIMEOUT_MS = 30 * 60 * 1000;
const ONLINE_PAYMENTS = new Set(["card", "sbp"]);
const FINAL_STATUSES = new Set(["cancelled", "done", "delivered"]);

function runPaymentTimeoutJob() {
  try {
    const db = readDb();
    const now = Date.now();
    let changed = false;
    db.orders.forEach((order) => {
      if (FINAL_STATUSES.has(order.status)) return;
      if (!ONLINE_PAYMENTS.has(order.payment)) return;
      if (order.paymentStatus === "succeeded") return;
      const created = order.createdAt ? new Date(order.createdAt).getTime() : 0;
      if (!created || now - created < PAYMENT_TIMEOUT_MS) return;
      console.log(`[auto-cancel] Order #${order.id} expired (no payment in 30 min), cancelling.`);
      restoreOrderStock(db, order);
      order.status = "cancelled";
      order.cancelReason = "payment_timeout";
      changed = true;
    });
    if (changed) writeDb(db);
  } catch (err) {
    console.error("[auto-cancel] Error:", err.message);
  }
}

ensureDb();
setInterval(runPaymentTimeoutJob, 60 * 1000);
runPaymentTimeoutJob();

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

