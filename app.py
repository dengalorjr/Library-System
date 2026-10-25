# -*- coding: utf-8 -*-
"""نظام محاسبة المكتبة والقرطاسية - يعمل بالكامل دون إنترنت (Python + SQLite فقط)."""
import sqlite3, json, os, sys, shutil, webbrowser, threading, datetime, random, mimetypes, tempfile
from http.server import ThreadingHTTPServer, BaseHTTPRequestHandler
from urllib.parse import urlparse, parse_qs

if sys.stdout is None: sys.stdout = sys.stderr = open(os.devnull, 'w')   # وضع بدون شاشة أوامر
FROZEN = getattr(sys, 'frozen', False)
BASE = getattr(sys, '_MEIPASS', os.path.dirname(os.path.abspath(__file__)))
# عند التشغيل كبرنامج (exe) تُحفظ البيانات في مجلد المستخدم ليتمكن من الكتابة دائماً
DATA = os.path.join(os.environ.get('APPDATA') or os.path.expanduser('~'), 'LibrarySystem') if FROZEN else os.path.dirname(os.path.abspath(__file__))
DB = os.path.join(DATA, 'data', 'library.db')
STATIC = os.path.join(BASE, 'static')
BK = os.path.join(DATA, 'backups')
os.makedirs(os.path.dirname(DB), exist_ok=True); os.makedirs(BK, exist_ok=True)

SCHEMA = """
create table if not exists settings(k text primary key, v text);
create table if not exists suppliers(id integer primary key, name text not null, phone text, address text, notes text);
create table if not exists customers(id integer primary key, name text not null, phone text, address text, notes text);
create table if not exists products(id integer primary key, name text not null, category text, sku text,
  buy_price real default 0, sell_price real default 0, qty real default 0, min_qty real default 0,
  supplier_id integer, notes text, image text);
create table if not exists sales(id integer primary key, date text, customer_id integer, customer_name text,
  discount real default 0, total real default 0, method text, notes text);
create table if not exists sale_items(id integer primary key, sale_id integer references sales(id) on delete cascade,
  product_id integer, name text, qty real, price real, cost real);
create table if not exists purchases(id integer primary key, date text, supplier_id integer, total real default 0, notes text);
create table if not exists purchase_items(id integer primary key, purchase_id integer references purchases(id) on delete cascade,
  product_id integer, name text, qty real, price real);
create index if not exists ix_sales_date on sales(date);
create index if not exists ix_purch_date on purchases(date);
"""
DEFAULTS = {'name': 'مكتبة المعلم', 'currency': 'ج.م', 'phone': '', 'address': '', 'footer': 'شكراً لتعاملكم معنا'}
COLS = {
    'products': ['name', 'category', 'sku', 'buy_price', 'sell_price', 'qty', 'min_qty', 'supplier_id', 'notes', 'image'],
    'suppliers': ['name', 'phone', 'address', 'notes'],
    'customers': ['name', 'phone', 'address', 'notes']}
NUMS = {'buy_price', 'sell_price', 'qty', 'min_qty'}


def db():
    c = sqlite3.connect(DB); c.row_factory = sqlite3.Row
    c.execute('pragma foreign_keys=on'); c.executescript(SCHEMA)
    return c

def rows(c, sql, a=()): return [dict(r) for r in c.execute(sql, a)]
def one(c, sql, a=()): return c.execute(sql, a).fetchone()[0] or 0
def today(): return datetime.date.today().isoformat()


def save_invoice(c, kind, d):
    sale = kind == 'sales'
    items = [i for i in d.get('items', []) if i.get('product_id') and float(i.get('qty') or 0) > 0]
    if not items: raise ValueError('أضف منتجاً واحداً على الأقل')
    gross = sum(float(i['qty']) * float(i['price'] or 0) for i in items)
    disc = float(d.get('discount') or 0) if sale else 0
    if disc < 0 or disc > gross: raise ValueError('قيمة الخصم غير صحيحة')
    date = d.get('date') or today()
    if sale:
        cur = c.execute('insert into sales(date,customer_id,customer_name,discount,total,method,notes) values(?,?,?,?,?,?,?)',
                        (date, d.get('customer_id') or None, d.get('customer_name') or 'عميل نقدي', disc, gross - disc, d.get('method') or 'نقدي', d.get('notes')))
    else:
        cur = c.execute('insert into purchases(date,supplier_id,total,notes) values(?,?,?,?)',
                        (date, d.get('supplier_id') or None, gross, d.get('notes')))
    iid = cur.lastrowid
    for i in items:
        p = c.execute('select * from products where id=?', (i['product_id'],)).fetchone()
        if not p: raise ValueError('منتج غير موجود')
        q, pr = float(i['qty']), float(i['price'] or 0)
        if sale:
            if q > p['qty']: raise ValueError('الكمية المتاحة من «%s» هي %g فقط' % (p['name'], p['qty']))
            c.execute('update products set qty=qty-? where id=?', (q, p['id']))
            c.execute('insert into sale_items(sale_id,product_id,name,qty,price,cost) values(?,?,?,?,?,?)',
                      (iid, p['id'], p['name'], q, pr, p['buy_price']))
        else:
            c.execute('update products set qty=qty+?, buy_price=? where id=?', (q, pr, p['id']))
            c.execute('insert into purchase_items(purchase_id,product_id,name,qty,price) values(?,?,?,?,?)',
                      (iid, p['id'], p['name'], q, pr))
    return iid


def delete_invoice(c, kind, iid):
    if kind == 'sales':
        for i in c.execute('select * from sale_items where sale_id=?', (iid,)).fetchall():
            c.execute('update products set qty=qty+? where id=?', (i['qty'], i['product_id']))
        c.execute('delete from sales where id=?', (iid,))
    else:
        for i in c.execute('select * from purchase_items where purchase_id=?', (iid,)).fetchall():
            c.execute('update products set qty=qty-? where id=?', (i['qty'], i['product_id']))
        c.execute('delete from purchases where id=?', (iid,))


def dashboard(c):
    sales = one(c, 'select sum(total) from sales'); purchases = one(c, 'select sum(total) from purchases')
    cogs = one(c, 'select sum(qty*cost) from sale_items')
    today_d = datetime.date.today(); months = []
    y, m = today_d.year, today_d.month
    for _ in range(6):
        months.insert(0, '%04d-%02d' % (y, m)); m -= 1
        if m == 0: y, m = y - 1, 12
    def by(sql): return {r['k']: r['v'] for r in c.execute(sql)}
    ms = by('select substr(date,1,7) k,sum(total) v from sales group by k')
    mp = by('select substr(date,1,7) k,sum(total) v from purchases group by k')
    ml = by('select substr(s.date,1,7) k,sum(i.qty*(i.price-i.cost)) v from sale_items i join sales s on s.id=i.sale_id group by k')
    md = by('select substr(date,1,7) k,sum(discount) v from sales group by k')
    days = [(today_d - datetime.timedelta(days=n)).isoformat() for n in range(13, -1, -1)]
    do = by('select s.date k,sum(i.qty) v from sale_items i join sales s on s.id=i.sale_id group by k')
    di = by('select p.date k,sum(i.qty) v from purchase_items i join purchases p on p.id=i.purchase_id group by k')
    return {
        'sales': sales, 'purchases': purchases, 'net': sales - cogs,
        'inv_value': one(c, 'select sum(qty*buy_price) from products'), 'total_qty': one(c, 'select sum(qty) from products'),
        'low': rows(c, 'select id,name,category,qty,min_qty from products where qty<=min_qty order by qty limit 12'),
        'months': [{'m': k, 'sales': ms.get(k) or 0, 'purchases': mp.get(k) or 0, 'profit': (ml.get(k) or 0) - (md.get(k) or 0)} for k in months],
        'days': [{'d': k, 'in': di.get(k) or 0, 'out': do.get(k) or 0} for k in days],
        'top': rows(c, 'select name,sum(qty) qty from sale_items group by product_id,name order by qty desc limit 6')}


def report(c, a, b):
    sales = one(c, 'select sum(total) from sales where date between ? and ?', (a, b))
    disc = one(c, 'select sum(discount) from sales where date between ? and ?', (a, b))
    cogs = one(c, 'select sum(i.qty*i.cost) from sale_items i join sales s on s.id=i.sale_id where s.date between ? and ?', (a, b))
    return {
        'sales': sales, 'discount': disc, 'cogs': cogs, 'gross': sales + disc - cogs, 'net': sales - cogs,
        'purchases': one(c, 'select sum(total) from purchases where date between ? and ?', (a, b)),
        'inv_value': one(c, 'select sum(qty*buy_price) from products'),
        'products': rows(c, '''select i.name,sum(i.qty) qty,sum(i.qty*i.price) rev,sum(i.qty*i.cost) cost from sale_items i
            join sales s on s.id=i.sale_id where s.date between ? and ? group by i.product_id,i.name order by rev desc''', (a, b)),
        'daily': rows(c, 'select date k,count(*) n,sum(total) total,sum(discount) disc from sales where date between ? and ? group by date order by date desc', (a, b)),
        'monthly': rows(c, '''select substr(s.date,1,7) k,count(*) n,sum(total) total,sum(discount) disc,
            (select sum(purchases.total) from purchases where substr(purchases.date,1,7)=substr(s.date,1,7)) bought
            from sales s group by k order by k desc''')}


def demo(c):
    if one(c, 'select count(*) from products'): raise ValueError('توجد منتجات بالفعل - البيانات التجريبية للقاعدة الفارغة فقط')
    for n in ('مكتبة الأمل للتوريدات', 'شركة النيل للورق'): c.execute('insert into suppliers(name,phone) values(?,?)', (n, '0100000000'))
    for n in ('أحمد محمود', 'مدرسة الشروق', 'سارة علي'): c.execute('insert into customers(name,phone) values(?,?)', (n, '0111111111'))
    P = [('كراسة 60 ورقة', 'كراريس', 4, 7, 5), ('كراسة 100 ورقة', 'كراريس', 7, 12, 5), ('قلم حبر أزرق', 'أقلام', 2, 4, 20),
         ('قلم رصاص HB', 'أقلام', 1, 2.5, 20), ('علبة ألوان خشبية', 'أدوات مدرسية', 25, 40, 5), ('ورق A4 (رزمة)', 'ورق', 140, 175, 4),
         ('ملف بلاستيك', 'ملفات', 3, 6, 15), ('حقيبة مدرسية', 'أدوات مدرسية', 120, 190, 3), ('دباسة مكتبية', 'مكتبية', 30, 50, 4),
         ('مسطرة 30 سم', 'أدوات مدرسية', 2, 5, 10), ('ممحاة', 'أدوات مدرسية', 1, 2, 15), ('لاصق شفاف', 'مكتبية', 6, 11, 8)]
    for i, (n, cat, b, s, mn) in enumerate(P, 1):
        c.execute('insert into products(name,category,sku,buy_price,sell_price,qty,min_qty,supplier_id) values(?,?,?,?,?,0,?,?)',
                  (n, cat, 'SKU%04d' % i, b, s, mn, 1 + i % 2))
    ids = [r[0] for r in c.execute('select id from products')]
    start = datetime.date.today() - datetime.timedelta(days=75)
    for w in range(0, 75, 15):
        d = (start + datetime.timedelta(days=w)).isoformat()
        save_invoice(c, 'purchases', {'date': d, 'supplier_id': 1 + w % 2, 'items': [
            {'product_id': p, 'qty': random.randint(40, 90), 'price': P[p - 1][2]} for p in ids]})
    random.seed(7)
    for n in range(75):
        d = (start + datetime.timedelta(days=n)).isoformat()
        for _ in range(random.randint(0, 3)):
            its = [{'product_id': p, 'qty': random.randint(1, 4), 'price': P[p - 1][3]} for p in random.sample(ids, random.randint(1, 4))]
            try: save_invoice(c, 'sales', {'date': d, 'customer_name': random.choice(['عميل نقدي', 'أحمد محمود', 'مدرسة الشروق']),
                                           'method': random.choice(['نقدي', 'نقدي', 'بطاقة', 'تحويل بنكي']), 'items': its,
                                           'discount': random.choice([0, 0, 0, 2])})
            except ValueError: pass
    c.execute('update products set qty=3 where id in (3,8)'); c.execute('update products set qty=0 where id=11')


def snapshot(path):
    s = sqlite3.connect(DB); t = sqlite3.connect(path); s.backup(t); t.close(); s.close()


def api(m, p, q, body):
    c = db()
    try:
        t = p[0] if p else ''
        if t in COLS:
            if m == 'GET':
                if t == 'products':
                    return rows(c, 'select p.*,s.name supplier from products p left join suppliers s on s.id=p.supplier_id order by p.id desc')
                return rows(c, 'select * from %s order by id desc' % t)
            if m == 'POST':
                cols = COLS[t]; vals = []
                for k in cols:
                    v = body.get(k)
                    if k in NUMS: v = float(v or 0)
                    elif k == 'supplier_id': v = int(v) if v not in (None, '') else None
                    vals.append(v)
                if not (body.get('name') or '').strip(): raise ValueError('الاسم مطلوب')
                if body.get('id'): c.execute('update %s set %s where id=?' % (t, ','.join(k + '=?' for k in cols)), vals + [body['id']])
                else: c.execute('insert into %s(%s) values(%s)' % (t, ','.join(cols), ','.join('?' * len(cols))), vals)
                c.commit(); return {'ok': 1}
            if m == 'DELETE': c.execute('delete from %s where id=?' % t, (p[1],)); c.commit(); return {'ok': 1}
        if t in ('sales', 'purchases'):
            sale = t == 'sales'
            if m == 'GET' and len(p) > 1:
                r = dict(c.execute('select * from %s where id=?' % t, (p[1],)).fetchone())
                r['items'] = rows(c, 'select * from %s_items where %s_id=?' % (t[:-1], t[:-1]), (p[1],)); return r
            if m == 'GET':
                if sale:
                    w, a = ('where customer_id=?', (q['customer_id'][0],)) if 'customer_id' in q else ('', ())
                    return rows(c, 'select s.*,(select count(*) from sale_items where sale_id=s.id) n from sales s %s order by date desc,id desc' % w, a)
                w, a = ('where p.supplier_id=?', (q['supplier_id'][0],)) if 'supplier_id' in q else ('', ())
                return rows(c, '''select p.*,s.name supplier,(select count(*) from purchase_items where purchase_id=p.id) n from purchases p
                    left join suppliers s on s.id=p.supplier_id %s order by date desc,p.id desc''' % w, a)
            if m == 'POST': i = save_invoice(c, t, body); c.commit(); return {'id': i}
            if m == 'DELETE': delete_invoice(c, t, p[1]); c.commit(); return {'ok': 1}
        if t == 'dashboard': return dashboard(c)
        if t == 'report': return report(c, q.get('from', ['0000'])[0], q.get('to', ['9999'])[0])
        if t == 'settings':
            if m == 'POST':
                for k, v in body.items(): c.execute('insert or replace into settings values(?,?)', (k, str(v)))
                c.commit()
            s = dict(DEFAULTS); s.update({r['k']: r['v'] for r in c.execute('select * from settings')}); return s
        if t == 'demo': demo(c); c.commit(); return {'ok': 1}
        if t == 'backup':
            f = os.path.join(BK, 'backup-%s.db' % datetime.datetime.now().strftime('%Y%m%d-%H%M%S'))
            if len(p) > 1 and p[1] == 'local': snapshot(f); return {'path': f}
            tmp = os.path.join(tempfile.gettempdir(), 'lib-dl.db'); snapshot(tmp)
            return ('file', open(tmp, 'rb').read(), 'library-backup-%s.db' % today())
        if t == 'restore' and m == 'POST':
            if not isinstance(body, bytes) or not body.startswith(b'SQLite format 3\x00'): raise ValueError('الملف ليس نسخة احتياطية صالحة')
            snapshot(os.path.join(BK, 'before-restore-%s.db' % datetime.datetime.now().strftime('%Y%m%d-%H%M%S')))
            c.close(); open(DB, 'wb').write(body); return {'ok': 1}
        raise LookupError('غير موجود')
    except Exception:
        c.rollback(); raise
    finally:
        try: c.close()
        except Exception: pass


class H(BaseHTTPRequestHandler):
    def log_message(self, *a): pass
    def out(self, code, body, ct='application/json; charset=utf-8', extra=None):
        if not isinstance(body, bytes): body = json.dumps(body, ensure_ascii=False).encode('utf-8')
        self.send_response(code); self.send_header('Content-Type', ct); self.send_header('Content-Length', str(len(body)))
        for k, v in (extra or {}).items(): self.send_header(k, v)
        self.end_headers(); self.wfile.write(body)
    def go(self, m):
        u = urlparse(self.path); parts = [x for x in u.path.split('/') if x]
        if parts and parts[0] == 'api':
            try:
                n = int(self.headers.get('Content-Length') or 0); raw = self.rfile.read(n) if n else b''
                body = raw if 'octet' in (self.headers.get('Content-Type') or '') else (json.loads(raw) if raw else {})
                r = api(m, parts[1:], parse_qs(u.query), body)
                if isinstance(r, tuple): return self.out(200, r[1], 'application/octet-stream', {'Content-Disposition': 'attachment; filename=' + r[2]})
                return self.out(200, r)
            except (ValueError, LookupError, KeyError, TypeError) as e: return self.out(400, {'error': str(e) or 'بيانات غير صحيحة'})
            except Exception as e: return self.out(500, {'error': 'خطأ داخلي: %s' % e})
        f = os.path.normpath(os.path.join(STATIC, (u.path.lstrip('/') or 'index.html')))
        if not f.startswith(STATIC) or not os.path.isfile(f): return self.out(404, b'not found', 'text/plain')
        ct = mimetypes.guess_type(f)[0] or 'application/octet-stream'
        self.out(200, open(f, 'rb').read(), ct + ('; charset=utf-8' if ct.startswith('text') or 'javascript' in ct else ''))
    def do_GET(self): self.go('GET')
    def do_POST(self): self.go('POST')
    def do_DELETE(self): self.go('DELETE')


def open_window(url):
    """نافذة مستقلة: pywebview أولاً، ثم وضع التطبيق في Edge/Chrome كبديل."""
    try:
        import webview
        webview.settings['ALLOW_DOWNLOADS'] = True
        webview.create_window('نظام محاسبة المكتبة والقرطاسية', url, width=1366, height=820, min_size=(980, 600), resizable=True)
        webview.start(); return
    except Exception: pass
    import subprocess
    pf = [os.environ.get(k, '') for k in ('PROGRAMFILES(X86)', 'PROGRAMFILES', 'LOCALAPPDATA')]
    for rel in ('Microsoft/Edge/Application/msedge.exe', 'Google/Chrome/Application/chrome.exe'):
        for b in pf:
            exe = os.path.join(b, rel)
            if b and os.path.isfile(exe):
                subprocess.Popen([exe, '--app=' + url, '--window-size=1366,820', '--user-data-dir=' + os.path.join(DATA, 'profile')]).wait(); return
    webbrowser.open(url); threading.Event().wait()


if __name__ == '__main__':
    mimetypes.add_type('font/ttf', '.ttf'); mimetypes.add_type('application/javascript', '.js')
    db().close()
    for port in range(8765, 8785):
        try: srv = ThreadingHTTPServer(('127.0.0.1', port), H); break
        except OSError: continue
    url = 'http://127.0.0.1:%d' % port
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    print('running on', url)
    try:
        if '--no-browser' in sys.argv: threading.Event().wait()
        else: open_window(url)
    except KeyboardInterrupt: pass
