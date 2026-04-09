// ================================================
// SHOPMKT - Main App Logic
// ================================================

import { auth, db, storage } from './firebase-config.js';
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  updateProfile
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import {
  collection, doc, getDoc, getDocs, addDoc, updateDoc, deleteDoc,
  query, where, orderBy, limit, serverTimestamp, setDoc, onSnapshot
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import {
  ref, uploadBytesResumable, getDownloadURL
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-storage.js";

// ── State ──────────────────────────────────────
export const state = {
  user: null,
  userProfile: null,
  cart: JSON.parse(localStorage.getItem('shopmkt_cart') || '[]'),
};

// ── Auth ───────────────────────────────────────
onAuthStateChanged(auth, async (user) => {
  state.user = user;
  if (user) {
    const snap = await getDoc(doc(db, 'users', user.uid));
    state.userProfile = snap.exists() ? snap.data() : null;
  } else {
    state.userProfile = null;
  }
  document.dispatchEvent(new CustomEvent('auth-changed', { detail: { user, profile: state.userProfile } }));
  updateNavUI();
});

export async function registerUser({ email, password, name, role = 'buyer', extra = {} }) {
  const cred = await createUserWithEmailAndPassword(auth, email, password);
  await updateProfile(cred.user, { displayName: name });
  await setDoc(doc(db, 'users', cred.user.uid), {
    uid: cred.user.uid, email, name, role,
    createdAt: serverTimestamp(),
    ...extra
  });
  return cred.user;
}

export async function loginUser({ email, password }) {
  const cred = await signInWithEmailAndPassword(auth, email, password);
  return cred.user;
}

export async function logoutUser() {
  await signOut(auth);
  window.location.href = '/';
}

// ── Cart ───────────────────────────────────────
export function getCart() { return state.cart; }

export function addToCart(product, qty = 1) {
  const existing = state.cart.find(i => i.id === product.id);
  if (existing) {
    existing.qty += qty;
  } else {
    state.cart.push({ ...product, qty });
  }
  saveCart();
  updateCartBadge();
  document.dispatchEvent(new CustomEvent('cart-updated', { detail: state.cart }));
}

export function removeFromCart(productId) {
  state.cart = state.cart.filter(i => i.id !== productId);
  saveCart();
  updateCartBadge();
  document.dispatchEvent(new CustomEvent('cart-updated', { detail: state.cart }));
}

export function updateCartQty(productId, qty) {
  const item = state.cart.find(i => i.id === productId);
  if (item) { item.qty = qty; if (qty <= 0) removeFromCart(productId); }
  saveCart();
  document.dispatchEvent(new CustomEvent('cart-updated', { detail: state.cart }));
}

export function clearCart() {
  state.cart = [];
  saveCart();
  updateCartBadge();
}

export function getCartTotal() {
  return state.cart.reduce((s, i) => s + (i.price * i.qty), 0);
}

export function getCartCount() {
  return state.cart.reduce((s, i) => s + i.qty, 0);
}

function saveCart() {
  localStorage.setItem('shopmkt_cart', JSON.stringify(state.cart));
}

// ── Firestore Helpers ──────────────────────────
export async function getProducts(filters = {}) {
  let q = collection(db, 'products');
  const constraints = [];
  if (filters.category) constraints.push(where('category', '==', filters.category));
  if (filters.sellerId) constraints.push(where('sellerId', '==', filters.sellerId));
  constraints.push(orderBy('createdAt', 'desc'));
  if (filters.limit) constraints.push(limit(filters.limit));
  const snap = await getDocs(query(q, ...constraints));
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

export async function getProduct(id) {
  const snap = await getDoc(doc(db, 'products', id));
  return snap.exists() ? { id: snap.id, ...snap.data() } : null;
}

export async function createProduct(data) {
  return await addDoc(collection(db, 'products'), {
    ...data,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  });
}

export async function updateProduct(id, data) {
  await updateDoc(doc(db, 'products', id), { ...data, updatedAt: serverTimestamp() });
}

export async function deleteProduct(id) {
  await deleteDoc(doc(db, 'products', id));
}

export async function createOrder(orderData) {
  const orderId = 'ORD-' + Date.now() + '-' + Math.random().toString(36).slice(2,6).toUpperCase();
  const ref = await addDoc(collection(db, 'orders'), {
    ...orderData,
    orderId,
    status: 'pending',
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  });
  return { id: ref.id, orderId };
}

export async function getOrders(userId, role = 'buyer') {
  const field = role === 'buyer' ? 'buyerId' : 'sellerId';
  const q = query(collection(db, 'orders'), where(field, '==', userId), orderBy('createdAt', 'desc'));
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

export async function getAllOrders() {
  const snap = await getDocs(query(collection(db, 'orders'), orderBy('createdAt', 'desc')));
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

export async function updateOrderStatus(id, status) {
  await updateDoc(doc(db, 'orders', id), { status, updatedAt: serverTimestamp() });
}

export async function uploadImage(file, path) {
  const storageRef = ref(storage, path);
  const task = uploadBytesResumable(storageRef, file);
  return new Promise((resolve, reject) => {
    task.on('state_changed', null, reject, async () => {
      const url = await getDownloadURL(task.snapshot.ref);
      resolve(url);
    });
  });
}

export async function getCategories() {
  const snap = await getDocs(collection(db, 'categories'));
  if (snap.empty) {
    return [
      { id: 'electronics', name: 'Electronics', icon: '📱' },
      { id: 'fashion', name: 'Fashion', icon: '👗' },
      { id: 'home', name: 'Home & Living', icon: '🏠' },
      { id: 'beauty', name: 'Beauty', icon: '💄' },
      { id: 'sports', name: 'Sports', icon: '⚽' },
      { id: 'food', name: 'Food & Drinks', icon: '🍎' },
      { id: 'auto', name: 'Auto & Motors', icon: '🚗' },
      { id: 'books', name: 'Books', icon: '📚' },
    ];
  }
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

// ── UI Helpers ─────────────────────────────────
export function updateNavUI() {
  const userMenu = document.getElementById('nav-user-menu');
  const authLinks = document.getElementById('nav-auth-links');
  const badge = document.getElementById('cart-badge');

  if (badge) {
    const count = getCartCount();
    badge.textContent = count;
    badge.style.display = count > 0 ? 'flex' : 'none';
  }

  if (!userMenu || !authLinks) return;

  if (state.user) {
    authLinks.classList.add('hidden');
    userMenu.classList.remove('hidden');
    const nameEl = document.getElementById('nav-user-name');
    const avatarEl = document.getElementById('nav-avatar');
    if (nameEl) nameEl.textContent = state.user.displayName || state.user.email.split('@')[0];
    if (avatarEl) avatarEl.textContent = (state.user.displayName || 'U')[0].toUpperCase();
  } else {
    authLinks.classList.remove('hidden');
    userMenu.classList.add('hidden');
  }
}

export function updateCartBadge() {
  const badge = document.getElementById('cart-badge');
  if (!badge) return;
  const count = getCartCount();
  badge.textContent = count;
  badge.style.display = count > 0 ? 'flex' : 'none';
  if (count > 0) {
    badge.style.animation = 'none';
    badge.offsetHeight;
    badge.style.animation = 'popIn 0.3s cubic-bezier(0.34,1.56,0.64,1)';
  }
}

// ── Toast ──────────────────────────────────────
export function toast(title, msg = '', type = 'info') {
  const icons = { success: '✅', error: '❌', info: 'ℹ️', warning: '⚠️' };
  const container = document.getElementById('toast-container') || (() => {
    const d = document.createElement('div');
    d.id = 'toast-container';
    document.body.appendChild(d);
    return d;
  })();

  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.innerHTML = `
    <span class="toast-icon">${icons[type]}</span>
    <div class="toast-content">
      <div class="toast-title">${title}</div>
      ${msg ? `<div class="toast-msg">${msg}</div>` : ''}
    </div>
  `;
  container.appendChild(el);
  setTimeout(() => {
    el.classList.add('removing');
    setTimeout(() => el.remove(), 300);
  }, 3500);
}

// ── Button Loading ─────────────────────────────
export function btnLoading(btn, loading) {
  if (loading) {
    btn.dataset.origText = btn.innerHTML;
    btn.innerHTML = `<span class="spinner"></span><span class="btn-text">Please wait…</span>`;
    btn.classList.add('btn-loading');
    btn.disabled = true;
  } else {
    btn.innerHTML = btn.dataset.origText || btn.innerHTML;
    btn.classList.remove('btn-loading');
    btn.disabled = false;
  }
}

// ── Format ─────────────────────────────────────
export function formatPrice(n) {
  return '₦' + Number(n).toLocaleString('en-NG');
}

export function formatDate(ts) {
  if (!ts) return '—';
  const d = ts.toDate ? ts.toDate() : new Date(ts);
  return d.toLocaleDateString('en-NG', { day: 'numeric', month: 'short', year: 'numeric' });
}

export function formatStatus(s) {
  const map = {
    pending: ['🟡', 'Pending'],
    processing: ['🔵', 'Processing'],
    ready: ['🟠', 'Ready for Pickup'],
    shipped: ['🚚', 'Shipped'],
    delivered: ['✅', 'Delivered'],
    cancelled: ['❌', 'Cancelled'],
  };
  return map[s] || ['⚪', s];
}

// ── Cart Fly Animation ─────────────────────────
export function cartFlyAnimation(imgEl, targetEl) {
  if (!imgEl || !targetEl) return;
  const imgRect = imgEl.getBoundingClientRect();
  const targetRect = targetEl.getBoundingClientRect();

  const fly = document.createElement('div');
  fly.className = 'cart-fly-item';
  fly.innerHTML = `<img src="${imgEl.src}" alt="">`;
  fly.style.cssText = `
    left: ${imgRect.left}px; top: ${imgRect.top}px;
    width: ${imgRect.width}px; height: ${imgRect.height}px;
  `;
  document.body.appendChild(fly);

  const dx = targetRect.left + targetRect.width / 2 - imgRect.left - imgRect.width / 2;
  const dy = targetRect.top + targetRect.height / 2 - imgRect.top - imgRect.height / 2;

  fly.animate([
    { transform: 'translate(0,0) scale(1)', opacity: 1 },
    { transform: `translate(${dx}px,${dy}px) scale(0.2)`, opacity: 0.5, offset: 0.8 },
    { transform: `translate(${dx}px,${dy}px) scale(0)`, opacity: 0 }
  ], { duration: 700, easing: 'cubic-bezier(0.4,0,0.2,1)', fill: 'forwards' })
    .onfinish = () => fly.remove();
}

// ── Navbar HTML builder ────────────────────────
export function buildNavbar() {
  const page = window.location.pathname.split('/').pop() || 'index.html';
  return `
  <nav class="navbar">
    <div class="navbar-inner">
      <a href="index.html" class="navbar-logo">Shop<span>MKT</span></a>

      <div class="navbar-search">
        <span class="search-icon">🔍</span>
        <input type="text" id="global-search" placeholder="Search products, brands, categories…" autocomplete="off">
      </div>

      <div class="navbar-actions">
        <div id="nav-auth-links" class="flex gap-4">
          <a href="pages/login.html" class="btn btn-ghost btn-sm">Sign In</a>
          <a href="pages/register.html" class="btn btn-primary btn-sm">Register</a>
        </div>

        <div id="nav-user-menu" class="hidden flex items-center gap-4">
          <div class="dropdown" id="user-dropdown">
            <button class="nav-user-btn" onclick="document.getElementById('user-dropdown').classList.toggle('open')">
              <div class="user-avatar" id="nav-avatar">U</div>
              <span id="nav-user-name">User</span>
              <span>▾</span>
            </button>
            <div class="dropdown-menu">
              <a class="dropdown-item" href="pages/buyer-dashboard.html">👤 My Account</a>
              <a class="dropdown-item" href="pages/orders.html">📦 My Orders</a>
              <div class="dropdown-divider"></div>
              <a class="dropdown-item" href="pages/seller-dashboard.html">🏪 Seller Dashboard</a>
              <a class="dropdown-item" href="pages/admin.html">⚙️ Admin Panel</a>
              <div class="dropdown-divider"></div>
              <div class="dropdown-item" id="logout-btn" onclick="window.__logout()">🚪 Sign Out</div>
            </div>
          </div>
        </div>

        <a href="pages/cart.html" class="nav-icon-btn" title="Cart">
          🛒
          <span class="nav-badge" id="cart-badge" style="display:none">0</span>
        </a>

        <a href="pages/wishlist.html" class="nav-icon-btn" title="Wishlist">❤️</a>
      </div>
    </div>
  </nav>
  <div id="toast-container"></div>
  `;
}

// ── Global click-outside to close dropdowns ────
document.addEventListener('click', (e) => {
  document.querySelectorAll('.dropdown.open').forEach(d => {
    if (!d.contains(e.target)) d.classList.remove('open');
  });
});

// ── Global search ──────────────────────────────
document.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    const s = document.getElementById('global-search');
    if (document.activeElement === s && s.value.trim()) {
      window.location.href = `pages/search.html?q=${encodeURIComponent(s.value.trim())}`;
    }
  }
});

window.__logout = logoutUser;
