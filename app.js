/* =====================================================================
   FROSKURINN — Verkefnalisti
   -------------------------------------------------------------------
   Til að tengja við Firebase (svo gögn samstillist milli tækja, eins
   og í Golfhringur / Krumpi / PantaAM): settu þína stillingu hér inn.
   Ef þú skilur þetta eftir óbreytt keyrir appið bara á staðbundinni
   geymslu (localStorage) í þessu tæki — virkar fínt eitt og sér.
===================================================================== */
const firebaseConfig = {
  apiKey: "REPLACE_ME",
  authDomain: "REPLACE_ME.firebaseapp.com",
  databaseURL: "https://REPLACE_ME.firebaseio.com",
  projectId: "REPLACE_ME",
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
      { name: "Liljan", code: "LD", admin: false },
      { name: "Jón Bjartur", code: "JBA", admin: false },
      { name: "Bjartmar", code: "BA", admin: false },
      { name: "Froskur", code: "AMJ", admin: true },
    ],
    meta: { lastAssignee: "", perUser: {} },
  };
}

const LOCAL_PREFS_KEY = "froskurinn_local_prefs_v1";
const AVATAR_COLORS = ["#E8503A", "#F0B429", "#52B788", "#5B8DEF", "#B085F5", "#F07AA5"];

function loadLocalPrefs() {
  try {
    const raw = localStorage.getItem(LOCAL_PREFS_KEY);
    return raw ? JSON.parse(raw) : { currentUser: null, viewAll: false };
  } catch (e) {
    return { currentUser: null, viewAll: false };
  }
}
function saveLocalPrefs() {
  localStorage.setItem(LOCAL_PREFS_KEY, JSON.stringify(local));
}

let state = loadLocal() || defaultState();
let local = loadLocalPrefs();
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
            if (local.currentUser && !findUser(local.currentUser)) {
              local.currentUser = null;
              saveLocalPrefs();
            }
            renderAll();
            updateUserChip();
            if (!local.currentUser) openUserPicker(false);
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

/* ---------------------- Gamification (per notanda) ---------------------- */
// Tölfræði er geymd per notanda (state.meta.perUser[nafn]), ekki sem ein sameiginleg tala,
// svo hver sjái sína eigin framvindu — ekki tölur sem innihalda verkefni annarra.
function getUserMeta(name) {
  if (!state.meta.perUser) state.meta.perUser = {};
  if (!name) return { totalCompleted: 0, streak: 0, bestStreak: 0, lastCompletedDate: null };
  if (!state.meta.perUser[name]) {
    state.meta.perUser[name] = { totalCompleted: 0, streak: 0, bestStreak: 0, lastCompletedDate: null };
  }
  return state.meta.perUser[name];
}

function bumpStreakOnComplete(name) {
  if (!name) return;
  const m = getUserMeta(name);
  const today = new Date().toDateString();
  if (m.lastCompletedDate === today) {
    // þegar talið í dag
  } else if (m.lastCompletedDate === new Date(Date.now() - 86400000).toDateString()) {
    m.streak += 1;
  } else {
    m.streak = 1;
  }
  m.lastCompletedDate = today;
  m.bestStreak = Math.max(m.bestStreak, m.streak);
  m.totalCompleted += 1;
}

function tierFor(totalCompleted) {
  let t = TIERS[0];
  for (const tier of TIERS) if (totalCompleted >= tier.min) t = tier;
  return t;
}
function nextTierFor(totalCompleted) {
  const idx = TIERS.indexOf(tierFor(totalCompleted));
  return TIERS[idx + 1] || null;
}
function tierProgressPctFor(totalCompleted) {
  const tier = tierFor(totalCompleted);
  const next = nextTierFor(totalCompleted);
  if (!next) return 100;
  const span = next.min - tier.min;
  const done = totalCompleted - tier.min;
  return Math.max(4, Math.min(100, Math.round((done / span) * 100)));
}

// Tölfræðin sem á að birtast núna: annaðhvort persónuleg (þessi notandi), eða liðsheild
// (admin með "Sýna öll verkefni" á).
function activeStatsScope() {
  if (currentUserIsAdmin() && local.viewAll) {
    const names = state.users.map((u) => u.name);
    const metas = names.map((n) => getUserMeta(n));
    return {
      isTeam: true,
      totalCompleted: metas.reduce((s, m) => s + m.totalCompleted, 0),
      streak: Math.max(0, ...metas.map((m) => m.streak)),
      bestStreak: Math.max(0, ...metas.map((m) => m.bestStreak)),
    };
  }
  const m = getUserMeta(local.currentUser);
  return { isTeam: false, totalCompleted: m.totalCompleted, streak: m.streak, bestStreak: m.bestStreak };
}

/* ---------------------- Rendering ---------------------- */
function $(sel) { return document.querySelector(sel); }
function $all(sel) { return Array.from(document.querySelectorAll(sel)); }

/* ---------------------- Notandaskipting (per-device) ---------------------- */
function findUser(name) {
  return state.users.find((u) => u.name === name) || null;
}
function currentUserIsAdmin() {
  const u = findUser(local.currentUser);
  return !!(u && u.admin);
}
function taskVisible(t) {
  if (currentUserIsAdmin() && local.viewAll) return true;
  return t.assignee === local.currentUser;
}

function updateUserChip() {
  const nameEl = $("#user-chip-name");
  const switchLabel = $("#viewall-switch");
  const checkbox = $("#viewall-checkbox");
  nameEl.textContent = local.currentUser || "Velja notanda";
  if (currentUserIsAdmin()) {
    switchLabel.hidden = false;
    checkbox.checked = !!local.viewAll;
  } else {
    switchLabel.hidden = true;
    local.viewAll = false;
  }
}

function renderUserPicker() {
  const wrap = $("#user-picker-list");
  wrap.innerHTML = "";
  state.users.forEach((u, i) => {
    const b = document.createElement("button");
    b.className = "user-picker-option";
    b.style.background = AVATAR_COLORS[i % AVATAR_COLORS.length];
    b.innerHTML = `<span class="avatar">${escapeHtml(u.code)}</span> ${escapeHtml(u.name)}`;
    b.addEventListener("click", () => selectUser(u.name));
    wrap.appendChild(b);
  });
}

function openUserPicker(closable) {
  renderUserPicker();
  $("#user-picker-close").hidden = !closable;
  $("#user-picker").hidden = false;
}

function selectUser(name) {
  local.currentUser = name;
  saveLocalPrefs();
  $("#user-picker").hidden = true;
  updateUserChip();
  renderHome();
  if (!$("#view-list").hidden) renderTaskList();
  if (!$("#view-stats").hidden) renderStats();
  renderAssigneeOptions();
}

$("#user-chip-btn").addEventListener("click", () => openUserPicker(true));
$("#btn-switch-user").addEventListener("click", () => openUserPicker(true));
$("#user-picker-close").addEventListener("click", () => { $("#user-picker").hidden = true; });
$("#viewall-checkbox").addEventListener("change", (e) => {
  local.viewAll = e.target.checked;
  saveLocalPrefs();
  renderHome();
  if (!$("#view-list").hidden) renderTaskList();
});

function renderHeader() {
  const scope = activeStatsScope();
  const tier = tierFor(scope.totalCompleted);
  $("#tier-badge").textContent = `${tier.emoji} ${tier.name}`;
  $("#streak-line").textContent =
    scope.streak > 0 ? `${scope.streak} daga runa 🔥` : "byrjaðu rununa í dag";
}

function setQuip(text) {
  $("#frog-quip").textContent = text || QUIPS[Math.floor(Math.random() * QUIPS.length)];
}

function renderHome() {
  const grid = $("#priority-grid");
  grid.innerHTML = "";
  const myTasks = state.tasks.filter(taskVisible);
  PRIORITIES.forEach((p) => {
    const count = myTasks.filter((t) => t.priority === p.key).length;
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

  // Fagnaðarmynd þegar engin verkefni eru eftir (innan þess sem þessi notandi sér)
  const celebrationEl = $("#celebration");
  const noTasksLeft = myTasks.length === 0;
  celebrationEl.hidden = !noTasksLeft;
  const celebrationVideo = celebrationEl.querySelector("video");
  if (celebrationVideo) {
    if (noTasksLeft) celebrationVideo.play().catch(() => {});
    else celebrationVideo.pause();
  }

  // Verkefni með deadline í dag eða liðinn, óháð forgangi
  const dueAlert = $("#due-alert");
  const dueList = $("#due-list");
  const dueTasks = myTasks
    .filter((t) => t.deadline && daysUntil(t.deadline) <= 0)
    .sort((a, b) => a.deadline.localeCompare(b.deadline));
  dueList.innerHTML = "";
  dueTasks.forEach((t) => dueList.appendChild(makeTaskCardEl(t)));
  dueAlert.hidden = dueTasks.length === 0;
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
    .filter((t) => t.priority === currentPriority && taskVisible(t))
    .sort((a, b) => (a.deadline || "9999").localeCompare(b.deadline || "9999"));
  list.innerHTML = "";
  $("#list-empty").hidden = tasks.length > 0;
  tasks.forEach((t) => list.appendChild(makeTaskCardEl(t)));
}

function googleCalendarUrl(t) {
  if (!t.deadline) return null;
  const start = t.deadline.replace(/-/g, "");
  const endDateObj = new Date(t.deadline + "T00:00:00");
  endDateObj.setDate(endDateObj.getDate() + 1);
  const end = endDateObj.toISOString().slice(0, 10).replace(/-/g, "");
  const text = encodeURIComponent(t.title);
  const detailsParts = ["Verkefni úr Froskurinn appinu"];
  if (t.assignee) detailsParts.push(t.assignee);
  const details = encodeURIComponent(detailsParts.join(" — "));
  return `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${text}&dates=${start}/${end}&details=${details}`;
}

function makeTaskCardEl(t) {
  const card = document.createElement("div");
  card.className = `task-card pri-${t.priority}`;
  const du = daysUntil(t.deadline);
  let dueChip = "";
  if (t.deadline) {
    const label = du < 0 ? `${Math.abs(du)}d sein` : du === 0 ? "í dag" : `${du}d eftir`;
    dueChip = `<span class="chip ${du !== null && du <= 0 ? "due-soon" : ""}">${label}</span>`;
  }
  const calUrl = googleCalendarUrl(t);
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
    ${calUrl ? `<button class="task-cal" aria-label="Setja á dagatal">📅</button>` : ""}
    <button class="task-edit" aria-label="Breyta verkefni">✎</button>
    <button class="task-del" aria-label="Eyða">✕</button>
  `;
  card.querySelector(".task-check").addEventListener("click", () => completeTask(t.id));
  if (calUrl) {
    card.querySelector(".task-cal").addEventListener("click", () => window.open(calUrl, "_blank"));
  }
  card.querySelector(".task-edit").addEventListener("click", () => openEditTask(t));
  card.querySelector(".task-del").addEventListener("click", () => deleteTask(t.id));
  return card;
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
  const creditedUser = task.assignee || local.currentUser;
  bumpStreakOnComplete(creditedUser);
  persist();
  renderTaskList();
  renderHome();
  renderHeader();
  fireConfetti();
  if (creditedUser) {
    const m = getUserMeta(creditedUser);
    const tier = tierFor(m.totalCompleted);
    showToast(`Klárað! ${tier.emoji} ${tier.name}`);
  } else {
    showToast("Klárað! 🐸");
  }
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

/* ---------------------- New / edit task form ---------------------- */
let selectedPriority = "mikilvaegt";
let editingTaskId = null;

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
  // Sjálfgefið á þig sjálfan (notanda þessa tækis), annars á síðasta valda notanda
  if (local.currentUser && state.users.some((u) => u.name === local.currentUser)) {
    sel.value = local.currentUser;
  } else if (state.meta.lastAssignee && state.users.some((u) => u.name === state.meta.lastAssignee)) {
    sel.value = state.meta.lastAssignee;
  }
}

function openEditTask(t) {
  editingTaskId = t.id;
  selectedPriority = t.priority;
  renderAssigneeOptions();
  $("#f-title").value = t.title;
  $("#f-assignee").value = t.assignee || "";
  $("#f-hours").value = t.hours != null ? t.hours : "";
  $("#f-deadline").value = t.deadline || "";
  renderPriorityPicker();
  $("#new-form-title").textContent = "Breyta verkefni";
  $("#new-form-submit").textContent = "Vista breytingar";
  $("#new-form-cancel").hidden = false;
  switchView("new");
}

function exitEditMode() {
  editingTaskId = null;
  $("#new-form-title").textContent = "Nýtt verkefni";
  $("#new-form-submit").textContent = "Skrá verkefni 🐸";
  $("#new-form-cancel").hidden = true;
  $("#task-form").reset();
  selectedPriority = "mikilvaegt";
}

$("#new-form-cancel").addEventListener("click", () => {
  exitEditMode();
  switchView("home");
});

$("#task-form").addEventListener("submit", (e) => {
  e.preventDefault();
  const title = $("#f-title").value.trim();
  if (!title) return;
  const assignee = $("#f-assignee").value;
  const hours = $("#f-hours").value ? Number($("#f-hours").value) : null;
  const deadline = $("#f-deadline").value || null;
  if (assignee) state.meta.lastAssignee = assignee;

  if (editingTaskId) {
    const t = state.tasks.find((x) => x.id === editingTaskId);
    if (t) {
      t.title = title;
      t.priority = selectedPriority;
      t.assignee = assignee;
      t.hours = hours;
      t.deadline = deadline;
    }
    persist();
    exitEditMode();
    renderHome();
    showToast("Verkefni uppfært");
    switchView("home");
    return;
  }

  const task = {
    id: uid(),
    title,
    priority: selectedPriority,
    assignee,
    hours,
    deadline,
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
  const scope = activeStatsScope();
  const totalHoursDone = state.archive.filter(taskVisible).reduce((s, t) => s + (t.hours || 0), 0);
  const tier = tierFor(scope.totalCompleted);
  const next = nextTierFor(scope.totalCompleted);
  const grid = $("#stats-grid");
  const completedLabel = scope.isTeam ? "Kláruð verkefni (öll)" : "Kláruð verkefni";
  const streakLabel = scope.isTeam ? "Besta virka runa" : "Daga runa núna";
  grid.innerHTML = `
    <div class="stat-card"><div class="stat-num">${scope.totalCompleted}</div><div class="stat-label">${completedLabel}</div></div>
    <div class="stat-card"><div class="stat-num">${scope.streak}</div><div class="stat-label">${streakLabel}</div></div>
    <div class="stat-card"><div class="stat-num">${scope.bestStreak}</div><div class="stat-label">Besta runa</div></div>
    <div class="stat-card"><div class="stat-num">${totalHoursDone}</div><div class="stat-label">Klst. lokið</div></div>
    <div class="tier-progress">
      <div>${tier.emoji} <strong>${tier.name}</strong>${next ? ` → næst: ${next.emoji} ${next.name} (${next.min - scope.totalCompleted} eftir)` : " — hæsta stig náð!"}</div>
      <div class="tier-progress-bar"><div class="tier-progress-fill" style="width:${tierProgressPctFor(scope.totalCompleted)}%"></div></div>
    </div>
  `;

  const userStatsBlock = $("#user-stats-block");
  userStatsBlock.hidden = !currentUserIsAdmin();
  if (currentUserIsAdmin()) {
    const counts = state.users.map((u) => ({
      name: u.name,
      count: state.archive.filter((t) => t.assignee === u.name).length,
    }));
    const unassigned = state.archive.filter((t) => !t.assignee).length;
    if (unassigned > 0) counts.push({ name: "Ekki úthlutað", count: unassigned });
    const maxCount = Math.max(1, ...counts.map((c) => c.count));
    const wrap = $("#user-stats-list");
    wrap.innerHTML = counts
      .sort((a, b) => b.count - a.count)
      .map(
        (c) => `
        <div class="user-stat-row">
          <span class="usr-name">${escapeHtml(c.name)}</span>
          <span class="bar-track"><span class="bar-fill" style="width:${(c.count / maxCount) * 100}%"></span></span>
          <span class="usr-count">${c.count}</span>
        </div>`
      )
      .join("");
  }

  const archList = $("#archive-list");
  const visibleArchive = state.archive.filter(taskVisible);
  $("#archive-empty").hidden = visibleArchive.length > 0;
  archList.innerHTML = "";
  visibleArchive.slice(0, 40).forEach((t) => {
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

/* ---------------------- Settings ---------------------- */
function renderUsers() {
  const wrap = $("#user-list");
  wrap.innerHTML = "";
  state.users.forEach((u, i) => {
    const row = document.createElement("div");
    row.className = "user-row";
    row.innerHTML = `
      <span>${escapeHtml(u.name)} <span class="u-code">${escapeHtml(u.code)}</span></span>
      <label class="admin-toggle">
        <input type="checkbox" ${u.admin ? "checked" : ""}> Admin
      </label>
      <button class="user-del" aria-label="Fjarlægja ${escapeHtml(u.name)}">✕</button>
    `;
    row.querySelector(".admin-toggle input").addEventListener("change", (e) => {
      u.admin = e.target.checked;
      persist();
      updateUserChip();
    });
    row.querySelector(".user-del").addEventListener("click", () => {
      if (!confirm(`Fjarlægja ${u.name} (${u.code}) úr notendalistanum?`)) return;
      state.users.splice(i, 1);
      if (state.meta.lastAssignee === u.name) state.meta.lastAssignee = "";
      if (local.currentUser === u.name) { local.currentUser = null; saveLocalPrefs(); }
      persist();
      renderUsers();
      renderAssigneeOptions();
      updateUserChip();
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
  if (name !== "new" && editingTaskId) exitEditMode();
  ["home", "list", "new", "stats", "settings"].forEach((v) => {
    $(`#view-${v}`).hidden = v !== name;
  });
  $all(".nav-btn").forEach((b) => b.classList.toggle("active", b.dataset.view === name));
  $("#btn-back").hidden = name !== "list";
  if (name === "new" && !editingTaskId) { renderPriorityPicker(); renderAssigneeOptions(); }
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
  // Ef vistaði notandinn er farinn úr listanum (t.d. eytt í Settings), byrjum upp á nýtt
  if (local.currentUser && !findUser(local.currentUser)) {
    local.currentUser = null;
    saveLocalPrefs();
  }
  renderAll();
  updateUserChip();
  setQuip();
  switchView("home");
  maybeInitFirebase();

  if (!local.currentUser) openUserPicker(false);

  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("sw.js").catch((e) => console.warn("SW villa:", e));
  }
}

init();
