require("dotenv").config();
const fs = require("fs");
const path = require("path");
const { Pool } = require("pg");

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const ASSETS = path.join(__dirname, "../attached_assets");

function readJson(file) {
  const files = fs.readdirSync(ASSETS).filter(f => f.startsWith(file));
  if (!files.length) throw new Error("File not found: " + file);
  return JSON.parse(fs.readFileSync(path.join(ASSETS, files[0]), "utf8"));
}

async function main() {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const products = readJson("products_");
    console.log(`Seeding ${products.length} products...`);
    for (const p of products) {
      await client.query(
        `INSERT INTO products
          (id, name, category, sale, price, old_price, price_usd, old_price_usd,
           stock, sizes, colors, stock_by_sizes, image, description, composition, care, created_at, updated_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18)
         ON CONFLICT (id) DO UPDATE SET
           name=$2, category=$3, sale=$4, price=$5, old_price=$6, price_usd=$7, old_price_usd=$8,
           stock=$9, sizes=$10, colors=$11, stock_by_sizes=$12, image=$13, description=$14,
           composition=$15, care=$16, updated_at=$18`,
        [
          p.id, p.name, p.category || "other", !!p.sale,
          p.price || 0, p.old_price || 0, p.price_usd || 0, p.old_price_usd || 0,
          p.stock || 0,
          JSON.stringify(p.sizes || []),
          JSON.stringify(p.colors || []),
          p.stock_by_sizes ? JSON.stringify(p.stock_by_sizes) : null,
          p.image || "", p.description || "", p.composition || "", p.care || "",
          p.created_at || new Date().toISOString(),
          p.updated_at || new Date().toISOString(),
        ]
      );
    }
    await client.query(`SELECT setval('products_id_seq', (SELECT MAX(id) FROM products))`);

    const inventory = readJson("inventory_logs_");
    console.log(`Seeding ${inventory.length} inventory logs...`);
    for (const l of inventory) {
      await client.query(
        `INSERT INTO inventory_logs (id, product_id, qty, type, note, created_at)
         VALUES ($1,$2,$3,$4,$5,$6)
         ON CONFLICT (id) DO NOTHING`,
        [l.id, l.product_id || null, l.qty || 0, l.type || "delivery", l.note || "", l.created_at || new Date().toISOString()]
      );
    }
    await client.query(`SELECT setval('inventory_logs_id_seq', (SELECT MAX(id) FROM inventory_logs))`);

    const orders = readJson("orders_");
    console.log(`Seeding ${orders.length} orders...`);
    for (const o of orders) {
      await client.query(
        `INSERT INTO orders
          (id, customer_name, phone, email, address, comment, status,
           delivery, delivery_label, delivery_cost, payment, payment_label, payment_status,
           items, promo_code, promo_applied, subtotal, discount_amount, total, stock_restored, created_at, updated_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22)
         ON CONFLICT (id) DO NOTHING`,
        [
          o.id, o.customer_name || "", o.phone || "", o.email || "",
          o.address || "", o.comment || "", o.status || "new",
          o.delivery || "pickup", o.delivery_label || "", parseFloat(o.delivery_cost) || 0,
          o.payment || "card", o.payment_label || "", o.payment_status || "pending",
          JSON.stringify(o.items || []),
          o.promo_code || "", o.promo_applied ? JSON.stringify(o.promo_applied) : null,
          parseFloat(o.subtotal) || 0, parseFloat(o.discount_amount) || 0, parseFloat(o.total) || 0,
          !!o.stock_restored,
          o.created_at || new Date().toISOString(),
          o.updated_at || o.created_at || new Date().toISOString(),
        ]
      );
    }
    await client.query(`SELECT setval('orders_id_seq', GREATEST((SELECT MAX(id) FROM orders), 1))`);

    const promos = readJson("promo_codes_");
    console.log(`Seeding ${promos.length} promo codes...`);
    for (const pc of promos) {
      await client.query(
        `INSERT INTO promo_codes (id, code, type, value, active, created_at)
         VALUES ($1,$2,$3,$4,$5,$6)
         ON CONFLICT (id) DO UPDATE SET code=$2, type=$3, value=$4, active=$5`,
        [pc.id, pc.code, pc.type || "percent", parseFloat(pc.value) || 0, pc.active !== false, pc.created_at || new Date().toISOString()]
      );
    }
    await client.query(`SELECT setval('promo_codes_id_seq', (SELECT MAX(id) FROM promo_codes))`);

    const uiSettings = readJson("ui_settings_");
    console.log(`Seeding ${uiSettings.length} ui settings...`);
    for (const s of uiSettings) {
      await client.query(
        `INSERT INTO ui_settings (key, value) VALUES ($1,$2)
         ON CONFLICT (key) DO UPDATE SET value=$2`,
        [s.key, JSON.stringify(s.value)]
      );
    }

    await client.query("COMMIT");
    console.log("Seeding complete!");
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("Seeding failed:", err.message);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

main();
