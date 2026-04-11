# ZHUCHY Club — Dark Avant-Garde Fashion E-Commerce

## Overview

A full-stack fashion e-commerce platform with a dark avant-garde aesthetic. Features product catalog browsing, a shopping cart, checkout with delivery/payment options, promo codes, and a full admin dashboard with analytics and import tools.

## Architecture

- **Backend**: Node.js + Express (v5) serving both the API and static frontend files from the same server
- **Frontend**: Vanilla HTML/CSS/JavaScript (multi-page application, no build step)
- **Database**: PostgreSQL (Replit built-in) via `pg` connection pool — replaced the old `data/db.json` file
- **Image Uploads**: Local `/uploads` directory (optional Cloudinary integration for cloud hosting)
- **Auth**: `express-session` + `bcryptjs` for admin authentication

## Key Features Implemented

### User System
- **Auth pages**: `register.html`, `login.html`, `account.html`
- **Email verification**: 6-digit codes sent via Ethereal (dev, preview URL in console) or real SMTP (via env vars `SMTP_HOST/PORT/USER/PASS/FROM`)
- **Loyalty program**: earn 5% of order value as points (1 pt = 1₽), spend up to 30% of order at checkout; history in account tab; admin can adjust
- **Checkout auto-fill**: logged-in users have name, phone, email pre-filled automatically
- **Admin user panel**: view/edit role, loyalty points, order history per user

### Products & Orders
- **19 seed products** across 4 categories: mens (5), womens (6), unisex (4), accessories (4)
- **7 sample orders** with realistic delivery/payment data; 4 orders use promo code DARK15
- **Promo code DARK15** — 15% discount, active
- **Delivery options**: Самовывоз (free), Курьер (500₽), СДЭК/ПВЗ (350₽) — dynamic pricing in checkout sidebar
- **Payment options**: Картой онлайн, СБП (Система быстрых платежей), При получении
- **Product cards**: 3:4 portrait aspect ratio throughout the store
- **Homepage sale grid**: Shows 6 sale items (expanded from 4)
- **Admin panel**: Tab-based navigation (7 tabs as separate sections):
  - Номенклатура — product CRUD with image upload
  - Склад — inventory management & delivery history
  - Заказы — full order table with delivery/payment/promo columns & status updates
  - Промокоды — create, toggle, delete promo codes
  - Аналитика — KPI cards, canvas revenue chart, breakdowns by status/delivery/payment/category, top products, low-stock alerts
  - Симуляция — vitrine.market importer (with demo fallback, auto-deduplication, auto-categorization)
  - Очистка — selective or full database cleanup
- **Admin dashboard API** (`/api/admin/dashboard`) — all data in a single request
- **Analytics API** — byStatus, byCategory, byDelivery, byPayment, avgOrderValue, totalDiscounts, ordersWithPromo, lowStockProducts

## Project Structure

```
├── index.html            # Homepage
├── catalog.html          # Product browsing
├── product.html          # Product detail page
├── cart.html             # Shopping cart
├── checkout.html         # Checkout with promo code support
├── admin.html            # Admin dashboard (protected)
├── admin-login.html      # Admin login page
├── server.js             # Express server (API + static file serving, PostgreSQL)
├── scripts/migrate-to-pg.js  # One-time migration script from db.json to PostgreSQL
├── js/                   # Frontend JavaScript modules
├── css/                  # CSS stylesheets
├── data/db.json          # Legacy JSON database (kept as backup, no longer used)
└── uploads/              # Local image upload storage
```

## Running the App

- **Start command**: `node server.js`
- **Port**: 5000 (set via `PORT` environment variable)

## Environment Variables

| Variable              | Default          | Description                          |
|-----------------------|------------------|--------------------------------------|
| `PORT`                | `5000`           | Server port                          |
| `SESSION_SECRET`      | *(dev default)*  | Session signing secret               |
| `CLOUDINARY_URL`      | *(empty)*        | Optional Cloudinary connection URL   |

## Admin Access

- Login URL: `/admin-login.html`
- Credentials: `admin` / `admin`

## Deployment

- Configured as a VM deployment (needed for local file persistence)
- Run command: `node server.js`
