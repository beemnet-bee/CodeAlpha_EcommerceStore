// ============================================================
// main.js — shared code that EVERY page uses
// (cart helpers + the login/logout part of the navbar)
// ============================================================

// the cart lives in localStorage so it survives page reloads.
// it is just an array that looks like: [{ id: 3, qty: 2 }, { id: 7, qty: 1 }]
const CART_KEY = 'simpleshop_cart';

// read the cart out of localStorage
function getCart() {
  return JSON.parse(localStorage.getItem(CART_KEY)) || [];
}

// save the cart back to localStorage and refresh the navbar badge
function saveCart(cart) {
  localStorage.setItem(CART_KEY, JSON.stringify(cart));
  updateCartBadge();
}

// add a product to the cart (or add to its quantity if it is already there)
function addToCart(id, qty) {
  const cart = getCart();
  const item = cart.find(i => i.id === id);
  if (item) {
    item.qty += qty;
  } else {
    cart.push({ id: id, qty: qty });
  }
  saveCart(cart);
  alert('Added to cart! 🛒');
}

// show how many items are in the cart, on the little red badge in the navbar
function updateCartBadge() {
  const badge = document.getElementById('cart-badge');
  if (!badge) return; // this page has no navbar badge
  const total = getCart().reduce((sum, item) => sum + item.qty, 0);
  badge.textContent = total;
}

// show "Login / Sign Up" or "Hi, name / Logout" in the navbar,
// depending on whether we are logged in
async function updateAuthArea() {
  const area = document.getElementById('auth-area');
  if (!area) return;

  const res = await fetch('/api/me');
  const data = await res.json();

  if (data.user) {
    area.innerHTML = `
      <span class="hello">Hi, ${data.user.name}</span>
      <a href="#" onclick="logout(); return false;">Logout</a>
    `;
  } else {
    area.innerHTML = `
      <a href="/login.html">Login</a>
      <a href="/register.html" class="btn-small">Sign Up</a>
    `;
  }
}

// log out, then go back to the home page
async function logout() {
  await fetch('/api/logout', { method: 'POST' });
  window.location.href = '/index.html';
}

// run these on every page when it loads
updateCartBadge();
updateAuthArea();
