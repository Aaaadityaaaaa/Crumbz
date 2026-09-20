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

app.get('/api/my-listings', authRequired, (req, res) => {
  const rows = store.db.listings.filter(l => l.ownerId === req.user.sub).sort((a, b) => b.addedAt - a.addedAt);
  res.json({ listings: rows.map(toListingJson) });
});

app.delete('/api/listings/:id', authRequired, (req, res) => {
  const idx = store.db.listings.findIndex(l => l.id === req.params.id && (l.ownerId === req.user.sub || !l.ownerId));
  if (idx === -1) return res.status(404).json({ error: 'Listing not found or unauthorized' });
  const [removed] = store.db.listings.splice(idx, 1);
  store.save();
  res.json({ ok: true, deletedId: removed.id });
});

app.post('/api/listings/:id/claim', authRequired, (req, res) => {
  const b = req.body || {};
  const fulfil = b.fulfil === 'delivery' ? 'delivery' : 'pickup';
  const listing = store.db.listings.find(l => l.id === req.params.id);
  if (!listing) return res.status(404).json({ error: 'Listing not found' });
  if (listing.status !== 'available') return res.status(409).json({ error: 'This item was already claimed by someone else' });

  listing.status = 'claimed';
  const deliveryFee = (fulfil === 'delivery' && listing.mode !== 'donate') ? 25 : 0;
  const totalAmount = listing.mode === 'donate' ? 0 : (listing.price + deliveryFee);
  const passCode = 'CRUMBZ-PASS-' + crypto.randomBytes(3).toString('hex').toUpperCase();

  const claim = {
    id: uid(),
    orderId: 'ORD-' + Date.now().toString(36).toUpperCase(),
    listingId: listing.id,
    userId: req.user.sub,
    userName: req.user.name,
    userEmail: req.user.email,
    name: listing.name,
    category: listing.category,
    mode: listing.mode,
    price: listing.price,
    original: listing.original,
    outlet: listing.outlet,
    fulfil,
    address: (b.address || '').trim(),
    phone: (b.phone || '').trim(),
    paymentMethod: listing.mode === 'donate' ? 'free' : (b.paymentMethod || 'upi'),
    paymentStatus: 'paid',
    deliveryFee,
    totalAmount,
    passCode,
    claimedAt: Date.now()
  };
  store.db.claims.push(claim);
  store.save();

  res.status(201).json({ claim, listing: toListingJson(listing) });
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

// ---------- barcode lookup (Open Food Facts proxy) ----------
const CRUMBZ_CATEGORIES = [
  { key: 'Bakery',           words: ['bread','biscuit','cake','pastry','cookie','bakery','rusk','toast','muffin','croissant','bun'] },
  { key: 'Dairy & Eggs',     words: ['milk','cheese','yogurt','yoghurt','butter','egg','dairy','curd','paneer','cream','ghee','lassi'] },
  { key: 'Packaged Snacks',  words: ['chip','snack','cracker','wafer','nuts','chocolate','candy','sweet','spread','namkeen','bhujia','mixture'] },
  { key: 'Beverages',        words: ['juice','water','soda','tea','coffee','drink','beverage','cola','energy','squash','shake'] },
  { key: 'Staples & Grains', words: ['rice','wheat','flour','grain','cereal','pasta','lentil','dal','atta','maida','oat','muesli','noodle'] },
  { key: 'Frozen Foods',     words: ['frozen','ice cream','ice-cream','gelato','popsicle'] },
  { key: 'Fresh Produce',    words: ['fruit','vegetable','produce','fresh','salad','herb'] },
  { key: 'Ready-to-eat',     words: ['ready','meal','sandwich','instant','soup','poha','upma','rte','ready to eat'] }
];

function mapCategory(offCategories) {
  if (!offCategories) return null;
  const lower = offCategories.toLowerCase();
  for (const cat of CRUMBZ_CATEGORIES) {
    for (const w of cat.words) {
      if (lower.includes(w)) return cat.key;
    }
  }
  return null;
}

function parseQuantity(qtyStr) {
  if (!qtyStr) return { qty: 1, unit: 'pcs' };
  const match = /(\d+(?:\.\d+)?)\s*(g|kg|ml|l|L|cl|oz|lb|pcs|pack|units?|pieces?)/i.exec(qtyStr);
  if (!match) return { qty: 1, unit: 'pcs' };
  let num = parseFloat(match[1]);
  let unit = match[2].toLowerCase();
  if (unit === 'ml' || unit === 'cl') { unit = 'L'; num = unit === 'cl' ? num / 100 : num / 1000; num = Math.round(num * 100) / 100; }
  else if (unit === 'g') { unit = 'g'; }
  else if (unit === 'kg') { unit = 'kg'; }
  else if (unit === 'l') { unit = 'L'; }
  else if (unit === 'oz' || unit === 'lb') { unit = 'g'; num = unit === 'oz' ? Math.round(num * 28.35) : Math.round(num * 453.6); }
  else { unit = 'pcs'; }
  return { qty: Math.max(1, Math.round(num) || 1), unit };
}

app.get('/api/barcode/:code', async (req, res) => {
  const code = req.params.code.replace(/\D/g, '');
  if (!code || code.length < 8) return res.status(400).json({ found: false, error: 'Invalid barcode' });
  try {
    const url = `https://world.openfoodfacts.org/api/v2/product/${code}?fields=product_name,brands,categories,quantity,image_front_url`;
    const resp = await fetch(url, {
      headers: { 'User-Agent': 'Crumbz-App/1.0 (contact: crumbz-team@demo.com)' }
    });
    const data = await resp.json();
    if (data.status !== 1 || !data.product) {
      return res.json({ found: false });
    }
    const p = data.product;
    const parsed = parseQuantity(p.quantity);
    res.json({
      found: true,
      name: p.product_name || '',
      brand: p.brands || '',
      category: mapCategory(p.categories),
      qty: parsed.qty,
      unit: parsed.unit,
      rawQuantity: p.quantity || '',
      image: p.image_front_url || null
    });
  } catch (e) {
    console.error('Barcode lookup failed:', e.message);
    res.status(502).json({ found: false, error: 'Could not reach product database' });
  }
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

// ---------- healthcheck & SPA fallback ----------
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', uptime: Math.round(process.uptime()), timestamp: new Date().toISOString() });
});

app.get(/^(?!\/api).*/, (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Crumbz production server running on port ${PORT}`);
});
