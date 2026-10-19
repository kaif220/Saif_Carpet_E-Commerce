(() => {
"use strict";
const $ = (s, r = document) => r.querySelector(s);
const view = $("#view");
const esc = v => String(v ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const inr = n => "₹" + Number(n).toLocaleString("en-IN", { maximumFractionDigits: 0 });
const stars = n => `<span class="stars">${"★".repeat(Math.round(n))}${"☆".repeat(5 - Math.round(n))}</span>`;
const img = p => p.image || "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='400' height='400'><rect fill='%23efe5d4' width='400' height='400'/></svg>";

// ---------- state ----------
const store = {
  get(k, d) { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} },
  del(k) { try { localStorage.removeItem(k); } catch {} },
};
let user = store.get("user", null);
let cart = store.get("cart", []);   // [{id,name,price,image,qty,stock}]
const saveCart = () => { store.set("cart", cart); nav(); };

function toast(msg) { const t = $("#toast"); t.textContent = msg; t.classList.add("show"); clearTimeout(t._t); t._t = setTimeout(() => t.classList.remove("show"), 2600); }

// ---------- api (JWT + auto refresh) ----------
async function api(path, { method = "GET", body, auth = true, _retry } = {}) {
  const h = {}; const tok = store.get("access");
  if (auth && tok) h.Authorization = "Bearer " + tok;
  let data = body;
  if (body && !(body instanceof FormData)) { h["Content-Type"] = "application/json"; data = JSON.stringify(body); }
  const r = await fetch("/api/" + path, { method, headers: h, body: data });
  if (r.status === 401 && auth && !_retry && store.get("refresh")) {
    const rr = await fetch("/api/auth/refresh/", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ refresh: store.get("refresh") }) });
    if (rr.ok) { store.set("access", (await rr.json()).access); return api(path, { method, body, auth, _retry: true }); }
    clearAuth(); location.hash = "#/login";
  }
  if (r.status === 204) return null;
  const j = await r.json().catch(() => ({}));
  if (!r.ok) { const e = new Error(flat(j)); e.data = j; throw e; }
  return j;
}
const flat = j => typeof j === "string" ? j : j.detail || Object.entries(j).map(([k, v]) => `${k}: ${Array.isArray(v) ? v.join(" ") : typeof v === "object" ? flat(v) : v}`).join(" | ");
function clearAuth() { ["access", "refresh", "user"].forEach(store.del); user = null; nav(); }

// ---------- nav ----------
function nav() {
  const n = cart.reduce((a, c) => a + c.qty, 0);
  $("#links").innerHTML = `
    <a href="#/shop">Shop</a><a href="#/events">Events</a>
    <a href="#/cart">Cart${n ? `<span class="badge">${n}</span>` : ""}</a>
    ${user ? `${user.is_admin ? '<a href="#/admin">Admin</a>' : ""}<a href="#/orders">Orders</a><button id="lo">Logout (${esc(user.username)})</button>`
      : `<a href="#/login">Login</a><a href="#/register" class="btn sm">Register</a>`}`;
  const lo = $("#lo");
  if (lo) lo.onclick = async () => { try { await api("auth/logout/", { method: "POST", body: { refresh: store.get("refresh") } }); } catch {} clearAuth(); toast("Logged out"); location.hash = "#/"; };
}
$("#navSearch").onsubmit = e => { e.preventDefault(); location.hash = "#/shop?q=" + encodeURIComponent($("#navQ").value); };

// ---------- components ----------
const card = p => `<a class="card" href="#/product/${p.id}" style="text-decoration:none">
  ${p.discount ? `<span class="tag">${p.discount}% OFF</span>` : ""}<img loading="lazy" src="${esc(img(p))}" alt="${esc(p.name)}">
  <div class="b"><h3>${esc(p.name)}</h3><div class="mut">${esc(p.size)} &middot; ${esc(p.quality)}</div>
  <div>${stars(p.avg_rating)} <span class="mut">(${p.review_count})</span></div>
  <div class="price">${p.discount ? `<s>${inr(p.price)}</s>` : ""}${inr(p.final_price)}</div></div></a>`;

function addToCart(p, qty = 1) {
  const ex = cart.find(c => c.id === p.id);
  if (ex) ex.qty = Math.min(ex.qty + qty, p.stock); else cart.push({ id: p.id, name: p.name, price: p.final_price, image: p.image, qty, stock: p.stock });
  saveCart(); toast("Added to cart");
}

// ---------- pages ----------
async function home() {
  view.innerHTML = "<p>Loading...</p>";
  const [feat, sales, events] = await Promise.all([api("products/?featured=1", { auth: false }), api("sales/", { auth: false }), api("events/", { auth: false })]);
  let items = feat.results; if (!items.length) items = (await api("products/", { auth: false })).results.slice(0, 4);
  view.innerHTML = `${sales.map(s => `<div class="banner">SALE: ${esc(s.title)} - ${s.percent}% off until ${new Date(s.ends_at).toLocaleDateString()}</div>`).join("")}
  <section class="hero"><div><h1>Handcrafted rugs that make a house feel like home.</h1>
  <p>Braided, crochet and printed jute rugs - natural, durable and eco-friendly. Choose your delivery slot and pay your way.</p>
  <a class="btn" href="#/shop">Shop all rugs</a> <a class="btn alt" href="#/events">Upcoming events</a></div>
  ${items[0] ? `<img src="${esc(img(items[0]))}" alt="Featured rug">` : ""}</section>
  <div class="sec"><h2>Featured</h2><a href="#/shop">View all &rarr;</a></div><div class="grid">${items.map(card).join("")}</div>
  ${events.length ? `<div class="sec"><h2>Events</h2></div>${events.slice(0, 2).map(evHtml).join("")}` : ""}`;
}
const evHtml = e => { const d = new Date(e.starts_at); return `<div class="ev"><div class="d">${d.getDate()}<br><small>${d.toLocaleString("en", { month: "short" })}</small></div>
  <div><b>${esc(e.title)}</b><div class="mut">${esc(e.location)}</div><div>${esc(e.description)}</div></div></div>`; };
async function events() { const ev = await api("events/", { auth: false }); view.innerHTML = `<h1>Events</h1>${ev.map(evHtml).join("") || "<p>No upcoming events.</p>"}`; }

async function shop(params) {
  const cats = await api("categories/", { auth: false });
  const q = new URLSearchParams(params);
  view.innerHTML = `<h1>All Rugs</h1>
  <form class="bar" id="flt"><input name="search" placeholder="Search..." value="${esc(q.get("q") || q.get("search") || "")}">
  <select name="category"><option value="">All categories</option>${cats.map(c => `<option value="${c.id}" ${q.get("category") == c.id ? "selected" : ""}>${esc(c.name)}</option>`).join("")}</select>
  <input name="min_price" type="number" placeholder="Min ₹" value="${esc(q.get("min_price") || "")}"><input name="max_price" type="number" placeholder="Max ₹" value="${esc(q.get("max_price") || "")}">
  <select name="ordering">${[["", "Newest"], ["price", "Price: low to high"], ["-price", "Price: high to low"], ["name", "Name A-Z"]].map(([v, l]) => `<option value="${v}" ${q.get("ordering") === v ? "selected" : ""}>${l}</option>`).join("")}</select>
  <button class="btn">Apply</button></form><div id="res"></div>`;
  $("#flt").onsubmit = e => { e.preventDefault(); const f = new URLSearchParams(); new FormData(e.target).forEach((v, k) => v && f.set(k, v)); location.hash = "#/shop?" + f; };
  const f = new URLSearchParams(); ["search", "category", "min_price", "max_price", "ordering", "page"].forEach(k => q.get(k) && f.set(k, q.get(k)));
  if (q.get("q")) f.set("search", q.get("q"));
  const d = await api("products/?" + f, { auth: false }); const page = +(q.get("page") || 1);
  const base = new URLSearchParams(q); base.delete("page");
  $("#res").innerHTML = d.results.length ? `<div class="grid">${d.results.map(card).join("")}</div>
   <div class="pager">${d.previous ? `<a class="btn alt" href="#/shop?${base}&page=${page - 1}">&larr; Prev</a>` : ""}<span class="mut" style="align-self:center">Page ${page} &middot; ${d.count} rugs</span>${d.next ? `<a class="btn alt" href="#/shop?${base}&page=${page + 1}">Next &rarr;</a>` : ""}</div>` : "<p>No rugs found.</p>";
}

async function product(id) {
  const [p, revs] = await Promise.all([api(`products/${id}/`), api(`products/${id}/reviews/`)]);
  view.innerHTML = `<div class="two"><div><img src="${esc(img(p))}" alt="${esc(p.name)}" style="border-radius:18px;width:100%"></div>
  <div><div class="mut">${esc(p.category_name || "")} &middot; Design ${esc(p.code)}</div><h1>${esc(p.name)}</h1>
  <div>${stars(p.avg_rating)} <span class="mut">${p.avg_rating} (${p.review_count} reviews)</span></div>
  <p class="price" style="font-size:28px">${p.discount ? `<s>${inr(p.price)}</s>` : ""}${inr(p.final_price)} ${p.discount ? `<span class="pill" style="background:#ffe1d6;color:var(--sale)">${p.discount}% OFF</span>` : ""}</p>
  <p>${esc(p.description)}</p><table><tr><th>Size</th><td>${esc(p.size)}</td></tr><tr><th>Colour</th><td>${esc(p.color)}</td></tr><tr><th>Quality</th><td>${esc(p.quality)}</td></tr><tr><th>Stock</th><td>${p.stock ? p.stock + " available" : "Out of stock"}</td></tr></table><br>
  <div class="qty"><button id="m">-</button><b id="q">1</b><button id="pl">+</button></div>
  <button class="btn" id="add" ${p.stock ? "" : "disabled"}>Add to cart</button></div></div>
  <div class="sec"><h2>Customer reviews</h2></div><div class="two"><div class="panel" id="rl">${revHtml(revs)}</div>
  <div class="panel">${user ? `<h3>Write a review</h3><form class="f" id="rf"><label>Rating<select name="rating">${[5, 4, 3, 2, 1].map(n => `<option value="${n}">${"★".repeat(n)} (${n})</option>`).join("")}</select></label>
  <label>Title<input name="title" maxlength="120"></label><label>Your review<textarea name="comment" rows="4" required></textarea></label><div class="err" id="re"></div><button class="btn">Submit review</button></form>`
      : `<p>Please <a href="#/login"><b>login</b></a> to write a review.</p>`}</div></div>`;
  let qty = 1; const set = n => { qty = Math.max(1, Math.min(n, p.stock || 1)); $("#q").textContent = qty; };
  $("#m").onclick = () => set(qty - 1); $("#pl").onclick = () => set(qty + 1); $("#add").onclick = () => addToCart(p, qty);
  bindRevDel(id);
  const rf = $("#rf");
  if (rf) rf.onsubmit = async e => { e.preventDefault(); try { await api(`products/${id}/reviews/`, { method: "POST", body: Object.fromEntries(new FormData(rf)) }); toast("Review posted"); product(id); } catch (x) { $("#re").textContent = x.message; } };
}
const revHtml = r => r.length ? r.map(x => `<div class="rev"><b>${esc(x.username)}</b> ${stars(x.rating)} <span class="mut">${new Date(x.created_at).toLocaleDateString()}</span>
  ${x.title ? `<div><b>${esc(x.title)}</b></div>` : ""}<div>${esc(x.comment)}</div>${x.mine || (user && user.is_admin) ? `<button class="btn red sm" data-del="${x.id}">Delete</button>` : ""}</div>`).join("") : "<p class='mut'>No reviews yet - be the first!</p>";
function bindRevDel(pid) { document.querySelectorAll("[data-del]").forEach(b => b.onclick = async () => { if (confirm("Delete this review?")) { await api(`reviews/${b.dataset.del}/`, { method: "DELETE" }); product(pid); } }); }

function cartPage() {
  if (!cart.length) { view.innerHTML = `<h1>Your cart</h1><p>Cart is empty. <a href="#/shop"><b>Browse rugs</b></a></p>`; return; }
  const total = cart.reduce((a, c) => a + c.price * c.qty, 0);
  const today = new Date().toISOString().slice(0, 10);
  view.innerHTML = `<h1>Cart &amp; Checkout</h1><div class="two"><div class="panel overflow"><table>${cart.map((c, i) => `<tr><td><img src="${esc(img(c))}" alt=""></td><td>${esc(c.name)}<div class="mut">${inr(c.price)}</div></td>
   <td><span class="qty"><button data-d="${i}">-</button>${c.qty}<button data-u="${i}">+</button></span></td><td>${inr(c.price * c.qty)}</td><td><button class="btn red sm" data-r="${i}">x</button></td></tr>`).join("")}</table>
   <h2 style="margin-top:14px">Total: ${inr(total)}</h2></div>
  <div class="panel"><h3>Delivery &amp; payment</h3>${user ? `<form class="f" id="co">
   <div class="row2"><label>Full name<input name="full_name" required value="${esc(user.first_name || user.username)}"></label><label>Phone<input name="phone" required pattern="[0-9+ ]{8,15}"></label></div>
   <label>Address<textarea name="address" rows="2" required></textarea></label>
   <div class="row2"><label>City<input name="city" required></label><label>Pincode<input name="pincode" required pattern="[0-9]{6}"></label></div>
   <div class="row2"><label>Latitude<input name="latitude" id="lat" step="any" type="number"></label><label>Longitude<input name="longitude" id="lng" step="any" type="number"></label></div>
   <button type="button" class="btn alt" id="geo">Use my current location</button>
   <div class="row2"><label>Delivery date<input type="date" name="delivery_date" min="${today}" value="${today}" required></label>
   <label>Time slot<select name="delivery_slot"><option>9 AM - 12 PM</option><option>12 PM - 3 PM</option><option>3 PM - 6 PM</option><option>6 PM - 9 PM</option></select></label></div>
   <label>Payment<select name="payment_method" id="pm"><option value="COD">Cash on Delivery</option><option value="UPI">UPI</option><option value="CARD">Card</option></select></label>
   <div id="payx"></div><div class="err" id="ce"></div><button class="btn">Place order - ${inr(total)}</button></form>` : `<p>Please <a href="#/login"><b>login</b></a> to checkout.</p>`}</div></div>`;
  document.querySelectorAll("[data-d]").forEach(b => b.onclick = () => { const c = cart[b.dataset.d]; c.qty--; if (c.qty < 1) cart.splice(b.dataset.d, 1); saveCart(); cartPage(); });
  document.querySelectorAll("[data-u]").forEach(b => b.onclick = () => { const c = cart[b.dataset.u]; if (c.qty < c.stock) c.qty++; saveCart(); cartPage(); });
  document.querySelectorAll("[data-r]").forEach(b => b.onclick = () => { cart.splice(b.dataset.r, 1); saveCart(); cartPage(); });
  const co = $("#co"); if (!co) return;
  $("#geo").onclick = () => navigator.geolocation ? navigator.geolocation.getCurrentPosition(p => { $("#lat").value = p.coords.latitude.toFixed(6); $("#lng").value = p.coords.longitude.toFixed(6); toast("Location captured"); }, () => toast("Location permission denied")) : toast("Geolocation not supported");
  $("#pm").onchange = e => $("#payx").innerHTML = e.target.value === "UPI" ? `<label>UPI ID<input required placeholder="name@upi" pattern="[\\w.\\-]+@[\\w]+"></label><small class="mut">Demo gateway - no real money is charged.</small>`
    : e.target.value === "CARD" ? `<small class="mut">Demo gateway: card is auto-approved. Card details are never stored. Connect Razorpay/Stripe for live payments.</small>` : "";
  co.onsubmit = async e => {
    e.preventDefault(); const d = Object.fromEntries(new FormData(co));
    ["latitude", "longitude"].forEach(k => { if (!d[k]) delete d[k]; });
    d.items = cart.map(c => ({ product: c.id, quantity: c.qty }));
    try { const o = await api("orders/", { method: "POST", body: d }); cart = []; saveCart(); toast("Order #" + o.id + " placed!"); location.hash = "#/orders"; } catch (x) { $("#ce").textContent = x.message; }
  };
}

async function orders() {
  if (!user) return (location.hash = "#/login");
  const d = await api("orders/"); const list = d.results || d;
  view.innerHTML = `<h1>My orders</h1>${list.map(o => `<div class="panel" style="margin-bottom:12px"><b>Order #${o.id}</b> <span class="pill ${o.status}">${o.status}</span> <span class="pill ${o.payment_status}">${o.payment_method} - ${o.payment_status}</span>
   <div class="mut">Delivery: ${o.delivery_date}, ${esc(o.delivery_slot)} &middot; ${esc(o.address)}, ${esc(o.city)} ${esc(o.pincode)}</div>
   <ul>${o.items.map(i => `<li>${esc(i.product_name)} x ${i.quantity} - ${inr(i.unit_price * i.quantity)}</li>`).join("")}</ul><b>Total ${inr(o.total)}</b>
   ${o.status === "PLACED" ? ` <button class="btn red sm" data-c="${o.id}">Cancel</button>` : ""}</div>`).join("") || "<p>No orders yet.</p>"}`;
  document.querySelectorAll("[data-c]").forEach(b => b.onclick = async () => { if (confirm("Cancel order?")) { await api(`orders/${b.dataset.c}/`, { method: "PATCH", body: { status: "CANCELLED" } }); orders(); } });
}

function authPage(mode) {
  const reg = mode === "register";
  view.innerHTML = `<div class="panel auth"><h1>${reg ? "Create account" : "Welcome back"}</h1><form class="f" id="af">
  <label>Username<input name="username" required autocomplete="username"></label>
  ${reg ? `<label>Name<input name="first_name"></label><label>Email<input name="email" type="email" required></label>` : ""}
  <label>Password<input name="password" type="password" required minlength="6" autocomplete="${reg ? "new" : "current"}-password"></label>
  <div class="err" id="ae"></div><button class="btn">${reg ? "Register" : "Login"}</button></form>
  <p class="mut">${reg ? 'Have an account? <a href="#/login">Login</a>' : 'New here? <a href="#/register">Register</a>'}</p></div>`;
  $("#af").onsubmit = async e => {
    e.preventDefault(); const d = Object.fromEntries(new FormData(e.target));
    try {
      const r = await api(reg ? "auth/register/" : "auth/login/", { method: "POST", body: d, auth: false });
      store.set("access", r.access); store.set("refresh", r.refresh);
      user = r.user || await api("auth/me/"); store.set("user", user); nav(); toast("Hello " + user.username); location.hash = user.is_admin ? "#/admin" : "#/";
    } catch (x) { $("#ae").textContent = x.message.replace("No active account found with the given credentials", "Wrong username or password"); }
  };
}

// ---------- admin ----------
async function admin(tab = "dash") {
  if (!user || !user.is_admin) { view.innerHTML = "<h1>Admins only</h1>"; return; }
  const T = [["dash", "Dashboard"], ["products", "Products"], ["events", "Events"], ["sales", "Sales"], ["orders", "Orders"]];
  view.innerHTML = `<h1>Admin panel</h1><div class="tabs">${T.map(([k, l]) => `<button class="${k === tab ? "on" : ""}" data-t="${k}">${l}</button>`).join("")}</div><div id="ab"></div>`;
  document.querySelectorAll("[data-t]").forEach(b => b.onclick = () => admin(b.dataset.t));
  const ab = $("#ab");
  if (tab === "dash") {
    const s = await api("admin/stats/");
    ab.innerHTML = `<div class="stats">${[["Revenue", inr(s.revenue)], ["Orders", s.orders], ["Products", s.products], ["Customers", s.users], ["Reviews", s.reviews]].map(([l, v]) => `<div class="stat"><b>${v}</b>${l}</div>`).join("")}</div>
    <h3>Low stock</h3>${s.low_stock.map(p => `<div>${esc(p.code)} - ${esc(p.name)}: <b>${p.stock}</b></div>`).join("") || "<p class='mut'>All good.</p>"}`;
  }
  if (tab === "products") {
    const [cats, pr] = await Promise.all([api("categories/"), api("products/?page_size=200")]);
    const list = pr.results;
    ab.innerHTML = `<div class="panel"><h3 id="pt">Add product</h3><form class="f" id="pf"><input type="hidden" name="id">
     <div class="row2"><label>Design code<input name="code" required></label><label>Name<input name="name" required></label></div>
     <div class="row2"><label>Category<select name="category"><option value="">-</option>${cats.map(c => `<option value="${c.id}">${esc(c.name)}</option>`).join("")}</select></label><label>Price (INR / piece)<input name="price" type="number" step="0.01" required></label></div>
     <div class="row2"><label>Size<input name="size"></label><label>Colour<input name="color"></label></div>
     <div class="row2"><label>Quality<input name="quality"></label><label>Stock<input name="stock" type="number" value="10" min="0"></label></div>
     <label>Description<textarea name="description" rows="2"></textarea></label><label>Image<input name="image" type="file" accept="image/*"></label>
     <label><span><input type="checkbox" name="featured" style="width:auto"> Featured</span></label><label><span><input type="checkbox" name="is_active" checked style="width:auto"> Active (visible)</span></label>
     <div class="err" id="pe"></div><div><button class="btn">Save product</button> <button type="button" class="btn alt" id="pc">Clear</button></div></form></div><br>
     <div class="overflow"><table><tr><th></th><th>Code</th><th>Name</th><th>Price</th><th>Stock</th><th>Status</th><th></th></tr>${list.map(p => `<tr><td><img src="${esc(img(p))}" alt=""></td><td>${esc(p.code)}</td><td>${esc(p.name)}</td><td>${inr(p.price)}</td><td>${p.stock}</td><td>${p.is_active ? "Live" : "Hidden"}</td>
     <td><button class="btn alt sm" data-e="${p.id}">Edit</button> <button class="btn red sm" data-x="${p.id}">Remove</button></td></tr>`).join("")}</table></div>`;
    const pf = $("#pf");
    $("#pc").onclick = () => admin("products");
    document.querySelectorAll("[data-e]").forEach(b => b.onclick = () => { const p = list.find(x => x.id == b.dataset.e); $("#pt").textContent = "Edit " + p.code;
      ["id", "code", "name", "category", "price", "size", "color", "quality", "stock", "description"].forEach(k => pf.elements[k].value = p[k] ?? ""); pf.elements.featured.checked = p.featured; pf.elements.is_active.checked = p.is_active; scrollTo(0, 0); });
    document.querySelectorAll("[data-x]").forEach(b => b.onclick = async () => { if (confirm("Remove this product permanently?")) { await api(`products/${b.dataset.x}/`, { method: "DELETE" }); toast("Removed"); admin("products"); } });
    pf.onsubmit = async e => {
      e.preventDefault(); const fd = new FormData(pf); const id = fd.get("id"); fd.delete("id");
      fd.set("featured", pf.elements.featured.checked); fd.set("is_active", pf.elements.is_active.checked);
      if (!fd.get("category")) fd.delete("category"); if (!pf.elements.image.files.length) fd.delete("image");
      try { await api(id ? `products/${id}/` : "products/", { method: id ? "PATCH" : "POST", body: fd }); toast("Saved"); admin("products"); } catch (x) { $("#pe").textContent = x.message; }
    };
  }
  if (tab === "events" || tab === "sales") {
    const isE = tab === "events"; const list = await api(tab + "/");
    const prods = isE ? [] : (await api("products/?page_size=200")).results;
    ab.innerHTML = `<div class="panel"><h3>Add ${isE ? "event" : "sale"}</h3><form class="f" id="xf"><label>Title<input name="title" required></label>
     ${isE ? `<label>Location<input name="location"></label><label>Description<textarea name="description"></textarea></label><div class="row2"><label>Starts<input type="datetime-local" name="starts_at" required></label><label>Ends<input type="datetime-local" name="ends_at"></label></div>`
        : `<label>Discount %<input type="number" name="percent" min="1" max="90" required></label><div class="row2"><label>Starts<input type="datetime-local" name="starts_at" required></label><label>Ends<input type="datetime-local" name="ends_at" required></label></div>
         <label>Products (none selected = ALL products)<select name="products" multiple size="5">${prods.map(p => `<option value="${p.id}">${esc(p.code)} - ${esc(p.name)}</option>`).join("")}</select></label>`}
     <div class="err" id="xe"></div><button class="btn">Add</button></form></div><br>
     <table><tr><th>Title</th><th>${isE ? "When" : "Discount"}</th><th>Active</th><th></th></tr>${list.map(x => `<tr><td>${esc(x.title)}</td><td>${isE ? new Date(x.starts_at).toLocaleString() : x.percent + "% (" + new Date(x.starts_at).toLocaleDateString() + " - " + new Date(x.ends_at).toLocaleDateString() + ")"}</td>
     <td><button class="btn alt sm" data-a="${x.id}" data-v="${x.is_active}">${x.is_active ? "On" : "Off"}</button></td><td><button class="btn red sm" data-x="${x.id}">Remove</button></td></tr>`).join("")}</table>`;
    document.querySelectorAll("[data-x]").forEach(b => b.onclick = async () => { if (confirm("Remove?")) { await api(`${tab}/${b.dataset.x}/`, { method: "DELETE" }); admin(tab); } });
    document.querySelectorAll("[data-a]").forEach(b => b.onclick = async () => { await api(`${tab}/${b.dataset.a}/`, { method: "PATCH", body: { is_active: b.dataset.v !== "true" } }); admin(tab); });
    $("#xf").onsubmit = async e => {
      e.preventDefault(); const f = e.target; const d = Object.fromEntries(new FormData(f));
      ["starts_at", "ends_at"].forEach(k => { if (d[k]) d[k] = new Date(d[k]).toISOString(); else delete d[k]; });
      if (!isE) d.products = [...f.products.selectedOptions].map(o => +o.value);
      try { await api(tab + "/", { method: "POST", body: d }); toast("Added"); admin(tab); } catch (x) { $("#xe").textContent = x.message; }
    };
  }
  if (tab === "orders") {
    const d = await api("orders/"); const list = d.results || d; const S = ["PLACED", "CONFIRMED", "SHIPPED", "DELIVERED", "CANCELLED"];
    ab.innerHTML = `<div class="overflow"><table><tr><th>#</th><th>Customer</th><th>Delivery</th><th>Location</th><th>Payment</th><th>Total</th><th>Status</th></tr>${list.map(o => `<tr><td>${o.id}</td><td>${esc(o.username)}<br><small>${esc(o.full_name)} ${esc(o.phone)}</small></td>
     <td>${o.delivery_date}<br><small>${esc(o.delivery_slot)}</small></td><td><small>${esc(o.address)}, ${esc(o.city)} ${esc(o.pincode)}</small>${o.latitude ? `<br><a target="_blank" rel="noopener" href="https://maps.google.com/?q=${o.latitude},${o.longitude}">Map</a>` : ""}</td>
     <td>${o.payment_method}<br><span class="pill ${o.payment_status}">${o.payment_status}</span></td><td>${inr(o.total)}</td>
     <td><select data-s="${o.id}">${S.map(s => `<option ${s === o.status ? "selected" : ""}>${s}</option>`).join("")}</select></td></tr>`).join("")}</table></div>`;
    document.querySelectorAll("[data-s]").forEach(s => s.onchange = async () => { const body = { status: s.value }; if (s.value === "DELIVERED") body.payment_status = "PAID"; await api(`orders/${s.dataset.s}/`, { method: "PATCH", body }); toast("Updated"); });
  }
}

// ---------- router ----------
async function route() {
  const [path, qs] = (location.hash.slice(1) || "/").split("?"); const seg = path.split("/").filter(Boolean);
  scrollTo(0, 0);
  try {
    if (!seg.length) await home();
    else if (seg[0] === "shop") await shop(qs || "");
    else if (seg[0] === "product") await product(seg[1]);
    else if (seg[0] === "cart") cartPage();
    else if (seg[0] === "orders") await orders();
    else if (seg[0] === "events") await events();
    else if (seg[0] === "login") authPage("login");
    else if (seg[0] === "register") authPage("register");
    else if (seg[0] === "admin") await admin();
    else view.innerHTML = "<h1>Page not found</h1>";
  } catch (e) { view.innerHTML = `<h1>Oops</h1><p class="err">${esc(e.message)}</p>`; }
}
addEventListener("hashchange", route);
nav(); route();
})();
