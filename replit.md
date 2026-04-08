# ZHUCHY Club — Dark Avant-Garde Fashion E-Commerce

## Overview

A full-stack fashion e-commerce platform with a dark avant-garde aesthetic. Features product catalog browsing, a shopping cart, checkout with promo code support, and an admin dashboard for inventory and order management.

## Architecture

- **Backend**: Node.js + Express (v5) serving both the API and static frontend files from the same server
- **Frontend**: Vanilla HTML/CSS/JavaScript (multi-page application, no build step)
- **Database**: JSON file (`data/db.json`) — local file-based persistence
- **Image Uploads**: Local `/uploads` directory (optional Cloudinary integration for cloud hosting)
- **Auth**: `express-session` + `bcryptjs` for admin authentication

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
