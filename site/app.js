/* Opus 5.5 for everyone: page behavior and interactive answers. Plain JS, no dependencies. */
'use strict';
(() => {
  // ---------- helpers ----------
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
  const SVGNS = 'http://www.w3.org/2000/svg';
  const svgEl = (tag, attrs = {}, parent) => {
    const el = document.createElementNS(SVGNS, tag);
    for (const k in attrs) el.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(el);
    return el;
  };
  const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
  const num = (v, fallback = 0) => { const n = parseFloat(v); return Number.isFinite(n) ? n : fallback; };
  const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const usd = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });
  const usd0 = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
  const int = new Intl.NumberFormat('en-US');
  const usdK = (n) => `$${(n / 1000).toFixed(1)}k`;
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const ease = (t) => 1 - Math.pow(1 - t, 3);

  // Animate a 0..1 progress over `ms`; returns a cancel function.
  function tween(ms, onFrame, onDone) {
    let raf = 0;
    const t0 = performance.now();
    const step = (now) => {
      const t = clamp((now - t0) / ms, 0, 1);
      onFrame(ease(t));
      if (t < 1) raf = requestAnimationFrame(step); else if (onDone) onDone();
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }

  // Wire a range input to a state key and an <output> label.
  function bindRange(root, key, fmt, onChange) {
    const input = $(`[data-i="${key}"]`, root);
    const out = $(`[data-o="${key}"]`, root);
    const read = () => { const v = num(input.value); if (out) out.textContent = fmt(v); return v; };
    input.addEventListener('input', () => onChange(read()));
    return read();
  }
  const rangeCtrl = (key, label, min, max, step, value) => `
    <label class="ctrl"><span class="ctrl-l">${label} <output data-o="${key}"></output></span>
    <input type="range" min="${min}" max="${max}" step="${step}" value="${value}" data-i="${key}"></label>`;

  // ---------- page chrome: top bar, table of contents, share ----------
  function chrome() {
    const bar = $('.topbar');
    const toc = $('.toc');
    const links = $$('.toc a');
    const targets = links.map((a) => document.getElementById(a.hash.slice(1)));
    const head = $('.post-head');
    const wides = $$('.post > .wide');
    let queued = false;

    const update = () => {
      queued = false;
      bar.classList.toggle('scrolled', scrollY > 8);
      if (getComputedStyle(toc).display === 'none') return;

      let active = 0;
      targets.forEach((t, i) => { if (t.getBoundingClientRect().top < 160) active = i; });
      links.forEach((a, i) => a.classList.toggle('active', i === active));

      // Hide the TOC while a wide demo would sit underneath it.
      const tr = toc.getBoundingClientRect();
      const overlap = wides.some((w) => {
        const r = w.getBoundingClientRect();
        return r.left < tr.right + 16 && r.top < tr.bottom && r.bottom > tr.top;
      });
      toc.classList.toggle('visible', head.getBoundingClientRect().bottom < 80 && !overlap);
    };
    const onScroll = () => { if (!queued) { queued = true; requestAnimationFrame(update); } };
    addEventListener('scroll', onScroll, { passive: true });
    addEventListener('resize', onScroll);
    update();

    const share = $('[data-share]');
    const label = $('[data-share-label]');
    share.addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(location.href.split('#')[0]);
        label.textContent = 'Link copied';
      } catch {
        label.textContent = 'Copy failed';
      }
      setTimeout(() => { label.textContent = 'Copy link'; }, 1600);
    });
  }

  // ---------- tabs and lazy widget start ----------
  const widgets = {};
  function startWidget(el) {
    if (el.dataset.ready || el.closest('[hidden]')) return;
    el.dataset.ready = '1';
    try { widgets[el.dataset.widget](el); } catch (err) { console.error(`widget ${el.dataset.widget} failed`, err); }
  }

  function tabs(list) {
    const all = $$('[role="tab"]', list);
    const select = (tab, focus) => {
      all.forEach((t) => {
        const on = t === tab;
        t.setAttribute('aria-selected', String(on));
        t.tabIndex = on ? 0 : -1;
        const panel = document.getElementById(t.getAttribute('aria-controls'));
        panel.hidden = !on;
        if (on) $$('[data-widget]', panel).forEach(startWidget);
      });
      if (focus) tab.focus();
    };
    all.forEach((t, i) => {
      t.addEventListener('click', () => select(t));
      t.addEventListener('keydown', (e) => {
        const d = { ArrowRight: 1, ArrowLeft: -1 }[e.key];
        if (!d) return;
        e.preventDefault();
        select(all[(i + d + all.length) % all.length], true);
      });
    });
  }

  // ---------- hero: mechanical keyboard, text answer -> interactive answer ----------
  widgets.keyboard = (sec) => {
    const svg = $('.kb-svg', sec);
    const slider = $('.kb-explode', sec);
    const chips = $$('.chip', sec);
    const modeBtns = $$('.mode-btn', sec);
    const uiAnswer = $('.answer-ui', sec);
    const textAnswer = $('.answer-text', sec);
    const descTitle = $('.kb-desc-title', sec);
    const desc = $('.kb-desc', sec);

    const INFO = {
      all: ['Five layers, one keystroke', 'Press a key and the keycap pushes a switch down until its contacts close. The circuit board carries that signal to the controller, which scans every key many times a second. Pick a layer to see its job.'],
      keycaps: ['Keycaps', 'The part you touch, usually ABS or PBT plastic. PBT resists the shine that years of typing leave behind. The profile, meaning the height and slope of each row, shapes how your fingers travel.'],
      switches: ['Switches', 'One per key: a stem, a spring and a pair of metal contacts. Linear switches move smoothly, tactile ones have a bump, clicky ones add a click. Most register a press about halfway down.'],
      plate: ['Plate', 'A stiff sheet of steel, aluminum, brass or polycarbonate that clips every switch into a rigid grid. Stiffer plates feel firmer; more flexible ones feel softer and sound deeper.'],
      pcb: ['Circuit board', 'The PCB wires the switches into a matrix of rows and columns, so a controller can read dozens of keys with a handful of pins. A diode at each key stops ghost presses when several keys are held at once.'],
      case: ['Case', 'Holds the stack together and shapes the sound. Material, how the plate is mounted, and the foam inside decide whether a board sounds deep, sharp or muted.'],
    };

    // Isometric projection: x runs down-right, y down-left, z straight up.
    const U = 21, C = Math.cos(Math.PI / 6), S = 0.5, OX = 190, OY = 204;
    const W = 13, D = 5, GAP = 1.8;
    const P = (x, y, z) => [OX + (x - y) * C * U, OY + (x + y) * S * U - z * U];
    const pts = (list) => list.map((p) => P(...p).map((n) => n.toFixed(1)).join(',')).join(' ');
    const poly = (g, list, cls) => svgEl('polygon', { points: pts(list), class: cls }, g);
    // Faces visible to a viewer looking from +x,+y: the two front faces, then the top.
    const box = (g, x0, y0, x1, y1, z, h) => {
      poly(g, [[x0, y1, z], [x1, y1, z], [x1, y1, z + h], [x0, y1, z + h]], 'fl');
      poly(g, [[x1, y0, z], [x1, y1, z], [x1, y1, z + h], [x1, y0, z + h]], 'fr');
      poly(g, [[x0, y0, z + h], [x1, y0, z + h], [x1, y1, z + h], [x0, y1, z + h]], 'ft');
    };
    const rectTop = (g, x0, y0, x1, y1, z, cls) => poly(g, [[x0, y0, z], [x1, y0, z], [x1, y1, z], [x0, y1, z]], cls);

    // 12 x 3 alpha keys plus a bottom row with a 6u space bar. [x, y, width]
    const keys = [];
    for (let r = 0; r < 3; r++) for (let c = 0; c < 12; c++) keys.push([0.5 + c, 0.5 + r, 1]);
    [[0, 1], [1, 1], [2, 1], [3, 6], [9, 1], [10, 1], [11, 1]].forEach(([c, w]) => keys.push([0.5 + c, 3.5, w]));
    const backToFront = (a, b) => (a[0] + a[1]) - (b[0] + b[1]);
    const centers = keys.map(([x, y, w]) => [x + w / 2, y + 0.5]).sort(backToFront);

    const root = svgEl('g', {}, svg);
    const layers = [
      { id: 'case', top: 0.9, draw: (g) => {
        box(g, 0, 0, W, D, 0, 0.9);
        rectTop(g, 0.25, 0.25, W - 0.25, D - 0.25, 0.9, 'detail');
      } },
      { id: 'pcb', top: 1.0, draw: (g) => {
        box(g, 0.3, 0.3, W - 0.3, D - 0.3, 0.9, 0.1);
        for (let r = 0; r < 4; r++) svgEl('polyline', { points: pts([[0.6, 1 + r, 1], [W - 0.6, 1 + r, 1]]), class: 'trace' }, g);
        for (let c = 0; c < 12; c++) svgEl('polyline', { points: pts([[1 + c, 0.6, 1], [1 + c, D - 0.6, 1]]), class: 'trace' }, g);
        centers.forEach(([cx, cy]) => { const [sx, sy] = P(cx + 0.28, cy + 0.28, 1); svgEl('circle', { cx: sx, cy: sy, r: 1.4, class: 'diode' }, g); });
      } },
      { id: 'plate', top: 1.08, draw: (g) => {
        box(g, 0.25, 0.25, W - 0.25, D - 0.25, 1.0, 0.08);
        centers.forEach(([cx, cy]) => rectTop(g, cx - 0.31, cy - 0.31, cx + 0.31, cy + 0.31, 1.08, 'hole'));
      } },
      { id: 'switches', top: 1.63, draw: (g) => {
        centers.forEach(([cx, cy]) => {
          box(g, cx - 0.3, cy - 0.3, cx + 0.3, cy + 0.3, 1.08, 0.55);
          box(g, cx - 0.07, cy - 0.07, cx + 0.07, cy + 0.07, 1.63, 0.14);
        });
      } },
      { id: 'keycaps', top: 2.13, draw: (g) => {
        [...keys].sort(backToFront).forEach(([x, y, w]) => {
          box(g, x + 0.06, y + 0.06, x + w - 0.06, y + 0.94, 1.63, 0.5);
          rectTop(g, x + 0.2, y + 0.2, x + w - 0.2, y + 0.8, 2.13, 'detail');
        });
      } },
    ];
    const names = { case: 'Case', pcb: 'Circuit board', plate: 'Plate', switches: 'Switches', keycaps: 'Keycaps' };
    const labelGroup = [];
    layers.forEach((L) => {
      L.g = svgEl('g', { class: 'kb-layer', 'data-layer': L.id }, root);
      L.draw(L.g);
      const lg = svgEl('g', { class: 'kb-label kb-labels' }, L.g);
      const [ax, ay] = P(W - 0.5, 0.5, L.top);
      svgEl('circle', { cx: ax, cy: ay, r: 2.2 }, lg);
      svgEl('line', { x1: ax + 4, y1: ay, x2: 462, y2: ay }, lg);
      const t = svgEl('text', { x: 470, y: ay + 4.5 }, lg);
      t.textContent = names[L.id];
      t.addEventListener('click', () => { took(); select(L.id); });
      labelGroup.push(lg);
    });

    let explode = 0;
    const setExplode = (e) => {
      explode = clamp(e, 0, 1);
      layers.forEach((L, i) => {
        const dy = -(explode * i + (1 - explode) * 2) * GAP * U;
        L.g.setAttribute('transform', `translate(0 ${dy.toFixed(1)})`);
      });
      const op = clamp((explode - 0.3) / 0.3, 0, 1);
      labelGroup.forEach((lg) => { lg.style.opacity = op; });
      slider.value = Math.round(explode * 100);
    };

    const select = (id) => {
      chips.forEach((c) => c.setAttribute('aria-pressed', String(c.dataset.layer === id)));
      layers.forEach((L) => {
        L.g.classList.toggle('on', L.id === id);
        L.g.classList.toggle('dim', id !== 'all' && L.id !== id);
      });
      [descTitle.textContent, desc.textContent] = INFO[id];
      if (id !== 'all' && explode < 0.5) animateTo(0.85);
    };

    let cancel = null;
    const animateTo = (target) => {
      if (cancel) cancel();
      if (reduceMotion) { setExplode(target); return; }
      const from = explode;
      cancel = tween(900, (t) => setExplode(from + (target - from) * t));
    };

    const setMode = (mode) => {
      if (sec.dataset.mode === mode) return;
      sec.dataset.mode = mode;
      modeBtns.forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.mode === mode)));
      uiAnswer.inert = mode !== 'ui';
      textAnswer.inert = mode === 'ui';
    };

    // Scroll drives the transformation until the reader takes over.
    let userTook = false;
    const took = () => { userTook = true; if (cancel) cancel(); };
    const scrollDriven = () => !userTook && !reduceMotion && matchMedia('(min-width: 861px)').matches;
    const onScroll = () => {
      if (!scrollDriven()) return;
      const total = sec.offsetHeight - innerHeight;
      if (total <= 0) return;
      const p = clamp(-sec.getBoundingClientRect().top / total, 0, 1);
      setMode(p > 0.16 ? 'ui' : 'text');
      setExplode(clamp((p - 0.26) / 0.46, 0, 1));
    };
    addEventListener('scroll', onScroll, { passive: true });

    // Small screens: no sticky scroll, so reveal once when the card is in view.
    if (!reduceMotion) {
      const io = new IntersectionObserver((entries) => {
        if (!entries[0].isIntersecting || scrollDriven()) return;
        io.disconnect();
        setTimeout(() => { if (userTook) return; setMode('ui'); animateTo(0.75); }, 900);
      }, { threshold: 0.55 });
      io.observe($('.hero-card', sec));
    }

    modeBtns.forEach((b) => b.addEventListener('click', () => {
      took();
      setMode(b.dataset.mode);
      if (b.dataset.mode === 'ui' && explode < 0.05) animateTo(0.75);
    }));
    slider.addEventListener('input', () => { took(); setExplode(slider.value / 100); });
    chips.forEach((c) => c.addEventListener('click', () => { took(); select(c.dataset.layer); }));

    sec.dataset.mode = '';
    setMode('text');
    setExplode(0);
    select('all');
    onScroll();
  };

  // ---------- everyday: 10K plan ----------
  widgets.run10k = (root) => {
    root.innerHTML = `
      <div class="ctrl-grid">
        ${rangeCtrl('weeks', 'Weeks to race', 6, 16, 1, 10)}
        ${rangeCtrl('start', 'Can run now', 1, 6, 0.5, 3)}
        ${rangeCtrl('goal', 'Goal finish', 45, 90, 1, 65)}
      </div>
      <div class="stat-row">
        <div class="stat"><span class="stat-l">Goal pace</span><span class="stat-v" data-o="pace"></span></div>
        <div class="stat"><span class="stat-l">Peak long run</span><span class="stat-v" data-o="peak"></span></div>
        <div class="stat"><span class="stat-l">Weeks done</span><span class="stat-v" data-o="done"></span></div>
      </div>
      <p class="note warn" data-o="warn" hidden></p>
      <svg class="bars" viewBox="0 0 520 150" role="img" aria-label="Long run distance for each week"></svg>
      <ol class="weeks"></ol>
      <p class="small">Long runs at an easy, conversational pace. The other two runs each week: one easy, one with short faster segments.</p>`;

    const st = { weeks: 10, start: 3, goal: 65, done: new Set() };
    const km = (v) => `${+v.toFixed(1)} km`;
    const half = (v) => Math.round(v * 2) / 2;
    const pace = (sec) => { const t = Math.round(sec); return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`; };

    const plan = () => {
      const W = st.weeks, first = st.start + 0.5, target = 9, build = W - 2;
      let step = build > 1 ? (target - first) / (build - 1) : 0;
      step = clamp(step, 0, 1); // never add more than ~1 km a week to the long run
      const weeks = [];
      for (let w = 1; w <= build; w++) {
        const cut = w % 4 === 0 && w < build; // every fourth week is lighter
        const long = half((first + step * (w - 1)) * (cut ? 0.8 : 1));
        weeks.push({ w, long, kind: cut ? 'Easier' : 'Build', total: half(long + 2 * Math.max(2, long * 0.55)) });
      }
      const peak = Math.max(...weeks.map((x) => x.long));
      const taper = half(peak * 0.65);
      weeks.push({ w: W - 1, long: taper, kind: 'Taper', total: half(taper + 2 * Math.max(2, taper * 0.5)) });
      weeks.push({ w: W, long: 10, kind: 'Race', race: true });
      return { weeks, peak };
    };

    const svg = $('.bars', root);
    const list = $('.weeks', root);
    const render = () => {
      const { weeks, peak } = plan();
      $('[data-o="pace"]', root).innerHTML = `${pace(st.goal * 6)}<span class="unit">/km</span>`;
      $('[data-o="peak"]', root).innerHTML = `${+peak.toFixed(1)}<span class="unit">km</span>`;
      const warn = $('[data-o="warn"]', root);
      warn.hidden = peak >= 8;
      warn.textContent = `That’s a steep ramp. Adding about 1 km a week, your longest run reaches ${km(peak)} before race day. Consider more weeks, or plan to run-walk the 10K.`;
      for (const w of st.done) if (w > st.weeks) st.done.delete(w);
      $('[data-o="done"]', root).innerHTML = `${st.done.size}<span class="unit">of ${st.weeks}</span>`;

      svg.replaceChildren();
      const n = weeks.length, pad = 6, bw = (520 - pad * 2) / n, base = 124, scale = 104 / 10;
      weeks.forEach((wk, i) => {
        const h = wk.long * scale, x = pad + i * bw + 3;
        const cls = wk.race ? 'bar race' : st.done.has(wk.w) ? 'bar done' : wk.kind === 'Easier' || wk.kind === 'Taper' ? 'bar cut' : 'bar';
        svgEl('rect', { x, y: base - h, width: Math.max(2, bw - 6), height: h, rx: 3, class: cls }, svg);
        svgEl('text', { x: x + (bw - 6) / 2, y: base - h - 5, class: 'val' }, svg).textContent = +wk.long.toFixed(1);
        svgEl('text', { x: x + (bw - 6) / 2, y: 141, class: 'wk' }, svg).textContent = `W${wk.w}`;
      });

      list.replaceChildren(...weeks.map((wk) => {
        const li = document.createElement('li');
        li.classList.toggle('is-done', st.done.has(wk.w));
        const what = wk.race ? '10K race, plus two short easy runs' : `Long run ${km(wk.long)} · about ${km(wk.total)} total`;
        li.innerHTML = `<label><input type="checkbox"><span class="wk-n">Week ${wk.w}</span><span class="wk-what">${what}</span><span class="wk-tag${wk.race ? ' race' : ''}">${wk.kind}</span></label>`;
        const box = $('input', li);
        box.checked = st.done.has(wk.w);
        box.addEventListener('change', () => { if (box.checked) st.done.add(wk.w); else st.done.delete(wk.w); render(); });
        return li;
      }));
    };

    st.weeks = bindRange(root, 'weeks', (v) => `${v} weeks`, (v) => { st.weeks = v; render(); });
    st.start = bindRange(root, 'start', (v) => km(v), (v) => { st.start = v; render(); });
    st.goal = bindRange(root, 'goal', (v) => `${v} min · ${pace(v * 60 / 10 * 1.609344)}/mi`, (v) => { st.goal = v; render(); });
    render();
  };

  // ---------- everyday: two job offers ----------
  widgets.offers = (root) => {
    const st = {
      A: { salary: 142000, bonus: 10, days: 3, commute: 50 },
      B: { salary: 128000, bonus: 0, days: 0, commute: 15 },
      rate: 50,
    };
    const WEEKS = 48, HOURS = WEEKS * 40;
    const field = (k, f, label, attrs) => `<label class="field"><span>${label}</span><input class="num" type="number" ${attrs} data-k="${k}" data-f="${f}" value="${st[k][f]}"></label>`;
    root.innerHTML = `
      <div class="offer-cols">${['A', 'B'].map((k) => `
        <div class="offer">
          <h5><span class="dot dot-${k.toLowerCase()}"></span>Offer ${k}</h5>
          ${field(k, 'salary', 'Base salary ($)', 'min="0" step="1000" inputmode="numeric"')}
          ${field(k, 'bonus', 'Bonus (% of base)', 'min="0" max="100" step="1"')}
          ${field(k, 'days', 'Office days per week', 'min="0" max="5" step="1"')}
          ${field(k, 'commute', 'Commute each way (min)', 'min="0" max="240" step="5"')}
        </div>`).join('')}
      </div>
      ${rangeCtrl('rate', 'What an hour of your time is worth', 0, 150, 5, st.rate)}
      <table class="cmp">
        <thead><tr><th></th><th>Offer A</th><th>Offer B</th></tr></thead>
        <tbody data-o="rows"></tbody>
      </table>
      <div class="vbars" data-o="bars"></div>
      <p class="verdict" data-o="verdict"></p>
      <p class="small" data-o="be"></p>
      <p class="small">Pre-tax. Assumes ${WEEKS} working weeks and the bonus paid at target.</p>`;

    const calc = (o) => {
      const cash = o.salary * (1 + o.bonus / 100);
      const hours = (o.days * WEEKS * 2 * o.commute) / 60;
      const cost = hours * st.rate;
      return { cash, hours, cost, value: cash - cost, hourly: cash / (HOURS + hours) };
    };

    const render = () => {
      const a = calc(st.A), b = calc(st.B);
      const rows = [
        ['Pay with bonus', usd0.format(a.cash), usd0.format(b.cash)],
        ['Commute per year', `${int.format(Math.round(a.hours))} h`, `${int.format(Math.round(b.hours))} h`],
        ['Cost of that time', `−${usd0.format(a.cost)}`, `−${usd0.format(b.cost)}`],
        ['Effective hourly pay', usd.format(a.hourly), usd.format(b.hourly)],
        ['Value after commute', usd0.format(a.value), usd0.format(b.value)],
      ];
      $('[data-o="rows"]', root).innerHTML = rows.map((r, i) => `<tr${i === rows.length - 1 ? ' class="total"' : ''}><td>${r[0]}</td><td>${r[1]}</td><td>${r[2]}</td></tr>`).join('');

      const max = Math.max(a.value, b.value, 1);
      $('[data-o="bars"]', root).innerHTML = [['A', a, 'var(--ink)'], ['B', b, 'var(--clay)']].map(([k, o]) =>
        `<div class="vbar"><span>${k}</span><div class="vbar-track"><div class="vbar-fill dot-${k.toLowerCase()}" data-w="${clamp(o.value / max, 0, 1)}"></div></div><span>${usdK(o.value)}</span></div>`).join('');
      $$('.vbar-fill', root).forEach((el) => { el.style.width = `${el.dataset.w * 100}%`; });

      const diff = a.value - b.value;
      $('[data-o="verdict"]', root).textContent = Math.abs(diff) < 1500
        ? 'Too close to call on pay and time. Pick the better role.'
        : `Offer ${diff > 0 ? 'A' : 'B'} comes out ${usdK(Math.abs(diff))} a year ahead once the commute is priced in.`;

      const dCash = a.cash - b.cash, dHours = a.hours - b.hours;
      let be = 'Both commutes take the same time, so pay decides.';
      if (dHours !== 0 && Math.sign(dCash) === Math.sign(dHours)) {
        const richer = dCash > 0 ? 'A' : 'B';
        be = `Offer ${richer} stays ahead unless an hour of your time is worth more than ${usd0.format(dCash / dHours)}.`;
      } else if (dHours !== 0 && dCash !== 0) {
        be = `Offer ${dCash > 0 ? 'A' : 'B'} wins on both pay and time.`;
      }
      $('[data-o="be"]', root).textContent = be;
    };

    const limits = { salary: [0, 5e6], bonus: [0, 100], days: [0, 5], commute: [0, 240] };
    $$('input[data-k]', root).forEach((inp) => inp.addEventListener('input', () => {
      const [lo, hi] = limits[inp.dataset.f];
      st[inp.dataset.k][inp.dataset.f] = clamp(num(inp.value), lo, hi);
      render();
    }));
    st.rate = bindRange(root, 'rate', (v) => `$${v}/h`, (v) => { st.rate = v; render(); });
    render();
  };

  // ---------- everyday: Kyoto weekend ----------
  widgets.kyoto = (root) => {
    const PLACES = {
      station: { x: 205, y: 252 },
      inari: { x: 276, y: 296, name: 'Fushimi Inari' },
      kiyomizu: { x: 298, y: 196, name: 'Kiyomizu-dera' },
      ginkakuji: { x: 326, y: 76, name: 'Ginkaku-ji', anchor: 'end' },
      gion: { x: 282, y: 148, name: 'Gion' },
      arashiyama: { x: 52, y: 112, name: 'Arashiyama' },
      kinkakuji: { x: 150, y: 48, name: 'Kinkaku-ji' },
      nishiki: { x: 220, y: 140, name: 'Nishiki Market', anchor: 'end' },
    };
    const DAYS = {
      sat: [
        { id: 'inari', time: '7:30', name: 'Fushimi Inari Taisha', tag: ['Go early', 'early'], note: 'Walk the torii gates up to the Yotsutsuji intersection for the city view, then head down. Crowds build fast after 9.' },
        { id: 'kiyomizu', time: '10:30', name: 'Kiyomizu-dera', tag: ['Temple', ''], note: 'The wooden stage over the hillside. Afterward, wander down Sannenzaka and Ninenzaka.' },
        { id: 'ginkakuji', time: '13:30', name: 'Philosopher’s Path to Ginkaku-ji', tag: ['Detour', 'detour'], note: 'A quiet canal-side walk that’s calmer than anything else on this list. Only if your legs still have it.', detour: true },
        { id: 'gion', time: '16:00', name: 'Gion and Yasaka Shrine', tag: ['Food', 'food'], note: 'Late lunch, then an evening walk along Hanamikoji and the Shirakawa canal as the lanterns come on.' },
      ],
      sun: [
        { id: 'arashiyama', time: '8:00', name: 'Arashiyama bamboo grove', tag: ['Go early', 'early'], note: 'Arrive before the tour groups. Tenryu-ji’s garden is right next door.' },
        { id: 'kinkakuji', time: '12:00', name: 'Kinkaku-ji', tag: ['Temple', ''], note: 'The Golden Pavilion across its pond. A short visit is enough.' },
        { id: 'nishiki', time: '15:00', name: 'Nishiki Market', tag: ['Food', 'food'], note: 'Snack crawl: tamagoyaki, pickles, soy-milk doughnuts. Many stalls close around 5 to 6 pm.' },
      ],
    };

    const LEGS = {
      'inari>kiyomizu': 'Train, then walk up the hill',
      'kiyomizu>gion': 'Walk down through the old lanes, about 20 min',
      'kiyomizu>ginkakuji': 'Bus or taxi north',
      'ginkakuji>gion': 'Walk the canal south, then a short ride to Gion',
      'arashiyama>kinkakuji': 'Taxi or bus',
      'kinkakuji>nishiki': 'Bus or taxi into the center',
    };

    root.innerHTML = `
      <div class="kyoto-top">
        <div class="seg" role="group" aria-label="Day">
          <button type="button" data-day="sat" aria-pressed="true">Saturday</button>
          <button type="button" data-day="sun" aria-pressed="false">Sunday</button>
        </div>
        <button type="button" class="chip" data-detour aria-pressed="false">+ Add detour</button>
      </div>
      <svg class="kyoto-map" viewBox="0 0 400 320" role="img" aria-label="Schematic map of Kyoto with the day's stops"></svg>
      <ol class="stops"></ol>
      <p class="small">Schematic map, not to scale. Opening hours change, so check before you go.</p>`;

    const svg = $('.kyoto-map', root);
    // static base map
    svgEl('path', { d: 'M352,0 C332,60 322,130 318,200 C314,250 300,290 298,320 L400,320 L400,0 Z', class: 'hills' }, svg);
    svgEl('path', { d: 'M0,0 L46,0 C34,40 22,70 0,92 Z', class: 'hills' }, svg);
    for (let x = 120; x <= 240; x += 20) svgEl('line', { x1: x, y1: 70, x2: x, y2: 236, class: 'street' }, svg);
    for (let y = 70; y <= 236; y += 20) svgEl('line', { x1: 120, y1: y, x2: 244, y2: y, class: 'street' }, svg);
    svgEl('path', { d: 'M258,0 C254,90 262,170 252,230 S236,300 228,320', class: 'river' }, svg);
    svgEl('path', { d: 'M0,130 C28,136 52,148 72,158 S112,230 150,320', class: 'river' }, svg);
    svgEl('text', { x: 264, y: 30, class: 'lbl' }, svg).textContent = 'KAMO RIVER';
    svgEl('text', { x: 394, y: 250, class: 'lbl', 'text-anchor': 'end' }, svg).textContent = 'HIGASHIYAMA';
    svgEl('text', { x: 82, y: 210, class: 'lbl' }, svg).textContent = 'KATSURA RIVER';
    const st0 = svgEl('g', { class: 'station' }, svg);
    svgEl('rect', { x: PLACES.station.x - 6, y: PLACES.station.y - 4, width: 12, height: 8, rx: 1.5 }, st0);
    svgEl('text', { x: PLACES.station.x - 10, y: PLACES.station.y + 18 }, st0).textContent = 'Kyoto Sta.';
    const dyn = svgEl('g', {}, svg);

    const st = { day: 'sat', detour: false, active: null };
    const list = $('.stops', root);
    const detourBtn = $('[data-detour]', root);

    const render = () => {
      const stops = DAYS[st.day].filter((s) => !s.detour || st.detour);
      detourBtn.hidden = st.day !== 'sat';
      detourBtn.setAttribute('aria-pressed', String(st.detour));
      detourBtn.textContent = st.detour ? '− Remove detour' : '+ Add detour';

      dyn.replaceChildren();
      for (let i = 1; i < stops.length; i++) {
        const p = PLACES[stops[i - 1].id], q = PLACES[stops[i].id];
        const mx = (p.x + q.x) / 2 + (q.y - p.y) * 0.12, my = (p.y + q.y) / 2 - (q.x - p.x) * 0.12;
        svgEl('path', { d: `M${p.x},${p.y} Q${mx},${my} ${q.x},${q.y}`, class: `route${stops[i].detour || stops[i - 1].detour ? ' detour' : ''}` }, dyn);
      }
      stops.forEach((s, i) => {
        const p = PLACES[s.id];
        const g = svgEl('g', { class: `pin${s.detour ? ' detour' : ''}${st.active === s.id ? ' on' : ''}`, 'data-id': s.id }, dyn);
        svgEl('circle', { cx: p.x, cy: p.y, r: 10 }, g);
        svgEl('text', { x: p.x, y: p.y + 3.8 }, g).textContent = i + 1;
        const end = p.anchor === 'end';
        svgEl('text', { x: p.x + (end ? -15 : 15), y: p.y + 3.5, class: 'pin-name', 'text-anchor': end ? 'end' : 'start' }, dyn).textContent = p.name;
        g.addEventListener('click', () => { st.active = s.id; render(); });
      });

      list.replaceChildren();
      stops.forEach((s, i) => {
        const li = document.createElement('li');
        li.innerHTML = `<button type="button" class="stop${s.detour ? ' detour' : ''}${st.active === s.id ? ' on' : ''}">
          <span class="stop-n">${i + 1}</span>
          <span><span class="stop-head"><span class="stop-time">${s.time}</span>${s.name}<span class="stop-tag ${s.tag[1]}">${s.tag[0]}</span></span>
          <span class="stop-note">${s.note}</span></span></button>`;
        $('button', li).addEventListener('click', () => { st.active = st.active === s.id ? null : s.id; render(); });
        list.appendChild(li);
        const legText = i < stops.length - 1 && LEGS[`${s.id}>${stops[i + 1].id}`];
        if (legText) {
          const leg = document.createElement('li');
          leg.className = 'leg';
          leg.textContent = `↓ ${legText}`;
          list.appendChild(leg);
        }
      });
    };

    $$('[data-day]', root).forEach((b) => b.addEventListener('click', () => {
      st.day = b.dataset.day;
      st.active = null;
      $$('[data-day]', root).forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
      render();
    }));
    detourBtn.addEventListener('click', () => { st.detour = !st.detour; render(); });
    render();
  };

  // ---------- explainer: central limit theorem ----------
  widgets.clt = (root) => {
    const POPS = {
      die: { label: 'Fair die', lo: 0.5, hi: 6.5, w: [0, 1, 1, 1, 1, 1, 1] },
      skew: { label: 'Skewed', lo: -0.5, hi: 10.5, w: Array.from({ length: 11 }, (_, k) => Math.pow(0.62, k)) },
      twin: { label: 'Two humps', lo: -0.5, hi: 10.5, w: [2, 7, 9, 5, 1.5, 0.5, 1.5, 5, 9, 7, 2] },
    };
    for (const p of Object.values(POPS)) {
      const total = p.w.reduce((s, x) => s + x, 0);
      p.prob = p.w.map((x) => x / total);
      p.cdf = p.prob.map((_, i) => p.prob.slice(0, i + 1).reduce((s, x) => s + x, 0));
      p.mu = p.prob.reduce((s, q, v) => s + q * v, 0);
      p.sigma = Math.sqrt(p.prob.reduce((s, q, v) => s + q * (v - p.mu) ** 2, 0));
    }

    root.innerHTML = `
      <div class="clt-wrap">
        <div class="clt-pop">
          <div class="seg" role="group" aria-label="Population">
            ${Object.entries(POPS).map(([k, p], i) => `<button type="button" data-pop="${k}" aria-pressed="${i === 0}">${p.label}</button>`).join('')}
          </div>
          <p class="small" data-o="popcap"></p>
          <svg viewBox="0 0 200 90" data-o="popsvg" role="img" aria-label="Population distribution"></svg>
          ${rangeCtrl('n', 'Sample size', 1, 40, 1, 5)}
        </div>
        <div class="clt-main">
          <div class="clt-btns">
            <button type="button" class="btn btn-sm" data-draw="1">Draw 1 sample</button>
            <button type="button" class="btn btn-sm" data-draw="1000">Draw 1,000</button>
            <button type="button" class="btn btn-sm" data-reset>Reset</button>
          </div>
          <p class="clt-last" data-o="last">Each sample is averaged; the average lands in the histogram.</p>
          <svg viewBox="0 0 600 240" data-o="hist" role="img" aria-label="Histogram of sample averages"></svg>
          <p class="small" data-o="stats"></p>
        </div>
      </div>`;

    const st = { pop: 'die', n: 5, sums: [], last: null };
    const draw1 = (p) => { const r = Math.random(); let v = p.cdf.findIndex((c) => r < c); if (v < 0) v = p.cdf.length - 1; return v; };
    const sample = () => {
      const p = POPS[st.pop];
      const vals = Array.from({ length: st.n }, () => draw1(p));
      return { vals, sum: vals.reduce((s, x) => s + x, 0) };
    };

    const popSvg = $('[data-o="popsvg"]', root);
    const renderPop = () => {
      const p = POPS[st.pop];
      popSvg.replaceChildren();
      const max = Math.max(...p.prob);
      const vals = p.prob.map((q, v) => [v, q]).filter(([v]) => v >= p.lo && v <= p.hi);
      const bw = 200 / vals.length;
      vals.forEach(([v, q], i) => {
        const h = (q / max) * 70;
        svgEl('rect', { x: i * bw + 1, y: 76 - h, width: bw - 2, height: h, rx: 1.5, class: 'pbar' }, popSvg);
        svgEl('text', { x: i * bw + bw / 2, y: 88, 'text-anchor': 'middle', 'font-size': 9, fill: '#87867f' }, popSvg).textContent = v;
      });
      $('[data-o="popcap"]', root).textContent = `Population mean ${p.mu.toFixed(2)}, spread (σ) ${p.sigma.toFixed(2)}`;
    };

    const hist = $('[data-o="hist"]', root);
    const X0 = 20, X1 = 590, Y0 = 14, Y1 = 212;
    const renderHist = () => {
      const p = POPS[st.pop], n = st.n;
      const g = Math.max(1, Math.round(0.2 * n)); // group lattice points so bars stay readable
      const width = g / n;
      const sx = (v) => X0 + ((v - p.lo) / (p.hi - p.lo)) * (X1 - X0);
      const counts = new Map();
      st.sums.forEach((s) => { const b = Math.floor(s / g); counts.set(b, (counts.get(b) || 0) + 1); });
      const total = st.sums.length;
      const sd = p.sigma / Math.sqrt(n);
      const pdf = (x) => Math.exp(-0.5 * ((x - p.mu) / sd) ** 2) / (sd * Math.sqrt(2 * Math.PI));
      const maxCount = Math.max(1, ...counts.values(), total * width * pdf(p.mu));
      const sy = (c) => Y1 - (c / maxCount) * (Y1 - Y0);

      hist.replaceChildren();
      svgEl('line', { x1: X0, y1: Y1, x2: X1, y2: Y1, class: 'axis' }, hist);
      for (let v = Math.ceil(p.lo); v <= p.hi; v++) svgEl('text', { x: sx(v), y: Y1 + 16, class: 'tick' }, hist).textContent = v;
      const lastBin = st.last ? Math.floor(st.last.sum / g) : null;
      counts.forEach((c, b) => {
        const left = (b * g - 0.5) / n, right = (b * g + g - 0.5) / n;
        const x = sx(left), w = Math.max(1.5, sx(right) - x - 1);
        svgEl('rect', { x, y: sy(c), width: w, height: Y1 - sy(c), class: `hbar${b === lastBin ? ' last' : ''}` }, hist);
      });
      if (total >= 30) {
        const pts = [];
        for (let x = p.lo; x <= p.hi; x += (p.hi - p.lo) / 240) pts.push(`${sx(x).toFixed(1)},${sy(total * width * pdf(x)).toFixed(1)}`);
        svgEl('polyline', { points: pts.join(' '), class: 'curve' }, hist);
      }
      svgEl('line', { x1: sx(p.mu), y1: Y0, x2: sx(p.mu), y2: Y1, class: 'mu' }, hist);

      if (total) {
        const means = st.sums.map((s) => s / n);
        const m = means.reduce((s, x) => s + x, 0) / total;
        const spread = Math.sqrt(means.reduce((s, x) => s + (x - m) ** 2, 0) / total);
        $('[data-o="stats"]', root).textContent = `${int.format(total)} samples · average of averages ${m.toFixed(2)} (population ${p.mu.toFixed(2)}) · spread ${spread.toFixed(2)} (theory σ/√n = ${sd.toFixed(2)})` + (total >= 30 ? ' · orange curve: the normal shape the theorem predicts' : '');
      } else {
        $('[data-o="stats"]', root).textContent = 'No samples yet.';
      }
    };

    const showLast = () => {
      if (!st.last) return;
      const vals = st.last.vals;
      const shown = vals.slice(0, 14).join(' · ') + (vals.length > 14 ? ' · …' : '');
      $('[data-o="last"]', root).textContent = `Last sample: ${shown}  →  average ${(st.last.sum / st.n).toFixed(2)}`;
    };

    let cancelBurst = null;
    const reset = () => {
      if (cancelBurst) cancelBurst();
      st.sums = []; st.last = null;
      $('[data-o="last"]', root).textContent = 'Each sample is averaged; the average lands in the histogram.';
      renderHist();
    };

    $$('[data-pop]', root).forEach((b) => b.addEventListener('click', () => {
      st.pop = b.dataset.pop;
      $$('[data-pop]', root).forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
      renderPop(); reset();
    }));
    st.n = bindRange(root, 'n', (v) => `n = ${v}`, (v) => { st.n = v; reset(); });
    $('[data-reset]', root).addEventListener('click', reset);
    $$('[data-draw]', root).forEach((b) => b.addEventListener('click', () => {
      const count = +b.dataset.draw;
      if (count === 1) { st.last = sample(); st.sums.push(st.last.sum); showLast(); renderHist(); return; }
      if (cancelBurst) cancelBurst();
      let done = 0, live = true;
      cancelBurst = () => { live = false; };
      const step = () => {
        if (!live) return;
        const k = reduceMotion ? count : 50;
        for (let i = 0; i < k && done < count; i++, done++) { st.last = sample(); st.sums.push(st.last.sum); }
        showLast(); renderHist();
        if (done < count) requestAnimationFrame(step);
      };
      step();
    }));

    renderPop();
    renderHist();
    $('[data-draw="1000"]', root).click();
  };

  // ---------- explainer: consistent hashing ----------
  widgets.hashring = (root) => {
    // FNV-1a with a murmur3 finalizer: cheap, deterministic, well spread.
    const hash = (str) => {
      let h = 0x811c9dc5;
      for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 0x01000193); }
      h ^= h >>> 16; h = Math.imul(h, 0x85ebca6b); h ^= h >>> 13; h = Math.imul(h, 0xc2b2ae35); h ^= h >>> 16;
      return h >>> 0;
    };
    const NAMES = 'ABCDEFGH'.split('');
    const COLORS = ['#141413', '#d97757', '#6a9bcc', '#788c5d', '#a26da8', '#c9a227', '#3f8f84', '#8c6d5a'];
    const KEYS = Array.from({ length: 96 }, (_, i) => { const id = `user:${1000 + i * 7}`; const h = hash(id); return { id, h, pos: h / 2 ** 32 }; });

    root.innerHTML = `
      <div class="ring-wrap">
        <svg class="ring" viewBox="0 0 400 400" role="img" aria-label="Hash ring with servers and keys"></svg>
        <div class="ring-side">
          <div class="seg" role="group" aria-label="Points per server">
            <button type="button" data-v="1" aria-pressed="true">1 point per server</button>
            <button type="button" data-v="16" aria-pressed="false">16 virtual nodes</button>
          </div>
          <div class="clt-btns">
            <button type="button" class="btn btn-sm" data-add>+ Add server</button>
            <button type="button" class="btn btn-sm" data-remove>− Remove server</button>
          </div>
          <div class="moved-box" data-o="moved">Add or remove a server to see how many of the 96 keys have to move.</div>
          <div class="load" data-o="load"></div>
          <p class="small">Each dot is a key, colored by the server that owns it: the next server point clockwise.</p>
        </div>
      </div>`;

    const st = { n: 4, v: 1, owners: null, moved: new Set() };
    let fadeTimer = 0;
    const ring = $('.ring', root);
    const CX = 200, CY = 200, R = 150;
    const angle = (pos) => pos * 2 * Math.PI - Math.PI / 2;
    const at = (pos, r = R) => [CX + r * Math.cos(angle(pos)), CY + r * Math.sin(angle(pos))];

    const points = (n, v) => {
      const list = [];
      for (let s = 0; s < n; s++) for (let k = 0; k < v; k++) list.push({ s, pos: hash(`server-${NAMES[s]}#${k}`) / 2 ** 32 });
      return list.sort((a, b) => a.pos - b.pos);
    };
    const assign = (pts) => KEYS.map((key) => (pts.find((p) => p.pos >= key.pos) || pts[0]).s);

    const draw = () => {
      const pts = points(st.n, st.v);
      ring.replaceChildren();
      svgEl('circle', { cx: CX, cy: CY, r: R, class: 'track' }, ring);
      // arcs: each server owns the span from the previous point up to its own
      pts.forEach((p, i) => {
        const prev = pts[(i - 1 + pts.length) % pts.length];
        let span = p.pos - prev.pos; if (span <= 0) span += 1;
        const [x0, y0] = at(prev.pos), [x1, y1] = at(p.pos);
        if (pts.length === 1) return;
        svgEl('path', { d: `M${x0},${y0} A${R},${R} 0 ${span > 0.5 ? 1 : 0} 1 ${x1},${y1}`, fill: 'none', stroke: COLORS[p.s], 'stroke-width': 10, opacity: 0.28 }, ring);
      });
      KEYS.forEach((key, i) => {
        const [x, y] = at(key.pos, R);
        svgEl('circle', { cx: x, cy: y, r: 4.2, fill: COLORS[st.owners[i]], class: `key${st.moved.has(i) ? ' moved' : ''}` }, ring);
      });
      pts.forEach((p) => {
        if (st.v === 1) {
          const [x, y] = at(p.pos, R + 24);
          svgEl('circle', { cx: x, cy: y, r: 11, fill: COLORS[p.s], class: 'node-mark' }, ring);
          svgEl('text', { x, y, class: 'node-lbl' }, ring).textContent = NAMES[p.s];
        } else {
          const [x, y] = at(p.pos, R + 16);
          svgEl('circle', { cx: x, cy: y, r: 4, fill: COLORS[p.s] }, ring);
        }
      });
      svgEl('text', { x: CX, y: CY + 4, class: 'center-big' }, ring).textContent = `${st.n} servers`;
      svgEl('text', { x: CX, y: CY + 24, class: 'center-small' }, ring).textContent = `96 keys · ${st.v === 1 ? '1 point' : '16 points'} each`;

      const loads = Array.from({ length: st.n }, (_, s) => st.owners.filter((o) => o === s).length);
      const max = Math.max(...loads, 1);
      $('[data-o="load"]', root).innerHTML = loads.map((c, s) =>
        `<div class="load-row"><span>${NAMES[s]}</span><div class="load-track"><div class="load-fill" data-c="${COLORS[s]}" data-w="${c / max}"></div></div><span>${c}</span></div>`).join('');
      $$('.load-fill', root).forEach((el) => { el.style.width = `${el.dataset.w * 100}%`; el.style.background = el.dataset.c; });

      $('[data-add]', root).disabled = st.n >= NAMES.length;
      $('[data-remove]', root).disabled = st.n <= 2;
    };

    const change = (n, v, verb) => {
      const before = st.owners, nBefore = st.n;
      st.n = n; st.v = v;
      st.owners = assign(points(n, v));
      st.moved = new Set(st.owners.map((o, i) => (o !== before[i] ? i : -1)).filter((i) => i >= 0));
      const box = $('[data-o="moved"]', root);
      if (verb) {
        const modMoved = KEYS.filter((k) => k.h % nBefore !== k.h % n).length;
        const pct = (x) => `${Math.round((x / KEYS.length) * 100)}%`;
        box.innerHTML = `${verb}. Consistent hashing moved <b>${st.moved.size} of 96</b> keys (${pct(st.moved.size)}). Plain <code>mod N</code> hashing would have moved <b>${modMoved}</b> (${pct(modMoved)}).`;
      } else {
        box.textContent = v === 16
          ? 'Virtual nodes scatter each server around the ring, so the load evens out. Now try adding a server.'
          : 'One point per server leaves uneven gaps, so some servers own far more keys than others.';
      }
      draw();
      clearTimeout(fadeTimer);
      if (st.moved.size) fadeTimer = setTimeout(() => { st.moved.clear(); draw(); }, 1800);
    };

    $('[data-add]', root).addEventListener('click', () => change(st.n + 1, st.v, `Added server ${NAMES[st.n]}`));
    $('[data-remove]', root).addEventListener('click', () => change(st.n - 1, st.v, `Removed server ${NAMES[st.n - 1]}`));
    $$('[data-v]', root).forEach((b) => b.addEventListener('click', () => {
      $$('[data-v]', root).forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
      change(st.n, +b.dataset.v, null);
    }));

    st.owners = assign(points(st.n, st.v));
    draw();
  };

  // ---------- explainer: TCP congestion control ----------
  widgets.tcp = (root) => {
    root.innerHTML = `
      <div class="tcp-row">
        <div class="ctrl-grid">
          ${rangeCtrl('loss', 'Random packet loss', 0, 3, 0.1, 0.4)}
          ${rangeCtrl('cap', 'Link + buffer capacity', 20, 80, 2, 48)}
        </div>
        <button type="button" class="btn btn-sm" data-run>New run</button>
      </div>
      <div class="tcp-legend">
        <span><i></i>Congestion window</span><span><i class="ss"></i>Slow-start threshold</span>
        <span><i class="cp"></i>Capacity</span><span><i class="ls"></i>Loss</span><span><i class="zn"></i>Slow start</span>
      </div>
      <svg class="tcp-chart" viewBox="0 0 640 250" role="img" aria-label="Congestion window over 120 round trips"></svg>
      <div class="stat-row">
        <div class="stat"><span class="stat-l">Average window</span><span class="stat-v" data-o="avg"></span></div>
        <div class="stat"><span class="stat-l">Link used</span><span class="stat-v" data-o="util"></span></div>
        <div class="stat"><span class="stat-l">Losses</span><span class="stat-v" data-o="losses"></span></div>
      </div>
      <p class="small" data-o="mathis"></p>
      <p class="small">Simplified Reno model: random per-packet loss, plus a drop whenever the window overflows the link and its buffer. No timeouts, no CUBIC.</p>`;

    const T = 120;
    const st = { loss: 0.4, cap: 48, seed: 7 };
    const rng = (seed) => () => { seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };

    const simulate = () => {
      const rand = rng(st.seed);
      const p = st.loss / 100;
      let cwnd = 1, ssthresh = 64;
      const rows = [];
      for (let t = 0; t < T; t++) {
        const ss = cwnd < ssthresh;
        const overflow = cwnd > st.cap;
        const randomLoss = rand() < 1 - Math.pow(1 - p, cwnd);
        const loss = overflow || randomLoss;
        rows.push({ t, cwnd, ssthresh, ss, loss });
        if (loss) { ssthresh = Math.max(2, Math.floor(cwnd / 2)); cwnd = ssthresh; }
        else if (ss) cwnd = Math.min(cwnd * 2, Math.max(ssthresh, cwnd + 1));
        else cwnd += 1;
      }
      return rows;
    };

    const svg = $('.tcp-chart', root);
    let cancel = null;
    const run = () => {
      if (cancel) cancel();
      const rows = simulate();
      const X0 = 40, X1 = 628, Y0 = 12, Y1 = 220;
      const ymax = Math.ceil((Math.max(st.cap, ...rows.map((r) => r.cwnd)) * 1.12) / 10) * 10;
      const sx = (t) => X0 + (t / (T - 1)) * (X1 - X0);
      const sy = (v) => Y1 - (Math.min(v, ymax) / ymax) * (Y1 - Y0);

      svg.replaceChildren();
      for (let v = 0; v <= ymax; v += ymax / 5) {
        svgEl('line', { x1: X0, y1: sy(v), x2: X1, y2: sy(v), class: 'grid' }, svg);
        svgEl('text', { x: X0 - 8, y: sy(v) + 3.5, class: 'tick', 'text-anchor': 'end' }, svg).textContent = Math.round(v);
      }
      for (let t = 0; t < T; t += 20) svgEl('text', { x: sx(t), y: Y1 + 16, class: 'tick', 'text-anchor': 'middle' }, svg).textContent = t;
      svgEl('text', { x: X1, y: Y1 + 16, class: 'tick', 'text-anchor': 'end' }, svg).textContent = 'round trips →';
      rows.forEach((r) => { if (r.ss) svgEl('rect', { x: sx(r.t) - 2.5, y: Y0, width: (X1 - X0) / (T - 1) + 0.5, height: Y1 - Y0, class: 'ss-zone' }, svg); });
      svgEl('line', { x1: X0, y1: sy(st.cap), x2: X1, y2: sy(st.cap), class: 'cap' }, svg);
      svgEl('text', { x: X1 - 4, y: sy(st.cap) - 6, class: 'cap-lbl', 'text-anchor': 'end' }, svg).textContent = `capacity ${st.cap}`;
      const ssLine = svgEl('polyline', { class: 'ssth' }, svg);
      const line = svgEl('polyline', { class: 'cwnd' }, svg);
      const dots = svgEl('g', {}, svg);

      const show = (k) => {
        const part = rows.slice(0, k);
        line.setAttribute('points', part.map((r) => `${sx(r.t).toFixed(1)},${sy(r.cwnd).toFixed(1)}`).join(' '));
        ssLine.setAttribute('points', part.filter((r) => r.ssthresh <= ymax).map((r) => `${sx(r.t).toFixed(1)},${sy(r.ssthresh).toFixed(1)}`).join(' '));
        dots.replaceChildren();
        part.forEach((r) => { if (r.loss) svgEl('circle', { cx: sx(r.t), cy: sy(r.cwnd), r: 3.6, class: 'loss' }, dots); });
      };
      const avg = rows.reduce((s, r) => s + r.cwnd, 0) / T;
      const used = rows.reduce((s, r) => s + Math.min(r.cwnd, st.cap), 0) / (T * st.cap);
      $('[data-o="avg"]', root).innerHTML = `${avg.toFixed(1)}<span class="unit">segments</span>`;
      $('[data-o="util"]', root).textContent = `${Math.round(used * 100)}%`;
      $('[data-o="losses"]', root).textContent = rows.filter((r) => r.loss).length;
      $('[data-o="mathis"]', root).textContent = st.loss > 0
        ? `Rule of thumb (Mathis et al.): with random loss p, Reno averages about 1.22 / √p = ${(1.22 / Math.sqrt(st.loss / 100)).toFixed(1)} segments, if the link is big enough.`
        : 'With no random loss, only the link size limits the window.';
      if (reduceMotion) { show(T); return; }
      cancel = tween(1600, (t) => show(Math.max(1, Math.round(t * T))));
    };

    st.loss = bindRange(root, 'loss', (v) => `${v.toFixed(1)}%`, (v) => { st.loss = v; run(); });
    st.cap = bindRange(root, 'cap', (v) => `${v} segments`, (v) => { st.cap = v; run(); });
    $('[data-run]', root).addEventListener('click', () => { st.seed += 1; run(); });
    run();
  };

  // ---------- tool: bill splitter ----------
  widgets.bill = (root) => {
    let nextId = 5;
    const st = {
      people: [{ id: 1, name: 'Ana' }, { id: 2, name: 'Ben' }, { id: 3, name: 'Chen' }, { id: 4, name: 'Dee' }],
      items: [
        { name: 'Pork dumplings', price: 14, who: [1, 2, 3, 4] },
        { name: 'Dan dan noodles', price: 16.5, who: [1] },
        { name: 'Mapo tofu', price: 18, who: [2] },
        { name: 'Kung pao chicken', price: 19.5, who: [3] },
        { name: 'Mushroom fried rice', price: 15, who: [4] },
        { name: 'Bottle of Riesling', price: 42, who: [1, 2, 4] },
      ],
      tax: 8.875,
      tip: 18,
    };

    root.innerHTML = `
      <div class="receipt-bg"><div class="receipt">
        <div class="rc-head">
          <div class="rc-kicker">TABLE 12</div>
          <div class="rc-title">Dinner, split fairly</div>
          <div class="rc-sub">ITEMIZED · SHARED DISHES SPLIT EVENLY</div>
        </div>
        <div class="rc-sec">01 / Who’s eating</div>
        <div class="rc-people" data-o="people"></div>
        <button type="button" class="rc-add" data-add-person>+ Add person</button>
        <div class="rc-sec">02 / What you ordered</div>
        <div data-o="items"></div>
        <button type="button" class="rc-add" data-add-item>+ Add item</button>
        <div class="rc-sec">03 / Tax &amp; tip</div>
        <div class="rc-taxtip">
          <label>Sales tax (%)<input class="num" type="number" min="0" max="30" step="0.125" data-tax></label>
          <div><span class="small">Tip on the pre-tax subtotal</span>
            <div class="rc-tips">${[0, 15, 18, 20, 25].map((t) => `<button type="button" data-tip="${t}">${t ? `${t}%` : 'None'}</button>`).join('')}</div>
          </div>
        </div>
        <div class="rc-sum" data-o="sum"></div>
        <div class="rc-split" data-o="split"></div>
        <div class="rc-foot"><span class="small" data-o="note"></span><button type="button" class="btn btn-sm" data-copy>Copy summary</button></div>
      </div></div>`;

    const peopleBox = $('[data-o="people"]', root);
    const itemsBox = $('[data-o="items"]', root);

    const renderPeople = () => {
      peopleBox.replaceChildren(...st.people.map((p) => {
        const wrap = document.createElement('div');
        wrap.className = 'rc-person';
        const inp = document.createElement('input');
        inp.value = p.name; inp.maxLength = 14; inp.setAttribute('aria-label', 'Name');
        inp.addEventListener('input', () => {
          p.name = inp.value.trim() || '?';
          $$(`[data-pid="${p.id}"]`, root).forEach((b) => { b.textContent = p.name; });
          totals();
        });
        const x = document.createElement('button');
        x.type = 'button'; x.className = 'rc-x'; x.textContent = '×'; x.setAttribute('aria-label', `Remove ${p.name}`);
        x.disabled = st.people.length <= 1;
        x.addEventListener('click', () => {
          st.people = st.people.filter((q) => q !== p);
          st.items.forEach((it) => { it.who = it.who.filter((id) => id !== p.id); });
          render();
        });
        wrap.append(inp, x);
        return wrap;
      }));
      $('[data-add-person]', root).disabled = st.people.length >= 10;
    };

    const renderItems = () => {
      itemsBox.replaceChildren(...st.items.map((it, idx) => {
        const row = document.createElement('div');
        row.className = 'rc-item';
        row.innerHTML = `<div class="rc-item-row"><input class="rc-name" aria-label="Item name"><input class="rc-price" type="number" min="0" step="0.5" aria-label="Price in dollars"><button type="button" class="rc-x" aria-label="Remove item">×</button></div><div class="rc-who" role="group" aria-label="Who shared it"></div>`;
        const [name, price] = $$('input', row);
        name.value = it.name;
        price.value = it.price.toFixed(2);
        name.addEventListener('input', () => { it.name = name.value; });
        price.addEventListener('input', () => { it.price = Math.max(0, num(price.value)); totals(); });
        $('.rc-x', row).addEventListener('click', () => { st.items.splice(idx, 1); render(); });
        const who = $('.rc-who', row);
        st.people.forEach((p) => {
          const b = document.createElement('button');
          b.type = 'button'; b.dataset.pid = p.id; b.textContent = p.name;
          b.setAttribute('aria-pressed', String(it.who.includes(p.id)));
          b.addEventListener('click', () => {
            it.who = it.who.includes(p.id) ? it.who.filter((id) => id !== p.id) : [...it.who, p.id];
            b.setAttribute('aria-pressed', String(it.who.includes(p.id)));
            totals();
          });
          who.appendChild(b);
        });
        return row;
      }));
    };

    // Split in cents; largest-remainder rounding so shares add up to the exact total.
    const compute = () => {
      const ids = st.people.map((p) => p.id);
      const food = new Map(ids.map((id) => [id, 0]));
      let unassigned = 0;
      st.items.forEach((it) => {
        const who = it.who.filter((id) => food.has(id));
        if (!who.length) unassigned++;
        const list = who.length ? who : ids;
        list.forEach((id) => food.set(id, food.get(id) + (it.price * 100) / list.length));
      });
      const sub = Math.round([...food.values()].reduce((s, x) => s + x, 0));
      const tax = Math.round((sub * st.tax) / 100);
      const tip = Math.round((sub * st.tip) / 100);
      const total = sub + tax + tip;
      const raw = ids.map((id) => ({ id, exact: sub ? (food.get(id) / sub) * total : total / ids.length }));
      raw.forEach((r) => { r.cents = Math.floor(r.exact); });
      let left = total - raw.reduce((s, r) => s + r.cents, 0);
      [...raw].sort((a, b) => (b.exact - b.cents) - (a.exact - a.cents)).forEach((r) => { if (left > 0) { r.cents++; left--; } });
      return { sub, tax, tip, total, shares: raw, unassigned };
    };

    const totals = () => {
      const r = compute();
      const line = (label, cents, cls = '') => `<div class="rc-line ${cls}"><span>${label}</span><span>${usd.format(cents / 100)}</span></div>`;
      $('[data-o="sum"]', root).innerHTML = line('Food &amp; drinks', r.sub) + line(`Tax ${st.tax}%`, r.tax) + line(`Tip ${st.tip}%`, r.tip) + line('TOTAL', r.total, 'total');
      const split = $('[data-o="split"]', root);
      split.replaceChildren(...r.shares.map((s) => {
        const d = document.createElement('div');
        d.className = 'rc-share';
        const b = document.createElement('b'); b.textContent = st.people.find((p) => p.id === s.id).name;
        const v = document.createElement('span'); v.textContent = usd.format(s.cents / 100);
        d.append(b, v);
        return d;
      }));
      $('[data-o="note"]', root).textContent = r.unassigned
        ? `${r.unassigned} item${r.unassigned > 1 ? 's have' : ' has'} no one ticked, so ${r.unassigned > 1 ? 'they are' : 'it is'} split evenly.`
        : 'Shares add up to the exact total.';
      return r;
    };

    const render = () => { renderPeople(); renderItems(); totals(); };

    const taxInput = $('[data-tax]', root);
    taxInput.value = st.tax;
    taxInput.addEventListener('input', () => { st.tax = clamp(num(taxInput.value), 0, 30); totals(); });
    const tipBtns = $$('[data-tip]', root);
    const setTip = (t) => { st.tip = t; tipBtns.forEach((b) => b.setAttribute('aria-pressed', String(+b.dataset.tip === t))); totals(); };
    tipBtns.forEach((b) => b.addEventListener('click', () => setTip(+b.dataset.tip)));
    $('[data-add-person]', root).addEventListener('click', () => {
      const id = nextId++;
      st.people.push({ id, name: `Guest ${st.people.length + 1}` });
      render();
    });
    $('[data-add-item]', root).addEventListener('click', () => {
      st.items.push({ name: 'New item', price: 0, who: st.people.map((p) => p.id) });
      render();
      const names = $$('.rc-name', root);
      names[names.length - 1].select();
    });
    $('[data-copy]', root).addEventListener('click', async (e) => {
      const r = compute();
      const text = [`Dinner total ${usd.format(r.total / 100)} (incl. tax ${st.tax}% and tip ${st.tip}%)`,
        ...r.shares.map((s) => `${st.people.find((p) => p.id === s.id).name}: ${usd.format(s.cents / 100)}`)].join('\n');
      const btn = e.currentTarget;
      try { await navigator.clipboard.writeText(text); btn.textContent = 'Copied'; } catch { btn.textContent = 'Copy failed'; }
      setTimeout(() => { btn.textContent = 'Copy summary'; }, 1600);
    });

    renderPeople(); renderItems(); setTip(st.tip);
  };

  // ---------- tool: savings calculator ----------
  widgets.savings = (root) => {
    root.innerHTML = `
      <div class="sv-top">
        <div>
          <div class="small">Projected balance</div>
          <div class="sv-big" data-o="big"></div>
          <div class="sv-sub"><i class="sv-legend-c"></i><span data-o="in"></span> &nbsp; <i class="sv-legend-g"></i><span data-o="growth"></span></div>
        </div>
        <div class="small" data-o="rule"></div>
      </div>
      <svg class="sv-chart" viewBox="0 0 640 260" role="img" aria-label="Balance by year, split into contributions and growth"></svg>
      <div class="ctrl-grid">
        ${rangeCtrl('start', 'Starting balance', 0, 100000, 1000, 5000)}
        ${rangeCtrl('monthly', 'Monthly contribution', 0, 3000, 50, 500)}
        ${rangeCtrl('rate', 'Yearly return', 0, 12, 0.5, 6)}
        ${rangeCtrl('years', 'Years', 1, 40, 1, 25)}
      </div>
      <p class="small">Compounded monthly, contributions at month end, no taxes or fees. If the return you enter is after inflation, the result is in today’s dollars.</p>`;

    const st = { start: 5000, monthly: 500, rate: 6, years: 25 };
    const svg = $('.sv-chart', root);
    const X0 = 56, X1 = 628, Y0 = 14, Y1 = 226;
    let series = [];

    const compute = () => {
      const rm = Math.pow(1 + st.rate / 100, 1 / 12) - 1;
      let bal = st.start, put = st.start;
      const out = [{ y: 0, bal, put }];
      for (let m = 1; m <= st.years * 12; m++) {
        bal = bal * (1 + rm) + st.monthly;
        put += st.monthly;
        if (m % 12 === 0) out.push({ y: m / 12, bal, put });
      }
      return out;
    };
    const nice = (v) => { const p = Math.pow(10, Math.floor(Math.log10(v))); const f = v / p; return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10) * p; };
    const short = (v) => (v >= 1e6 ? `$${+(v / 1e6).toFixed(2)}M` : v >= 1e3 ? `$${Math.round(v / 1e3)}k` : `$${Math.round(v)}`);

    const render = () => {
      series = compute();
      const last = series[series.length - 1];
      const top = nice(Math.max(1, last.bal) / 4) * 4;
      const sx = (y) => X0 + (y / st.years) * (X1 - X0);
      const sy = (v) => Y1 - (v / top) * (Y1 - Y0);
      svg.replaceChildren();
      for (let i = 0; i <= 4; i++) {
        const v = (top / 4) * i;
        svgEl('line', { x1: X0, y1: sy(v), x2: X1, y2: sy(v), class: 'grid' }, svg);
        svgEl('text', { x: X0 - 8, y: sy(v) + 3.5, class: 'tick', 'text-anchor': 'end' }, svg).textContent = short(v);
      }
      const stepX = st.years <= 10 ? 1 : st.years <= 20 ? 5 : 10;
      for (let y = 0; y <= st.years; y += stepX) svgEl('text', { x: sx(y), y: Y1 + 18, class: 'tick', 'text-anchor': 'middle' }, svg).textContent = `${y}y`;
      const line = (key) => series.map((d) => `${sx(d.y).toFixed(1)},${sy(d[key]).toFixed(1)}`);
      const putPts = line('put'), balPts = line('bal');
      svgEl('polygon', { points: [...balPts, ...[...putPts].reverse()].join(' '), class: 'a-growth' }, svg);
      svgEl('polygon', { points: [...putPts, `${sx(st.years)},${Y1}`, `${X0},${Y1}`].join(' '), class: 'a-contrib' }, svg);
      hover.line = svgEl('line', { y1: Y0, y2: Y1, class: 'hover-line', visibility: 'hidden' }, svg);
      hover.box = svgEl('g', { class: 'hover-box', visibility: 'hidden' }, svg);
      hover.sx = sx; hover.sy = sy;

      $('[data-o="big"]', root).textContent = usd0.format(last.bal);
      $('[data-o="in"]', root).textContent = `You put in ${usd0.format(last.put)}`;
      $('[data-o="growth"]', root).textContent = `Growth ${usd0.format(Math.max(0, last.bal - last.put))}`;
      $('[data-o="rule"]', root).textContent = st.rate > 0 ? `At ${st.rate}%, money roughly doubles every ${Math.round(72 / st.rate)} years (rule of 72).` : 'At 0%, you keep exactly what you put in.';
    };

    const hover = {};
    const showHover = (evt) => {
      const r = svg.getBoundingClientRect();
      const x = ((evt.clientX - r.left) / r.width) * 640;
      const yr = clamp(Math.round(((x - X0) / (X1 - X0)) * st.years), 0, st.years);
      const d = series[yr];
      const hx = hover.sx(d.y);
      hover.line.setAttribute('x1', hx); hover.line.setAttribute('x2', hx);
      hover.line.setAttribute('visibility', 'visible');
      hover.box.replaceChildren();
      const label = `Year ${d.y}: ${usd0.format(d.bal)} · in ${usd0.format(d.put)}`;
      const w = label.length * 6.1 + 16;
      const bx = clamp(hx - w / 2, X0, X1 - w);
      svgEl('rect', { x: bx, y: Y0, width: w, height: 22, rx: 6 }, hover.box);
      svgEl('text', { x: bx + 8, y: Y0 + 15 }, hover.box).textContent = label;
      hover.box.setAttribute('visibility', 'visible');
    };
    svg.addEventListener('pointermove', showHover);
    svg.addEventListener('pointerleave', () => { hover.line.setAttribute('visibility', 'hidden'); hover.box.setAttribute('visibility', 'hidden'); });

    st.start = bindRange(root, 'start', (v) => usd0.format(v), (v) => { st.start = v; render(); });
    st.monthly = bindRange(root, 'monthly', (v) => usd0.format(v), (v) => { st.monthly = v; render(); });
    st.rate = bindRange(root, 'rate', (v) => `${v}%`, (v) => { st.rate = v; render(); });
    st.years = bindRange(root, 'years', (v) => `${v}`, (v) => { st.years = v; render(); });
    render();
  };

  // ---------- tool: brick breaker ----------
  widgets.game = (root) => {
    root.innerHTML = `
      <div class="game-wrap">
        <canvas class="game-canvas" width="960" height="640" tabindex="0" aria-label="Brick breaker game. Arrow keys move, space launches."></canvas>
        <p class="game-help">mouse / touch / ← → to move · click or space to launch</p>
      </div>`;
    const cv = $('canvas', root);
    const ctx = cv.getContext('2d');
    ctx.scale(2, 2);
    const GW = 480, GH = 320, COLS = 10, ROWS = 5, BW = 44, BH = 14, GAPB = 2, LEFT = 11, TOP = 44;
    const ROW_COLORS = ['#d97757', '#e0906f', '#e8a988', '#efc2a6', '#f4dac8'];
    const g = { state: 'ready', score: 0, lives: 3, level: 1, keys: {}, px: GW / 2, pw: 70, ball: null, bricks: [] };

    const layBricks = () => {
      g.bricks = [];
      for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) g.bricks.push({ x: LEFT + c * (BW + GAPB), y: TOP + r * (BH + GAPB), r, alive: true });
    };
    const resetBall = () => { g.ball = { x: g.px, y: GH - 30, vx: 0, vy: 0, r: 4.5, speed: 250 + (g.level - 1) * 30 }; g.state = 'ready'; };
    const newGame = () => { g.score = 0; g.lives = 3; g.level = 1; layBricks(); resetBall(); };
    const launch = () => {
      if (g.state === 'over' || g.state === 'won') { if (g.state === 'over') newGame(); else { g.level++; layBricks(); resetBall(); } return; }
      if (g.state !== 'ready') return;
      const a = (-60 + Math.random() * 30) * Math.PI / 180;
      g.ball.vx = Math.sin(a) * g.ball.speed; g.ball.vy = -Math.cos(a) * g.ball.speed;
      g.state = 'play';
    };

    const toGame = (evt) => { const r = cv.getBoundingClientRect(); return ((evt.clientX - r.left) / r.width) * GW; };
    cv.addEventListener('pointermove', (e) => { g.px = clamp(toGame(e), g.pw / 2, GW - g.pw / 2); });
    cv.addEventListener('pointerdown', (e) => { cv.focus({ preventScroll: true }); g.px = clamp(toGame(e), g.pw / 2, GW - g.pw / 2); launch(); });
    cv.addEventListener('keydown', (e) => {
      if (['ArrowLeft', 'ArrowRight', ' '].includes(e.key)) e.preventDefault();
      if (e.key === ' ') launch();
      g.keys[e.key] = true;
    });
    cv.addEventListener('keyup', (e) => { g.keys[e.key] = false; });
    cv.addEventListener('blur', () => { g.keys = {}; });

    const step = (dt) => {
      if (g.keys.ArrowLeft) g.px -= 380 * dt;
      if (g.keys.ArrowRight) g.px += 380 * dt;
      g.px = clamp(g.px, g.pw / 2, GW - g.pw / 2);
      const b = g.ball;
      if (g.state === 'ready') { b.x = g.px; b.y = GH - 30; return; }
      if (g.state !== 'play') return;
      b.x += b.vx * dt; b.y += b.vy * dt;
      if (b.x < b.r) { b.x = b.r; b.vx = Math.abs(b.vx); }
      if (b.x > GW - b.r) { b.x = GW - b.r; b.vx = -Math.abs(b.vx); }
      if (b.y < 26 + b.r) { b.y = 26 + b.r; b.vy = Math.abs(b.vy); }
      // paddle: bounce angle depends on where the ball lands
      const py = GH - 22;
      if (b.vy > 0 && b.y + b.r >= py && b.y + b.r <= py + 10 && Math.abs(b.x - g.px) <= g.pw / 2 + b.r) {
        const off = clamp((b.x - g.px) / (g.pw / 2), -1, 1);
        b.speed = Math.min(b.speed * 1.03, 430);
        const a = off * 60 * Math.PI / 180;
        b.vx = Math.sin(a) * b.speed; b.vy = -Math.cos(a) * b.speed;
        b.y = py - b.r;
      }
      for (const k of g.bricks) {
        if (!k.alive) continue;
        if (b.x + b.r < k.x || b.x - b.r > k.x + BW || b.y + b.r < k.y || b.y - b.r > k.y + BH) continue;
        k.alive = false;
        g.score += 10 * (ROWS - k.r);
        const ox = Math.min(b.x + b.r - k.x, k.x + BW - (b.x - b.r));
        const oy = Math.min(b.y + b.r - k.y, k.y + BH - (b.y - b.r));
        if (ox < oy) b.vx = -b.vx; else b.vy = -b.vy;
        break;
      }
      if (g.bricks.every((k) => !k.alive)) g.state = 'won';
      if (b.y - b.r > GH) { g.lives--; if (g.lives <= 0) g.state = 'over'; else resetBall(); }
    };

    const text = (s, x, y, size = 12, color = '#faf9f5', align = 'center') => {
      ctx.font = `500 ${size}px "IBM Plex Mono", ui-monospace, monospace`;
      ctx.fillStyle = color; ctx.textAlign = align; ctx.fillText(s, x, y);
    };
    const draw = () => {
      ctx.fillStyle = '#141413'; ctx.fillRect(0, 0, GW, GH);
      text(`SCORE ${String(g.score).padStart(4, '0')}`, 12, 18, 11, '#b9b4a5', 'left');
      text(`LEVEL ${g.level}`, GW / 2, 18, 11, '#b9b4a5');
      text('♥'.repeat(Math.max(0, g.lives)), GW - 12, 18, 12, '#d97757', 'right');
      ctx.fillStyle = '#2b2a27'; ctx.fillRect(0, 25, GW, 1);
      g.bricks.forEach((k) => { if (k.alive) { ctx.fillStyle = ROW_COLORS[k.r]; ctx.fillRect(k.x, k.y, BW, BH); ctx.fillStyle = 'rgba(0,0,0,.18)'; ctx.fillRect(k.x, k.y + BH - 3, BW, 3); } });
      ctx.fillStyle = '#faf9f5'; ctx.fillRect(g.px - g.pw / 2, GH - 22, g.pw, 8);
      const b = g.ball; ctx.fillRect(Math.round(b.x - b.r), Math.round(b.y - b.r), b.r * 2, b.r * 2);
      if (g.state === 'ready') text('CLICK OR PRESS SPACE', GW / 2, GH / 2 + 40, 12);
      if (g.state === 'over') { text('GAME OVER', GW / 2, GH / 2 + 30, 20, '#d97757'); text('click to play again', GW / 2, GH / 2 + 52, 11, '#b9b4a5'); }
      if (g.state === 'won') { text('CLEARED!', GW / 2, GH / 2 + 30, 20, '#d97757'); text('click for the next level', GW / 2, GH / 2 + 52, 11, '#b9b4a5'); }
    };

    // Only run the loop while the game is on screen and the tab is visible.
    let visible = false, raf = 0, last = 0;
    const loop = (now) => {
      const dt = Math.min(0.033, (now - last) / 1000); last = now;
      step(dt); draw();
      raf = requestAnimationFrame(loop);
    };
    const sync = () => {
      const run = visible && !document.hidden;
      if (run && !raf) { last = performance.now(); raf = requestAnimationFrame(loop); }
      if (!run && raf) { cancelAnimationFrame(raf); raf = 0; }
    };
    new IntersectionObserver((e) => { visible = e[0].isIntersecting; sync(); }).observe(cv);
    document.addEventListener('visibilitychange', sync);
    newGame();
    draw();
  };

  // ---------- illustration: answer while thinking ----------
  widgets.stream = (root) => {
    const PARAS = [
      ['Short answer:', ' probably yes for busy service-to-service calls, and no for anything a browser or partner calls directly.'],
      ['Where gRPC wins:', ' typed contracts generated from .proto files, HTTP/2 multiplexing and streaming. Payloads are smaller and cheaper to parse than JSON.'],
      ['What it costs:', ' harder debugging with everyday HTTP tools, a proxy or gateway for browser clients, and schema discipline the whole team has to keep up.'],
      ['A safe path:', ' move one chatty internal call first, keep REST at the edge, and compare p99 latency and CPU before and after.'],
    ];
    // [status shown while "thinking", pause in ms] before each paragraph
    const PLANS = {
      wait: [['Thinking', 6200], null, null, null],
      interleave: [['Thinking', 1000], ['Checking where the trade-offs bite', 1300], ['Weighing migration cost', 1100], ['Drafting a rollout path', 900]],
    };
    const cols = $$('.stream-col', root);
    let token = 0;

    const play = async (col, plan, my) => {
      const status = $('.stream-status', col);
      const body = $('.stream-body', col);
      body.replaceChildren(); status.replaceChildren();
      const t0 = performance.now();
      let first = null;
      const secs = () => ((performance.now() - t0) / 1000).toFixed(1);
      for (let i = 0; i < PARAS.length; i++) {
        if (plan[i]) {
          const [label, ms] = plan[i];
          status.innerHTML = `<span class="pulse"></span><span></span><span class="t"></span>`;
          status.children[1].textContent = `${label}…`;
          const end = performance.now() + (reduceMotion ? 0 : ms);
          while (performance.now() < end) { if (my !== token) return; status.children[2].textContent = `${secs()} s`; await sleep(100); }
        }
        if (first === null) first = secs();
        status.replaceChildren();
        const p = document.createElement('p');
        const strong = document.createElement('strong');
        const rest = document.createTextNode('');
        p.append(strong, rest);
        body.appendChild(p);
        const words = [PARAS[i][0], ...PARAS[i][1].trim().split(' ')];
        for (let w = 0; w < words.length; w++) {
          if (my !== token) return;
          if (w === 0) strong.textContent = words[0]; else rest.textContent += ` ${words[w]}`;
          if (!reduceMotion) await sleep(26);
        }
      }
      status.textContent = `First words after ${first} s · done at ${secs()} s`;
    };

    const start = () => {
      token++;
      cols.forEach((col) => play(col, PLANS[col.dataset.variant], token));
    };
    $('[data-replay]', root).addEventListener('click', start);
    const io = new IntersectionObserver((e) => { if (e[0].isIntersecting) { io.disconnect(); start(); } }, { threshold: 0.4 });
    io.observe(root);
  };

  // ---------- agent cursor: scroll-scrubbed edits on the article itself ----------
  // Markup: <span data-cua="highlight|circle|type|move" [data-from="dx,dy,deg"]>…</span>, or data-cua on a <p> to move it whole.
  function agentCursor() {
    const easeInOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
    const POINTER = '<svg class="cua-arrow" viewBox="0 0 24 24"><path d="M4 2.5v16.2l4.3-4.1 2.9 6.6 3-1.3-2.9-6.5h6z"/></svg>';
    const IBEAM = '<svg class="cua-ibeam" viewBox="0 0 24 24"><path d="M8.5 3.5h2.2L12 4.6l1.3-1.1h2.2M12 4.6v14.8M8.5 20.5h2.2l1.3-1.1 1.3 1.1h2.2"/></svg>';
    const VERBS = { highlight: 'marking', circle: 'circling', type: 'typing', move: 'moving' };
    // gentle overshoot so dragged text settles instead of stopping dead
    const backOut = (t) => 1 + 2.2 * Math.pow(t - 1, 3) + 1.2 * Math.pow(t - 1, 2);
    const layer = (cls) => { const s = document.createElement('span'); s.className = cls; s.setAttribute('aria-hidden', 'true'); return s; };

    const items = $$('[data-cua]').map((node) => {
      const kind = node.dataset.cua;
      const host = node.matches('p, h2, h3') ? node : node.closest('p, h2, h3');
      let el = node;
      if (node === host) { // whole block: wrap its content so it can move as one piece
        el = document.createElement('span');
        el.append(...host.childNodes);
        host.appendChild(el);
      }
      host.classList.add('cua-host');
      const under = layer('cua-under'), over = layer('cua-over');
      const cursor = layer('cua-cursor');
      cursor.innerHTML = `<span class="cua-ring"></span>${POINTER}${IBEAM}<span class="cua-tag" data-name="Opus 5.5"><span class="cua-verb" data-verb=" · ${node.dataset.verb || VERBS[kind]}"></span></span>`;
      over.appendChild(cursor);
      host.append(under, over);
      const it = { kind, host, el, under, over, cursor, ring: $('.cua-ring', cursor), p: -1 };
      if (kind === 'move') {
        [it.dx, it.dy, it.rot] = (node.dataset.from || '90,28,5').split(',').map(Number);
        el.classList.add('cua-inline');
      }
      if (kind === 'type') {
        it.full = el.textContent;
        it.typed = document.createElement('span');
        it.caret = document.createElement('span'); it.caret.className = 'cua-caret';
        it.rest = document.createElement('span'); it.rest.className = 'cua-rest'; it.rest.textContent = it.full;
        el.replaceChildren(it.typed, it.caret, it.rest);
      }
      if (kind === 'circle') { it.svg = svgEl('svg', { class: 'cua-circle' }, over); it.path = svgEl('path', {}, it.svg); }
      return it;
    });
    if (!items.length) return;

    // Text line boxes of an element, relative to its host block.
    const lines = (it) => {
      const range = document.createRange();
      range.selectNodeContents(it.el);
      const hr = it.host.getBoundingClientRect();
      return [...range.getClientRects()].filter((r) => r.width > 1).map((r) => ({ x: r.left - hr.left, y: r.top - hr.top, w: r.width, h: r.height }));
    };

    // Each verb returns where the cursor tip should be for action progress s (0..1).
    const act = {
      highlight(it, s) {
        const ls = lines(it);
        const bars = it.under.children;
        while (bars.length < ls.length) it.under.appendChild(layer('cua-bar'));
        while (bars.length > ls.length) it.under.lastChild.remove();
        const total = ls.reduce((sum, l) => sum + l.w, 0);
        let d = s * total, tip = null;
        ls.forEach((l, i) => {
          const local = clamp(d / l.w, 0, 1);
          d -= l.w;
          const bar = bars[i];
          bar.style.left = `${l.x - 2}px`; bar.style.top = `${l.y + l.h * 0.12}px`;
          bar.style.width = `${l.w + 4}px`; bar.style.height = `${l.h * 0.84}px`;
          bar.style.transform = `scaleX(${local}) rotate(${i % 2 ? 0.3 : -0.4}deg)`;
          if (!tip && (local < 1 || i === ls.length - 1)) tip = { x: l.x + l.w * local, y: l.y + l.h * 0.78 };
        });
        return tip || { x: 0, y: 0 };
      },
      type(it, s) {
        const n = Math.round(s * it.full.length);
        if (it.typed.textContent.length !== n) { it.typed.textContent = it.full.slice(0, n); it.rest.textContent = it.full.slice(n); }
        it.caret.classList.toggle('on', s > 0 && s < 1 && it.p < 0.95);
        const hr = it.host.getBoundingClientRect(), cr = it.caret.getBoundingClientRect();
        return { x: cr.left - hr.left + 1, y: cr.top - hr.top + cr.height * 0.55 };
      },
      circle(it, s) {
        const l = lines(it)[0];
        if (!l) return { x: 0, y: 0 };
        const key = `${l.x}|${l.y}|${l.w}|${l.h}`;
        if (it.key !== key) { // a hand-drawn loop: slightly wobbly ellipse that overshoots its start
          it.key = key;
          const cx = l.x + l.w / 2, cy = l.y + l.h / 2, rx = l.w / 2 + 12, ry = l.h / 2 + 7;
          const pts = [];
          for (let i = 0; i <= 72; i++) {
            const t = -2.4 + (i / 72) * Math.PI * 2.18;
            const wob = 1 + 0.035 * Math.sin(3 * t + 0.7) + i * 0.0009;
            pts.push(`${(cx + Math.cos(t) * rx * wob).toFixed(1)},${(cy + Math.sin(t) * ry * wob - i * 0.04).toFixed(1)}`);
          }
          it.path.setAttribute('d', `M${pts.join(' L')}`);
          it.len = it.path.getTotalLength();
          it.path.style.strokeDasharray = it.len;
        }
        it.path.style.strokeDashoffset = it.len * (1 - s);
        const pt = it.path.getPointAtLength(Math.max(0.01, s * it.len));
        return { x: pt.x, y: pt.y };
      },
      move(it, s, p) {
        const lh = parseFloat(getComputedStyle(it.host).lineHeight) || 30;
        const k = s >= 1 ? 0 : 1 - backOut(s);
        it.el.style.transformOrigin = `6px ${lh * 0.55}px`;
        it.el.style.transform = k ? `translate(${it.dx * k}px, ${it.dy * k}px) rotate(${it.rot * k}deg)` : '';
        it.el.classList.toggle('cua-lifted', p > 0.3 && p < 0.88);
        return { x: it.el.offsetLeft + 6 + it.dx * k, y: it.el.offsetTop + lh * 0.55 + it.dy * k };
      },
    };

    const render = (it, p) => {
      const s = easeInOut(clamp((p - 0.34) / 0.52, 0, 1));
      const at = act[it.kind](it, s, p); // during the approach s is 0, so `at` is where the action starts
      const approach = ease(clamp(p / 0.28, 0, 1));
      const press = clamp((p - 0.28) / 0.06, 0, 1) - clamp((p - 0.86) / 0.06, 0, 1);
      const leave = clamp((p - 0.92) / 0.08, 0, 1);
      const vis = clamp(p / 0.08, 0, 1) * (1 - leave);
      let x = at.x, y = at.y;
      if (approach < 1) { // curved glide in from the lower left
        const sx = at.x - 90, sy = at.y + 70, cx = at.x - 100, cy = at.y + 4, t = approach;
        x = (1 - t) ** 2 * sx + 2 * (1 - t) * t * cx + t * t * at.x;
        y = (1 - t) ** 2 * sy + 2 * (1 - t) * t * cy + t * t * at.y;
      }
      x += leave * 22; y += leave * 16;
      it.cursor.style.opacity = p > 0 && p < 1 ? vis : 0;
      it.cursor.style.transform = `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0) rotate(${(24 * (1 - approach)).toFixed(1)}deg) scale(${(1 - 0.14 * press).toFixed(3)})`;
      it.cursor.classList.toggle('typing', it.kind === 'type' && p > 0.3 && p < 0.92);
      it.cursor.classList.toggle('acting', press > 0.5);
      const r = clamp((p - 0.28) / 0.14, 0, 1);
      it.ring.style.opacity = r > 0 && r < 1 ? (1 - r) * 0.7 : 0;
      it.ring.style.transform = `scale(${0.3 + r * 1.3})`;
    };

    let queued = false;
    const update = (force) => {
      queued = false;
      const vh = innerHeight;
      const maxScroll = document.documentElement.scrollHeight - vh;
      for (const it of items) {
        const top = it.host.getBoundingClientRect().top;
        // 0 when the block enters near the bottom of the screen, 1 once it reaches the middle,
        // or wherever it stops if the page ends first
        const start = vh * 0.9;
        const end = Math.min(start - 120, Math.max(vh * 0.45, top - (maxScroll - scrollY)));
        const p = reduceMotion ? 1 : clamp((start - top) / (start - end), 0, 1);
        if (p === it.p && force !== true) continue;
        it.p = p;
        render(it, p);
      }
    };
    addEventListener('scroll', () => { if (!queued) { queued = true; requestAnimationFrame(update); } }, { passive: true });
    addEventListener('resize', () => update(true));
    document.fonts?.ready.then(() => update(true));
    update(true);
  }

  // ---------- thevibeworks: Claude Code style spinners and a status line that reads along ----------
  function vibes() {
    const FRAMES = ['·', '✢', '✳', '✶', '✻', '✽', '✻', '✶', '✳', '✢'];
    const spins = $$('[data-spin]');
    const pill = $('.vibe-status');
    const verbEl = $('.vs-verb', pill), meta = $('.vs-meta', pill);
    const glyph = $('.vs-glyph', pill);
    const SECTIONS = [['top', 'Reading'], ['hero-demo', 'Exploding'], ['interactive-answers', 'Noodling'], ['everyday', 'Planning'],
      ['learn', 'Pondering'], ['build', 'Tinkering'], ['how-it-works', 'Cogitating'], ['sooner', 'Streaming'], ['safety', 'Sandboxing'],
      ['about', 'Fact-checking'], ['next', 'Vibing'], ['more', 'Browsing']]
      .map(([id, v]) => [document.getElementById(id), v]).filter(([el]) => el);
    const blocks = $$('.post p, .post h1, .post h2, .post h3, .post li, .msg-user')
      .map((el) => ({ el, words: (el.textContent.match(/\S+/g) || []).length }));
    const t0 = performance.now();
    const fmtTok = (n) => (n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n));
    let tokens = 0, verb = 'Reading', frame = 0, nearTop = true, interrupted = false;

    const set = (el, text) => { if (el.textContent !== text) el.textContent = text; };
    const render = () => {
      if (interrupted) { set(verbEl, '⎿ Interrupted by user'); set(meta, '(esc to resume)'); }
      else {
        set(verbEl, `${verb}…`);
        set(meta, `(${Math.floor((performance.now() - t0) / 1000)}s · ↓ ${fmtTok(tokens)} tokens · esc to interrupt)`);
      }
      pill.classList.toggle('interrupted', interrupted);
      if (interrupted) set(glyph, '✻');
      pill.classList.toggle('show', !nearTop);
    };

    // tokens "read" = words above the reading line, at roughly 1.3 tokens a word
    let queued = false;
    const measure = () => {
      queued = false;
      const line = innerHeight * 0.6;
      let words = 0;
      for (const b of blocks) if (b.el.offsetParent && b.el.getBoundingClientRect().top < line) words += b.words;
      tokens = Math.round(words * 1.3);
      verb = 'Reading';
      for (const [el, v] of SECTIONS) if (el.getBoundingClientRect().top < line) verb = v;
      nearTop = scrollY < 420;
      render();
    };
    addEventListener('scroll', () => { if (!queued) { queued = true; requestAnimationFrame(measure); } }, { passive: true });
    addEventListener('resize', measure);

    // esc really does interrupt it, like the real thing
    addEventListener('keydown', (e) => {
      if (e.key !== 'Escape' || nearTop || getComputedStyle(pill).visibility === 'hidden') return;
      if (e.target.closest && e.target.closest('input, textarea, select, canvas')) return;
      interrupted = !interrupted;
      render();
    });

    setInterval(() => {
      if (document.hidden) return;
      frame = (frame + 1) % FRAMES.length;
      if (!reduceMotion) {
        for (const sp of spins) {
          const mode = sp.dataset.spin;
          if (mode === 'always' && interrupted) continue;
          const link = sp.closest('a');
          const on = mode === 'always' || (link && (link.matches(':hover') || link === document.activeElement));
          set(sp, on ? FRAMES[frame] : '✻');
        }
      }
      if (!nearTop) render();
    }, 130);
    measure();
  }

  // ---------- letters: the title streams in like an answer, then reacts to you ----------
  function letters() {
    const h1 = $('.post-head h1');
    const hls = $$('.hl', h1);
    if (reduceMotion) { h1.classList.add('lt-ready'); hls.forEach((h) => h.classList.add('on')); return; }

    // Split text into word and letter spans; cursor-effect spans and their overlays stay untouched.
    const split = (root) => {
      const out = [];
      const walk = (node) => {
        for (const child of [...node.childNodes]) {
          if (child.nodeType === 3) {
            const frag = document.createDocumentFragment();
            for (const part of child.textContent.split(/(\s+)/)) {
              if (!part) continue;
              if (/^\s+$/.test(part)) { frag.append(part); continue; }
              const word = document.createElement('span');
              word.className = 'lt-word';
              for (const chr of part) {
                const c = document.createElement('span');
                c.className = /\d/.test(chr) ? 'lt lt-num' : 'lt';
                c.textContent = chr;
                word.append(c);
                out.push(c);
              }
              frag.append(word);
            }
            child.replaceWith(frag);
          } else if (child.nodeType === 1 && !child.matches('[data-cua], .cua-under, .cua-over')) {
            walk(child);
          }
        }
      };
      walk(root);
      return out;
    };
    const label = (el) => el.setAttribute('aria-label', el.textContent.replace(/\s+/g, ' ').trim());

    // Letters near the pointer lift, swell, lean away and blush; eased toward their targets each frame.
    const hoverable = matchMedia('(hover: hover) and (pointer: fine)').matches;
    const react = (host, list) => {
      if (!hoverable || !list.length) return;
      const cur = new Float32Array(list.length), target = new Float32Array(list.length);
      let centers = [], raf = 0;
      const radius = host === h1 ? 130 : 90;
      const frame = () => {
        let moving = false;
        list.forEach((c, i) => {
          cur[i] += (target[i] - cur[i]) * 0.2;
          if (Math.abs(target[i] - cur[i]) < 0.003) cur[i] = target[i]; else moving = true;
          c.style.setProperty('--k', cur[i].toFixed(3));
        });
        raf = moving ? requestAnimationFrame(frame) : 0;
      };
      const kick = () => { if (!raf) raf = requestAnimationFrame(frame); };
      host.addEventListener('pointerenter', () => {
        const hr = host.getBoundingClientRect();
        centers = list.map((c) => { const r = c.getBoundingClientRect(); return [r.left - hr.left + r.width / 2, r.top - hr.top + r.height / 2]; });
      });
      host.addEventListener('pointermove', (e) => {
        const hr = host.getBoundingClientRect();
        const px = e.clientX - hr.left, py = e.clientY - hr.top;
        centers.forEach(([x, y], i) => {
          const k = clamp(1 - Math.hypot(x - px, (y - py) * 1.3) / radius, 0, 1);
          target[i] = k * k * (3 - 2 * k);
          list[i].style.setProperty('--dir', x < px ? -1 : 1);
        });
        kick();
      });
      host.addEventListener('pointerleave', () => { target.fill(0); kick(); });
    };

    // Clicking a letter sends a ripple outward, like pressing a key.
    const ripple = (host, list) => host.addEventListener('click', (e) => {
      const hit = list.indexOf(e.target.closest('.lt'));
      if (hit < 0) return;
      list.forEach((c, j) => {
        c.classList.remove('lt-pop');
        void c.offsetWidth; // restart the animation
        c.style.animationDelay = `${Math.abs(j - hit) * 24}ms`;
        c.classList.add('lt-pop');
      });
    });
    const popDone = (e) => { if (e.animationName === 'lt-pop') { e.target.classList.remove('lt-pop'); e.target.style.animationDelay = ''; } };

    // Title: stream in by "tokens", roll the version digits, then sweep the highlight.
    label(h1);
    const chars = split(h1);
    h1.addEventListener('animationend', popDone);
    react(h1, chars);
    ripple(h1, chars);
    const SPLITS = { interactive: [5, 6], everyone: [5, 3] };
    const tokens = [];
    $$('.lt-word', h1).forEach((w) => {
      const ls = [...w.children], word = w.textContent;
      if (/\d/.test(word)) ls.forEach((l) => tokens.push([l]));
      else if (SPLITS[word]) { let at = 0; for (const n of SPLITS[word]) { tokens.push(ls.slice(at, at + n)); at += n; } }
      else tokens.push(ls);
    });
    const onScreen = h1.getBoundingClientRect().bottom > 0 && h1.getBoundingClientRect().top < innerHeight;
    if (!onScreen) { h1.classList.add('lt-ready'); hls.forEach((h) => h.classList.add('on')); }
    else {
      h1.classList.add('lt-intro');
      chars.forEach((c) => c.classList.add('lt-pending'));
      h1.classList.add('lt-ready');
      const roll = (c) => {
        const final = c.textContent;
        let n = 0;
        const t = setInterval(() => {
          c.textContent = n++ < 11 ? String(Math.floor(Math.random() * 10)) : final;
          if (n > 11) clearInterval(t);
        }, 48);
      };
      let tip = null;
      tokens.forEach((tok, i) => setTimeout(() => {
        tok.forEach((c) => { c.classList.remove('lt-pending'); if (c.classList.contains('lt-num')) roll(c); });
        if (tip) tip.classList.remove('lt-tip');
        tip = tok[tok.length - 1];
        tip.classList.add('lt-tip');
      }, 160 + i * 90));
      const end = 160 + tokens.length * 90;
      hls.forEach((h, i) => setTimeout(() => h.classList.add('on'), end + 220 + i * 320));
      setTimeout(() => { if (tip) tip.classList.remove('lt-tip'); h1.classList.remove('lt-intro'); }, end + 1700);
    }

    // Section titles: rise in once when they arrive, then react like the title.
    const heads = $$('.post h2, .post h3').filter((h) => !h.closest('.hero-demo, .tabpanel, .chat, .pane-card'));
    // Reveal once a title's top crosses the line, even if a fast scroll already carried it past,
    // so nothing can stay hidden.
    const waiting = new Set();
    const reveal = () => {
      for (const h of waiting) {
        if (h.getBoundingClientRect().top > innerHeight * 0.9) continue;
        waiting.delete(h);
        h.classList.add('lt-go');
        setTimeout(() => h.classList.remove('lt-wait', 'lt-go'), 1400);
      }
      if (!waiting.size) removeEventListener('scroll', onScroll);
    };
    let queued = false;
    const onScroll = () => { if (!queued) { queued = true; requestAnimationFrame(() => { queued = false; reveal(); }); } };
    heads.forEach((h) => {
      label(h);
      const ls = split(h);
      ls.forEach((c, i) => c.style.setProperty('--i', i));
      h.addEventListener('animationend', popDone);
      react(h, ls);
      ripple(h, ls);
      if (h.getBoundingClientRect().top > innerHeight) { h.classList.add('lt-wait'); waiting.add(h); }
    });
    if (waiting.size) addEventListener('scroll', onScroll, { passive: true });

    // Brand: a little wave on hover.
    const brandLetters = split($('.brand-word'));
    brandLetters.forEach((c, i) => c.style.setProperty('--i', i));
    $('.brand').addEventListener('animationend', popDone);
  }

  // ---------- boot ----------
  chrome();
  agentCursor();
  vibes();
  letters();
  $$('[data-tabs]').forEach(tabs);
  const lazy = new IntersectionObserver((entries) => entries.forEach((e) => { if (e.isIntersecting) startWidget(e.target); }), { rootMargin: '600px 0px' });
  $$('[data-widget]').forEach((el) => lazy.observe(el));
})();
