'use strict';
const $ = (s, r = document) => r.querySelector(s), $$ = (s, r = document) => [...r.querySelectorAll(s)];
const S = { set: {}, products: [], suppliers: [], customers: [] };
const MN = ['يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو', 'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'];
const NAV = [['dashboard', 'لوحة التحكم', '🏠'], ['products', 'المنتجات', '📦'], ['inventory', 'جرد المخزون', '🗂️'], ['sales', 'المبيعات', '🧾'],
  ['purchases', 'المشتريات', '🛒'], ['reports', 'تقارير الأرباح', '📈'], ['suppliers', 'الموردون', '🚚'], ['customers', 'العملاء', '👥'], ['settings', 'الإعدادات', '⚙️']];
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const num = n => new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 }).format(+n || 0);
const money = n => num(n) + ' ' + (S.set.currency || 'ج.م');
const today = () => new Date().toLocaleDateString('sv');
const bd = (t, c) => `<span class="bd ${c}">${t}</span>`;
const stat = p => p.qty <= 0 ? ['نفد', 'r'] : p.qty <= p.min_qty ? ['منخفض', 'o'] : ['متوفر', 'g'];

async function api(u, m = 'GET', b, raw) {
  const r = await fetch('/api/' + u, { method: m, headers: raw ? { 'Content-Type': 'application/octet-stream' } : { 'Content-Type': 'application/json' }, body: raw || (b ? JSON.stringify(b) : undefined) });
  if (!r.ok) { let e = 'حدث خطأ'; try { e = (await r.json()).error || e } catch { } throw new Error(e) }
  return r;
}
const J = async (...a) => (await api(...a)).json();
function toast(t, bad) { const e = $('#toast'); e.textContent = t; e.className = 'show' + (bad ? ' bad' : ''); clearTimeout(toast.t); toast.t = setTimeout(() => e.className = '', 3000) }
const load = async () => { [S.set, S.products, S.suppliers, S.customers] = await Promise.all(['settings', 'products', 'suppliers', 'customers'].map(x => J(x))) };
async function refresh(msg) { closeM(); await load(); await route(); if (msg) toast(msg) }

/* ---------- عناصر مشتركة ---------- */
function modal(title, body, o = {}) {
  const m = $('#modal');
  m.innerHTML = `<div class="ov"><div class="box ${o.wide ? 'wide' : ''}"><div class="mh"><h3>${title}</h3><button class="cl" data-close>✕</button></div><div class="mb">${body}</div>${o.onOk ? `<div class="mf noprint"><button class="btn or" id="mok">${o.ok || 'حفظ'}</button><button class="btn gh" data-close>إلغاء</button></div>` : ''}</div></div>`;
  m.firstChild.onclick = e => { if (e.target.dataset.close !== undefined || e.target.classList.contains('ov')) closeM() };
  if (o.onOk) $('#mok').onclick = async () => { try { await o.onOk() } catch (e) { toast(e.message, 1) } };
}
const closeM = () => $('#modal').innerHTML = '';
const F = (l, n, v = '', t = 'text', x = '', c = '') => `<label class="f ${c}"><span>${l}</span><input name="${n}" type="${t}" value="${esc(v)}" ${x}></label>`;
const Sel = (l, n, o, v, c = '') => `<label class="f ${c}"><span>${l}</span><select name="${n}">${o.map(([k, t]) => `<option value="${esc(k)}" ${String(k) === String(v ?? '') ? 'selected' : ''}>${esc(t)}</option>`).join('')}</select></label>`;
const vals = f => Object.fromEntries(new FormData(f));
const tbl = (h, r, foot = '') => `<div class="tw"><table><thead><tr>${h.map(x => `<th>${x}</th>`).join('')}</tr></thead><tbody>${r.length ? r.map(x => `<tr>${x.map(c => `<td${c && c.cls ? ` class="${c.cls}"` : ''}>${c && c.cls ? c.h : c}</td>`).join('')}</tr>`).join('') : `<tr><td colspan="${h.length}" class="empty">لا توجد بيانات لعرضها</td></tr>`}</tbody>${foot}</table></div>`;
const C = (cls, h) => ({ cls, h });
const readImg = file => new Promise(r => { const f = new FileReader(); f.onload = () => { const i = new Image(); i.onload = () => { const k = Math.min(1, 320 / Math.max(i.width, i.height)), c = document.createElement('canvas'); c.width = i.width * k; c.height = i.height * k; c.getContext('2d').drawImage(i, 0, 0, c.width, c.height); r(c.toDataURL('image/jpeg', .8)) }; i.src = f.result }; f.readAsDataURL(file) });
const doPrint = () => { document.body.classList.add('pm'); print(); document.body.classList.remove('pm') };

/* ---------- رسوم بيانية (SVG بدون مكتبات) ---------- */
const short = n => n >= 1e6 ? (n / 1e6).toFixed(1) + 'M' : n >= 1e3 ? (n / 1e3).toFixed(1) + 'k' : Math.round(n);
function frame(labels, mx, inner) {
  const W = 600, H = 250, p = 38, g = (W - 2 * p) / labels.length, X = i => W - p - (i + .5) * g;
  let o = `<svg viewBox="0 0 ${W} ${H}" class="chart">`;
  for (let i = 0; i <= 4; i++) { const y = H - p - (H - 2 * p) * i / 4; o += `<line x1="${p}" x2="${W - p}" y1="${y}" y2="${y}" class="grid"/><text x="${p - 6}" y="${y + 4}" text-anchor="end">${short(mx * i / 4)}</text>` }
  labels.forEach((l, i) => o += `<text x="${X(i)}" y="${H - 12}" text-anchor="middle">${l}</text>`);
  return o + inner(W, H, p, g, X, v => H - p - (H - 2 * p) * v / mx) + '</svg>';
}
const legend = s => `<div class="lg">${s.map(x => `<span><i style="background:${x.c}"></i>${x.n}</span>`).join('')}</div>`;
function bars(labels, series) {
  const mx = Math.max(1, ...series.flatMap(s => s.d));
  return legend(series) + frame(labels, mx, (W, H, p, g, X, Y) => series.map((s, k) => s.d.map((v, i) => { const w = g * .72 / series.length; return `<rect x="${X(i) + g * .36 - (k + 1) * w}" y="${Y(v)}" width="${w - 2}" height="${H - p - Y(v)}" rx="5" fill="${s.c}"><title>${s.n}: ${num(v)}</title></rect>` }).join('')).join(''));
}
function lines(labels, series) {
  const all = series.flatMap(s => s.d), mx = Math.max(1, ...all.map(Math.abs));
  return legend(series) + frame(labels, mx, (W, H, p, g, X, Y) => series.map(s => {
    const pts = s.d.map((v, i) => `${X(i)},${Y(Math.max(0, v))}`).join(' ');
    return `<polyline points="${pts}" fill="none" stroke="${s.c}" stroke-width="3.5" stroke-linejoin="round"/>` + s.d.map((v, i) => `<circle cx="${X(i)}" cy="${Y(Math.max(0, v))}" r="4.5" fill="#fff" stroke="${s.c}" stroke-width="3"><title>${s.n}: ${num(v)}</title></circle>`).join('');
  }).join(''));
}

/* ---------- الصفحات ---------- */
const P = {};
P.dashboard = async v => {
  const d = await J('dashboard');
  const cards = [['إجمالي المبيعات', money(d.sales), '🧾', 'c1'], ['إجمالي المشتريات', money(d.purchases), '🛒', 'c2'], ['صافي الربح', money(d.net), '💰', 'c3'],
    ['قيمة المخزون الحالية', money(d.inv_value), '📦', 'c4'], ['منتجات منخفضة المخزون', d.low.length, '⚠️', 'c5'], ['الكميات المتبقية', num(d.total_qty), '🔢', 'c6']];
  const ml = d.months.map(m => MN[+m.m.slice(5) - 1]), dl = d.days.map(x => x.d.slice(8));
  v.innerHTML = `<div class="cards">${cards.map(c => `<div class="sc ${c[3]}"><div><small>${c[0]}</small><b>${c[1]}</b></div><i>${c[2]}</i></div>`).join('')}</div>
  <div class="row2"><div class="card"><h4>المبيعات والمشتريات (آخر 6 أشهر)</h4>${bars(ml, [{ n: 'المبيعات', c: '#0b1f4b', d: d.months.map(m => m.sales) }, { n: 'المشتريات', c: '#ff7a1a', d: d.months.map(m => m.purchases) }])}</div>
  <div class="card"><h4>صافي الربح الشهري</h4>${lines(ml, [{ n: 'صافي الربح', c: '#ff7a1a', d: d.months.map(m => m.profit) }])}</div></div>
  <div class="row2"><div class="card"><h4>حركة المخزون (آخر 14 يوماً)</h4>${lines(dl, [{ n: 'وارد (مشتريات)', c: '#2d4f98', d: d.days.map(x => x.in) }, { n: 'صادر (مبيعات)', c: '#f5b301', d: d.days.map(x => x.out) }])}</div>
  <div class="card"><h4>المنتجات الأكثر مبيعاً</h4>${d.top.length ? d.top.map(t => `<div class="hb"><span>${esc(t.name)}</span><em><i style="width:${t.qty / d.top[0].qty * 100}%"></i></em><b>${num(t.qty)}</b></div>`).join('') : '<p class="empty">لا توجد مبيعات بعد</p>'}</div></div>
  <div class="card"><h4>⚠️ منتجات تحتاج إعادة تزويد</h4>${tbl(['المنتج', 'التصنيف', 'الكمية المتبقية', 'الحد الأدنى', 'الحالة'], d.low.map(p => [esc(p.name), esc(p.category), C(p.qty <= 0 ? 'r' : 'o', num(p.qty)), num(p.min_qty), bd(...stat(p))]))}</div>`;
};

function productForm(p = {}) {
  let img = p.image || '';
  const cats = [...new Set(S.products.map(x => x.category).filter(Boolean))];
  modal(p.id ? 'تعديل المنتج' : 'إضافة منتج جديد', `<form id="fm" class="grid2">${F('اسم المنتج *', 'name', p.name, 'text', 'required')}${F('التصنيف', 'category', p.category, 'text', 'list="cats"')}<datalist id="cats">${cats.map(c => `<option value="${esc(c)}">`).join('')}</datalist>
  ${F('الباركود / SKU', 'sku', p.sku)}${Sel('المورد', 'supplier_id', [['', '— بدون —'], ...S.suppliers.map(s => [s.id, s.name])], p.supplier_id)}
  ${F('سعر الشراء', 'buy_price', p.buy_price ?? 0, 'number', 'step="any" min="0"')}${F('سعر البيع', 'sell_price', p.sell_price ?? 0, 'number', 'step="any" min="0"')}
  ${F('الكمية الحالية', 'qty', p.qty ?? 0, 'number', 'step="any" min="0"')}${F('الحد الأدنى للمخزون', 'min_qty', p.min_qty ?? 0, 'number', 'step="any" min="0"')}
  <label class="f full"><span>ملاحظات</span><textarea name="notes" rows="2">${esc(p.notes)}</textarea></label>
  <label class="f full"><span>صورة المنتج (اختياري)</span><input type="file" id="im" accept="image/*"><img id="pv" src="${img}" ${img ? '' : 'hidden'}></label></form>`,
    { wide: true, onOk: async () => { const d = vals($('#fm')); if (!d.name.trim()) throw Error('اسم المنتج مطلوب'); d.image = img; if (p.id) d.id = p.id; await J('products', 'POST', d); await refresh('تم حفظ المنتج ✔') } });
  $('#im').onchange = async e => { if (e.target.files[0]) { img = await readImg(e.target.files[0]); $('#pv').src = img; $('#pv').hidden = false } };
}

P.products = v => {
  v.innerHTML = `<div class="card"><div class="bar"><input id="q" class="grow" placeholder="🔍 ابحث بالاسم أو التصنيف أو الباركود..."><button class="btn or" id="add">＋ إضافة منتج جديد</button></div><div id="tb"></div></div>`;
  const draw = () => {
    const q = $('#q').value.trim().toLowerCase();
    const l = S.products.filter(p => [p.name, p.category, p.sku].join(' ').toLowerCase().includes(q));
    $('#tb').innerHTML = tbl(['#', 'صورة', 'المنتج', 'التصنيف', 'الباركود', 'المورد', 'سعر الشراء', 'سعر البيع', 'الكمية', 'إجراءات'],
      l.map((p, i) => [i + 1, p.image ? `<img class="th" src="${p.image}">` : '🖼️', C('n', esc(p.name)), bd(esc(p.category || '—'), 'b'), esc(p.sku), esc(p.supplier || '—'), C('o', money(p.buy_price)), C('g', money(p.sell_price)), C('n', num(p.qty)),
      `<button class="btn sm nv" data-e="${p.id}">تعديل</button> <button class="btn sm rd" data-d="${p.id}">حذف</button>`]));
    $$('[data-e]').forEach(b => b.onclick = () => productForm(S.products.find(p => p.id == b.dataset.e)));
    $$('[data-d]').forEach(b => b.onclick = async () => { if (confirm('حذف هذا المنتج نهائياً؟')) { await J('products/' + b.dataset.d, 'DELETE'); refresh('تم الحذف') } });
  };
  $('#q').oninput = draw; $('#add').onclick = () => productForm(); draw();
};

P.inventory = v => {
  v.innerHTML = `<div class="card"><div class="bar"><input id="q" class="grow" placeholder="🔍 بحث..."><select id="fs"><option value="">كل الحالات</option><option value="r">نفد</option><option value="o">منخفض</option><option value="g">متوفر</option></select><button class="btn nv noprint" onclick="doPrint()">🖨️ طباعة</button></div><div id="tb"></div></div>`;
  const draw = () => {
    const q = $('#q').value.trim().toLowerCase(), f = $('#fs').value;
    const l = S.products.filter(p => p.name.toLowerCase().includes(q) && (!f || stat(p)[1] === f));
    const tv = l.reduce((a, p) => a + p.qty * p.buy_price, 0), tq = l.reduce((a, p) => a + p.qty, 0);
    $('#tb').innerHTML = tbl(['المنتج', 'سعر الشراء', 'سعر البيع', 'الكمية الحالية', 'قيمة المخزون', 'ربح الوحدة', 'الحالة'],
      l.map(p => [C('n', esc(p.name)), C('o', money(p.buy_price)), money(p.sell_price), C(stat(p)[1], num(p.qty)), C('n', money(p.qty * p.buy_price)), C(p.sell_price >= p.buy_price ? 'g' : 'r', money(p.sell_price - p.buy_price)), bd(...stat(p).map((x, i) => i ? x : x + (x == 'منخفض' ? ' ⚠️' : '')))]),
      `<tfoot><tr><td>الإجمالي (${l.length} منتج)</td><td></td><td></td><td>${num(tq)}</td><td>${money(tv)}</td><td></td><td></td></tr></tfoot>`);
  };
  $('#q').oninput = draw; $('#fs').onchange = draw; draw();
};

function invoice(kind) {
  const sale = kind === 'sales';
  const opts = `<option value="">اختر منتجاً...</option>` + S.products.map(p => `<option value="${p.id}" data-s="${p.sell_price}" data-b="${p.buy_price}">${esc(p.name)} (متاح: ${num(p.qty)})</option>`).join('');
  const row = () => `<tr class="ln"><td><select class="pid">${opts}</select></td><td><input class="q" type="number" min="0" step="any" value="1"></td><td><input class="pr" type="number" min="0" step="any" value="0"></td><td class="lt n">0</td><td><button type="button" class="btn sm rd rm">✕</button></td></tr>`;
  const head = sale ? `${F('التاريخ', 'date', today(), 'date')}${Sel('طريقة الدفع', 'method', ['نقدي', 'بطاقة', 'تحويل بنكي', 'آجل'].map(x => [x, x]))}
    ${Sel('العميل', 'customer_id', [['', '— عميل نقدي —'], ...S.customers.map(c => [c.id, c.name])])}${F('اسم العميل', 'customer_name', 'عميل نقدي')}`
    : `${F('التاريخ', 'date', today(), 'date')}${Sel('المورد', 'supplier_id', [['', '— غير محدد —'], ...S.suppliers.map(s => [s.id, s.name])])}`;
  modal(sale ? 'فاتورة بيع جديدة' : 'فاتورة شراء جديدة', `<form id="fm" class="grid2">${head}</form><br>
    <div class="tw"><table><thead><tr><th>المنتج</th><th>الكمية</th><th>${sale ? 'سعر البيع' : 'سعر الشراء'}</th><th>الإجمالي</th><th></th></tr></thead><tbody id="ls">${row()}</tbody></table></div>
    <p><button type="button" class="btn sm nv" id="ar">＋ إضافة سطر</button></p>
    <div class="tot">${sale ? `<label>خصم: <input id="dc" type="number" min="0" step="any" value="0" style="width:110px;border:2px solid #cfd8ee;border-radius:10px;padding:6px"></label>` : ''}<span>الإجمالي: <b id="gt">0</b></span></div>`,
    {
      wide: true, ok: 'حفظ الفاتورة', onOk: async () => {
        const d = vals($('#fm')); d.items = $$('#ls tr').map(r => ({ product_id: $('.pid', r).value, qty: +$('.q', r).value, price: +$('.pr', r).value })).filter(i => i.product_id);
        if (sale) { d.discount = +$('#dc').value || 0; if (d.customer_id) d.customer_name = S.customers.find(c => c.id == d.customer_id)?.name }
        await J(kind, 'POST', d); await refresh('تم حفظ الفاتورة وتحديث المخزون ✔');
      }
    });
  const calc = () => { let t = 0; $$('#ls tr').forEach(r => { const l = (+$('.q', r).value || 0) * (+$('.pr', r).value || 0); $('.lt', r).textContent = num(l); t += l }); $('#gt').textContent = money(t - (sale ? +$('#dc').value || 0 : 0)) };
  const ls = $('#ls');
  ls.onchange = e => { if (e.target.classList.contains('pid')) { const o = e.target.selectedOptions[0]; $('.pr', e.target.closest('tr')).value = (sale ? o.dataset.s : o.dataset.b) || 0 } calc() };
  ls.oninput = calc; ls.onclick = e => { if (e.target.classList.contains('rm') && $$('#ls tr').length > 1) { e.target.closest('tr').remove(); calc() } };
  $('#ar').onclick = () => ls.insertAdjacentHTML('beforeend', row());
  if (sale) { $('#dc').oninput = calc; $('[name=customer_id]').onchange = e => $('[name=customer_name]').value = S.customers.find(c => c.id == e.target.value)?.name || 'عميل نقدي' }
  calc();
}

async function showInvoice(kind, id) {
  const r = await J(`${kind}/${id}`), sale = kind === 'sales', who = sale ? r.customer_name : (S.suppliers.find(s => s.id == r.supplier_id)?.name || '—');
  modal(`${sale ? 'فاتورة بيع' : 'فاتورة شراء'} رقم ${r.id}`, `<div class="inv"><h2>${esc(S.set.name)}</h2><p>${esc(S.set.address)} ${esc(S.set.phone)}</p><p>التاريخ: ${r.date} — ${sale ? 'العميل' : 'المورد'}: ${esc(who)}${sale ? ' — الدفع: ' + esc(r.method) : ''}</p></div><br>
  ${tbl(['#', 'المنتج', 'الكمية', 'السعر', 'الإجمالي'], r.items.map((i, n) => [n + 1, esc(i.name), num(i.qty), money(i.price), C('n', money(i.qty * i.price))]),
    `<tfoot>${sale && r.discount ? `<tr><td colspan="4">الخصم</td><td>${money(r.discount)}</td></tr>` : ''}<tr><td colspan="4">الإجمالي النهائي</td><td>${money(r.total)}</td></tr></tfoot>`)}
  <p style="text-align:center;color:#5b6788">${esc(S.set.footer)}</p><button class="btn or noprint" onclick="doPrint()">🖨️ طباعة</button>`, { wide: true });
}

const invList = (kind) => async v => {
  const sale = kind === 'sales', l = await J(kind);
  v.innerHTML = `<div class="card"><div class="bar"><span class="grow"><b>${l.length}</b> فاتورة — الإجمالي: <b>${money(l.reduce((a, x) => a + x.total, 0))}</b></span><button class="btn or" id="add">＋ ${sale ? 'فاتورة بيع جديدة' : 'فاتورة شراء جديدة'}</button></div>
  ${tbl(['رقم', 'التاريخ', sale ? 'العميل' : 'المورد', ...(sale ? ['طريقة الدفع', 'الخصم'] : []), 'عدد الأصناف', 'الإجمالي', 'إجراءات'],
    l.map(x => [x.id, x.date, esc(sale ? x.customer_name : x.supplier || '—'), ...(sale ? [bd(esc(x.method), 'b'), C('o', money(x.discount))] : []), x.n, C(sale ? 'g' : 'o', money(x.total)),
    `<button class="btn sm nv" data-v="${x.id}">عرض</button> <button class="btn sm rd" data-d="${x.id}">حذف</button>`]))}</div>`;
  $('#add').onclick = () => invoice(kind);
  $$('[data-v]').forEach(b => b.onclick = () => showInvoice(kind, b.dataset.v));
  $$('[data-d]').forEach(b => b.onclick = async () => { if (confirm('حذف الفاتورة؟ سيتم عكس أثرها على المخزون.')) { try { await J(`${kind}/${b.dataset.d}`, 'DELETE'); refresh('تم حذف الفاتورة') } catch (e) { toast(e.message, 1) } } });
};
P.sales = invList('sales'); P.purchases = invList('purchases');

P.reports = async v => {
  const d = new Date(), a0 = new Date(d.getFullYear(), d.getMonth(), 1).toLocaleDateString('sv');
  v.innerHTML = `<div class="card"><div class="bar"><label>من <input type="date" id="a" value="${a0}"></label><label>إلى <input type="date" id="b" value="${today()}"></label><button class="btn or" id="go">عرض التقرير</button><span class="grow"></span><button class="btn nv noprint" onclick="doPrint()">🖨️ طباعة</button></div></div><div id="rp"></div>`;
  const go = async () => {
    const r = await J(`report?from=${$('#a').value}&to=${$('#b').value}`);
    const cs = [['إجمالي المبيعات', r.sales, 'c1', '🧾'], ['إجمالي المشتريات', r.purchases, 'c2', '🛒'], ['الربح الإجمالي', r.gross, 'c3', '📊'], ['صافي الربح (بعد الخصومات)', r.net, 'c5', '💰'], ['قيمة المخزون', r.inv_value, 'c4', '📦']];
    $('#rp').innerHTML = `<div class="cards">${cs.map(c => `<div class="sc ${c[2]}"><div><small>${c[0]}</small><b>${money(c[1])}</b></div><i>${c[3]}</i></div>`).join('')}</div>
    <div class="card"><h4>الأرباح حسب المنتج</h4>${tbl(['المنتج', 'الكمية المباعة', 'المبيعات', 'التكلفة', 'الربح'], r.products.map(p => [C('n', esc(p.name)), num(p.qty), money(p.rev), C('o', money(p.cost)), C(p.rev >= p.cost ? 'g' : 'r', money(p.rev - p.cost))]))}</div>
    <div class="row2"><div class="card"><h4>المبيعات اليومية</h4>${tbl(['التاريخ', 'الفواتير', 'الخصومات', 'الإجمالي'], r.daily.map(x => [x.k, x.n, C('o', money(x.disc)), C('g', money(x.total))]))}</div>
    <div class="card"><h4>المبيعات الشهرية</h4>${tbl(['الشهر', 'الفواتير', 'المبيعات', 'المشتريات'], r.monthly.map(x => [MN[+x.k.slice(5) - 1] + ' ' + x.k.slice(0, 4), x.n, C('g', money(x.total)), C('o', money(x.bought))]))}</div></div>`;
  };
  $('#go').onclick = go; go();
};

const party = kind => async v => {
  const sup = kind === 'suppliers', T = sup ? 'مورد' : 'عميل';
  v.innerHTML = `<div class="card"><div class="bar"><span class="grow"><b>${S[kind].length}</b> ${sup ? 'مورد' : 'عميل'}</span><button class="btn or" id="add">＋ إضافة ${T} جديد</button></div>
  ${tbl(['#', 'الاسم', 'الهاتف', 'العنوان', 'ملاحظات', 'إجراءات'], S[kind].map((x, i) => [i + 1, C('n', esc(x.name)), esc(x.phone), esc(x.address), esc(x.notes),
    `<button class="btn sm yl" data-h="${x.id}">${sup ? 'سجل المشتريات' : 'سجل المبيعات'}</button> <button class="btn sm nv" data-e="${x.id}">تعديل</button> <button class="btn sm rd" data-d="${x.id}">حذف</button>`]))}</div>`;
  const form = (x = {}) => modal(x.id ? `تعديل ${T}` : `إضافة ${T} جديد`, `<form id="fm" class="grid2">${F('الاسم *', 'name', x.name, 'text', 'required')}${F('الهاتف', 'phone', x.phone)}${F('العنوان', 'address', x.address, 'text', '', 'full')}<label class="f full"><span>ملاحظات</span><textarea name="notes" rows="2">${esc(x.notes)}</textarea></label></form>`,
    { onOk: async () => { const d = vals($('#fm')); if (!d.name.trim()) throw Error('الاسم مطلوب'); if (x.id) d.id = x.id; await J(kind, 'POST', d); await refresh('تم الحفظ ✔') } });
  $('#add').onclick = () => form();
  $$('[data-e]').forEach(b => b.onclick = () => form(S[kind].find(x => x.id == b.dataset.e)));
  $$('[data-d]').forEach(b => b.onclick = async () => { if (confirm('حذف السجل؟')) { await J(`${kind}/${b.dataset.d}`, 'DELETE'); refresh('تم الحذف') } });
  $$('[data-h]').forEach(b => b.onclick = async () => {
    const x = S[kind].find(z => z.id == b.dataset.h), l = await J(`${sup ? 'purchases?supplier_id=' : 'sales?customer_id='}${x.id}`);
    modal(`${sup ? 'سجل المشتريات' : 'سجل المبيعات'} — ${esc(x.name)}`, tbl(['رقم', 'التاريخ', 'الأصناف', 'الإجمالي'], l.map(r => [r.id, r.date, r.n, C('g', money(r.total))]), `<tfoot><tr><td colspan="3">الإجمالي (${l.length} فاتورة)</td><td>${money(l.reduce((a, r) => a + r.total, 0))}</td></tr></tfoot>`), { wide: true });
  });
};
P.suppliers = party('suppliers'); P.customers = party('customers');

P.settings = v => {
  const s = S.set;
  v.innerHTML = `<div class="row2"><div class="card"><h4>إعدادات المكتبة</h4><form id="fm" class="grid2">${F('اسم المكتبة', 'name', s.name)}${F('العملة', 'currency', s.currency)}${F('الهاتف', 'phone', s.phone)}${F('العنوان', 'address', s.address)}${F('ذيل الفاتورة', 'footer', s.footer, 'text', '', 'full')}</form><br><button class="btn or" id="sv">حفظ الإعدادات</button></div>
  <div class="card"><h4>النسخ الاحتياطي والاستعادة</h4><p>جميع البيانات محفوظة في ملف <b>data/library.db</b> على هذا الجهاز.</p>
  <p><button class="btn nv" id="dl">⬇️ تنزيل نسخة احتياطية</button> <button class="btn yl" id="lc">💾 حفظ نسخة في مجلد backups</button></p>
  <p><label class="f"><span>استعادة من ملف نسخة احتياطية (.db) — سيتم استبدال البيانات الحالية</span><input type="file" id="rs" accept=".db"></label></p>
  <hr><p><button class="btn gh" id="dm">إضافة بيانات تجريبية (للقاعدة الفارغة فقط)</button></p></div></div>`;
  $('#sv').onclick = async () => { await J('settings', 'POST', vals($('#fm'))); await refresh('تم حفظ الإعدادات ✔'); renderShell() };
  $('#dl').onclick = async () => { const b = await (await api('backup')).blob(), a = document.createElement('a'); a.href = URL.createObjectURL(b); a.download = `library-backup-${today()}.db`; a.click() };
  $('#lc').onclick = async () => { const r = await J('backup/local'); toast('تم الحفظ: ' + r.path) };
  $('#rs').onchange = async e => { const f = e.target.files[0]; if (f && confirm('سيتم استبدال كل البيانات الحالية بهذه النسخة. متابعة؟')) { try { await api('restore', 'POST', null, await f.arrayBuffer()); await refresh('تمت استعادة البيانات ✔') } catch (x) { toast(x.message, 1) } } };
  $('#dm').onclick = async () => { try { await J('demo', 'POST'); await refresh('تمت إضافة البيانات التجريبية'); location.hash = 'dashboard' } catch (x) { toast(x.message, 1) } };
};

/* ---------- الهيكل والتوجيه ---------- */
function renderShell() {
  $('#side').innerHTML = `<div class="logo"><i>📚</i><b>${esc(S.set.name)}<small>نظام المحاسبة</small></b></div>` + NAV.map(n => `<a href="#${n[0]}" data-k="${n[0]}"><span>${n[2]}</span><b>${n[1]}</b></a>`).join('') + `<div class="foot">يعمل دون إنترنت • البيانات محلية</div>`;
  $('#date').textContent = new Date().toLocaleDateString('ar-EG', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
}
async function route() {
  const k = location.hash.slice(1) in P ? location.hash.slice(1) : 'dashboard';
  $$('#side a').forEach(a => a.classList.toggle('on', a.dataset.k === k));
  $('#title').textContent = NAV.find(n => n[0] === k)[1];
  try { await P[k]($('#view')) } catch (e) { $('#view').innerHTML = `<div class="card">تعذر تحميل الصفحة: ${esc(e.message)}</div>` }
}
$('#qp').onclick = () => productForm(); $('#qs').onclick = () => invoice('sales');
addEventListener('hashchange', route);
(async () => { await load(); renderShell(); await route() })();
