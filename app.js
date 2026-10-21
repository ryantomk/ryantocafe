(() => {
'use strict'; // strict mode + everything inside this wrapper: nothing is reachable from the browser console
    /* ================= CONFIG: edit these values for your cafe ================= */
    const GOOGLE_REVIEW_URL = '';              // Paste your Google review link here (Google Business Profile > Get more reviews > copy link)
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
      const total = orderTotal();
      orderRef = null; upiStarted = false; if (upiOk) $('payNote').textContent = ''; // cart changed: new reference needed
      cartCount.textContent = navCount.textContent = qty;
      cartTotal.textContent = money(total);
      if (!cart.size) { cartItems.innerHTML = '<p>Your order is empty. Add a favourite from the menu.</p>'; return; }
      cartItems.replaceChildren();
      cart.forEach((item, key) => {
        const row = document.createElement('div'); row.className = 'line';
        const d = document.createElement('span'); d.textContent = `${cartLabel(item)} × ${item.quantity} — ${money(unitPrice(item.name, item.addons) * item.quantity)}`;
        const rm = document.createElement('button'); rm.type = 'button'; rm.textContent = 'Remove'; rm.setAttribute('aria-label', `Remove ${item.name}`);
        rm.addEventListener('click', () => { cart.delete(key); renderCart(); showToast(`${item.name} removed from your order.`); });
        row.append(d, rm); cartItems.append(row);
      });
    }
    /* ADD TO ORDER (menu cards + featured dish): only the dish NAME is read from the button */
    document.addEventListener('click', e => {
      const b = e.target.closest('.add-to-cart');
      if (b) addToCart(b.dataset.name);
    });

    /* SEND TO WHATSAPP: opens WhatsApp chat with the cafe number and a ready-written message */
    function sendWhatsApp(message) {
      window.open(`https://wa.me/${WHATSAPP}?text=${encodeURIComponent(message)}`, '_blank', 'noopener');
    }

    /* ORDER TOTAL: recalculated from the locked price list every time (cannot be faked from the page) */
    const orderTotal = () => [...cart.values()].reduce((s, i) => s + unitPrice(i.name, i.addons) * Math.min(i.quantity, 20), 0);
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
      const lines = [...cart.values()].map(i => `• ${cartLabel(i)} × ${i.quantity} — ${money(unitPrice(i.name, i.addons) * i.quantity)}`);
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
    /* Each dish: ingredients = list shown in the popup, addons = optional extras with their own price (SAMPLE data: edit to match your kitchen) */
    const AO_BOWL = [{ name: 'Extra avocado', price: 60 }, { name: 'Extra dressing', price: 20 }];
    const AO_SUSHI = [{ name: 'Extra wasabi', price: 10 }, { name: 'Soy sauce dip', price: 10 }];
    const AO_DRINK = [{ name: 'Extra espresso shot', price: 50 }, { name: 'Oat milk', price: 40 }];
    const MENU = [
      { cat: 'Bowls',    name: 'Herb Crusted Salmon Bowl', desc: 'Fresh salmon, greens, quinoa, avocado and lemon herb dressing.', price: 650, img: 'salmon', ingredients: ['Salmon', 'Quinoa', 'Seasonal greens', 'Avocado', 'Cherry tomatoes', 'Lemon herb dressing'], addons: AO_BOWL },
      { cat: 'Bowls',    name: 'Teriyaki Salmon Bowl',     desc: 'Grilled salmon, fragrant rice, fresh veggies, and house-made teriyaki sauce.', price: 590, img: 'bowl', ingredients: ['Grilled salmon', 'Rice', 'Fresh vegetables', 'Teriyaki sauce', 'Sesame'], addons: AO_BOWL },
      { cat: 'Bowls',    name: 'Garden Veggie Bowl',       desc: 'Roasted vegetables, quinoa, hummus and a lemon tahini drizzle.', price: 420, img: 'bowl', ingredients: ['Roasted vegetables', 'Quinoa', 'Hummus', 'Lemon tahini'], addons: AO_BOWL },
      { cat: 'Sushi',    name: 'Salmon Sushi',             desc: 'Freshly sliced salmon, seasoned rice, and a touch of wasabi.', price: 480, img: 'sushi', ingredients: ['Salmon', 'Seasoned rice', 'Wasabi', 'Pickled ginger'], addons: AO_SUSHI },
      { cat: 'Sushi',    name: 'Avocado Roll',             desc: 'Creamy avocado and cucumber rolled in seasoned rice with sesame.', price: 360, img: 'sushi', ingredients: ['Avocado', 'Cucumber', 'Seasoned rice', 'Nori', 'Sesame'], addons: AO_SUSHI },
      { cat: 'Drinks',   name: 'Iced Vanilla Latte',       desc: 'Smooth espresso, cold milk, and a hint of vanilla.', price: 220, img: 'latte', ingredients: ['Espresso', 'Cold milk', 'Vanilla syrup', 'Ice'], addons: AO_DRINK },
      { cat: 'Drinks',   name: 'Classic Cappuccino',       desc: 'Double espresso with silky steamed milk.', price: 180, img: 'latte', ingredients: ['Double espresso', 'Steamed milk', 'Milk foam'], addons: AO_DRINK },
      { cat: 'Drinks',   name: 'Fresh Lime Soda',          desc: 'Fresh lime and mint over ice, topped with soda.', price: 120, img: null, ingredients: ['Fresh lime', 'Mint', 'Soda', 'Ice'], addons: [] },
      { cat: 'Desserts', name: 'Warm Chocolate Brownie',   desc: 'Fudgy brownie served warm with vanilla ice cream.', price: 240, img: null, ingredients: ['Dark chocolate', 'Butter', 'Flour', 'Vanilla ice cream'], addons: [{ name: 'Extra ice cream scoop', price: 60 }] },
      { cat: 'Desserts', name: 'Classic Tiramisu',         desc: 'Espresso-soaked layers with mascarpone cream.', price: 280, img: null, ingredients: ['Mascarpone', 'Espresso', 'Ladyfingers', 'Cocoa'], addons: [] }
    ];

    const deepFreeze = o => { Object.values(o).forEach(v => { if (v && typeof v === 'object') deepFreeze(v); }); return Object.freeze(o); };
    deepFreeze(IMAGES); deepFreeze(MENU); // locked completely: prices and add-on prices cannot be edited at runtime
    const PRICES = new Map(MENU.map(m => [m.name, m.price])); // base price of each dish
    const DISH = new Map(MENU.map(m => [m.name, m])); // find a dish by its name

    /* UNIT PRICE: dish price + chosen add-ons, ALWAYS calculated from the locked menu (the only source of prices) */
    function unitPrice(name, addons) {
      const d = DISH.get(name);
      return d.price + addons.reduce((s, n) => { const a = d.addons.find(x => x.name === n); return s + (a ? a.price : 0); }, 0);
    }
    const cartLabel = i => i.name + (i.addons.length ? ` (+ ${i.addons.join(', ')})` : '');

    /* ADD TO CART: validates the dish and add-ons against the locked menu; same dish + same add-ons are merged into one line */
    function addToCart(name, addons = [], qty = 1) {
      const d = DISH.get(name); if (!d) return;
      const valid = addons.filter(n => d.addons.some(x => x.name === n)).sort();
      const key = name + '|' + valid.join(',');
      const cur = cart.get(key);
      cart.set(key, { key, name, addons: valid, quantity: Math.min((cur ? cur.quantity : 0) + qty, 20) });
      renderCart(); showToast(`${name} added to your order.`);
    }

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
        pic.dataset.details = m.name; // clicking the photo opens the details popup
        const row = el('div', null, 'row'); const btn = el('button', 'Add to order', 'btn sm add-to-cart'); btn.type = 'button'; btn.dataset.name = m.name;
        const more = el('button', 'Details', 'btn sm ghost'); more.type = 'button'; more.dataset.details = m.name;
        const btns = el('div', null, 'btns'); btns.append(more, btn);
        row.append(el('span', money(m.price), 'price'), btns);
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

        /* ================= DISH DETAILS POPUP: shows photo, ingredients and add-ons, with quantity. Prices come from the locked menu. ================= */
    const dlg = $('dishDialog');
    let dlgDish = null, dlgQty = 1;
    const pickedAddons = () => [...dlg.querySelectorAll('#dlgAddons input:checked')].map(i => i.value);
    function dlgUpdate() { $('dlgQty').textContent = dlgQty; $('dlgAdd').textContent = `Add to order — ${money(unitPrice(dlgDish.name, pickedAddons()) * dlgQty)}`; }
    function openDish(name) {
      const d = DISH.get(name); if (!d || typeof dlg.showModal !== 'function') return;
      dlgDish = d; dlgQty = 1;
      $('dlgCat').textContent = d.cat; $('dlgTitle').textContent = d.name; $('dlgDesc').textContent = d.desc;
      const pic = $('dlgPic'); pic.replaceChildren();
      if (d.img) { const im = el('img'); im.src = `${IMAGES[d.img]}?auto=format&fit=crop&w=1000&q=85`; im.alt = d.name; pic.append(im); } else pic.append(el('div', d.name[0], 'ph'));
      $('dlgIngr').replaceChildren(...d.ingredients.map(t => el('li', t)));
      const ad = $('dlgAddons'); ad.replaceChildren();
      if (d.addons.length) {
        ad.append(el('h4', 'Add-ons'));
        d.addons.forEach(a => {
          const lab = el('label', null, 'addon'); const cb = el('input'); cb.type = 'checkbox'; cb.value = a.name; cb.addEventListener('change', dlgUpdate);
          lab.append(cb, el('span', a.name), el('span', a.price ? `+${money(a.price)}` : 'Free', 'addon-price')); ad.append(lab);
        });
      }
      dlgUpdate(); dlg.showModal();
    }
    document.addEventListener('click', e => { const t = e.target.closest('[data-details]'); if (t) openDish(t.dataset.details); });
    $('dlgMinus').addEventListener('click', () => { dlgQty = Math.max(1, dlgQty - 1); dlgUpdate(); });
    $('dlgPlus').addEventListener('click', () => { dlgQty = Math.min(10, dlgQty + 1); dlgUpdate(); });
    $('dlgClose').addEventListener('click', () => dlg.close());
    dlg.addEventListener('click', e => { if (e.target === dlg) dlg.close(); }); // click on the dark backdrop closes it
    $('dlgAdd').addEventListener('click', () => { addToCart(dlgDish.name, pickedAddons(), dlgQty); dlg.close(); });

    /* ================= GOOGLE REVIEWS: points the review button to GOOGLE_REVIEW_URL (or a Google Maps search until you add it) ================= */
    const reviewHref = GOOGLE_REVIEW_URL.startsWith('https://') ? GOOGLE_REVIEW_URL : 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(UPI_NAME);
    document.querySelectorAll('[data-review]').forEach(a => a.href = reviewHref);

    /* ================= INSTALLABLE APP (PWA): shows an "Install app" button and registers the offline service worker (https only) ================= */
    let installEvt = null;
    addEventListener('beforeinstallprompt', e => { e.preventDefault(); installEvt = e; $('installBtn').hidden = false; });
    $('installBtn').addEventListener('click', async () => { if (!installEvt) return; installEvt.prompt(); await installEvt.userChoice; installEvt = null; $('installBtn').hidden = true; });
    addEventListener('appinstalled', () => { $('installBtn').hidden = true; });
    if ('serviceWorker' in navigator && location.protocol === 'https:') addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));

    renderCart();
})();
