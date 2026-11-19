'use strict';

/* Кладовая 3.0.6 — покупки, ручной контроль запасов и каталог. */
const STORAGE_KEY = 'kladovaya:v3';
const CATEGORIES = [
  'Молочные продукты','Мясо и птица','Рыба и морепродукты','Овощи и фрукты',
  'Бакалея','Хлеб и выпечка','Напитки','Заморозка','Сладости и снеки',
  'Бытовая химия','Гигиена и косметика','Для дома','Прочее'
];
const $ = (s, root=document) => root.querySelector(s);
const uid = () => crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36)+Math.random().toString(36).slice(2);
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const dateNow = () => new Date().toISOString();
const defaultDB = () => ({version:3, products:[], items:[], settings:{theme:'system'}, categoryOrder:[...CATEGORIES]});
function normalize(data) {
  const products = Array.isArray(data.products) ? data.products : [];
  const items = Array.isArray(data.items) ? data.items : [];
  return {
    version:3,
    products:products.filter(p=>p && p.id && p.name).map(p=>({
      id:String(p.id), name:String(p.name), category:CATEGORIES.includes(p.category)?p.category:'Прочее',
      unit:String(p.unit||''), tracked:!!p.tracked, stockStatus:p.stockStatus==='low'?'low':'available',
      favorite:!!p.favorite, purchaseCount:Math.max(0,Number(p.purchaseCount)||0),
      createdAt:p.createdAt||dateNow(), updatedAt:p.updatedAt||dateNow()
    })),
    items:items.filter(i=>i && i.id && i.productId).map(i=>({
      id:String(i.id), productId:String(i.productId), quantity:String(i.quantity||''),
      note:String(i.note||''), done:!!i.done, createdAt:i.createdAt||dateNow(), doneAt:i.doneAt||null
    })),
    settings:{theme:['system','light','dark'].includes(data.settings?.theme)?data.settings.theme:'system'},
    categoryOrder:[...CATEGORIES]
  };
}
function mapLegacyCategory(p){
  const guessed=guessCategory(String(p.name||''));
  if(guessed!=='Прочее') return guessed;
  return ({'Молочное':'Молочные продукты','Мясо и рыба':'Мясо и птица','Сладкое':'Сладости и снеки','Бытовое':'Бытовая химия','Другое':'Прочее','Спортпит':'Бакалея'})[p.category]||'Прочее';
}
function migrateLegacyDB(legacy){
  const migrated=defaultDB();
  const byLegacyId=new Map();
  (Array.isArray(legacy.products)?legacy.products:[]).forEach(old=>{
    if(!old||!old.name)return;
    const tracked=Number(old.stock)>0||Number(old.minQty)>0;
    const p={id:String(old.id||uid()),name:String(old.name),category:mapLegacyCategory(old),unit:String(old.unit||''),tracked,stockStatus:(Number(old.minQty)>0&&Number(old.stock)<Number(old.minQty))?'low':'available',favorite:false,purchaseCount:0,createdAt:dateNow(),updatedAt:dateNow()};
    migrated.products.push(p);
    if(old.id!=null)byLegacyId.set(String(old.id),p);
  });
  (Array.isArray(legacy.list)?legacy.list:[]).forEach(old=>{
    const name=String(old?.name||'').trim(); if(!name)return;
    let p=old.productId!=null?byLegacyId.get(String(old.productId)):null;
    if(!p)p=migrated.products.find(x=>x.name.toLocaleLowerCase('ru')===name.toLocaleLowerCase('ru'));
    if(!p){p={id:uid(),name,category:guessCategory(name),unit:'',tracked:false,stockStatus:'available',favorite:false,purchaseCount:0,createdAt:dateNow(),updatedAt:dateNow()};migrated.products.push(p);}
    const legacyProduct=(legacy.products||[]).find(x=>String(x.id)===String(old.productId));
    const amount=Number(old.qty);
    const quantity=Number.isFinite(amount)&&amount>0?(Number(legacyProduct?.pack)>1?amount+' уп.':amount+(p.unit?' '+p.unit:'')):String(old.qty||'');
    if(p.tracked)p.stockStatus='low';
    migrated.items.push({id:uid(),productId:p.id,quantity,note:'',done:false,createdAt:dateNow(),doneAt:null});
  });
  return normalize(migrated);
}
function loadDB(){
  try {
    const raw=localStorage.getItem(STORAGE_KEY);
    let current=raw?normalize(JSON.parse(raw)):defaultDB();
    const legacyRaw=localStorage.getItem('kladovaya:v2');
    const migrationDone=localStorage.getItem('kladovaya:v3:migration-done')==='1';
    if(legacyRaw&&!migrationDone){
      const imported=migrateLegacyDB(JSON.parse(legacyRaw));
      const ids=new Map();
      imported.products.forEach(oldProduct=>{
        const existing=current.products.find(p=>p.name.trim().toLocaleLowerCase('ru')===oldProduct.name.trim().toLocaleLowerCase('ru'));
        if(existing)ids.set(oldProduct.id,existing.id);
        else {current.products.push(oldProduct);ids.set(oldProduct.id,oldProduct.id);}
      });
      imported.items.forEach(oldItem=>{
        const productId=ids.get(oldItem.productId)||oldItem.productId;
        if(!current.items.some(i=>i.productId===productId&&!i.done)){
          current.items.push({...oldItem,productId});
        }
      });
      current=normalize(current);
      localStorage.setItem(STORAGE_KEY,JSON.stringify(current));
      localStorage.setItem('kladovaya:v3:migration-done','1');
      return current;
    }
    return current;
  } catch(e){console.error('Не удалось прочитать локальные данные',e);}
  return defaultDB();
}
let db=loadDB();
let activeTab='shopping';
let query='';
let suggestionOpen=false;
let collapsedDone=true;
const collapsedCategories=new Set();
function save(){
  try { localStorage.setItem(STORAGE_KEY,JSON.stringify(db)); }
  catch(e){ toast('Не удалось сохранить данные. Сделай резервную копию.'); console.error(e); }
}
function toast(message){
  const el=$('#toast'); el.textContent=message; el.classList.add('visible');
  clearTimeout(toast.timer); toast.timer=setTimeout(()=>el.classList.remove('visible'),2200);
}
function product(id){return db.products.find(p=>p.id===id);}
function activeItems(){return db.items.filter(i=>!i.done);}
function doneItems(){return db.items.filter(i=>i.done);}
function findProduct(name){const n=name.trim().toLocaleLowerCase('ru');return db.products.find(p=>p.name.trim().toLocaleLowerCase('ru')===n);}
function guessCategory(name){
  const n=name.toLocaleLowerCase('ru');
  const rules=[
    [/молок|кефир|йогурт|творог|сыр|сливк|масл.*слив|сметан|яйц/,'Молочные продукты'],
    [/куриц|индейк|говядин|свинин|фарш|мяс|колбас|сосиск|ветчин/,'Мясо и птица'],
    [/рыб|лосос|форел|кревет|тунец|морепродукт/,'Рыба и морепродукты'],
    [/яблок|банан|помидор|томат|огурц|картоф|морков|лук|зелень|фрукт|овощ|ягод|лимон/,'Овощи и фрукты'],
    [/рис|греч|булгур|макарон|мук|сахар|соль|круп|овсян|масло олив|соус|консерв|фасол/,'Бакалея'],
    [/хлеб|лаваш|тортиль|батон|булоч|выпеч|хлебц/,'Хлеб и выпечка'],
    [/вода|сок|кофе|чай|напит|лимонад/,'Напитки'],
    [/заморож|морожен|пельмен|вареник/,'Заморозка'],
    [/шоколад|конфет|печень|чипс|снек|торт|сладост/,'Сладости и снеки'],
    [/порош|губк|средство для посуд|моющ|чистящ|отбелив|кондиционер для белья/,'Бытовая химия'],
    [/шампун|гель для душ|зубн|паст|дезодоран|мыло|крем|бритв|туалетн.*бумаг/,'Гигиена и косметика']
  ];
  return rules.find(([re])=>re.test(n))?.[1]||'Прочее';
}
function addProduct(name, options={}){
  const clean=name.trim().replace(/\s+/g,' ');
  if(!clean) return null;
  const existing=findProduct(clean);
  if(existing){
    if(options.track) existing.tracked=true;
    existing.updatedAt=dateNow();
    return existing;
  }
  const p={id:uid(),name:clean,category:options.category||guessCategory(clean),unit:options.unit||'',
    tracked:!!options.track,stockStatus:'available',favorite:!!options.favorite,purchaseCount:0,
    createdAt:dateNow(),updatedAt:dateNow()};
  db.products.unshift(p); return p;
}
function addToList(p, quantity='', note=''){
  if(!p) return false;
  const existing=activeItems().find(i=>i.productId===p.id);
  if(existing){toast('Уже есть в списке покупок');return false;}
  db.items.unshift({id:uid(),productId:p.id,quantity:String(quantity||''),note:String(note||''),done:false,createdAt:dateNow(),doneAt:null});
  save(); return true;
}
function markDone(item, done){
  const p=product(item.productId);
  item.done=done; item.doneAt=done?dateNow():null;
  if(p?.tracked) p.stockStatus=done?'available':'low';
  if(p) p.purchaseCount=Math.max(0,p.purchaseCount+(done?1:-1));
  save(); render();
}
function markLow(id){
  const p=product(id); if(!p||!p.tracked)return;
  p.stockStatus=p.stockStatus==='low'?'available':'low';
  if(p.stockStatus==='low') { addToList(p); save(); }
  else {
    const pending=activeItems().find(i=>i.productId===p.id);
    if(pending) db.items=db.items.filter(i=>i.id!==pending.id);
    save();
  }
  render();
}
function removeFromList(id){db.items=db.items.filter(i=>i.id!==id);save();render();}
function showDialog(html, onSubmit){
  const dlg=$('#dialog'), old=$('#dialogForm'), form=old.cloneNode(false); old.replaceWith(form);
  form.innerHTML=html;
  form.addEventListener('submit',e=>{
    e.preventDefault(); const action=e.submitter?.value||'save';
    if(action==='cancel'){dlg.close();return;}
    if(!form.reportValidity())return;
    dlg.close();onSubmit?.(action,form);
  });
  dlg.showModal();
  const firstInput=form.querySelector('input:not([type="checkbox"]), select, textarea');
  if(firstInput) firstInput.focus();
}
function productFields(p=null, initialName=''){
  const selectedCategory=p?.category||guessCategory(initialName);
  return `<div class="dialog-head"><div><span class="eyebrow">${p?'КАТАЛОГ':'НОВЫЙ ТОВАР'}</span><h2>${p?'Изменить товар':'Добавить товар'}</h2></div><button class="close-dialog" value="cancel" formnovalidate aria-label="Закрыть">×</button></div>
  <label>Название<input name="name" required maxlength="80" value="${esc(p?.name||initialName)}" placeholder="Например, молоко" autocomplete="off"></label>
    <label>Категория<select name="category">${CATEGORIES.map(c=>`<option ${c===selectedCategory?'selected':''}>${esc(c)}</option>`).join('')}</select></label>
  <label>Единица измерения по умолчанию <span class="optional">необязательно</span><input name="unit" maxlength="20" value="${esc(p?.unit||'')}" placeholder="кг, л, упаковка, шт."></label>
  <label class="switch-line"><span><b>Отслеживать в запасах</b><small>Товар появится в разделе «Запасы»</small></span><input type="checkbox" name="tracked" ${p?.tracked?'checked':''}></label>
  <label class="switch-line"><span><b>В избранное</b><small>Быстрое добавление в покупки</small></span><input type="checkbox" name="favorite" ${p?.favorite?'checked':''}></label>
  <div class="dialog-actions"><button class="button secondary" value="cancel" formnovalidate>Отмена</button><button class="button primary" value="save">Сохранить</button></div>`;
}
function saveProductForm(form,p=null,addAfter=false){
  const name=form.elements.name.value.trim(); const existing=findProduct(name);
  if(existing && existing.id!==p?.id){toast('Такой товар уже есть в каталоге');return;}
  if(p){Object.assign(p,{name,category:form.elements.category.value,unit:form.elements.unit.value.trim(),tracked:form.elements.tracked.checked,favorite:form.elements.favorite.checked,updatedAt:dateNow()});}
  else {
    p=addProduct(name,{category:form.elements.category.value,unit:form.elements.unit.value.trim(),track:form.elements.tracked.checked,favorite:form.elements.favorite.checked});
    if(addAfter) addToList(p);
  }
  save();render();toast(p.name+' сохранён');
}
function openNewProduct(name='',addAfter=false){
  showDialog(productFields(null,name),(action,form)=>saveProductForm(form,null,addAfter));
}
function openEditProduct(p){
  showDialog(productFields(p),(action,form)=>saveProductForm(form,p));
}
function openAddItem(name=''){
  const match=findProduct(name);
  const options=match?match:{name,category:guessCategory(name),tracked:false,favorite:false};
  showDialog(`<div class="dialog-head"><div><span class="eyebrow">ПОКУПКИ</span><h2>Добавить покупку</h2></div><button class="close-dialog" value="cancel" formnovalidate>×</button></div>
    <label>Товар<input name="name" required maxlength="80" value="${esc(options.name)}" list="productOptions" autocomplete="off"><datalist id="productOptions">${db.products.map(p=>`<option value="${esc(p.name)}"></option>`).join('')}</datalist></label>
    <label>Количество <span class="optional">необязательно</span><input name="quantity" maxlength="50" placeholder="Например, 2 л или большая упаковка"></label>
    <label>Комментарий <span class="optional">необязательно</span><input name="note" maxlength="120" placeholder="Марка, вкус, уточнение"></label>
    <label class="switch-line"><span><b>Отслеживать в запасах</b><small>После покупки товар вернётся в статус «Есть»</small></span><input type="checkbox" name="tracked" ${options.tracked?'checked':''}></label>
    <label>Категория<select name="category">\${CATEGORIES.map(c=>\`<option \${c===options.category?'selected':''}>\${esc(c)}</option>\`).join('')}</select></label>
    <div class="dialog-actions"><button class="button secondary" value="cancel" formnovalidate>Отмена</button><button class="button primary" value="save">Добавить</button></div>`,
    (action,form)=>{
      const name=form.elements.name.value.trim();let p=findProduct(name);
      if(!p)p=addProduct(name,{category:form.elements.category.value,track:form.elements.tracked.checked});
      else {p.category=form.elements.category.value;p.tracked=form.elements.tracked.checked;p.updatedAt=dateNow();}
      addToList(p,form.elements.quantity.value,form.elements.note.value);save();render();
    });
  const input=$('#dialogForm [name="name"]');
  input?.addEventListener('input',()=>{
    const p=findProduct(input.value);const cat=p?.category||guessCategory(input.value);
    const category=$('#dialogForm [name="category"]');if(category)category.value=p?.category||cat;
    const track=$('#dialogForm [name="tracked"]');if(track)track.checked=p?p.tracked:false;
  });
}
function editListItem(item){
  const p=product(item.productId);if(!p)return;
  showDialog(`<div class="dialog-head"><div><span class="eyebrow">ПОКУПКА</span><h2>${esc(p.name)}</h2></div><button class="close-dialog" value="cancel" formnovalidate>×</button></div>
    <label>Количество<input name="quantity" maxlength="50" value="${esc(item.quantity)}" placeholder="Например, 2 шт."></label>
    <label>Комментарий<input name="note" maxlength="120" value="${esc(item.note)}" placeholder="Уточнение"></label>
    <div class="dialog-actions split"><button class="button danger" value="delete" formnovalidate>Удалить</button><span></span><button class="button secondary" value="cancel" formnovalidate>Отмена</button><button class="button primary" value="save">Сохранить</button></div>`,
    (action,form)=>{if(action==='delete')removeFromList(item.id);else{item.quantity=form.elements.quantity.value.trim();item.note=form.elements.note.value.trim();save();render();}});
}
function categoryGroups(items){
  const groups=new Map();
  items.forEach(i=>{const p=product(i.productId);if(!p)return;const c=p.category||'Прочее';if(!groups.has(c))groups.set(c,[]);groups.get(c).push(i);});
  return [...groups.entries()].sort((a,b)=>CATEGORIES.indexOf(a[0])-CATEGORIES.indexOf(b[0]));
}
function renderShopping(){
  const pending=activeItems(),done=doneItems();
  const count=pending.length;
  const suggestions=db.products.filter(p=>p.favorite).slice(0,8);
  $('#app').innerHTML=`
    <section class="welcome"><div><p class="eyebrow">ТВОЙ ДОМ, ТВОЙ СПИСОК</p><h1>Покупки<span class="count-bubble">${count}</span></h1><p class="muted">${count? 'Всё необходимое — в одном месте.':'Пока ничего покупать не нужно.'}</p></div></section>
    <form id="quickAdd" class="quick-add"><input id="quickInput" name="name" autocomplete="off" placeholder="Что нужно купить?" aria-label="Название покупки"><button class="add-button" aria-label="Добавить">+</button></form>
    <div id="quickSuggestions" class="suggestions" hidden></div>
    ${suggestions.length? `<section class="shortcut-section"><div class="section-heading"><h2>Избранное</h2></div><div class="favorite-chips">${suggestions.map(p=>`<button class="favorite-chip" data-add-product="${p.id}">＋ ${esc(p.name)}</button>`).join('')}</div></section>`:''}
    ${pending.length?categoryGroups(pending).map(([cat,items])=>`<section class="list-section"><button class="category-heading" data-collapse="${esc(cat)}"><span>${esc(cat)}</span><span class="category-meta">${items.length} <span>${collapsedCategories.has(cat)?'＋':'−'}</span></span></button>${collapsedCategories.has(cat)?'':`<div class="item-list">${items.map(renderListRow).join('')}</div>`}</section>`).join(''):`<div class="empty-state"><div class="empty-icon">✓</div><h2>Список свободен</h2><p>Добавь покупку в строке выше или отметь товар как заканчивающийся в запасах.</p></div>`}
    ${done.length?`<section class="done-section"><button class="done-heading" id="toggleDone"><span>Куплено</span><span class="done-count">${done.length} <span>${collapsedDone?'＋':'−'}</span></span></button>${collapsedDone?'':`<div class="item-list done-list">${done.sort((a,b)=>(b.doneAt||'').localeCompare(a.doneAt||'')).map(renderListRow).join('')}</div><button class="text-button clear-done" id="clearDone">Очистить купленное</button>`}</section>`:''}
    `;
  $('#quickAdd').addEventListener('submit',e=>{e.preventDefault();const name=$('#quickInput').value.trim();if(name){openAddItem(name);}});
  $('#quickInput').addEventListener('input',showQuickSuggestions);
  $('#toggleDone')?.addEventListener('click',()=>{collapsedDone=!collapsedDone;render();});
  $('#clearDone')?.addEventListener('click',()=>{if(confirm('Убрать купленные товары из списка? Каталог и запасы останутся без изменений.')){db.items=db.items.filter(i=>!i.done);save();render();}});
}
function renderListRow(item){
  const p=product(item.productId);if(!p)return '';
  return `<article class="shopping-row ${item.done?'is-done':''}"><button class="check-button" data-toggle-item="${item.id}" aria-label="${item.done?'Вернуть в покупки':'Отметить купленным'}">${item.done?'✓':''}</button><button class="item-main" data-edit-item="${item.id}"><span class="item-name">${esc(p.name)}</span><span class="item-detail">${[item.quantity,item.note].filter(Boolean).map(esc).join(' · ')}</span></button><button class="more-button" data-edit-item="${item.id}" aria-label="Изменить">•••</button></article>`;
}
function showQuickSuggestions(){
  const input=$('#quickInput'), box=$('#quickSuggestions');if(!input||!box)return;
  const q=input.value.trim().toLocaleLowerCase('ru');
  if(!q){box.hidden=true;return;}
  const matches=db.products.filter(p=>p.name.toLocaleLowerCase('ru').includes(q)).slice(0,5);
  box.innerHTML=matches.map(p=>`<button data-add-product="${p.id}"><span>${esc(p.name)}</span><small>${esc(p.category)}</small></button>`).join('')+
    `<button class="create-suggestion" data-create-name="${esc(input.value.trim())}">＋ Создать «${esc(input.value.trim())}»</button>`;
  box.hidden=false;
}
function renderStock(){
  const tracked=db.products.filter(p=>p.tracked).sort((a,b)=>(a.stockStatus==='low'?-1:1)-(b.stockStatus==='low'?-1:1)||a.name.localeCompare(b.name,'ru'));
  const low=tracked.filter(p=>p.stockStatus==='low');
  $('#app').innerHTML=`<section class="welcome"><div><p class="eyebrow">РУЧНОЙ КОНТРОЛЬ</p><h1>Запасы</h1><p class="muted">${tracked.length} товаров под наблюдением · ${low.length} заканчиваются</p></div></section>
    <form id="stockSearch" class="search-bar"><span>⌕</span><input name="q" placeholder="Найти в запасах" value="${esc(query)}"></form>
    ${tracked.filter(p=>p.name.toLocaleLowerCase('ru').includes(query.toLocaleLowerCase('ru'))).length?tracked.filter(p=>p.name.toLocaleLowerCase('ru').includes(query.toLocaleLowerCase('ru'))).map(p=>`<article class="stock-row"><div class="stock-symbol">${p.stockStatus==='low'?'!':'✓'}</div><button class="item-main" data-edit-product="${p.id}"><span class="item-name">${esc(p.name)}</span><span class="item-detail">${esc(p.category)}</span></button><button class="status-pill ${p.stockStatus==='low'?'low':'ok'}" data-toggle-stock="${p.id}">${p.stockStatus==='low'?'Заканчивается':'Есть'}</button></article>`).join(''):`<div class="empty-state"><div class="empty-icon">▣</div><h2>${tracked.length?'Ничего не найдено':'Пока нет отслеживаемых товаров'}</h2><p>${tracked.length?'Попробуй изменить поисковый запрос.':'Добавляй товары в каталог и включай для них отслеживание запасов.'}</p><button class="button primary" data-go-catalog>Открыть каталог</button></div>`}`;
  $('#stockSearch').addEventListener('submit',e=>e.preventDefault());
  $('#stockSearch [name="q"]').addEventListener('input',e=>{
    query=e.target.value.toLocaleLowerCase('ru');
    const rows=[...$('#app').querySelectorAll('.stock-row')];
    let shown=0;
    rows.forEach(row=>{const match=row.querySelector('.item-name').textContent.toLocaleLowerCase('ru').includes(query);row.hidden=!match;if(match)shown++;});
    let empty=$('#stockNoResults');
    if(!empty){empty=document.createElement('p');empty.id='stockNoResults';empty.className='muted';empty.textContent='Ничего не найдено';$('#app').append(empty);}
    empty.hidden=shown>0||rows.length===0;
  });
}
function renderCatalog(){
  const q=query.toLocaleLowerCase('ru');
  const filtered=db.products.filter(p=>p.name.toLocaleLowerCase('ru').includes(q)||p.category.toLocaleLowerCase('ru').includes(q));
  const frequent=[...db.products].filter(p=>p.purchaseCount>0).sort((a,b)=>b.purchaseCount-a.purchaseCount).slice(0,5);
  const recent=[...db.products].sort((a,b)=>b.updatedAt.localeCompare(a.updatedAt)).slice(0,5);
  $('#app').innerHTML=`<section class="welcome"><div><p class="eyebrow">ТВОЙ СПИСОК ПРИВЫЧНЫХ ПОКУПОК</p><h1>Каталог</h1><p class="muted">${db.products.length} товаров</p></div><button class="button primary" id="newProduct">＋ Новый</button></section>
    <label class="search-bar"><span>⌕</span><input id="catalogSearch" placeholder="Поиск по каталогу" value="${esc(query)}"></label>
    ${!q&&db.products.length?`<section class="catalog-shortcuts"><div class="shortcut-section"><div class="section-heading"><h2>Недавно добавленные</h2></div><div class="horizontal-chips">${recent.map(p=>`<button data-add-product="${p.id}">${esc(p.name)}</button>`).join('')}</div></div>${frequent.length?`<div class="shortcut-section"><div class="section-heading"><h2>Часто покупаемые</h2></div><div class="horizontal-chips">${frequent.map(p=>`<button data-add-product="${p.id}">${esc(p.name)}</button>`).join('')}</div></div>`:''}</section>`:''}
    ${filtered.length?categoryGroups(filtered.map(p=>({productId:p.id}))).map(([cat,items])=>`<section class="list-section"><div class="category-heading static"><span>${esc(cat)}</span><span class="category-meta">${items.length}</span></div><div class="item-list">${items.map(({productId})=>{const p=product(productId);return `<article class="catalog-row"><button class="item-main" data-edit-product="${p.id}"><span class="item-name">${p.favorite?'★ ':''}${esc(p.name)}</span><span class="item-detail">${p.tracked?'Отслеживается в запасах':'Не отслеживается'}</span></button><button class="small-add" data-add-product="${p.id}">＋</button></article>`;}).join('')}</div></section>`).join(''):`<div class="empty-state"><h2>Товаров пока нет</h2><p>Создай первый товар — он сохранится в каталоге.</p><button class="button primary" id="emptyNew">Добавить товар</button></div>`}`;
  $('#newProduct')?.addEventListener('click',()=>openNewProduct());
  $('#emptyNew')?.addEventListener('click',()=>openNewProduct());
  $('#catalogSearch')?.addEventListener('input',e=>{
    query=e.target.value.toLocaleLowerCase('ru');
    let shown=0;
    $('#app').querySelectorAll('.list-section').forEach(section=>{
      const rows=[...section.querySelectorAll('.catalog-row')];
      let sectionShown=0;
      const category=section.querySelector('.category-heading')?.textContent.toLocaleLowerCase('ru')||'';
      rows.forEach(row=>{
        const text=(row.querySelector('.item-main')?.textContent||'').toLocaleLowerCase('ru')+' '+category;
        const match=text.includes(query);
        row.hidden=!match;
        if(match)sectionShown++;
      });
      section.hidden=sectionShown===0;
      shown+=sectionShown;
    });
    const shortcuts=$('#app .catalog-shortcuts');if(shortcuts)shortcuts.hidden=!!query;
    let empty=$('#catalogNoResults');
    if(!empty){empty=document.createElement('div');empty.id='catalogNoResults';empty.className='empty-state';empty.textContent='Ничего не найдено';$('#app').append(empty);}
    empty.hidden=!query||shown>0;
  });
}
function renderSettings(){
  $('#app').innerHTML=`<section class="welcome"><div><p class="eyebrow">ПЕРСОНАЛЬНЫЕ НАСТРОЙКИ</p><h1>Настройки</h1><p class="muted">Данные хранятся на этом устройстве.</p></div></section>
    <section class="settings-card"><h2>Внешний вид</h2><p>Тема приложения</p><div class="theme-options">${[['system','Как на телефоне'],['light','Светлая'],['dark','Тёмная']].map(([v,t])=>`<button class="${db.settings.theme===v?'selected':''}" data-theme="${v}">${t}</button>`).join('')}</div></section>
    <section class="settings-card"><h2>Резервная копия</h2><p>Сохрани файл, чтобы перенести каталог, запасы и список на другой телефон или восстановить их позже.</p><button class="settings-action" id="exportBackup">↓ Скачать резервную копию</button><button class="settings-action" id="importBackup">↑ Восстановить из файла</button></section>
    <section class="settings-card"><h2>Данные приложения</h2><p>Кладовая не отправляет данные на сервер. Удаление данных браузера может стереть локальную базу — регулярно сохраняй резервную копию.</p><button class="settings-action danger-text" id="resetData">Сбросить данные приложения</button></section>
    <p class="version-note">Кладовая · версия 3.0.5</p>`;
}
function render(){
  const titles={shopping:'Покупки',stock:'Запасы',catalog:'Каталог',settings:'Настройки'};
  $('#pageTitle').textContent=titles[activeTab];
  document.querySelectorAll('.nav-item').forEach(b=>b.classList.toggle('active',b.dataset.tab===activeTab));
  document.documentElement.dataset.theme=db.settings.theme;
  ({shopping:renderShopping,stock:renderStock,catalog:renderCatalog,settings:renderSettings}[activeTab])();
}
function exportBackup(){
  const payload={app:'kladovaya',version:3,exportedAt:dateNow(),data:db};
  const blob=new Blob([JSON.stringify(payload,null,2)],{type:'application/json'});
  const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='kladovaya-backup-'+new Date().toISOString().slice(0,10)+'.json';a.click();URL.revokeObjectURL(url);toast('Резервная копия подготовлена');
}
function importBackup(file){
  const reader=new FileReader();reader.onload=()=>{
    try{const payload=JSON.parse(reader.result);const incoming=normalize(payload.data||payload);if(!Array.isArray(incoming.products)||!Array.isArray(incoming.items))throw new Error('bad');
      if(!confirm('Заменить текущие данные содержимым резервной копии?'))return;
      db=incoming;save();render();toast('Данные восстановлены');
    }catch(e){toast('Не удалось прочитать эту копию');}
  };reader.readAsText(file);
}
document.addEventListener('click',e=>{
  const nav=e.target.closest('[data-tab]');if(nav){activeTab=nav.dataset.tab;query='';render();return;}
  const toggle=e.target.closest('[data-toggle-item]');if(toggle){const i=db.items.find(x=>x.id===toggle.dataset.toggleItem);if(i)markDone(i,!i.done);return;}
  const edit=e.target.closest('[data-edit-item]');if(edit){const i=db.items.find(x=>x.id===edit.dataset.editItem);if(i)editListItem(i);return;}
  const low=e.target.closest('[data-toggle-stock]');if(low){markLow(low.dataset.toggleStock);return;}
  const editP=e.target.closest('[data-edit-product]');if(editP){const p=product(editP.dataset.editProduct);if(p)openEditProduct(p);return;}
  const add=e.target.closest('[data-add-product]');if(add){const p=product(add.dataset.addProduct);if(p){if(p.tracked){addToList(p);activeTab='shopping';render();}else openAddItem(p.name);}return;}
  const create=e.target.closest('[data-create-name]');if(create){openAddItem(create.dataset.createName);$('#quickSuggestions').hidden=true;return;}
  const collapse=e.target.closest('[data-collapse]');if(collapse){const c=collapse.dataset.collapse;collapsedCategories.has(c)?collapsedCategories.delete(c):collapsedCategories.add(c);render();return;}
  if(e.target.closest('[data-go-catalog]')){activeTab='catalog';render();return;}
  const theme=e.target.closest('[data-theme]');if(theme){db.settings.theme=theme.dataset.theme;save();render();return;}
});
$('#settingsShortcut').addEventListener('click',()=>{activeTab='settings';render();});
$('#app').addEventListener('click',e=>{
  if(e.target.id==='exportBackup')exportBackup();
  if(e.target.id==='importBackup')$('#backupFile').click();
  if(e.target.id==='resetData'&&confirm('Удалить каталог, запасы и список покупок на этом устройстве? Сначала сохрани резервную копию, если данные могут понадобиться.')){db=defaultDB();save();render();toast('Данные очищены');}
});
$('#backupFile').addEventListener('change',e=>{const file=e.target.files[0];if(file)importBackup(file);e.target.value='';});
render();

/* Обновление PWA: как в Kalashnikov — заметная плашка и явная кнопка. */
if ('serviceWorker' in navigator) {
  let waitingWorker = null;
  let reloading = false;
  const notice = $('#updateNotice');
  const updateButton = $('#updateButton');

  function showUpdate(worker) {
    if (!worker) return;
    waitingWorker = worker;
    notice.querySelector('span').textContent = 'Вышло обновление';
    notice.hidden = false;
  }

  function inspectRegistration(registration) {
    if (registration.waiting && navigator.serviceWorker.controller) {
      showUpdate(registration.waiting);
    }
  }

  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (reloading) return;
    reloading = true;
    // Пользовательские данные хранятся в localStorage; перезагружаем только интерфейс.
    window.location.reload();
  });

  navigator.serviceWorker.register('./sw.js').then(registration => {
    inspectRegistration(registration);

    const checkForUpdate = () => {
      if (document.visibilityState === 'visible') registration.update().catch(() => {});
    };

    registration.addEventListener('updatefound', () => {
      const installing = registration.installing;
      if (!installing) return;
      installing.addEventListener('statechange', () => {
        if (installing.state === 'installed' && navigator.serviceWorker.controller) {
          showUpdate(registration.waiting || installing);
        }
      });
    });

    // Проверяем при запуске, возвращении в приложение и регулярно во время использования.
    window.addEventListener('focus', checkForUpdate);
    window.addEventListener('pageshow', checkForUpdate);
    document.addEventListener('visibilitychange', checkForUpdate);
    checkForUpdate();
    window.setInterval(checkForUpdate, 2 * 60 * 1000);
  }).catch(error => console.warn('Не удалось зарегистрировать Service Worker:', error));

  updateButton.addEventListener('click', () => {
    if (!waitingWorker) return;
    updateButton.disabled = true;
    updateButton.textContent = 'Обновляем…';
    waitingWorker.postMessage({ type: 'SKIP_WAITING' });
  });
}
