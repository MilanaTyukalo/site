"use strict";
let BOOKS = [];       
let FILTER_TAGS = []; 
let dataFailed = false;

const MOOD_WORDS = {
  "уютное": ["уют", "осен", "тепл", "плед", "спокойн", "мил"],
  "тревожное": ["трев", "напряж", "страш", "жут", "саспенс"],
  "вдохновляющее": ["вдохнов", "мотив", "смел", "мечт"],
  "приключенческое": ["приключ", "путешеств", "героя", "сильн", "поход"],
  "романтическое": ["любов", "романт", "чувств"],
  "мрачное": ["мрач", "темн", "одиночеств", "груст", "тоск"]
};

const DEFAULT_RECENT = ["hp", "percy", "dune", "1984", "prince", "orient"];
const byId = id => BOOKS.find(b => b.id === id);

const store = {
  get(key, fallback) {
    try { return JSON.parse(localStorage.getItem("booksai:" + key)) ?? fallback; }
    catch { return fallback; }
  },
  set(key, value) {
    try { localStorage.setItem("booksai:" + key, JSON.stringify(value)); } catch { /* приватный режим */ }
  }
};

const state = {
  favorites: store.get("favorites", []),
  history: store.get("history", []),
  recent: store.get("recent", DEFAULT_RECENT)
};

const $ = sel => document.querySelector(sel);
const els = {
  input: $("#queryInput"), searchBtn: $("#searchBtn"),
  tagsForm: $("#tagsForm"),
  results: $("#results"), resultsList: $("#resultsList"), resultsTitle: $("#resultsTitle"),
  mood: $("#moodBox"), reset: $("#resetBtn"),
  recentList: $("#recentList"), historyChips: $("#historyChips"), clearHistory: $("#clearHistoryBtn"),
  favBtn: $("#favoritesBtn"), favCount: $("#favCount"), favModal: $("#favModal"), favList: $("#favList"),
  modal: $("#bookModal"), modalBody: $("#modalBody")
};

const norm = s => s.toLowerCase().replace(/ё/g, "е");

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function makeCover(book, className) {
  const img = document.createElement("img");
  img.className = "cover " + className;
  img.src = book.image;
  img.onerror = () => { img.onerror = null; img.src = book.fallback; }; // нет вашей картинки — показываем запасную
  img.alt = "Обложка книги «" + book.title + "»";
  img.loading = "lazy";
  return img;
}

function makeCard(book, why) {
  const card = el("button", "card");
  card.type = "button";
  card.dataset.id = book.id;
  card.append(makeCover(book, "card__cover"));

  const info = el("div", "card__info");
  info.append(
    el("h3", "card__title", book.title),
    el("span", "card__author", book.author + " · " + book.category),
    el("span", "rating", "★ " + book.rating.toFixed(1)),
    el("p", "card__desc", book.desc)
  );
  if (why) info.append(el("span", "card__why", why));
  card.append(info);
  return card;
}

function analyze(query, selectedTags) {
  const q = norm(query);
  const words = q.split(/[^a-zа-я0-9]+/).filter(w => w.length > 2);

  const moods = Object.keys(MOOD_WORDS).filter(m => MOOD_WORDS[m].some(stem => q.includes(stem)));

  const mentioned = BOOKS.filter(b => {
    const titleWords = norm(b.title).split(/[^a-zа-я0-9]+/).filter(w => w.length > 3 || /^\d+$/.test(w));
    return titleWords.some(w => q.includes(w.slice(0, 5)));
  });
  const profileTags = new Set(selectedTags);
  mentioned.forEach(b => b.tags.forEach(t => profileTags.add(t)));

  FILTER_TAGS.forEach(t => { if (q.includes(t.slice(0, 5))) profileTags.add(t); });

  const scored = BOOKS
    .filter(b => !mentioned.includes(b))
    .map(b => {
      const themes = new Set();
      let score = 0;

      b.tags.forEach(t => { if (profileTags.has(t)) { score += 3; themes.add(t); } });
      b.kw.forEach(stem => {
        if (words.some(w => w.startsWith(stem) || stem.startsWith(w.slice(0, 5)) && w.length > 4)) {
          score += 2; themes.add(stem);
        }
      });
      b.moods.forEach(m => { if (moods.includes(m)) { score += 2; themes.add(m); } });
      score += b.rating / 10; // небольшой приоритет популярным
      return { book: b, score, themes: [...themes] };
    });

  const relevant = scored.filter(s => s.themes.length > 0).sort((a, b) => b.score - a.score);
  const fallback = relevant.length === 0;
  const list = fallback ? scored.sort((a, b) => b.book.rating - a.book.rating) : relevant;

  return { items: list.slice(0, 6), moods, mentioned, fallback };
}

function getSelectedTags() {
  return [...els.tagsForm.querySelectorAll("input:checked")].map(i => i.value);
}

function runSearch(query, scroll = true) {
  if (!BOOKS.length) {
    els.resultsList.replaceChildren(el("p", "fav-empty", "Не удалось загрузить data/data.json. Откройте проект через Live Server."));
    els.results.hidden = false;
    return;
  }
  const text = query.trim();
  const tags = getSelectedTags();

  if (!text && tags.length === 0) {
    els.input.focus();
    els.input.placeholder = "Напишите хотя бы пару слов о книге или выберите теги";
    return;
  }

  const { items, moods, mentioned, fallback } = analyze(text, tags);

  els.resultsList.replaceChildren();
  items.forEach(({ book, themes }) => {
    const why = fallback
      ? "Популярный выбор среди читателей"
      : "Рекомендуется, потому что запрос содержит темы: " + themes.slice(0, 4).join(", ");
    els.resultsList.append(makeCard(book, why));
  });

  els.resultsTitle.textContent = fallback
    ? "Точных совпадений нет — попробуйте эти книги"
    : "Подборка для вас";

  els.mood.replaceChildren();
  if (moods.length || mentioned.length) {
    els.mood.append(document.createTextNode("Настроение запроса: "));
    moods.forEach(m => els.mood.append(el("span", "mood__tag", m)));
    mentioned.forEach(b => els.mood.append(el("span", "mood__tag", "как «" + b.title + "»")));
    els.mood.hidden = false;
  } else {
    els.mood.hidden = true;
  }

  els.results.hidden = false;
  if (scroll) els.results.scrollIntoView({ behavior: "smooth", block: "start" });

  if (text) saveHistory(text);
}

function saveHistory(text) {
  state.history = [text, ...state.history.filter(h => h !== text)].slice(0, 6);
  store.set("history", state.history);
  renderHistory();
}

function renderHistory() {
  els.historyChips.replaceChildren();
  state.history.forEach(h => {
    const chip = el("button", "chip", h);
    chip.type = "button";
    chip.addEventListener("click", () => { els.input.value = h; runSearch(h); });
    els.historyChips.append(chip);
  });
  els.clearHistory.hidden = state.history.length === 0;
}

function makeTile(book) {
  const tile = el("button", "tile");
  tile.type = "button";
  tile.dataset.id = book.id;
  tile.append(makeCover(book, ""), el("b", "", book.title), el("small", "", book.author));
  return tile;
}

function renderRecent() {
  if (!BOOKS.length) return; 
  els.recentList.replaceChildren();
  state.recent.slice(0, 6).map(byId).filter(Boolean).forEach(b => els.recentList.append(makeTile(b)));
}

function touchRecent(id) {
  state.recent = [id, ...state.recent.filter(r => r !== id)];
  store.set("recent", state.recent);
  renderRecent();
}

function isFav(id) { return state.favorites.includes(id); }

function toggleFav(id) {
  state.favorites = isFav(id) ? state.favorites.filter(f => f !== id) : [...state.favorites, id];
  store.set("favorites", state.favorites);
  els.favCount.textContent = state.favorites.length;
}

function renderFavorites() {
  els.favList.replaceChildren();
  if (state.favorites.length === 0) {
    els.favList.append(el("p", "fav-empty", "Пока пусто. Откройте карточку книги и нажмите «Добавить в избранное»."));
    return;
  }
  state.favorites.map(byId).filter(Boolean).forEach(b => els.favList.append(makeCard(b)));
}

function openBook(id) {
  const b = byId(id);
  if (!b) return;
  touchRecent(id);

  const top = el("div", "modal__top");
  top.append(makeCover(b, "modal__cover"));

  const head = el("div");
  const title = el("h2", "modal__title", b.title);
  title.id = "modalTitle";
  head.append(
    title,
    el("div", "card__author", b.author),
    el("div", "modal__cat", b.category + " · ★ " + b.rating.toFixed(1)),
    el("p", "modal__text", b.full)
  );
  top.append(head);

  const tags = el("div", "modal__tags");
  tags.append(el("span", "", "Теги:"));
  b.shownTags.forEach(t => tags.append(el("span", "chip", "#" + t)));

  const ai = el("div", "modal__ai", "AI рекомендует: если вам понравилась эта книга, обратите внимание на похожие произведения ниже.");

  const similar = el("div", "modal__similar");
  b.similar.map(byId).forEach(s => {
    const chip = el("button", "chip", s.title);
    chip.type = "button";
    chip.addEventListener("click", () => openBook(s.id));
    similar.append(chip);
  });

  const actions = el("div", "modal__actions");
  const favBtn = el("button", "btn btn--dark", isFav(id) ? "Убрать из избранного" : "Добавить в избранное");
  favBtn.type = "button";
  favBtn.addEventListener("click", () => {
    toggleFav(id);
    favBtn.textContent = isFav(id) ? "Убрать из избранного" : "Добавить в избранное";
  });
  const again = el("button", "btn btn--blue", "Новый поиск");
  again.type = "button";
  again.addEventListener("click", () => { els.modal.close(); newSearch(); });
  actions.append(favBtn, again);

  els.modalBody.replaceChildren(top, tags, ai, el("strong", "", "Похожие произведения"), similar, actions);
  if (!els.modal.open) els.modal.showModal();
  els.modal.scrollTop = 0;
}

function newSearch() {
  els.input.value = "";
  els.tagsForm.querySelectorAll("input").forEach(i => (i.checked = false));
  els.results.hidden = true;
  document.getElementById("search").scrollIntoView({ behavior: "smooth" });
  els.input.focus({ preventScroll: true });
}

function init() {

  document.querySelectorAll("img[data-book]").forEach(img => {
    const b = byId(img.dataset.book);
    if (b) { img.dataset.fallback = b.fallback; img.onerror = () => { img.onerror = null; img.src = b.fallback; }; img.src = b.image; }
  });
  els.favCount.textContent = state.favorites.length;
  renderHistory();
  renderRecent();

  $("#searchForm").addEventListener("submit", e => { e.preventDefault(); runSearch(els.input.value); });
  els.tagsForm.addEventListener("change", () => runSearch(els.input.value, false));
  els.tagsForm.addEventListener("submit", e => e.preventDefault());
  els.reset.addEventListener("click", newSearch);

  document.querySelectorAll("[data-example]").forEach(btn =>
    btn.addEventListener("click", () => {
      els.input.value = btn.dataset.example;
      runSearch(btn.dataset.example);
    })
  );

  document.addEventListener("click", e => {
    const card = e.target.closest(".card, .tile");
    if (!card) return;
    if (els.favModal.open) els.favModal.close();
    openBook(card.dataset.id);
  });

  els.clearHistory.addEventListener("click", () => {
    state.history = [];
    store.set("history", []);
    renderHistory();
  });

  const burger = $("#burgerBtn"), nav = $("#mainNav");
  const setMenu = open => {
    nav.classList.toggle("is-open", open);
    burger.setAttribute("aria-expanded", String(open));
    burger.setAttribute("aria-label", open ? "Закрыть меню" : "Открыть меню");
  };
  burger.addEventListener("click", () => setMenu(!nav.classList.contains("is-open")));
  nav.addEventListener("click", e => { if (e.target.closest("a")) setMenu(false); });
  document.addEventListener("keydown", e => { if (e.key === "Escape") setMenu(false); });
  window.matchMedia("(min-width: 861px)").addEventListener("change", () => setMenu(false));


  els.favBtn.addEventListener("click", () => { renderFavorites(); els.favModal.showModal(); });
  $("#favClose").addEventListener("click", () => els.favModal.close());
  $("#modalClose").addEventListener("click", () => els.modal.close());

  [els.modal, els.favModal].forEach(dialog =>
    dialog.addEventListener("click", e => { if (e.target === dialog) dialog.close(); })
  );
  els.modal.addEventListener("close", () => { els.favCount.textContent = state.favorites.length; });
}

async function start() {
  try {
    const res = await fetch("data/data.json");
    if (!res.ok) throw new Error(res.status);
    const data = await res.json();
    BOOKS = data.books;
    FILTER_TAGS = data.filterTags;
  } catch (err) {
    dataFailed = true;
    console.warn("data/data.json не загружен (нужен Live Server):", err);
  }
  init();
}

start();
