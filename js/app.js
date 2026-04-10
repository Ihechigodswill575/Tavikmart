// ================================================
// TAVIKMART — Main App Logic
// ================================================

import { auth, db, storage } from './firebase-config.js';
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  updateProfile as fbUpdateProfile,
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import {
  collection, doc, getDoc, getDocs, addDoc, updateDoc, deleteDoc,
  query, where, orderBy, limit, serverTimestamp, setDoc,
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import {
  ref, uploadBytesResumable, getDownloadURL,
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-storage.js";

// ── Determine base path (root vs pages/) ─────────
const IS_IN_PAGES = window.location.pathname.includes('/pages/');
const BASE = IS_IN_PAGES ? '../' : './';
const PAGES = IS_IN_PAGES ? '' : 'pages/';

// ── Backend API base URL ──────────────────────────
export const API_BASE = window.TAVIKMART_API || 'http://localhost:5000';

// ── State ─────────────────────────────────────────
export const state = {
  user: null,
  userProfile: null,
  cart: JSON.parse(localStorage.getItem('tavikmart_cart') || '[]'),
};

// ── Auth ──────────────────────────────────────────
onAuthStateChanged(auth, async (user) => {
  state.user = user;
  if (user) {
    try {
      const snap = await getDoc(doc(db, 'users', user.uid));
      state.userProfile = snap.exists() ? snap.data() : null;
    } catch (e) {
      state.userProfile = null;
    }
  } else {
    state.userProfile = null;
  }
  document.dispatchEvent(new CustomEvent('auth-changed', {
    detail: { user, profile: state.userProfile },
  }));
  updateNavUI();
});

export async function registerUser({ email, password, name, role = 'buyer', extra = {} }) {
  const cred = await createUserWithEmailAndPassword(auth, email, password);
  await fbUpdateProfile(cred.user, { displayName: name });
  await setDoc(doc(db, 'users', cred.user.uid), {
    uid: cred.user.uid, email, name, role,
    status: 'active',
    createdAt: serverTimestamp(),
    ...extra,
  });
  return cred.user;
}

export async function loginUser({ email, password }) {
  const cred = await signInWithEmailAndPassword(auth, email, password);
  return cred.user;
}

export async function logoutUser() {
  await signOut(auth);
  window.location.href = `${BASE}index.html`;
}

// ── Cart ──────────────────────────────────────────
export function getCart() { return state.cart; }

export function addToCart(product, qty = 1) {
  const existing = state.cart.find(i => i.id === product.id);
  if (existing) {
    existing.qty = Math.min(existing.qty + qty, 999);
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
  if (item) {
    item.qty = parseInt(qty);
    if (item.qty <= 0) return removeFromCart(productId);
  }
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
  localStorage.setItem('tavikmart_cart', JSON.stringify(state.cart));
}

// ── Firestore Helpers ─────────────────────────────
export async function getProducts(filters = {}) {
  const constraints = [];
  if (filters.category) constraints.push(where('category', '==', filters.category));
  if (filters.sellerId) constraints.push(where('sellerId', '==', filters.sellerId));
  if (filters.status) {
    constraints.push(where('status', '==', filters.status));
  } else {
    constraints.push(where('status', '==', 'approved'));
  }
  constraints.push(orderBy('createdAt', 'desc'));
  if (filters.limit) constraints.push(limit(filters.limit));

  const snap = await getDocs(query(collection(db, 'products'), ...constraints));
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

export async function getProduct(id) {
  const snap = await getDoc(doc(db, 'products', id));
  return snap.exists() ? { id: snap.id, ...snap.data() } : null;
}

export async function createProduct(data) {
  return await addDoc(collection(db, 'products'), {
    ...data,
    status: 'pending',
    rating: 0,
    reviewCount: 0,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
}

export async function updateProduct(id, data) {
  await updateDoc(doc(db, 'products', id), { ...data, updatedAt: serverTimestamp() });
}

export async function deleteProduct(id) {
  await deleteDoc(doc(db, 'products', id));
}

export async function createOrder(orderData) {
  const orderId = 'TVM-' + Date.now().toString().slice(-6) + Math.random().toString(36).slice(2, 5).toUpperCase();
  const ref = await addDoc(collection(db, 'orders'), {
    ...orderData,
    orderId,
    orderStatus: 'pending',
    paymentStatus: orderData.paymentStatus || 'pending',
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
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
  await updateDoc(doc(db, 'orders', id), { orderStatus: status, updatedAt: serverTimestamp() });
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
  try {
    const snap = await getDocs(query(collection(db, 'categories'), where('active', '==', true), orderBy('sortOrder', 'asc')));
    if (!snap.empty) return snap.docs.map(d => ({ id: d.id, ...d.data() }));
  } catch (e) { /* fall through to defaults */ }
  return [
    { id: 'electronics', name: 'Electronics', icon: '📱' },
    { id: 'fashion', name: 'Fashion', icon: '👗' },
    { id: 'home', name: 'Home & Living', icon: '🏠' },
    { id: 'beauty', name: 'Beauty', icon: '💄' },
    { id: 'sports', name: 'Sports', icon: '⚽' },
    { id: 'food', name: 'Grocery', icon: '🛒' },
    { id: 'automotive', name: 'Automotive', icon: '🚗' },
    { id: 'books', name: 'Books', icon: '📚' },
  ];
}

// ── UI Helpers ────────────────────────────────────
export function updateNavUI() {
  const userMenu = document.getElementById('nav-user-menu');
  const authLinks = document.getElementById('nav-auth-links');

  updateCartBadge();

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
    void badge.offsetHeight; // reflow
    badge.style.animation = 'popIn 0.3s cubic-bezier(0.34,1.56,0.64,1)';
  }
}

// ── Toast ─────────────────────────────────────────
export function toast(title, msg = '', type = 'info') {
  const icons = { success: '✅', error: '❌', info: 'ℹ️', warning: '⚠️' };
  let container = document.getElementById('toast-container');
  if (!container) {
    container = document.createElement('div');
    container.id = 'toast-container';
    document.body.appendChild(container);
  }

  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.innerHTML = `
    <span class="toast-icon">${icons[type] || 'ℹ️'}</span>
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

// ── Button Loading ────────────────────────────────
export function btnLoading(btn, loading) {
  if (loading) {
    btn.dataset.origHtml = btn.innerHTML;
    btn.innerHTML = `<span class="spinner"></span><span class="btn-text">Please wait…</span>`;
    btn.classList.add('btn-loading');
    btn.disabled = true;
  } else {
    btn.innerHTML = btn.dataset.origHtml || btn.innerHTML;
    btn.classList.remove('btn-loading');
    btn.disabled = false;
  }
}

// ── Format Helpers ────────────────────────────────
export function formatPrice(n) {
  return '₦' + Number(n || 0).toLocaleString('en-NG');
}

export function formatDate(ts) {
  if (!ts) return '—';
  const d = ts.toDate ? ts.toDate() : new Date(ts);
  if (isNaN(d)) return '—';
  return d.toLocaleDateString('en-NG', { day: 'numeric', month: 'short', year: 'numeric' });
}

export function formatStatus(s) {
  const map = {
    pending:    ['🟡', 'Pending'],
    confirmed:  ['🔵', 'Confirmed'],
    processing: ['🔵', 'Processing'],
    ready:      ['🟠', 'Ready for Pickup'],
    shipped:    ['🚚', 'Shipped'],
    delivered:  ['✅', 'Delivered'],
    cancelled:  ['❌', 'Cancelled'],
    returned:   ['↩️', 'Returned'],
  };
  return map[s] || ['⚪', s || 'Unknown'];
}

// ── Cart Fly Animation ────────────────────────────
export function cartFlyAnimation(imgEl, targetEl) {
  if (!imgEl || !targetEl) return;
  const imgRect = imgEl.getBoundingClientRect();
  const targetRect = targetEl.getBoundingClientRect();

  const fly = document.createElement('div');
  fly.className = 'cart-fly-item';
  fly.innerHTML = `<img src="${imgEl.src}" alt="">`;
  fly.style.cssText = `
    position:fixed;
    left:${imgRect.left}px;
    top:${imgRect.top + window.scrollY}px;
    width:${Math.min(imgRect.width, 60)}px;
    height:${Math.min(imgRect.height, 60)}px;
    border-radius:8px;
    overflow:hidden;
    z-index:9999;
    pointer-events:none;
    border:2px solid var(--primary);
    box-shadow:0 4px 20px rgba(245,166,35,0.4);
  `;
  document.body.appendChild(fly);

  const dx = targetRect.left + targetRect.width / 2 - imgRect.left - Math.min(imgRect.width, 60) / 2;
  const dy = targetRect.top - imgRect.top - window.scrollY;

  fly.animate([
    { transform: 'translate(0,0) scale(1)', opacity: 1 },
    { transform: `translate(${dx}px,${dy}px) scale(0.2)`, opacity: 0.5, offset: 0.8 },
    { transform: `translate(${dx}px,${dy}px) scale(0)`, opacity: 0 },
  ], { duration: 700, easing: 'cubic-bezier(0.4,0,0.2,1)', fill: 'forwards' })
    .onfinish = () => fly.remove();
}

// ── Navbar Builder ────────────────────────────────
export function buildNavbar() {
  const pagesPath = IS_IN_PAGES ? '' : 'pages/';
  const rootPath = IS_IN_PAGES ? '../' : './';

  return `
  <nav class="navbar">
    <div class="navbar-inner">
      <a href="${rootPath}index.html" class="navbar-logo">TAVIK<span>MART</span></a>

      <div class="navbar-search">
        <span class="search-icon">🔍</span>
        <input type="text" id="global-search" placeholder="Search products, brands, categories…" autocomplete="off">
      </div>

      <div class="navbar-actions">
        <div id="nav-auth-links" class="flex gap-4">
          <a href="${pagesPath}login.html" class="btn btn-ghost btn-sm">Sign In</a>
          <a href="${pagesPath}register.html" class="btn btn-primary btn-sm">Register</a>
        </div>

        <div id="nav-user-menu" class="hidden flex items-center gap-4">
          <div class="dropdown" id="user-dropdown">
            <button class="nav-user-btn" onclick="document.getElementById('user-dropdown').classList.toggle('open')">
              <div class="user-avatar" id="nav-avatar">U</div>
              <span id="nav-user-name">Account</span>
              <span>▾</span>
            </button>
            <div class="dropdown-menu">
              <a class="dropdown-item" href="${pagesPath}buyer-dashboard.html">👤 My Account</a>
              <a class="dropdown-item" href="${pagesPath}orders.html">📦 My Orders</a>
              <div class="dropdown-divider"></div>
              <a class="dropdown-item" href="${pagesPath}seller-dashboard.html">🏪 Seller Dashboard</a>
              <a class="dropdown-item" href="${pagesPath}admin.html">⚙️ Admin Panel</a>
              <div class="dropdown-divider"></div>
              <div class="dropdown-item" onclick="window.__logout()" style="cursor:pointer">🚪 Sign Out</div>
            </div>
          </div>
        </div>

        <a href="${pagesPath}cart.html" class="nav-icon-btn" title="Cart">
          🛒
          <span class="nav-badge" id="cart-badge" style="display:none">0</span>
        </a>
        <a href="${pagesPath}wishlist.html" class="nav-icon-btn" title="Wishlist">❤️</a>
      </div>
    </div>
  </nav>`;
}

// ── Global click-outside for dropdowns ────────────
document.addEventListener('click', (e) => {
  document.querySelectorAll('.dropdown.open').forEach(d => {
    if (!d.contains(e.target)) d.classList.remove('open');
  });
});

// ── Global search handler ─────────────────────────
document.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    const s = document.getElementById('global-search');
    if (document.activeElement === s && s?.value.trim()) {
      const searchPage = IS_IN_PAGES ? 'search.html' : 'pages/search.html';
      window.location.href = `${searchPage}?q=${encodeURIComponent(s.value.trim())}`;
    }
  }
});

// ── Expose logout globally ────────────────────────
window.__logout = logoutUser;
