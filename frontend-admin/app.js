const API = "http://localhost:8080";

/* ---------- state ---------- */

let admin = JSON.parse(localStorage.getItem("tb_admin") || "null");
let editingEventId = null;
let activeTab = "events";

function esc(s) { return String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c])); }

async function api(path, method = "GET", body) {
  const headers = { "Content-Type": "application/json" };
  if (admin && admin.token) headers.Authorization = "Bearer " + admin.token;
  const res = await fetch(API + path, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let data = text;
  try { data = JSON.parse(text); } catch (e) {}
  if (res.status === 401 || res.status === 403) {
    logout(true);
    throw new Error("Admin session expired / not authorized");
  }
  if (!res.ok) throw new Error(data.message || data.error || text || res.status);
  return data;
}

function formOut(name, text, ok) {
  const el = document.querySelector('[data-out="' + name + '"]');
  el.className = "form-out " + (ok ? "ok" : "err");
  el.textContent = text;
}

/* ---------- auth ---------- */

function renderViews() {
  const loggedIn = !!(admin && admin.token);
  document.getElementById("login-view").hidden = loggedIn;
  document.getElementById("admin-view").hidden = !loggedIn;
  const actions = document.getElementById("top-actions");
  if (loggedIn) {
    actions.innerHTML =
      '<span style="color:#fff;font-weight:900;">' + esc(admin.name) + ' (' + esc(admin.role) + ')</span>' +
      '<a href="http://localhost:3001" class="ghost-btn" style="text-decoration:none;">VIEW USER SITE</a>' +
      '<button class="ghost-btn" id="logout-btn">LOG OUT</button>';
    document.getElementById("logout-btn").addEventListener("click", () => logout());
  } else {
    actions.innerHTML = '<a href="http://localhost:3001" class="ghost-btn" style="text-decoration:none;">VIEW USER SITE</a>';
  }
}

function logout(expired) {
  admin = null;
  localStorage.removeItem("tb_admin");
  renderViews();
  if (expired) {
    const el = document.querySelector('[data-out="login"]');
    if (el) { el.className = "form-out err"; el.textContent = "Session expired — log in again."; }
  }
}

document.getElementById("login-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const f = new FormData(e.target);
  try {
    const login = await fetch(API + "/users/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: f.get("email"), password: f.get("password") }),
    }).then((r) => r.json().catch(() => ({})));
    if (!login.token) throw new Error("Login failed");
    if (login.role !== "ADMIN") throw new Error("This account is not an ADMIN");
    admin = login;
    localStorage.setItem("tb_admin", JSON.stringify(admin));
    formOut("login", "Welcome, " + login.name + "!", true);
    renderViews();
    loadAll();
  } catch (err) {
    formOut("login", err.message, false);
  }
});

/* ---------- tabs ---------- */

document.querySelectorAll(".tab-btn").forEach((btn) => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".tab-btn").forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");
    activeTab = btn.dataset.tab;
    document.querySelectorAll(".tab-panel").forEach((p) => (p.hidden = p.id !== "tab-" + activeTab));
    loadAll();
  });
});

/* ---------- stats ---------- */

async function loadStats() {
  const [stats, bookings, events, users, payments, notifications] = await Promise.all([
    api("/bookings/stats"),
    api("/bookings"),
    api("/events"),
    api("/users"),
    api("/payments"),
    api("/notifications"),
  ]);
  document.getElementById("stats").innerHTML = `
    <div class="stat-card"><b>${events.length}</b><span>TOTAL EVENTS</span></div>
    <div class="stat-card"><b>${stats.confirmed}</b><span>CONFIRMED BOOKINGS</span></div>
    <div class="stat-card"><b>${stats.cancelled}</b><span>CANCELLED</span></div>
    <div class="stat-card"><b>$${stats.revenue}</b><span>REVENUE</span></div>
    <div class="stat-card"><b>${bookings.length}</b><span>TOTAL BOOKINGS</span></div>
    <div class="stat-card"><b>${users.length}</b><span>REGISTERED USERS</span></div>
    <div class="stat-card"><b>${payments.length}</b><span>PAYMENTS PROCESSED</span></div>
    <div class="stat-card"><b>${notifications.length}</b><span>EMAILS SENT</span></div>`;
}

/* ---------- service status strip ---------- */

const SERVICES = [
  { n: "GATEWAY", p: "/" },
  { n: "REGISTRY", raw: "http://localhost:8761/eureka/apps" },
  { n: "USER", p: "/users" },
  { n: "EVENT", p: "/events" },
  { n: "BOOKING", p: "/bookings" },
  { n: "PAYMENT", p: "/payments" },
  { n: "NOTIFICATION", p: "/notifications" },
];

async function checkSvc(s) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 4000);
  try {
    if (s.raw) { await fetch(s.raw, { mode: "no-cors", signal: ctrl.signal }); return true; }
    await fetch(API + s.p, { signal: ctrl.signal });
    return true;
  } catch (e) {
    return false;
  } finally {
    clearTimeout(t);
  }
}

const svcStrip = document.getElementById("svc-strip");
svcStrip.innerHTML = SERVICES.map((s) => '<span class="svc-pill checking" id="svc-' + s.n + '"><i></i>' + s.n + "</span>").join("");

async function renderStatusStrip() {
  for (const s of SERVICES) {
    const el = document.getElementById("svc-" + s.n);
    if (!el) continue;
    el.className = "svc-pill " + (await checkSvc(s) ? "up" : "down");
  }
}

/* ---------- events ---------- */

async function loadEvents() {
  const list = document.getElementById("events-list");
  try {
    const events = await api("/events");
    if (!events.length) {
      list.innerHTML = '<div class="empty-note">NO EVENTS YET — CREATE ONE!</div>';
      return;
    }
    list.innerHTML = `<table>
      <tr><th>name</th><th>venue</th><th>date</th><th>category</th><th>price</th><th>seats</th><th>actions</th></tr>
      ${events.map((e) => `
        <tr>
          <td>${esc(e.name)}<br><span class="mono">${esc(e.id)}</span></td>
          <td>${esc(e.venue)}</td>
          <td>${esc(e.date)}</td>
          <td>${esc(e.category || "-")}</td>
          <td>$${e.price}</td>
          <td>${e.bookedSeats}/${e.totalSeats}</td>
          <td><div class="row-actions">
            <button class="ghost-btn small" data-edit="${e.id}">EDIT</button>
            <button class="ghost-btn small danger" data-del="${e.id}">DELETE</button>
          </div></td>
        </tr>`).join("")}
    </table>`;
    list.querySelectorAll("[data-edit]").forEach((b) =>
      b.addEventListener("click", () => startEdit(events.find((x) => x.id === b.dataset.edit))));
    list.querySelectorAll("[data-del]").forEach((b) =>
      b.addEventListener("click", () => deleteEvent(b.dataset.del)));
  } catch (err) {
    list.innerHTML = '<div class="empty-note">ERROR: ' + esc(err.message) + "</div>";
  }
}

function startEdit(e) {
  editingEventId = e.id;
  const f = document.getElementById("event-form");
  f.name.value = e.name || "";
  f.venue.value = e.venue || "";
  f.date.value = e.date || "";
  f.category.value = e.category || "music";
  f.price.value = e.price;
  f.totalSeats.value = e.totalSeats;
  document.getElementById("event-form-title").textContent = "EDIT EVENT";
  document.getElementById("event-submit").textContent = "SAVE CHANGES";
  document.getElementById("edit-cancel").classList.remove("hidden");
}

function resetEventForm() {
  editingEventId = null;
  document.getElementById("event-form").reset();
  document.getElementById("event-form-title").textContent = "CREATE EVENT";
  document.getElementById("event-submit").textContent = "CREATE EVENT";
  document.getElementById("edit-cancel").classList.add("hidden");
}

document.getElementById("edit-cancel").addEventListener("click", resetEventForm);

document.getElementById("event-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const f = new FormData(e.target);
  const body = {
    name: f.get("name"), venue: f.get("venue"), date: f.get("date"),
    category: f.get("category"),
    price: parseFloat(f.get("price")), totalSeats: parseInt(f.get("totalSeats"), 10),
  };
  try {
    if (editingEventId) {
      await api("/events/" + editingEventId, "PUT", body);
      formOut("event", "Event updated!", true);
    } else {
      const created = await api("/events", "POST", body);
      formOut("event", "Event created! id: " + created.id, true);
    }
    resetEventForm();
    loadAll();
  } catch (err) {
    formOut("event", err.message, false);
  }
});

async function deleteEvent(id) {
  if (!confirm("Delete this event?")) return;
  try {
    await api("/events/" + id, "DELETE");
    loadAll();
  } catch (err) {
    formOut("event", err.message, false);
  }
}

/* ---------- bookings ---------- */

async function loadBookings() {
  const list = document.getElementById("bookings-list");
  try {
    const bookings = await api("/bookings");
    if (!bookings.length) {
      list.innerHTML = '<div class="empty-note">NO BOOKINGS YET.</div>';
      return;
    }
    list.innerHTML = `<table>
      <tr><th>id</th><th>user</th><th>event</th><th>seats</th><th>total</th><th>status</th><th>created</th></tr>
      ${bookings.slice().reverse().map((b) => `
        <tr>
          <td><span class="mono">${esc(b.id)}</span></td>
          <td>${esc(b.userName)}<br><span class="mono">${esc(b.userEmail)}</span></td>
          <td>${esc(b.eventName)}</td>
          <td>${b.seats}</td>
          <td>$${b.totalPrice}</td>
          <td><span class="status-badge ${esc(b.status)}">${esc(b.status)}</span></td>
          <td><span class="mono">${esc(b.createdAt)}</span></td>
        </tr>`).join("")}
    </table>`;
  } catch (err) {
    list.innerHTML = '<div class="empty-note">ERROR: ' + esc(err.message) + "</div>";
  }
}

/* ---------- users ---------- */

async function loadUsers() {
  const list = document.getElementById("users-list");
  try {
    const users = await api("/users");
    list.innerHTML = `<table>
      <tr><th>id</th><th>name</th><th>email</th><th>role</th></tr>
      ${users.map((u) => `
        <tr>
          <td><span class="mono">${esc(u.id)}</span></td>
          <td>${esc(u.name)}</td>
          <td>${esc(u.email)}</td>
          <td><span class="role-badge ${esc(u.role || "USER")}">${esc(u.role || "USER")}</span></td>
        </tr>`).join("")}
    </table>`;
  } catch (err) {
    list.innerHTML = '<div class="empty-note">ERROR: ' + esc(err.message) + "</div>";
  }
}

document.getElementById("admin-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const f = new FormData(e.target);
  try {
    const created = await api("/users/admin/register", "POST", {
      name: f.get("name"), email: f.get("email"), password: f.get("password"),
    });
    formOut("admin", "Admin created: " + created.email, true);
    e.target.reset();
    loadAll();
  } catch (err) {
    formOut("admin", err.message, false);
  }
});

/* ---------- payments ---------- */

async function loadPayments() {
  const list = document.getElementById("payments-list");
  try {
    const payments = await api("/payments");
    if (!payments.length) {
      list.innerHTML = '<div class="empty-note">NO PAYMENTS YET.</div>';
      return;
    }
    list.innerHTML = `<table>
      <tr><th>id</th><th>booking</th><th>amount</th><th>status</th><th>created</th></tr>
      ${payments.slice().reverse().map((p) => `
        <tr>
          <td><span class="mono">${esc(p.id)}</span></td>
          <td><span class="mono">${esc(p.bookingId)}</span></td>
          <td>$${p.amount}</td>
          <td><span class="status-badge ${esc(p.status)}">${esc(p.status)}</span></td>
          <td><span class="mono">${esc(p.createdAt)}</span></td>
        </tr>`).join("")}
    </table>`;
  } catch (err) {
    list.innerHTML = '<div class="empty-note">ERROR: ' + esc(err.message) + "</div>";
  }
}

/* ---------- notifications ---------- */

async function loadNotifications() {
  const list = document.getElementById("notifications-list");
  try {
    const emails = await api("/notifications");
    list.innerHTML = emails.length
      ? emails.slice().reverse().map((m) => '<div class="notif-item">&#9993; ' + esc(m) + "</div>").join("")
      : '<div class="empty-note">NO EMAILS SENT YET.</div>';
  } catch (err) {
    list.innerHTML = '<div class="empty-note">ERROR: ' + esc(err.message) + "</div>";
  }
}

/* ---------- refresh wiring ---------- */

document.getElementById("refresh-events").addEventListener("click", loadEvents);
document.getElementById("refresh-bookings").addEventListener("click", loadBookings);
document.getElementById("refresh-users").addEventListener("click", loadUsers);
document.getElementById("refresh-payments").addEventListener("click", loadPayments);
document.getElementById("refresh-notifications").addEventListener("click", loadNotifications);

function loadAll() {
  if (!admin) return;
  loadStats();
  loadEvents();
  loadBookings();
  loadUsers();
  loadPayments();
  loadNotifications();
}

renderViews();
if (admin && admin.token) loadAll();
renderStatusStrip();
setInterval(renderStatusStrip, 10000);
