// Fiches de révision.
// Vue par défaut (#home) : réviseur autonome, fonctionne seul au double-clic.
// Mode bonus "2 fenêtres" : #display (écran) piloté par #remote (télécommande),
// synchronisés via localStorage (+ BroadcastChannel si disponible).

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

function saveDeck(d) {
  try { localStorage.setItem(DECK_KEY, JSON.stringify(d)); } catch {}
}

function deckToText(d) {
  return d.map((f) => `${f.q} | ${f.a}`).join("\n");
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

// ---------- État partagé ----------

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

function setState(patch, { broadcast = true } = {}) {
  state = { ...state, ...patch };
  state.index = clampIndex(state.index);
  try { localStorage.setItem(STATE_KEY, JSON.stringify(state)); } catch {}
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

function fillCard(prefix) {
  const card = currentCard();
  const pos = document.getElementById(prefix + "-position");
  if (pos) pos.textContent = deck.length ? `${state.index + 1} / ${deck.length}` : "";
  document.getElementById(prefix + "-question").textContent = card.q;
  const ans = document.getElementById(prefix + "-answer");
  ans.textContent = card.a;
  ans.hidden = !state.flipped;
  const flipBtn = document.getElementById(prefix + "-flip");
  if (flipBtn) flipBtn.textContent = state.flipped ? "Masquer" : "Révéler";
}

function render() {
  const view = document.body.dataset.active;
  if (view === "home") fillCard("h");
  if (view === "display") fillCard("d");
  if (view === "remote") renderRemote();
}

function renderRemote() {
  fillCard("r");
  document.getElementById("r-answer-label").hidden = !state.flipped;

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
    if (msg.kind === "state") { state = msg.state; render(); }
    if (msg.kind === "deck") { deck = loadDeck(); state.index = clampIndex(state.index); render(); }
  };
}

window.addEventListener("storage", (e) => {
  if (e.key === STATE_KEY) state = loadState();
  if (e.key === DECK_KEY) { deck = loadDeck(); state.index = clampIndex(state.index); }
  render();
});

// ---------- Routage par hash ----------

function routeFromHash() {
  const h = location.hash.replace("#", "");
  document.body.dataset.active = ["display", "remote"].includes(h) ? h : "home";
  render();
}

window.addEventListener("hashchange", routeFromHash);

// ---------- Interface ----------

function bindControls(prefix) {
  const prev = document.getElementById(prefix + "-prev");
  const next = document.getElementById(prefix + "-next");
  const flip = document.getElementById(prefix + "-flip");
  if (prev) prev.addEventListener("click", actions.prev);
  if (next) next.addEventListener("click", actions.next);
  if (flip) flip.addEventListener("click", actions.flip);
}

function bindEditor() {
  const input = document.getElementById("deck-input");
  input.value = deckToText(deck);

  document.getElementById("save-deck").addEventListener("click", () => {
    const next = textToDeck(input.value);
    if (!next.length) { setEditorStatus("Ajoute au moins une fiche."); return; }
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

function bindRemoteLauncher() {
  document.getElementById("open-remote").addEventListener("click", () => {
    // L'écran d'affichage part dans une nouvelle fenêtre ;
    // la fenêtre actuelle devient la télécommande.
    window.open(location.pathname + "#display", "_blank");
    location.hash = "remote";
  });
}

let statusTimer;
function setEditorStatus(text) {
  const el = document.getElementById("editor-status");
  el.textContent = text;
  clearTimeout(statusTimer);
  statusTimer = setTimeout(() => (el.textContent = ""), 2500);
}

window.addEventListener("keydown", (e) => {
  if (document.body.dataset.active === "remote") return;
  if (e.target.tagName === "TEXTAREA") return;
  if (e.key === "ArrowRight") actions.next();
  else if (e.key === "ArrowLeft") actions.prev();
  else if (e.key === " " || e.key === "Enter") { e.preventDefault(); actions.flip(); }
});

// ---------- Démarrage ----------

bindControls("h");
bindControls("r");
bindEditor();
bindRemoteLauncher();
routeFromHash();
