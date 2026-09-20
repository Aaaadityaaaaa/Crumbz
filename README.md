# 🥐 Crumbz — Near-Expiry Food Marketplace

> **SDG 2: Zero Hunger & SDG 12: Responsible Consumption**

Crumbz is a full-stack, mobile-responsive web marketplace that connects supermarkets, vendors, and individuals with near-expiry food stock to price-sensitive buyers and donation recipients.

---

## 🌟 Key Features

1. **AI Barcode Scanner**:
   - Live camera barcode scanner & photo upload powered by `html5-qrcode`.
   - Proxies Open Food Facts API to auto-fill item name, brand, pack size, and category.

2. **AI Expiry Date OCR Scanner**:
   - Camera & photo OCR scanner powered by `Tesseract.js` with canvas downscaling and contrast enhancement.
   - Auto-parses printed expiry date labels (`EXP 15/10/2026`, `BEST BEFORE 24 OCT 2026`).

3. **Dynamic AI Pricing Engine**:
   - Dynamic discount calculation based on days remaining until expiry.

4. **End-to-End Checkout & Order Flow**:
   - Full Checkout modal with Order Summary, Delivery vs. Pickup fulfillment fees, and multiple payment methods (UPI, Card, Cash).
   - Generates digital **Order Confirmation & QR Rescue Pass** (`CRUMBZ-PASS-XXXX`).

5. **Seller Dashboard ("My Listings")**:
   - Vendors can manage listed inventory, view active/claimed statuses, and delete listings.

6. **Quick Filter Pills**:
   - One-tap quick filtering (`⚡ Expiring Today`, `🎁 Free Donations`, `🏷️ Under ₹50`, Category pills).

7. **Live Expiry Countdown Timers**:
   - Real-time ticking timers on items expiring within 24 hours.

---

## 🚀 How to Run Locally

```bash
# 1. Install dependencies
npm install

# 2. Start the server
npm start
```
Open **`http://localhost:3000`** in your browser.

---

## 📱 Opening on Mobile Phone (Local Wi-Fi)

1. Make sure your phone is connected to the same Wi-Fi network.
2. Open `http://<YOUR_LAPTOP_IP>:3000` (e.g., `http://192.168.1.10:3000`).

---

## ☁️ 1-Click Production Deployment Guide

### Option 1: Render.com (Recommended Free Hosting)
1. Push this repository to GitHub.
2. Go to [Render.com](https://render.com) -> New Web Service.
3. Connect your repository — Render automatically detects `render.yaml`!
4. Click **Deploy**!

### Option 2: Railway / Docker
```bash
docker build -t crumbz-app .
docker run -p 3000:3000 crumbz-app
```

---

## 🛠️ Tech Stack

- **Backend**: Node.js, Express 5, JSON Persistence Store (`db.js`), JWT, bcryptjs, cookie-parser.
- **Frontend**: Vanilla HTML5/CSS3/JavaScript (No heavy framework, zero bundle overhead), Google Fonts (`Anton`, `IBM Plex Mono`, `Work Sans`).
- **Libraries**: `html5-qrcode`, `Tesseract.js`.
