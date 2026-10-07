// ============================================================
// server.js — the main Express server for SimpleShop
// It has two jobs:
//   1. serve the HTML/CSS/JS files from the "public" folder
//   2. provide a small JSON API (/api/...) for the frontend
// ============================================================
const express = require('express');
const session = require('express-session');
const bcrypt = require('bcryptjs');
const path = require('path');
const db = require('./db');

const app = express();
const PORT = process.env.PORT || 3000;

// ---------- middleware (things that run for every request) ----------
app.use(express.json()); // lets us read the JSON that the frontend sends

// sessions remember who is logged in (uses cookies)
app.use(session({
  secret: 'my-simple-shop-secret-key',
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 1000 * 60 * 60 * 24 } // stay logged in for 1 day
}));

// serve everything inside the "public" folder (html, css, js)
app.use(express.static(path.join(__dirname, 'public')));

// ---------- small helpers ----------

// returns the logged in user from the session, or null
function currentUser(req) {
  if (!req.session.userId) return null;
  return db.prepare('SELECT id, name, email FROM users WHERE id = ?').get(req.session.userId);
}

// middleware for routes that require a login
function requireLogin(req, res, next) {
  if (!req.session.userId) {
    return res.status(401).json({ error: 'You need to log in first' });
  }
  next();
}

// ============================================================
// AUTH ROUTES
// ============================================================

// ---- REGISTER ----
app.post('/api/register', (req, res) => {
  const { name, email, password } = req.body;

  // basic validation
  if (!name || !email || !password) {
    return res.status(400).json({ error: 'All fields are required' });
  }
  if (password.length < 6) {
    return res.status(400).json({ error: 'Password must be at least 6 characters' });
  }

  // check that the email is not already used
  const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(email.toLowerCase().trim());
  if (existing) {
    return res.status(400).json({ error: 'That email is already registered' });
  }

  // hash the password so we never store the real one
  const hash = bcrypt.hashSync(password, 10);

  const info = db.prepare('INSERT INTO users (name, email, password) VALUES (?, ?, ?)')
    .run(name.trim(), email.toLowerCase().trim(), hash);

  // log the user in right away by saving their id in the session
  req.session.userId = info.lastInsertRowid;

  res.json({ user: { id: info.lastInsertRowid, name: name.trim(), email: email.toLowerCase().trim() } });
});

// ---- LOGIN ----
app.post('/api/login', (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required' });
  }

  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email.toLowerCase().trim());
  if (!user) {
    return res.status(400).json({ error: 'Wrong email or password' });
  }

  // bcrypt.compareSync checks the typed password against the stored hash
  if (!bcrypt.compareSync(password, user.password)) {
    return res.status(400).json({ error: 'Wrong email or password' });
  }

  // save the user id in the session = logged in
  req.session.userId = user.id;

  res.json({ user: { id: user.id, name: user.name, email: user.email } });
});

// ---- LOGOUT ----
app.post('/api/logout', (req, res) => {
  req.session.destroy(() => {
    res.json({ ok: true });
  });
});

// ---- WHO AM I? (the frontend calls this to show the right navbar) ----
app.get('/api/me', (req, res) => {
  res.json({ user: currentUser(req) });
});

// ============================================================
// PRODUCT ROUTES
// ============================================================

// ---- all products (for the home page) ----
app.get('/api/products', (req, res) => {
  const products = db.prepare('SELECT * FROM products ORDER BY id').all();
  res.json(products);
});

// ---- one product (for the product details page) ----
app.get('/api/products/:id', (req, res) => {
  const product = db.prepare('SELECT * FROM products WHERE id = ?').get(req.params.id);
  if (!product) {
    return res.status(404).json({ error: 'Product not found' });
  }
  res.json(product);
});

// ============================================================
// ORDER ROUTES (login required)
// ============================================================

// ---- place an order (this is the checkout) ----
app.post('/api/orders', requireLogin, (req, res) => {
  const { items, fullname, address, city, zip, payment } = req.body;

  // validate the incoming data
  if (!items || items.length === 0) {
    return res.status(400).json({ error: 'Your cart is empty' });
  }
  if (!fullname || !address || !city || !zip || !payment) {
    return res.status(400).json({ error: 'Please fill in all the delivery fields' });
  }

  // Calculate the total HERE on the server, using prices from the database.
  // (never trust prices coming from the browser — they can be changed!)
  let total = 0;
  const orderItems = [];

  for (const item of items) {
    const product = db.prepare('SELECT * FROM products WHERE id = ?').get(item.id);
    if (!product) {
      return res.status(400).json({ error: 'A product in your cart no longer exists' });
    }
    const qty = parseInt(item.qty);
    if (!qty || qty < 1) {
      return res.status(400).json({ error: 'Invalid quantity for ' + product.name });
    }
    if (product.stock < qty) {
      return res.status(400).json({ error: 'Sorry, only ' + product.stock + ' left in stock for ' + product.name });
    }
    total += product.price * qty;
    orderItems.push({ product, qty });
  }

  // save the order + items + update stock, all inside one transaction
  // (a transaction means: either everything succeeds, or nothing is saved)
  const insertOrder = db.prepare(`
    INSERT INTO orders (user_id, total, status, fullname, address, city, zip, payment)
    VALUES (?, ?, 'Pending', ?, ?, ?, ?, ?)
  `);
  const insertItem = db.prepare(`
    INSERT INTO order_items (order_id, product_id, name, price, quantity)
    VALUES (?, ?, ?, ?, ?)
  `);
  const updateStock = db.prepare('UPDATE products SET stock = stock - ? WHERE id = ?');

  const placeOrder = db.transaction(() => {
    const info = insertOrder.run(req.session.userId, total, fullname, address, city, zip, payment);
    const orderId = info.lastInsertRowid;
    for (const oi of orderItems) {
      insertItem.run(orderId, oi.product.id, oi.product.name, oi.product.price, oi.qty);
      updateStock.run(oi.qty, oi.product.id);
    }
    return orderId;
  });

  const orderId = placeOrder();

  res.json({ ok: true, orderId: orderId, total: total });
});

// ---- see my orders (order history) ----
app.get('/api/orders', requireLogin, (req, res) => {
  const orders = db.prepare('SELECT * FROM orders WHERE user_id = ? ORDER BY id DESC').all(req.session.userId);

  // attach the items to each order
  for (const order of orders) {
    order.items = db.prepare('SELECT * FROM order_items WHERE order_id = ?').all(order.id);
  }
  res.json(orders);
});

// ---------- start the server ----------
// a tiny 404 handler for unknown pages
app.use((req, res) => {
  res.status(404).send('404 — page not found 🙈 <a href="/">Back to the shop</a>');
});

app.listen(PORT, () => {
  console.log('SimpleShop server running on http://localhost:' + PORT);
});
