const API = "http://localhost:8080";

function show(el, html, ok) {
  el.className = "response " + (ok ? "ok" : "err");
  el.innerHTML = html;
}

async function api(path, method, body) {
  const res = await fetch(API + path, {
    method,
    headers: { "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    let msg = res.status;
    try { msg = await res.text(); } catch (e) {}
    throw new Error(msg);
  }
  return res.json();
}

// ---------- EVENTS ----------

document.getElementById("event-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const f = new FormData(e.target);
  const body = {
    name: f.get("name"),
    venue: f.get("venue"),
    date: f.get("date"),
    price: parseFloat(f.get("price")),
  };
  const out = document.getElementById("event-response");
  try {
    const created = await api("/events/", "POST", body);
    show(out, "Created:\n" + JSON.stringify(created, null, 2), true);
    e.target.reset();
  } catch (err) {
    show(out, "Error: " + err.message, false);
  }
});

// ---------- USERS ----------

document.getElementById("user-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const f = new FormData(e.target);
  const body = {
    name: f.get("name"),
    email: f.get("email"),
    password: f.get("password"),
  };
  const out = document.getElementById("user-response");
  try {
    const created = await api("/users/", "POST", body);
    show(out, "Created:\n" + JSON.stringify(created, null, 2), true);
    e.target.reset();
  } catch (err) {
    show(out, "Error: " + err.message, false);
  }
});

// ---------- fetch-by-id helpers ----------
// The services only expose POST /{resource}/ and GET /{resource}/{id},
// so each card gets a small "fetch by id" form instead of a full list.

function renderLookup(listId, path, label) {
  const list = document.getElementById(listId);
  const form = document.createElement("form");
  form.className = "form";
  form.innerHTML =
    '<input type="text" placeholder="' + label + ' id" required />' +
    '<button type="submit">Fetch by id</button>';
  const out = document.createElement("div");
  out.className = "response";
  form.addEventListener("submit", async (ev) => {
    ev.preventDefault();
    const id = form.querySelector("input").value.trim();
    try {
      const data = await api(path + "/" + id, "GET");
      show(out, JSON.stringify(data, null, 2), true);
    } catch (err) {
      show(out, "Error: " + err.message, false);
    }
  });
  list.appendChild(form);
  list.appendChild(out);
}

renderLookup("event-list", "/events", "event");
renderLookup("user-list", "/users", "user");