const API = "http://localhost:8080";

/* ---------- state ---------- */

let state = {
  user: JSON.parse(localStorage.getItem("tb_user") || "null"),
  events: [],
  filter: "all",
  search: "",
  currentEvent: null,
  qty: 2,
};

const CATS = {
  music:  { emoji: "🎸", grad: "linear-gradient(135deg,#ff90e8 0%,#026cdf 100%)" },
  sports: { emoji: "🏀", grad: "linear-gradient(135deg,#23c45e 0%,#0a4d2f 100%)" },
  arts:   { emoji: "🎨", grad: "linear-gradient(135deg,#ffd400 0%,#ff4d38 100%)" },
  comedy: { emoji: "😂", grad: "linear-gradient(135deg,#ffd400 0%,#ff90e8 100%)" },
  family: { emoji: "🎪", grad: "linear-gradient(135deg,#ff9f1c 0%,#ff4d38 100%)" },
  other:  { emoji: "🎟️", grad: "linear-gradient(135deg,#026cdf 0%,#0a0a0a 100%)" },
};

function catOf(e) { return CATS[e.category] || CATS.other; }
function esc(s) { return String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c])); }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function api(path, method = "GET", body, headers) {
  const res = await fetch(API + path, {
    method,
    headers: Object.assign({ "Content-Type": "application/json" }, headers || {}),
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let data = text;
  try { data = JSON.parse(text); } catch (e) {}
  if (!res.ok) throw new Error(data.message || data.error || text || res.status);
  return data;
}

async function waitFor(fn, timeoutMs = 20000, interval = 700) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try { const v = await fn(); if (v) return v; } catch (e) {}
    await sleep(interval);
  }
  return null;
}

/* ---------- loading ---------- */

async function loadEvents() {
  state.events = await api("/events", "GET");
  renderHero();
  renderGrid();
}

function formatDate(dateStr) {
  if (!dateStr) return "TBA";
  const [y, m, d] = dateStr.split("-");
  const months = ["JAN","FEB","MAR","APR","MAY","JUN","JUL","AUG","SEP","OCT","NOV","DEC"];
  return months[parseInt(m, 10) - 1] + " " + d + ", " + y;
}

function seatsLeft(e) { return e.totalSeats - e.bookedSeats; }

function visibleEvents() {
  return state.events.filter((e) => {
    if (state.filter !== "all" && (e.category || "other") !== state.filter) return false;
    if (state.search) {
      const q = state.search.toLowerCase();
      if (!(e.name || "").toLowerCase().includes(q) && !(e.venue || "").toLowerCase().includes(q)) return false;
    }
    return true;
  });
}

function renderGrid() {
  const grid = document.getElementById("event-grid");
  const events = visibleEvents();
  if (!events.length) {
    grid.innerHTML = state.search || state.filter !== "all"
      ? '<div class="empty-note">NO EVENTS MATCH YOUR SEARCH. TRY AGAIN!</div>'
      : '<div class="empty-note">NO EVENTS YET — THE ADMIN WILL PUBLISH SOME SOON!</div>';
    return;
  }
  grid.innerHTML = events.map((e) => {
    const c = catOf(e);
    const left = seatsLeft(e);
    return `
      <div class="card" data-id="${e.id}">
        <div class="card-img" style="background:${c.grad}">${c.emoji}</div>
        <div class="card-body">
          <div class="card-cat">${esc(e.category || "other").toUpperCase()}</div>
          <div class="card-name">${esc(e.name)}</div>
          <div class="card-meta">${esc(e.venue)} · ${formatDate(e.date)}</div>
          <div class="card-bottom">
            <div class="card-price"><small>FROM </small>$${e.price}</div>
            <button class="find-btn" data-id="${e.id}">FIND TICKETS</button>
          </div>
        </div>
      </div>`;
  }).join("");

  document.querySelectorAll(".card, .find-btn").forEach((el) => {
    el.addEventListener("click", (ev) => {
      ev.stopPropagation();
      openEvent(el.dataset.id);
    });
  });
}

function renderHero() {
  const featured = state.events.find((e) => seatsLeft(e) > 0) || state.events[0];
  const hero = document.getElementById("hero");
  if (!featured) return;
  document.getElementById("hero-title").textContent = featured.name;
  document.getElementById("hero-sub").textContent =
    featured.venue + " · " + formatDate(featured.date) + " · FROM $" + featured.price;
  const bg = document.getElementById("hero-bg") || hero.querySelector(".hero-bg");
  bg.style.background = catOf(featured).grad;
  document.getElementById("hero-cta").onclick = () => openEvent(featured.id);
}

async function loadEvents() {
  state.events = await api("/events", "GET");
  renderHero();
  renderGrid();
}

/* ---------- service status strip (all services) ---------- */

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
    await fetch(API + s.p, { signal: ctrl.signal }); // any HTTP response (even 404) = up
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

/* ---------- notifications (Notification Service) ---------- */

const bellCount = document.getElementById("bell-count");

// Only the notifications belonging to the logged-in user (matched by their
// booking ids). The admin panel shows all of them instead.
// The hardcoded "user@example.com" in payment notices is replaced with the
// logged-in user's own email for display.
async function myEmails() {
  if (!state.user) return [];
  const [notifications, bookings] = await Promise.all([
    api("/notifications", "GET"),
    api("/bookings", "GET"),
  ]);
  const ids = bookings.filter((b) => b.userId === state.user.id).map((b) => b.id);
  return notifications
    .filter((m) => ids.some((id) => m.includes(id)))
    .map((m) => m.replaceAll("user@example.com", state.user.email));
}

async function updateBell() {
  try {
    if (!state.user) { bellCount.textContent = 0; return; }
    const emails = await myEmails();
    bellCount.textContent = emails.length;
  } catch (e) {
    bellCount.textContent = "!";
  }
}

document.getElementById("bell-btn").addEventListener("click", async () => {
  openModal("notif-modal");
  const list = document.getElementById("notif-list");
  if (!state.user) {
    list.innerHTML = '<div class="empty-note">SIGN IN TO SEE YOUR EMAILS.</div>';
    return;
  }
  list.innerHTML = '<div class="empty-note">LOADING...</div>';
  try {
    const notifs = await myEmails();
    list.innerHTML = notifs.length
      ? notifs.slice().reverse().map((m) => '<div class="notif-item">&#128276; ' + esc(m) + "</div>").join("")
      : '<div class="empty-note">NO NOTIFICATIONS FOR YOU YET.</div>';
  } catch (err) {
    list.innerHTML = '<div class="empty-note">ERROR: ' + esc(err.message) + "</div>";
  }
});

/* ---------- filters + search ---------- */

document.querySelectorAll(".chip").forEach((chip) => {
  chip.addEventListener("click", () => {
    document.querySelectorAll(".chip").forEach((c) => c.classList.remove("active"));
    chip.classList.add("active");
    state.filter = chip.dataset.cat;
    renderGrid();
  });
});

document.getElementById("search-btn").addEventListener("click", () => {
  state.search = document.getElementById("search-input").value.trim();
  renderGrid();
});
document.getElementById("search-input").addEventListener("keydown", (e) => {
  if (e.key === "Enter") { state.search = e.target.value.trim(); renderGrid(); }
});

/* ---------- auth ---------- */

function renderAuthArea() {
  const area = document.getElementById("auth-area");
  if (state.user) {
    area.innerHTML = `
      <div class="user-chip">
        <div class="avatar">${esc((state.user.name || "U")[0].toUpperCase())}</div>
        <span>${esc(state.user.name)}</span>
        <button class="ghost-btn" id="my-tickets-btn">MY TICKETS</button>
        <button class="ghost-btn" id="logout-btn">LOG OUT</button>
      </div>`;
    document.getElementById("my-tickets-btn").addEventListener("click", openTickets);
    document.getElementById("logout-btn").addEventListener("click", () => {
      state.user = null;
      localStorage.removeItem("tb_user");
      renderAuthArea();
      updateBell();
    });
  } else {
    area.innerHTML = '<button class="ghost-btn" id="signin-btn">Sign In / Register</button>';
    document.getElementById("signin-btn").addEventListener("click", () => openModal("auth-modal"));
  }
}

function openModal(id) { document.getElementById(id).hidden = false; }
function closeModal(id) { document.getElementById(id).hidden = true; }

document.querySelectorAll("[data-close]").forEach((btn) => {
  btn.addEventListener("click", () => closeModal(btn.dataset.close));
});
document.querySelectorAll(".modal-overlay").forEach((ov) => {
  ov.addEventListener("click", (e) => { if (e.target === ov) ov.hidden = true; });
});

document.querySelectorAll(".tab-btn").forEach((btn) => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".tab-btn").forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");
    const mode = btn.dataset.mode;
    document.getElementById("login-form").hidden = mode !== "login";
    document.getElementById("register-form").hidden = mode !== "register";
  });
});

function formOut(name, text, ok) {
  const el = document.querySelector('[data-out="' + name + '"]');
  el.className = "form-out " + (ok ? "ok" : "err");
  el.textContent = text;
}

document.getElementById("login-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const f = new FormData(e.target);
  try {
    const login = await api("/users/login", "POST", { email: f.get("email"), password: f.get("password") });
    state.user = { id: login.id, name: login.name, email: login.email, token: login.token };
    localStorage.setItem("tb_user", JSON.stringify(state.user));
    formOut("login", "Welcome back, " + login.name + "!", true);
    renderAuthArea();
    updateBell();
    setTimeout(() => closeModal("auth-modal"), 700);
  } catch (err) {
    formOut("login", err.message, false);
  }
});

document.getElementById("register-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const f = new FormData(e.target);
  try {
    const user = await api("/users", "POST", { name: f.get("name"), email: f.get("email"), password: f.get("password") });
    const login = await api("/users/login", "POST", { email: f.get("email"), password: f.get("password") });
    state.user = { id: user.id, name: user.name, email: user.email, token: login.token };
    localStorage.setItem("tb_user", JSON.stringify(state.user));
    formOut("register", "Account created — welcome, " + user.name + "!", true);
    renderAuthArea();
    updateBell();
    setTimeout(() => closeModal("auth-modal"), 700);
  } catch (err) {
    formOut("register", err.message, false);
  }
});

/* ---------- event modal + buying ---------- */

function openEvent(id) {
  const e = state.events.find((x) => x.id === id);
  if (!e) return;
  state.currentEvent = e;
  state.qty = Math.min(2, Math.max(1, seatsLeft(e)));
  document.getElementById("success-box").hidden = true;
  formOut("event", "", true);
  renderEventModal();
  openModal("event-modal");
}

function renderEventModal() {
  const e = state.currentEvent;
  const c = catOf(e);
  document.getElementById("ev-banner").style.background = c.grad;
  document.getElementById("ev-banner").textContent = c.emoji;
  document.getElementById("ev-datebox").textContent = formatDate(e.date);
  document.getElementById("ev-name").textContent = e.name;
  document.getElementById("ev-meta").textContent = e.venue + " · " + (e.category || "other").toUpperCase();
  document.getElementById("ev-seats").textContent = seatsLeft(e);
  document.getElementById("ev-price").textContent = "$" + e.price;
  document.getElementById("qty-num").textContent = state.qty;
  document.getElementById("ev-total").textContent = "$" + (state.qty * e.price).toFixed(2);
}

document.getElementById("qty-minus").addEventListener("click", () => {
  if (state.qty > 1) { state.qty--; renderEventModal(); }
});
document.getElementById("qty-plus").addEventListener("click", () => {
  if (state.qty < seatsLeft(state.currentEvent)) { state.qty++; renderEventModal(); }
});

document.getElementById("buy-btn").addEventListener("click", async () => {
  const e = state.currentEvent;
  if (!state.user) {
    formOut("event", "Please SIGN IN first to buy tickets!", false);
    openModal("auth-modal");
    return;
  }
  formOut("event", "Booking " + state.qty + " ticket(s)... (PENDING)", true);
  try {
    const booking = await api("/bookings", "POST", { userId: state.user.id, eventId: e.id, seats: state.qty });

    const confirmed = await waitFor(async () => {
      const b = await api("/bookings/" + booking.id, "GET");
      return b.status === "CONFIRMED" ? b : null;
    });
    if (confirmed) {
      // find the matching payment record (Payment Service)
      const pay = await waitFor(async () => {
        const list = await api("/payments", "GET");
        return list.find((p) => p.bookingId === confirmed.id) || null;
      });
      document.getElementById("success-box").hidden = false;
      document.getElementById("success-text").innerHTML =
        "<b>" + esc(e.name) + "</b><br>" + state.qty + " ticket(s) · $" + confirmed.totalPrice +
        "<br>Booking id: " + esc(confirmed.id) +
        (pay ? "<br>Payment " + esc(pay.id) + " — " + esc(pay.status) + " (Payment Service)" : "");
      formOut("event", "", true);
      updateBell();
      await loadEvents();
      return;
    }
    formOut("event", "Booking stuck in PENDING — check backend", false);
  } catch (err) {
    formOut("event", "FAILED: " + err.message, false);
    loadEvents();
  }
});

/* ---------- my tickets ---------- */

async function openTickets() {
  openModal("tickets-modal");
  const list = document.getElementById("tickets-list");
  list.innerHTML = '<div class="empty-note">LOADING TICKETS...</div>';
  try {
    const bookings = await api("/bookings", "GET");
    const mine = bookings
      .filter((b) => b.userId === state.user.id)
      .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
    if (!mine.length) {
      list.innerHTML = '<div class="empty-note">YOU HAVE NO TICKETS YET. GO FIND SOMETHING FUN!</div>';
      return;
    }
    list.innerHTML = mine.map((b) => {
      const ev = state.events.find((e) => e.id === b.eventId);
      const c = catOf(ev || {});
      const cancelBtn = b.status === "CONFIRMED"
        ? '<button class="ghost-btn small danger" data-cancel="' + esc(b.id) + '">CANCEL</button>'
        : "";
      return `
        <div class="ticket">
          <div class="ticket-stub" style="background:${c.grad}">${c.emoji}</div>
          <div class="ticket-body">
            <h3>${esc(b.eventName)}</h3>
            <p>${b.seats} ticket(s) · $${b.totalPrice} · ${esc(b.createdAt)}</p>
            <div class="ticket-id">${esc(b.id)}</div>
            <span class="status-badge ${esc(b.status)}">${esc(b.status)}</span>
            ${cancelBtn}
          </div>
        </div>`;
    }).join("");

    list.querySelectorAll("[data-cancel]").forEach((btn) => {
      btn.addEventListener("click", () => cancelTicket(btn.dataset.cancel));
    });
  } catch (err) {
    list.innerHTML = '<div class="empty-note">ERROR: ' + esc(err.message) + "</div>";
  }
}

async function cancelTicket(bookingId) {
  if (!confirm("Cancel this booking? Your seats will be released.")) return;
  try {
    await api("/bookings/" + bookingId + "/cancel", "POST", { userId: state.user.id });
    await loadEvents();
    await updateBell();
    openTickets();
  } catch (err) {
    alert("Cancel failed: " + err.message);
  }
}

/* ---------- init ---------- */

(async function init() {
  renderAuthArea();
  renderStatusStrip();
  setInterval(renderStatusStrip, 10000);
  updateBell();
  setInterval(updateBell, 8000);
  try {
    await loadEvents();
  } catch (err) {
    document.getElementById("event-grid").innerHTML =
      '<div class="empty-note">CANNOT REACH THE API GATEWAY — is Docker running?</div>';
  }
})();
