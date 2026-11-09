'use strict';

/* ================= Данные ================= */
const KEY = 'kladovaya:v1';
const CATEGORIES = ['Овощи и фрукты', 'Молочное', 'Мясо и рыба', 'Хлеб и выпечка', 'Бакалея', 'Напитки', 'Заморозка', 'Сладкое', 'Бытовое', 'Другое'];
const UNITS = ['шт', 'кг', 'г', 'л', 'мл', 'уп'];

const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
const today = () => new Date().toISOString().slice(0, 10);

function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return normalize(JSON.parse(raw));
  } catch (e) { console.warn(e); }
  return normalize({ products: seedProducts() });
}
function normalize(d) {
  return {
    products: Array.isArray(d.products) ? d.products : [],
    list: Array.isArray(d.list) ? d.list : [],
    purchases: Array.isArray(d.purchases) ? d.purchases : [],
  };
}
function seedProducts() {
  const p = (name, category, unit, minQty, price) => ({ id: uid(), name, category, unit, minQty, price, stock: 0, expiry: '' });
  return [
    p('Молоко', 'Молочное', 'л', 1, 95),
    p('Яйца', 'Молочное', 'шт', 6, 12),
    p('Хлеб', 'Хлеб и выпечка', 'шт', 1, 60),
    p('Гречка', 'Бакалея', 'кг', 1, 110),
    p('Бананы', 'Овощи и фрукты', 'кг', 0, 140),
    p('Куриное филе', 'Мясо и рыба', 'кг', 0, 420),
  ];
}

let db = load();
function save() {
  try { localStorage.setItem(KEY, JSON.stringify(db)); } catch (e) { toast('Не удалось сохранить'); }
}

const state = { tab: 'list', productFilter: 'Все', productQuery: '', stockFilter: 'all' };

/* ================= Утилиты ================= */
const $ = (s, el = document) => el.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const money = (n) => (Math.round((+n || 0) * 100) / 100).toLocaleString('ru-RU', { maximumFractionDigits: 2 }) + ' ₽';
const num = (n) => (Math.round((+n || 0) * 1000) / 1000).toLocaleString('ru-RU');
const fmtDate = (s) => s ? new Date(s + 'T00:00').toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' }) : '';
const daysUntil = (s) => s ? Math.round((new Date(s + 'T00:00') - new Date(today() + 'T00:00')) / 864e5) : null;
const byId = (id) => db.products.find((p) => p.id === id);
const findByName = (name) => db.products.find((p) => p.name.trim().toLowerCase() === name.trim().toLowerCase());

function toast(msg) {
  const t = $('#toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toast._t);
  toast._t = setTimeout(() => t.classList.remove('show'), 2200);
}

function expiryPill(p) {
  if (!p.expiry || !p.stock) return '';
  const d = daysUntil(p.expiry);
  if (d < 0) return `<span class="pill danger">просрочено</span>`;
  if (d <= 2) return `<span class="pill warn">${d === 0 ? 'сегодня' : d === 1 ? 'завтра' : 'через 2 дн.'}</span>`;
  return `<span class="pill">до ${fmtDate(p.expiry)}</span>`;
}
const isLow = (p) => (+p.minQty || 0) > 0 && (+p.stock || 0) < +p.minQty;

/* ================= Навигация ================= */
const TITLES = { list: 'Список покупок', stock: 'Запасы', products: 'Продукты', purchases: 'Закупки' };
document.querySelectorAll('.tabs button').forEach((b) =>
  b.addEventListener('click', () => { state.tab = b.dataset.tab; render(); window.scrollTo(0, 0); }));

function render() {
  document.querySelectorAll('.tabs button').forEach((b) => b.classList.toggle('active', b.dataset.tab === state.tab));
  $('#title').textContent = TITLES[state.tab];
  ({ list: renderList, stock: renderStock, products: renderProducts, purchases: renderPurchases })[state.tab]();
}

/* ================= Список покупок ================= */
function renderList() {
  const items = db.list;
  const todo = items.filter((i) => !i.done);
  const done = items.filter((i) => i.done);
  const lowNotInList = db.products.filter((p) => isLow(p) && !items.some((i) => i.productId === p.id));
  const doneSum = done.reduce((s, i) => s + (+i.price || 0) * (+i.qty || 1), 0);

  const row = (i) => {
    const p = i.productId && byId(i.productId);
    const unit = p ? p.unit : (i.unit || 'шт');
    const sub = [p?.category, i.price ? `${money(i.price)} × ${num(i.qty)} ${unit}` : (p?.price ? `≈ ${money(p.price)}` : '')].filter(Boolean).join(' · ');
    return `<div class="row ${i.done ? 'done' : ''}" data-id="${i.id}" data-act="edit-item">
      <button class="check" data-act="toggle" aria-label="Отметить"></button>
      <div class="main"><div class="name">${esc(i.name)}</div>${sub ? `<div class="sub">${esc(sub)}</div>` : ''}</div>
      <div class="end">${num(i.qty)} ${esc(unit)}</div>
    </div>`;
  };

  $('#view').innerHTML = `
    <form class="addbar" id="addItem" autocomplete="off">
      <input name="name" list="productNames" placeholder="Добавить в список…" enterkeyhint="done">
      <button class="btn">+</button>
    </form>
    <datalist id="productNames">${db.products.map((p) => `<option value="${esc(p.name)}">`).join('')}</datalist>

    ${lowNotInList.length ? `
      <div class="section-title">Заканчивается <button data-act="add-low">Добавить все</button></div>
      <div class="chips">${lowNotInList.map((p) => `<button data-act="add-product" data-pid="${p.id}">+ ${esc(p.name)}</button>`).join('')}</div>` : ''}

    ${items.length === 0 ? `<div class="empty"><div class="big">🛒</div>Список пуст.<br>Добавьте продукт сверху или из раздела «Продукты».</div>` : ''}

    ${todo.length ? `<div class="section-title">Купить · ${todo.length}</div><div class="card">${todo.map(row).join('')}</div>` : ''}
    ${done.length ? `<div class="section-title">В корзине · ${done.length} <button data-act="clear-done">Убрать</button></div><div class="card">${done.map(row).join('')}</div>` : ''}

    ${done.length ? `<div class="sticky-bottom"><button class="btn block" data-act="checkout">Завершить закупку${doneSum ? ' · ' + money(doneSum) : ''}</button></div>` : ''}
  `;

  $('#addItem').addEventListener('submit', (e) => {
    e.preventDefault();
    const name = e.target.name.value.trim();
    if (!name) return;
    addToList(name);
    e.target.name.value = '';
    render();
    $('#addItem input').focus();
  });
}

function addToList(name, qty) {
  const p = findByName(name);
  const existing = db.list.find((i) => !i.done && (p ? i.productId === p.id : i.name.toLowerCase() === name.toLowerCase()));
  if (existing) { existing.qty = (+existing.qty || 0) + (qty || 1); save(); return; }
  const need = p && isLow(p) ? Math.max(1, Math.ceil(p.minQty - (p.stock || 0))) : 1;
  db.list.push({ id: uid(), productId: p?.id || null, name: p ? p.name : name, qty: qty || need, price: '', done: false, unit: p?.unit || 'шт' });
  save();
}

function editItemDialog(item) {
  const p = item.productId && byId(item.productId);
  openDialog(`
    <h2>${esc(item.name)}</h2>
    <div class="grid2">
      <label>Количество<input name="qty" type="number" step="any" min="0" inputmode="decimal" value="${esc(item.qty)}"></label>
      <label>Цена за ${esc(p?.unit || item.unit || 'шт')}, ₽<input name="price" type="number" step="any" min="0" inputmode="decimal" value="${esc(item.price || '')}" placeholder="${p?.price ? esc(p.price) : ''}"></label>
    </div>
    ${p ? '' : `<p class="note">Этого продукта нет в каталоге — после закупки он будет добавлен автоматически.</p>`}
    <div class="actions">
      <button class="btn danger" value="delete" type="submit">Удалить</button>
      <span class="spacer"></span>
      <button class="btn ghost" value="cancel" formnovalidate>Отмена</button>
      <button class="btn" value="ok">Сохранить</button>
    </div>`, (v, f) => {
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
    <p class="note">Купленное попадёт в историю и добавится к запасам. Пустая цена — берём последнюю известную.</p>
    <div class="grid2">
      <label>Дата<input name="date" type="date" value="${today()}" required></label>
      <label>Магазин<input name="store" list="stores" placeholder="Необязательно"></label>
    </div>
    <datalist id="stores">${[...new Set(db.purchases.map((p) => p.store).filter(Boolean))].map((s) => `<option value="${esc(s)}">`).join('')}</datalist>
    <div class="actions">
      <button class="btn ghost" value="cancel" formnovalidate>Отмена</button>
      <button class="btn" value="ok">Сохранить</button>
    </div>`, (v, f) => {
    if (v !== 'ok') return;
    const items = done.map((i) => {
      let p = i.productId && byId(i.productId);
      if (!p) {
        p = findByName(i.name) || { id: uid(), name: i.name, category: 'Другое', unit: i.unit || 'шт', minQty: 0, price: 0, stock: 0, expiry: '' };
        if (!byId(p.id)) db.products.push(p);
      }
      const price = i.price === '' || i.price == null ? (+p.price || 0) : +i.price;
      p.stock = (+p.stock || 0) + (+i.qty || 0);
      if (price) p.price = price;
      return { productId: p.id, name: p.name, category: p.category, unit: p.unit, qty: +i.qty || 0, price };
    });
    const total = items.reduce((s, i) => s + i.qty * i.price, 0);
    db.purchases.unshift({ id: uid(), date: f.date.value || today(), store: f.store.value.trim(), items, total });
    db.list = db.list.filter((i) => !i.done);
    save(); render();
    toast(`Закупка сохранена · ${money(total)}`);
  });
}

/* ================= Запасы ================= */
function renderStock() {
  const inStock = db.products.filter((p) => (+p.stock || 0) > 0);
  const expiring = inStock.filter((p) => p.expiry && daysUntil(p.expiry) <= 2).sort((a, b) => a.expiry.localeCompare(b.expiry));
  const low = db.products.filter(isLow);
  let shown = inStock;
  if (state.stockFilter === 'expiring') shown = expiring;
  if (state.stockFilter === 'low') shown = low;
  shown = [...shown].sort((a, b) => a.category.localeCompare(b.category) || a.name.localeCompare(b.name));

  const groups = {};
  shown.forEach((p) => (groups[p.category] ||= []).push(p));

  $('#view').innerHTML = `
    <div class="stats">
      <div class="stat"><div class="label">В наличии</div><div class="value">${inStock.length}</div><div class="delta">позиций</div></div>
      <div class="stat"><div class="label">Скоро испортится</div><div class="value" style="color:${expiring.length ? 'var(--warn)' : 'inherit'}">${expiring.length}</div><div class="delta">заканчивается: ${low.length}</div></div>
    </div>
    <div class="chips">
      <button data-act="stock-filter" data-v="all" class="${state.stockFilter === 'all' ? 'active' : ''}">Всё</button>
      <button data-act="stock-filter" data-v="expiring" class="${state.stockFilter === 'expiring' ? 'active' : ''}">Срок годности</button>
      <button data-act="stock-filter" data-v="low" class="${state.stockFilter === 'low' ? 'active' : ''}">Заканчивается</button>
    </div>
    ${shown.length === 0 ? `<div class="empty"><div class="big">🥫</div>${state.stockFilter === 'all' ? 'Запасы пусты. Они пополняются после закупки, или можно задать остаток в карточке продукта.' : 'Здесь пока ничего нет.'}</div>` : ''}
    ${Object.entries(groups).map(([cat, ps]) => `
      <div class="section-title">${esc(cat)}</div>
      <div class="card">${ps.map((p) => `
        <div class="row" data-act="edit-product" data-pid="${p.id}">
          <div class="main">
            <div class="name">${esc(p.name)}</div>
            <div class="sub">${expiryPill(p)} ${isLow(p) ? `<span class="pill warn">мин. ${num(p.minQty)}</span>` : ''}</div>
          </div>
          <div class="qty">
            <button data-act="stock-dec" data-pid="${p.id}" aria-label="Меньше">−</button>
            <b>${num(p.stock)}</b>
            <button data-act="stock-inc" data-pid="${p.id}" aria-label="Больше">+</button>
          </div>
        </div>`).join('')}</div>`).join('')}
  `;
}

/* ================= Продукты ================= */
function renderProducts() {
  const cats = ['Все', ...CATEGORIES.filter((c) => db.products.some((p) => p.category === c))];
  const q = state.productQuery.toLowerCase();
  const list = db.products
    .filter((p) => (state.productFilter === 'Все' || p.category === state.productFilter) && (!q || p.name.toLowerCase().includes(q)))
    .sort((a, b) => a.name.localeCompare(b.name));

  $('#view').innerHTML = `
    <div class="addbar">
      <input id="pq" type="search" placeholder="Поиск продукта" value="${esc(state.productQuery)}">
      <button class="btn" data-act="new-product">Новый</button>
    </div>
    <div class="chips">${cats.map((c) => `<button data-act="cat" data-v="${esc(c)}" class="${state.productFilter === c ? 'active' : ''}">${esc(c)}</button>`).join('')}</div>
    ${list.length === 0 ? `<div class="empty"><div class="big">📦</div>Ничего не найдено.</div>` : `
    <div class="card" style="margin-top:8px">${list.map((p) => {
      const inList = db.list.some((i) => i.productId === p.id && !i.done);
      return `<div class="row" data-act="edit-product" data-pid="${p.id}">
        <div class="main">
          <div class="name">${esc(p.name)}</div>
          <div class="sub">${esc(p.category)} · ${p.price ? money(p.price) + ' / ' + esc(p.unit) : 'цена не указана'} · есть ${num(p.stock)} ${esc(p.unit)}</div>
        </div>
        <button class="btn ${inList ? 'ghost' : ''}" data-act="add-product" data-pid="${p.id}" style="padding:8px 12px">${inList ? '✓ в списке' : '+ в список'}</button>
      </div>`;
    }).join('')}</div>`}
  `;
  const pq = $('#pq');
  pq.addEventListener('input', () => {
    state.productQuery = pq.value;
    const pos = pq.selectionStart;
    renderProducts();
    const n = $('#pq'); n.focus(); n.setSelectionRange(pos, pos);
  });
}

function productDialog(p) {
  const isNew = !p;
  p = p || { id: uid(), name: state.productQuery || '', category: state.productFilter !== 'Все' ? state.productFilter : 'Другое', unit: 'шт', minQty: 0, price: '', stock: 0, expiry: '' };
  const history = db.purchases.flatMap((pu) => pu.items.filter((i) => i.productId === p.id).map((i) => ({ ...i, date: pu.date, store: pu.store }))).slice(0, 5);
  openDialog(`
    <h2>${isNew ? 'Новый продукт' : esc(p.name)}</h2>
    <label>Название<input name="name" required value="${esc(p.name)}"></label>
    <div class="grid2">
      <label>Категория<select name="category">${CATEGORIES.map((c) => `<option ${c === p.category ? 'selected' : ''}>${c}</option>`).join('')}</select></label>
      <label>Единица<select name="unit">${UNITS.map((u) => `<option ${u === p.unit ? 'selected' : ''}>${u}</option>`).join('')}</select></label>
      <label>Цена, ₽<input name="price" type="number" step="any" min="0" inputmode="decimal" value="${esc(p.price)}"></label>
      <label>Есть дома<input name="stock" type="number" step="any" min="0" inputmode="decimal" value="${esc(p.stock)}"></label>
      <label>Минимум (докупать)<input name="minQty" type="number" step="any" min="0" inputmode="decimal" value="${esc(p.minQty)}"></label>
      <label>Годен до<input name="expiry" type="date" value="${esc(p.expiry)}"></label>
    </div>
    ${history.length ? `<p class="note">Последние покупки: ${history.map((h) => `${fmtDate(h.date)} — ${money(h.price)}${h.store ? ' (' + esc(h.store) + ')' : ''}`).join('; ')}</p>` : ''}
    <div class="actions">
      ${isNew ? '' : '<button class="btn danger" value="delete">Удалить</button>'}
      <span class="spacer"></span>
      <button class="btn ghost" value="cancel" formnovalidate>Отмена</button>
      <button class="btn" value="ok">Сохранить</button>
    </div>`, (v, f) => {
    if (v === 'delete') {
      if (!confirm(`Удалить «${p.name}» из каталога? История закупок сохранится.`)) return;
      db.products = db.products.filter((x) => x.id !== p.id);
      db.list.forEach((i) => { if (i.productId === p.id) i.productId = null; });
    }
    if (v === 'ok') {
      const name = f.name.value.trim();
      if (!name) return;
      Object.assign(p, {
        name, category: f.category.value, unit: f.unit.value,
        price: f.price.value === '' ? '' : +f.price.value,
        stock: +f.stock.value || 0, minQty: +f.minQty.value || 0, expiry: f.expiry.value,
      });
      if (isNew) db.products.push(p);
      db.list.forEach((i) => { if (i.productId === p.id) { i.name = p.name; i.unit = p.unit; } });
    }
    save(); render();
  });
}

/* ================= Закупки ================= */
function renderPurchases() {
  const now = new Date();
  const ym = (d) => d.slice(0, 7);
  const thisM = now.toISOString().slice(0, 7);
  const prev = new Date(now.getFullYear(), now.getMonth() - 1, 15).toISOString().slice(0, 7);
  const sumM = (m) => db.purchases.filter((p) => ym(p.date) === m).reduce((s, p) => s + p.total, 0);
  const cur = sumM(thisM), last = sumM(prev);
  const cntM = db.purchases.filter((p) => ym(p.date) === thisM).length;

  const byCat = {};
  db.purchases.filter((p) => ym(p.date) === thisM).forEach((p) => p.items.forEach((i) => {
    const c = i.category || byId(i.productId)?.category || 'Другое';
    byCat[c] = (byCat[c] || 0) + i.qty * i.price;
  }));
  const cats = Object.entries(byCat).sort((a, b) => b[1] - a[1]);
  const maxCat = cats[0]?.[1] || 1;

  const monthName = now.toLocaleDateString('ru-RU', { month: 'long' });
  const delta = last ? Math.round((cur - last) / last * 100) : null;

  $('#view').innerHTML = `
    <div class="stats">
      <div class="stat"><div class="label">Потрачено за ${monthName}</div><div class="value">${money(cur)}</div>
        <div class="delta">${delta === null ? 'нет данных за прошлый месяц' : (delta >= 0 ? '+' : '') + delta + '% к прошлому'}</div></div>
      <div class="stat"><div class="label">Закупок в месяце</div><div class="value">${cntM}</div>
        <div class="delta">средний чек ${money(cntM ? cur / cntM : 0)}</div></div>
    </div>
    ${cats.length ? `<div class="section-title">По категориям</div>
      <div class="card">${cats.map(([c, v]) => `
        <div class="bar-row"><div class="top-line"><span>${esc(c)}</span><b>${money(v)}</b></div>
        <div class="bar"><i style="width:${Math.max(3, v / maxCat * 100)}%"></i></div></div>`).join('')}</div>` : ''}
    <div class="section-title">История <button data-act="new-purchase">+ Вручную</button></div>
    ${db.purchases.length === 0 ? `<div class="empty"><div class="big">🧾</div>Закупок пока нет. Отметьте товары в списке и нажмите «Завершить закупку».</div>` : `
    <div class="card">${[...db.purchases].sort((a, b) => b.date.localeCompare(a.date)).map((p) => `
      <div class="row" data-act="view-purchase" data-id="${p.id}">
        <div class="main"><div class="name">${fmtDate(p.date)}${p.store ? ' · ' + esc(p.store) : ''}</div>
        <div class="sub">${esc(p.items.map((i) => i.name).join(', '))}</div></div>
        <div class="end"><b>${money(p.total)}</b></div>
      </div>`).join('')}</div>`}
  `;
}

function purchaseDialog(p) {
  openDialog(`
    <h2>${new Date(p.date + 'T00:00').toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' })}</h2>
    ${p.store ? `<p class="note">${esc(p.store)}</p>` : ''}
    <div class="card">${p.items.map((i) => `
      <div class="row" style="cursor:default"><div class="main"><div class="name">${esc(i.name)}</div>
      <div class="sub">${num(i.qty)} ${esc(i.unit || '')} × ${money(i.price)}</div></div>
      <div class="end">${money(i.qty * i.price)}</div></div>`).join('')}</div>
    <div class="row" style="cursor:default;padding:4px 2px"><div class="main"><b>Итого</b></div><div class="end"><b>${money(p.total)}</b></div></div>
    <div class="actions">
      <button class="btn danger" value="delete">Удалить</button>
      <span class="spacer"></span>
      <button class="btn ghost" value="repeat">Повторить список</button>
      <button class="btn" value="cancel">Закрыть</button>
    </div>`, (v) => {
    if (v === 'delete') {
      if (!confirm('Удалить закупку из истории? Запасы не изменятся.')) return;
      db.purchases = db.purchases.filter((x) => x.id !== p.id);
    }
    if (v === 'repeat') {
      p.items.forEach((i) => addToList(i.name, i.qty));
      toast('Товары добавлены в список');
    }
    save(); render();
  });
}

function manualPurchaseDialog() {
  openDialog(`
    <h2>Закупка вручную</h2>
    <p class="note">Каждая строка: <b>название; количество; цена</b>.<br>Например: «Молоко; 2; 95»</p>
    <div class="grid2">
      <label>Дата<input name="date" type="date" value="${today()}" required></label>
      <label>Магазин<input name="store" placeholder="Необязательно"></label>
    </div>
    <label>Товары<textarea name="items" rows="6" style="border:1px solid var(--line);background:var(--card);border-radius:10px;padding:10px;font:inherit;color:inherit" required></textarea></label>
    <label style="display:flex;gap:8px;align-items:center;color:var(--ink)"><input type="checkbox" name="toStock" checked style="width:auto"> Добавить к запасам</label>
    <div class="actions">
      <button class="btn ghost" value="cancel" formnovalidate>Отмена</button>
      <button class="btn" value="ok">Сохранить</button>
    </div>`, (v, f) => {
    if (v !== 'ok') return;
    const items = f.items.value.split('\n').map((l) => l.split(/[;\t]/).map((s) => s.trim())).filter((a) => a[0]).map(([name, qty, price]) => {
      let p = findByName(name);
      if (!p) { p = { id: uid(), name, category: 'Другое', unit: 'шт', minQty: 0, price: 0, stock: 0, expiry: '' }; db.products.push(p); }
      const q = parseFloat(String(qty || '1').replace(',', '.')) || 1;
      const pr = parseFloat(String(price || '').replace(',', '.')) || +p.price || 0;
      if (f.toStock.checked) p.stock = (+p.stock || 0) + q;
      if (pr) p.price = pr;
      return { productId: p.id, name: p.name, category: p.category, unit: p.unit, qty: q, price: pr };
    });
    if (!items.length) return;
    const total = items.reduce((s, i) => s + i.qty * i.price, 0);
    db.purchases.unshift({ id: uid(), date: f.date.value, store: f.store.value.trim(), items, total });
    save(); render(); toast(`Сохранено · ${money(total)}`);
  });
}

/* ================= Меню / экспорт ================= */
function menuDialog() {
  openDialog(`
    <h2>Данные</h2>
    <p class="note">Всё хранится только на этом устройстве. Делайте резервную копию, чтобы перенести данные на другой телефон.</p>
    <button class="btn ghost menu-item" value="export">⬇️ Сохранить резервную копию</button>
    <button class="btn ghost menu-item" value="import">⬆️ Загрузить из копии</button>
    <button class="btn danger menu-item" value="reset">Удалить все данные</button>
    <div class="actions"><button class="btn" value="cancel">Закрыть</button></div>`, (v) => {
    if (v === 'export') {
      const blob = new Blob([JSON.stringify({ app: 'kladovaya', version: 1, exported: new Date().toISOString(), ...db }, null, 2)], { type: 'application/json' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `kladovaya-${today()}.json`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    }
    if (v === 'import') $('#importFile').click();
    if (v === 'reset' && confirm('Удалить все продукты, список и историю закупок? Это нельзя отменить.')) {
      db = normalize({}); save(); render(); toast('Данные удалены');
    }
  });
}
$('#menuBtn').addEventListener('click', menuDialog);
$('#importFile').addEventListener('change', async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  try {
    const data = JSON.parse(await file.text());
    if (!Array.isArray(data.products)) throw new Error('bad');
    if (!confirm('Заменить текущие данные данными из файла?')) return;
    db = normalize(data); save(); render(); toast('Данные загружены');
  } catch { toast('Файл не подходит'); }
  e.target.value = '';
});

/* ================= Диалог ================= */
function openDialog(html, onClose) {
  const dlg = $('#dlg'), form = $('#dlgForm');
  form.innerHTML = html;
  dlg.returnValue = '';
  const handler = () => {
    dlg.removeEventListener('close', handler);
    if (dlg.returnValue && dlg.returnValue !== 'cancel') onClose(dlg.returnValue, form.elements);
  };
  dlg.addEventListener('close', handler);
  dlg.showModal();
  const first = form.querySelector('input:not([type=checkbox]),textarea');
  if (first && !first.value) first.focus();
}
// Клик по фону закрывает диалог
$('#dlg').addEventListener('click', (e) => { if (e.target.id === 'dlg') $('#dlg').close('cancel'); });

/* ================= Делегирование кликов ================= */
$('#view').addEventListener('click', (e) => {
  const el = e.target.closest('[data-act]');
  if (!el) return;
  const act = el.dataset.act;
  const row = e.target.closest('.row');
  const item = row?.dataset.id && db.list.find((i) => i.id === row.dataset.id);
  const pid = el.dataset.pid;
  e.stopPropagation();

  switch (act) {
    case 'toggle': if (item) { item.done = !item.done; save(); render(); } break;
    case 'edit-item': if (item) editItemDialog(item); break;
    case 'clear-done': db.list = db.list.filter((i) => !i.done); save(); render(); break;
    case 'checkout': checkout(); break;
    case 'add-product': {
      const p = byId(pid); if (!p) break;
      if (db.list.some((i) => i.productId === p.id && !i.done)) { toast('Уже в списке'); break; }
      addToList(p.name); toast(`«${p.name}» в списке`); render(); break;
    }
    case 'add-low': db.products.filter((p) => isLow(p) && !db.list.some((i) => i.productId === p.id)).forEach((p) => addToList(p.name)); render(); break;
    case 'stock-filter': state.stockFilter = el.dataset.v; render(); break;
    case 'stock-inc': case 'stock-dec': {
      const p = byId(pid); if (!p) break;
      const step = ['кг', 'л'].includes(p.unit) ? 0.5 : ['г', 'мл'].includes(p.unit) ? 100 : 1;
      p.stock = Math.max(0, Math.round(((+p.stock || 0) + (act === 'stock-inc' ? step : -step)) * 1000) / 1000);
      save(); render(); break;
    }
    case 'edit-product': productDialog(byId(pid)); break;
    case 'new-product': productDialog(null); break;
    case 'cat': state.productFilter = el.dataset.v; render(); break;
    case 'view-purchase': { const p = db.purchases.find((x) => x.id === el.dataset.id); if (p) purchaseDialog(p); break; }
    case 'new-purchase': manualPurchaseDialog(); break;
  }
});

/* ================= PWA ================= */
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(console.warn));
}

render();
