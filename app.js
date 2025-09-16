
// ===== CONFIG =====
// Ersetze durch deine Apps-Script Web-App URL (Als Web-App bereitstellen → URL)
const API_BASE = "https://script.google.com/a/macros/roche.com/s/AKfycbwItdRo-2hFuIzrW4mNLUh89w4xDfuBgGi0OAnrUV-yAHXnyo8Lz8ROEaC6ESA8fm00LQ/exec";

// Optional: Email via URL-Param (?email=alice@firma.com) oder Prompt speichern
function resolveEmail() {
  const params = new URLSearchParams(location.search);
  const urlMail = params.get("email");
  if (urlMail) { localStorage.setItem("kipass_email", urlMail); return urlMail; }
  const saved = localStorage.getItem("kipass_email");
  if (saved) return saved;
  const typed = window.prompt("Bitte gib deine E-Mail für den KI-Pass ein:");
  if (typed) localStorage.setItem("kipass_email", typed.trim());
  return typed || "";
}

// ===== State =====
let initialData = null; // { success, user:{name,level}, stations:[{name,description,iconLocked,iconUnlocked}], stamped:[name] }

// ===== Helpers =====
const $ = (id) => document.getElementById(id);
async function apiGet(path, params={}) {
  const qs = new URLSearchParams(params).toString();
  const res = await fetch(`${API_BASE}?${path}&${qs}`, { method: "GET" });
  if (!res.ok) throw new Error(`API ${res.status}`);
  return res.json();
}
async function apiPost(path, body={}) {
  const res = await fetch(`${API_BASE}?${path}`, { method: "POST", headers: {"Content-Type": "application/json"}, body: JSON.stringify(body) });
  if (!res.ok) throw new Error(`API ${res.status}`);
  return res.json();
}

// ===== Render/Logic =====
function renderPass() {
  $("message-area").style.display = "none";
  $("welcome-title").innerText = `KI-Pass für ${initialData.user.name}`;
  updateLevelBadge();
  updateProgressBar();
  renderStationBubbles();
  setupUnlockButton();
}

function renderStationBubbles() {
  const cluster = $("cluster-container");
  cluster.innerHTML = "";
  initialData.stations.forEach(station => {
    const isUnlocked = initialData.stamped.includes(station.name);
    const container = document.createElement("div");
    container.className = `station-container ${isUnlocked ? 'unlocked':'locked'}`;
    container.dataset.stationName = station.name;

    const image = document.createElement("div");
    image.className = "station-image";
    image.style.backgroundImage = `url('${isUnlocked ? station.iconUnlocked : station.iconLocked}')`;

    const label = document.createElement("div");
    label.className = "station-label";
    label.innerText = station.name;

    container.appendChild(image); container.appendChild(label);
    container.addEventListener('click', () => showDetailsPopup(station.name, station.description));
    cluster.appendChild(container);
  });
}

function showDetailsPopup(title, description) {
  $("popup-title").innerText = title;
  $("popup-description").innerText = description;
  $("details-popup").classList.add('visible');
}

document.addEventListener('click', (e) => {
  if (e.target && e.target.id === 'details-popup') {
    e.target.classList.remove('visible');
  }
});

function setupUnlockButton() {
  const unlockBtn = $("unlock-button");
  const codeInput = $("code-input");
  const msg = $("unlock-message");
  unlockBtn.addEventListener('click', async () => {
    const submittedCode = codeInput.value.trim();
    if (!submittedCode) return;
    unlockBtn.innerText = 'Prüfe...'; unlockBtn.disabled = true; msg.innerText = '';
    try {
      const response = await apiPost('action=unlock', { code: submittedCode, email: initialData.user.email });
      msg.innerText = response.message;
      if (response.success) {
        msg.style.color = 'green';
        if (!initialData.stamped.includes(response.unlockedStation)) initialData.stamped.push(response.unlockedStation);
        const node = document.querySelector(`.station-container[data-station-name="${response.unlockedStation}"]`);
        if (node) {
          node.classList.remove('locked'); node.classList.add('unlocked');
          node.querySelector('.station-image').style.backgroundImage = `url('${response.unlockedIcon}')`;
        }
        // Level/Progress aktualisieren
        const total = initialData.stations.length;
        const stamped = initialData.stamped.length;
        const pct = (stamped/total)*100;
        if (pct >= 80) initialData.user.level = 'KI Future Explorer';
        else if (pct >= 40) initialData.user.level = 'Advanced Explorer';
        else if (pct > 0) initialData.user.level = 'KI Explorer';
        updateLevelBadge(); updateProgressBar(); codeInput.value = '';
      } else { msg.style.color = 'red'; }
    } catch (err) {
      msg.style.color = 'red'; msg.innerText = `Fehler: ${err.message}`;
    } finally {
      unlockBtn.innerText = 'Freischalten'; unlockBtn.disabled = false;
    }
  });
  codeInput.addEventListener('keyup', (ev) => { if (ev.key === 'Enter') unlockBtn.click(); });
}

function updateLevelBadge() {
  const badge = $("level-badge");
  const level = initialData.user.level;
  if (level) {
    badge.innerText = level; badge.style.display = 'inline-block';
    badge.className = 'level-badge';
    if (level.includes('Future')) badge.classList.add('future');
    else if (level.includes('Advanced')) badge.classList.add('advanced');
    else if (level.includes('Explorer')) badge.classList.add('explorer');
  } else { badge.style.display = 'none'; }
}

function updateProgressBar() {
  const stampedCount = new Set(initialData.stamped).size;
  const total = initialData.stations.length;
  const pct = total > 0 ? (stampedCount/total)*100 : 0;
  $("progress-bar-fill").style.width = `${pct}%`;
  $("progress-marker").style.left = `${pct}%`;
  $("progress-label").innerText = `${stampedCount} von ${total} Stationen besucht`;
  $("progress-marker").innerText = stampedCount >= 5 ? '🚀' : stampedCount >= 3 ? '🔥' : stampedCount >= 1 ? '⭐' : '';
}

// ===== Boot =====
document.addEventListener('DOMContentLoaded', async () => {
  const email = resolveEmail();
  if (!email) {
    $("message-area").innerHTML = '<p style="color:red;">E-Mail benötigt. Lade die Seite mit ?email=dein@firma.com neu.</p>';
    return;
  }
  try {
    const data = await apiGet('action=initial', { email });
    if (!data.success) { $("message-area").innerHTML = `<p style="color:red;">Fehler: ${data.error}</p>`; return; }
    initialData = data; // enthält auch user.email vom Backend
    renderPass();
  } catch (error) {
    $("message-area").innerHTML = `<p style="color:red;">Ein kritischer Fehler: ${error.message}</p>`;
  }
});