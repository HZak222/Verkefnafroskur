/* =====================================================================
   FROSKURINN — Verkefnalisti
   -------------------------------------------------------------------
   Til að tengja við Firebase (svo gögn samstillist milli tækja, eins
   og í Golfhringur / Krumpi / PantaAM): settu þína stillingu hér inn.
   Ef þú skilur þetta eftir óbreytt keyrir appið bara á staðbundinni
   geymslu (localStorage) í þessu tæki — virkar fínt eitt og sér.
===================================================================== */
const firebaseConfig = {
  apiKey: "AIzaSyDY5nHkS0kmdkXdBs1Q5bTgl7Rg8bjvj3E",
  authDomain: "verkefnalisti-frosks.firebaseapp.com",
  databaseURL: "https://verkefnalisti-frosks-default-rtdb.europe-west1.firebasedatabase.app",
  projectId: "verkefnalisti-frosks",
  storageBucket: "verkefnalisti-frosks.firebasestorage.app",
  messagingSenderId: "293886002970",
  appId: "1:293886002970:web:554db7040ce1725cd38ea3",
  measurementId: "G-3YNT7VY8HZ"
};

/* ===================================================================== */

const PRIORITIES = [
  { key: "mikilvaegt", label: "Mikilvægt", sub: "gera núna", color: "red" },
  { key: "midlungs", label: "Miðlungs", sub: "fljótlega", color: "yellow" },
  { key: "lagt", label: "Lágt", sub: "þegar tími gefst", color: "green" },
  { key: "langtimi", label: "Hugmyndir", sub: "kannski einn daginn", color: "blue" },
];

const TIERS = [
  { min: 0, name: "Halakvísill", emoji: "🐣" },
  { min: 5, name: "Ungfroskur", emoji: "🐸" },
  { min: 15, name: "Froskur", emoji: "🐸" },
  { min: 30, name: "Risafroskur", emoji: "🐸" },
  { min: 60, name: "Froskakóngur", emoji: "👑" },
];

const QUIPS = [
  "Einn kubbur í einu, kappi.",
  "Froskurinn trúir á þig. 🐸",
  "Lítið stökk telur alveg jafn mikið og stórt.",
  "Þú þarft ekki að klára allt — bara eitt.",
  "Byrjaðu á því minnsta. Restin fylgir.",
  "Engin fullkomnun í dag, bara framfarir.",
  "Taktu því rólega — en taktu skrefið.",
  "Ein tikk-mörk gerir daginn betri.",
];

const STORAGE_KEY = "froskurinn_state_v1";

function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

function defaultState() {
  return {
    tasks: [],
    archive: [],
    users: [
      { name: "Liljan", code: "LD" },
      { name: "Jón Bjartur", code: "JBA" },
      { name: "Bjartmar", code: "BA" },
      { name: "Froskur", code: "AMJ" },
    ],
    meta: { streak: 0, bestStreak: 0, lastCompletedDate: null, totalCompleted: 0 },
  };
}

let state = loadLocal() || defaultState();
let currentPriority = null;
let firebaseActive = false;
let fbRootRef = null;
let suppressFirebaseEcho = false;

function loadLocal() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch (e) {
    return null;
  }
}

function saveLocal() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function persist() {
  saveLocal();
  if (firebaseActive && !suppressFirebaseEcho) {
    fbRootRef.set(state).catch((e) => console.warn("Firebase write villa:", e));
  }
}

/* ---------------------- Firebase (optional) ---------------------- */
function maybeInitFirebase() {
  const looksConfigured =
    firebaseConfig.apiKey && !firebaseConfig.apiKey.includes("REPLACE_ME");
  if (!looksConfigured) {
    setFirebaseStatusText("Staða: ekki tengt — keyrir á staðbundinni geymslu í þessu tæki.");
    return;
  }
  const s1 = document.createElement("script");
  s1.src = "https://www.gstatic.com/firebasejs/10.12.2/firebase-app-compat.js";
  s1.onload = () => {
    const s2 = document.createElement("script");
    s2.src = "https://www.gstatic.com/firebasejs/10.12.2/firebase-database-compat.js";
    s2.onload = () => {
      try {
        firebase.initializeApp(firebaseConfig);
        fbRootRef = firebase.database().ref("froskurinn");
        firebaseActive = true;
        setFirebaseStatusText("Staða: tengt við Firebase — samstillist milli tækja.");
        fbRootRef.on("value", (snap) => {
          const val = snap.val();
          if (val) {
            suppressFirebaseEcho = true;
            state = Object.assign(defaultState(), val);
            saveLocal();
            renderAll();
            suppressFirebaseEcho = false;
          } else {
            fbRootRef.set(state);
          }
        });
      } catch (e) {
        console.warn("Firebase init villa:", e);
        setFirebaseStatusText("Staða: villa við Firebase tengingu — keyrir staðbundið.");
      }
    };
    document.head.appendChild(s2);
  };
  document.head.appendChild(s1);
}

function setFirebaseStatusText(t) {
  const el = document.getElementById("firebase-status");
  if (el) el.textContent = t;
}

/* ---------------------- Gamification ---------------------- */
function currentTier() {
  let t = TIERS[0];
  for (const tier of TIERS) if (state.meta.totalCompleted >= tier.min) t = tier;
  return t;
}
function nextTier() {
  const idx = TIERS.indexOf(currentTier());
  return TIERS[idx + 1] || null;
}
function bumpStreakOnComplete() {
  const today = new Date().toDateString();
  if (state.meta.lastCompletedDate === today) {
    // already counted today
  } else if (state.meta.lastCompletedDate === new Date(Date.now() - 86400000).toDateString()) {
    state.meta.streak += 1;
  } else {
    state.meta.streak = 1;
  }
  state.meta.lastCompletedDate = today;
  state.meta.bestStreak = Math.max(state.meta.bestStreak, state.meta.streak);
  state.meta.totalCompleted += 1;
}

/* ---------------------- Rendering ---------------------- */
function $(sel) { return document.querySelector(sel); }
function $all(sel) { return Array.from(document.querySelectorAll(sel)); }

function renderHeader() {
  const tier = currentTier();
  $("#tier-badge").textContent = `${tier.emoji} ${tier.name}`;
  $("#streak-line").textContent =
    state.meta.streak > 0 ? `${state.meta.streak} daga runa 🔥` : "byrjaðu rununa í dag";
}

function setQuip(text) {
  $("#frog-quip").textContent = text || QUIPS[Math.floor(Math.random() * QUIPS.length)];
}

function renderHome() {
  const grid = $("#priority-grid");
  grid.innerHTML = "";
  PRIORITIES.forEach((p) => {
    const count = state.tasks.filter((t) => t.priority === p.key).length;
    const btn = document.createElement("button");
    btn.className = `priority-block p-${p.key}`;
    btn.innerHTML = `
      <div class="p-count">${count}</div>
      <div>
        <div class="p-title">${p.label}</div>
        <div class="p-sub">${p.sub}</div>
      </div>`;
    btn.addEventListener("click", () => openList(p.key));
    grid.appendChild(btn);
  });

  const ideaWrap = $("#ideas-row");
  const ideas = state.tasks.filter((t) => t.priority === "langtimi").slice(0, 3);
  if (ideas.length === 0) {
    ideaWrap.innerHTML = "";
    return;
  }
  ideaWrap.innerHTML = `<h4>Nýjustu hugmyndir</h4>` +
    ideas.map((t) => `<div class="task-title" style="margin-bottom:6px;">💡 ${escapeHtml(t.title)}</div>`).join("");
}

function priorityMeta(key) {
  return PRIORITIES.find((p) => p.key === key);
}

function openList(priorityKey) {
  currentPriority = priorityKey;
  const meta = priorityMeta(priorityKey);
  $("#list-title").textContent = `${meta.label} — ${meta.sub}`;
  renderTaskList();
  switchView("list");
}

function daysUntil(dateStr) {
  if (!dateStr) return null;
  const d = new Date(dateStr + "T00:00:00");
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.round((d - today) / 86400000);
}

function renderTaskList() {
  const list = $("#task-list");
  const tasks = state.tasks
    .filter((t) => t.priority === currentPriority)
    .sort((a, b) => (a.deadline || "9999").localeCompare(b.deadline || "9999"));
  list.innerHTML = "";
  $("#list-empty").hidden = tasks.length > 0;

  tasks.forEach((t) => {
    const card = document.createElement("div");
    card.className = `task-card pri-${t.priority}`;
    const du = daysUntil(t.deadline);
    let dueChip = "";
    if (t.deadline) {
      const label = du < 0 ? `${Math.abs(du)}d sein` : du === 0 ? "í dag" : `${du}d eftir`;
      dueChip = `<span class="chip ${du !== null && du <= 0 ? "due-soon" : ""}">${label}</span>`;
    }
    card.innerHTML = `
      <button class="task-check" aria-label="Klára verkefni">
        <svg viewBox="0 0 24 24"><path d="M5 13l4 4L19 7" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></svg>
      </button>
      <div class="task-main">
        <div class="task-title">${escapeHtml(t.title)}</div>
        <div class="task-meta">
          ${t.assignee ? `<span class="chip">${escapeHtml(t.assignee)}</span>` : ""}
          ${t.hours ? `<span class="chip">${t.hours} klst</span>` : ""}
          ${dueChip}
        </div>
      </div>
      <button class="task-del" aria-label="Eyða">✕</button>
    `;
    card.querySelector(".task-check").addEventListener("click", () => completeTask(t.id));
    card.querySelector(".task-del").addEventListener("click", () => deleteTask(t.id));
    list.appendChild(card);
  });
}

function escapeHtml(s) {
  return (s || "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

/* ---------------------- Task actions ---------------------- */
function completeTask(id) {
  const idx = state.tasks.findIndex((t) => t.id === id);
  if (idx === -1) return;
  const [task] = state.tasks.splice(idx, 1);
  task.completedAt = new Date().toISOString();
  state.archive.unshift(task);
  bumpStreakOnComplete();
  persist();
  renderTaskList();
  renderHome();
  renderHeader();
  fireConfetti();
  showToast(`Klárað! ${currentTier().emoji} ${currentTier().name}`);
  setQuip(pickCelebrationQuip());
}

function pickCelebrationQuip() {
  const opts = [
    "Þarna! Ein hola í viðbót í froskatjörninni.",
    "Stökk vel gert! 🐸",
    "Runan heldur áfram — flott hjá þér.",
    "Það er akkúrat svona sem hlutirnir klárast.",
  ];
  return opts[Math.floor(Math.random() * opts.length)];
}

function deleteTask(id) {
  state.tasks = state.tasks.filter((t) => t.id !== id);
  persist();
  renderTaskList();
  renderHome();
}

function restoreTask(id) {
  const idx = state.archive.findIndex((t) => t.id === id);
  if (idx === -1) return;
  const [task] = state.archive.splice(idx, 1);
  delete task.completedAt;
  state.tasks.unshift(task);
  persist();
  renderStats();
  renderHome();
  showToast("Verkefni sett aftur á listann.");
}

function deleteArchived(id) {
  state.archive = state.archive.filter((t) => t.id !== id);
  persist();
  renderStats();
}

/* ---------------------- New task form ---------------------- */
let selectedPriority = "mikilvaegt";

function renderPriorityPicker() {
  const wrap = $("#priority-picker");
  wrap.innerHTML = "";
  PRIORITIES.forEach((p) => {
    const b = document.createElement("button");
    b.type = "button";
    b.className = `pp-option pp-${p.key}` + (p.key === selectedPriority ? " selected" : "");
    b.textContent = p.label;
    b.addEventListener("click", () => {
      selectedPriority = p.key;
      renderPriorityPicker();
    });
    wrap.appendChild(b);
  });
}

function renderAssigneeOptions() {
  const sel = $("#f-assignee");
  sel.innerHTML = `<option value="">— ekki valið —</option>` +
    state.users.map((u) => `<option value="${escapeHtml(u.name)}">${escapeHtml(u.name)} (${escapeHtml(u.code)})</option>`).join("");
}

$("#task-form").addEventListener("submit", (e) => {
  e.preventDefault();
  const title = $("#f-title").value.trim();
  if (!title) return;
  const task = {
    id: uid(),
    title,
    priority: selectedPriority,
    assignee: $("#f-assignee").value,
    hours: $("#f-hours").value ? Number($("#f-hours").value) : null,
    deadline: $("#f-deadline").value || null,
    createdAt: new Date().toISOString(),
  };
  state.tasks.unshift(task);
  persist();
  e.target.reset();
  selectedPriority = "mikilvaegt";
  renderPriorityPicker();
  renderHome();
  showToast("Verkefni skráð 🐸");
  switchView("home");
});

/* ---------------------- Stats ---------------------- */
function renderStats() {
  const totalHoursDone = state.archive.reduce((s, t) => s + (t.hours || 0), 0);
  const tier = currentTier();
  const next = nextTier();
  const grid = $("#stats-grid");
  grid.innerHTML = `
    <div class="stat-card"><div class="stat-num">${state.meta.totalCompleted}</div><div class="stat-label">Kláruð verkefni</div></div>
    <div class="stat-card"><div class="stat-num">${state.meta.streak}</div><div class="stat-label">Daga runa núna</div></div>
    <div class="stat-card"><div class="stat-num">${state.meta.bestStreak}</div><div class="stat-label">Besta runa</div></div>
    <div class="stat-card"><div class="stat-num">${totalHoursDone}</div><div class="stat-label">Klst. lokið</div></div>
    <div class="tier-progress">
      <div>${tier.emoji} <strong>${tier.name}</strong>${next ? ` → næst: ${next.emoji} ${next.name} (${next.min - state.meta.totalCompleted} eftir)` : " — hæsta stig náð!"}</div>
      <div class="tier-progress-bar"><div class="tier-progress-fill" style="width:${tierProgressPct()}%"></div></div>
    </div>
  `;

  const archList = $("#archive-list");
  $("#archive-empty").hidden = state.archive.length > 0;
  archList.innerHTML = "";
  state.archive.slice(0, 40).forEach((t) => {
    const card = document.createElement("div");
    card.className = `task-card pri-${t.priority}`;
    card.style.opacity = ".8";
    card.innerHTML = `
      <div class="task-check" style="border-color:var(--frog-green); color:var(--frog-green);">
        <svg viewBox="0 0 24 24" style="opacity:1"><path d="M5 13l4 4L19 7" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></svg>
      </div>
      <div class="task-main">
        <div class="task-title" style="text-decoration:line-through;">${escapeHtml(t.title)}</div>
        <div class="task-meta"><span class="chip">${new Date(t.completedAt).toLocaleDateString("is-IS")}</span></div>
      </div>
      <button class="task-del" aria-label="Endurvekja" title="Setja aftur á listann">↺</button>
    `;
    card.querySelector(".task-del").addEventListener("click", () => restoreTask(t.id));
    archList.appendChild(card);
  });
}

function tierProgressPct() {
  const tier = currentTier();
  const next = nextTier();
  if (!next) return 100;
  const span = next.min - tier.min;
  const done = state.meta.totalCompleted - tier.min;
  return Math.max(4, Math.min(100, Math.round((done / span) * 100)));
}

/* ---------------------- Settings ---------------------- */
function renderUsers() {
  const wrap = $("#user-list");
  wrap.innerHTML = "";
  state.users.forEach((u, i) => {
    const row = document.createElement("div");
    row.className = "user-row";
    row.innerHTML = `<span>${escapeHtml(u.name)} <span class="u-code">${escapeHtml(u.code)}</span></span><button aria-label="Fjarlægja">✕</button>`;
    row.querySelector("button").addEventListener("click", () => {
      state.users.splice(i, 1);
      persist();
      renderUsers();
      renderAssigneeOptions();
    });
    wrap.appendChild(row);
  });
}

$("#user-form").addEventListener("submit", (e) => {
  e.preventDefault();
  const name = $("#u-name").value.trim();
  const code = $("#u-code").value.trim().toUpperCase();
  if (!name || !code) return;
  state.users.push({ name, code });
  persist();
  e.target.reset();
  renderUsers();
  renderAssigneeOptions();
});

$("#btn-export").addEventListener("click", () => {
  const blob = new Blob([JSON.stringify(state, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `froskurinn-afrit-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
});

$("#btn-reset").addEventListener("click", () => {
  if (!confirm("Ertu viss? Þetta hreinsar öll verkefni, archive og tölfræði.")) return;
  state = defaultState();
  persist();
  renderAll();
  showToast("Allt hreinsað.");
});

/* ---------------------- Nav / view switching ---------------------- */
function switchView(name) {
  ["home", "list", "new", "stats", "settings"].forEach((v) => {
    $(`#view-${v}`).hidden = v !== name;
  });
  $all(".nav-btn").forEach((b) => b.classList.toggle("active", b.dataset.view === name));
  $("#btn-back").hidden = name !== "list";
  if (name === "new") { renderPriorityPicker(); renderAssigneeOptions(); }
  if (name === "stats") renderStats();
  if (name === "settings") renderUsers();
  window.scrollTo(0, 0);
}

$all(".nav-btn").forEach((b) => {
  b.addEventListener("click", () => switchView(b.dataset.view));
});
$("#btn-back").addEventListener("click", () => switchView("home"));
$("#btn-settings").addEventListener("click", () => switchView("settings"));

/* ---------------------- Toast & confetti ---------------------- */
let toastTimer = null;
function showToast(msg) {
  const el = $("#toast");
  el.textContent = msg;
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (el.hidden = true), 2200);
}

function fireConfetti() {
  const colors = ["#E8503A", "#F0B429", "#52B788", "#5B8DEF", "#F4EDE1"];
  const layer = $("#confetti-layer");
  for (let i = 0; i < 26; i++) {
    const piece = document.createElement("div");
    piece.className = "confetti-piece";
    piece.style.left = Math.random() * 100 + "vw";
    piece.style.background = colors[Math.floor(Math.random() * colors.length)];
    piece.style.animationDuration = 1.1 + Math.random() * 0.9 + "s";
    piece.style.opacity = String(0.7 + Math.random() * 0.3);
    layer.appendChild(piece);
    setTimeout(() => piece.remove(), 2200);
  }
}

/* ---------------------- Init ---------------------- */
function renderAll() {
  renderHeader();
  renderHome();
  renderStats();
  renderUsers();
  renderAssigneeOptions();
}

function init() {
  renderAll();
  setQuip();
  switchView("home");
  maybeInitFirebase();

  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("sw.js").catch((e) => console.warn("SW villa:", e));
  }
}

init();
