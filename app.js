(() => {
'use strict'; // strict mode + everything inside this wrapper: nothing is reachable from the browser console
    /* ================= CONFIG: edit these values for your cafe ================= */
    const WHATSAPP = '917306880738';           // WhatsApp number, country code + number, no + or spaces. All orders/bookings go here.
    const IG_URL   = 'https://www.instagram.com/'; // Put your Instagram page link here
    const OPEN_HOUR = 9, CLOSE_HOUR = 22;       // Opening hours (24h clock): 9 = 9 am, 22 = 10 pm
    const OFFER_TEXT = 'Free delivery on orders above ₹800. Edit this offer text in the script.'; // Empty text hides the bar

    /* ===== PAYMENT + SECURITY SETTINGS ===== */
    const UPI_ID   = '7306880738@ptyes';   // Your UPI ID. Payments go here. Never put it anywhere else.
    const UPI_NAME = 'Ryanto Cafe';        // Name shown in the UPI app
    const isHttps  = location.protocol === 'https:' || location.hostname === 'localhost'; // UPI works only on the secure live site
    const isMobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
    const upiOk    = isHttps && /^[a-z0-9._-]{2,64}@[a-z]{2,32}$/i.test(UPI_ID);        // UPI ID format check
    let orderRef = null, upiStarted = false;                                          // reference code for matching a payment to an order

    /* SANITIZE: removes control characters and < > from anything typed by a customer, and limits its length */
    const clean = (v, max) => String(v).replace(/[\u0000-\u001F\u007F<>]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
    /* Safe element builder: uses textContent (never innerHTML) so text can never run as code */
    const el = (tag, text, cls) => { const n = document.createElement(tag); if (text != null) n.textContent = text; if (cls) n.className = cls; return n; };

    /* Shortcut: find an element by id */
    const $ = id => document.getElementById(id);
    const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
    const header = $('header'), progress = $('progress'), heroMedia = $('heroMedia'), heroBody = $('heroBody');
    const pin = $('featured'), stageInfo = $('stageInfo'), storyImg = $('storyImg');
    const menuToggle = $('menuToggle'), navLinks = $('navLinks');
    const orderSummary = $('orderSummary'), scrim = $('scrim'), cartItems = $('cartItems');
    const cartCount = $('cartCount'), navCount = $('navCount'), cartTotal = $('cartTotal'), toast = $('toast');
    const cart = new Map();
    let toastTimer;

    /* ================= LOAD SEQUENCE: adds class 'loaded' to start hero animations ================= */
    addEventListener('load', () => requestAnimationFrame(() => document.body.classList.add('loaded')));
    setTimeout(() => document.body.classList.add('loaded'), 1500);

    /* ================= SCROLL MOTION: runs on every scroll (via requestAnimationFrame for smoothness) ================= */
    let lastY = 0, ticking = false;
    const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
    const ease = t => 1 - Math.pow(1 - t, 3);
    function frame() {
      ticking = false;
      const y = scrollY, vh = innerHeight;
      progress.style.transform = `scaleX(${clamp(y / (document.documentElement.scrollHeight - vh))})`;
      header.classList.toggle('solid', y > 40);
      header.classList.toggle('hide', y > lastY && y > 300 && !navLinks.classList.contains('open'));
      lastY = y;
      if (!reduce) {
        if (y < vh * 1.2) {
          heroMedia.style.transform = `translate3d(0,${y * .28}px,0)`;
          heroBody.style.transform = `translate3d(0,${y * -.12}px,0)`;
          heroBody.style.opacity = clamp(1 - y / (vh * .75));
        }
        const r = pin.getBoundingClientRect();
        const p = ease(clamp(-r.top / (r.height - vh) * 1.6));
        pin.style.setProperty('--p', p.toFixed(4));
        stageInfo.classList.toggle('on', p > .8);
        const s = storyImg.parentElement.getBoundingClientRect();
        if (s.bottom > 0 && s.top < vh) storyImg.style.transform = `translate3d(0,${(s.top / vh - .3) * -60}px,0)`;
      } else { pin.style.setProperty('--p', 1); stageInfo.classList.add('on'); }
    }
    addEventListener('scroll', () => { if (!ticking) { ticking = true; requestAnimationFrame(frame); } }, { passive: true });
    addEventListener('resize', frame);
    frame();

    /* ================= REVEAL: adds class 'in' when an element enters the screen ================= */
    const io = new IntersectionObserver(es => es.forEach(e => { if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); } }), { threshold: .15, rootMargin: '0px 0px -6% 0px' });
    document.querySelectorAll('.rv').forEach(el => io.observe(el));

    /* ================= MOBILE NAVIGATION: opens/closes the full-screen menu ================= */
    function setNav(open) {
      navLinks.classList.toggle('open', open);
      menuToggle.setAttribute('aria-expanded', String(open));
      menuToggle.setAttribute('aria-label', open ? 'Close navigation' : 'Open navigation');
      menuToggle.textContent = open ? '×' : '☰';
    }
    menuToggle.addEventListener('click', () => setNav(!navLinks.classList.contains('open')));
    navLinks.querySelectorAll('a').forEach(a => a.addEventListener('click', () => setNav(false)));

    /* ================= ORDER DRAWER: open/close, cart totals, list rendering ================= */
    function drawer(open) { orderSummary.classList.toggle('open', open); scrim.classList.toggle('on', open); if (open) setNav(false); }
    $('openCart').addEventListener('click', () => drawer(true));
    $('closeCart').addEventListener('click', () => drawer(false));
    scrim.addEventListener('click', () => drawer(false));
    addEventListener('keydown', e => { if (e.key === 'Escape') drawer(false); });

    const money = v => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(v);
    function showToast(msg) {
      toast.textContent = msg; toast.classList.add('show');
      clearTimeout(toastTimer); toastTimer = setTimeout(() => toast.classList.remove('show'), 2600);
    }
    function renderCart() {
      const qty = [...cart.values()].reduce((s, i) => s + i.quantity, 0);
      const total = [...cart.values()].reduce((s, i) => s + i.price * i.quantity, 0);
      orderRef = null; upiStarted = false; if (upiOk) $('payNote').textContent = ''; // cart changed: new reference needed
      cartCount.textContent = navCount.textContent = qty;
      cartTotal.textContent = money(total);
      if (!cart.size) { cartItems.innerHTML = '<p>Your order is empty. Add a favourite from the menu.</p>'; return; }
      cartItems.replaceChildren();
      cart.forEach((item, name) => {
        const row = document.createElement('div'); row.className = 'line';
        const d = document.createElement('span'); d.textContent = `${item.name} × ${item.quantity} — ${money(item.price * item.quantity)}`;
        const rm = document.createElement('button'); rm.type = 'button'; rm.textContent = 'Remove'; rm.setAttribute('aria-label', `Remove ${item.name}`);
        rm.addEventListener('click', () => { cart.delete(name); renderCart(); showToast(`${name} removed from your order.`); });
        row.append(d, rm); cartItems.append(row);
      });
    }
    /* ADD TO ORDER: only the dish NAME is read from the button. The price always comes from the locked PRICES list. */
    document.addEventListener('click', e => {
      const b = e.target.closest('.add-to-cart');
      if (!b || !PRICES.has(b.dataset.name)) return;
      const name = b.dataset.name, cur = cart.get(name);
      cart.set(name, { name, price: PRICES.get(name), quantity: cur ? Math.min(cur.quantity + 1, 20) : 1 });
      renderCart(); showToast(`${name} added to your order.`);
    });

    /* SEND TO WHATSAPP: opens WhatsApp chat with the cafe number and a ready-written message */
    function sendWhatsApp(message) {
      window.open(`https://wa.me/${WHATSAPP}?text=${encodeURIComponent(message)}`, '_blank', 'noopener');
    }

    /* ORDER TOTAL: recalculated from the locked price list every time (cannot be faked from the page) */
    const orderTotal = () => [...cart.values()].reduce((s, i) => s + PRICES.get(i.name) * Math.min(i.quantity, 20), 0);
    /* ORDER REFERENCE: random code like RYN-4K9Z, so you can match a UPI payment to an order */
    function ensureRef() {
      if (!orderRef) { const a = crypto.getRandomValues(new Uint8Array(4)); orderRef = 'RYN-' + [...a].map(x => (x % 36).toString(36)).join('').toUpperCase(); }
      return orderRef;
    }
    /* CHECK ORDER: cart must have items and a name */
    function checkOrder() {
      if (!cart.size) { showToast('Add an item to your order first.'); return null; }
      const name = clean($('custName').value, 60);
      if (!name) { showToast('Please enter your name.'); $('custName').focus(); return null; }
      return name;
    }

    /* PAY WITH UPI: opens the UPI app with your ID and the exact total. On a computer it copies the UPI ID instead. */
    if (!upiOk) { $('upiButton').disabled = true; $('payNote').textContent = 'UPI payment works on the secure live website (https). You can still send your order on WhatsApp.'; }
    $('upiButton').addEventListener('click', () => {
      if (!upiOk || !checkOrder()) return;
      const total = orderTotal(), ref = ensureRef();
      upiStarted = true;
      $('payNote').textContent = `Pay ${money(total)} to ${UPI_ID} with the note ${ref}. Then tap “Send order on WhatsApp” and attach your payment screenshot.`;
      const link = `upi://pay?pa=${encodeURIComponent(UPI_ID)}&pn=${encodeURIComponent(UPI_NAME)}&am=${total.toFixed(2)}&cu=INR&tn=${encodeURIComponent('Order ' + ref)}`;
      if (isMobile) location.href = link; else copyText(UPI_ID, 'UPI ID copied. Pay from your phone.');
    });

    /* CHECKOUT: writes the order (items, total, reference, payment status) and sends it on WhatsApp */
    $('checkoutButton').addEventListener('click', () => {
      const name = checkOrder(); if (!name) return;
      const lines = [...cart.values()].map(i => `• ${i.name} × ${i.quantity} — ${money(PRICES.get(i.name) * i.quantity)}`);
      const note = clean($('custNote').value, 160);
      sendWhatsApp(['Hello Ryanto Cafe! I would like to place an order.', '', `Order ref: ${ensureRef()}`, `Name: ${name}`, `Order type: ${$('custType').value}`, '', 'Items:', ...lines, '', `Total: ${money(orderTotal())}`,
        upiStarted ? 'Payment: UPI (screenshot attached)' : 'Payment: Pay at cafe / on delivery', note ? `Note: ${note}` : ''].filter(Boolean).join('\n'));
    });
    /* Copy: only numbers and links are copyable */
    function copyText(text, msg) {
      const done = () => showToast(msg);
      if (navigator.clipboard && window.isSecureContext) { navigator.clipboard.writeText(text).then(done, done); return; }
      const t = document.createElement('textarea'); t.value = text; t.style.cssText = 'position:fixed;opacity:0';
      document.body.append(t); t.select(); try { document.execCommand('copy'); } catch (e) {} t.remove(); done();
    }
    document.querySelectorAll('[data-copy]').forEach(b => b.addEventListener('click', () => copyText(b.dataset.copy, 'Copied.')));
    document.querySelectorAll('[data-copy-href]').forEach(b => b.addEventListener('click', () => copyText($(b.dataset.copyHref).href, 'Map link copied.')));
    document.addEventListener('copy', e => {
      const sel = getSelection();
      if (e.target.closest && e.target.closest('input,textarea,select')) return; // typing fields can always copy
      if (!sel || sel.isCollapsed) return;
      const n = sel.anchorNode && (sel.anchorNode.nodeType === 1 ? sel.anchorNode : sel.anchorNode.parentElement);
      if (!n || !n.closest('a, .copyable')) e.preventDefault();
    });
    document.addEventListener('dragstart', e => { if (e.target.tagName === 'IMG') e.preventDefault(); });

    /* ================= MENU DATA: edit/add dishes here. cat = tab name, img = key from IMAGES (leave null for a plain card) ================= */
    const IMAGES = {
      sushi: 'https://images.unsplash.com/photo-1579871494447-9811cf80d66c',
      bowl:  'https://images.unsplash.com/photo-1512621776951-a57141f2eefd',
      salmon:'https://images.unsplash.com/photo-1519708227418-c8fd9a32b7a2',
      latte: 'https://images.unsplash.com/photo-1461023058943-07fcbe16d735'
    };
    const MENU = [
      { cat: 'Bowls',    name: 'Herb Crusted Salmon Bowl', desc: 'Fresh salmon, greens, quinoa, avocado and lemon herb dressing.', price: 650, img: 'salmon' },
      { cat: 'Bowls',    name: 'Teriyaki Salmon Bowl',     desc: 'Grilled salmon, fragrant rice, fresh veggies, and house-made teriyaki sauce.', price: 590, img: 'bowl' },
      { cat: 'Bowls',    name: 'Garden Veggie Bowl',       desc: 'Roasted vegetables, quinoa, hummus and a lemon tahini drizzle.', price: 420, img: 'bowl' },
      { cat: 'Sushi',    name: 'Salmon Sushi',             desc: 'Freshly sliced salmon, seasoned rice, and a touch of wasabi.', price: 480, img: 'sushi' },
      { cat: 'Sushi',    name: 'Avocado Roll',             desc: 'Creamy avocado and cucumber rolled in seasoned rice with sesame.', price: 360, img: 'sushi' },
      { cat: 'Drinks',   name: 'Iced Vanilla Latte',       desc: 'Smooth espresso, cold milk, and a hint of vanilla.', price: 220, img: 'latte' },
      { cat: 'Drinks',   name: 'Classic Cappuccino',       desc: 'Double espresso with silky steamed milk.', price: 180, img: 'latte' },
      { cat: 'Drinks',   name: 'Fresh Lime Soda',          desc: 'Fresh lime and mint over ice, topped with soda.', price: 120, img: null },
      { cat: 'Desserts', name: 'Warm Chocolate Brownie',   desc: 'Fudgy brownie served warm with vanilla ice cream.', price: 240, img: null },
      { cat: 'Desserts', name: 'Classic Tiramisu',         desc: 'Espresso-soaked layers with mascarpone cream.', price: 280, img: null }
    ];

    Object.freeze(IMAGES); Object.freeze(MENU); MENU.forEach(Object.freeze); // locked: prices cannot be edited at runtime
    const PRICES = new Map(MENU.map(m => [m.name, m.price])); // the ONLY source of prices used for totals and payments

    /* ================= MENU RENDER + CATEGORY TABS: builds the tab buttons and the cards, filters on click ================= */
    const tabsEl = $('tabs'), gridEl = $('menuGrid');
    const categories = ['All', ...new Set(MENU.map(m => m.cat))];
    function renderMenu(cat) {
      tabsEl.querySelectorAll('.tab').forEach(t => t.setAttribute('aria-selected', String(t.dataset.cat === cat)));
      gridEl.replaceChildren();
      MENU.filter(m => cat === 'All' || m.cat === cat).forEach((m, i) => {
        const card = el('article', null, 'card pop'); card.style.setProperty('--d', `${i * 0.07}s`);
        const pic = el('div', null, 'pic');
        if (m.img) { const im = el('img'); im.src = `${IMAGES[m.img]}?auto=format&fit=crop&w=900&q=85`; im.alt = m.name; im.loading = 'lazy'; pic.append(im); }
        else { const ph = el('div', m.name[0], 'ph'); ph.setAttribute('aria-hidden', 'true'); pic.append(ph); }
        const row = el('div', null, 'row'); const btn = el('button', 'Add to order', 'btn sm add-to-cart'); btn.type = 'button'; btn.dataset.name = m.name;
        row.append(el('span', money(m.price), 'price'), btn);
        card.append(pic, el('small', m.cat), el('h3', m.name), el('p', m.desc), row);
        gridEl.append(card);
      });
    }
    categories.forEach(c => {
      const t = document.createElement('button');
      t.className = 'tab'; t.type = 'button'; t.dataset.cat = c; t.textContent = c; t.setAttribute('role', 'tab');
      t.addEventListener('click', () => renderMenu(c));
      tabsEl.append(t);
    });
    renderMenu('All');

    /* ================= OFFERS BAR: shows OFFER_TEXT; the x button hides it and moves the header back up ================= */
    function hideOffer() { $('offerBar').classList.add('gone'); document.documentElement.style.setProperty('--bar', '0px'); }
    if (OFFER_TEXT) $('offerText').textContent = OFFER_TEXT; else hideOffer();
    $('offerClose').addEventListener('click', hideOffer);

    /* ================= INSTAGRAM: points every gallery tile to IG_URL ================= */
    document.querySelectorAll('[data-ig]').forEach(a => a.href = IG_URL);

    /* ================= OPEN / CLOSED BADGE: checks the current India time against OPEN_HOUR and CLOSE_HOUR ================= */
    const hourLabel = h => `${h % 12 || 12}:00 ${h < 12 ? 'am' : 'pm'}`;
    function updateBadge() {
      const parts = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Kolkata', hour: 'numeric', minute: 'numeric', hour12: false }).formatToParts(new Date());
      const mins = (Number(parts.find(p => p.type === 'hour').value) % 24) * 60 + Number(parts.find(p => p.type === 'minute').value);
      const open = mins >= OPEN_HOUR * 60 && mins < CLOSE_HOUR * 60;
      const badge = $('openBadge');
      badge.classList.toggle('open', open);
      badge.querySelector('span').textContent = open ? `Open now, closes at ${hourLabel(CLOSE_HOUR)}` : `Closed now, opens at ${hourLabel(OPEN_HOUR)}`;
    }
    updateBadge(); setInterval(updateBadge, 60000);

    /* ================= TABLE BOOKING: fills the date/time/guest options, then sends the booking on WhatsApp ================= */
    $('bkDate').min = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' }); // cannot pick a past date
    for (let m = OPEN_HOUR * 60; m < CLOSE_HOUR * 60; m += 30) {            // time slots every 30 minutes
      const h = Math.floor(m / 60), min = String(m % 60).padStart(2, '0');
      $('bkTime').add(new Option(`${h % 12 || 12}:${min} ${h < 12 ? 'am' : 'pm'}`));
    }
    for (let g = 1; g <= 10; g++) $('bkGuests').add(new Option(g === 1 ? '1 guest' : `${g} guests`, g));
    $('bkGuests').value = 2;
    $('bookForm').addEventListener('submit', e => {
      e.preventDefault();
      const date = new Date($('bkDate').value + 'T00:00').toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
      const note = clean($('bkNote').value, 160);
      sendWhatsApp(['Hello Ryanto Cafe! I would like to book a table.', '', `Name: ${clean($('bkName').value, 60)}`, `Date: ${date}`, `Time: ${$('bkTime').value}`, `Guests: ${$('bkGuests').value}`, note ? `Note: ${note}` : ''].filter(Boolean).join('\n'));
      showToast('Opening WhatsApp to send your booking.');
    });

    renderCart();
})();
