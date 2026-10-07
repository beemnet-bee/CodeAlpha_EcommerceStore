// ============================================================
// db.js — sets up the SQLite database, creates the tables
// and fills in some sample products the first time it runs
// ============================================================
const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

// make sure the "data" folder exists, then open the database file
const dataDir = path.join(__dirname, 'data');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir);
}
const db = new Database(path.join(dataDir, 'shop.db'));

// turn on foreign keys so we can't save an order for a missing user/product
db.pragma('foreign_keys = ON');

// ---------- create the tables (only if they don't exist yet) ----------
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    name       TEXT NOT NULL,
    email      TEXT NOT NULL UNIQUE,
    password   TEXT NOT NULL,              -- we store the bcrypt HASH, never the real password
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS products (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    name        TEXT NOT NULL,
    description TEXT NOT NULL,
    price       REAL NOT NULL,
    emoji       TEXT NOT NULL,             -- simple emoji "image" for now
    color       TEXT NOT NULL,             -- background color for the emoji box
    category    TEXT NOT NULL,
    stock       INTEGER NOT NULL DEFAULT 10
  );

  CREATE TABLE IF NOT EXISTS orders (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id    INTEGER NOT NULL,
    total      REAL NOT NULL,
    status     TEXT NOT NULL DEFAULT 'Pending',
    fullname   TEXT NOT NULL,              -- delivery details (copied in when ordering)
    address    TEXT NOT NULL,
    city       TEXT NOT NULL,
    zip        TEXT NOT NULL,
    payment    TEXT NOT NULL,
    created_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
  );

  CREATE TABLE IF NOT EXISTS order_items (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    order_id   INTEGER NOT NULL,
    product_id INTEGER NOT NULL,
    name       TEXT NOT NULL,              -- snapshot of the product name at purchase time
    price      REAL NOT NULL,              -- snapshot of the price at purchase time
    quantity   INTEGER NOT NULL
  );
`);

// ---------- seed products (only the very first time) ----------
const productCount = db.prepare('SELECT COUNT(*) AS count FROM products').get().count;

if (productCount === 0) {
  const insert = db.prepare(`
    INSERT INTO products (name, description, price, emoji, color, category, stock)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);

  // name, description, price, emoji, color, category, stock
  const sampleProducts = [
    ['Wireless Headphones', 'Comfortable over-ear headphones with clear sound and 20 hours of battery life.', 59.99, '🎧', '#e8dff5', 'Electronics', 15],
    ['Smart Watch', 'A fitness smart watch that counts your steps, tracks your heart rate and shows notifications.', 99.99, '⌚', '#dff2e8', 'Electronics', 8],
    ['Canvas Backpack', 'A sturdy everyday backpack with a laptop pocket and a water bottle holder.', 39.99, '🎒', '#fdeed8', 'Fashion', 20],
    ['Mechanical Keyboard', 'RGB backlit mechanical keyboard with blue switches. Great for typing and gaming.', 79.99, '⌨️', '#e3f0fd', 'Electronics', 10],
    ['Running Shoes', 'Lightweight running shoes with soft cushioned soles for your daily jog.', 64.99, '👟', '#fde3e3', 'Sports', 12],
    ['Coffee Mug', 'A simple 350ml ceramic mug. Microwave safe and dishwasher safe.', 9.99, '☕', '#f5e8d7', 'Home', 30],
    ['LED Desk Lamp', 'Desk lamp with 3 brightness levels, a touch button and a USB charging port.', 24.99, '💡', '#fff9d8', 'Home', 18],
    ['Bluetooth Speaker', 'Portable speaker with loud sound and 10 hours of playtime on one charge.', 34.99, '🔊', '#e0f5f5', 'Electronics', 14],
    ['Classic Sunglasses', 'UV400 sunglasses with a simple frame that goes with every outfit.', 19.99, '🕶️', '#e8e8e8', 'Fashion', 25],
    ['Steel Water Bottle', 'A 1 litre stainless steel bottle that keeps drinks cold for 24 hours.', 14.99, '🥤', '#e3f7de', 'Sports', 22],
    ['Silicone Phone Case', 'Soft silicone phone case with drop protection. Available in cute colors.', 12.99, '📱', '#f0e0f8', 'Accessories', 40],
    ['Notebook Set (3 pack)', 'A set of 3 lined notebooks for school notes, journaling or sketches.', 7.99, '📓', '#dfeafd', 'Stationery', 35]
  ];

  const seedAll = db.transaction(() => {
    for (const p of sampleProducts) {
      insert.run(...p);
    }
  });
  seedAll();

  console.log('Seeded the database with ' + sampleProducts.length + ' sample products.');
}

// let other files (server.js) use this database connection
module.exports = db;
