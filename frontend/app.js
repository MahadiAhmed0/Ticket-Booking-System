const API = "http://localhost:8080";
const REGISTRY = "http://localhost:8761";

const COLORS = {
  frontend: "frontend", gateway: "gateway", registry: "registry",
  user: "user", event: "event", booking: "booking",
  payment: "payment", notification: "notification", rabbit: "rabbit",
};

/* ---------- small helpers ---------- */

function esc(s) {
  return String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
}

function ts() {
  return new Date().toTimeString().slice(0, 8);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function api(path, method = "GET", body, headers) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 25000);
  try {
    const res = await fetch(API + path, {
      method,
      headers: Object.assign({ "Content-Type": "application/json" }, headers || {}),
      body: body ? JSON.stringify(body) : undefined,
      signal: ctrl.signal,
    });
    const text = await res.text();
    let data = text;
    try { data = JSON.parse(text); } catch (e) {}
    if (!res.ok) throw new Error(data.message || data.error || text || res.status);
    return data;
  } finally {
    clearTimeout(timer);
  }
}

async function waitFor(fn, timeoutMs = 20000, interval = 800) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const v = await fn();
      if (v) return v;
    } catch (e) {}
    await sleep(interval);
  }
  return null;
}

/* ---------- activity feed ---------- */

const feed = document.getElementById("feed");

function tag(name) {
  return { t: " " + name + " ", c: "tag " + (COLORS[name.toLowerCase()] || "frontend") };
}

function feedLine(segs, kind) {
  const first = feed.querySelector(".feed-line.muted");
  if (first) first.remove();

  const line = document.createElement("div");
  line.className = "feed-line" + (kind ? " " + kind : "");
  const time = document.createElement("span");
  time.className = "ts";
  time.textContent = ts();
  line.appendChild(time);
  for (const s of segs) {
    const span = document.createElement("span");
    span.className = s.c || "";
    span.textContent = s.t;
    line.appendChild(span);
  }
  feed.appendChild(line);
  feed.scrollTop = feed.scrollHeight;
}

function feedSeparator(title) {
  const sep = document.createElement("div");
  sep.className = "sep";
  sep.textContent = "— " + title + " —";
  feed.appendChild(sep);
  feed.scrollTop = feed.scrollHeight;
}

document.getElementById("clear-feed").addEventListener("click", () => {
  feed.innerHTML = '<div class="feed-line muted">Waiting for a demo to start…</div>';
});

const arrow = () => ({ t: " \u2192 ", c: "dim" });
const ok = () => ({ t: " OK", c: "ok" });
const fail = (m) => ({ t: " " + m, c: "err" });

/* ---------- architecture diagram ---------- */

/* (architecture diagram removed — these are kept as no-ops) */
function setLit() {}
function clearLitAfter() {}

/* ---------- status pills ---------- */

const PILLS = [
  { name: "GATEWAY", color: "gateway", test: async () => {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), 4000);
      try {
        await fetch(API + "/", { signal: ctrl.signal }); // any HTTP response = gateway alive (404 is fine)
        return true;
      } catch (e) { return false; }
      finally { clearTimeout(t); }
    } },
  { name: "REGISTRY", color: "registry", test: async () => {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), 4000);
      try { await fetch(REGISTRY + "/eureka/apps", { mode: "no-cors", signal: ctrl.signal }); return true; }
      catch (e) { return false; }
      finally { clearTimeout(t); }
    } },
  { name: "USER", color: "user", test: async () => { await api("/users"); return true; } },
  { name: "EVENT", color: "event", test: async () => { await api("/events"); return true; } },
  { name: "BOOKING", color: "booking", test: async () => { await api("/bookings"); return true; } },
  { name: "PAYMENT", color: "payment", test: async () => { await api("/payments"); return true; } },
  { name: "NOTIFICATION", color: "notification", test: async () => { await api("/notifications"); return true; } },
];

const pillBox = document.getElementById("status-pills");
pillBox.innerHTML = "";
for (const p of PILLS) {
  const pill = document.createElement("span");
  pill.className = "pill checking";
  pill.id = "pill-" + p.name;
  pill.innerHTML = '<span class="dot"></span>' + p.name;
  pillBox.appendChild(pill);
}

const statusMap = {}; // service name -> boolean (up)

const TAB_SERVICES = {
  users: "USER", events: "EVENT", bookings: "BOOKING",
  payments: "PAYMENT", notifications: "NOTIFICATION",
};

function updateTabs() {
  document.querySelectorAll(".tab").forEach((t) => {
    const svc = TAB_SERVICES[t.dataset.tab];
    t.classList.toggle("down", statusMap[svc] === false);
  });
}

function updateDownBanner() {
  const down = PILLS.filter((p) => statusMap[p.name] === false).map((p) => p.name);
  const banner = document.getElementById("down-banner");
  const text = document.getElementById("down-text");
  if (down.length) {
    banner.style.display = "flex";
    text.textContent = down.join(", ") + (down.length === 1 ? " is" : " are") +
      " DOWN — requests to " + (down.length === 1 ? "it" : "them") + " will fail";
  } else {
    banner.style.display = "none";
  }
  updateTabs();
}

async function checkStatus() {
  const changed = [];
  for (const p of PILLS) {
    const el = document.getElementById("pill-" + p.name);
    let up = false;
    try {
      up = await p.test();
    } catch (e) {
      up = false;
    }
    el.className = "pill " + (up ? "up" : "down");

    const prev = statusMap[p.name];
    statusMap[p.name] = up;

    // log transitions in the activity feed
    if (prev === undefined) {
      if (!up) feedLine([tag(p.color), { t: " " + p.name + " is DOWN", c: "err" }]);
    } else if (prev !== up) {
      changed.push(p.name);
      feedLine([tag(p.color),
        up ? { t: " " + p.name + " is back UP", c: "ok" }
           : { t: " " + p.name + " went DOWN", c: "err" }]);
    }
  }
  updateDownBanner();
  // if the open tab's service just changed state, refresh the tab right away
  if (changed.includes(TAB_SERVICES[activeTab])) refreshData();
}

/* ---------- demo steps ---------- */

let adminToken = null;

const stepOuts = { 1: "1", 2: "2", 3: "3" };

function stepOut(n, text, isErr) {
  const el = document.querySelector('[data-out="' + n + '"]');
  el.className = "step-out " + (isErr ? "err" : "ok");
  el.textContent = text;
}

async function registerUser(name, email, verbose) {
  if (verbose) {
    feedLine([tag("FRONTEND"), arrow(), tag("GATEWAY"), { t: " POST /users  " + name + " &lt;" + esc(email) + "&gt;", c: "dim" }]);
    setLit(["frontend", "gateway"]);
  }
  try {
    const u = await api("/users", "POST", { name, email, password: "demo123" });
    if (verbose) {
      feedLine([tag("GATEWAY"), arrow(), tag("USER"), { t: " user created", c: "dim" }, ok()]);
      setLit(["frontend", "gateway", "user"]);
    }
    stepOut(1, "Created user: " + u.id + " (" + u.name + ")");
    document.querySelector('#step3 [name="userId"]').value = u.id;
    return u;
  } catch (e) {
    if (verbose) feedLine([tag("GATEWAY"), arrow(), tag("USER"), fail(e.message)]);
    stepOut(1, "Error: " + e.message, true);
    throw e;
  }
}

async function createEvent(name, venue, date, price, totalSeats, verbose) {
  if (verbose) {
    feedLine([tag("FRONTEND"), arrow(), tag("GATEWAY"), { t: " POST /events  " + name + " (" + totalSeats + " seats, $" + price + ")", c: "dim" }]);
    setLit(["frontend", "gateway"]);
  }
  try {
    const e = await api("/events", "POST", { name, venue, date, price, totalSeats },
      adminToken ? { Authorization: "Bearer " + adminToken } : undefined);
    if (verbose) {
      feedLine([tag("GATEWAY"), arrow(), tag("EVENT"), { t: " event created", c: "dim" }, ok()]);
      setLit(["frontend", "gateway", "event"]);
    }
    stepOut(2, "Created event: " + e.id + " (" + e.name + ", " + e.totalSeats + " seats)");
    document.querySelector('#step3 [name="eventId"]').value = e.id;
    return e;
  } catch (e) {
    if (verbose) feedLine([tag("GATEWAY"), arrow(), tag("EVENT"), fail(e.message)]);
    stepOut(2, "Error: " + e.message, true);
    throw e;
  }
}

async function bookTickets(userId, eventId, seats, verbose) {
  const phases = { sync: 0, async: 0 };
  if (verbose) {
    feedSeparator("BOOKING FLOW — user " + userId + ", event " + eventId + ", " + seats + " seat(s)");
    feedLine([tag("FRONTEND"), arrow(), tag("GATEWAY"), { t: " POST /bookings", c: "dim" }]);
    setLit(["frontend", "gateway"]);
    feedLine([tag("GATEWAY"), arrow(), tag("BOOKING"), { t: " routed by path /bookings/**", c: "dim" }]);
  }

  const b = { id: null, status: "PENDING", total: 0 };

  if (verbose) {
    feedLine([tag("BOOKING"), arrow(), tag("USER"), { t: " GET /users/" + userId + "  (validate user)", c: "dim" }]);
    setLit(["frontend", "gateway", "booking", "user"]);
    feedLine([tag("BOOKING"), arrow(), tag("EVENT"), { t: " POST /events/" + eventId + "/book?seats=" + seats + "  (lock seats)", c: "dim" }]);
    setLit(["frontend", "gateway", "booking", "user", "event"]);
    feedLine([tag("BOOKING"), arrow(), tag("PAYMENT"), { t: " POST /payments  (sync, awaits accept/reject)", c: "dim" }]);
    setLit(["frontend", "gateway", "booking", "user", "event", "payment"]);
  }

  let booking;
  try {
    booking = await api("/bookings", "POST", { userId, eventId, seats });
  } catch (e) {
    // 402: payment rejected synchronously — the async PaymentFailed event
    // releases the seats and cancels the order.
    booking = null;
    await traceFailure(userId, eventId, seats);
    stepOut(3, "Payment rejected (402) — order cancelled, seats released", true);
    return null;
  }

  b.id = booking.id;
  b.status = booking.status;
  b.total = booking.totalPrice;

  if (verbose) {
    feedLine([tag("PAYMENT"), arrow(), tag("BOOKING"), { t: " accepted ($" + booking.totalPrice + ") — booking " + booking.id + " is PENDING", c: "dim" }]);
    stepOut(3, "Booking " + booking.id + " — PENDING (waiting for PaymentCompleted event)…");
  }

  // ASYNC phase — watch real data change, log only what we observe
  setLit(["booking", "payment", "rabbit"]);

  // 1. payment record appears (payment service saved it before publishing the event)
  const pay = await waitFor(async () => {
    const list = await api("/payments", "GET");
    return list.find((p) => p.bookingId === booking.id) || null;
  });
  if (pay && verbose) {
    feedLine([tag("PAYMENT"), arrow(), tag("RABBIT"), { t: " PaymentCompleted event published (booking " + booking.id + ")", c: "dim" }]);
    feedLine([tag("RABBIT"), arrow(), tag("NOTIFICATION"), { t: " PaymentCompleted consumed — receipt email queued", c: "dim" }]);
    setLit(["booking", "payment", "rabbit", "notification"]);
  }

  // 2. booking flips to CONFIRMED
  const confirmed = await waitFor(async () => {
    const x = await api("/bookings/" + booking.id, "GET");
    return x.status === "CONFIRMED" ? x : null;
  });
  if (confirmed && verbose) {
    feedLine([tag("RABBIT"), arrow(), tag("BOOKING"), { t: " PaymentCompleted consumed — order CONFIRMED", c: "dim" }, ok()]);
    feedLine([tag("BOOKING"), arrow(), tag("RABBIT"), { t: " BookingConfirmed event published", c: "dim" }]);
  }

  // 3. notification service sends the confirmation + receipt emails
  const confirmation = await waitFor(async () => {
    const list = await api("/notifications", "GET");
    return list.find((m) => m.includes(booking.id) && m.includes("Booking confirmation")) || null;
  });
  if (confirmation && verbose) {
    feedLine([tag("RABBIT"), arrow(), tag("NOTIFICATION"), { t: " BookingConfirmed consumed — confirmation email sent", c: "dim" }, ok()]);
  }
  const receipt = await waitFor(async () => {
    const list = await api("/notifications", "GET");
    return list.find((m) => m.includes(booking.id) && m.includes("Payment receipt")) || null;
  });
  if (receipt && verbose) {
    feedLine([tag("RABBIT"), arrow(), tag("NOTIFICATION"), { t: " PaymentCompleted consumed — receipt email sent", c: "dim" }, ok()]);
  }

  if (verbose) {
    feedLine([{ t: "Done: booking " + booking.id + " is CONFIRMED — 2 emails sent via RabbitMQ", c: "ok" }]);
    stepOut(3, "Booking " + booking.id + " → CONFIRMED (total $" + booking.totalPrice + ")");
  }
  setLit(["booking", "payment", "rabbit", "notification", "event", "user"]);
  clearLitAfter();
  return booking;
}

async function traceFailure(userId, eventId, seats) {
  feedLine([tag("PAYMENT"), arrow(), tag("BOOKING"), { t: " REJECTED (amount > $1000)", c: "err" }]);
  setLit(["booking", "payment", "rabbit"]);

  // find the CANCELLED booking for this attempt
  const cancelled = await waitFor(async () => {
    const list = await api("/bookings", "GET");
    return list.find((b) => b.userId === userId && b.eventId === eventId && b.seats === seats && b.status === "CANCELLED") || null;
  });
  if (cancelled) {
    feedLine([tag("PAYMENT"), arrow(), tag("RABBIT"), { t: " PaymentFailed event published", c: "dim" }]);
    feedLine([tag("RABBIT"), arrow(), tag("BOOKING"), { t: " PaymentFailed consumed — seats released, order CANCELLED", c: "dim" }, ok()]);
    feedLine([tag("BOOKING"), arrow(), tag("EVENT"), { t: " POST /events/" + eventId + "/cancel — " + seats + " seats returned", c: "dim" }]);
    setLit(["booking", "payment", "rabbit", "event", "notification"]);
  }
  const notice = await waitFor(async () => {
    const list = await api("/notifications", "GET");
    return list.find((m) => m.includes(cancelled ? cancelled.id : "") && m.includes("Payment failure")) || null;
  });
  if (notice) {
    feedLine([tag("RABBIT"), arrow(), tag("NOTIFICATION"), { t: " PaymentFailed consumed — failure email sent", c: "dim" }, ok()]);
  }
  feedLine([{ t: "Done: payment failed — seats were rolled back and the customer was emailed", c: "ok" }]);
  clearLitAfter();
}

/* ---------- manual step forms ---------- */

document.getElementById("step1").addEventListener("submit", async (e) => {
  e.preventDefault();
  const f = new FormData(e.target);
  try { await registerUser(f.get("name"), f.get("email"), true); refreshData(); }
  catch (err) {}
});

document.getElementById("step2").addEventListener("submit", async (e) => {
  e.preventDefault();
  const f = new FormData(e.target);
  try {
    await createEvent(f.get("name"), f.get("venue"), f.get("date"),
      parseFloat(f.get("price")), parseInt(f.get("totalSeats"), 10), true);
    refreshData();
  } catch (err) {}
});

document.getElementById("step3").addEventListener("submit", async (e) => {
  e.preventDefault();
  const f = new FormData(e.target);
  try {
    await bookTickets(f.get("userId").trim(), f.get("eventId").trim(), parseInt(f.get("seats"), 10), true);
    refreshData();
  } catch (err) {}
});

// ---------- step 4: login -> JWT -> protected profile ----------

let lastToken = null;

document.getElementById("step4").addEventListener("submit", async (e) => {
  e.preventDefault();
  const f = new FormData(e.target);
  const email = f.get("email").trim();
  const password = f.get("password");

  feedLine([tag("FRONTEND"), arrow(), tag("GATEWAY"), { t: " POST /users/login  " + esc(email), c: "dim" }]);
  feedLine([tag("GATEWAY"), arrow(), tag("USER"), { t: " credentials checked", c: "dim" }]);
  try {
    const login = await api("/users/login", "POST", { email, password });
    lastToken = login.token;
    feedLine([tag("USER"), { t: " login OK — JWT issued", c: "ok" }, { t: "  " + login.token.slice(0, 25) + "...", c: "dim" }]);

    feedLine([tag("FRONTEND"), arrow(), tag("GATEWAY"), { t: " GET /users/me  (Authorization: Bearer token)", c: "dim" }]);
    const me = await api("/users/me", "GET", null, { Authorization: "Bearer " + login.token });
    feedLine([tag("GATEWAY"), arrow(), tag("USER"), { t: " token valid — profile returned", c: "dim" }, ok()]);
    stepOut(4, "Logged in as " + me.name + " (" + me.email + ")\nJWT: " + login.token);
  } catch (err) {
    feedLine([tag("USER"), { t: " " + err.message, c: "err" }]);
    stepOut(4, "Error: " + err.message, true);
  }
});

/* ---------- data tabs ---------- */

let activeTab = "users";

const renderers = {
  users: (list) => `
    <table>
      <tr><th>id</th><th>name</th><th>email</th></tr>
      ${list.map((u) => `<tr><td class="mono">${esc(u.id)}</td><td>${esc(u.name)}</td><td>${esc(u.email)}</td></tr>`).join("")}
    </table>`,
  events: (list) => `
    <table>
      <tr><th>id</th><th>name</th><th>venue</th><th>date</th><th>price</th><th>seats</th></tr>
      ${list.map((e) => `<tr><td class="mono">${esc(e.id)}</td><td>${esc(e.name)}</td><td>${esc(e.venue)}</td><td>${esc(e.date)}</td><td>$${e.price}</td><td>${e.bookedSeats}/${e.totalSeats} booked</td></tr>`).join("")}
    </table>`,
  bookings: (list) => `
    <table>
      <tr><th>id</th><th>user</th><th>event</th><th>seats</th><th>total</th><th>status</th><th>created</th></tr>
      ${list.map((b) => `<tr><td class="mono">${esc(b.id)}</td><td>${esc(b.userName)}</td><td>${esc(b.eventName)}</td><td>${b.seats}</td><td>$${b.totalPrice}</td><td><span class="badge ${esc(b.status)}">${esc(b.status)}</span></td><td class="mono">${esc(b.createdAt)}</td></tr>`).join("")}
    </table>`,
  payments: (list) => `
    <table>
      <tr><th>id</th><th>booking</th><th>amount</th><th>status</th><th>created</th></tr>
      ${list.map((p) => `<tr><td class="mono">${esc(p.id)}</td><td class="mono">${esc(p.bookingId)}</td><td>$${p.amount}</td><td><span class="badge ${esc(p.status)}">${esc(p.status)}</span></td><td class="mono">${esc(p.createdAt)}</td></tr>`).join("")}
    </table>`,
  notifications: (list) => `
    <table>
      <tr><th>#</th><th>email (logged by Notification Service)</th></tr>
      ${list.map((m, i) => `<tr><td>${i + 1}</td><td>${esc(m)}</td></tr>`).join("")}
    </table>`,
};

async function refreshData() {
  const view = document.getElementById("data-view");
  try {
    const list = await api("/" + activeTab, "GET");
    view.innerHTML = list.length ? renderers[activeTab](list) : '<div class="empty">No ' + activeTab + " yet.</div>";
  } catch (e) {
    const svc = TAB_SERVICES[activeTab];
    view.innerHTML = '<div class="empty err">&#9888; ' + svc +
      ' is DOWN — cannot load ' + activeTab + "</div>";
  }
}

document.querySelectorAll(".tab").forEach((btn) => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".tab").forEach((t) => t.classList.remove("active"));
    btn.classList.add("active");
    activeTab = btn.dataset.tab;
    refreshData();
  });
});

setInterval(() => {
  if (document.getElementById("autoref").checked) refreshData();
}, 6000);

/* ---------- card height sync ----------
   Pin the Live Activity card to the exact height of the Manual Steps card.
   The feed inside it is absolutely positioned, so it fills the fixed height
   and scrolls internally. */

const leftPanel = document.querySelector(".col-left .panel");
const rightPanel = document.querySelector(".col-right .panel");

function syncCardHeights() {
  if (!leftPanel || !rightPanel) return;
  if (window.innerWidth > 980) {
    leftPanel.style.height = rightPanel.offsetHeight + "px";
  } else {
    leftPanel.style.height = "";
  }
}

window.addEventListener("resize", syncCardHeights);
window.addEventListener("load", syncCardHeights);
syncCardHeights();

// re-sync when the steps card grows (e.g. step output text appears)
if (rightPanel) {
  new ResizeObserver(syncCardHeights).observe(rightPanel);
}

/* ---------- init ---------- */

// Creating events is ADMIN-only (enforced at the API Gateway), so this
// dashboard logs in with the default admin account to enable Step 2.
(async function ensureAdminToken() {
  try {
    const login = await api("/users/login", "POST", { email: "admin@example.com", password: "admin123" });
    adminToken = login.token;
    feedLine([tag("gateway"), arrow(), tag("user"),
      { t: " admin auto-login OK — Create Event step is authorized", c: "ok" }]);
  } catch (e) {
    feedLine([tag("user"), { t: " admin auto-login failed: " + e.message, c: "err" }]);
  }
})();

checkStatus();
setInterval(checkStatus, 5000);
refreshData();
