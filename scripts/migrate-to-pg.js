require("dotenv").config();
const fs = require("fs");
const path = require("path");
const { Pool } = require("pg");

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const DB_PATH = path.join(__dirname, "../data/db.json");

async function main() {
  if (!fs.existsSync(DB_PATH)) {
    console.log("No db.json found, skipping migration.");
    await pool.end();
    return;
  }

  const db = JSON.parse(fs.readFileSync(DB_PATH, "utf-8"));
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    // Products
    console.log(`Migrating ${db.products.length} products...`);
    for (const p of db.products) {
      await client.query(
        `INSERT INTO products
          (id, name, category, sale, price, old_price, price_usd, old_price_usd,
           stock, sizes, colors, stock_by_sizes, image, description, composition, care, created_at, updated_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18)
         ON CONFLICT (id) DO NOTHING`,
        [
          p.id, p.name, p.category || "other", !!p.sale,
          p.price || 0, p.oldPrice || 0, p.priceUsd || 0, p.oldPriceUsd || 0,
          p.stock || 0,
          JSON.stringify(p.sizes || []),
          JSON.stringify(p.colors || []),
          p.stockBySizes ? JSON.stringify(p.stockBySizes) : null,
          p.image || "", p.description || "", p.composition || "", p.care || "",
          p.createdAt || new Date().toISOString(),
          p.updatedAt || new Date().toISOString(),
        ]
      );
    }

    // Inventory logs
    console.log(`Migrating ${db.inventoryLogs.length} inventory logs...`);
    for (const l of db.inventoryLogs) {
      await client.query(
        `INSERT INTO inventory_logs (id, product_id, qty, type, note, created_at)
         VALUES ($1,$2,$3,$4,$5,$6)
         ON CONFLICT (id) DO NOTHING`,
        [l.id, l.productId || null, l.qty || 0, l.type || "delivery", l.note || "", l.createdAt || new Date().toISOString()]
      );
    }

    // Orders
    console.log(`Migrating ${db.orders.length} orders...`);
    for (const o of db.orders) {
      await client.query(
        `INSERT INTO orders
          (id, customer_name, phone, email, address, comment, status,
           delivery, delivery_label, delivery_cost, payment, payment_label, payment_status,
           items, promo_code, promo_applied, subtotal, discount_amount, total, stock_restored, created_at, updated_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22)
         ON CONFLICT (id) DO NOTHING`,
        [
          o.id, o.customerName, o.phone || "", o.email || "",
          o.address, o.comment || "", o.status || "new",
          o.delivery || "pickup", o.deliveryLabel || "", o.deliveryCost || 0,
          o.payment || "card", o.paymentLabel || "", o.paymentStatus || "pending",
          JSON.stringify(o.items || []),
          o.promoCode || "", o.promoApplied ? JSON.stringify(o.promoApplied) : null,
          o.subtotal || 0, o.discountAmount || 0, o.total || 0,
          !!o._stockRestored,
          o.createdAt || new Date().toISOString(),
          o.updatedAt || o.createdAt || new Date().toISOString(),
        ]
      );
    }

    // Promo codes
    console.log(`Migrating ${db.promoCodes.length} promo codes...`);
    for (const pc of db.promoCodes) {
      await client.query(
        `INSERT INTO promo_codes (id, code, type, value, active, created_at)
         VALUES ($1,$2,$3,$4,$5,$6)
         ON CONFLICT (id) DO NOTHING`,
        [pc.id, pc.code, pc.type || "percent", pc.value || 0, pc.active !== false, pc.createdAt || new Date().toISOString()]
      );
    }

    // UI settings
    const ticker = db.uiSettings?.ticker || { enabled: false, text: "" };
    const heroImage = db.uiSettings?.heroImage || { src: "" };
    await client.query(
      `INSERT INTO ui_settings (key, value) VALUES ('ticker', $1), ('heroImage', $2)
       ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`,
      [JSON.stringify(ticker), JSON.stringify(heroImage)]
    );

    // Sync sequences
    if (db.counters) {
      const productNext = db.counters.product || 1;
      const orderNext = db.counters.order || 1;
      const logNext = db.counters.log || 1;
      const promoNext = db.counters.promo || 1;
      await client.query(`SELECT setval('products_id_seq', $1, false)`, [productNext]);
      await client.query(`SELECT setval('orders_id_seq', $1, false)`, [orderNext]);
      await client.query(`SELECT setval('inventory_logs_id_seq', $1, false)`, [logNext]);
      await client.query(`SELECT setval('promo_codes_id_seq', $1, false)`, [promoNext]);
    }

    await client.query("COMMIT");
    console.log("Migration complete!");
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("Migration failed:", err.message);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

main();
