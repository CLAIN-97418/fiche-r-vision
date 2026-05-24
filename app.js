// Application "Fiches de révision" : un écran d'affichage piloté à distance
// par une fenêtre télécommande. Synchro entre fenêtres du même navigateur
// via BroadcastChannel, avec localStorage comme source persistante.

const DECK_KEY = "frr-deck";
const STATE_KEY = "frr-state";
const channel = "BroadcastChannel" in window ? new BroadcastChannel("fiche-revision") : null;

const DEFAULT_DECK = [
  { q: "Capitale de l'Australie ?", a: "Canberra" },
  { q: "Quelle est la formule de l'eau ?", a: "H₂O" },
  { q: "Auteur des « Misérables » ?", a: "Victor Hugo" },
  { q: "Combien de côtés a un hexagone ?", a: "Six" },
  { q: "Année de la Révolution française ?", a: "1789" },
  { q: "Racine carrée de 144 ?", a: "12" },
];

// ---------- Persistance du deck ----------

function loadDeck() {
  try {
    const raw = localStorage.getItem(DECK_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length) return parsed;
    }
  } catch {}
  return DEFAULT_DECK;
}

function saveDeck(deck) {
  localStorage.setItem(DECK_KEY, JSON.stringify(deck));
}

function deckToText(deck) {
  return deck.map((f) => `${f.q} | ${f.a}`).join("\n");
}

function textToDeck(text) {
  return text
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const i = line.indexOf("|");
      if (i === -1) return { q: line, a: "" };
      return { q: line.slice(0, i).trim(), a: line.slice(i + 1).trim() };
    });
}

// ---------- État partagé (index courant + révélé) ----------

function loadState() {
  try {
    const raw = localStorage.getItem(STATE_KEY);
    if (raw) return JSON.parse(raw);
  } catch {}
  return { index: 0, flipped: false };
}

let deck = loadDeck();
let state = loadState();

function clampIndex(i) {
  if (deck.length === 0) return 0;
  return Math.max(0, Math.min(i, deck.length - 1));
}

// Met à jour l'état, le persiste et notifie les autres fenêtres.
function setState(patch, { broadcast = true } = {}) {
  state = { ...state, ...patch };
  state.index = clampIndex(state.index);
  localStorage.setItem(STATE_KEY, JSON.stringify(state));
  if (broadcast && channel) channel.postMessage({ kind: "state", state });
  render();
}

// ---------- Actions ----------

const actions = {
  next: () => setState({ index: clampIndex(state.index + 1), flipped: false }),
  prev: () => setState({ index: clampIndex(state.index - 1), flipped: false }),
  flip: () => setState({ flipped: !state.flipped }),
  goto: (i) => setState({ index: clampIndex(i), flipped: false }),
};

// ---------- Rendu ----------

function currentCard() {
  return deck[clampIndex(state.index)] || { q: "(aucune fiche)", a: "" };
}

function render() {
  const view = document.body.dataset.active;
  if (view === "display") renderDisplay();
  if (view === "remote") renderRemote();
}

function renderDisplay() {
  const card = currentCard();
  document.getElementById("d-position").textContent =
    deck.length ? `${state.index + 1} / ${deck.length}` : "";
  document.getElementById("d-question").textContent = card.q;
  const ans = document.getElementById("d-answer");
  ans.textContent = card.a;
  ans.hidden = !state.flipped;
}

function renderRemote() {
  const card = currentCard();
  document.getElementById("r-position").textContent =
    deck.length ? `${state.index + 1} / ${deck.length}` : "";
  document.getElementById("r-question").textContent = card.q;

  const ans = document.getElementById("r-answer");
  const ansLabel = document.getElementById("r-answer-label");
  ans.textContent = card.a;
  ans.hidden = !state.flipped;
  ansLabel.hidden = !state.flipped;

  document.getElementById("r-flip").textContent = state.flipped ? "Masquer" : "Révéler";

  const list = document.getElementById("r-list");
  list.innerHTML = "";
  deck.forEach((f, i) => {
    const li = document.createElement("li");
    if (i === state.index) li.classList.add("current");
    li.innerHTML = `<span class="num">${i + 1}</span><span class="q"></span>`;
    li.querySelector(".q").textContent = f.q;
    li.addEventListener("click", () => actions.goto(i));
    list.appendChild(li);
  });
}

// ---------- Synchro entre fenêtres ----------

if (channel) {
  channel.onmessage = (e) => {
    const msg = e.data;
    if (msg.kind === "state") setState(msg.state, { broadcast: false });
    if (msg.kind === "deck") {
      deck = loadDeck();
      setState({ index: clampIndex(state.index) }, { broadcast: false });
    }
  };
}

// Fenêtres sans BroadcastChannel : repli sur l'événement storage.
window.addEventListener("storage", (e) => {
  if (e.key === STATE_KEY) state = loadState();
  if (e.key === DECK_KEY) deck = loadDeck();
  render();
});

// ---------- Routage par hash ----------

function routeFromHash() {
  const h = location.hash.replace("#", "");
  document.body.dataset.active = ["display", "remote"].includes(h) ? h : "home";
  render();
}

window.addEventListener("hashchange", routeFromHash);

// ---------- Liaison de l'interface ----------

function bindHome() {
  document.querySelectorAll("[data-open]").forEach((btn) => {
    btn.addEventListener("click", () => {
      window.open(`${location.pathname}#${btn.dataset.open}`, "_blank");
    });
  });

  const input = document.getElementById("deck-input");
  input.value = deckToText(deck);

  document.getElementById("save-deck").addEventListener("click", () => {
    const next = textToDeck(input.value);
    if (!next.length) {
      setEditorStatus("Ajoute au moins une fiche.");
      return;
    }
    deck = next;
    saveDeck(deck);
    if (channel) channel.postMessage({ kind: "deck" });
    setState({ index: clampIndex(state.index) });
    setEditorStatus(`${deck.length} fiche(s) enregistrée(s).`);
  });

  document.getElementById("reset-deck").addEventListener("click", () => {
    deck = DEFAULT_DECK;
    saveDeck(deck);
    input.value = deckToText(deck);
    if (channel) channel.postMessage({ kind: "deck" });
    setState({ index: 0, flipped: false });
    setEditorStatus("Exemple restauré.");
  });
}

let statusTimer;
function setEditorStatus(text) {
  const el = document.getElementById("editor-status");
  el.textContent = text;
  clearTimeout(statusTimer);
  statusTimer = setTimeout(() => (el.textContent = ""), 2500);
}

function bindRemote() {
  document.getElementById("r-prev").addEventListener("click", actions.prev);
  document.getElementById("r-next").addEventListener("click", actions.next);
  document.getElementById("r-flip").addEventListener("click", actions.flip);
}

function bindDisplayKeys() {
  window.addEventListener("keydown", (e) => {
    if (document.body.dataset.active !== "display") return;
    if (e.key === "ArrowRight") actions.next();
    else if (e.key === "ArrowLeft") actions.prev();
    else if (e.key === " " || e.key === "Enter") {
      e.preventDefault();
      actions.flip();
    }
  });
}

// ---------- Démarrage ----------

bindHome();
bindRemote();
bindDisplayKeys();
routeFromHash();
