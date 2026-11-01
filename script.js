/* ===========================================================
   Scadlar – Schedule, class, homework, online activity reminder
   Data is saved in the browser (localStorage). Demo-level login only.
   =========================================================== */

const $  = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];

const TYPE_LABEL = {
  schedule: "Schedule",
  class: "Class",
  homework: "Homework",
  online: "Online Activity"
};
const DAY_INDEX = { Sunday: 0, Monday: 1, Tuesday: 2, Wednesday: 3, Thursday: 4, Friday: 5, Saturday: 6 };

/* ---------- storage helpers ---------- */
const read  = (k, fallback) => { try { return JSON.parse(localStorage.getItem(k)) ?? fallback; } catch { return fallback; } };
const write = (k, v) => localStorage.setItem(k, JSON.stringify(v));

let currentUser = null;   // { name, email }
let items = [];
let filter = "all";

/* ---------- misc helpers ---------- */
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

function fmtTime(t) {
  if (!t) return "";
  const [h, m] = t.split(":").map(Number);
  const ampm = h >= 12 ? "PM" : "AM";
  return ${((h + 11) % 12) + 1}:${String(m).padStart(2, "0")} ${ampm};
}
function fmtDue(d) {
  return d ? new Date(d).toLocaleString([], { dateStyle: "medium", timeStyle: "short" }) : "";
}
function toast(html) {
  const el = document.createElement("div");
  el.className = "toast";
  el.innerHTML = html;
  $("#toasts").appendChild(el);
  setTimeout(() => el.remove(), 8000);
}

/* ===========================================================
   LOGIN / SIGN UP
   =========================================================== */
let mode = "login";

function setMode(m) {
  mode = m;
  $("#tabLogin").classList.toggle("active", m === "login");
  $("#tabSignup").classList.toggle("active", m === "signup");
  $("#nameInput").classList.toggle("hidden", m === "login");
  $("#nameInput").required = m === "signup";
  $("#authSubmit").textContent = m === "login" ? "Log In" : "Sign Up";
  $("#authError").textContent = "";
}
$("#tabLogin").onclick  = () => setMode("login");
$("#tabSignup").onclick = () => setMode("signup");

$("#authForm").addEventListener("submit", e => {
  e.preventDefault();
  const email = $("#emailInput").value.trim().toLowerCase();
  const pass  = $("#passInput").value;
  const name  = $("#nameInput").value.trim();
  const users = read("scadlar_users", []);
  const err   = $("#authError");

  if (mode === "signup") {
    if (users.some(u => u.email === email)) { err.textContent = "That email is already registered."; return; }
    users.push({ name: name || email.split("@")[0], email, pass });
    write("scadlar_users", users);
    startSession({ name: users[users.length - 1].name, email });
  } else {
    const u = users.find(u => u.email === email && u.pass === pass);
    if (!u) { err.textContent = "Wrong email or password."; return; }
    startSession({ name: u.name, email });
  }
});

function startSession(user) {
  currentUser = user;
  write("scadlar_session", user);
  items = read("scadlar_items_" + user.email, []);
  $("#authView").classList.add("hidden");
  $("#appView").classList.remove("hidden");
  $("#greeting").textContent = "Hi, " + user.name;
  $("#avatar").textContent = user.name.charAt(0).toUpperCase();
  $("#authForm").reset();
  setFilter("all");
  updateFields();
  checkReminders();
}

$("#logoutBtn").onclick = () => {
  localStorage.removeItem("scadlar_session");
  currentUser = null;
  $("#appView").classList.add("hidden");
  $("#authView").classList.remove("hidden");
  setMode("login");
};

/* ===========================================================
   ADD ITEM FORM
   =========================================================== */
function updateFields() {
  const type = $("#type").value;
  $$(".fields").forEach(g => {
    const show = g.dataset.for === type;
    g.classList.toggle("hidden", !show);
    // disabled fields are skipped by form validation
    $$("input, select", g).forEach(el => (el.disabled = !show));
  });
}
$("#type").addEventListener("change", updateFields);

$("#itemForm").addEventListener("submit", e => {
  e.preventDefault();
  const type = $("#type").value;
  const group = $(.fields[data-for="${type}"]);
  const val = n => (group.querySelector([name="${n}"])?.value || "").trim();

  const item = {
    id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
    type,
    subject: val("subject"),
    title:   val("title"),
    day:     val("day"),
    time:    val("time"),
    room:    val("room"),
    due:     val("due"),
    remind:  Number($("#remind").value),
    done: false
  };
  items.push(item);
  save();
  e.target.reset();
  $("#type").value = type;
  updateFields();
  render();
  if ("Notification" in window && Notification.permission === "default") Notification.requestPermission();
});

function save() { write("scadlar_items_" + currentUser.email, items); }

/* ===========================================================
   LIST
   =========================================================== */
function setFilter(f) {
  filter = f;
  $$(".chip").forEach(c => c.classList.toggle("active", c.dataset.filter === f));
  $$(".side-btn").forEach(c => c.classList.toggle("active", c.dataset.filter === f));
  render();
}
$$(".chip, .side-btn").forEach(b => b.addEventListener("click", () => setFilter(b.dataset.filter)));

function render() {
  const list = $("#list");
  const shown = items.filter(i => filter === "all" || i.type === filter);
  if (!shown.length) {
    list.innerHTML = '<p class="empty">Nothing here yet. Add your first item above 💗</p>';
    return;
  }
  list.innerHTML = shown.map(i => {
    let main = "", meta = "";
    if (i.type === "schedule") {
      main = i.day;
      meta = fmtTime(i.time);
    } else if (i.type === "class") {
      main = i.subject;
      meta = ${i.day ? i.day + " • " : ""}${fmtTime(i.time)} • Room ${i.room};
    } else {
      main = i.title;
      meta = ${i.subject}${i.due ? " • " + fmtDue(i.due) : ""};
    }
    return `
      <div class="item ${i.done ? "done" : ""}">
        <div>
          <span class="badge">${TYPE_LABEL[i.type]}</span>
          <div class="item-main">${esc(main)}</div>
          <div class="item-meta">${esc(meta)}</div>
        </div>
        <div class="item-actions">
          <button class="btn-done" data-act="done" data-id="${i.id}">${i.done ? "Undo" : "✓ Done"}</button>
          <button class="btn-del" data-act="del" data-id="${i.id}">🗑 Delete</button>
        </div>
      </div>`;
  }).join("");
}

$("#list").addEventListener("click", e => {
  const btn = e.target.closest("button[data-act]");
  if (!btn) return;
  const id = btn.dataset.id;
  if (btn.dataset.act === "done") {
    const it = items.find(i => i.id === id);
    it.done = !it.done;
  } else {
    items = items.filter(i => i.id !== id);
  }
  save();
  render();
});

/* ===========================================================
   REMINDERS
   =========================================================== */
// When is the next time this item happens?
function eventTime(item, now) {
  if (item.type === "homework" || item.type === "online") {
    return item.due ? new Date(item.due) : null;
  }
  // schedule / class repeat weekly on the chosen day
  if (!item.day || !item.time) return null;
  const [h, m] = item.time.split(":").map(Number);
  for (let add = 0; add <= 7; add++) {
    const d = new Date(now);
    d.setDate(d.getDate() + add);
    d.setHours(h, m, 0, 0);
    if (d.getDay() === DAY_INDEX[item.day] && d.getTime() >= now.getTime() - 60000) return d;
  }
  return null;
}

function checkReminders() {
  if (!currentUser) return;
  const now = new Date();
  const fired = read("scadlar_fired_" + currentUser.email, {});
  let changed = false;

  items.forEach(item => {
    if (item.done) return;
    const when = eventTime(item, now);
    if (!when) return;
    const start = when.getTime() - item.remind * 60000;
    const key = item.id + "_" + when.getTime();
    const stillRelevant = now.getTime() <= when.getTime() + 60 * 60000;
    if (now.getTime() >= start && stillRelevant && !fired[key]) {
      fired[key] = true;
      changed = true;
      let text;
      if (item.type === "schedule") text = Schedule: ${item.day} at ${fmtTime(item.time)};
      else if (item.type === "class") text = Class: ${item.subject} at ${fmtTime(item.time)}, Room ${item.room};
      else text = ${TYPE_LABEL[item.type]}: ${item.title} (${item.subject});
      toast(<b>⏰ Reminder</b><br>${esc(text)});
      if ("Notification" in window && Notification.permission === "granted") {
        new Notification("Scadlar reminder", { body: text });
      }
    }
  });
  if (changed) write("scadlar_fired_" + currentUser.email, fired);
}
setInterval(checkReminders, 30000);

$("#bellBtn").onclick = () => {
  if (!("Notification" in window)) { toast("Your browser doesn't support notifications."); return; }
  Notification.requestPermission().then(p =>
    toast(p === "granted" ? "<b>🔔 Notifications on</b>" : "Notifications are blocked in your browser settings."));
};

/* ===========================================================
   START
   =========================================================== */
setMode("login");
const saved = read("scadlar_session", null);
if (saved) startSession(saved);
