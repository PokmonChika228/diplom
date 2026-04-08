# ZHUCHY Club — Dark Avant-Garde Fashion E-Commerce

## Overview

A full-stack fashion e-commerce platform with a dark avant-garde aesthetic. Features product catalog browsing, a shopping cart, checkout with delivery/payment options, promo codes, and a full admin dashboard with analytics and import tools.

## Architecture

- **Backend**: Node.js + Express (v5) serving both the API and static frontend files from the same server
- **Frontend**: Vanilla HTML/CSS/JavaScript (multi-page application, no build step)
- **Database**: JSON file (`data/db.json`) — local file-based persistence
- **Image Uploads**: Local `/uploads` directory (optional Cloudinary integration for cloud hosting)
- **Auth**: `express-session` + `bcryptjs` for admin authentication

## Key Features Implemented

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
├── server.js             # Express server (API + static file serving)
├── js/                   # Frontend JavaScript modules
├── css/                  # CSS stylesheets
├── data/db.json          # JSON database (auto-created on first run)
├── uploads/              # Local image upload storage
└── netlify/functions/    # Netlify serverless function (alternative deployment)
```

## Running the App

- **Start command**: `node server.js`
- **Port**: 5000 (set via `PORT` environment variable)

## Environment Variables

| Variable              | Default                  | Description                              |
|-----------------------|--------------------------|------------------------------------------|
| `PORT`                | `5000`                   | Server port                              |
| `ADMIN_LOGIN`         | `admin`                  | Admin username                           |
| `ADMIN_PASSWORD`      | `change_me_please`       | Admin password (plaintext fallback)      |
| `ADMIN_PASSWORD_HASH` | *(empty)*                | Bcrypt hash of admin password (preferred)|
| `SESSION_SECRET`      | *(insecure default)*     | Session signing secret                   |
| `CLOUDINARY_URL`      | *(empty)*                | Optional Cloudinary connection URL       |

## Admin Access

- Login URL: `/admin-login.html`
- Default credentials: `admin` / `change_me_please`

## Deployment

- Configured as a VM deployment (needed for local file persistence)
- Run command: `node server.js`
