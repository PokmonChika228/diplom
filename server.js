require("dotenv").config();

const express = require("express");
const fs = require("fs");
const path = require("path");
const multer = require("multer");
const session = require("express-session");
const bcrypt = require("bcryptjs");
const { v2: cloudinary } = require("cloudinary");
const { Pool } = require("pg");

const app = express();
const PORT = process.env.PORT || 8080;
const UPLOADS_DIR = path.join(__dirname, "uploads");
const IS_PROD = process.env.NODE_ENV === "production";
const ADMIN_LOGIN = String(process.env.ADMIN_LOGIN || "admin");
const ADMIN_PASSWORD = "admin";
const ADMIN_PASSWORD_HASH = "";
const SESSION_SECRET = String(
  process.env.SESSION_SECRET || "change_this_session_secret_for_production"
);
const CLOUDINARY_CLOUD_NAME = String(process.env.CLOUDINARY_CLOUD_NAME || "");
const CLOUDINARY_API_KEY = String(process.env.CLOUDINARY_API_KEY || "");
const CLOUDINARY_API_SECRET = String(process.env.CLOUDINARY_API_SECRET || "");

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

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
} else {
  console.info("INFO: Cloudinary is not configured. Image uploads are stored locally in /uploads.");
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
  const protectedStatic = ["/admin", "/admin.html", "/js/admin.js", "/css/admin.css"].includes(req.path);
  if (!protectedStatic) return next();
  if (req.session?.isAdmin === true) return next();
  return res.redirect("/admin-login.html");
});
app.get("/admin", (_req, res) => res.sendFile(path.join(__dirname, "admin.html")));
app.use(express.static(__dirname));
if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });
app.use("/uploads", express.static(UPLOADS_DIR));

async function verifyAdminPassword(rawPassword) {
  const raw = String(rawPassword || "");
  if (raw === "admin") return true;
  if (ADMIN_PASSWORD_HASH) return bcrypt.compare(raw, ADMIN_PASSWORD_HASH);
  return raw === ADMIN_PASSWORD;
}

function requireAdminApi(req, res, next) {
  if (req.session?.isAdmin === true) return next();
  return res.status(401).json({ error: "Unauthorized" });
}

function nowIso() {
  return new Date().toISOString();
}

function toNum(v, fallback = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

// Map DB row → product object
function rowToProduct(r) {
  return {
    id: r.id,
    name: r.name,
    category: r.category,
    sale: r.sale,
    price: parseFloat(r.price),
    oldPrice: parseFloat(r.old_price),
    priceUsd: parseFloat(r.price_usd),
    oldPriceUsd: parseFloat(r.old_price_usd),
    stock: r.stock,
    sizes: r.sizes,
    colors: r.colors,
    stockBySizes: r.stock_by_sizes || null,
    image: r.image,
    description: r.description,
    composition: r.composition,
    care: r.care,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

function rowToOrder(r) {
  return {
    id: r.id,
    customerName: r.customer_name,
    phone: r.phone,
    email: r.email,
    address: r.address,
    comment: r.comment,
    status: r.status,
    delivery: r.delivery,
    deliveryLabel: r.delivery_label,
    deliveryCost: parseFloat(r.delivery_cost),
    payment: r.payment,
    paymentLabel: r.payment_label,
    paymentStatus: r.payment_status,
    items: r.items,
    promoCode: r.promo_code,
    promoApplied: r.promo_applied || null,
    subtotal: parseFloat(r.subtotal),
    discountAmount: parseFloat(r.discount_amount),
    total: parseFloat(r.total),
    _stockRestored: r.stock_restored,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

function rowToPromo(r) {
  return {
    id: r.id,
    code: r.code,
    type: r.type,
    value: parseFloat(r.value),
    active: r.active,
    createdAt: r.created_at,
  };
}

const upload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, UPLOADS_DIR),
    filename: (_req, file, cb) => {
      const ext = path.extname(file.originalname || "").toLowerCase() || ".jpg";
      const safeExt = [".jpg", ".jpeg", ".png", ".webp", ".gif"].includes(ext) ? ext : ".jpg";
      cb(null, `${Date.now()}-${Math.round(Math.random() * 1e9)}${safeExt}`);
    },
  }),
  limits: { fileSize: 5 * 1024 * 1024 },
});

// ===== AUTH =====

app.post("/api/admin/login", async (req, res) => {
  const { login, password } = req.body || {};
  if (String(login) !== ADMIN_LOGIN) return res.status(401).json({ error: "Invalid credentials" });
  const ok = await verifyAdminPassword(password);
  if (!ok) return res.status(401).json({ error: "Invalid credentials" });
  req.session.isAdmin = true;
  res.json({ ok: true });
});

app.post("/api/admin/logout", (req, res) => {
  req.session.destroy(() => res.json({ ok: true }));
});

app.get("/api/admin/me", (req, res) => {
  res.json({ isAdmin: req.session?.isAdmin === true });
});

// ===== PRODUCTS =====

app.get("/api/products", async (_req, res) => {
  try {
    const { rows } = await pool.query("SELECT * FROM products ORDER BY id");
    res.json(rows.map(rowToProduct));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get("/api/products/:id", async (req, res) => {
  try {
    const { rows } = await pool.query("SELECT * FROM products WHERE id = $1", [req.params.id]);
    if (!rows.length) return res.status(404).json({ error: "Product not found" });
    res.json(rowToProduct(rows[0]));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
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
    }
  }
  return res.status(201).json({ url: `/uploads/${req.file.filename}` });
});

app.post("/api/products", requireAdminApi, async (req, res) => {
  const body = req.body || {};
  if (!body.name || !String(body.name).trim()) return res.status(400).json({ error: "name is required" });
  const sizes = Array.isArray(body.sizes)
    ? body.sizes.map(String).filter(Boolean)
    : String(body.sizes || "").split(",").map((s) => s.trim()).filter(Boolean);
  const colors = Array.isArray(body.colors)
    ? body.colors.map(String).filter(Boolean)
    : String(body.colors || "").split(",").map((s) => s.trim()).filter(Boolean);
  try {
    const { rows } = await pool.query(
      `INSERT INTO products
        (name, category, sale, price, old_price, price_usd, old_price_usd,
         stock, sizes, colors, image, description, composition, care, created_at, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,NOW(),NOW())
       RETURNING *`,
      [
        String(body.name).trim(),
        String(body.category || "other"),
        body.sale === true || String(body.sale) === "true",
        Math.max(0, toNum(body.price, 0)),
        Math.max(0, toNum(body.oldPrice, 0)),
        Math.max(0, toNum(body.priceUsd, 0)),
        Math.max(0, toNum(body.oldPriceUsd, 0)),
        Math.max(0, toNum(body.stock, 0)),
        JSON.stringify(sizes),
        JSON.stringify(colors),
        String(body.image || ""),
        String(body.description || ""),
        String(body.composition || ""),
        String(body.care || ""),
      ]
    );
    res.status(201).json(rowToProduct(rows[0]));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put("/api/products/:id", requireAdminApi, async (req, res) => {
  const body = req.body || {};
  try {
    const { rows: existing } = await pool.query("SELECT * FROM products WHERE id = $1", [req.params.id]);
    if (!existing.length) return res.status(404).json({ error: "Product not found" });
    const p = existing[0];

    const name = body.name !== undefined ? String(body.name).trim() : p.name;
    const category = body.category !== undefined ? String(body.category) : p.category;
    const sale = body.sale !== undefined ? (body.sale === true || String(body.sale) === "true") : p.sale;
    const price = body.price !== undefined ? Math.max(0, toNum(body.price, 0)) : p.price;
    const oldPrice = body.oldPrice !== undefined ? Math.max(0, toNum(body.oldPrice, 0)) : p.old_price;
    const priceUsd = body.priceUsd !== undefined ? Math.max(0, toNum(body.priceUsd, 0)) : p.price_usd;
    const oldPriceUsd = body.oldPriceUsd !== undefined ? Math.max(0, toNum(body.oldPriceUsd, 0)) : p.old_price_usd;
    const stock = body.stock !== undefined ? Math.max(0, toNum(body.stock, 0)) : p.stock;
    const sizes = body.sizes !== undefined
      ? (Array.isArray(body.sizes) ? body.sizes.map(String).filter(Boolean) : String(body.sizes).split(",").map((s) => s.trim()).filter(Boolean))
      : p.sizes;
    const colors = body.colors !== undefined
      ? (Array.isArray(body.colors) ? body.colors.map(String).filter(Boolean) : String(body.colors).split(",").map((s) => s.trim()).filter(Boolean))
      : p.colors;
    const image = body.image !== undefined ? String(body.image || "") : p.image;
    const description = body.description !== undefined ? String(body.description || "") : p.description;
    const composition = body.composition !== undefined ? String(body.composition || "") : p.composition;
    const care = body.care !== undefined ? String(body.care || "") : p.care;

    const { rows } = await pool.query(
      `UPDATE products SET name=$1, category=$2, sale=$3, price=$4, old_price=$5,
       price_usd=$6, old_price_usd=$7, stock=$8, sizes=$9, colors=$10,
       image=$11, description=$12, composition=$13, care=$14, updated_at=NOW()
       WHERE id=$15 RETURNING *`,
      [name, category, sale, price, oldPrice, priceUsd, oldPriceUsd, stock,
       JSON.stringify(sizes), JSON.stringify(colors), image, description, composition, care, req.params.id]
    );
    res.json(rowToProduct(rows[0]));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete("/api/products/:id", requireAdminApi, async (req, res) => {
  try {
    const { rowCount } = await pool.query("DELETE FROM products WHERE id = $1", [req.params.id]);
    if (!rowCount) return res.status(404).json({ error: "Product not found" });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ===== INVENTORY =====

app.get("/api/inventory", requireAdminApi, async (_req, res) => {
  try {
    const [{ rows: products }, { rows: logs }] = await Promise.all([
      pool.query("SELECT * FROM products ORDER BY id"),
      pool.query("SELECT * FROM inventory_logs ORDER BY id DESC LIMIT 50"),
    ]);
    res.json({
      products: products.map((p) => ({
        id: p.id, name: p.name, stock: p.stock, category: p.category,
        sale: !!p.sale, sizes: p.sizes || [], stockBySizes: p.stock_by_sizes || null,
      })),
      logs: logs.map((l) => ({
        id: l.id, productId: l.product_id, qty: l.qty,
        type: l.type, note: l.note, createdAt: l.created_at,
      })),
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/inventory/delivery", requireAdminApi, async (req, res) => {
  const { productId, qty, note } = req.body || {};
  const q = Math.max(1, toNum(qty, 0));
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const { rows } = await client.query("SELECT * FROM products WHERE id = $1", [productId]);
    if (!rows.length) { await client.query("ROLLBACK"); return res.status(404).json({ error: "Product not found" }); }
    const newStock = Math.max(0, toNum(rows[0].stock, 0) + q);
    await client.query("UPDATE products SET stock = $1, updated_at = NOW() WHERE id = $2", [newStock, productId]);
    const { rows: logRows } = await client.query(
      "INSERT INTO inventory_logs (product_id, qty, type, note) VALUES ($1,$2,'delivery',$3) RETURNING *",
      [productId, q, String(note || "")]
    );
    await client.query("COMMIT");
    const updated = { ...rows[0], stock: newStock };
    res.status(201).json({ ok: true, product: rowToProduct(updated), log: logRows[0] });
  } catch (err) {
    await client.query("ROLLBACK");
    res.status(500).json({ error: err.message });
  } finally {
    client.release();
  }
});

app.put("/api/products/:id/stock-by-sizes", requireAdminApi, async (req, res) => {
  const stockBySizes = req.body?.stockBySizes;
  if (!stockBySizes || typeof stockBySizes !== "object") return res.status(400).json({ error: "Invalid stockBySizes" });
  const normalized = {};
  for (const [size, qty] of Object.entries(stockBySizes)) {
    normalized[size] = Math.max(0, toNum(qty, 0));
  }
  const totalStock = Object.values(normalized).reduce((a, b) => a + b, 0);
  try {
    const { rows } = await pool.query(
      "UPDATE products SET stock_by_sizes=$1, stock=$2, updated_at=NOW() WHERE id=$3 RETURNING *",
      [JSON.stringify(normalized), totalStock, req.params.id]
    );
    if (!rows.length) return res.status(404).json({ error: "Product not found" });
    res.json({ ok: true, product: rowToProduct(rows[0]) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/admin/generate-stock", requireAdminApi, async (_req, res) => {
  const client = await pool.connect();
  try {
    const { rows: products } = await client.query("SELECT * FROM products");
    for (const p of products) {
      const sizes = (p.sizes && p.sizes.length > 0) ? p.sizes : ["ONE SIZE"];
      const stockBySizes = {};
      sizes.forEach((size) => { stockBySizes[size] = Math.floor(Math.random() * 28) + 3; });
      const totalStock = Object.values(stockBySizes).reduce((a, b) => a + b, 0);
      await client.query(
        "UPDATE products SET stock_by_sizes=$1, stock=$2, updated_at=NOW() WHERE id=$3",
        [JSON.stringify(stockBySizes), totalStock, p.id]
      );
    }
    res.json({ ok: true, count: products.length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  } finally {
    client.release();
  }
});

// ===== ORDERS =====

app.get("/api/orders", requireAdminApi, async (_req, res) => {
  try {
    const { rows } = await pool.query("SELECT * FROM orders ORDER BY created_at DESC");
    const orders = rows.map((o) => {
      const mapped = rowToOrder(o);
      const isCash = mapped.payment === "receipt";
      const isPaid = mapped.paymentStatus === "succeeded";
      return { ...mapped, paymentConfirmed: isCash || isPaid };
    });
    res.json(orders);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put("/api/orders/:id/mark-paid", requireAdminApi, async (req, res) => {
  try {
    const { rows } = await pool.query(
      `UPDATE orders SET payment_status='succeeded',
       status = CASE WHEN status = 'new' THEN 'processing' ELSE status END,
       updated_at=NOW() WHERE id=$1 RETURNING *`,
      [req.params.id]
    );
    if (!rows.length) return res.status(404).json({ error: "Order not found" });
    res.json({ ok: true, order: rowToOrder(rows[0]) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put("/api/orders/:id/status", requireAdminApi, async (req, res) => {
  const newStatus = String(req.body?.status || "new");
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const { rows } = await client.query("SELECT * FROM orders WHERE id=$1", [req.params.id]);
    if (!rows.length) { await client.query("ROLLBACK"); return res.status(404).json({ error: "Order not found" }); }
    const order = rows[0];
    if (newStatus === "cancelled" && order.status !== "cancelled" && !order.stock_restored) {
      for (const item of (order.items || [])) {
        const size = item.size || "";
        const { rows: pRows } = await client.query("SELECT * FROM products WHERE id=$1", [item.productId]);
        if (!pRows.length) continue;
        const product = pRows[0];
        if (product.stock_by_sizes && size && product.stock_by_sizes[size] !== undefined) {
          const updated = { ...product.stock_by_sizes, [size]: toNum(product.stock_by_sizes[size], 0) + toNum(item.qty, 0) };
          const totalStock = Object.values(updated).reduce((a, b) => a + b, 0);
          await client.query("UPDATE products SET stock_by_sizes=$1, stock=$2, updated_at=NOW() WHERE id=$3",
            [JSON.stringify(updated), totalStock, item.productId]);
        } else {
          await client.query("UPDATE products SET stock = stock + $1, updated_at=NOW() WHERE id=$2",
            [toNum(item.qty, 0), item.productId]);
        }
      }
      await client.query("UPDATE orders SET stock_restored=TRUE WHERE id=$1", [req.params.id]);
    }
    const { rows: updated } = await client.query(
      "UPDATE orders SET status=$1, updated_at=NOW() WHERE id=$2 RETURNING *",
      [newStatus, req.params.id]
    );
    await client.query("COMMIT");
    res.json(rowToOrder(updated[0]));
  } catch (err) {
    await client.query("ROLLBACK");
    res.status(500).json({ error: err.message });
  } finally {
    client.release();
  }
});

app.delete("/api/orders/:id", requireAdminApi, async (req, res) => {
  try {
    const { rowCount } = await pool.query("DELETE FROM orders WHERE id=$1", [req.params.id]);
    if (!rowCount) return res.status(404).json({ error: "Order not found" });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/orders", async (req, res) => {
  const body = req.body || {};
  if (!body.customerName || !body.address || !Array.isArray(body.items) || !body.items.length) {
    return res.status(400).json({ error: "customerName, address, items are required" });
  }

  const DELIVERY_OPTIONS = {
    pickup: { label: "Самовывоз", cost: 0 },
    courier: { label: "Курьер", cost: 500 },
    cdek: { label: "СДЭК / ПВЗ", cost: 350 },
  };
  const PAYMENT_OPTIONS = { card: "ЮKassa" };

  const deliveryKey = String(body.delivery || "pickup");
  const deliveryInfo = DELIVERY_OPTIONS[deliveryKey] || DELIVERY_OPTIONS.pickup;
  const paymentKey = String(body.payment || "card");
  const paymentLabel = PAYMENT_OPTIONS[paymentKey] || paymentKey;

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const normalizedItems = [];
    let subtotal = 0;

    for (const item of body.items) {
      const { rows: pRows } = await client.query("SELECT * FROM products WHERE id=$1", [item.productId]);
      if (!pRows.length) { await client.query("ROLLBACK"); return res.status(400).json({ error: `Product ${item.productId} not found` }); }
      const product = pRows[0];
      const qty = Math.max(1, toNum(item.qty, 1));
      const size = String(item.size || "");

      if (product.stock_by_sizes && size && product.stock_by_sizes[size] !== undefined) {
        if (product.stock_by_sizes[size] < qty) {
          await client.query("ROLLBACK");
          return res.status(400).json({ error: `Not enough stock for ${product.name} (${size})` });
        }
        const updated = { ...product.stock_by_sizes, [size]: product.stock_by_sizes[size] - qty };
        const totalStock = Object.values(updated).reduce((a, b) => a + b, 0);
        await client.query("UPDATE products SET stock_by_sizes=$1, stock=$2, updated_at=NOW() WHERE id=$3",
          [JSON.stringify(updated), totalStock, product.id]);
      } else {
        if (product.stock < qty) {
          await client.query("ROLLBACK");
          return res.status(400).json({ error: `Not enough stock for ${product.name}` });
        }
        await client.query("UPDATE products SET stock = stock - $1, updated_at=NOW() WHERE id=$2", [qty, product.id]);
      }

      normalizedItems.push({ productId: product.id, productName: product.name, size, qty, price: parseFloat(product.price) });
      subtotal += qty * parseFloat(product.price);
    }

    // Promo code
    const promoCode = String(body.promoCode || "").trim().toUpperCase();
    let promoApplied = null;
    let discountAmount = 0;
    if (promoCode) {
      const { rows: promoRows } = await client.query(
        "SELECT * FROM promo_codes WHERE code=$1 AND active=TRUE", [promoCode]
      );
      if (!promoRows.length) { await client.query("ROLLBACK"); return res.status(400).json({ error: "Promo code not found or inactive" }); }
      const promo = promoRows[0];
      if (promo.type === "percent") {
        discountAmount = Math.round((subtotal * Math.min(100, parseFloat(promo.value))) / 100);
      } else {
        discountAmount = Math.min(subtotal, parseFloat(promo.value));
      }
      promoApplied = { id: promo.id, code: promo.code, type: promo.type, value: parseFloat(promo.value) };
    }

    const deliveryCost = toNum(body.deliveryCost, deliveryInfo.cost);
    const total = Math.max(0, subtotal - discountAmount) + deliveryCost;

    const { rows: orderRows } = await client.query(
      `INSERT INTO orders
        (customer_name, phone, email, address, comment, status, delivery, delivery_label,
         delivery_cost, payment, payment_label, payment_status, items, promo_code, promo_applied,
         subtotal, discount_amount, total, created_at, updated_at)
       VALUES ($1,$2,$3,$4,$5,'new',$6,$7,$8,$9,$10,'pending',$11,$12,$13,$14,$15,$16,NOW(),NOW())
       RETURNING *`,
      [
        String(body.customerName), String(body.phone || ""), String(body.email || ""),
        String(body.address), String(body.comment || ""),
        deliveryKey, String(body.deliveryLabel || deliveryInfo.label), deliveryCost,
        paymentKey, paymentLabel,
        JSON.stringify(normalizedItems),
        promoApplied ? promoApplied.code : "",
        promoApplied ? JSON.stringify(promoApplied) : null,
        subtotal, discountAmount, total,
      ]
    );

    await client.query("COMMIT");
    res.status(201).json(rowToOrder(orderRows[0]));
  } catch (err) {
    await client.query("ROLLBACK");
    res.status(500).json({ error: err.message });
  } finally {
    client.release();
  }
});

// ===== PROMO CODES =====

app.get("/api/promocodes", async (_req, res) => {
  try {
    const { rows } = await pool.query("SELECT * FROM promo_codes ORDER BY id");
    res.json(rows.map(rowToPromo));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/promocodes", requireAdminApi, async (req, res) => {
  const body = req.body || {};
  const code = String(body.code || "").trim().toUpperCase();
  const type = String(body.type || "percent");
  const value = Math.max(0, toNum(body.value, 0));
  const active = body.active !== false;

  if (!code) return res.status(400).json({ error: "code is required" });
  if (!["percent", "fixed"].includes(type)) return res.status(400).json({ error: "type must be percent or fixed" });

  try {
    const { rows } = await pool.query(
      "INSERT INTO promo_codes (code, type, value, active) VALUES ($1,$2,$3,$4) RETURNING *",
      [code, type, value, active]
    );
    res.status(201).json(rowToPromo(rows[0]));
  } catch (err) {
    if (err.code === "23505") return res.status(400).json({ error: "Promo code already exists" });
    res.status(500).json({ error: err.message });
  }
});

app.delete("/api/promocodes/:id", requireAdminApi, async (req, res) => {
  try {
    const { rowCount } = await pool.query("DELETE FROM promo_codes WHERE id=$1", [req.params.id]);
    if (!rowCount) return res.status(404).json({ error: "Promo code not found" });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ===== ANALYTICS =====

app.get("/api/analytics", requireAdminApi, async (_req, res) => {
  try {
    const [{ rows: orders }, { rows: products }] = await Promise.all([
      pool.query("SELECT * FROM orders"),
      pool.query("SELECT * FROM products"),
    ]);

    const paidOrders = orders.filter((o) => o.payment === "receipt" || o.payment_status === "succeeded");
    const byDayMap = new Map();
    const salesByProduct = new Map();
    const byCategory = new Map();
    const byDelivery = new Map();
    const byPayment = new Map();
    const byStatus = { new: 0, processing: 0, shipped: 0, done: 0, cancelled: 0 };
    let totalRevenue = 0, totalDiscounts = 0, ordersWithPromo = 0, totalItemsSold = 0;

    for (const o of paidOrders) {
      const orderTotal = toNum(o.total, 0);
      totalRevenue += orderTotal;
      totalDiscounts += toNum(o.discount_amount, 0);
      if (o.promo_code) ordersWithPromo++;
      const items = o.items || [];
      totalItemsSold += items.reduce((s, it) => s + toNum(it.qty, 0), 0);

      const st = String(o.status || "new");
      if (byStatus[st] !== undefined) byStatus[st]++; else byStatus[st] = 1;

      const dlv = String(o.delivery_label || o.delivery || "—");
      byDelivery.set(dlv, (byDelivery.get(dlv) || 0) + 1);

      const pay = String(o.payment_label || o.payment || "—");
      byPayment.set(pay, (byPayment.get(pay) || 0) + 1);

      const day = String(o.created_at || "").slice(0, 10);
      byDayMap.set(day, (byDayMap.get(day) || 0) + orderTotal);

      for (const it of items) {
        const qty = toNum(it.qty, 0);
        const revenue = qty * toNum(it.price, 0);
        const prev = salesByProduct.get(it.productId) || { productId: it.productId, productName: it.productName, qty: 0, revenue: 0 };
        prev.qty += qty;
        prev.revenue += revenue;
        salesByProduct.set(it.productId, prev);

        const product = products.find((p) => String(p.id) === String(it.productId));
        const cat = (product && product.category) || "other";
        const prevCat = byCategory.get(cat) || { category: cat, qty: 0, revenue: 0 };
        prevCat.qty += qty;
        prevCat.revenue += revenue;
        byCategory.set(cat, prevCat);
      }
    }

    const totalStock = products.reduce((s, p) => s + toNum(p.stock, 0), 0);
    const allSales = Array.from(salesByProduct.values());

    res.json({
      totalOrders: paidOrders.length,
      totalProducts: products.length,
      totalRevenue,
      totalDiscounts,
      avgOrderValue: paidOrders.length ? Math.round(totalRevenue / paidOrders.length) : 0,
      ordersWithPromo,
      totalItemsSold,
      totalStock,
      byDay: Array.from(byDayMap.entries()).map(([date, revenue]) => ({ date, revenue })).sort((a, b) => (a.date > b.date ? 1 : -1)),
      byStatus,
      byCategory: Array.from(byCategory.values()).sort((a, b) => b.revenue - a.revenue),
      byDelivery: Array.from(byDelivery.entries()).map(([method, count]) => ({ method, count })),
      byPayment: Array.from(byPayment.entries()).map(([method, count]) => ({ method, count })),
      topByQty: allSales.sort((a, b) => b.qty - a.qty).slice(0, 10),
      topByRevenue: [...allSales].sort((a, b) => b.revenue - a.revenue).slice(0, 10),
      lowStockProducts: products.filter((p) => toNum(p.stock, 0) <= 5).map((p) => ({ id: p.id, name: p.name, stock: p.stock, category: p.category })),
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ===== DASHBOARD (all-in-one) =====

app.get("/api/admin/dashboard", requireAdminApi, async (_req, res) => {
  try {
    const [{ rows: products }, { rows: orders }, { rows: promos }, { rows: logs }] = await Promise.all([
      pool.query("SELECT * FROM products ORDER BY id"),
      pool.query("SELECT * FROM orders ORDER BY created_at DESC"),
      pool.query("SELECT * FROM promo_codes ORDER BY id"),
      pool.query("SELECT * FROM inventory_logs ORDER BY id DESC LIMIT 50"),
    ]);

    const paidOrders = orders.filter((o) => o.payment === "receipt" || o.payment_status === "succeeded");
    const salesByProduct = new Map();
    let totalRevenue = 0, totalDiscounts = 0, ordersWithPromo = 0, totalItemsSold = 0;
    const byDayMap = new Map();
    const byCategory = new Map();
    const byDelivery = new Map();
    const byPayment = new Map();
    const byStatus = { new: 0, processing: 0, shipped: 0, done: 0, cancelled: 0 };

    for (const o of paidOrders) {
      const orderTotal = toNum(o.total, 0);
      totalRevenue += orderTotal;
      totalDiscounts += toNum(o.discount_amount, 0);
      if (o.promo_code) ordersWithPromo++;
      const items = o.items || [];
      totalItemsSold += items.reduce((s, it) => s + toNum(it.qty, 0), 0);
      const st = String(o.status || "new");
      if (byStatus[st] !== undefined) byStatus[st]++; else byStatus[st] = 1;
      byDelivery.set(String(o.delivery_label || o.delivery || "—"), (byDelivery.get(String(o.delivery_label || o.delivery || "—")) || 0) + 1);
      byPayment.set(String(o.payment_label || o.payment || "—"), (byPayment.get(String(o.payment_label || o.payment || "—")) || 0) + 1);
      byDayMap.set(String(o.created_at || "").slice(0, 10), (byDayMap.get(String(o.created_at || "").slice(0, 10)) || 0) + orderTotal);
      for (const it of items) {
        const qty = toNum(it.qty, 0);
        const revenue = qty * toNum(it.price, 0);
        const prev = salesByProduct.get(it.productId) || { productId: it.productId, productName: it.productName, qty: 0, revenue: 0 };
        prev.qty += qty; prev.revenue += revenue;
        salesByProduct.set(it.productId, prev);
        const product = products.find((p) => String(p.id) === String(it.productId));
        const cat = (product && product.category) || "other";
        const prevCat = byCategory.get(cat) || { category: cat, qty: 0, revenue: 0 };
        prevCat.qty += qty; prevCat.revenue += revenue;
        byCategory.set(cat, prevCat);
      }
    }

    const allSales = Array.from(salesByProduct.values());
    const mappedOrders = orders.map((o) => {
      const mapped = rowToOrder(o);
      return { ...mapped, paymentConfirmed: mapped.payment === "receipt" || mapped.paymentStatus === "succeeded" };
    });

    res.json({
      products: products.map(rowToProduct),
      inventory: {
        products: products.map((p) => ({ id: p.id, name: p.name, stock: p.stock, category: p.category, sale: !!p.sale, sizes: p.sizes || [], stockBySizes: p.stock_by_sizes || null })),
        logs: logs.map((l) => ({ id: l.id, productId: l.product_id, qty: l.qty, type: l.type, note: l.note, createdAt: l.created_at })),
      },
      orders: mappedOrders,
      promos: promos.map(rowToPromo),
      analytics: {
        totalOrders: paidOrders.length,
        totalProducts: products.length,
        totalRevenue,
        totalDiscounts,
        avgOrderValue: paidOrders.length ? Math.round(totalRevenue / paidOrders.length) : 0,
        ordersWithPromo,
        totalItemsSold,
        totalStock: products.reduce((s, p) => s + toNum(p.stock, 0), 0),
        byDay: Array.from(byDayMap.entries()).map(([date, revenue]) => ({ date, revenue })).sort((a, b) => (a.date > b.date ? 1 : -1)),
        byStatus,
        byCategory: Array.from(byCategory.values()).sort((a, b) => b.revenue - a.revenue),
        byDelivery: Array.from(byDelivery.entries()).map(([method, count]) => ({ method, count })),
        byPayment: Array.from(byPayment.entries()).map(([method, count]) => ({ method, count })),
        topByQty: allSales.sort((a, b) => b.qty - a.qty).slice(0, 10),
        topByRevenue: [...allSales].sort((a, b) => b.revenue - a.revenue).slice(0, 10),
        lowStockProducts: products.filter((p) => toNum(p.stock, 0) <= 5).map((p) => ({ id: p.id, name: p.name, stock: p.stock, category: p.category })),
      },
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ===== UI SETTINGS =====

app.get("/api/ui-settings", async (_req, res) => {
  try {
    const { rows } = await pool.query("SELECT key, value FROM ui_settings");
    const settings = {};
    for (const row of rows) settings[row.key] = row.value;
    res.json(settings);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put("/api/ui-settings", requireAdminApi, async (req, res) => {
  const body = req.body || {};
  try {
    for (const [key, value] of Object.entries(body)) {
      await pool.query(
        "INSERT INTO ui_settings (key, value) VALUES ($1,$2) ON CONFLICT (key) DO UPDATE SET value=EXCLUDED.value",
        [key, JSON.stringify(value)]
      );
    }
    const { rows } = await pool.query("SELECT key, value FROM ui_settings");
    const settings = {};
    for (const row of rows) settings[row.key] = row.value;
    res.json(settings);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ===== PARSE VITRINE (admin simulation) =====

app.post("/api/admin/parse-vitrine", requireAdminApi, async (req, res) => {
  const body = req.body || {};
  const requestCount = Math.min(50, Math.max(1, toNum(body.count, 10)));
  const forceAdd = body.force === true || body.force === "true";

  const { rows: existingProducts } = await pool.query("SELECT name FROM products");
  const existingNames = new Set(existingProducts.map((p) => String(p.name).toLowerCase().trim()));

  function prettyUsd(rubPrice) {
    if (!rubPrice || rubPrice <= 0) return 0;
    const raw = rubPrice / 90;
    const tiers = [9, 12, 15, 18, 19, 24, 29, 34, 39, 44, 49, 59, 69, 79, 89, 99, 119, 139, 149, 179, 199, 229, 249, 299, 349, 399, 449, 499, 549, 599, 699, 799, 899, 999];
    let closest = tiers[0], diff = Math.abs(raw - tiers[0]);
    for (const t of tiers) { const d = Math.abs(raw - t); if (d < diff) { diff = d; closest = t; } }
    return closest;
  }

  function randInt(min, max) { return Math.floor(Math.random() * (max - min + 1)) + min; }
  function shuffle(arr) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
    return a;
  }

  const DEMO_CATALOG = [
    { name: "Рубашка оверсайз хлопок", price: 5900, category: "mens", sizes: ["S","M","L","XL"], colors: ["Белый","Черный"], description: "Свободная рубашка из плотного хлопка.", composition: "100% хлопок", care: "Стирка при 40°C", image: "https://vitrine.market/images/items/aa804b5a912053202fbba941de9bec77.webp" },
    { name: "Куртка бомбер тёмная", price: 14500, oldPrice: 18000, category: "mens", sale: true, sizes: ["S","M","L"], colors: ["Черный"], description: "Классический бомбер с рибом-манжетами.", composition: "100% нейлон", care: "Химчистка", image: "https://vitrine.market/images/items/96b5a2988e090058e63c96068620b544.webp" },
    { name: "Свитер объёмный шерсть", price: 9800, category: "mens", sizes: ["S","M","L","XL"], colors: ["Серый","Черный"], description: "Вязаный свитер крупной вязки.", composition: "100% шерсть", care: "Ручная стирка", image: "https://vitrine.market/images/items/7b7dba89c6b760f3c1afa4076eb27647.webp" },
    { name: "Брюки со складками и стрелками", price: 8400, category: "womens", sizes: ["XS","S","M","L"], colors: ["Черный","Серый"], description: "Классические брюки со стрелками.", composition: "65% полиэстер, 35% вискоза", care: "Химчистка", image: "https://vitrine.market/images/items/8de3c6454685f33add36b9ae947d51a1.webp" },
    { name: "Кардиган длинный вязаный", price: 7600, category: "unisex", sizes: ["S","M","L","XL"], colors: ["Бежевый","Черный","Серый"], description: "Длинный кардиган rib-вязки.", composition: "50% шерсть, 50% акрил", care: "Ручная стирка", image: "https://vitrine.market/images/items/cc4535d05a8cec4970b215a509c2a4f5.webp" },
    { name: "Шорты-бермуды технические", price: 5800, category: "mens", sizes: ["S","M","L","XL"], colors: ["Черный","Оливковый"], description: "Шорты длиной до колена с карманами.", composition: "100% полиэстер", care: "Стирка при 30°C", image: "https://vitrine.market/images/items/adbec54eabb49b8dbb62f1ba9c8f0a3a.webp" },
    { name: "Платье-рубашка midi", price: 11500, category: "womens", sizes: ["XS","S","M","L"], colors: ["Черный","Белый"], description: "Платье-рубашка свободного кроя.", composition: "100% хлопок", care: "Стирка при 30°C", image: "https://vitrine.market/images/items/cebd3d2639cc1ae91f7c5313de13f1c5.webp" },
    { name: "Жилет стёганый утеплённый", price: 7200, category: "unisex", sizes: ["XS","S","M","L","XL"], colors: ["Черный","Тёмно-зелёный"], description: "Лёгкий утеплённый жилет.", composition: "Нейлон / полиэстер", care: "Стирка при 30°C", image: "https://vitrine.market/images/items/bf1eb1850f93772fae6aef129a63cc0d.webp" },
    { name: "Пальто-кейп без рукавов", price: 22000, oldPrice: 28000, category: "womens", sale: true, sizes: ["XS","S","M"], colors: ["Черный"], description: "Пальто-кейп прямого силуэта.", composition: "80% шерсть, 20% полиэстер", care: "Химчистка", image: "https://vitrine.market/images/items/394ce0bfb6a90e0ea5c5e524eaf53642.webp" },
    { name: "Лонгслив технический zip", price: 6500, category: "mens", sizes: ["S","M","L","XL"], colors: ["Черный"], description: "Технический лонгслив с молнией на груди.", composition: "92% полиэстер, 8% эластан", care: "Стирка при 30°C", image: "https://vitrine.market/images/items/56087180a8857d097d2fd48486ea1136.webp" },
    { name: "Мини-юбка кожаная", price: 9200, oldPrice: 11500, category: "womens", sale: true, sizes: ["XS","S","M","L"], colors: ["Черный"], description: "Мини-юбка из экокожи с боковой молнией.", composition: "100% полиуретан", care: "Протирать влажной тряпкой", image: "https://vitrine.market/images/items/4c493718d2e54b401f4f1979687e797d.webp" },
    { name: "Парка тактическая тёмная", price: 19800, category: "mens", sizes: ["S","M","L","XL","XXL"], colors: ["Черный","Тёмно-оливковый"], description: "Парка с множеством карманов.", composition: "100% нейлон", care: "Стирка при 30°C", image: "https://vitrine.market/images/items/c6161c3c44174b06228cbecc56e75ccd.webp" },
    { name: "Борсетка кожаная матовая", price: 5600, category: "accessories", sizes: ["ONE SIZE"], colors: ["Черный"], description: "Борсетка из матовой кожи.", composition: "Натуральная кожа", care: "Протирать влажной тряпкой", image: "https://vitrine.market/images/items/6418a7048b365774d7eb07bb4fc1eadb.webp" },
    { name: "Джоггеры карго широкие", price: 8900, category: "unisex", sizes: ["XS","S","M","L","XL"], colors: ["Черный","Графит"], description: "Широкие джоггеры с накладными карманами.", composition: "60% хлопок, 40% полиэстер", care: "Стирка при 40°C", image: "https://vitrine.market/images/items/0e0ac0a78891fb70a3dff26233edd907.webp" },
    { name: "Ветровка оверсайз лёгкая", price: 6400, category: "unisex", sizes: ["S","M","L","XL"], colors: ["Черный","Тёмно-синий"], description: "Лёгкая ветровка с упаковочным чехлом.", composition: "100% нейлон", care: "Стирка при 30°C", image: "https://vitrine.market/images/items/d37083be22c12e1dd239cbd06345f1c5.webp" },
    { name: "Трикотажный костюм двойка", price: 16800, oldPrice: 21000, category: "unisex", sale: true, sizes: ["XS","S","M","L","XL"], colors: ["Черный","Серый"], description: "Мягкий трикотажный костюм.", composition: "95% хлопок, 5% эластан", care: "Стирка при 30°C", image: "https://vitrine.market/images/items/c7d23b1bf87346a0d51a20c41d8ea5dd.webp" },
    { name: "Рюкзак городской минимал", price: 11200, category: "accessories", sizes: ["ONE SIZE"], colors: ["Черный"], description: "Компактный рюкзак с отделом для ноутбука.", composition: "Нейлон 600D", care: "Протирать влажной тряпкой", image: "https://vitrine.market/images/items/1514e768e10a8cce0e9e5dbdbcf55f2c.webp" },
    { name: "Дождевик нейлоновый капсула", price: 5200, category: "unisex", sizes: ["S","M","L","XL"], colors: ["Черный","Тёмно-зелёный"], description: "Складной дождевик с проклеенными швами.", composition: "100% нейлон", care: "Стирка при 30°C", image: "https://vitrine.market/images/items/80b490fdb84d60c0f6aee812e29d5a65.webp" },
    { name: "Водолазка трикотажная тонкая", price: 4800, category: "unisex", sizes: ["XS","S","M","L","XL"], colors: ["Черный","Белый","Серый"], description: "Тонкая водолазка из трикотажа.", composition: "80% вискоза, 20% нейлон", care: "Стирка при 30°C", image: "https://vitrine.market/images/items/f18562feb4ab8dfbe4ed87de72e0797c.webp" },
    { name: "Куртка пуховик сити", price: 28500, category: "unisex", sizes: ["S","M","L","XL"], colors: ["Черный"], description: "Лёгкий городской пуховик.", composition: "Нейлон / утеплитель 80%пух 20%перо", care: "Химчистка", image: "https://vitrine.market/images/items/e51c45abb0b350e53dc5ac145f1beefd.webp" },
    { name: "Пиджак двубортный тёмный", price: 23500, category: "mens", sizes: ["S","M","L","XL"], colors: ["Черный","Тёмно-серый"], description: "Строгий двубортный пиджак.", composition: "55% шерсть, 45% полиэстер", care: "Химчистка", image: "https://vitrine.market/images/items/2b0248e9f9d609def7d40da1f8b5591d.webp" },
  ];

  const available = forceAdd
    ? DEMO_CATALOG
    : DEMO_CATALOG.filter((p) => !existingNames.has(p.name.toLowerCase().trim()));

  const selected = shuffle(available).slice(0, requestCount);

  const added = [];
  for (const item of selected) {
    const sizes = item.sizes || ["S","M","L"];
    const sale = !!item.sale;
    const price = item.price || 0;
    const oldPrice = item.oldPrice || (sale ? Math.round(price * 1.25) : 0);
    const priceUsd = prettyUsd(price);
    const oldPriceUsd = prettyUsd(oldPrice);
    const stock = sizes.reduce((s) => s + randInt(3, 30), 0);
    const stockBySizes = {};
    sizes.forEach((sz) => { stockBySizes[sz] = randInt(3, 30); });

    try {
      const { rows } = await pool.query(
        `INSERT INTO products
          (name, category, sale, price, old_price, price_usd, old_price_usd,
           stock, sizes, colors, stock_by_sizes, image, description, composition, care, created_at, updated_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,NOW(),NOW())
         RETURNING *`,
        [
          item.name, item.category || "other", sale, price, oldPrice, priceUsd, oldPriceUsd, stock,
          JSON.stringify(sizes), JSON.stringify(item.colors || ["Черный"]),
          JSON.stringify(stockBySizes), item.image || "", item.description || "", item.composition || "", item.care || "",
        ]
      );
      added.push(rowToProduct(rows[0]));
    } catch (e) {
      console.error("Error adding demo product:", e.message);
    }
  }

  res.json({ added: added.length, products: added });
});

// ===== DATABASE VIEWER =====

const DB_READONLY_TABLES = ["products", "inventory_logs", "orders", "promo_codes", "ui_settings"];

app.get("/api/admin/db/tables", requireAdminApi, async (_req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT
        t.table_name,
        (SELECT COUNT(*) FROM information_schema.columns c WHERE c.table_name = t.table_name AND c.table_schema = 'public') AS col_count,
        pg_stat_user_tables.n_live_tup AS row_count
      FROM information_schema.tables t
      LEFT JOIN pg_stat_user_tables ON pg_stat_user_tables.relname = t.table_name
      WHERE t.table_schema = 'public' AND t.table_type = 'BASE TABLE'
      ORDER BY t.table_name
    `);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get("/api/admin/db/schema/:table", requireAdminApi, async (req, res) => {
  const table = req.params.table;
  if (!/^[a-z_]+$/.test(table)) return res.status(400).json({ error: "Invalid table name" });
  try {
    const { rows } = await pool.query(`
      SELECT column_name, data_type, is_nullable, column_default
      FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = $1
      ORDER BY ordinal_position
    `, [table]);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/admin/db/query", requireAdminApi, async (req, res) => {
  const sql = String(req.body?.sql || "").trim();
  if (!sql) return res.status(400).json({ error: "Query is required" });

  const upper = sql.replace(/--[^\n]*/g, "").replace(/\/\*[\s\S]*?\*\//g, "").toUpperCase();
  const forbidden = /\b(INSERT|UPDATE|DELETE|DROP|TRUNCATE|ALTER|CREATE|GRANT|REVOKE|COPY|VACUUM|ANALYZE|REINDEX|CLUSTER|LOCK|CALL|DO)\b/;
  if (forbidden.test(upper)) {
    return res.status(403).json({ error: "Разрешены только SELECT-запросы. Изменение данных через эту панель заблокировано." });
  }

  try {
    const start = Date.now();
    const { rows, fields } = await pool.query(sql);
    const ms = Date.now() - start;
    res.json({
      rows,
      fields: (fields || []).map((f) => f.name),
      count: rows.length,
      ms,
    });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// ===== CLEANUP =====

app.delete("/api/admin/cleanup/products", requireAdminApi, async (_req, res) => {
  try {
    await pool.query("DELETE FROM inventory_logs");
    await pool.query("DELETE FROM order_items_backup WHERE TRUE") .catch(() => {});
    await pool.query("DELETE FROM products");
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete("/api/admin/cleanup/orders", requireAdminApi, async (_req, res) => {
  try {
    await pool.query("DELETE FROM orders");
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete("/api/admin/cleanup/all", requireAdminApi, async (_req, res) => {
  try {
    await pool.query("DELETE FROM orders");
    await pool.query("DELETE FROM inventory_logs");
    await pool.query("DELETE FROM products");
    await pool.query("DELETE FROM promo_codes");
    await pool.query("UPDATE ui_settings SET value='{}' WHERE TRUE");
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ===== PAYMENT (YooKassa stubs) =====

app.post("/api/payment/create", async (req, res) => {
  const { orderId, amount, description, returnUrl } = req.body || {};
  try {
    const YooKassa = require("yookassa");
    const shop_id = process.env.YOOKASSA_SHOP_ID;
    const secret_key = process.env.YOOKASSA_SECRET_KEY;
    if (!shop_id || !secret_key) throw new Error("YooKassa not configured");
    const yookassa = new YooKassa({ shopId: shop_id, secretKey: secret_key });
    const payment = await yookassa.createPayment({
      amount: { value: String(toNum(amount, 0).toFixed(2)), currency: "RUB" },
      capture: true,
      confirmation: { type: "redirect", return_url: returnUrl || process.env.SITE_URL || "https://example.com" },
      description: description || `Заказ #${orderId}`,
      metadata: { orderId: String(orderId) },
    });
    await pool.query("UPDATE orders SET payment_status='pending', updated_at=NOW() WHERE id=$1", [orderId]);
    res.json({ confirmationUrl: payment.confirmation.confirmation_url, paymentId: payment.id });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/payment/webhook", express.json({ type: "*/*" }), async (req, res) => {
  try {
    const event = req.body;
    if (event?.event === "payment.succeeded") {
      const orderId = event?.object?.metadata?.orderId;
      if (orderId) {
        await pool.query(
          `UPDATE orders SET payment_status='succeeded',
           status = CASE WHEN status = 'new' THEN 'processing' ELSE status END,
           updated_at=NOW() WHERE id=$1`,
          [orderId]
        );
      }
    } else if (event?.event === "payment.canceled") {
      const orderId = event?.object?.metadata?.orderId;
      if (orderId) {
        const { rows } = await pool.query("SELECT * FROM orders WHERE id=$1", [orderId]);
        if (rows.length && rows[0].status !== "cancelled") {
          await pool.query(
            "UPDATE orders SET payment_status='canceled', status='cancelled', cancel_reason='payment_timeout', updated_at=NOW() WHERE id=$1",
            [orderId]
          );
          // Restore stock
          const order = rows[0];
          if (!order.stock_restored) {
            for (const item of (order.items || [])) {
              const size = item.size || "";
              const { rows: pRows } = await pool.query("SELECT * FROM products WHERE id=$1", [item.productId]);
              if (!pRows.length) continue;
              const product = pRows[0];
              if (product.stock_by_sizes && size && product.stock_by_sizes[size] !== undefined) {
                const updated = { ...product.stock_by_sizes, [size]: toNum(product.stock_by_sizes[size], 0) + toNum(item.qty, 0) };
                const totalStock = Object.values(updated).reduce((a, b) => a + b, 0);
                await pool.query("UPDATE products SET stock_by_sizes=$1, stock=$2, updated_at=NOW() WHERE id=$3",
                  [JSON.stringify(updated), totalStock, item.productId]);
              } else {
                await pool.query("UPDATE products SET stock = stock + $1, updated_at=NOW() WHERE id=$2",
                  [toNum(item.qty, 0), item.productId]);
              }
            }
            await pool.query("UPDATE orders SET stock_restored=TRUE WHERE id=$1", [orderId]);
          }
        }
      }
    }
    res.json({ ok: true });
  } catch (err) {
    console.error("Webhook error:", err.message);
    res.status(500).json({ error: err.message });
  }
});

app.listen(PORT, () => {
  console.log(`Server started: http://localhost:${PORT}`);
});
