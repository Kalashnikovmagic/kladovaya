'use strict';

/* =========================================================
   Кладовая — меню → список → закупка → контроль трат
   ========================================================= */
const KEY = 'kladovaya:v2';
const OLD_KEY = 'kladovaya:v1';
const TAB_KEY = 'kladovaya:tab';

const CATEGORIES = ['Овощи и фрукты', 'Молочное', 'Мясо и рыба', 'Хлеб и выпечка', 'Бакалея', 'Спортпит', 'Заморозка', 'Напитки', 'Сладкое', 'Бытовое', 'Другое'];
const FRESH_CATS = ['Овощи и фрукты', 'Молочное', 'Мясо и рыба', 'Хлеб и выпечка'];
const UNITS = ['г', 'мл', 'шт'];
const SLOTS = ['Завтрак', 'Обед', 'Перекус', 'Ужин', 'Дополнительно'];
const EXTRA_KINDS = ['Доставка еды', 'Кафе / готовая еда', 'Перекус на ходу', 'Докупка в магазине'];
const JUNK = ['Доставка еды', 'Кафе / готовая еда'];

/* ---------- даты и форматирование ---------- */
const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
const iso = (d) => { const x = new Date(d); x.setMinutes(x.getMinutes() - x.getTimezoneOffset()); return x.toISOString().slice(0, 10); };
const today = () => iso(new Date());
const addDays = (s, n) => { const d = new Date(s + 'T12:00'); d.setDate(d.getDate() + n); return iso(d); };
const daysBetween = (a, b) => Math.round((new Date(b + 'T12:00') - new Date(a + 'T12:00')) / 864e5);
const daysUntil = (s) => (s ? daysBetween(today(), s) : null);
const fmtDate = (s) => (s ? new Date(s + 'T12:00').toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' }) : '');
const fmtDay = (s) => new Date(s + 'T12:00').toLocaleDateString('ru-RU', { weekday: 'short', day: 'numeric', month: 'short' });

const $ = (s, el = document) => el.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const num = (n, d = 2) => (+n || 0).toLocaleString('ru-RU', { maximumFractionDigits: d });
const money = (n) => Math.round(+n || 0).toLocaleString('ru-RU') + ' ₽';
function fmtQty(n, unit) {
  n = +n || 0;
  if (unit === 'г' && Math.abs(n) >= 1000) return num(n / 1000) + ' кг';
  if (unit === 'мл' && Math.abs(n) >= 1000) return num(n / 1000) + ' л';
  return num(n) + ' ' + (unit || '');
}

/* ---------- стартовые данные: продукты и рецепты пользователя ---------- */
function seed() {
  const products = [];
  const P = (name, category, unit, pack, price, extra = {}) => {
    const p = { id: uid(), name, category, unit, pack, price, stock: 0, minQty: 0, expiry: '', fresh: FRESH_CATS.includes(category), ...extra };
    products.push(p);
    return p;
  };
  // Цены — ориентировочные; после первой закупки подставятся реальные.
  const oats = P('Овсяные хлопья', 'Бакалея', 'г', 400, 90);
  const milk = P('Молоко 2,5%', 'Молочное', 'мл', 930, 95);
  const eggs = P('Яйца', 'Молочное', 'шт', 10, 130);
  const chicken = P('Куриное филе', 'Мясо и рыба', 'г', 1000, 480);
  const curd = P('Творожный сыр', 'Молочное', 'г', 140, 140);
  const cheese = P('Твёрдый сыр', 'Молочное', 'г', 200, 230);
  const tomato = P('Помидоры', 'Овощи и фрукты', 'г', 1000, 260);
  const cucumber = P('Огурцы', 'Овощи и фрукты', 'г', 1000, 190);
  const teriyaki = P('Соус терияки', 'Бакалея', 'г', 250, 190);
  const protein = P('Сывороточный протеин', 'Спортпит', 'г', 900, 2600);
  const banana = P('Бананы', 'Овощи и фрукты', 'г', 1000, 150);
  const nectarine = P('Нектарины', 'Овощи и фрукты', 'г', 1000, 320);
  const walnuts = P('Грецкие орехи', 'Бакалея', 'г', 200, 260);
  const groats = P('Крупа (рис / гречка / булгур)', 'Бакалея', 'г', 800, 120);
  const veg = P('Овощи для гарнира', 'Заморозка', 'г', 400, 160);
  const oil = P('Оливковое масло', 'Бакалея', 'мл', 500, 750);
  const tvorog = P('Творог', 'Молочное', 'г', 200, 120);
  const yogurt = P('Греческий йогурт', 'Молочное', 'г', 250, 150);
  const tortilla = P('Тортильи', 'Хлеб и выпечка', 'шт', 6, 160, { fresh: false });
  const mince = P('Фарш индейки', 'Мясо и рыба', 'г', 400, 320);
  const sauce = P('Соус для тортилий', 'Бакалея', 'г', 250, 160);
  const crisp = P('Хлебцы Dr. Korner', 'Хлеб и выпечка', 'шт', 10, 120, { fresh: false });

  const I = (p, qty, o = {}) => ({ productId: p.id, qty, ...o });
  const R = (name, slot, kcal, protein, ings, note = '', approx = true) => ({ id: uid(), name, slot, kcal, protein, approx, ings, note });
  const recipes = [
    R('Овсяноблин с курицей и сыром', 'Завтрак', 530, 45,
      [I(oats, 55), I(milk, 80), I(eggs, 2), I(chicken, 60, { note: '≈45 г в готовом виде' }), I(curd, 7), I(cheese, 15), I(tomato, 50), I(cucumber, 40), I(teriyaki, 15)],
      'Смешать овсянку, молоко и яйца, приготовить блин на сковороде. Добавить мясо, сыр, овощи и соус, сложить пополам.', false),
    R('Овсянка с протеином и фруктами', 'Завтрак', 630, 27,
      [I(oats, 90, { note: '85–100 г' }), I(protein, 15), I(banana, 125), I(nectarine, 130, { optional: true }), I(walnuts, 18)],
      'Сварить овсянку на воде, после приготовления вмешать протеин, добавить нарезанные фрукты и орехи.'),
    R('Курица с крупой и овощами', 'Обед', 660, 70,
      [I(chicken, 270, { note: '≈200 г в готовом виде (150–250)' }), I(groats, 80, { note: 'в сухом виде' }), I(veg, 200, { note: '150–250 г' }), I(oil, 5, { optional: true })],
      'Приготовить крупу отдельно, курицу запечь или обжарить со специями, подать с овощами.'),
    R('Протеиновый коктейль', 'Перекус', 276, 33, [I(milk, 300), I(protein, 30)],
      'Смешать в шейкере или блендере. Ж 9,5 г, У 17 г.', false),
    R('Творожный десерт с фруктами', 'Перекус', 450, 49,
      [I(tvorog, 175, { note: '150–200 г' }), I(yogurt, 90), I(protein, 12), I(banana, 135)],
      'Смешать творог, йогурт и протеин, добавить нарезанные фрукты.'),
    R('Тортильи с фаршем индейки и сыром', 'Ужин', 950, 60,
      [I(tortilla, 2), I(mince, 200), I(cheese, 40), I(tomato, 150), I(cucumber, 100), I(sauce, 35)],
      'Обжарить фарш, выложить на тортильи, добавить сыр, овощи и соус, свернуть и прогреть на сковороде.'),
    R('Капучино', 'Дополнительно', 90, 5, [I(milk, 175)]),
    R('Хлебцы Dr. Korner', 'Дополнительно', 70, 2, [I(crisp, 2)]),
    R('Фрукт (банан)', 'Дополнительно', 130, 2, [I(banana, 135)]),
    R('Грецкие орехи', 'Дополнительно', 120, 3, [I(walnuts, 18)]),
  ];
  return { products, recipes };
}

/* ---------- загрузка / миграция ---------- */
function migrateProduct(p) {
  if (p.pack) return p;
  const [unit, k] = ({ кг: ['г', 1000], л: ['мл', 1000], г: ['г', 1], мл: ['мл', 1], шт: ['шт', 1], уп: ['шт', 1] })[p.unit] || ['шт', 1];
  return { ...p, unit, pack: k, stock: (+p.stock || 0) * k, minQty: (+p.minQty || 0) * k, fresh: FRESH_CATS.includes(p.category) };
}
function migrateV1(old, base) {
  const idMap = {};
  const used = new Set((old.purchases || []).flatMap((p) => p.items.map((i) => i.productId)));
  (old.products || []).filter((p) => +p.stock > 0 || used.has(p.id)).map(migrateProduct).forEach((p) => {
    const same = base.products.find((x) => x.name.toLowerCase() === p.name.toLowerCase());
    if (same) { same.stock += p.stock; idMap[p.id] = same.id; } else base.products.push(p);
  });
  base.purchases = (old.purchases || []).map((pu) => ({ ...pu, items: pu.items.map((i) => ({ ...i, productId: idMap[i.productId] || i.productId })) }));
  base.list = (old.list || []).map((i) => ({ ...i, productId: idMap[i.productId] || i.productId }));
  return base;
}
function normalize(d) {
  return {
    products: (Array.isArray(d.products) ? d.products : []).map(migrateProduct),
    recipes: Array.isArray(d.recipes) ? d.recipes : [],
    menu: d.menu && typeof d.menu === 'object' ? d.menu : {},
    list: Array.isArray(d.list) ? d.list : [],
    purchases: Array.isArray(d.purchases) ? d.purchases : [],
    extra: Array.isArray(d.extra) ? d.extra : [],
    settings: { budget: 0, planStart: today(), planDays: 7, startedAt: today(), ...(d.settings || {}) },
  };
}
function load() {
  try { const raw = localStorage.getItem(KEY); if (raw) return normalize(JSON.parse(raw)); } catch (e) { console.warn(e); }
  let base = seed();
  try { const old = localStorage.getItem(OLD_KEY); if (old) base = migrateV1(JSON.parse(old), base); } catch (e) { console.warn(e); }
  return normalize(base);
}

let db = load();
function save() { try { localStorage.setItem(KEY, JSON.stringify(db)); } catch (e) { toast('Не удалось сохранить'); } }
save();

let savedTab = 'menu';
try { savedTab = localStorage.getItem(TAB_KEY) || 'menu'; } catch (e) { /* ignore */ }
const state = { tab: savedTab, productFilter: 'all', productQuery: '' };

/* ---------- доступ к данным ---------- */
const byId = (id) => db.products.find((p) => p.id === id);
const recipeById = (id) => db.recipes.find((r) => r.id === id);
const findByName = (name) => db.products.find((p) => p.name.trim().toLowerCase() === String(name).trim().toLowerCase());
const costOf = (p, qty) => (p && p.price ? (qty / (p.pack || 1)) * p.price : 0);
const recipeCost = (r) => r.ings.reduce((s, g) => s + (g.optional ? 0 : costOf(byId(g.productId), g.qty)), 0);
const isLow = (p) => (+p.minQty || 0) > 0 && (+p.stock || 0) < +p.minQty;
const planDates = () => Array.from({ length: +db.settings.planDays || 7 }, (_, i) => addDays(db.settings.planStart, i));
const getDay = (d) => db.menu[d] || { items: [], eaten: false };
const ensureDay = (d) => (db.menu[d] ||= { items: [], eaten: false });
const priceLabel = (p) => (p.price ? `${money(p.price)} / ${p.pack > 1 ? fmtQty(p.pack, p.unit) : p.unit}` : 'цена не указана');

function newProduct(name, extra = {}) {
  const p = { id: uid(), name, category: 'Другое', unit: 'г', pack: 1, price: 0, stock: 0, minQty: 0, expiry: '', fresh: false, ...extra };
  db.products.push(p);
  return p;
}

function dayTotals(day) {
  let kcal = 0, protein = 0, cost = 0;
  day.items.forEach((it) => {
    const r = recipeById(it.recipeId);
    if (!r) return;
    const k = +it.servings || 1;
    kcal += (+r.kcal || 0) * k; protein += (+r.protein || 0) * k; cost += recipeCost(r) * k;
  });
  return { kcal: Math.round(kcal), protein: Math.round(protein), cost };
}

function needsFor(dates) {
  const m = new Map();
  dates.forEach((d) => {
    const day = db.menu[d];
    if (!day || day.eaten) return;
    day.items.forEach((it) => {
      const r = recipeById(it.recipeId);
      if (!r) return;
      r.ings.forEach((g) => {
        if (g.optional) return;
        m.set(g.productId, (m.get(g.productId) || 0) + g.qty * (+it.servings || 1));
      });
    });
  });
  return m;
}

/* ---------- UI-утилиты ---------- */
function toast(msg) {
  const t = $('#toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toast._t);
  toast._t = setTimeout(() => t.classList.remove('show'), 2400);
}
function expiryPill(p) {
  if (!p.expiry || !p.stock) return '';
  const d = daysUntil(p.expiry);
  if (d < 0) return `<span class="pill danger">просрочено</span>`;
  if (d <= 2) return `<span class="pill warn">${d === 0 ? 'годен сегодня' : d === 1 ? 'до завтра' : 'ещё 2 дня'}</span>`;
  return `<span class="pill">до ${fmtDate(p.expiry)}</span>`;
}
const actions = (...btns) => `<div class="actions">${btns.join('')}</div>`;
const B = {
  ok: (t = 'Сохранить') => `<button class="btn" value="ok">${t}</button>`,
  cancel: (t = 'Отмена') => `<button class="btn ghost" value="cancel" formnovalidate>${t}</button>`,
  del: (t = 'Удалить') => `<span class="spacer"></span><button class="btn danger" value="delete" formnovalidate>${t}</button>`,
  any: (v, t, cls = 'ghost') => `<button class="btn ${cls}" value="${v}" formnovalidate>${t}</button>`,
};

/* ---------- навигация ---------- */
const TITLES = { menu: 'Меню', list: 'Список покупок', products: 'Продукты', recipes: 'Блюда', money: 'Траты' };
const RENDER = { menu: renderMenu, list: renderList, products: renderProducts, recipes: renderRecipes, money: renderMoney };
if (!RENDER[state.tab]) state.tab = 'menu';

document.querySelectorAll('.tabs button').forEach((b) =>
  b.addEventListener('click', () => {
    state.tab = b.dataset.tab;
    try { localStorage.setItem(TAB_KEY, state.tab); } catch (e) { /* ignore */ }
    render();
    window.scrollTo(0, 0);
  }));

function render() {
  document.querySelectorAll('.tabs button').forEach((b) => b.classList.toggle('active', b.dataset.tab === state.tab));
  $('#title').textContent = TITLES[state.tab];
  RENDER[state.tab]();
}

/* =========================================================
   МЕНЮ
   ========================================================= */
function renderMenu() {
  const s = db.settings;
  const dates = planDates();
  const needs = needsFor(dates);
  let cost = 0, unpriced = 0;
  needs.forEach((q, pid) => { const p = byId(pid); if (p && p.price) cost += costOf(p, q); else unpriced++; });
  const open = dates.filter((d) => getDay(d).items.length && !getDay(d).eaten).length;
  const planned = dates.filter((d) => getDay(d).items.length).length;

  $('#view').innerHTML = `
    <div class="plan-bar">
      <label>Период с<input type="date" id="planStart" value="${s.planStart}"></label>
      <label>Дней<select id="planDays">${[3, 4, 5, 7, 10, 14].map((n) => `<option ${n == s.planDays ? 'selected' : ''}>${n}</option>`).join('')}</select></label>
    </div>
    <div class="stats">
      <div class="stat"><div class="label">Продукты по меню</div><div class="value">≈ ${money(cost)}</div>
        <div class="delta">${open ? '≈ ' + money(cost / open) + ' в день' : 'меню пока пустое'}${unpriced ? ` · без цены: ${unpriced}` : ''}</div></div>
      <div class="stat"><div class="label">Дней с меню</div><div class="value">${planned} / ${dates.length}</div>
        <div class="delta">${planned < dates.length ? 'заполни день и скопируй на остальные' : 'всё распланировано'}</div></div>
    </div>
    <button class="btn block" data-act="build-list" ${needs.size ? '' : 'disabled'}>🛒 Собрать список покупок на период</button>
    ${dates.map(dayCard).join('')}
  `;
  $('#planStart').addEventListener('change', (e) => { if (e.target.value) { s.planStart = e.target.value; save(); render(); } });
  $('#planDays').addEventListener('change', (e) => { s.planDays = +e.target.value; save(); render(); });
}

function dayCard(d) {
  const day = getDay(d);
  const t = dayTotals(day);
  const items = [...day.items].sort((a, b) => SLOTS.indexOf(a.slot) - SLOTS.indexOf(b.slot));
  return `
    <div class="section-title"><span>${fmtDay(d)}${d === today() ? ' · сегодня' : ''}</span>
      ${day.items.length ? `<span class="totals">${t.kcal} ккал · Б ${t.protein} г · ≈ ${money(t.cost)}</span>` : ''}</div>
    <div class="card day ${day.eaten ? 'eaten' : ''}">
      ${items.map((it) => {
        const r = recipeById(it.recipeId);
        const k = +it.servings || 1;
        return `<div class="row" data-act="edit-meal" data-date="${d}" data-item="${it.id}">
          <div class="slot">${esc(it.slot)}</div>
          <div class="main"><div class="name">${esc(r ? r.name : 'Удалённое блюдо')}</div>
            ${r ? `<div class="sub">${Math.round(r.kcal * k)} ккал · Б ${Math.round(r.protein * k)} г</div>` : ''}</div>
          ${k !== 1 ? `<div class="end">×${num(k)}</div>` : ''}
        </div>`;
      }).join('')}
      <div class="day-actions">
        <button data-act="add-meal" data-date="${d}">+ Блюдо</button>
        ${day.items.length ? `
          <button data-act="day-menu" data-date="${d}">Копировать…</button>
          <button data-act="eat" data-date="${d}" class="${day.eaten ? 'on' : ''}" title="Списать продукты из запасов">${day.eaten ? '✓ Съедено' : 'Съели'}</button>` : ''}
      </div>
    </div>`;
}

function mealDialog(date, item, presetRecipeId) {
  if (!db.recipes.length) { toast('Сначала добавьте блюда'); return; }
  const isNew = !item;
  const cur = item || { id: uid(), slot: '', recipeId: presetRecipeId || '', servings: 1 };
  const opts = SLOTS.map((slot) => {
    const rs = db.recipes.filter((r) => r.slot === slot);
    return rs.length ? `<optgroup label="${slot}">${rs.map((r) => `<option value="${r.id}" ${r.id === cur.recipeId ? 'selected' : ''}>${esc(r.name)}</option>`).join('')}</optgroup>` : '';
  }).join('');
  const form = openDialog(`
    <h2>${isNew ? 'Добавить блюдо' : 'Блюдо в меню'}</h2>
    <p class="note">${fmtDay(date)}</p>
    <label>Блюдо<select name="recipe">${opts}</select></label>
    <div class="grid2">
      <label>Приём пищи<select name="slot">${SLOTS.map((s) => `<option ${s === cur.slot ? 'selected' : ''}>${s}</option>`).join('')}</select></label>
      <label>Порций<input name="servings" type="number" step="0.5" min="0.5" inputmode="decimal" value="${esc(cur.servings)}"></label>
    </div>
    ${actions(B.ok(isNew ? 'Добавить' : 'Сохранить'), B.cancel(), isNew ? '' : B.del())}`, (v, f) => {
    const day = ensureDay(date);
    if (v === 'delete') day.items = day.items.filter((i) => i.id !== cur.id);
    if (v === 'ok') {
      Object.assign(cur, { recipeId: f.recipe.value, slot: f.slot.value, servings: +f.servings.value || 1 });
      if (isNew) day.items.push(cur);
    }
    save(); render();
  });
  const syncSlot = () => { const r = recipeById(form.elements.recipe.value); if (r) form.elements.slot.value = r.slot; };
  form.elements.recipe.addEventListener('change', syncSlot);
  if (isNew) syncSlot();
}

function dayMenuDialog(date) {
  const dates = planDates();
  const emptyCount = dates.filter((d) => d !== date && !getDay(d).items.length).length;
  openDialog(`
    <h2>${fmtDay(date)}</h2>
    <p class="note">Удобно заполнить один типичный день и разложить его на весь период, а потом поменять завтраки или ужины в отдельные дни.</p>
    ${B.any('fill', `Заполнить пустые дни этим меню (${emptyCount})`, 'ghost menu-item')}
    ${B.any('next', 'Скопировать на следующий день', 'ghost menu-item')}
    ${B.any('clear', 'Очистить этот день', 'danger menu-item')}
    ${actions(B.cancel('Закрыть'))}`, (v) => {
    const src = getDay(date).items;
    const clone = () => src.map((i) => ({ ...i, id: uid() }));
    if (v === 'fill') {
      dates.filter((d) => d !== date && !getDay(d).items.length).forEach((d) => { ensureDay(d).items = clone(); });
      toast(`Заполнено дней: ${emptyCount}`);
    }
    if (v === 'next') {
      const n = addDays(date, 1);
      const day = ensureDay(n);
      if (day.items.length && !confirm(`На ${fmtDay(n)} уже есть меню. Заменить?`)) return;
      day.items = clone(); day.eaten = false;
    }
    if (v === 'clear') { const day = ensureDay(date); day.items = []; day.eaten = false; }
    save(); render();
  });
}

function toggleEaten(date) {
  const day = ensureDay(date);
  const sign = day.eaten ? 1 : -1; // отмена возвращает продукты в запасы
  day.items.forEach((it) => {
    const r = recipeById(it.recipeId);
    if (!r) return;
    r.ings.forEach((g) => {
      if (g.optional) return;
      const p = byId(g.productId);
      if (p) p.stock = Math.max(0, Math.round(((+p.stock || 0) + sign * g.qty * (+it.servings || 1)) * 100) / 100);
    });
  });
  day.eaten = !day.eaten;
  save(); render();
  toast(day.eaten ? 'Продукты списаны из запасов' : 'Списание отменено');
}

function buildListFromMenu() {
  const dates = planDates().filter((d) => d >= today());
  const needs = needsFor(dates);
  db.list = db.list.filter((i) => !(i.fromMenu && !i.done));
  let n = 0, sum = 0, covered = 0;
  needs.forEach((need, pid) => {
    const p = byId(pid);
    if (!p) return;
    const short = need - (+p.stock || 0);
    if (short <= 0) { covered++; return; }
    const packs = Math.ceil(short / (p.pack || 1) - 1e-9);
    const manual = db.list.find((i) => !i.done && i.productId === pid);
    if (manual) manual.qty = Math.max(+manual.qty || 0, packs);
    else db.list.push({ id: uid(), productId: pid, name: p.name, qty: packs, price: '', done: false, fromMenu: true });
    n++; sum += packs * (+p.price || 0);
  });
  save();
  state.tab = 'list';
  try { localStorage.setItem(TAB_KEY, 'list'); } catch (e) { /* ignore */ }
  render();
  toast(`В списке ${n} позиций · ≈ ${money(sum)}${covered ? ` · ${covered} уже есть дома` : ''}`);
}

/* =========================================================
   СПИСОК ПОКУПОК
   ========================================================= */
const listQty = (i, p) => (p && p.pack > 1 ? `${num(i.qty)} уп.` : fmtQty(i.qty, p ? p.unit : 'шт'));

function renderList() {
  const items = db.list;
  const todo = items.filter((i) => !i.done);
  const done = items.filter((i) => i.done);
  const lowNotInList = db.products.filter((p) => isLow(p) && !items.some((i) => i.productId === p.id && !i.done));
  const est = (arr) => arr.reduce((s, i) => { const p = byId(i.productId); return s + (+i.qty || 0) * (i.price !== '' && i.price != null ? +i.price : (+p?.price || 0)); }, 0);

  const row = (i) => {
    const p = i.productId && byId(i.productId);
    const price = i.price !== '' && i.price != null ? +i.price : 0;
    const sub = [
      p && p.pack > 1 ? `по ${fmtQty(p.pack, p.unit)} · всего ${fmtQty(i.qty * p.pack, p.unit)}` : '',
      price ? `${money(price)} × ${num(i.qty)}` : p?.price ? `≈ ${money(p.price * i.qty)}` : '',
    ].filter(Boolean).join(' · ');
    return `<div class="row ${i.done ? 'done' : ''}" data-act="edit-item" data-id="${i.id}">
      <button class="check" data-act="toggle" data-id="${i.id}" aria-label="Отметить"></button>
      <div class="main"><div class="name">${esc(i.name)}</div>${sub ? `<div class="sub">${esc(sub)}</div>` : ''}</div>
      <div class="end">${listQty(i, p)}</div>
    </div>`;
  };
  const fresh = todo.filter((i) => byId(i.productId)?.fresh);
  const long = todo.filter((i) => !byId(i.productId)?.fresh);

  $('#view').innerHTML = `
    <form class="addbar" id="addItem" autocomplete="off">
      <input name="name" list="productNames" placeholder="Добавить вручную…" enterkeyhint="done">
      <button class="btn">+</button>
    </form>
    <datalist id="productNames">${db.products.map((p) => `<option value="${esc(p.name)}">`).join('')}</datalist>

    ${lowNotInList.length ? `
      <div class="section-title">Заканчивается <button data-act="add-low">Добавить все</button></div>
      <div class="chips">${lowNotInList.map((p) => `<button data-act="add-product" data-pid="${p.id}">+ ${esc(p.name)}</button>`).join('')}</div>` : ''}

    ${items.length === 0 ? `<div class="empty"><div class="big">🛒</div>Список пуст.<br>Составь меню и нажми «Собрать список покупок» — всё посчитается само.</div>` : ''}

    ${todo.length ? `<div class="hint">К покупке ≈ <b>${money(est(todo))}</b> · ${todo.length} поз.</div>` : ''}
    ${long.length ? `<div class="section-title">Долгого хранения · ${long.length}</div><div class="card">${long.map(row).join('')}</div>` : ''}
    ${fresh.length ? `<div class="section-title">Свежее · ${fresh.length}</div><div class="card">${fresh.map(row).join('')}</div>` : ''}
    ${done.length ? `<div class="section-title">В корзине · ${done.length} <button data-act="clear-done">Убрать</button></div><div class="card">${done.map(row).join('')}</div>` : ''}
    ${done.length ? `<div class="sticky-bottom"><button class="btn block" data-act="checkout">Завершить закупку · ${money(est(done))}</button></div>` : ''}
  `;

  $('#addItem').addEventListener('submit', (e) => {
    e.preventDefault();
    const inp = e.target.elements.name;
    const name = inp.value.trim();
    if (!name) return;
    addToList(name);
    inp.value = '';
    render();
    $('#addItem input').focus();
  });
}

function addToList(name, qty) {
  const p = findByName(name);
  const existing = db.list.find((i) => !i.done && (p ? i.productId === p.id : i.name.toLowerCase() === name.toLowerCase()));
  if (existing) { existing.qty = (+existing.qty || 0) + (qty || 1); save(); return; }
  let q = qty || 1;
  if (!qty && p && isLow(p)) q = Math.max(1, Math.ceil((p.minQty - (p.stock || 0)) / (p.pack || 1)));
  db.list.push({ id: uid(), productId: p?.id || null, name: p ? p.name : name, qty: q, price: '', done: false });
  save();
}

function editItemDialog(item) {
  const p = item.productId && byId(item.productId);
  const per = p && p.pack > 1 ? `упаковку (${fmtQty(p.pack, p.unit)})` : (p ? p.unit : 'шт');
  openDialog(`
    <h2>${esc(item.name)}</h2>
    <div class="grid2">
      <label>Количество, ${p && p.pack > 1 ? 'уп.' : esc(p ? p.unit : 'шт')}<input name="qty" type="number" step="any" min="0" inputmode="decimal" value="${esc(item.qty)}"></label>
      <label>Цена за ${esc(per)}, ₽<input name="price" type="number" step="any" min="0" inputmode="decimal" value="${esc(item.price ?? '')}" placeholder="${p?.price ? esc(p.price) : ''}"></label>
    </div>
    <p class="note">${p ? 'Впиши фактическую цену из магазина — она запомнится, и расчёты станут точнее.' : 'Этого продукта нет в каталоге — после закупки он добавится автоматически.'}</p>
    ${actions(B.ok(), B.cancel(), B.del())}`, (v, f) => {
    if (v === 'delete') db.list = db.list.filter((i) => i.id !== item.id);
    if (v === 'ok') { item.qty = +f.qty.value || 1; item.price = f.price.value === '' ? '' : +f.price.value; }
    save(); render();
  });
}

function checkout() {
  const done = db.list.filter((i) => i.done);
  if (!done.length) return;
  openDialog(`
    <h2>Завершить закупку</h2>
    <p class="note">Купленное попадёт в историю трат и добавится к запасам. Где цена не указана — берём последнюю известную.</p>
    <div class="grid2">
      <label>Дата<input name="date" type="date" value="${today()}" required></label>
      <label>Магазин<input name="store" list="stores" placeholder="Необязательно"></label>
    </div>
    <datalist id="stores">${[...new Set(db.purchases.map((p) => p.store).filter(Boolean))].map((s) => `<option value="${esc(s)}">`).join('')}</datalist>
    ${actions(B.ok(), B.cancel())}`, (v, f) => {
    if (v !== 'ok') return;
    const items = done.map((i) => {
      let p = (i.productId && byId(i.productId)) || findByName(i.name);
      if (!p) p = newProduct(i.name, { unit: 'шт' });
      const price = i.price === '' || i.price == null ? (+p.price || 0) : +i.price;
      p.stock = (+p.stock || 0) + (+i.qty || 0) * (p.pack || 1);
      if (price) p.price = price;
      return { productId: p.id, name: p.name, category: p.category, unit: p.unit, pack: p.pack || 1, qty: +i.qty || 0, price };
    });
    const total = items.reduce((s, i) => s + i.qty * i.price, 0);
    db.purchases.unshift({ id: uid(), date: f.date.value || today(), store: f.store.value.trim(), items, total });
    db.list = db.list.filter((i) => !i.done);
    save(); render();
    toast(`Закупка сохранена · ${money(total)}`);
  });
}

/* =========================================================
   ПРОДУКТЫ (каталог + запасы)
   ========================================================= */
function renderProducts() {
  const q = state.productQuery.toLowerCase();
  const filters = {
    all: () => true,
    home: (p) => +p.stock > 0,
    low: isLow,
    exp: (p) => +p.stock > 0 && p.expiry && daysUntil(p.expiry) <= 2,
  };
  const count = (k) => db.products.filter(filters[k]).length;
  const shown = db.products.filter((p) => filters[state.productFilter](p) && (!q || p.name.toLowerCase().includes(q)))
    .sort((a, b) => a.name.localeCompare(b.name));
  const groups = {};
  shown.forEach((p) => (groups[p.category] ||= []).push(p));
  const order = Object.keys(groups).sort((a, b) => CATEGORIES.indexOf(a) - CATEGORIES.indexOf(b));
  const chip = (k, t) => `<button data-act="pfilter" data-v="${k}" class="${state.productFilter === k ? 'active' : ''}">${t}${k !== 'all' && count(k) ? ' · ' + count(k) : ''}</button>`;

  $('#view').innerHTML = `
    <div class="addbar">
      <input id="pq" type="search" placeholder="Поиск продукта" value="${esc(state.productQuery)}">
      <button class="btn" data-act="new-product">Новый</button>
    </div>
    <div class="chips">${chip('all', 'Все')}${chip('home', 'Есть дома')}${chip('low', 'Заканчивается')}${chip('exp', 'Срок годности')}</div>
    ${shown.length === 0 ? `<div class="empty"><div class="big">🥫</div>Здесь пока ничего нет.</div>` : ''}
    ${order.map((cat) => `
      <div class="section-title">${esc(cat)}</div>
      <div class="card">${groups[cat].map((p) => {
        const inList = db.list.some((i) => i.productId === p.id && !i.done);
        return `<div class="row" data-act="edit-product" data-pid="${p.id}">
          <div class="main">
            <div class="name">${esc(p.name)}</div>
            <div class="sub">${+p.stock > 0 ? 'есть ' + fmtQty(p.stock, p.unit) : 'нет дома'} · ${esc(priceLabel(p))} ${expiryPill(p)} ${isLow(p) ? '<span class="pill warn">мало</span>' : ''}</div>
          </div>
          <div class="qty">
            <button data-act="stock-dec" data-pid="${p.id}" aria-label="Меньше">−</button>
            <button data-act="stock-inc" data-pid="${p.id}" aria-label="Больше">+</button>
          </div>
          <button class="cart ${inList ? 'on' : ''}" data-act="add-product" data-pid="${p.id}" aria-label="В список">${inList ? '✓' : '🛒'}</button>
        </div>`;
      }).join('')}</div>`).join('')}
  `;
  const pq = $('#pq');
  pq.addEventListener('input', () => {
    state.productQuery = pq.value;
    const pos = pq.selectionStart;
    renderProducts();
    const n = $('#pq'); n.focus(); n.setSelectionRange(pos, pos);
  });
}

const stockStep = (p) => (p.unit === 'шт' ? 1 : p.pack > 1 && p.pack < 100 ? p.pack : 50);

function productDialog(p) {
  const isNew = !p;
  const cur = p || { id: uid(), name: state.productQuery || '', category: 'Другое', unit: 'г', pack: 1, price: '', stock: 0, minQty: 0, expiry: '', fresh: false };
  const history = db.purchases.flatMap((pu) => pu.items.filter((i) => i.productId === cur.id).map((i) => ({ ...i, date: pu.date, store: pu.store }))).slice(0, 4);
  const usedIn = db.recipes.filter((r) => r.ings.some((g) => g.productId === cur.id)).map((r) => r.name);
  openDialog(`
    <h2>${isNew ? 'Новый продукт' : esc(cur.name)}</h2>
    <label>Название<input name="name" required value="${esc(cur.name)}"></label>
    <div class="grid2">
      <label>Категория<select name="category">${CATEGORIES.map((c) => `<option ${c === cur.category ? 'selected' : ''}>${c}</option>`).join('')}</select></label>
      <label>Единица<select name="unit">${UNITS.map((u) => `<option ${u === cur.unit ? 'selected' : ''}>${u}</option>`).join('')}</select></label>
      <label>Фасовка (в единицах)<input name="pack" type="number" step="any" min="1" inputmode="decimal" value="${esc(cur.pack || 1)}"></label>
      <label>Цена за упаковку, ₽<input name="price" type="number" step="any" min="0" inputmode="decimal" value="${esc(cur.price)}"></label>
      <label>Есть дома<input name="stock" type="number" step="any" min="0" inputmode="decimal" value="${esc(cur.stock)}"></label>
      <label>Минимум (докупать)<input name="minQty" type="number" step="any" min="0" inputmode="decimal" value="${esc(cur.minQty)}"></label>
      <label>Годен до<input name="expiry" type="date" value="${esc(cur.expiry)}"></label>
      <label class="check-label"><input type="checkbox" name="fresh" ${cur.fresh ? 'checked' : ''}> Скоропортящийся</label>
    </div>
    <p class="note">Фасовка: например, пачка овсянки 400 г → единица «г», фасовка 400. Если покупаете на вес — фасовка 1000 (за кг).</p>
    ${usedIn.length ? `<p class="note">Используется в: ${esc(usedIn.join(', '))}</p>` : ''}
    ${history.length ? `<p class="note">Последние покупки: ${history.map((h) => `${fmtDate(h.date)} — ${money(h.price)}${h.store ? ' (' + esc(h.store) + ')' : ''}`).join('; ')}</p>` : ''}
    ${actions(B.ok(), B.cancel(), isNew ? '' : B.del())}`, (v, f) => {
    if (v === 'delete') {
      if (usedIn.length) { alert(`Продукт используется в блюдах: ${usedIn.join(', ')}. Сначала уберите его из рецептов.`); return; }
      if (!confirm(`Удалить «${cur.name}»? История закупок сохранится.`)) return;
      db.products = db.products.filter((x) => x.id !== cur.id);
      db.list.forEach((i) => { if (i.productId === cur.id) i.productId = null; });
    }
    if (v === 'ok') {
      const name = f.name.value.trim();
      if (!name) return;
      Object.assign(cur, {
        name, category: f.category.value, unit: f.unit.value, pack: +f.pack.value || 1,
        price: f.price.value === '' ? 0 : +f.price.value,
        stock: +f.stock.value || 0, minQty: +f.minQty.value || 0, expiry: f.expiry.value, fresh: f.fresh.checked,
      });
      if (isNew) db.products.push(cur);
      db.list.forEach((i) => { if (i.productId === cur.id) i.name = cur.name; });
    }
    save(); render();
  });
}

/* =========================================================
   БЛЮДА (рецепты)
   ========================================================= */
function renderRecipes() {
  const junk = db.extra.filter((e) => JUNK.includes(e.kind));
  const avgJunk = junk.length ? junk.reduce((s, e) => s + e.amount, 0) / junk.length : 0;
  $('#view').innerHTML = `
    <div class="addbar"><span class="hint" style="flex:1;margin:0">Себестоимость считается по ценам продуктов</span>
      <button class="btn" data-act="new-recipe">+ Блюдо</button></div>
    ${avgJunk ? `<div class="hint">Средний заказ доставки / готовой еды: <b>${money(avgJunk)}</b>. Сравни с ценой порции ниже.</div>` : ''}
    ${db.recipes.length === 0 ? `<div class="empty"><div class="big">🍳</div>Блюд пока нет.</div>` : ''}
    ${SLOTS.map((slot) => {
      const rs = db.recipes.filter((r) => r.slot === slot);
      if (!rs.length) return '';
      return `<div class="section-title">${slot}</div><div class="card">${rs.map((r) => `
        <div class="row" data-act="view-recipe" data-rid="${r.id}">
          <div class="main"><div class="name">${esc(r.name)}</div>
            <div class="sub">${r.approx ? '≈ ' : ''}${r.kcal || '?'} ккал · Б ${r.protein || '?'} г</div></div>
          <div class="end"><b>${money(recipeCost(r))}</b><div class="sub">порция</div></div>
        </div>`).join('')}</div>`;
    }).join('')}
  `;
}

function recipeViewDialog(r) {
  openDialog(`
    <h2>${esc(r.name)}</h2>
    <p class="note">${esc(r.slot)} · ${r.approx ? '≈ ' : ''}${r.kcal || '?'} ккал · Б ${r.protein || '?'} г · ${money(recipeCost(r))} за порцию</p>
    <div class="card">${r.ings.map((g) => {
      const p = byId(g.productId);
      return `<div class="row static"><div class="main"><div class="name">${esc(p ? p.name : '—')}</div>
        ${g.note || g.optional ? `<div class="sub">${[g.optional ? 'по желанию, не входит в закупку' : '', g.note].filter(Boolean).map(esc).join(' · ')}</div>` : ''}</div>
        <div class="end">${fmtQty(g.qty, p?.unit)}</div></div>`;
    }).join('')}</div>
    ${r.note ? `<p class="recipe-note">${esc(r.note)}</p>` : ''}
    ${r.approx ? `<p class="note">КБЖУ примерное — посчитано по средним значениям продуктов. Можно уточнить в редактировании.</p>` : ''}
    ${actions(B.any('menu', 'В меню на сегодня', ''), B.any('edit', 'Изменить'), B.cancel('Закрыть'))}`, (v) => {
    if (v === 'edit') setTimeout(() => recipeEditDialog(r));
    if (v === 'menu') setTimeout(() => mealDialog(today(), null, r.id));
  });
}

function ingRow(g = {}) {
  const p = g.productId && byId(g.productId);
  return `<div class="ing-row">
    <input name="ing-name" list="allProducts" placeholder="Продукт" value="${esc(p ? p.name : '')}">
    <input name="ing-qty" type="number" step="any" min="0" inputmode="decimal" placeholder="кол-во" value="${esc(g.qty ?? '')}">
    <span class="ing-unit">${esc(p ? p.unit : '')}</span>
    <label class="opt" title="По желанию — не входит в закупку"><input type="checkbox" name="ing-opt" ${g.optional ? 'checked' : ''}>опц.</label>
    <button type="button" class="x" data-x aria-label="Убрать">×</button>
    <input type="hidden" name="ing-note" value="${esc(g.note || '')}">
  </div>`;
}

function recipeEditDialog(r) {
  const isNew = !r;
  const cur = r || { id: uid(), name: '', slot: 'Обед', kcal: '', protein: '', approx: false, ings: [], note: '' };
  const form = openDialog(`
    <h2>${isNew ? 'Новое блюдо' : 'Изменить блюдо'}</h2>
    <label>Название<input name="name" required value="${esc(cur.name)}"></label>
    <div class="grid3">
      <label>Приём пищи<select name="slot">${SLOTS.map((s) => `<option ${s === cur.slot ? 'selected' : ''}>${s}</option>`).join('')}</select></label>
      <label>Ккал<input name="kcal" type="number" min="0" inputmode="numeric" value="${esc(cur.kcal)}"></label>
      <label>Белок, г<input name="protein" type="number" min="0" inputmode="numeric" value="${esc(cur.protein)}"></label>
    </div>
    <label>Ингредиенты на 1 порцию <span class="note">(мясо — в сыром виде, крупы — в сухом)</span></label>
    <div id="ings">${(cur.ings.length ? cur.ings : [{}]).map(ingRow).join('')}</div>
    <button type="button" class="btn ghost" id="addIng">+ Ингредиент</button>
    <datalist id="allProducts">${db.products.map((p) => `<option value="${esc(p.name)}">`).join('')}</datalist>
    <label>Как готовить<textarea name="note" rows="3">${esc(cur.note)}</textarea></label>
    ${actions(B.ok(), B.cancel(), isNew ? '' : B.del())}`, (v, f, form) => {
    if (v === 'delete') {
      if (!confirm(`Удалить блюдо «${cur.name}»? Оно пропадёт из меню.`)) return;
      db.recipes = db.recipes.filter((x) => x.id !== cur.id);
      Object.values(db.menu).forEach((d) => { d.items = d.items.filter((i) => i.recipeId !== cur.id); });
    }
    if (v === 'ok') {
      const name = f.name.value.trim();
      if (!name) return;
      const ings = [...form.querySelectorAll('.ing-row')].map((row) => {
        const pname = row.querySelector('[name=ing-name]').value.trim();
        const qty = +row.querySelector('[name=ing-qty]').value;
        if (!pname || !(qty > 0)) return null;
        const p = findByName(pname) || newProduct(pname);
        return { productId: p.id, qty, optional: row.querySelector('[name=ing-opt]').checked, note: row.querySelector('[name=ing-note]').value };
      }).filter(Boolean);
      const changedNutrition = String(cur.kcal) !== f.kcal.value || String(cur.protein) !== f.protein.value;
      Object.assign(cur, { name, slot: f.slot.value, kcal: +f.kcal.value || 0, protein: +f.protein.value || 0, ings, note: f.note.value.trim() });
      if (changedNutrition) cur.approx = false;
      if (isNew) db.recipes.push(cur);
    }
    save(); render();
  });
  const box = $('#ings', form);
  $('#addIng', form).addEventListener('click', () => { box.insertAdjacentHTML('beforeend', ingRow()); box.lastElementChild.querySelector('input').focus(); });
  box.addEventListener('click', (e) => { if (e.target.matches('[data-x]')) e.target.closest('.ing-row').remove(); });
  box.addEventListener('input', (e) => {
    if (e.target.name !== 'ing-name') return;
    const p = findByName(e.target.value);
    e.target.closest('.ing-row').querySelector('.ing-unit').textContent = p ? p.unit : (e.target.value ? 'г' : '');
  });
}

/* =========================================================
   ТРАТЫ
   ========================================================= */
function renderMoney() {
  const now = new Date();
  const m = today().slice(0, 7);
  const prev = iso(new Date(now.getFullYear(), now.getMonth() - 1, 15)).slice(0, 7);
  const pSum = (mm) => db.purchases.filter((p) => p.date.slice(0, 7) === mm).reduce((s, p) => s + p.total, 0);
  const eSum = (mm) => db.extra.filter((e) => e.date.slice(0, 7) === mm).reduce((s, e) => s + e.amount, 0);
  const planned = pSum(m), unplanned = eSum(m), total = planned + unplanned;
  const last = pSum(prev) + eSum(prev);
  const budget = +db.settings.budget || 0;
  const dim = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  // В начале месяца прогноз по одной большой закупке бессмысленен — считаем с 10-го числа.
  const forecast = now.getDate() >= 10 ? total / now.getDate() * dim : 0;
  const lastJunk = db.extra.filter((e) => JUNK.includes(e.kind)).map((e) => e.date).sort().pop();
  const streak = Math.max(0, daysBetween(lastJunk || db.settings.startedAt, today()));
  const monthName = now.toLocaleDateString('ru-RU', { month: 'long' });
  const pct = budget ? Math.min(100, total / budget * 100) : 0;
  const delta = last ? Math.round((total - last) / last * 100) : null;

  const byKind = {};
  db.extra.filter((e) => e.date.slice(0, 7) === m).forEach((e) => { byKind[e.kind] = (byKind[e.kind] || 0) + e.amount; });
  const byCat = {};
  db.purchases.filter((p) => p.date.slice(0, 7) === m).forEach((p) => p.items.forEach((i) => {
    const c = i.category || byId(i.productId)?.category || 'Другое';
    byCat[c] = (byCat[c] || 0) + i.qty * i.price;
  }));
  const bars = (obj, cls = '') => {
    const e = Object.entries(obj).sort((a, b) => b[1] - a[1]);
    const max = e[0]?.[1] || 1;
    return `<div class="card">${e.map(([k, v]) => `<div class="bar-row"><div class="top-line"><span>${esc(k)}</span><b>${money(v)}</b></div>
      <div class="bar ${cls}"><i style="width:${Math.max(3, v / max * 100)}%"></i></div></div>`).join('')}</div>`;
  };
  const history = [
    ...db.purchases.map((p) => ({ t: 'p', date: p.date, id: p.id, title: `Закупка${p.store ? ' · ' + p.store : ''}`, sub: p.items.map((i) => i.name).join(', '), amount: p.total })),
    ...db.extra.map((e) => ({ t: 'e', date: e.date, id: e.id, title: e.kind, sub: e.note, amount: e.amount })),
  ].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 60);

  $('#view').innerHTML = `
    <div class="stat big-stat">
      <div class="label">Потрачено на еду за ${monthName}</div>
      <div class="value">${money(total)}</div>
      ${budget ? `
        <div class="bar budget ${total > budget ? 'over' : forecast > budget ? 'risk' : ''}"><i style="width:${pct}%"></i></div>
        <div class="delta">из ${money(budget)} · ${total <= budget ? 'осталось ' + money(budget - total) : 'перерасход ' + money(total - budget)}${forecast ? ' · прогноз на месяц ' + money(forecast) : ''}</div>
        <button class="link" data-act="budget">изменить бюджет</button>`
      : `<div class="delta">${forecast ? 'прогноз на месяц ' + money(forecast) : 'закупки + доставки + кафе'}</div><button class="link" data-act="budget">Задать бюджет на месяц</button>`}
    </div>
    <div class="stats">
      <div class="stat"><div class="label">По плану</div><div class="value">${money(planned)}</div><div class="delta">закупки</div></div>
      <div class="stat"><div class="label">Вне плана</div><div class="value" style="color:${unplanned ? 'var(--warn)' : 'inherit'}">${money(unplanned)}</div>
        <div class="delta">${total ? Math.round(unplanned / total * 100) + '% всех трат' : 'доставки, кафе, перекусы'}</div></div>
      <div class="stat"><div class="label">Без доставки и готовой еды</div><div class="value">${streak} ${plural(streak, 'день', 'дня', 'дней')}</div><div class="delta">${lastJunk ? 'последний раз ' + fmtDate(lastJunk) : 'так держать'}</div></div>
      <div class="stat"><div class="label">Прошлый месяц</div><div class="value">${money(last)}</div><div class="delta">${delta === null ? 'нет данных' : (delta > 0 ? '+' : '') + delta + '% сейчас'}</div></div>
    </div>
    <button class="btn block warn" data-act="new-extra">+ Трата вне плана</button>
    ${Object.keys(byKind).length ? `<div class="section-title">Вне плана за месяц</div>${bars(byKind, 'warn')}` : ''}
    ${Object.keys(byCat).length ? `<div class="section-title">Закупки по категориям</div>${bars(byCat)}` : ''}
    <div class="section-title">История <button data-act="new-purchase">+ Закупка вручную</button></div>
    ${history.length === 0 ? `<div class="empty"><div class="big">🧾</div>Пока пусто. Закупки появятся здесь после «Завершить закупку» в списке, а доставки — после кнопки «Трата вне плана».</div>` : `
    <div class="card">${history.map((h) => `
      <div class="row" data-act="${h.t === 'p' ? 'view-purchase' : 'edit-extra'}" data-id="${h.id}">
        <div class="main"><div class="name">${fmtDate(h.date)} · ${esc(h.title)} ${h.t === 'e' ? '<span class="pill warn">вне плана</span>' : ''}</div>
        ${h.sub ? `<div class="sub">${esc(h.sub)}</div>` : ''}</div>
        <div class="end"><b>${money(h.amount)}</b></div>
      </div>`).join('')}</div>`}
  `;
}

function plural(n, one, few, many) {
  const a = Math.abs(n) % 100, b = a % 10;
  if (a > 10 && a < 20) return many;
  if (b > 1 && b < 5) return few;
  if (b === 1) return one;
  return many;
}

function extraDialog(e) {
  const isNew = !e;
  const cur = e || { id: uid(), date: today(), amount: '', kind: EXTRA_KINDS[0], note: '' };
  openDialog(`
    <h2>${isNew ? 'Трата вне плана' : 'Трата вне плана'}</h2>
    <div class="radio-chips">${EXTRA_KINDS.map((k) => `<label><input type="radio" name="kind" value="${k}" ${k === cur.kind ? 'checked' : ''}><span>${k}</span></label>`).join('')}</div>
    <div class="grid2">
      <label>Сумма, ₽<input name="amount" type="number" step="any" min="1" inputmode="decimal" required value="${esc(cur.amount)}"></label>
      <label>Дата<input name="date" type="date" required value="${esc(cur.date)}"></label>
    </div>
    <label>Что и почему<input name="note" placeholder="напр. «Пицца — не успел приготовить»" value="${esc(cur.note)}"></label>
    <p class="note">Честная запись «почему» помогает понять, где система ломается: не было еды дома, устал, не было плана.</p>
    ${actions(B.ok(), B.cancel(), isNew ? '' : B.del())}`, (v, f) => {
    if (v === 'delete') db.extra = db.extra.filter((x) => x.id !== cur.id);
    if (v === 'ok') {
      Object.assign(cur, { kind: f.kind.value || EXTRA_KINDS[0], amount: +f.amount.value || 0, date: f.date.value || today(), note: f.note.value.trim() });
      if (isNew) db.extra.unshift(cur);
    }
    save(); render();
  });
}

function budgetDialog() {
  openDialog(`
    <h2>Бюджет на еду в месяц</h2>
    <p class="note">Всё вместе: закупки + доставки + кафе. Совет: первый месяц ничего не меняй — просто записывай траты. Потом поставь бюджет на 20–30% ниже факта.</p>
    <label>Сумма, ₽<input name="budget" type="number" step="100" min="0" inputmode="numeric" value="${esc(db.settings.budget || '')}"></label>
    ${actions(B.ok(), B.cancel())}`, (v, f) => {
    if (v !== 'ok') return;
    db.settings.budget = +f.budget.value || 0;
    save(); render();
  });
}

function purchaseDialog(p) {
  openDialog(`
    <h2>${new Date(p.date + 'T12:00').toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' })}</h2>
    ${p.store ? `<p class="note">${esc(p.store)}</p>` : ''}
    <div class="card">${p.items.map((i) => `
      <div class="row static"><div class="main"><div class="name">${esc(i.name)}</div>
      <div class="sub">${num(i.qty)} ${(i.pack || 1) > 1 ? 'уп.' : esc(i.unit || '')} × ${money(i.price)}</div></div>
      <div class="end">${money(i.qty * i.price)}</div></div>`).join('')}</div>
    <div class="row static" style="padding:4px 2px"><div class="main"><b>Итого</b></div><div class="end"><b>${money(p.total)}</b></div></div>
    ${actions(B.cancel('Закрыть'), B.any('repeat', 'Повторить список'), B.del())}`, (v) => {
    if (v === 'delete') {
      if (!confirm('Удалить закупку из истории? Запасы не изменятся.')) return;
      db.purchases = db.purchases.filter((x) => x.id !== p.id);
    }
    if (v === 'repeat') { p.items.forEach((i) => addToList(i.name, i.qty)); toast('Товары добавлены в список'); }
    save(); render();
  });
}

function manualPurchaseDialog() {
  openDialog(`
    <h2>Закупка вручную</h2>
    <p class="note">Каждая строка: <b>название; количество; цена</b>. Количество — в упаковках (или в единицах, если продукт без фасовки). Например: «Молоко 2,5%; 2; 95»</p>
    <div class="grid2">
      <label>Дата<input name="date" type="date" value="${today()}" required></label>
      <label>Магазин<input name="store" placeholder="Необязательно"></label>
    </div>
    <label>Товары<textarea name="items" rows="6" required></textarea></label>
    <label class="check-label"><input type="checkbox" name="toStock" checked> Добавить к запасам</label>
    ${actions(B.ok(), B.cancel())}`, (v, f) => {
    if (v !== 'ok') return;
    const items = f.items.value.split('\n').map((l) => l.split(/[;\t]/).map((s) => s.trim())).filter((a) => a[0]).map(([name, qty, price]) => {
      const p = findByName(name) || newProduct(name, { unit: 'шт' });
      const q = parseFloat(String(qty || '1').replace(',', '.')) || 1;
      const pr = parseFloat(String(price || '').replace(',', '.')) || +p.price || 0;
      if (f.toStock.checked) p.stock = (+p.stock || 0) + q * (p.pack || 1);
      if (pr) p.price = pr;
      return { productId: p.id, name: p.name, category: p.category, unit: p.unit, pack: p.pack || 1, qty: q, price: pr };
    });
    if (!items.length) return;
    const total = items.reduce((s, i) => s + i.qty * i.price, 0);
    db.purchases.unshift({ id: uid(), date: f.date.value, store: f.store.value.trim(), items, total });
    save(); render(); toast(`Сохранено · ${money(total)}`);
  });
}

/* =========================================================
   Меню данных
   ========================================================= */
function dataDialog() {
  openDialog(`
    <h2>Данные</h2>
    <p class="note">Всё хранится только на этом устройстве. Резервная копия — чтобы не потерять данные или перенести на другой телефон.</p>
    ${B.any('export', '⬇️ Сохранить резервную копию', 'ghost menu-item')}
    ${B.any('import', '⬆️ Загрузить из копии', 'ghost menu-item')}
    ${B.any('reset', 'Сбросить всё к начальным данным', 'danger menu-item')}
    ${actions(B.cancel('Закрыть'))}`, (v) => {
    if (v === 'export') {
      const blob = new Blob([JSON.stringify({ app: 'kladovaya', version: 2, exported: new Date().toISOString(), ...db }, null, 2)], { type: 'application/json' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `kladovaya-${today()}.json`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    }
    if (v === 'import') $('#importFile').click();
    if (v === 'reset' && confirm('Удалить меню, список, запасы и историю трат и вернуть стартовые продукты и рецепты? Это нельзя отменить.')) {
      db = normalize(seed()); save(); render(); toast('Данные сброшены');
    }
  });
}
$('#menuBtn').addEventListener('click', dataDialog);
$('#importFile').addEventListener('change', async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  try {
    const data = JSON.parse(await file.text());
    if (!Array.isArray(data.products)) throw new Error('bad');
    if (!confirm('Заменить текущие данные данными из файла?')) return;
    db = normalize(data);
    save(); render(); toast('Данные загружены');
  } catch { toast('Файл не подходит'); }
  e.target.value = '';
});

/* =========================================================
   Диалог
   ========================================================= */
function openDialog(html, onClose) {
  const dlg = $('#dlg');
  const old = $('#dlgForm');
  const form = old.cloneNode(false); // новый узел — без старых обработчиков
  old.replaceWith(form);
  form.innerHTML = html;
  // Обрабатываем submit синхронно (а не событие close): кнопка-отправитель даёт значение действия.
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const v = e.submitter?.value || 'ok';
    if (v !== 'cancel' && !e.submitter?.formNoValidate && !form.reportValidity()) return;
    dlg.close();
    if (v !== 'cancel') onClose(v, form.elements, form);
  });
  if (dlg.open) dlg.close();
  dlg.showModal();
  dlg.scrollTop = 0;
  const first = form.querySelector('input:not([type=checkbox]):not([type=radio]):not([type=hidden]),textarea');
  if (first && !first.value) first.focus();
  return form;
}
$('#dlg').addEventListener('click', (e) => { if (e.target.id === 'dlg') $('#dlg').close('cancel'); });

/* =========================================================
   Клики
   ========================================================= */
$('#view').addEventListener('click', (e) => {
  const el = e.target.closest('[data-act]');
  if (!el || el.disabled) return;
  const { act, pid, id, date } = el.dataset;
  e.stopPropagation();
  switch (act) {
    // меню
    case 'add-meal': mealDialog(date); break;
    case 'edit-meal': { const it = getDay(date).items.find((i) => i.id === el.dataset.item); if (it) mealDialog(date, it); break; }
    case 'day-menu': dayMenuDialog(date); break;
    case 'eat': toggleEaten(date); break;
    case 'build-list': buildListFromMenu(); break;
    // список
    case 'toggle': { const it = db.list.find((i) => i.id === id); if (it) { it.done = !it.done; save(); render(); } break; }
    case 'edit-item': { const it = db.list.find((i) => i.id === id); if (it) editItemDialog(it); break; }
    case 'clear-done': db.list = db.list.filter((i) => !i.done); save(); render(); break;
    case 'checkout': checkout(); break;
    case 'add-low': db.products.filter((p) => isLow(p) && !db.list.some((i) => i.productId === p.id && !i.done)).forEach((p) => addToList(p.name)); render(); break;
    case 'add-product': {
      const p = byId(pid); if (!p) break;
      if (db.list.some((i) => i.productId === p.id && !i.done)) { toast('Уже в списке'); break; }
      addToList(p.name); toast(`«${p.name}» в списке`); render(); break;
    }
    // продукты
    case 'pfilter': state.productFilter = el.dataset.v; render(); break;
    case 'stock-inc': case 'stock-dec': {
      const p = byId(pid); if (!p) break;
      const step = stockStep(p);
      p.stock = Math.max(0, Math.round(((+p.stock || 0) + (act === 'stock-inc' ? step : -step)) * 100) / 100);
      save(); render(); toast(`${p.name}: ${fmtQty(p.stock, p.unit)}`); break;
    }
    case 'edit-product': productDialog(byId(pid)); break;
    case 'new-product': productDialog(null); break;
    // блюда
    case 'view-recipe': { const r = recipeById(el.dataset.rid); if (r) recipeViewDialog(r); break; }
    case 'new-recipe': recipeEditDialog(null); break;
    // траты
    case 'new-extra': extraDialog(null); break;
    case 'edit-extra': { const x = db.extra.find((i) => i.id === id); if (x) extraDialog(x); break; }
    case 'budget': budgetDialog(); break;
    case 'view-purchase': { const p = db.purchases.find((x) => x.id === id); if (p) purchaseDialog(p); break; }
    case 'new-purchase': manualPurchaseDialog(); break;
  }
});

/* ---------- PWA ---------- */
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(console.warn));
}

render();
