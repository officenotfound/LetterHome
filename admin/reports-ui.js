// Admin Reports: Overview, Audience, Search, Sales and Health. Uses the helpers in app.html (api, post, go, esc,
// setTitle, setMain). Every value that comes from outside (paths, searches, places) goes through esc().
(function () {
  'use strict';
  const state = { days: 28, site: 'all', screen: 'overview', data: null, live: null, ext: null, health: null, timer: null, run: 0, tables: [] };
  const PH = window.matchMedia('(max-width:760px)');
  const SITE_NAMES = { all: 'All sites', ca: 'letterhome.ca', us: 'letterhome.us', uk: 'letterhome.co.uk' };
  const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  const NAMES = { CA: 'Canada', US: 'United States', GB: 'United Kingdom', AU: 'Australia', NZ: 'New Zealand', IN: 'India', PH: 'Philippines', FR: 'France', DE: 'Germany', MX: 'Mexico' };
  // Rough middle of each country, for the map: [longitude, latitude].
  const PLACES = { CA: [-100, 56], US: [-97, 38], MX: [-102, 23], BR: [-52, -10], AR: [-64, -34], CO: [-74, 4], PE: [-75, -9], CL: [-71, -33], GB: [-2, 54], IE: [-8, 53], FR: [2, 46], DE: [10, 51], NL: [5, 52], BE: [4, 50], ES: [-4, 40], PT: [-8, 39], IT: [12, 42], CH: [8, 47], AT: [14, 47], PL: [19, 52], SE: [16, 62], NO: [9, 61], FI: [26, 64], DK: [10, 56], RU: [90, 60], UA: [31, 49], RO: [25, 46], GR: [22, 39], TR: [35, 39], IL: [35, 31], AE: [54, 24], SA: [45, 24], QA: [51, 25], KW: [48, 29], EG: [30, 27], MA: [-7, 32], DZ: [3, 28], NG: [8, 9], GH: [-1, 8], KE: [38, 0], ZA: [24, -29], ET: [40, 9], IN: [79, 22], PK: [70, 30], BD: [90, 24], LK: [81, 7], NP: [84, 28], CN: [104, 35], HK: [114, 22], TW: [121, 24], JP: [138, 37], KR: [128, 36], VN: [108, 16], TH: [101, 15], MY: [102, 4], SG: [104, 1], ID: [113, -2], PH: [122, 12], AU: [134, -25], NZ: [172, -42], JM: [-77, 18], TT: [-61, 11], DO: [-70, 19], CU: [-79, 22], IR: [53, 32], IQ: [44, 33], LB: [36, 34], JO: [36, 31] };

  const e = s => esc(s == null ? '' : String(s));
  const num = n => Math.round(n || 0).toLocaleString('en-CA');
  const cash = c => '$' + ((c || 0) / 100).toLocaleString('en-CA', { minimumFractionDigits: (c || 0) % 100 ? 2 : 0, maximumFractionDigits: 2 });
  const sum = a => a.reduce((x, y) => x + y, 0);
  const tip = t => `data-tip="${e(t)}"`;
  const span = d => (d.period === 'all' ? `since ${fullDay(d.since)}` : `over the last ${d.days} days`);
  const fullDay = d => new Date(d + 'T12:00:00Z').toLocaleDateString('en-CA', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
  const dayName = d => new Date(d + 'T12:00:00Z').toLocaleDateString('en-CA', { month: 'short', day: 'numeric', timeZone: 'UTC' });
  const ago = iso => {
    if (!iso) return 'Not yet';
    const t = typeof iso === 'number' ? iso : Date.parse(/[zZ]|T/.test(iso) ? iso : iso.replace(' ', 'T') + 'Z');
    const m = Math.max(0, Math.round((Date.now() - t) / 60000));
    return m < 1 ? 'Just now' : m < 60 ? `${m} min ago` : m < 1440 ? `${Math.round(m / 60)} h ago` : `${Math.round(m / 1440)} days ago`;
  };
  const none = text => `<p class="rp-none">${e(text)}</p>`;
  const place = code => NAMES[code] || code;

  // ── Building blocks ────────────────────────────────────────────────────────────────────────
  function table(cols, rows) {
    if (!rows.length) return none('Nothing to show for this period yet.');
    const right = i => typeof rows[0][i] === 'number';
    return `<div class="rp-scroll"><table><thead><tr>${cols.map((c, i) => `<th class="${right(i) ? 'rp-r' : ''}">${e(c)}</th>`).join('')}</tr></thead><tbody>${rows.map(r => `<tr>${r.map((v, i) => `<td class="${right(i) ? 'rp-r' : ''}">${typeof v === 'number' ? v.toLocaleString('en-CA') : e(v)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
  }
  // opts: { id: export name on the server, cols, rows }
  function card(w, title, how, body, opts) {
    let tools = '';
    if (opts) {
      const i = state.tables.push(opts) - 1;
      tools = `<button class="rp-mini" data-table="${i}" aria-pressed="false">Table</button>` + (opts.id
        ? `<a class="rp-mini" download href="/api/admin/reports/export?screen=${state.screen}&table=${opts.id}&days=${state.days}&site=${state.site}">CSV</a>` : '');
    }
    return `<section class="rp-card rp-s${w}"><div class="rp-head"><h3>${e(title)}</h3>${tools}</div>${how ? `<p class="rp-how">${e(how)}</p>` : ''}<div class="rp-body">${body}</div></section>`;
  }
  const section = name => `<h2 class="rp-sec">${e(name)}</h2>`;

  function bars(rows, color = 'var(--rp-c1)') {
    if (!rows.length || !rows.some(r => r[1])) return none('Nothing to show for this period yet.');
    const max = Math.max(...rows.map(r => r[1]));
    return rows.map(r => `<div class="rp-bar" ${tip(`${r[0]}: ${num(r[1])}`)}><div><span>${e(r[0])}${r[2] ? ` <small>${e(r[2])}</small>` : ''}</span><b>${num(r[1])}</b></div><i style="--w:${r[1] / max * 100}%;--c:${color}"></i></div>`).join('');
  }
  function split(rows) {
    const total = sum(rows.map(r => r[1]));
    if (!total) return none('Nothing to show for this period yet.');
    const color = i => `var(--rp-c${i % 5 + 1})`;
    return `<div class="rp-split">${rows.map((r, i) => `<i style="flex:${r[1]};background:${color(i)}" ${tip(`${r[0]}: ${num(r[1])}`)}></i>`).join('')}</div>${rows.map((r, i) => `<div class="rp-key"><span><i style="background:${color(i)}"></i>${e(r[0])}</span><b>${Math.round(r[1] / total * 100)}%</b></div>`).join('')}`;
  }
  const tiles = items => `<div class="rp-tiles">${items.map(([v, l, m]) => `<div class="rp-tile"><b>${v == null ? '–' : e(v)}</b><span>${e(l)}</span>${m ? `<small>${e(m)}</small>` : ''}</div>`).join('')}</div>`;
  const rows = items => items.map(x => `<div class="rp-row"><span class="rp-dot${x.warn ? ' w' : ''}"></span><div>${e(x.name)}${x.sub ? `<small>${e(x.sub)}</small>` : ''}</div>${x.button || ''}</div>`).join('');
  const button = (label, attrs) => `<button class="rp-btn" ${attrs}>${e(label)}</button>`;
  const link = (label, href) => `<a class="rp-btn" href="${e(href)}" target="_blank" rel="noopener">${e(label)}</a>`;

  function spark(a) {
    if (!a || a.length < 2 || !a.some(v => v)) return '<svg viewBox="0 0 200 30" aria-hidden="true"><path d="M0,28H200" stroke="var(--a-line)"/></svg>';
    const max = Math.max(...a), min = Math.min(...a);
    const p = a.map((v, i) => `${(i * 200 / (a.length - 1)).toFixed(1)},${(27 - (v - min) / (max - min || 1) * 24).toFixed(1)}`).join('L');
    return `<svg viewBox="0 0 200 30" preserveAspectRatio="none" aria-hidden="true"><path d="M${p}" fill="none" stroke="var(--rp-c1)" stroke-width="1.5" vector-effect="non-scaling-stroke"/></svg>`;
  }
  function strip(items) {
    return `<div class="rp-kpis">${items.map(k => {
      let change = '';
      if (k.pair) {
        const { now, before } = k.pair;
        if (before > 0) { const p = Math.round((now - before) / before * 100); change = `<span class="${p >= 0 ? 'rp-good' : 'rp-bad'}">${p >= 0 ? '▲' : '▼'} ${Math.abs(p)}%</span> `; }
      }
      return `<div class="rp-kpi"><span>${e(k.label)}</span><b>${e(k.value)}</b><small>${change}${e(!change && k.note === 'vs previous period' ? 'nothing earlier to compare' : k.note || '')}</small>${k.series ? spark(k.series) : ''}</div>`;
    }).join('')}</div>`;
  }

  function lines(dates, series, money) {
    if (!dates.length || !series.some(s => s.d.some(v => v))) return none('No figures for this period yet.');
    const W = PH.matches ? 340 : 760, H = PH.matches ? 200 : 230, l = 44, b = 20;
    const top = Math.max(...series.flatMap(s => s.d));
    const max = money ? Math.max(top * 1.12, 100) : Math.max(Math.ceil(top * 1.12), 3);
    const x = i => l + i * (W - l - 4) / Math.max(1, dates.length - 1), y = v => H - b - Math.max(0, v) / max * (H - b - 8);
    const label = v => (money ? '$' + num(v / 100) : num(v));
    let g = '';
    for (let k = 0; k <= 3; k++) { const v = max * k / 3; g += `<line x1="${l}" x2="${W}" y1="${y(v)}" y2="${y(v)}" stroke="var(--a-line)"/><text x="${l - 6}" y="${y(v) + 4}" text-anchor="end">${label(v)}</text>`; }
    for (const i of [...new Set([0, Math.floor((dates.length - 1) / 2), dates.length - 1])]) g += `<text x="${x(i)}" y="${H - 3}" text-anchor="${i === 0 ? 'start' : i === dates.length - 1 ? 'end' : 'middle'}">${(dates.length > 300 ? fullDay : dayName)(dates[i])}</text>`;
    const paths = series.map(s => {
      const p = s.d.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`).join('L');
      return (s.fill ? `<path d="M${p}L${x(dates.length - 1)},${H - b}L${l},${H - b}Z" fill="${s.c}" opacity=".1"/>` : '') + `<path d="M${p}" fill="none" stroke="${s.c}" stroke-width="2" ${s.dash ? 'stroke-dasharray="4 5" opacity=".55"' : ''}/>`;
    }).join('');
    const step = (W - l) / dates.length;
    const hot = dates.map((d, i) => `<rect x="${x(i) - step / 2}" y="0" width="${step}" height="${H - b}" fill="transparent" ${tip(`${(dates.length > 300 ? fullDay : dayName)(d)}\n${series.map(s => `${s.name}: ${money ? cash(s.d[i]) : num(s.d[i])}`).join('\n')}`)}/>`).join('');
    return `<div class="rp-legend">${series.map(s => `<span><i style="background:${s.c};${s.dash ? 'opacity:.55' : ''}"></i>${e(s.name)}</span>`).join('')}</div><svg viewBox="0 0 ${W} ${H}">${g}${paths}${hot}</svg>`;
  }

  // A dotted world map: coarse continent outlines filled with dots, a circle per country.
  const LAND = [[[-168, 66], [-130, 70], [-95, 72], [-62, 60], [-55, 50], [-70, 43], [-81, 25], [-97, 25], [-105, 20], [-85, 10], [-79, 8], [-106, 23], [-118, 32], [-125, 48], [-150, 60], [-168, 55]], [[-80, 10], [-60, 10], [-35, -6], [-48, -26], [-65, -42], [-72, -54], [-75, -45], [-71, -18], [-81, -5]], [[-10, 36], [-9, 44], [-2, 48], [-6, 58], [10, 64], [22, 71], [40, 68], [75, 73], [110, 77], [170, 69], [180, 65], [160, 58], [140, 50], [130, 35], [121, 30], [108, 18], [104, 2], [97, 16], [88, 22], [80, 8], [73, 19], [60, 25], [48, 30], [43, 13], [35, 30], [28, 36], [40, 45], [28, 45], [15, 40]], [[-17, 15], [-10, 30], [10, 37], [32, 31], [43, 12], [51, 12], [40, -5], [40, -15], [32, -30], [20, -35], [12, -17], [9, 4], [-8, 4]], [[114, -22], [130, -12], [142, -11], [153, -27], [147, -39], [135, -35], [115, -34]], [[-45, 60], [-20, 70], [-20, 82], [-60, 82], [-55, 70]]];
  let dots = '';
  function landDots() {
    if (dots) return dots;
    const inside = (x, y, p) => { let c = false; for (let i = 0, j = p.length - 1; i < p.length; j = i++) { const [xi, yi] = p[i], [xj, yj] = p[j]; if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) c = !c; } return c; };
    for (let lat = 80; lat >= -55; lat -= 3.4) for (let lon = -178; lon <= 180; lon += 3.4) if (LAND.some(p => inside(lon, lat, p))) dots += `M${((lon + 180) * 2.1).toFixed(1)},${((82 - lat) * 2.1).toFixed(1)}h0`;
    return dots;
  }
  function worldMap(list) {
    const shown = list.filter(c => PLACES[c.code]);
    const max = Math.max(1, ...shown.map(c => c.visitors));
    const marks = shown.map((c, i) => {
      const [lon, lat] = PLACES[c.code], x = (lon + 180) * 2.1, y = (82 - lat) * 2.1, r = 4 + Math.sqrt(c.visitors / max) * 17;
      return `<g ${tip(`${c.name}: ${num(c.visitors)} visitors`)}><circle cx="${x}" cy="${y}" r="${r}" fill="var(--rp-c1)" opacity=".26"/><circle cx="${x}" cy="${y}" r="3.5" fill="var(--rp-c1)" stroke="var(--a-surface)" stroke-width="1.5"/>${i < 5 ? `<text class="rp-place" x="${x}" y="${y - r - 4}" text-anchor="middle">${e(c.name)}</text>` : ''}</g>`;
    }).join('');
    return `<svg viewBox="0 0 756 292"><path d="${landDots()}" stroke="var(--a-muted)" opacity=".35" stroke-width="3.6" stroke-linecap="round"/>${marks}</svg>`
      + (PH.matches ? `<div class="rp-gap">${bars(list.slice(0, 6).map(c => [c.name, c.visitors]))}</div>` : '');
  }

  function heatMap(grid) {
    const max = Math.max(...grid.flat());
    if (!max) return none('No visits recorded for this period yet.');
    const hour = h => `${h % 12 || 12}${h < 12 ? 'am' : 'pm'}`;
    const cell = (x, y, w, h, d, hr) => `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="3" fill="var(--rp-c1)" opacity="${(.07 + .93 * grid[d][hr] / max).toFixed(2)}" ${tip(`${DAYS[d]} at ${hour(hr)}\n${num(grid[d][hr])} visitors`)}/>`;
    let s = '';
    if (PH.matches) {
      DAYS.forEach((d, i) => { s += `<text x="${44 + i * 42 + 19}" y="11" text-anchor="middle">${d}</text>`; for (let h = 0; h < 24; h++) s += cell(44 + i * 42, 18 + h * 19, 39, 16, i, h); });
      for (let h = 0; h < 24; h += 3) s += `<text x="38" y="${30 + h * 19}" text-anchor="end">${hour(h)}</text>`;
      return `<svg viewBox="0 0 340 476">${s}</svg>`;
    }
    DAYS.forEach((d, i) => { s += `<text x="28" y="${i * 24 + 16}" text-anchor="end">${d}</text>`; for (let h = 0; h < 24; h++) s += cell(36 + h * 30, i * 24, 27, 21, i, h); });
    for (let h = 0; h < 24; h += 3) s += `<text x="${36 + h * 30 + 13}" y="184" text-anchor="middle">${hour(h)}</text>`;
    return `<svg viewBox="0 0 756 190">${s}</svg>`;
  }

  // Source, then the first page, then what happened. Band thickness is the number of visitors.
  function journeyChart(links) {
    if (!links.length) return none('No visitors recorded for this period yet.');
    const ends = ['Paid an order', 'Opened order page, did not pay', 'Only read'];
    const second = links.filter(l => ends.includes(l[1])), first = links.filter(l => !ends.includes(l[1]));
    const names = (list, i) => [...new Set(list.map(l => l[i]))];
    const total = name => sum(links.filter(l => l[1] === name).map(l => l[2])) || sum(links.filter(l => l[0] === name).map(l => l[2]));
    const cols = [names(first, 0), names(first, 1), ends.filter(x => second.some(l => l[1] === x))];
    cols.forEach(c => c.sort((a, b) => (c === cols[2] ? 0 : total(b) - total(a))));
    if (PH.matches) {
      return `<p class="rp-how">First page opened</p>${bars(cols[1].map(n => [n, total(n)]))}<p class="rp-how rp-gap">What happened</p>${bars(cols[2].map(n => [n, total(n)]), 'var(--rp-c3)')}`;
    }
    const all = sum(first.map(l => l[2]));
    const H = 340, gap = 14, X = [160, 390, 600], k = (H - gap * 5) / all, pos = {};
    cols.forEach((c, ci) => { let y = 0; c.forEach(n => { const h = Math.max(3, total(n) * k); pos[`${ci}|${n}`] = { y, h, v: total(n), out: y, inn: y, ci, n }; y += h + gap; }); });
    const height = Math.max(H, ...Object.values(pos).map(p => p.y + p.h)) + 6;
    const color = n => { const i = cols[0].indexOf(n); return i >= 0 ? `var(--rp-c${i % 5 + 1})` : n === 'Paid an order' ? 'var(--rp-good)' : 'var(--a-muted)'; };
    let s = '';
    for (const [list, a, bcol] of [[first, 0, 1], [second, 1, 2]]) {
      for (const l of [...list].sort((p, q) => cols[bcol].indexOf(p[1]) - cols[bcol].indexOf(q[1]))) {
        const from = pos[`${a}|${l[0]}`], to = pos[`${bcol}|${l[1]}`], h = l[2] * k, y1 = from.out + h / 2, y2 = to.inn + h / 2;
        from.out += h; to.inn += h;
        const paid = l[1] === 'Paid an order';
        s += `<path d="M${X[a] + 10},${y1}C${X[a] + 110},${y1} ${X[bcol] - 100},${y2} ${X[bcol]},${y2}" fill="none" stroke="${a === 0 ? color(l[0]) : paid ? 'var(--rp-good)' : 'var(--a-muted)'}" stroke-width="${Math.max(1, h - 1)}" opacity="${a === 0 ? .34 : paid ? .65 : .16}" ${tip(`${l[0]} to ${l[1]}\n${num(l[2])} visitors`)}/>`;
      }
    }
    s += Object.values(pos).map(p => `<rect x="${X[p.ci]}" y="${p.y}" width="10" height="${p.h}" rx="2" fill="${color(p.n)}"/><text class="rp-t" x="${p.ci ? X[p.ci] + 17 : X[0] - 8}" y="${p.y + Math.min(p.h / 2 + 4, 14)}" text-anchor="${p.ci ? 'start' : 'end'}">${e(p.n === 'Opened order page, did not pay' ? 'Did not pay' : p.n)} · ${num(p.v)}</text>`).join('');
    return `<svg viewBox="0 0 760 ${height}">${s}</svg>`;
  }

  function scatter(pages) {
    const list = pages.filter(p => p.position >= 1 && p.position <= 30 && p.impressions > 0);
    if (!list.length) return none('No search figures yet.');
    const W = PH.matches ? 340 : 760, H = 300, l = 46, b = 34, max = Math.max(...list.map(p => p.impressions)) * 1.15;
    const x = p => l + (30 - p) / 29 * (W - l - 10), y = v => H - b - Math.sqrt(v / max) * (H - b - 46); // headroom keeps circles clear of the zone label
    let g = `<rect x="${x(20)}" y="8" width="${x(8) - x(20)}" height="${H - b - 8}" rx="6" fill="var(--rp-c2)" opacity=".09"/><text class="rp-t" x="${(x(20) + x(8)) / 2}" y="24" text-anchor="middle">Opportunity zone</text>`;
    for (const v of [30, 20, 10, 1]) g += `<line x1="${x(v)}" x2="${x(v)}" y1="8" y2="${H - b}" stroke="var(--a-line)"/><text x="${x(v)}" y="${H - b + 16}" text-anchor="middle">${v === 1 ? '1st' : '#' + v}</text>`;
    for (const v of [0, max / 4, max]) g += `<line x1="${l}" x2="${W}" y1="${y(v)}" y2="${y(v)}" stroke="var(--a-line)"/><text x="${l - 6}" y="${y(v) + 4}" text-anchor="end">${num(v)}</text>`;
    g += `<text x="${W / 2}" y="${H - 2}" text-anchor="middle">Position in search (right is better)</text>`;
    return `<svg viewBox="0 0 ${W} ${H}">${g}${list.map(p => `<circle cx="${x(p.position)}" cy="${y(p.impressions)}" r="${Math.min(18, 5 + Math.sqrt(p.clicks) * 2.2)}" fill="${p.position > 8 && p.position <= 20 ? 'var(--rp-c2)' : 'var(--rp-c1)'}" opacity=".7" stroke="var(--a-surface)" stroke-width="2" ${tip(`${p.key}\nPosition ${p.position}\nShown ${num(p.impressions)} times\n${num(p.clicks)} clicks`)}/>`).join('')}</svg>`;
  }

  function gauge(name, score) {
    const color = score >= 90 ? 'var(--rp-good)' : score >= 50 ? 'var(--rp-warn)' : 'var(--rp-bad)', C = Math.PI * 50;
    return `<div class="rp-gauge" ${tip(`${name}: ${score} out of 100`)}><svg viewBox="0 0 120 70"><path d="M10 62a50 50 0 0 1 100 0" fill="none" stroke="var(--rp-faint)" stroke-width="10" stroke-linecap="round"/><path d="M10 62a50 50 0 0 1 100 0" fill="none" stroke="${color}" stroke-width="10" stroke-linecap="round" stroke-dasharray="${C * score / 100} 999"/><text x="60" y="60" text-anchor="middle" class="rp-score">${score}</text></svg><div>${e(name)}</div><small class="${score >= 90 ? 'rp-good' : score >= 50 ? 'rp-warn' : 'rp-bad'}">${score >= 90 ? 'Fast' : score >= 50 ? 'Could be faster' : 'Slow'}</small></div>`;
  }

  // ── Screens ────────────────────────────────────────────────────────────────────────────────
  const outside = (key, render) => {
    const x = state.ext?.[key];
    if (!state.ext) return none('Loading…');
    if (!x || x.configured === false) return none('Not connected yet. See Health, Connections.');
    if (x.error) return none(x.error);
    return render(x);
  };
  const liveBox = (name, render) => `<div data-live="${name}">${state.live ? render(state.live) : none('Loading…')}</div>`;
  const LIVE = {
    active: l => `<div class="rp-big"><span class="rp-pulse"></span>${num(l.active)}</div>${l.activePages.length ? bars(l.activePages) : none('No one on the sites in the last 30 minutes.')}`,
    orders: l => (l.orders.length ? rows(l.orders.map(o => ({ name: `Order #${o.id} to ${o.recipient_city || o.destination_country || 'unknown'}, ${cash(o.price_cents)}`, sub: `${ago(o.paid_at || o.created_at)}, ${String(o.status).replace(/_/g, ' ')}`, warn: o.status === 'paid', button: button('Open', `data-go="/admin/orders/${Number(o.id)}"`) }))) : none('No orders yet.')),
    feed: l => (l.events.length ? `<div class="rp-feed">${rows(l.events.map(x => ({ name: x.text, sub: `${x.detail ? x.detail + ' · ' : ''}${ago(x.at)}`, warn: x.warn })))}</div>` : none('Nothing in the last 24 hours.')),
  };

  const SCREENS = {
    overview(d) {
      const k = d.kpis, s = d.series, o = d.overview;
      const top = o.ordersBySource[0];
      const money = state.ext?.stripe;
      const target = o.target;
      const all = d.period === 'all', oneSite = d.site !== 'all';
      return {
        summary: k.orders.now
          ? `Revenue of <b>${cash(k.revenue.now)}</b> from <b>${num(k.orders.now)} order${k.orders.now === 1 ? '' : 's'}</b> ${span(d)}${k.revenue.before ? `, ${k.revenue.now >= k.revenue.before ? 'up' : 'down'} on the previous period` : ''}.${top ? ` Most orders came from <b>${e(top[0])}</b>.` : ''}`
          : `No paid orders ${span(d)}. <b>${num(k.visitors.now)}</b> people visited.`,
        kpis: [
          { label: 'Revenue', value: cash(k.revenue.now), pair: k.revenue, note: all ? `since ${fullDay(d.since)}` : 'vs previous period', series: s.revenue },
          { label: 'Orders', value: num(k.orders.now), pair: k.orders, note: 'paid', series: s.orders },
          { label: 'Visitors', value: num(k.visitors.now), pair: k.visitors, note: 'unique', series: s.visitors },
          { label: 'Profit (estimate)', value: cash(k.profit.now), pair: k.profit, note: 'after print and card fees', series: s.profit },
        ],
        body: section('Today')
          + card(4, 'Action items', 'Ordered by priority.', o.actions.length
            ? `<ul class="rp-todo">${o.actions.map(a => `<li><span class="${a.level === 'High' ? 'rp-bad' : a.level === 'Medium' ? 'rp-warn' : 'rp-muted'}">${e(a.level)}</span><span>${e(a.text)}</span>${button(a.button, `data-go="${e(a.href)}"`)}</li>`).join('')}</ul>`
            : none('Nothing needs you right now.'))
          + card(4, 'Recent orders', 'Newest first.', liveBox('orders', LIVE.orders))
          + card(4, 'Active visitors', 'Last 30 minutes, by page.', liveBox('active', LIVE.active))
          + section('Performance')
          + card(8, 'Daily revenue', all ? 'Every day on record. Canadian dollars.' : 'This period (solid) against the one before (dotted). Canadian dollars.',
            lines(s.dates, [{ name: all ? 'Revenue' : 'This period', d: s.revenue, c: 'var(--rp-c1)', fill: 1 }, ...(all ? [] : [{ name: 'Previous', d: s.revenuePrev, c: 'var(--rp-c1)', dash: 1 }])], true),
            { id: 'daily', cols: ['Day', 'Revenue', ...(all ? [] : ['Previous'])], rows: s.dates.map((day, i) => [day, s.revenue[i] / 100, ...(all ? [] : [s.revenuePrev[i] / 100])]) })
          + card(4, 'Monthly order target', 'This calendar month.',
            (target.goal ? `<div class="rp-big">${num(target.month)} <small>of ${num(target.goal)} orders</small></div><div class="rp-bar"><i style="--w:${Math.min(100, target.month / target.goal * 100)}%;--c:var(--rp-c1)"></i></div><div class="rp-key"><span>Reached</span><b>${Math.round(target.month / target.goal * 100)}%</b></div><div class="rp-key"><span>Remaining</span><b>${num(Math.max(0, target.goal - target.month))}</b></div>`
              : `<div class="rp-big">${num(target.month)} <small>orders so far</small></div>`)
            + `<form class="rp-target" data-target><label>Target<input type="number" min="0" max="1000000" inputmode="numeric" value="${target.goal || ''}" aria-label="Monthly order target"></label><button class="rp-btn" type="submit">Save</button></form>`)
          + card(4, 'Orders by source', 'Where paying customers came from.', bars(o.ordersBySource), { id: 'sources', cols: ['Source', 'Orders'], rows: o.ordersBySource })
          + card(4, 'Conversion funnel', 'People remaining at each step.', bars(o.funnel, 'var(--rp-c3)'), { id: 'funnel', cols: ['Step', 'People'], rows: o.funnel })
          + card(4, 'Payouts', 'From Stripe, all sites.', outside('stripe', m => rows([
            { name: m.nextPayout ? `${cash(m.nextPayout.amount)} arriving ${dayName(new Date(m.nextPayout.arrival * 1000).toISOString().slice(0, 10))}` : 'No payout on the way', sub: 'Next payout' },
            { name: `${cash(m.available)} available`, sub: 'In your Stripe balance' },
            { name: `${cash(m.pending)} still clearing`, sub: 'Available in a few days' },
            { name: m.disputes ? `${m.disputes} dispute${m.disputes === 1 ? '' : 's'} to answer` : 'No disputes', sub: m.currency, warn: m.disputes > 0, button: button('Open', 'data-go="/admin/stripe"') },
          ])))
          + section('Activity')
          + card(12, 'Live activity', 'Visits, orders and order-form problems as they happen. Updates every 15 seconds.', liveBox('feed', LIVE.feed)),
      };
    },

    audience(d) {
      const a = d.audience, k = d.kpis, s = d.series;
      const named = a.countries.map(c => ({ ...c, name: NAMES[c.code] || c.name }));
      const total = sum(a.heat.flat());
      let best = [0, 0, 0];
      a.heat.forEach((row, i) => row.forEach((v, h) => { if (v > best[0]) best = [v, i, h]; }));
      return {
        summary: k.visitors.now
          ? `<b>${num(k.visitors.now)}</b> people visited${named[0] ? `, most from <b>${e(named[0].name)}</b>` : ''}. <b>${k.phone.now}%</b> used a phone.${total ? ` The busiest time is <b>${DAYS[best[1]]} around ${best[2] % 12 || 12}${best[2] < 12 ? 'am' : 'pm'}</b> (Toronto time).` : ''}`
          : 'No visitors recorded for this period yet.',
        kpis: [
          { label: 'Visitors', value: num(k.visitors.now), pair: k.visitors, note: 'unique', series: s.visitors },
          { label: 'On phones', value: k.phone.now + '%', note: 'of visitors', series: s.phone },
          { label: 'From AI assistants', value: num(k.ai.now), pair: k.ai, note: 'visitors', series: s.ai },
          { label: 'Pages per visitor', value: String(k.pagesPer.now), pair: k.pagesPer, note: 'in the period' },
        ],
        body: section('Where visitors come from')
          + card(8, 'Visitors by country', 'Circle size shows visitor numbers.', named.length ? worldMap(named) : none('No countries recorded yet.'), { id: 'countries', cols: ['Country', 'Visitors'], rows: named.map(c => [c.name, c.visitors]) })
          + card(4, 'Traffic channels', 'How visitors reached the sites.', bars(a.channels), { id: 'channels', cols: ['Channel', 'Visitors'], rows: a.channels })
          + card(4, 'Cities', 'From Google Analytics, all sites.', outside('analytics', g => bars(g.cities)))
          + card(4, 'Device language', 'From Google Analytics, all sites.', outside('analytics', g => bars(g.languages)))
          + card(4, 'New and returning', d.period === 'all' ? 'Returning means they came on more than one day.' : 'Whether they had visited before this period.', split([['New', a.visitorsNew], ['Returning', a.visitorsReturning]]))
          + section('What they do')
          + card(8, 'Top pages', 'Views, and orders from people who arrived on that page.', table(['Page', 'Views', 'Orders'], a.topPages), { id: 'pages', cols: ['Page', 'Views', 'Orders'], rows: a.topPages })
          + card(4, 'Devices', 'Visitors by device.', bars(a.devices), { id: 'devices', cols: ['Device', 'Visitors'], rows: a.devices })
          + card(12, 'Engagement', 'Time and attention from Google Analytics. Clarity figures (scrolling and frustration signs) always cover the last 3 days. All sites.',
            tiles([
              ...(state.ext?.analytics?.configured && !state.ext.analytics.error ? [[`${Math.floor(state.ext.analytics.seconds / 60)}m ${state.ext.analytics.seconds % 60}s`, 'Time per visit', 'Average'], [state.ext.analytics.engagedPct + '%', 'Engaged visits', 'Stayed or did something']] : [[null, 'Time per visit', 'Google Analytics'], [null, 'Engaged visits', 'Google Analytics']]),
              ...(() => {
                const c = state.ext?.clarity && state.ext.clarity.configured !== false ? state.ext.clarity : {};
                return [[c.scroll == null ? null : Math.round(c.scroll) + '%', 'Of a page read', 'Average scroll'], [c.quickback, 'Quick backs', 'Left straight away'], [c.dead, 'Dead taps', 'Nothing happened'], [c.rage, 'Frustrated taps', 'Same spot, many times'], [c.errors, 'Page errors', 'Something broke']];
              })(),
            ]))
          + card(12, 'Visits by day and hour', 'Darker means busier. Toronto time.', heatMap(a.heat), { id: 'hours', cols: ['Day', 'Hour', 'Visits'], rows: a.heat.flatMap((row, i) => row.map((v, h) => [DAYS[i], h, v])) })
          + card(12, 'Referring sites', 'Other websites that sent visitors.', bars(a.referrers, 'var(--rp-c3)'), { id: 'referrers', cols: ['Site', 'Visitors'], rows: a.referrers }),
      };
    },

    search(d) {
      const q = d.search, g = q.engines.google || {}, b = q.engines.bing || {};
      const clicks = (g.clicks || 0) + (b.clicks || 0), shown = (g.impressions || 0) + (b.impressions || 0);
      const near = q.pages.filter(p => p.position > 8 && p.position <= 20 && p.impressions >= 20).length;
      const pair = (x, key, before) => (x[before] == null ? null : { now: x[key], before: x[before] });
      return {
        summary: shown
          ? `Your pages were shown <b>${num(shown)} times</b> in search and clicked <b>${num(clicks)} times</b> ${q.standIn ? 'in the latest 28 days' : d.period === 'all' ? 'over all the history Google and Bing keep' : `in the latest ${d.days} days they have published`}. <b>${num(near)} page${near === 1 ? ' is' : 's are'}</b> close to the top and the easiest to improve.${q.standIn ? ` <br><b>Figures for this period have not been fetched yet.</b> ${button('Fetch now', 'data-run="search"')}` : ''}`
          : 'No search figures yet. Connect Google and Bing under Health, Connections.',
        kpis: [
          { label: 'Google clicks', value: num(g.clicks), pair: pair(g, 'clicks', 'beforeClicks'), note: g.to ? `to ${dayName(g.to)}` : '', series: q.google },
          { label: 'Bing clicks', value: num(b.clicks), pair: pair(b, 'clicks', 'beforeClicks'), note: b.to ? `to ${dayName(b.to)}` : '', series: q.bing },
          { label: 'Times shown', value: num(shown), note: 'Google and Bing', series: q.shown },
          { label: 'Google position', value: g.position ? String(g.position) : '–', note: 'average, 1 is top' },
        ],
        body: section('Results')
          + card(8, 'Search clicks', 'By day. Google runs 2 to 3 days behind and Bing about 2.', lines(q.dates, [{ name: 'Google', d: q.google, c: 'var(--rp-c1)', fill: 1 }, { name: 'Bing', d: q.bing, c: 'var(--rp-c2)' }]), { id: 'clicks', cols: ['Day', 'Google', 'Bing'], rows: q.dates.map((day, i) => [day, q.google[i], q.bing[i]]) })
          + card(4, 'Index coverage', 'Pages Google has indexed, as of the last check.', q.index.checked ? `<div class="rp-big">${Math.round(q.index.indexed / q.index.checked * 100)}%</div><div class="rp-bar"><i style="--w:${q.index.indexed / q.index.checked * 100}%;--c:var(--rp-c3)"></i></div><div class="rp-key"><span>Indexed</span><b>${num(q.index.indexed)}</b></div><div class="rp-key"><span>Checked</span><b>${num(q.index.checked)}</b></div>` : none('Not checked yet. Run it from Health, Connections.'))
          + section('What to improve')
          + card(12, 'Ranking opportunities', 'Each circle is a page; height shows times shown. Pages ranked 8th to 20th are the easiest to move up.', scatter(q.pages), { id: 'pages', cols: ['Page', 'Position', 'Shown', 'Clicks'], rows: q.pages.map(p => [p.key, p.position, p.impressions, p.clicks]) })
          + card(12, 'Search queries', 'Searches that showed your pages.', table(['Query', 'Shown', 'Clicks', 'Position'], q.queries.slice(0, 12).map(x => [x.key, x.impressions, x.clicks, x.position])), { id: 'queries', cols: ['Query', 'Shown', 'Clicks', 'Position'], rows: q.queries.map(x => [x.key, x.impressions, x.clicks, x.position]) })
          + card(12, 'Not yet indexed', 'As of the last check. Press Why to see the reason and what to do.', q.missing.length
            ? q.missing.map(m => rows([{ name: m.url.replace(/^https?:\/\//, ''), sub: m.coverage, warn: true, button: button(state.help?.url === m.url ? 'Close' : 'Why', `data-help="${e(m.url)}" aria-expanded="${state.help?.url === m.url}"`) }]) + (state.help?.url === m.url ? helpPanel(state.help) : '')).join('') + `<div class="rp-gap">${button('Send changed pages to Bing', 'data-run="indexnow"')}</div>`
            : none(q.index.checked ? 'Every checked page is indexed.' : 'Not checked yet.'), { id: 'missing', cols: ['Page', 'Google says'], rows: q.missing.map(m => [m.url, m.coverage]) })
          + section('Searchers')
          + card(6, 'Search clicks by country', 'From Google.', bars(q.countries.map(c => [c.key, c.clicks])), { id: 'countries', cols: ['Country', 'Clicks', 'Shown'], rows: q.countries.map(c => [c.key, c.clicks, c.impressions]) })
          + card(6, 'Search devices', 'From Google.', split(q.devices.map(x => [x.key, x.clicks])))
          + section('Site checks')
          + card(6, 'Bing crawl', d.period === 'all' ? "Bing's robot, all the history Bing keeps." : `Bing's robot over the last ${d.days} days.`, outside('bing', x => tiles([[num(x.crawled), 'Pages read'], [num(x.errors), 'Errors'], [num(x.inIndex), 'Pages in Bing'], [num(x.links), 'Links to you'], [x.quota == null ? null : num(x.quota), 'Send-ins left today']])))
          + card(6, 'Content audit', q.audit ? `All sites, checked ${ago(q.audit.ran_at).toLowerCase()}.` : 'Runs every night.', q.audit ? tiles([[num(q.audit.pages), 'Pages checked'], [num(q.audit.counts.high), 'Serious issues'], [num(q.audit.counts.med), 'Worth fixing'], [num(q.audit.counts.low), 'Minor']]) + `<div class="rp-gap">${button('Open the list', 'data-go="/admin/seo-audit"')}</div>` : none('Not run yet.')),
      };
    },

    sales(d) {
      const s = d.sales, k = d.kpis, se = d.series;
      const rate = k.sendViews.now ? Math.round(k.orders.now / k.sendViews.now * 100) : 0;
      return {
        summary: k.sendViews.now
          ? `<b>${num(k.sendViews.now)}</b> people opened the order page and <b>${num(k.orders.now)}</b> orders were paid${k.orders.now ? `, about <b>${rate} in 100</b>` : ''}.${s.problems[0] ? ` The most common form problem is <b>${e(s.problems[0][0].toLowerCase())}</b>.` : ''}`
          : 'No one has opened the order page in this period.',
        kpis: [
          { label: 'Opened order page', value: num(k.sendViews.now), pair: k.sendViews, note: 'people', series: se.send },
          { label: 'Paid orders', value: num(k.orders.now), pair: k.orders, note: '', series: se.orders },
          { label: 'Average order', value: cash(k.aov.now), pair: k.aov, note: 'Canadian dollars' },
          { label: 'Repeat buyers', value: num(k.repeat.now), pair: k.repeat, note: 'bought more than once' },
        ],
        body: section('Path to purchase')
          + card(12, 'Customer journey', 'Source, first page, then outcome. Band width shows visitor numbers.', journeyChart(s.journey), { id: 'journey', cols: ['From', 'To', 'Visitors'], rows: s.journey })
          + card(4, 'Form drop-off causes', d.site === 'all' ? 'Most frequent first.' : 'Most frequent first. Counted for all sites together.', bars(s.problems.map(p => [p[0], p[1], p[2] ? `${p[2]} on phones` : '']), 'var(--rp-c2)'), { id: 'problems', cols: ['Problem', 'Times', 'On phones'], rows: s.problems })
          + card(4, 'Friction', 'From Clarity, all sites. Always the last 3 days.', outside('clarity', c => rows([
            { name: `${c.dead == null ? 0 : num(c.dead)} taps that did nothing`, sub: 'Dead clicks' },
            { name: `${c.rage == null ? 0 : num(c.rage)} bursts of frustrated tapping`, sub: 'Rage clicks' },
            { name: 'Watch what happened', sub: 'Replays open in Clarity', button: link('Open', 'https://clarity.microsoft.com/projects') },
          ])))
          + card(4, 'Self-reported source', 'Asked after payment.', bars(s.heard), { id: 'heard', cols: ['Answer', 'Orders'], rows: s.heard })
          + section('Money')
          + card(8, 'Profit by destination', 'Green is estimated profit, grey the rest of the revenue.', s.profit.length ? s.profit.map(p => {
            const max = Math.max(...s.profit.map(x => x.revenue));
            return `<div class="rp-bar" ${tip(`${place(p.code)}\n${p.orders} orders\nRevenue ${cash(p.revenue)}\nProfit ${cash(p.profit)}`)}><div><span>${e(place(p.code))} <small>${num(p.orders)} orders</small></span><b>${cash(p.profit)} <small>of ${cash(p.revenue)}</small></b></div><svg viewBox="0 0 100 4" preserveAspectRatio="none" class="rp-stack"><rect width="${p.revenue / max * 100}" height="4" fill="var(--rp-faint)"/><rect width="${Math.max(0, p.profit) / max * 100}" height="4" fill="var(--rp-good)"/></svg></div>`;
          }).join('') : none('No orders in this period.'), { id: 'profit', cols: ['Destination', 'Revenue', 'Profit'], rows: s.profit.map(p => [place(p.code), p.revenue / 100, p.profit / 100]) })
          + card(4, 'Payment methods', 'From Stripe, all sites.', outside('stripe', m => split(m.methods)))
          + card(12, 'Payment issues and fees', `From Stripe, all sites, ${d.period === 'all' ? 'all time' : `last ${d.days} days`}.`, outside('stripe', m => tiles([[num(m.declined), 'Declined payments'], [num(m.refunds), 'Refunds', cash(m.refundedCents)], [num(m.disputes), 'Open disputes'], [cash(m.fees), 'Stripe fees']])))
          + section('After the order')
          + card(4, 'Fulfilment time', 'Days from payment to mailing.', bars(s.fulfilment, 'var(--rp-c3)'), { id: 'fulfilment', cols: ['Time', 'Orders'], rows: s.fulfilment })
          + card(8, 'Emails, codes and messages', d.site === 'all' ? 'Order-related activity.' : 'Order-related activity. Email and message counts cover all sites.', tiles([[num(s.extras.emailsSent), 'Emails sent'], [s.extras.emailsTracked ? Math.round(s.extras.emailsOpened / s.extras.emailsTracked * 100) + '%' : null, 'Tracked emails opened'], [num(s.extras.codes), 'Used a discount code'], [num(s.extras.offers), 'Bought after a cart offer'], [num(s.extras.messages), 'Messages to answer']])),
      };
    },

    health(d) {
      const h = d.health, sv = state.health;
      const pages = h.speed.filter(p => p.score != null);
      const short = u => u.replace(/^https?:\/\//, '').replace(/\/$/, '');
      const slow = pages.filter(p => p.score < 50).length;
      const gb = n => (n / 1e9).toFixed(1) + ' GB';
      const job = (name, when, warnAfterDays) => [name, when ? ago(when) : 'Not yet', when && (Date.now() - Date.parse(/T/.test(when) ? when : when.replace(' ', 'T') + 'Z')) < warnAfterDays * 86400000 ? 'Fine' : 'Check'];
      const jobs = [job('Search fetch', h.jobs.searchFetch, 2), job('Google index check', h.jobs.indexCheck, 2), job('Page speed check', h.jobs.speedCheck, 8), job('Content audit', h.jobs.contentAudit, 2),
        ['Database backup', sv?.backup ? `${sv.backup.ageHours} h ago` : sv ? 'None found' : 'Loading', sv?.backup && sv.backup.ageHours < 30 ? 'Fine' : 'Check']];
      const source = (name, fresh, on, run, setup) => ({ name: `${name} · ${fresh}`, sub: on ? 'Connected' : 'Not set up', warn: !on, button: on ? (run ? button('Refresh', `data-run="${run}"`) : '') : button('Set up', `data-go="${setup}"`) });
      return {
        summary: slow ? `<b>${slow} page${slow === 1 ? ' is' : 's are'}</b> slow on phones.` : pages.length ? 'Your main pages are loading well on phones.' : 'Page speed has not been checked yet.',
        kpis: null,
        body: section('Availability')
          + card(12, 'Server running time', 'The last 90 days. Share of each day the Letterhome server was running. Grey means no record yet. Network outages are caught by your uptime monitor, not here.',
            `<div class="rp-days">${h.uptime.map(u => `<i class="${u.share == null ? 'x' : u.share < .995 ? 'o' : ''}" ${tip(`${dayName(u.day)}: ${u.share == null ? 'no record' : Math.round(u.share * 100) + '% of the day'}`)}></i>`).join('')}</div>`,
            { id: 'uptime', cols: ['Day', 'Percent'], rows: h.uptime.map(u => [u.day, u.share == null ? '' : Math.round(u.share * 100)]) })
          + section('Speed and quality')
          + card(5, 'Mobile speed', 'Score out of 100; 90 or higher is fast.', pages.length ? `<div class="rp-gauges">${pages.slice(0, 7).map(p => gauge(short(p.url), p.score)).join('')}</div>` : none('Not checked yet.'))
          + card(7, 'Page quality', 'Google PageSpeed scores out of 100.', table(['Page', 'Speed', 'Easy to use', 'Good practice', 'Search ready'], h.speed.map(p => [short(p.url), p.score ?? '–', p.a11y ?? '–', p.practices ?? '–', p.seo ?? '–'])), { id: 'speed', cols: ['Page', 'Speed', 'Easy to use', 'Good practice', 'Search ready'], rows: h.speed.map(p => [short(p.url), p.score ?? '', p.a11y ?? '', p.practices ?? '', p.seo ?? '']) })
          + section('Server')
          + card(7, 'Server', 'The computer the sites run on.', sv ? tiles([
            [sv.disk ? Math.round((1 - sv.disk.free / sv.disk.total) * 100) + '%' : null, 'Disk used', sv.disk ? `${gb(sv.disk.free)} free` : ''],
            [sv.mem ? Math.round((1 - (sv.mem.available ?? sv.mem.free) / sv.mem.total) * 100) + '%' : null, 'Memory used'],
            [sv.cert_days == null ? null : `${sv.cert_days} days`, 'Security certificate', 'Until it expires'],
            [sv.pm2 ? num(sv.pm2.count) : null, 'App restarts', 'Since it was set up'],
            [sv.clamav === 'active' ? 'On' : sv.clamav ? 'Off' : null, 'Virus scanner'],
            [`${Math.floor(sv.uptime_s / 3600)} h`, 'App running for'],
          ]) + `<div class="rp-gap">${button('Server details', 'data-go="/admin/health"')}</div>` : none('Loading…'))
          + card(5, 'Scheduled jobs', 'Latest run of each.', table(['Job', 'Last run', 'Result'], jobs))
          + section('Connections')
          + card(7, 'Data sources', 'With the freshest each provider allows.', rows([
            { name: 'Orders, visits and form problems · instant', sub: 'Your own server' },
            { name: 'Stripe · up to a minute', sub: 'Connected' },
            source('Google Search', '2 to 3 days behind', h.keys.google, 'search', '/admin/growth'),
            source('Bing Search', 'about 2 days behind', h.keys.bing, 'search', '/admin/growth'),
            source('Google index check', 'daily', h.keys.google, 'index', '/admin/growth'),
            source('Google Analytics', 'hourly here', h.keys.analytics, '', '/admin/google'),
            source('Page speed', 'weekly', h.keys.pagespeed, 'speed', '/admin/google'),
            source('Microsoft Clarity', 'every few hours', h.keys.clarity, '', '/admin/settings'),
          ]))
          + card(5, 'External tools', 'Not available through their APIs.', rows([
            { name: 'Session replays and heatmaps', sub: 'Microsoft Clarity', button: link('Open', 'https://clarity.microsoft.com/projects') },
            { name: 'Ask Google to index a page', sub: 'Search Console', button: link('Open', 'https://search.google.com/search-console') },
            { name: 'Penalty or security notices', sub: 'Google emails these to you' },
            { name: 'All earlier report screens', sub: 'Still here', button: button('Open', 'data-go="/admin/reports/tools"') },
          ])),
      };
    },
  };

  // The reason a page is missing from Google, our own checks on it, and what can be sent from here.
  function helpPanel(h) {
    const d = h.data;
    if (!d) return `<div class="rp-help"><p class="rp-none">${e(h.error || 'Checking the page…')}</p></div>`;
    const inspectLink = `https://search.google.com/search-console/inspect?resource_id=${encodeURIComponent('sc-domain:' + d.url.split('/')[2])}&id=${encodeURIComponent(d.url)}`;
    return `<div class="rp-help"><p><b>${e(d.reason)}</b></p><p>${e(d.todo)}</p>
      <ul class="rp-checks">${d.checks.map(c => `<li><span class="${c.ok ? 'rp-good' : 'rp-warn'}">${c.ok ? 'Fine' : 'Fix'}</span><div>${e(c.label)}${c.detail ? `<small>${e(c.detail)}</small>` : ''}</div></li>`).join('')}</ul>
      ${d.suggest.length ? `<p>Good pages to add a link from: <b>${d.suggest.map(e).join(', ')}</b></p>` : ''}
      <p class="rp-how">${d.lastVisit ? `Google last visited ${e(dayName(d.lastVisit))}. ` : 'Google has not visited. '}Checked ${e(ago(d.checkedAt).toLowerCase())}. A change to the page's words or links needs an edit and a deploy.</p>
      <div class="rp-actions">${link('Request in Search Console', inspectLink)}${button('Check again', 'data-fix="recheck"')}${button('Send sitemap to Google', 'data-fix="sitemap"')}${button('Send page to Bing', 'data-fix="bing"')}</div>
      ${h.message ? `<p class="${h.failed ? 'rp-bad' : 'rp-good'}" role="status">${e(h.message)}</p>` : ''}</div>`;
  }

  async function openHelp(url) {
    if (state.help?.url === url) { state.help = null; return redraw(); }
    const h = state.help = { url };
    redraw();
    const d = await api(`/api/admin/index-help?url=${encodeURIComponent(url)}`, { background: true });
    if (state.help !== h) return;
    if (d && !d.error) h.data = d; else h.error = 'Could not check this page. Close it and try again.';
    redraw();
  }

  async function fixPage(kind, pressed) {
    const h = state.help;
    pressed.disabled = true; pressed.textContent = 'Working…';
    const r = await post(`/api/admin/index-help/${kind}`, { url: h.url });
    if (state.help !== h) return;
    h.failed = !r || r.ok === false || !!r.error;
    h.message = h.failed ? (r?.error || 'That did not work.') : r.message || 'Checked again.';
    if (!h.failed && kind === 'recheck') h.data = r;
    redraw();
  }

  const TOOLS = [['/admin/insights', 'Insights', 'Order and customer totals'], ['/admin/visitors', 'Visitors', 'Cloudflare traffic, recent visits, cache purge'], ['/admin/traffic', 'Traffic', 'Sources, landing pages and crawlers'], ['/admin/growth', 'Search', 'Search keys, fetch and full search lists'], ['/admin/google', 'Google', 'Index check, speed check and Analytics setup'], ['/admin/funnel', 'Funnel', 'Checkout steps and weekly revenue'], ['/admin/seo-audit', 'Content audit', 'The full list of page issues'], ['/admin/profit', 'Profit', 'Estimated profit per order'], ['/admin/stripe', 'Stripe', 'Balance, payouts and disputes']];

  // ── Drawing and refreshing ─────────────────────────────────────────────────────────────────
  const here = () => location.pathname.startsWith('/admin/reports') && !!document.getElementById('rp');

  function draw() {
    const d = state.data;
    state.tables = [];
    const v = SCREENS[state.screen](d);
    const seg = [7, 28, 90, 'all'].map(n => `<button data-days="${n}" aria-pressed="${n === state.days}">${n === 'all' ? 'All time' : `${n} days`}</button>`).join('');
    // Health shows how things are now, so a period or site choice would change nothing there.
    const filtered = state.screen !== 'health';
    setMain(`<div id="rp" class="rp">
      <div class="rp-top"><span class="rp-live"><span class="rp-pulse"></span><span id="rp-ago">Live</span></span>
        ${filtered ? `<div class="rp-seg" role="group" aria-label="Period">${seg}</div>
        <select data-site aria-label="Site">${Object.entries(SITE_NAMES).map(([k, n]) => `<option value="${k}"${k === state.site ? ' selected' : ''}>${n}</option>`).join('')}</select>` : ''}
        <a class="rp-btn" download href="/api/admin/reports/export?screen=${state.screen}&days=${state.days}&site=${state.site}">Export</a></div>
      <div class="rp-summary">${v.summary}</div>
      ${v.kpis ? strip(v.kpis) : ''}
      <div class="rp-grid">${v.body}</div>
      <div id="rp-tip" hidden></div></div>`);
    bind();
    stamp();
  }

  const stamp = () => { const el = document.getElementById('rp-ago'); if (el) el.textContent = state.live ? `Live, updated ${Math.max(0, Math.round((Date.now() - Date.parse(state.live.at)) / 1000))}s ago` : 'Live'; };

  function redraw() {
    if (!here()) return;
    // Don't redraw under someone typing a target.
    if (document.activeElement?.closest?.('[data-target]')) return;
    const main = document.getElementById('main'), top = main.scrollTop, y = window.scrollY;
    draw();
    main.scrollTop = top; window.scrollTo(0, y);
  }

  function bind() {
    const root = document.getElementById('rp');
    root.addEventListener('click', async ev => {
      const t = ev.target.closest('[data-go],[data-days],[data-table],[data-run],[data-help],[data-fix]');
      if (!t) return;
      if (t.dataset.help) return openHelp(t.dataset.help);
      if (t.dataset.fix) return fixPage(t.dataset.fix, t);
      if (t.dataset.go) return go(t.dataset.go);
      if (t.dataset.days) { const v = t.dataset.days === 'all' ? 'all' : Number(t.dataset.days); if (v !== state.days) { state.days = v; load(); } return; }
      if (t.dataset.table) {
        const body = t.closest('.rp-card').querySelector('.rp-body'), d = state.tables[t.dataset.table], on = t.getAttribute('aria-pressed') !== 'true';
        t.setAttribute('aria-pressed', on); t.textContent = on ? 'Chart' : 'Table';
        if (on) { body.__chart = body.innerHTML; body.innerHTML = `<div class="rp-tall">${table(d.cols, d.rows)}</div>`; } else body.innerHTML = body.__chart;
        return;
      }
      t.disabled = true; t.textContent = 'Working…';
      const kind = t.dataset.run;
      const r = kind === 'indexnow' ? await post('/api/admin/indexnow/run', {})
        : kind === 'search' ? await post('/api/admin/search-api/fetch', {})
          : await post('/api/admin/google/run', { kind });
      t.textContent = !r || r.error ? 'Failed' : kind === 'search' ? 'Done' : kind === 'indexnow' ? `${r.submitted || 0} sent` : 'Started';
      if (r && r.error) t.title = r.error;
      if (kind === 'search' && r && !r.error) { seen.clear(); load(); }
    });
    root.querySelector('[data-site]')?.addEventListener('change', ev => { state.site = ev.target.value; load(); });
    root.querySelector('[data-target]')?.addEventListener('submit', async ev => {
      ev.preventDefault();
      const value = String(Math.max(0, Math.min(1000000, parseInt(ev.target.querySelector('input').value, 10) || 0)));
      const r = await post('/api/admin/settings', { key: 'monthly_order_target', value });
      if (r && !r.error) { state.data.overview.target.goal = Number(value); document.activeElement.blur(); redraw(); }
    });
    const showTip = ev => {
      const el = ev.target.closest && ev.target.closest('[data-tip]'), box = document.getElementById('rp-tip');
      if (!box) return;
      if (!el) { box.hidden = true; return; }
      box.textContent = el.dataset.tip; box.hidden = false;
      box.style.left = Math.max(8, Math.min(ev.clientX + 14, window.innerWidth - box.offsetWidth - 8)) + 'px';
      box.style.top = Math.max(8, ev.clientY - box.offsetHeight - 12) + 'px';
    };
    root.addEventListener('pointermove', showTip);
    root.addEventListener('pointerdown', showTip);
    root.addEventListener('pointerleave', () => { const box = document.getElementById('rp-tip'); if (box) box.hidden = true; });
  }

  const query = () => `days=${state.days}&site=${state.site}`;

  async function refreshLive() {
    const run = state.run;
    const l = await api(`/api/admin/reports/live?${query()}`, { background: true });
    if (!l || run !== state.run || !here()) return;
    const newOrder = state.live && (l.orders[0]?.id || 0) > (state.live.orders[0]?.id || 0);
    state.live = l;
    for (const box of document.querySelectorAll('#rp [data-live]')) box.innerHTML = LIVE[box.dataset.live](l);
    stamp();
    if (newOrder) refreshData();
  }

  async function refreshData() {
    const run = state.run;
    const key = query();
    const d = await api(`/api/admin/reports?${key}`, { background: true });
    if (d && !d.error && run === state.run && here()) { seen.set(key, d); state.data = d; redraw(); }
  }

  // Figures already seen this visit are shown at once; newer ones replace them when they arrive.
  const seen = new Map();

  // Show straight away that the click was heard.
  function busy(message) {
    const root = document.getElementById('rp');
    if (!root) return;
    root.classList.add('rp-busy');
    for (const b of root.querySelectorAll('[data-days]')) b.setAttribute('aria-pressed', b.dataset.days === String(state.days));
    const el = document.getElementById('rp-ago');
    if (el) el.textContent = message;
  }

  function show(d, run) {
    state.data = d; state.live = null; state.ext = null;
    draw();
    refreshLive();
    api(`/api/admin/reports/external?${query()}`, { background: true }).then(x => { if (x && run === state.run && here()) { state.ext = x; redraw(); } });
    if (state.screen === 'health') api('/api/admin/health-detail', { background: true }).then(x => { if (x && run === state.run && here()) { state.health = x; redraw(); } });
  }

  async function load() {
    const run = ++state.run, key = query();
    clearInterval(state.timer);
    const old = seen.get(key);
    if (old) show(old, run); else busy('Loading…');
    const d = await api(`/api/admin/reports?${key}`, { background: !!old });
    if (run !== state.run) return;
    if (!d || d.error) {
      if (here()) { document.getElementById('rp').classList.remove('rp-busy'); const el = document.getElementById('rp-ago'); if (el) el.textContent = 'Could not load. Choose the period again to retry.'; }
      return;
    }
    seen.set(key, d);
    if (!old) show(d, run); else if (here()) { state.data = d; redraw(); }
    let tick = 0;
    state.timer = setInterval(() => {
      if (run !== state.run || !here()) return clearInterval(state.timer);
      stamp();
      if (document.hidden) return;
      tick++;
      if (tick % 15 === 0) refreshLive();
      if (tick % 300 === 0) refreshData();
    }, 1000);
  }

  window.showReports = async function (path) {
    const screen = path.split('/')[3] || 'overview';
    setTitle('Reports');
    if (screen === 'tools') {
      ++state.run;
      setMain(`<div class="rp"><div class="rp-grid"><section class="rp-card rp-s12"><div class="rp-head"><h3>All tools</h3></div><p class="rp-how">The detailed screens behind the five reports.</p>${TOOLS.map(([href, name, what]) => `<div class="rp-row"><span class="rp-dot"></span><div>${name}<small>${what}</small></div><button class="rp-btn" onclick="go('${href}')">Open</button></div>`).join('')}</section></div></div>`);
      return;
    }
    state.screen = SCREENS[screen] ? screen : 'overview';
    await load();
  };

  PH.addEventListener('change', () => { if (here() && state.data) redraw(); });
})();
