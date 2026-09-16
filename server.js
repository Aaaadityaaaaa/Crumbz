const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const cookieParser = require('cookie-parser');
const path = require('path');
const crypto = require('crypto');
const store = require('./db');

const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || crypto.randomBytes(32).toString('hex');
const TOKEN_EXPIRY = '30d';

function uid() {
  return Date.now().toString(36) + crypto.randomBytes(5).toString('hex');
}

// ---------- seed on first run ----------
function seedIfEmpty() {
  if (store.db.listings.length > 0) return;
  function plusDays(days) {
    const d = new Date();
    d.setDate(d.getDate() + days);
    return d.toISOString().slice(0, 10);
  }
  const seed = [
    { name: 'Whole Wheat Bread, 400g', category: 'Bakery', qty: 12, unit: 'pcs', expiry: plusDays(1), outlet: 'central', lister: 'Supermarket', original: 60, mode: 'sell' },
    { name: 'Toned Milk, 1L Carton', category: 'Dairy & Eggs', qty: 20, unit: 'L', expiry: plusDays(2), outlet: 'north', lister: 'Supermarket', original: 65, mode: 'sell' },
    { name: 'Multigrain Chips, Family Pack', category: 'Packaged Snacks', qty: 8, unit: 'pack', expiry: plusDays(6), outlet: 'riverside', lister: 'Vendor', original: 120, mode: 'sell' },
    { name: 'Basmati Rice, 5kg Bag', category: 'Staples & Grains', qty: 6, unit: 'kg', expiry: plusDays(9), outlet: 'central', lister: 'Vendor', original: 450, mode: 'sell' },
    { name: 'Frozen Mixed Vegetables, 1kg', category: 'Frozen Foods', qty: 15, unit: 'kg', expiry: plusDays(4), outlet: 'oldtown', lister: 'Supermarket', original: 150, mode: 'sell' },
    { name: 'Fruit Juice Cartons, 200ml x6', category: 'Beverages', qty: 10, unit: 'pack', expiry: plusDays(0), outlet: 'north', lister: 'Supermarket', original: 180, mode: 'sell' },
    { name: 'Ripe Bananas, 1kg', category: 'Fresh Produce', qty: 5, unit: 'kg', expiry: plusDays(1), outlet: 'riverside', lister: 'Individual', original: 0, mode: 'donate' },
    { name: 'Packaged Sandwiches, Box of 10', category: 'Ready-to-eat', qty: 10, unit: 'pack', expiry: plusDays(0), outlet: 'central', lister: 'Vendor', original: 0, mode: 'donate' }
  ];
  const now = Date.now();
  seed.forEach((s, i) => {
    const days = daysUntil(s.expiry);
    const pct = suggestedDiscount(days);
    const price = s.mode === 'sell' ? Math.max(0, Math.round(s.original * (1 - pct / 100))) : 0;
    store.db.listings.push({
      id: uid(), ...s, price, status: 'available',
      addedAt: now - (seed.length - i) * 900000, ownerId: null
    });
  });
  store.save();
}
seedIfEmpty();

const fs = require('fs');

const UPLOADS_DIR = path.join(__dirname, 'public', 'uploads');
if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });

// ---------- app ----------
const app = express();
app.use(express.json({ limit: '10mb' }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));

function signToken(user) {
  return jwt.sign({ sub: user.id, name: user.name, email: user.email }, JWT_SECRET, { expiresIn: TOKEN_EXPIRY });
}

function authRequired(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : req.cookies.crumbz_token;
  if (!token) return res.status(401).json({ error: 'Login required' });
  try {
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch (e) {
    return res.status(401).json({ error: 'Session expired — please log in again' });
  }
}

// ---------- auth routes ----------
app.post('/api/auth/signup', (req, res) => {
  const { name, email, password } = req.body || {};
  if (!name || !name.trim()) return res.status(400).json({ error: 'Name is required' });
  if (!email || !/^\S+@\S+\.\S+$/.test(email)) return res.status(400).json({ error: 'Valid email is required' });
  if (!password || password.length < 8) return res.status(400).json({ error: 'Password must be at least 8 characters' });

  const normEmail = email.toLowerCase().trim();
  const existing = store.db.users.find(u => u.email === normEmail);
  if (existing) return res.status(409).json({ error: 'An account with that email already exists' });

  const id = uid();
  const password_hash = bcrypt.hashSync(password, 10);
  store.db.users.push({ id, name: name.trim(), email: normEmail, password_hash, createdAt: Date.now() });
  store.save();

  const user = { id, name: name.trim(), email: normEmail };
  const token = signToken(user);
  res.cookie('crumbz_token', token, { httpOnly: true, sameSite: 'lax', maxAge: 30 * 24 * 3600 * 1000 });
  res.json({ token, user });
});

app.post('/api/auth/login', (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password) return res.status(400).json({ error: 'Email and password are required' });
  const normEmail = email.toLowerCase().trim();
  const row = store.db.users.find(u => u.email === normEmail);
  if (!row || !bcrypt.compareSync(password, row.password_hash)) {
    return res.status(401).json({ error: 'Incorrect email or password' });
  }
  const user = { id: row.id, name: row.name, email: row.email };
  const token = signToken(user);
  res.cookie('crumbz_token', token, { httpOnly: true, sameSite: 'lax', maxAge: 30 * 24 * 3600 * 1000 });
  res.json({ token, user });
});

app.post('/api/auth/logout', (req, res) => {
  res.clearCookie('crumbz_token');
  res.json({ ok: true });
});

app.get('/api/auth/me', authRequired, (req, res) => {
  res.json({ user: { id: req.user.sub, name: req.user.name, email: req.user.email } });
});

function saveImageIfPresent(dataUrl) {
  if (!dataUrl || typeof dataUrl !== 'string') return null;
  const match = /^data:image\/(png|jpeg|jpg|webp|gif);base64,(.+)$/.exec(dataUrl);
  if (!match) return null;
  const ext = match[1] === 'jpeg' ? 'jpg' : match[1];
  const buffer = Buffer.from(match[2], 'base64');
  if (buffer.length > 8 * 1024 * 1024) return null; // 8MB safety cap
  const filename = uid() + '.' + ext;
  fs.writeFileSync(path.join(UPLOADS_DIR, filename), buffer);
  return '/uploads/' + filename;
}

// ---------- listings routes ----------
app.get('/api/listings', (req, res) => {
  const rows = store.db.listings.slice().sort((a, b) => b.addedAt - a.addedAt);
  res.json({ listings: rows.map(toListingJson) });
});

app.post('/api/listings', authRequired, (req, res) => {
  const b = req.body || {};
  const name = (b.name || '').trim();
  const category = b.category;
  const qty = parseInt(b.qty, 10);
  const unit = b.unit;
  const expiry = b.expiry;
  const outlet = b.outlet;
  const lister = b.lister;
  const mode = b.mode === 'donate' ? 'donate' : 'sell';
  const original = mode === 'sell' ? Math.max(0, parseFloat(b.original) || 0) : 0;

  if (!name) return res.status(400).json({ error: 'Item name is required' });
  if (!category) return res.status(400).json({ error: 'Category is required' });
  if (!qty || qty < 1) return res.status(400).json({ error: 'Quantity must be at least 1' });
  if (!expiry || !/^\d{4}-\d{2}-\d{2}$/.test(expiry)) return res.status(400).json({ error: 'A valid expiry date is required' });
  if (!outlet) return res.status(400).json({ error: 'Outlet is required' });
  if (mode === 'sell' && original <= 0) return res.status(400).json({ error: 'Original price is required for sell listings' });

  const days = daysUntil(expiry);
  const price = mode === 'sell'
    ? (b.price != null && b.price !== '' ? Math.max(0, Math.round(parseFloat(b.price))) : suggestedPrice(original, days))
    : 0;

  const image = saveImageIfPresent(b.image);

  const listing = {
    id: uid(), name, category, qty, unit, expiry, outlet, lister, mode,
    original, price, status: 'available', addedAt: Date.now(), ownerId: req.user.sub, image
  };
  store.db.listings.push(listing);
  store.save();

  res.status(201).json({ listing: toListingJson(listing) });
});

app.post('/api/listings/:id/claim', authRequired, (req, res) => {
  const fulfil = req.body && req.body.fulfil === 'delivery' ? 'delivery' : 'pickup';
  const listing = store.db.listings.find(l => l.id === req.params.id);
  if (!listing) return res.status(404).json({ error: 'Listing not found' });
  if (listing.status !== 'available') return res.status(409).json({ error: 'This item was already claimed by someone else' });

  listing.status = 'claimed';
  const claim = {
    id: uid(), listingId: listing.id, userId: req.user.sub, name: listing.name,
    mode: listing.mode, price: listing.price, outlet: listing.outlet,
    fulfil, claimedAt: Date.now()
  };
  store.db.claims.push(claim);
  store.save();

  res.status(201).json({ claim: toClaimJson(claim), listing: toListingJson(listing) });
});

app.get('/api/claims', authRequired, (req, res) => {
  const rows = store.db.claims.filter(c => c.userId === req.user.sub).sort((a, b) => b.claimedAt - a.claimedAt);
  res.json({ claims: rows.map(toClaimJson) });
});

app.get('/api/stats', (req, res) => {
  const available = store.db.listings.filter(l => l.status === 'available');
  const donations = available.filter(l => l.mode === 'donate').length;
  const saved = available.reduce((sum, l) => sum + (l.mode === 'sell' ? (l.original - l.price) : l.original), 0);
  const claimed = store.db.listings.filter(l => l.status === 'claimed').length;
  res.json({ available: available.length, donations, saved: Math.round(saved), claimed });
});

// ---------- helpers ----------
function daysUntil(dateStr) {
  const target = new Date(dateStr + 'T00:00:00');
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.round((target - today) / 86400000);
}
function suggestedDiscount(daysLeft) {
  if (daysLeft <= 0) return 70;
  if (daysLeft === 1) return 60;
  if (daysLeft <= 2) return 50;
  if (daysLeft <= 4) return 35;
  if (daysLeft <= 6) return 20;
  return 10;
}
function suggestedPrice(original, daysLeft) {
  const pct = suggestedDiscount(daysLeft);
  return Math.max(0, Math.round(original * (1 - pct / 100)));
}
function toListingJson(l) {
  return {
    id: l.id, name: l.name, category: l.category, qty: l.qty, unit: l.unit,
    expiry: l.expiry, outlet: l.outlet, lister: l.lister, mode: l.mode,
    original: l.original, price: l.price, status: l.status, addedAt: l.addedAt,
    image: l.image || null
  };
}
function toClaimJson(c) {
  return {
    id: c.id, listingId: c.listingId, name: c.name, mode: c.mode,
    price: c.price, outlet: c.outlet, fulfil: c.fulfil, claimedAt: c.claimedAt
  };
}

app.listen(PORT, () => {
  console.log(`Crumbz server running at http://localhost:${PORT}`);
});
