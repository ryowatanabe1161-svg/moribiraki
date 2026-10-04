/* ふーさんの もりびらき ― 画面（1台で順番に遊ぶ／オンライン：PeerJS P2P・ホストが正） */
(function () {
  'use strict';
  var M = window.Mori, $ = function (id) { return document.getElementById(id); };
  var Q = new URLSearchParams(location.search), TURBO = Q.has('turbo');
  var COLORS = ['#d9433b', '#2f78d0', '#ef8a17', '#8a4fc4'];
  var RI = M.RES_INFO, RES = M.RES, S = 60, SAVE = 'mori-save-v1';
  var LINES = {
    roll: ['えいっ、サイコロクマ！', 'いい目が出るといいクマ〜', 'コロコロ〜クマ'],
    sett: ['おうちを建てたクマ〜', 'ここに住むクマ！', 'いい角をみつけたクマ'],
    city: ['りっぱなやかたになったクマ！', 'もっと大きくするクマ〜'],
    road: ['こみちをのばすクマ', 'てくてく…クマ'],
    buyDev: ['ふしぎカード、なにかなクマ？', 'カードを買ってみるクマ'],
    robber: ['アライさん、こっちクマ…ごめんクマ', 'いたずらしてもらうクマ'],
    bank: ['森のくらで交換クマ', 'これとこれ、とりかえっこクマ'],
    knight: ['番人さん、出番クマ！'], end: ['おしまいクマ', 'つぎどうぞクマ〜'],
    yes: ['いいクマよ〜', 'こうかんするクマ！'], no: ['うーん、やめとくクマ', 'それはちょっと…クマ']
  };
  function pick(a) { return a[Math.floor(Math.random() * a.length)]; }
  function esc(t) { return String(t).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function toast(m) { var t = $('toast'); t.textContent = m; t.classList.remove('show'); void t.offsetWidth; t.classList.add('show'); }
  function delay(ms) { return TURBO ? 25 : ms; }
  // オンラインでは、ほかの人の手札は「枚数だけ」（nres / ndev）が届く
  function handN(P) { return P.nres != null ? P.nres : M.total(P.res); }
  function devN(P) { return P.ndev != null ? P.ndev : P.dev.length; }
  function humanCtl(i) { return NET ? !!(NET.ctl && NET.ctl[i] === 'human') : G.players[i].kind === 'human'; }
  function costTxt(c) { return RES.filter(function (k) { return c[k]; }).map(function (k) { return RI[k].e.repeat(c[k]); }).join(''); }

  // ---------- セットアップ画面 ----------
  var cfg = [{ kind: 'human', name: 'あなた' }, { kind: 'npc' }, { kind: 'npc' }, { kind: 'npc' }], count = 4;
  function npcNames() { var k = 0; cfg.slice(0, count).forEach(function (c) { if (c.kind === 'npc') c.name = 'ふーさん🐻' + (++k); }); }
  function renderSetup() {
    npcNames();
    $('plist').innerHTML = cfg.slice(0, count).map(function (c, i) {
      return '<div class="prow"><span class="dot" style="background:' + COLORS[i] + '"></span><div class="seg"><button data-i="' + i + '" data-k="human" class="' + (c.kind === 'human' ? 'on' : '') + '">人間</button><button data-i="' + i + '" data-k="npc" class="' + (c.kind === 'npc' ? 'on' : '') + '">🐻</button></div>' +
        (c.kind === 'human' ? '<input data-i="' + i + '" maxlength="8" value="' + esc(c.name || '') + '" placeholder="なまえ">' : '<input disabled value="' + esc(c.name) + '">') + '</div>';
    }).join('');
    Array.prototype.forEach.call($('countSeg').children, function (b) { b.classList.toggle('on', +b.dataset.n === count); });
    var s = load(); $('resumeBtn').style.display = s && s.G && s.G.phase !== 'over' ? '' : 'none';
  }
  $('countSeg').onclick = function (e) { var b = e.target.closest('button'); if (b) { count = +b.dataset.n; renderSetup(); } };
  $('plist').addEventListener('click', function (e) { var b = e.target.closest('button[data-k]'); if (!b) return; var c = cfg[+b.dataset.i]; c.kind = b.dataset.k; if (c.kind === 'human' && (!c.name || /ふーさん/.test(c.name))) c.name = 'プレイヤー' + (+b.dataset.i + 1); renderSetup(); });
  $('plist').addEventListener('input', function (e) { if (e.target.dataset.i) cfg[+e.target.dataset.i].name = e.target.value; });
  $('startBtn').onclick = function () {
    npcNames();
    var ps = cfg.slice(0, count).map(function (c, i) { return { kind: c.kind, name: (c.kind === 'human' ? (c.name || '').trim() || 'プレイヤー' + (i + 1) : c.name).slice(0, 10) }; });
    newGame(ps);
  };
  $('resumeBtn').onclick = function () { var s = load(); if (s) { G = s.G; viewer = -1; show('game'); buildBoard(); step(); } };
  function save() { try { localStorage.setItem(SAVE, JSON.stringify({ G: G, at: Date.now() })); } catch (e) {} }
  function load() { try { return JSON.parse(localStorage.getItem(SAVE)); } catch (e) { return null; } }
  function show(id) { ['setup', 'lobby', 'game'].forEach(function (s) { $(s).classList.toggle('active', s === id); }); }

  // ---------- ゲーム状態 ----------
  var NET = null;   // オンライン時：{ role: 'host'|'guest', me, ctl, conn }
  var G = null, viewer = -1, mode = null, zoom = 1, npcT = null, npcCount = 0, npcKey = '';
  function humans() { return G.players.map(function (p, i) { return p.kind === 'human' ? i : -1; }).filter(function (i) { return i >= 0; }); }
  function newGame(ps) {
    G = M.createGame({ players: ps, seed: Q.get('seed') ? +Q.get('seed') : undefined });
    viewer = -1; mode = null; zoom = 1; closeDlg();
    show('game'); buildBoard(); step();
  }
  function ensureViewer(p, cb) {
    var hs = humans();
    if (hs.length < 2) { viewer = p; cb(); return; }
    if (viewer === p) { cb(); return; }
    viewer = -1; render();
    $('hoName').textContent = G.players[p].name + 'さんの番です';
    $('hoText').textContent = '端末を ' + G.players[p].name + 'さんに渡してください。ほかの人は見ないでね！';
    $('handoff').classList.add('active');
    $('hoBtn').onclick = function () { $('handoff').classList.remove('active'); viewer = p; cb(); };
  }

  // 進行：状態が変わるたびに呼ぶ
  function step() {
    clearTimeout(npcT); save(); render();
    if (!G) return;
    if (G.phase === 'over') { mode = null; viewer = -1; render(); showEnd(); return; }
    if (G.phase === 'discard') {
      var ps = Object.keys(G.discardNeed).map(Number), npc = ps.filter(function (p) { return G.players[p].kind === 'npc'; });
      if (npc.length) { npcT = setTimeout(function () { doAct(M.npcAction(G, npc[0])); }, delay(450)); return; }
      ensureViewer(ps[0], function () { render(); openDiscard(ps[0]); });
      return;
    }
    var cur = G.turn, P = G.players[cur];
    if (P.kind === 'npc') {
      mode = null; if (humans().length !== 1) viewer = -1; else viewer = humans()[0];
      render(); npcT = setTimeout(npcStep, delay(G.phase === 'roll' ? 800 : 650)); return;
    }
    ensureViewer(cur, function () {
      if (G.phase === 'setup') mode = G.setupNeed === 'sett' ? 'settle' : 'road';
      else if (G.phase === 'robber') mode = 'robber';
      else if (G.phase === 'roads') mode = 'road';
      else if (mode === 'robber' || (G.phase === 'roll' && mode)) mode = null;
      render();
      if (G.phase === 'steal') openSteal();
    });
  }
  function say(p, kind) { sayIn(G, p, kind); }
  function sayIn(g, p, kind) { if (Math.random() < 0.75 || kind === 'yes' || kind === 'no') g.log.unshift('🐻 ' + g.players[p].name + '「' + pick(LINES[kind]) + '」'); }
  function npcStep() {
    var p = G.turn, key = G.turnNo + ':' + p;
    if (key !== npcKey) { npcKey = key; npcCount = 0; }
    var a = M.npcAction(G, p);
    if (!a || ++npcCount > 40) a = G.phase === 'main' ? { p: p, type: 'end' } : G.phase === 'roll' ? { p: p, type: 'roll' } : a;
    if (!a) return;
    var k = a.type === 'build' ? a.what : a.type === 'playDev' ? (a.t === 'knight' ? 'knight' : null) : a.type;
    if (k && LINES[k] && G.phase !== 'setup') say(p, k);
    doAct(a);
  }
  function doAct(a) {
    if (NET) return netAct(a);
    var r = M.act(G, a);
    if (!r.ok) { if (G.players[a.p].kind === 'human') toast(r.err); else { console.warn('npc', a, r.err); if (G.phase === 'main') M.act(G, { p: a.p, type: 'end' }); } step(); return r; }
    var ev = r.ev || {};
    if (ev.type === 'roll') animDice(ev);
    if (ev.type === 'buyDev' && a.p === viewer) toast('ふしぎカード「' + M.DEV_INFO[ev.t].n + '」' + M.DEV_INFO[ev.t].e + 'を引いた！');
    if ((ev.stole || (ev.type === 'steal' && ev.stole)) && ev.stole) { var st = ev.stole; if (st.from === viewer) toast(G.players[a.p].name + 'に' + RI[st.r].e + RI[st.r].n + 'をとられた…'); else if (a.p === viewer) toast(G.players[st.from].name + 'から' + RI[st.r].e + RI[st.r].n + 'をもらった！'); }
    if (ev.type === 'build' || ev.type === 'bank' || ev.type === 'trade') { if (G.phase !== 'roads') mode = null; }
    step();
    return r;
  }

  // ---------- 盤 ----------
  var bounds = null;
  function buildBoard() {
    var xs = M.VERT.map(function (v) { return v.x; }), ys = M.VERT.map(function (v) { return v.y; }), m = 0.95;
    bounds = { x: (Math.min.apply(null, xs) - m) * S, y: (Math.min.apply(null, ys) - m) * S, w: (Math.max.apply(null, xs) - Math.min.apply(null, xs) + 2 * m) * S, h: (Math.max.apply(null, ys) - Math.min.apply(null, ys) + 2 * m) * S };
    var svg = $('board'), h = '';
    svg.setAttribute('viewBox', bounds.x + ' ' + bounds.y + ' ' + bounds.w + ' ' + bounds.h);
    h += '<rect x="' + bounds.x + '" y="' + bounds.y + '" width="' + bounds.w + '" height="' + bounds.h + '" rx="' + S * 0.8 + '" fill="#5aa9c9"/>';
    h += '<polygon points="' + ringPts(3.25) + '" fill="#e9d9a8" stroke="#f6efd6" stroke-width="4"/>';
    G.ports.forEach(function (pt) {
      var E = M.EDGE[pt.e], A = M.VERT[E.a], B = M.VERT[E.b], mx = (A.x + B.x) / 2, my = (A.y + B.y) / 2, l = Math.hypot(mx, my), px = (mx + mx / l * 0.55) * S, py = (my + my / l * 0.55) * S;
      h += '<line x1="' + A.x * S + '" y1="' + A.y * S + '" x2="' + px + '" y2="' + py + '" stroke="#8a6238" stroke-width="5"/><line x1="' + B.x * S + '" y1="' + B.y * S + '" x2="' + px + '" y2="' + py + '" stroke="#8a6238" stroke-width="5"/>';
      h += '<circle cx="' + px + '" cy="' + py + '" r="' + S * 0.3 + '" fill="#fff8e8" stroke="#8a6238" stroke-width="3"/>';
      if (pt.t === 'any') h += '<text x="' + px + '" y="' + (py + 6) + '" text-anchor="middle" font-size="17" font-weight="900" fill="#2b2418">3:1</text>';
      else h += '<text x="' + px + '" y="' + (py - 1) + '" text-anchor="middle" font-size="15">' + RI[pt.t].e + '</text><text x="' + px + '" y="' + (py + 14) + '" text-anchor="middle" font-size="12" font-weight="900" fill="#2b2418">2:1</text>';
    });
    G.hexes.forEach(function (hx, i) {
      var H = M.HEX[i], cx = H.x * S, cy = H.y * S;
      h += '<g class="hx" data-num="' + hx.num + '"><polygon class="hex" points="' + H.v.map(function (v) { return M.VERT[v].x * S + ',' + M.VERT[v].y * S; }).join(' ') + '" fill="' + RI[hx.res].c + '"/>';
      h += '<text x="' + cx + '" y="' + (cy - S * 0.38) + '" text-anchor="middle" font-size="' + S * 0.36 + '">' + RI[hx.res].e + '</text>';
      if (hx.num) {
        var red = hx.num === 6 || hx.num === 8, pips = M.PIPS[hx.num], dots = '';
        for (var k = 0; k < pips; k++) dots += '<circle cx="' + (cx + (k - (pips - 1) / 2) * 5) + '" cy="' + (cy + S * 0.2) + '" r="1.8" fill="' + (red ? '#c0392b' : '#2b2418') + '"/>';
        h += '<circle cx="' + cx + '" cy="' + (cy + S * 0.08) + '" r="' + S * 0.29 + '" fill="#fff8e8" stroke="#b9a27a" stroke-width="2"/><text x="' + cx + '" y="' + (cy + S * 0.15) + '" text-anchor="middle" font-size="' + S * 0.3 + '" font-weight="900" fill="' + (red ? '#c0392b' : '#2b2418') + '">' + hx.num + '</text>' + dots;
      }
      h += '</g>';
    });
    h += '<g id="dyn"></g>';
    svg.innerHTML = h; fit();
  }
  function ringPts(rr) { var o = []; for (var i = 0; i < 6; i++) { var a = Math.PI / 180 * (60 * i); o.push(Math.cos(a) * rr * S * 1.0 + ',' + Math.sin(a) * rr * S); } return o.join(' '); }
  function fit() {
    if (!bounds) return;
    var w = $('boardWrap'), aw = w.clientWidth - 8, ah = w.clientHeight - 8, sc = Math.min(aw / bounds.w, ah / bounds.h);
    $('board').style.width = bounds.w * sc * zoom + 'px'; $('board').style.height = bounds.h * sc * zoom + 'px';
  }
  window.addEventListener('resize', fit);
  $('zIn').onclick = function () { zoom = Math.min(3, zoom * 1.3); fit(); };
  $('zOut').onclick = function () { zoom = Math.max(1, zoom / 1.3); fit(); };
  $('zFit').onclick = function () { zoom = 1; fit(); };
  function house(x, y, c, city) {
    var s = S / 60, pts = city ? [[-15, 12], [15, 12], [15, -4], [4, -4], [4, -12], [-5, -20], [-15, -12]] : [[-11, 9], [11, 9], [11, -4], [0, -14], [-11, -4]];
    return '<polygon points="' + pts.map(function (q) { return (x + q[0] * s) + ',' + (y + q[1] * s); }).join(' ') + '" fill="' + c + '" stroke="#2b2418" stroke-width="2.5" stroke-linejoin="round"/>';
  }
  function renderBoard() {
    var d = '', me = G.turn;
    G.eOwner.forEach(function (p, e) { if (p < 0) return; var E = M.EDGE[e], A = M.VERT[E.a], B = M.VERT[E.b]; d += '<line x1="' + A.x * S + '" y1="' + A.y * S + '" x2="' + B.x * S + '" y2="' + B.y * S + '" stroke="#2b2418" stroke-width="11" stroke-linecap="round"/><line x1="' + A.x * S + '" y1="' + A.y * S + '" x2="' + B.x * S + '" y2="' + B.y * S + '" stroke="' + COLORS[p] + '" stroke-width="7" stroke-linecap="round"/>'; });
    G.vOwner.forEach(function (o, v) { if (o) d += house(M.VERT[v].x * S, M.VERT[v].y * S, COLORS[o.p], o.city); });
    var R = M.HEX[G.robber];
    d += '<circle cx="' + R.x * S + '" cy="' + (R.y * S + S * 0.08) + '" r="' + S * 0.3 + '" fill="rgba(43,36,24,.75)"/><text x="' + R.x * S + '" y="' + (R.y * S + S * 0.2) + '" text-anchor="middle" font-size="' + S * 0.36 + '">🦝</text>';
    // ハイライト（自分の番の人間だけ）
    if (mode && viewer === me && humanCtl(me)) {
      if (mode === 'settle') M.validVerts(G, me, G.phase === 'setup').forEach(function (v) { d += '<circle class="hl-v" data-v="' + v + '" cx="' + M.VERT[v].x * S + '" cy="' + M.VERT[v].y * S + '" r="' + S * 0.19 + '"/>'; });
      if (mode === 'road') M.validEdges(G, me).forEach(function (e) { var E = M.EDGE[e], A = M.VERT[E.a], B = M.VERT[E.b]; d += '<line class="hl-e" data-e="' + e + '" x1="' + A.x * S + '" y1="' + A.y * S + '" x2="' + B.x * S + '" y2="' + B.y * S + '"/>'; });
      if (mode === 'city') G.players[me].setts.forEach(function (v) { d += '<circle class="hl-v" data-v="' + v + '" cx="' + M.VERT[v].x * S + '" cy="' + M.VERT[v].y * S + '" r="' + S * 0.2 + '"/>'; });
      if (mode === 'robber') M.HEX.forEach(function (H, i) { if (i !== G.robber) d += '<polygon class="hl-h" data-h="' + i + '" points="' + H.v.map(function (v) { return M.VERT[v].x * S + ',' + M.VERT[v].y * S; }).join(' ') + '"/>'; });
    }
    $('dyn').innerHTML = d;
  }
  // スマホでは角・辺の印が小さい（画面上 10px 前後）ので、印から少し外れたタップも「いちばん近い印」として受け付ける
  function nearestTarget(e) {
    var svg = $('board'), m = svg.getScreenCTM(); if (!m) return null;
    var pt = svg.createSVGPoint(); pt.x = e.clientX; pt.y = e.clientY; pt = pt.matrixTransform(m.inverse());
    var best = null, bd = Infinity;
    Array.prototype.forEach.call(document.querySelectorAll('#dyn [data-v],#dyn [data-e]'), function (el) {
      var d;
      if (el.dataset.v != null) { var V = M.VERT[+el.dataset.v]; d = Math.hypot(V.x * S - pt.x, V.y * S - pt.y); }
      else {
        var E = M.EDGE[+el.dataset.e], A = M.VERT[E.a], B = M.VERT[E.b], ax = A.x * S, ay = A.y * S, bx = B.x * S - ax, by = B.y * S - ay;
        var u = Math.max(0, Math.min(1, ((pt.x - ax) * bx + (pt.y - ay) * by) / (bx * bx + by * by)));
        d = Math.hypot(ax + u * bx - pt.x, ay + u * by - pt.y) + (u < 0.15 || u > 0.85 ? S * 0.12 : 0);   // 端（角の近く）はやや不利に
      }
      if (d < bd) { bd = d; best = el; }
    });
    return best && bd <= S * 0.5 ? best : null;
  }
  $('board').addEventListener('click', function (e) {
    if (!G || !mode) return;
    var t = e.target.closest('[data-v],[data-e],[data-h]') || nearestTarget(e); if (!t) return;
    var p = G.turn;
    if (t.dataset.h != null) return doAct({ p: p, type: 'robber', h: +t.dataset.h });
    if (G.phase === 'setup') return doAct(t.dataset.v != null ? { p: p, type: 'settle', v: +t.dataset.v } : { p: p, type: 'road', e: +t.dataset.e });
    if (t.dataset.e != null) return doAct({ p: p, type: 'build', what: 'road', e: +t.dataset.e });
    doAct({ p: p, type: 'build', what: mode === 'city' ? 'city' : 'sett', v: +t.dataset.v });
  });
  var PIP = { 1: [4], 2: [0, 8], 3: [0, 4, 8], 4: [0, 2, 6, 8], 5: [0, 2, 4, 6, 8], 6: [0, 2, 3, 5, 6, 8] };
  function dieH(n) { var h = ''; for (var i = 0; i < 9; i++) h += '<i class="' + ((PIP[n] || []).indexOf(i) >= 0 ? 'on' : '') + '"></i>'; return h; }
  function renderDice() { $('dice').innerHTML = G.dice ? '<div class="die">' + dieH(G.dice[0]) + '</div><div class="die">' + dieH(G.dice[1]) + '</div>' : ''; }
  function animDice(ev) {
    var n = 0, t = setInterval(function () { $('dice').innerHTML = '<div class="die roll">' + dieH(1 + n % 6) + '</div><div class="die roll">' + dieH(1 + (n + 3) % 6) + '</div>'; n++; }, 60);
    setTimeout(function () { clearInterval(t); renderDice(); Array.prototype.forEach.call(document.querySelectorAll('#board .hx[data-num="' + ev.sum + '"]'), function (g) { g.classList.remove('flash'); void g.getBBox(); g.classList.add('flash'); setTimeout(function () { g.classList.remove('flash'); }, 1900); }); }, TURBO ? 30 : 500);
  }

  // ---------- 画面 ----------
  function render() {
    if (!G) return;
    var me = viewer, cur = G.turn, np = G.players.length;
    $('players').style.setProperty('--np', np);
    $('players').innerHTML = G.players.map(function (P, i) {
      var v = i === me || G.phase === 'over' ? M.vp(G, i) : M.publicVp(G, i), bd = (G.longest === i ? '🛤️' : '') + (G.army === i ? '🏹' : '');
      return '<div class="pc' + (i === cur && G.phase !== 'over' ? ' cur' : '') + '" style="--pc:' + COLORS[i] + '">' + (bd ? '<span class="bd">' + bd + '</span>' : '') +
        '<div class="nm"><i></i>' + (NET && i === me ? '👤' : '') + esc(P.name) + (NET && NET.conn && !NET.conn[i] ? '<span class="off">📵</span>' : '') + (NET && NET.ctl && NET.ctl[i] === 'cpu' && P.kind === 'human' ? '🐻' : '') + '</div><div class="st"><span class="vp">★' + v + '</span><span>🎴' + handN(P) + '</span><span>🃏' + devN(P) + '</span><span>🏹' + P.knights + '</span><span>🛤' + M.roadLength(G, i) + '</span></div></div>';
    }).join('');
    $('turnChip').textContent = G.phase === 'setup' ? 'じゅんび' : 'ターン ' + G.turnNo;
    renderBoard(); renderDice();
    $('log').innerHTML = G.log.slice(0, 8).map(function (l) { return '<div>' + esc(l) + '</div>'; }).join('');
    // 手札
    var P = me >= 0 ? G.players[me] : null;
    $('hand').style.display = P ? '' : 'none'; $('hidden').style.display = P ? 'none' : 'block';
    if (P) {
      $('hand').innerHTML = RES.map(function (k) { return '<div class="rc' + (P.res[k] ? '' : ' zero') + '" style="--rc:' + RI[k].c + '"><div class="e">' + RI[k].e + '</div><div class="n">' + P.res[k] + '</div><div class="l">' + RI[k].n + '</div></div>'; }).join('') +
        '<div id="devChip"><div class="e">🃏</div>' + P.dev.length + '枚</div>';
    }
    var mine = me === cur && humanCtl(cur) && G.phase !== 'over';
    // disabled 属性だと押しても何も起きず「反応しない」と感じるので、見た目だけ薄くして、押したら理由を出す
    var why = !mine ? (G.phase === 'over' ? 'ゲームは終わりました' : !humanCtl(cur) ? G.players[cur].name + 'の番です。考え中クマ…ちょっと待ってね' : G.players[cur].name + 'の番です')
      : G.phase === 'setup' ? 'じゅんび中：盤の光っている所をタップしてね' : G.phase === 'roll' ? '先にサイコロをふってね' : G.phase === 'robber' ? '先にアライグマを動かしてね（盤のマスをタップ）'
      : G.phase === 'steal' ? '先にだれから1枚もらうか選んでね' : G.phase === 'roads' ? 'ただのこみちを置いてね（盤の辺をタップ）' : G.phase === 'discard' ? '手札をすてる人を待っています' : '';
    setAct('rollBtn', mine && G.phase === 'roll', mine && G.phase === 'main' ? 'サイコロはもうふりました' : why);
    setAct('buildBtn', mine && G.phase === 'main', why); setAct('tradeBtn', mine && G.phase === 'main', why);
    setAct('devBtn', mine && (G.phase === 'main' || G.phase === 'roll'), why);
    setAct('endBtn', mine && G.phase === 'main', why);
    var st = '', cn = esc(G.players[cur].name), cancel = false;
    if (G.phase === 'over') st = '🎉 ' + esc(G.players[G.winner].name) + 'の勝ち！';
    else if (NET && G.phase === 'discard') st = G.discardNeed[me] ? '🗑️ 手札が8枚以上：' + G.discardNeed[me] + '枚すててね' : '🗑️ 手札をすてる人を待っています';
    else if (!humanCtl(cur)) st = cn + 'が考え中クマ…' + (G.phase === 'setup' ? '（じゅんび）' : '');
    else if (!mine) st = cn + 'の番です';
    else if (G.phase === 'setup') st = G.setupNeed === 'sett' ? '🏠 いえを建てる角をタップ' + (G.setupIdx >= np ? '（2けん目：まわりのめぐみがもらえる）' : '') : '🛤️ いま建てたいえから、こみちをタップ';
    else if (G.phase === 'roll') st = '🎲 サイコロをふってね（ふしぎカードはふる前でも使えます）';
    else if (G.phase === 'robber') st = '🦝 アライグマを動かすマスをタップ';
    else if (G.phase === 'steal') st = '🦝 だれから1枚もらう？';
    else if (G.phase === 'roads') { st = '🛤️ ただのこみち：あと' + G.freeRoads + '本（タップ）'; cancel = true; }
    else if (G.phase === 'discard') st = '🗑️ 手札を半分すてる人がいます';
    else if (mode === 'settle') { st = '🏠 いえを建てる角をタップ'; cancel = true; }
    else if (mode === 'road') { st = '🛤️ こみちを作る辺をタップ'; cancel = true; }
    else if (mode === 'city') { st = '🏰 やかたにするいえをタップ'; cancel = true; }
    else st = '🔨 建てる・🔁 交換・🃏 カード。終わったら「おわる」';
    if (NET && mine) st = '🎯 あなたの番です！ ' + st;
    $('statusBar').classList.toggle('myturn', !!(NET && mine));
    $('status').innerHTML = st; $('cancelBtn').style.display = cancel ? '' : 'none';
  }
  function setAct(id, ok, why) { var b = $(id); b.classList.toggle('dis', !ok); b.setAttribute('aria-disabled', ok ? 'false' : 'true'); b.dataset.why = ok ? '' : (why || 'いまは使えません'); }
  // .dis のボタンは本来の処理の前で止めて理由を表示（キャプチャ段階）
  $('actions').addEventListener('click', function (e) { var b = e.target.closest('button'); if (b && b.classList.contains('dis')) { e.stopImmediatePropagation(); e.preventDefault(); toast(b.dataset.why); } }, true);
  // iOS Safari は touchstart リスナーがないと :active（押した感）が出ない
  document.addEventListener('touchstart', function () {}, { passive: true });
  $('cancelBtn').onclick = function () { if (G.phase === 'roads') doAct({ p: G.turn, type: 'endRoads' }); else { mode = null; render(); } };
  $('rollBtn').onclick = function () { doAct({ p: G.turn, type: 'roll' }); };
  $('endBtn').onclick = function () { mode = null; doAct({ p: G.turn, type: 'end' }); };

  // ---------- ダイアログ ----------
  function openDlg(html, kind) { $('dlg').innerHTML = html; $('dlg').dataset.kind = kind || ''; $('dlgOv').classList.add('active'); }
  function dlgKind() { return $('dlgOv').classList.contains('active') ? $('dlg').dataset.kind : null; }
  function closeDlg() { $('dlgOv').classList.remove('active'); }
  $('dlgOv').addEventListener('click', function (e) { if (e.target === this && !this.dataset.lock) closeDlg(); });
  function lock(on) { if (on) $('dlgOv').dataset.lock = '1'; else delete $('dlgOv').dataset.lock; }
  function resBtns(sel, dis) { return RES.map(function (k) { return '<button data-r="' + k + '" class="' + (sel === k ? 'on' : '') + '" style="--rc:' + RI[k].c + '"' + (dis && dis(k) ? ' disabled' : '') + '><span class="e">' + RI[k].e + '</span>' + RI[k].n + '</button>'; }).join(''); }
  function stepper(id, vals, max) { return '<div class="step" id="' + id + '">' + RES.map(function (k) { return '<div style="--rc:' + RI[k].c + '"><span class="e">' + RI[k].e + '</span><b>' + vals[k] + '</b><button data-r="' + k + '" data-d="-1">−</button><button data-r="' + k + '" data-d="1"' + (max && vals[k] >= max[k] ? ' disabled' : '') + '>＋</button></div>'; }).join('') + '</div>'; }

  // 💰 コスト表（いつでも見られる・ほかのダイアログの上に重ねて表示）
  function showCost() {
    var P = G && viewer >= 0 && G.players[viewer], items = [
      ['road', '🛤️ こみち', '', M.LIMIT.road], ['sett', '🏠 いえ', '+1点', M.LIMIT.sett],
      ['city', '🏰 やかた', '+1点<small>（いえ→）</small>', M.LIMIT.city], ['dev', '🃏 ふしぎカード', '？', 0]];
    var vpTxt = { road: '—', sett: '1点', city: '2点', dev: '？' };
    $('costBox').innerHTML = '<button class="x" data-cx aria-label="とじる">×</button><h3>💰 コスト表</h3>' + items.map(function (it) {
      var c = M.COST[it[0]], can = P && M.has(P.res, c);
      var left = P ? (it[0] === 'dev' ? 'のこり' + G.deck.length + '枚' : '手もと' + (it[3] - P[{ road: 'roads', sett: 'setts', city: 'cities' }[it[0]]].length) + '/' + it[3]) : (it[3] ? '最大' + it[3] : '');
      return '<div class="crow' + (can ? ' can' : '') + '"><div class="nm">' + it[1] + '<small>' + (it[0] === 'city' ? 'いえを建てかえ・' : '') + left + (can ? '・作れる！' : '') + '</small></div><div class="cs">' +
        RES.filter(function (k) { return c[k]; }).map(function (k) { return '<span>' + RI[k].e + '×' + c[k] + '</span>'; }).join('') + '</div><div class="vp">' + vpTxt[it[0]] + '</div></div>';
    }).join('') + '<p class="note">🃏 ふしぎカードの中身はいろいろ（🏆たからもの＝1点）。<br>🛤️ いちばん長いこみち（5本以上）＋2点・🏹 いちばん強い番人たち（3人以上）＋2点</p>';
    $('costOv').classList.add('active');
  }
  $('costBtn').onclick = showCost;
  $('costOv').addEventListener('click', function (e) { if (e.target === this || e.target.closest('[data-cx]')) this.classList.remove('active'); });
  // 建てる
  $('buildBtn').onclick = function () {
    var p = G.turn, P = G.players[p];
    var o = [
      ['road', '🛤️ こみち', M.COST.road, P.roads.length < 15 && M.validEdges(G, p).length, 'のこり' + (15 - P.roads.length)],
      ['sett', '🏠 いえ（1点）', M.COST.sett, P.setts.length < 5 && M.validVerts(G, p, false).length, 'のこり' + (5 - P.setts.length)],
      ['city', '🏰 やかた（2点）', M.COST.city, P.cities.length < 4 && P.setts.length, 'のこり' + (4 - P.cities.length)],
      ['dev', '🃏 ふしぎカード', M.COST.dev, G.deck.length, 'のこり' + G.deck.length]
    ];
    openDlg('<h2>🔨 建てる・買う</h2>' + o.map(function (x) { var ok = x[3] && M.has(P.res, x[2]); return '<button class="bopt" data-b="' + x[0] + '"' + (ok ? '' : ' disabled') + '>' + x[1] + '<small style="opacity:.7">' + x[4] + '</small><span class="c">' + costTxt(x[2]) + '</span></button>'; }).join('') + '<div class="row"><button class="btn" data-x>とじる</button></div>');
    $('dlg').onclick = function (e) {
      var b = e.target.closest('[data-b]'); if (e.target.closest('[data-x]')) return closeDlg();
      if (!b) return; closeDlg();
      if (b.dataset.b === 'dev') doAct({ p: p, type: 'buyDev' }); else { mode = { road: 'road', sett: 'settle', city: 'city' }[b.dataset.b]; render(); }
    };
  };
  // ふしぎカード
  $('devBtn').onclick = function () {
    var p = G.turn, P = G.players[p], counts = {};
    P.dev.forEach(function (d) { var c = counts[d.t] = counts[d.t] || { n: 0, ok: 0 }; c.n++; if (d.turn < G.turnNo) c.ok++; });
    var keys = Object.keys(counts);
    openDlg('<h2>🃏 ふしぎカード</h2>' + (keys.length ? keys.map(function (t) {
      var D = M.DEV_INFO[t], c = counts[t], can = t !== 'vp' && c.ok > 0 && !G.devPlayed;
      return '<div class="resp" style="flex-wrap:wrap"><span style="font-size:22px">' + D.e + '</span><span><b>' + D.n + ' ×' + c.n + '</b><br><small>' + D.d + (t !== 'vp' && c.ok < c.n ? '（買ったターンは使えません）' : '') + '</small></span>' + (t === 'vp' ? '' : '<button class="btn green" data-t="' + t + '"' + (can ? '' : ' disabled') + '>使う</button>') + '</div>';
    }).join('') : '<p style="text-align:center">まだ持っていません</p>') + (G.devPlayed ? '<p class="hint">このターンはもう使いました（1ターンに1枚）</p>' : '') + '<div class="row"><button class="btn" data-x>とじる</button></div>');
    $('dlg').onclick = function (e) {
      if (e.target.closest('[data-x]')) return closeDlg();
      var b = e.target.closest('[data-t]'); if (!b) return; var t = b.dataset.t;
      if (t === 'plenty') return pickRes('🌈 ほうさく：1枚目', null, function (a) { pickRes('🌈 ほうさく：2枚目', null, function (b2) { closeDlg(); doAct({ p: p, type: 'playDev', t: 'plenty', a: a, b: b2 }); }); });
      if (t === 'mono') return pickRes('🧲 ひとりじめ：どのめぐみ？', null, function (r) { closeDlg(); doAct({ p: p, type: 'playDev', t: 'mono', r: r }); });
      closeDlg(); doAct({ p: p, type: 'playDev', t: t });
    };
  };
  function pickRes(title, dis, cb) {
    openDlg('<h2>' + title + '</h2><div class="rpick">' + resBtns(null, dis) + '</div><div class="row"><button class="btn" data-x>やめる</button></div>');
    $('dlg').onclick = function (e) { if (e.target.closest('[data-x]')) return closeDlg(); var b = e.target.closest('[data-r]'); if (b) cb(b.dataset.r); };
  }
  // すてる
  function openDiscard(p) {
    var P = G.players[p], need = G.discardNeed[p], c = M.zero(); lock(true);
    function draw() {
      openDlg('<h2>🗑️ ' + esc(P.name) + '：' + need + '枚すてる</h2><p class="hint" style="text-align:center">手札が8枚以上なので半分すてます（' + M.total(c) + ' / ' + need + '）</p>' + stepper('dc', c, P.res) + '<div class="row"><button class="btn main" data-ok' + (M.total(c) === need ? '' : ' disabled') + '>すてる</button></div>', 'discard');
    }
    draw();
    $('dlg').onclick = function (e) {
      var b = e.target.closest('[data-d]');
      if (b) { var k = b.dataset.r; c[k] = Math.max(0, Math.min(P.res[k], c[k] + +b.dataset.d)); if (M.total(c) > need) c[k]--; draw(); return; }
      if (e.target.closest('[data-ok]')) { lock(false); closeDlg(); doAct({ p: p, type: 'discard', cards: c }); }
    };
  }
  function openSteal() {
    var p = G.turn, vs = []; lock(true);
    M.HEX[G.robber].v.forEach(function (v) { var o = G.vOwner[v]; if (o && o.p !== p && vs.indexOf(o.p) < 0 && handN(G.players[o.p]) > 0) vs.push(o.p); });
    openDlg('<h2>🦝 だれから1枚もらう？</h2>' + vs.map(function (q) { return '<div class="resp"><span style="color:' + COLORS[q] + '">●</span>' + esc(G.players[q].name) + '（手札' + handN(G.players[q]) + '枚）<button class="btn main" data-v="' + q + '">もらう</button></div>'; }).join(''), 'steal');
    $('dlg').onclick = function (e) { var b = e.target.closest('[data-v]'); if (b) { lock(false); closeDlg(); doAct({ p: p, type: 'steal', v: +b.dataset.v }); } };
  }
  // 交換
  var td = null;
  $('tradeBtn').onclick = function () { td = { tab: 'bank', give: null, get: null, g: M.zero(), w: M.zero() }; drawTrade(); };
  function drawTrade() {
    var p = G.turn, P = G.players[p], rates = M.portRates(G, p), h = '<h2>🔁 交換</h2><div class="tabs"><button data-tab="bank" class="' + (td.tab === 'bank' ? 'on' : '') + '">森のくら・港</button><button data-tab="pl" class="' + (td.tab === 'pl' ? 'on' : '') + '">みんなと</button></div>';
    if (td.tab === 'bank') {
      h += '<div class="lab">出す（' + RES.map(function (k) { return RI[k].e + rates[k] + ':1'; }).join(' ') + '）</div><div class="rpick" id="tg">' + resBtns(td.give, function (k) { return P.res[k] < rates[k]; }) + '</div>';
      h += '<div class="lab">もらう</div><div class="rpick" id="tw">' + resBtns(td.get, function (k) { return k === td.give || G.bank[k] < 1; }) + '</div>';
      h += '<div class="row"><button class="btn" data-x>とじる</button><button class="btn main" data-bank' + (td.give && td.get ? '' : ' disabled') + '>' + (td.give ? RI[td.give].e + '×' + rates[td.give] : '?') + ' → ' + (td.get ? RI[td.get].e : '?') + '</button></div>';
    } else {
      h += '<div class="lab">あなたが出す</div>' + stepper('sg', td.g, P.res) + '<div class="lab">ほしい</div>' + stepper('sw', td.w, null);
      h += '<div class="row"><button class="btn" data-x>とじる</button><button class="btn main" data-prop' + (M.total(td.g) && M.total(td.w) ? '' : ' disabled') + '>みんなに提案する</button></div>';
    }
    openDlg(h); $('dlg').onclick = null;
  }
  $('dlg').addEventListener('click', function (e) {
    if (!td || !$('dlg').querySelector('.tabs')) return;
    var p = G.turn, t = e.target.closest('[data-tab]'), r = e.target.closest('[data-r]');
    if (e.target.closest('[data-x]')) { td = null; return closeDlg(); }
    if (t) { td.tab = t.dataset.tab; return drawTrade(); }
    if (r && r.dataset.d) { var box = r.closest('.step').id === 'sg' ? td.g : td.w, k = r.dataset.r; box[k] = Math.max(0, box[k] + +r.dataset.d); if (box === td.g) box[k] = Math.min(box[k], G.players[p].res[k]); return drawTrade(); }
    if (r) { if (r.closest('#tg')) td.give = r.dataset.r; else td.get = r.dataset.r; if (td.give === td.get) td.get = null; return drawTrade(); }
    if (e.target.closest('[data-bank]')) { var a = { p: p, type: 'bank', give: td.give, get: td.get }; td.give = td.get = null; var res = doAct(a); if (res.ok && G.phase === 'main') drawTrade(); else closeDlg(); return; }
    if (e.target.closest('[data-prop]')) { var give = td.g, get = td.w; td = null; propose(p, give, get); }
  });
  function propose(p, give, get) {
    if (NET) return netPropose(give, get);
    var others = G.players.map(function (_, i) { return i; }).filter(function (i) { return i !== p; }), ans = {}, k = 0, txt = M.resTxt(give) + ' を出して ' + M.resTxt(get) + ' がほしい';
    function next() {
      if (k >= others.length) return results();
      var q = others[k++], Qp = G.players[q];
      if (!M.has(Qp.res, get)) { ans[q] = 'none'; return next(); }
      if (Qp.kind === 'npc') { ans[q] = M.npcAccept(G, q, p, give, get) ? 'yes' : 'no'; say(q, ans[q]); return next(); }
      openDlg('<h2>🤝 ' + esc(Qp.name) + 'さんへ</h2><p style="text-align:center">' + esc(G.players[p].name) + 'さんが<br><b>' + txt + '</b><br>そうです。交換しますか？</p><div class="row"><button class="btn" data-n>ことわる</button><button class="btn main" data-y>交換してもいい</button></div>');
      $('dlg').onclick = function (e) { if (e.target.closest('[data-y]')) { ans[q] = 'yes'; next(); } else if (e.target.closest('[data-n]')) { ans[q] = 'no'; next(); } };
    }
    function results() {
      render();
      openDlg('<h2>🤝 提案：' + txt + '</h2>' + others.map(function (q) {
        var a = ans[q], lab = a === 'yes' ? '⭕ OK' : a === 'none' ? '持っていない' : '❌ ことわった';
        return '<div class="resp"><span style="color:' + COLORS[q] + '">●</span>' + esc(G.players[q].name) + '：' + lab + (a === 'yes' ? '<button class="btn main" data-with="' + q + '">この人と交換</button>' : '') + '</div>';
      }).join('') + '<div class="row"><button class="btn" data-x2>やめる</button></div>');
      $('dlg').onclick = function (e) {
        var b = e.target.closest('[data-with]');
        if (e.target.closest('[data-x2]')) return closeDlg();
        if (b) { closeDlg(); doAct({ p: p, type: 'trade', to: +b.dataset.with, give: give, get: get }); }
      };
    }
    $('dlg').onclick = null; next();
  }
  // おわり
  function showEnd() { $('toast').classList.remove('show'); if (NET) return showEndOnline();
    var order = G.players.map(function (_, i) { return i; }).sort(function (a, b) { return M.vp(G, b) - M.vp(G, a); });
    lock(true);
    openDlg('<h2>🎉 ' + esc(G.players[G.winner].name) + 'の勝ち！</h2><p style="text-align:center;margin:0">' + (G.players[G.winner].kind === 'npc' ? '🐻「やったクマ〜！ みんなありがとクマ！」' : '森いちばんの村ができました！') + '</p>' + order.map(function (i) {
      var P = G.players[i], vpc = P.dev.filter(function (d) { return d.t === 'vp'; }).length;
      return '<div class="rank' + (i === G.winner ? ' win' : '') + '"><span style="color:' + COLORS[i] + ';font-size:20px">●</span><span>' + esc(P.name) + '<small>🏠' + P.setts.length + ' 🏰' + P.cities.length + (G.longest === i ? ' 🛤️+2' : '') + (G.army === i ? ' 🏹+2' : '') + (vpc ? ' 🏆' + vpc : '') + '</small></span><span class="v">★' + M.vp(G, i) + '</span></div>';
    }).join('') + '<p class="hint" style="text-align:center">ターン ' + G.turnNo + '</p><div class="row"><button class="btn" data-home>タイトルへ</button><button class="btn main" data-again>もう一度（新しい島）</button></div>');
    $('dlg').onclick = function (e) {
      if (e.target.closest('[data-again]')) { lock(false); newGame(G.players.map(function (p) { return { name: p.name, kind: p.kind }; })); }
      if (e.target.closest('[data-home]')) { lock(false); closeDlg(); G = null; localStorage.removeItem(SAVE); show('setup'); renderSetup(); }
    };
  }
  $('menuBtn').onclick = function () {
    if (NET) return netMenu();
    openDlg('<h2>メニュー</h2><button class="bopt" data-m="home">🏠 タイトルへ（つづきから再開できます）</button><button class="bopt" data-m="new">🔄 同じメンバーで新しいゲーム</button><div class="row"><button class="btn" data-x>とじる</button></div>');
    $('dlg').onclick = function (e) {
      var b = e.target.closest('[data-m]'); if (e.target.closest('[data-x]')) return closeDlg(); if (!b) return; closeDlg();
      if (b.dataset.m === 'home') { clearTimeout(npcT); var g = G; G = null; save0(g); show('setup'); renderSetup(); }
      else newGame(G.players.map(function (p) { return { name: p.name, kind: p.kind }; }));
    };
  };
  function save0(g) { try { localStorage.setItem(SAVE, JSON.stringify({ G: g, at: Date.now() })); } catch (e) {} }
  $('rulesBtn1').onclick = $('rulesBtn2').onclick = $('rulesBtn3').onclick = function () {
    openDlg('<h2>🌲 あそびかた</h2><ul style="padding-left:1.2em;margin:0">' +
      '<li>森の島（19マス）に、いえ🏠・やかた🏰・こみち🛤️を作って、先に<b>10点</b>になった人の勝ち（自分の番のときだけ勝てます）。</li>' +
      '<li>めぐみは5つ：' + RES.map(function (k) { return RI[k].e + RI[k].n + '（' + RI[k].tile + '）'; }).join('・') + '。はらっぱ🌼からは何もとれません。</li>' +
      '<li><b>じゅんび</b>：順番にいえ＋こみちを2回（2回目は逆の順番）。2けん目のまわりのめぐみがもらえます。</li>' +
      '<li><b>自分の番</b>：サイコロ2個 → その数字のマスにいえがあれば1枚、やかたなら2枚（全員）。そのあと建てる・交換・カード。</li>' +
      '<li>いえは<b>となりの角に家がない</b>場所だけ。こみち：' + costTxt(M.COST.road) + '、いえ：' + costTxt(M.COST.sett) + '、やかた：' + costTxt(M.COST.city) + '、ふしぎカード：' + costTxt(M.COST.dev) + '。</li>' +
      '<li><b>7</b>が出たら：手札8枚以上の人は半分すてる → いたずらアライグマ🦝を動かす（そのマスはめぐみが出ない）→ そこに家がある人から1枚もらう。</li>' +
      '<li><b>交換</b>：森のくらと4:1、港🚢があれば3:1や2:1。みんなとも交換できます（ふーさんは自分に得なら受けます）。</li>' +
      '<li><b>ふしぎカード</b>：番人🏹・こみちづくり🛤️・ほうさく🌈・ひとりじめ🧲・たからもの🏆（1点）。買ったターンは使えず、1ターンに1枚まで。</li>' +
      '<li>こみちが5本以上つながった一番長い人に「いちばん長いこみち」+2点（ほかの人のいえで道は切れます）。番人を3人以上使った一番多い人に「いちばん強い番人たち」+2点。</li>' +
      '<li>コマの数：こみち15・いえ5・やかた4。</li></ul><div class="row"><button class="btn main" data-x>とじる</button></div>');
    $('dlg').onclick = function (e) { if (e.target.closest('[data-x]')) closeDlg(); };
  };

  // =====================================================================
  //  オンライン：PeerJS（WebRTC P2P）。ホストのブラウザが唯一の正（logic.js を実行）。
  //  参加者には「その人に見せてよい情報だけ」を送る（ほかの人の手札・カードは枚数だけ、山札の順番・サイコロの乱数は送らない）
  // =====================================================================
  var CFG = window.MORI_CONFIG || {};
  var ICE = (CFG.iceServers && CFG.iceServers.length) ? CFG.iceServers : [{ urls: 'stun:stun.l.google.com:19302' }];
  if (Q.get('ice')) ICE = Q.get('ice').split(',').map(function (u) { return { urls: u }; });   // テスト・独自環境用
  var PEER_OPTS = Object.assign({ debug: 1, config: { iceServers: ICE } }, CFG.peer || {});
  var ID_PREFIX = 'moribiraki-jp-v1-', CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  var HB_MS = 3000, LOST_MS = 10000, TAKEOVER_MS = Q.get('takeover') ? +Q.get('takeover') : (TURBO ? 2500 : 30000), MAXP = 4;
  var LS_ID = 'mori-online-id', LS_NAME = 'mori-online-name', LS_VIB = 'mori-vib', SS_JOINED = 'mori-online-joined';
  function lsGet(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function lsSet(k, v) { try { if (v == null) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch (e) {} }
  var myId = lsGet(LS_ID) || (function () { var v = ''; for (var i = 0; i < 16; i++) v += 'abcdefghijklmnopqrstuvwxyz0123456789'[Math.floor(Math.random() * 36)]; lsSet(LS_ID, v); return v; })();
  function cleanName(n) { return String(n || '').replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, 8); }
  function genCode() { var c = ''; for (var i = 0; i < 4; i++) c += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)]; return c; }
  function normCode(c) { return String(c || '').toUpperCase().replace(/[^A-Z0-9]/g, '').replace(/O/g, '0').replace(/I/g, '1').slice(0, 4); }
  function inviteUrl(code) { var u = location.origin + location.pathname + '?room=' + code; if (Q.get('ice')) u += '&ice=' + encodeURIComponent(Q.get('ice')); return u; }
  function banner(msg) { $('banner').textContent = msg || ''; $('banner').classList.toggle('show', !!msg); }
  function connecting(on, title, text, onCancel) {
    $('connecting').classList.toggle('active', on);
    if (on) { $('connTitle').textContent = title || '接続中…'; $('connText').textContent = text || ''; $('connCancel').onclick = onCancel || function () { location.href = location.pathname; }; }
  }
  function confirmBox(title, text, yes, cb) {
    openDlg('<h2>' + esc(title) + '</h2><p style="text-align:center">' + esc(text) + '</p><div class="row"><button class="btn" data-cn>やめる</button><button class="btn main" data-cy>' + esc(yes) + '</button></div>', 'confirm');
    $('dlg').onclick = function (e) { if (e.target.closest('[data-cn]')) closeDlg(); else if (e.target.closest('[data-cy]')) { closeDlg(); cb(); } };
  }
  function alertBox(msg) { lock(false); openDlg('<h2>お知らせ</h2><p style="text-align:center">' + esc(msg) + '</p><div class="row"><button class="btn main" data-x>OK</button></div>', 'alert'); $('dlg').onclick = function (e) { if (e.target.closest('[data-x]')) closeDlg(); }; }
  function vibOn() { return lsGet(LS_VIB) !== 'off'; }

  // ---------------- ホスト ----------------
  var host = null, client = null, lastView = null;
  function hostId(code) { return ID_PREFIX + code; }
  function startHost(name) {
    NET = { role: 'host', me: -1 }; document.body.classList.add('is-host');
    host = { room: { code: genCode(), phase: 'lobby', opts: { n: 4 }, nextSid: 2, gameNo: 0, seats: [{ sid: 1, name: name, kind: 'host', clientId: myId, connected: true }], pids: null, ctl: null, G: null, ev: null, evId: 0, offer: null, offerId: 0, notice: null, lobbyReq: null }, conns: {}, lastSeen: {}, opened: false };
    connecting(true, '部屋を作っています…', 'シグナリングサーバーに接続中');
    openHostPeer(); setInterval(hostHeartbeat, 2000);
  }
  function openHostPeer() {
    var R = host.room, peer = new Peer(hostId(R.code), PEER_OPTS);
    host.peer = peer;
    peer.on('open', function () { host.opened = true; connecting(false); banner(''); hostRender(); });
    peer.on('connection', function (conn) {
      conn.on('data', function (m) { hostOnMessage(conn, m); });
      conn.on('close', function () { hostConnClosed(conn); });
      conn.on('error', function () { hostConnClosed(conn); });
    });
    peer.on('disconnected', function () { if (!peer.destroyed) setTimeout(function () { try { peer.reconnect(); } catch (e) {} }, 2000); });
    peer.on('error', function (e) {
      if (e.type === 'unavailable-id' && !host.opened) { try { peer.destroy(); } catch (x) {} R.code = genCode(); openHostPeer(); }
      else if (['network', 'server-error', 'socket-error', 'socket-closed'].indexOf(e.type) >= 0) {
        if (!host.opened) { connecting(true, 'サーバーに接続できません', '通信環境を確認してください。再試行しています…'); setTimeout(function () { try { peer.destroy(); } catch (x) {} openHostPeer(); }, 4000); }
        else banner('シグナリングサーバーとの接続が不安定です（ゲームは続行できます）');
      } else if (e.type === 'browser-incompatible') connecting(true, 'このブラウザは対応していません', 'Chrome / Safari の最新版でお試しください');
    });
  }
  function seatByClient(cid) { return host.room.seats.filter(function (s) { return s.clientId === cid; })[0]; }
  function seatBySid(sid) { return host.room.seats.filter(function (s) { return s.sid === sid; })[0]; }
  function seatOfP(i) { return host.room.pids ? seatBySid(host.room.pids[i]) : null; }
  function hostOnMessage(conn, m) {
    if (!m || typeof m !== 'object') return;
    var R = host.room;
    if (m.t === 'join') return hostJoin(conn, m);
    var seat = conn.clientId && seatByClient(conn.clientId);
    if (!seat || host.conns[conn.clientId] !== conn) return;
    host.lastSeen[conn.clientId] = Date.now();
    if (m.t === 'ping') return;
    if (m.t === 'lobbyReq') return hostLobbyReq(seat);
    if (m.t === 'leave') {
      if (R.phase === 'lobby') R.seats.splice(R.seats.indexOf(seat), 1); else { seat.connected = false; seat.lostAt = Date.now(); if (R.G) R.G.log.unshift('🚪 ' + seat.name + 'が退出しました'); }
      delete host.conns[conn.clientId]; try { conn.close(); } catch (e) {}
      hostBroadcast(); hostStep(); return;
    }
    var p = R.pids ? R.pids.indexOf(seat.sid) : -1;
    if (R.phase !== 'game' || !R.G || p < 0) return;
    var err = null;
    if (m.t === 'act') {
      var a = m.a; if (!a || typeof a !== 'object') return;
      a.p = p;   // 送り主の席で上書き（ほかの人のふりはできない）
      if (a.type !== 'discard' && m.seq !== R.G.seq) err = 'ほかの操作と重なりました。もう一度どうぞ';
      else { var r = hostAct(a, p); if (!r.ok) err = r.err; }
    } else if (m.t === 'offer') err = hostOffer(p, m.give, m.get);
    else if (m.t === 'offerAns') hostOfferAns(p, m.id, !!m.yes);
    else if (m.t === 'offerCancel') hostOfferCancel(p);
    if (err) { try { conn.send({ t: 'error', msg: err }); conn.send(viewFor(seat.sid)); } catch (e) {} }
  }
  function hostJoin(conn, m) {
    var R = host.room, name = cleanName(m.name), cid = String(m.clientId || '').slice(0, 40);
    function reject(t) { conn.send({ t: 'reject', msg: t }); setTimeout(function () { try { conn.close(); } catch (e) {} }, 500); }
    if (!name || !cid) return reject('ニックネームを入力してください');
    if (cid === myId) return reject('ホストと同じ端末・ブラウザからは参加できません');
    var seat = seatByClient(cid);
    if (!seat) { seat = R.seats.filter(function (s) { return s.name === name && s.kind === 'remote' && !s.connected; })[0]; if (seat) seat.clientId = cid; }
    if (seat) {
      if (seat.kind !== 'remote') return reject('この名前は使えません');
      var old = host.conns[cid]; if (old && old !== conn) { try { old.close(); } catch (e) {} }
      seat.connected = true;
      var p = R.pids ? R.pids.indexOf(seat.sid) : -1;
      if (R.phase === 'game' && R.G) {
        if (p >= 0 && R.ctl[p] === 'cpu' && seat.replaced) { R.ctl[p] = 'human'; seat.replaced = false; R.G.log.unshift('🔌 ' + seat.name + 'が戻ってきました（ふーさん🐻と交代）'); }
        else R.G.log.unshift('🔌 ' + seat.name + 'が再接続しました');
      }
    } else {
      if (R.phase !== 'lobby') return reject('この部屋はゲーム中です。前に参加していた人は、同じニックネームで入ると元の席に戻れます。');
      if (R.seats.length >= MAXP) return reject('満員です（最大4人）');
      if (R.seats.some(function (s) { return s.name === name; }) || /^ふーさん/.test(name)) return reject('その名前は使えません。別のニックネームにしてください。');
      seat = { sid: R.nextSid++, name: name, kind: 'remote', clientId: cid, connected: true };
      R.seats.push(seat);
    }
    conn.clientId = cid; host.conns[cid] = conn; host.lastSeen[cid] = Date.now();
    conn.send({ t: 'welcome', code: R.code, sid: seat.sid });
    hostBroadcast(); hostStep();
  }
  function hostConnClosed(conn) {
    if (!conn.clientId || host.conns[conn.clientId] !== conn) return;
    delete host.conns[conn.clientId];
    var seat = seatByClient(conn.clientId);
    if (seat && seat.connected) { seat.connected = false; seat.lostAt = Date.now(); if (host.room.G) host.room.G.log.unshift('⚠️ ' + seat.name + 'の接続が切れました'); hostBroadcast(); hostStep(); }
  }
  function hostHeartbeat() {
    if (!host) return;
    var now = Date.now();
    Object.keys(host.conns).forEach(function (cid) { var c = host.conns[cid]; try { c.send({ t: 'hb' }); } catch (e) {} if (now - (host.lastSeen[cid] || 0) > LOST_MS) { try { c.close(); } catch (e) {} hostConnClosed(c); } });
  }
  function hostStartGame() {
    var R = host.room, hs = R.seats.slice(0, MAXP), n = Math.max(3, R.opts.n, hs.length), ncpu = n - hs.length, ps = [], pids = [], ctl = [];
    hs.forEach(function (s) { ps.push({ name: s.name, kind: 'human' }); pids.push(s.sid); ctl.push(s.connected ? 'human' : 'cpu'); s.replaced = !s.connected; });
    for (var i = 0; i < ncpu; i++) { ps.push({ name: ncpu > 1 ? 'ふーさん🐻' + (i + 1) : 'ふーさん🐻', kind: 'npc' }); pids.push(-ps.length); ctl.push('cpu'); }
    R.gameNo++; R.lobbyReq = null; R.offer = null; R.ev = null;
    R.G = M.createGame({ players: ps, seed: Q.get('seed') ? +Q.get('seed') : undefined }); R.pids = pids; R.ctl = ctl; R.phase = 'game';
    hostBroadcast(); hostStep();
  }
  // 行動の受付（検証つき）。p＝送り主のプレイヤー番号
  function hostAct(a, p) {
    var R = host.room, G0 = R.G;
    if (R.phase !== 'game' || !G0 || a.p !== p) return { ok: false, err: 'いまは操作できません' };
    if (a.type === 'discard') { if (G0.phase !== 'discard' || !G0.discardNeed[p]) return { ok: false, err: 'すてる必要はありません' }; }
    else if (G0.turn !== p) return { ok: false, err: 'あなたの番ではありません' };
    if (a.type === 'trade') {
      var o = R.offer;
      if (!o || o.from !== p || o.ans[a.to] !== 'yes' || JSON.stringify(o.give) !== JSON.stringify(a.give) || JSON.stringify(o.get) !== JSON.stringify(a.get)) return { ok: false, err: 'その交換は相手が受けていません' };
    }
    var r = M.act(G0, a);
    if (!r.ok) return r;
    var ev = r.ev || {};
    R.ev = { id: ++R.evId, type: ev.type || a.type, p: p, sum: ev.sum, t: ev.t, stole: ev.stole ? { from: ev.stole.from, r: ev.stole.r } : null };
    if (R.offer && (a.type === 'trade' || a.type === 'end' || G0.phase !== 'main' || G0.turn !== R.offer.from)) R.offer = null;
    hostBroadcast(); hostStep();
    return r;
  }
  // ふーさん（CPU・交代した席）の進行と、切断した人の番の交代
  function hostStep() {
    if (!host) return;
    clearTimeout(host.timer); clearTimeout(host.takeT);
    var R = host.room, G0 = R.G; if (R.phase !== 'game' || !G0 || G0.phase === 'over') return;
    var wait;
    if (G0.phase === 'discard') {
      var need = Object.keys(G0.discardNeed).map(Number), cpu = need.filter(function (q) { return R.ctl[q] === 'cpu'; });
      if (cpu.length) { host.timer = setTimeout(function () { var q = cpu[0]; if (R.G === G0 && G0.phase === 'discard' && G0.discardNeed[q]) { var a = M.npcAction(G0, q); if (a) hostAct(a, q); } }, delay(450)); return; }
      wait = need;
    } else {
      var cur = G0.turn;
      if (R.ctl[cur] === 'cpu') { host.timer = setTimeout(function () { hostNpc(G0, cur); }, delay(G0.phase === 'roll' ? 800 : 650)); return; }
      wait = [cur];
    }
    var off = wait.filter(function (q) { var s = seatOfP(q); return s && s.kind === 'remote' && !s.connected; });
    if (off.length) host.takeT = setTimeout(function () { off.forEach(function (q) { var s = seatOfP(q); if (s && !s.connected) takeover(q); }); }, TAKEOVER_MS);
  }
  function hostNpc(G0, p) {
    var R = host.room; if (R.G !== G0 || G0.turn !== p || R.ctl[p] !== 'cpu' || G0.phase === 'over') return;
    var key = R.gameNo + ':' + G0.turnNo + ':' + p; if (key !== host.npcKey) { host.npcKey = key; host.npcCount = 0; }
    var a = M.npcAction(G0, p);
    if (!a || ++host.npcCount > 40) a = G0.phase === 'main' ? { p: p, type: 'end' } : G0.phase === 'roll' ? { p: p, type: 'roll' } : a;
    if (!a) return;
    var k = a.type === 'build' ? a.what : a.type === 'playDev' ? (a.t === 'knight' ? 'knight' : null) : a.type;
    if (k && LINES[k] && G0.phase !== 'setup' && G0.players[p].kind === 'npc') sayIn(G0, p, k);
    var r = hostAct(a, p);
    if (!r.ok) { console.warn('npc', a, r.err); if (G0.phase === 'main') hostAct({ p: p, type: 'end' }, p); else hostStep(); }
  }
  function takeover(q) {
    var R = host.room, s = seatOfP(q); if (!R.G || R.ctl[q] === 'cpu') return;
    R.ctl[q] = 'cpu'; if (s) s.replaced = true;
    R.G.log.unshift('🐻 ふーさんが ' + R.G.players[q].name + ' の代わりにプレイします');
    hostBroadcast(); hostStep();
  }
  // 交換の提案：手番の人 → 全員。ふーさんはその場で判断、人間は自分の端末で返事
  function cleanRes(o) { var r = M.zero(); RES.forEach(function (k) { var n = Math.floor(+((o || {})[k]) || 0); r[k] = Math.max(0, Math.min(19, n)); }); return r; }
  function hostOffer(p, give, get) {
    var R = host.room, G0 = R.G;
    if (!G0 || G0.phase !== 'main' || G0.turn !== p) return 'いまは提案できません';
    give = cleanRes(give); get = cleanRes(get);
    if (!M.total(give) || !M.total(get)) return '出すめぐみと、ほしいめぐみを選んでね';
    if (!M.has(G0.players[p].res, give)) return '出すめぐみが足りません';
    var o = R.offer = { id: ++R.offerId, from: p, give: give, get: get, ans: {} };
    G0.log.unshift('🤝 ' + G0.players[p].name + 'が交換を提案：' + M.resTxt(give) + ' を出して ' + M.resTxt(get) + ' がほしい');
    G0.players.forEach(function (Qp, q) {
      if (q === p) return;
      if (!M.has(Qp.res, get)) o.ans[q] = 'none';
      else if (R.ctl[q] === 'cpu') { o.ans[q] = M.npcAccept(G0, q, p, give, get) ? 'yes' : 'no'; if (Qp.kind === 'npc') sayIn(G0, q, o.ans[q]); }
      else { var s = seatOfP(q); o.ans[q] = s && s.connected ? null : 'no'; }
    });
    hostBroadcast(); return null;
  }
  function hostOfferAns(q, id, yes) {
    var R = host.room, o = R.offer; if (!o || o.id !== id || o.ans[q] !== null) return;
    o.ans[q] = yes && M.has(R.G.players[q].res, o.get) ? 'yes' : 'no';
    hostBroadcast();
  }
  function hostOfferCancel(p) { var R = host.room; if (R.offer && R.offer.from === p) { R.offer = null; hostBroadcast(); } }
  // その人に見せてよい情報だけ
  function maskFor(G0, me) {
    var g = JSON.parse(JSON.stringify(G0));
    delete g.rs; delete g.forceDice; g.deck = g.deck.map(function () { return '?'; });
    if (g.phase !== 'over') g.players.forEach(function (P, i) { if (i === me) return; P.nres = M.total(P.res); P.res = M.zero(); P.ndev = P.dev.length; P.dev = []; });
    return g;
  }
  function viewFor(sid) {
    var R = host.room, you = -1;
    R.seats.forEach(function (s, i) { if (s.sid === sid) you = i; });
    var v = { t: 'state', phase: R.phase, code: R.code, you: you, sid: sid, gameNo: R.gameNo, opts: { n: R.opts.n }, notice: R.notice,
      seats: R.seats.map(function (s) { return { sid: s.sid, name: s.name, kind: s.kind, connected: s.kind !== 'remote' || s.connected }; }) };
    if (sid === 1 && R.lobbyReq && R.phase !== 'lobby') v.lobbyReq = R.lobbyReq;
    if (R.phase === 'game' && R.G) {
      var me = R.pids.indexOf(sid);
      v.pids = R.pids.slice(); v.ctl = R.ctl.slice();
      v.conn = R.pids.map(function (s) { var st = seatBySid(s); return !st || st.kind !== 'remote' || st.connected; });
      v.G = maskFor(R.G, me); v.offer = R.offer;
      if (R.ev) { var e = JSON.parse(JSON.stringify(R.ev)); if (e.type === 'buyDev' && e.p !== me) delete e.t; if (e.stole && me !== e.p && me !== e.stole.from) delete e.stole.r; v.ev = e; }
    }
    return v;
  }
  function hostBroadcast() {
    var R = host.room;
    R.seats.forEach(function (s) { if (s.kind !== 'remote') return; var c = host.conns[s.clientId]; if (c && c.open) { try { c.send(viewFor(s.sid)); } catch (e) {} } });
    hostRender();
  }
  function hostRender() { onState(viewFor(1)); }
  function hostToLobby(msg) {
    var R = host.room;
    clearTimeout(host.timer); clearTimeout(host.takeT);
    R.phase = 'lobby'; R.G = null; R.pids = null; R.ctl = null; R.offer = null; R.ev = null; R.lobbyReq = null;
    R.seats = R.seats.filter(function (s) { return s.kind !== 'remote' || s.connected; });
    R.notice = { id: (R.notice ? R.notice.id : 0) + 1, msg: msg };
    hostBroadcast();
  }
  function hostLobbyReq(seat) {
    var R = host.room; if (R.phase === 'lobby') return;
    if (R.lobbyReq && R.lobbyReq.sid === seat.sid && Date.now() - R.lobbyReq.at < 5000) return;
    R.lobbyReq = { sid: seat.sid, name: seat.name, at: Date.now() }; hostBroadcast();
  }

  // ---------------- 参加者 ----------------
  function startClient(code, name) {
    NET = { role: 'guest', me: -1 }; document.body.classList.add('is-guest');
    client = { code: code, name: name, everJoined: false, lastMsg: Date.now(), pending: null };
    connecting(true, '部屋 ' + code + ' に接続中…', 'しばらくお待ちください', function () { leaveClient(true); });
    var peer = new Peer(PEER_OPTS); client.peer = peer;
    peer.on('open', clientConnect);
    peer.on('disconnected', function () { if (!peer.destroyed) setTimeout(function () { try { peer.reconnect(); } catch (e) {} }, 2000); });
    peer.on('error', function (e) {
      if (e.type === 'peer-unavailable') { if (!client.everJoined) { connecting(false); leaveClient(false); alertBox('部屋が見つかりません。コードを確認してください。'); } else clientLost(); }
      else if (['network', 'server-error', 'socket-error', 'socket-closed'].indexOf(e.type) >= 0) { if (!client.everJoined) connecting(true, 'サーバーに接続できません', '通信環境を確認してください。再試行しています…'); }
      else if (e.type === 'browser-incompatible') connecting(true, 'このブラウザは対応していません', 'Chrome / Safari の最新版でお試しください');
    });
    client.hb = setInterval(function () {
      if (!client) return;
      if (client.conn && client.conn.open) { try { client.conn.send({ t: 'ping' }); } catch (e) {} }
      if (client.everJoined && Date.now() - client.lastMsg > LOST_MS) clientLost();
    }, HB_MS);
  }
  function clientConnect() {
    if (!client || !client.peer || client.peer.destroyed) return;
    if (client.conn) { try { client.conn.close(); } catch (e) {} }
    var conn = client.peer.connect(hostId(client.code), { reliable: true }); client.conn = conn;
    conn.on('open', function () { conn.send({ t: 'join', name: client.name, clientId: myId }); });
    conn.on('data', function (m) { if (client && client.conn === conn) clientOnMessage(m); });
    conn.on('close', function () { if (client && client.conn === conn) clientLost(); });
    conn.on('error', function () { if (client && client.conn === conn) clientLost(); });
  }
  function clientOnMessage(m) {
    if (!m || typeof m !== 'object') return;
    client.lastMsg = Date.now();
    if (m.t === 'welcome') { client.everJoined = true; connecting(false); banner(''); try { sessionStorage.setItem(SS_JOINED, JSON.stringify({ code: client.code, name: client.name })); } catch (e) {} }
    else if (m.t === 'state') { client.pending = null; onState(m); }
    else if (m.t === 'reject') { connecting(false); leaveClient(false); alertBox(m.msg); }
    else if (m.t === 'kicked' || m.t === 'closed') { try { sessionStorage.removeItem(SS_JOINED); } catch (e) {} leaveClient(false); alertBox(m.t === 'kicked' ? 'ホストによって部屋から外されました。' : 'ホストが部屋を閉じました。'); }
    else if (m.t === 'error') { client.pending = null; discKey = stealKey = ''; toast(m.msg); }
  }
  function clientLost() {
    if (!client || !client.everJoined) return;
    banner('ホストとの接続が切れました。再接続しています…');
    clearTimeout(client.retryT);
    client.retryT = setTimeout(function () { if (!client) return; client.lastMsg = Date.now(); if (client.peer.disconnected && !client.peer.destroyed) { try { client.peer.reconnect(); } catch (e) {} } clientConnect(); }, 3000);
  }
  function leaveClient(sendLeave) {
    if (!client) return;
    if (sendLeave && client.conn && client.conn.open) { try { client.conn.send({ t: 'leave' }); } catch (e) {} }
    clearInterval(client.hb); clearTimeout(client.retryT);
    var p = client.peer; client = null; NET = null; G = null; document.body.classList.remove('is-guest');
    setTimeout(function () { try { p.destroy(); } catch (e) {} }, 300);
    banner(''); connecting(false); lock(false); closeDlg(); show('setup'); renderSetup(); renderOnlineTitle();
  }
  function send(m) { if (client && client.conn && client.conn.open) { client.conn.send(m); return true; } toast('接続が切れています'); return false; }

  // ---------------- 操作（ホスト・参加者共通の入口） ----------------
  function netAct(a) {
    if (!G) return { ok: false };
    if (host) { var r = hostAct(a, NET.me); if (!r.ok) toast(r.err); return r; }
    if (a.type !== 'discard' && client && client.pending === G.seq) return { ok: false };   // 二重送信を防ぐ
    if (send({ t: 'act', a: a, seq: G.seq })) { if (a.type !== 'discard') client.pending = G.seq; return { ok: true, pending: true }; }
    return { ok: false };
  }
  function netPropose(give, get) {
    if (host) { var err = hostOffer(NET.me, give, get); if (err) toast(err); }
    else send({ t: 'offer', give: give, get: get });
  }
  function netOfferAns(id, yes) { if (host) hostOfferAns(NET.me, id, yes); else send({ t: 'offerAns', id: id, yes: yes }); }
  function netOfferCancel() { if (host) hostOfferCancel(NET.me); else send({ t: 'offerCancel' }); }

  // ---------------- 受信した状態の表示 ----------------
  var lastEvId = null, gameKey = '', turnKey = '', discKey = '', stealKey = '', offerSeen = null, resShown = null, endKey = '';
  function pname(i) { return G.players[i] ? G.players[i].name : '?'; }
  function onState(v) {
    lastView = v; window.__mori.view = v;
    noticeUi(v);
    if (v.phase === 'lobby') { if (G) { lock(false); closeDlg(); td = null; } G = null; mode = null; gameKey = ''; show('lobby'); renderLobby(v); return; }
    var gk = v.code + ':' + v.gameNo, fresh = gk !== gameKey;
    G = v.G; NET.me = v.pids.indexOf(v.sid); NET.ctl = v.ctl; NET.conn = v.conn; viewer = NET.me;
    if (fresh) { gameKey = gk; mode = null; zoom = 1; td = null; lastEvId = v.ev ? v.ev.id : null; offerSeen = resShown = null; lock(false); closeDlg(); $('costOv').classList.remove('active'); show('game'); buildBoard(); }
    if (v.ev && v.ev.id !== lastEvId) { lastEvId = v.ev.id; netEvent(v.ev); }
    netUi(v);
    render();
    if (td && dlgKind() === '' && $('dlg').querySelector('.tabs')) { if (G.turn === NET.me && G.phase === 'main') drawTrade(); else { td = null; closeDlg(); } }
  }
  function netEvent(e) {
    var me = NET.me;
    if (e.type === 'roll' && e.sum) animDice(e);
    if (e.type === 'buyDev' && e.p === me && e.t) toast('ふしぎカード「' + M.DEV_INFO[e.t].n + '」' + M.DEV_INFO[e.t].e + 'を引いた！');
    if (e.stole && e.stole.r) { if (e.stole.from === me) toast(pname(e.p) + 'に' + RI[e.stole.r].e + RI[e.stole.r].n + 'をとられた…'); else if (e.p === me) toast(pname(e.stole.from) + 'から' + RI[e.stole.r].e + RI[e.stole.r].n + 'をもらった！'); }
    if (e.p === me && (e.type === 'build' || e.type === 'bank' || e.type === 'trade') && G.phase !== 'roads') mode = null;
  }
  function netUi(v) {
    var me = NET.me, cur = G.turn, myTurn = cur === me && NET.ctl[me] === 'human', kind = dlgKind();
    if (G.phase === 'over') { mode = null; if (endKey !== gameKey) { endKey = gameKey; showEnd(); } return; }
    var tk = gameKey + ':' + G.turnNo + ':' + cur + ':' + (G.phase === 'setup' ? G.setupIdx : '');
    if (myTurn && tk !== turnKey) { turnKey = tk; if (G.phase !== 'setup' || G.setupNeed === 'sett') { toast('🎯 あなたの番です！'); if (vibOn() && navigator.vibrate) { try { navigator.vibrate([90, 60, 90]); } catch (e) {} } } }
    if (myTurn) {
      if (G.phase === 'setup') mode = G.setupNeed === 'sett' ? 'settle' : 'road';
      else if (G.phase === 'robber') mode = 'robber';
      else if (G.phase === 'roads') mode = 'road';
      else if (G.phase !== 'main') mode = null;
    } else mode = null;
    // 7：手札が多い人は、それぞれ自分の端末で同時にすてる
    var dk = gameKey + ':' + G.turnNo + ':' + (G.dice || []).join('');
    if (G.phase === 'discard' && G.discardNeed[me]) { if (discKey !== dk) { discKey = dk; openDiscard(me); } }
    else if (kind === 'discard') { lock(false); closeDlg(); }
    if (myTurn && G.phase === 'steal') { var sk = gameKey + ':' + G.seq; if (stealKey !== sk) { stealKey = sk; openSteal(); } }
    else if (kind === 'steal') { lock(false); closeDlg(); }
    // 交換の提案
    var o = v.offer; kind = dlgKind();
    if (o && o.from === me) { if (resShown !== o.id || kind === 'offerRes') { resShown = o.id; openOfferResults(o); } }
    else if (o && o.ans[me] === null && offerSeen !== o.id) { offerSeen = o.id; if (!kind || kind === 'confirm' || kind === 'alert') openOfferAsk(o); }
    kind = dlgKind();
    if ((kind === 'offerRes' || kind === 'offerAsk') && (!o || (kind === 'offerAsk' && (o.ans[me] !== null || o.from === me)))) closeDlg();
  }
  function offerTxt(o) { return M.resTxt(o.give) + ' を出して ' + M.resTxt(o.get) + ' がほしい'; }
  function openOfferAsk(o) {
    openDlg('<h2>🤝 交換の提案</h2><p style="text-align:center"><b style="color:' + COLORS[o.from] + '">' + esc(pname(o.from)) + '</b>さんが<br><b style="font-size:17px">' + offerTxt(o) + '</b><br>そうです。交換しますか？</p><div class="row"><button class="btn" data-n>ことわる</button><button class="btn main" data-y>交換してもいい</button></div>', 'offerAsk');
    $('dlg').onclick = function (e) { var y = e.target.closest('[data-y]'), n = e.target.closest('[data-n]'); if (!y && !n) return; closeDlg(); netOfferAns(o.id, !!y); toast(y ? '「交換してもいい」と返事しました' : 'ことわりました'); };
  }
  function openOfferResults(o) {
    var others = G.players.map(function (_, i) { return i; }).filter(function (i) { return i !== o.from; });
    openDlg('<h2>🤝 提案：' + offerTxt(o) + '</h2>' + others.map(function (q) {
      var a = o.ans[q], lab = a === 'yes' ? '⭕ OK' : a === 'none' ? '持っていない' : a === 'no' ? '❌ ことわった' : '⏳ 考え中…';
      return '<div class="resp"><span style="color:' + COLORS[q] + '">●</span>' + esc(pname(q)) + '：' + lab + (a === 'yes' ? '<button class="btn main" data-with="' + q + '">この人と交換</button>' : '') + '</div>';
    }).join('') + '<div class="row"><button class="btn" data-x2>提案をやめる</button></div>', 'offerRes');
    $('dlg').onclick = function (e) {
      var b = e.target.closest('[data-with]');
      if (e.target.closest('[data-x2]')) { closeDlg(); netOfferCancel(); return; }
      if (b) { closeDlg(); doAct({ p: NET.me, type: 'trade', to: +b.dataset.with, give: o.give, get: o.get }); }
    };
  }
  function showEndOnline() {
    var order = G.players.map(function (_, i) { return i; }).sort(function (a, b) { return M.vp(G, b) - M.vp(G, a); });
    lock(true);
    openDlg('<h2>🎉 ' + (G.winner === NET.me ? 'あなたの勝ち！' : esc(pname(G.winner)) + 'の勝ち！') + '</h2>' + order.map(function (i) {
      var P = G.players[i], vpc = P.dev.filter(function (d) { return d.t === 'vp'; }).length;
      return '<div class="rank' + (i === G.winner ? ' win' : '') + '"><span style="color:' + COLORS[i] + ';font-size:20px">●</span><span>' + esc(P.name) + (i === NET.me ? '（あなた）' : '') + '<small>🏠' + P.setts.length + ' 🏰' + P.cities.length + (G.longest === i ? ' 🛤️+2' : '') + (G.army === i ? ' 🏹+2' : '') + (vpc ? ' 🏆' + vpc : '') + '</small></span><span class="v">★' + M.vp(G, i) + '</span></div>';
    }).join('') + '<p class="hint" style="text-align:center">ターン ' + G.turnNo + '</p>' +
      (host ? '<div class="row"><button class="btn" data-lobby>ロビーへ</button><button class="btn main" data-again>もう一度（新しい島）</button></div>' : '<p class="hint" style="text-align:center">ホストが次のゲームを始めるのを待っています</p><div class="row"><button class="btn" data-leave>部屋を出る</button></div>'), 'end');
    $('dlg').onclick = function (e) {
      if (host && e.target.closest('[data-again]')) { lock(false); closeDlg(); hostStartGame(); }
      else if (host && e.target.closest('[data-lobby]')) { lock(false); closeDlg(); hostToLobby('ロビーに戻りました'); }
      else if (e.target.closest('[data-leave]')) { lock(false); leaveRoom(); }
    };
  }
  function netMenu() {
    var offTurn = host && host.room.G && host.room.pids.some(function (_, q) { var s = seatOfP(q); return s && s.kind === 'remote' && !s.connected && host.room.ctl[q] === 'human'; });
    openDlg('<h2>メニュー</h2>' + (host ? '<button class="bopt" data-m="abort">⏸️ 中断してロビーに戻る</button>' + (offTurn ? '<button class="bopt" data-m="take">🐻 切断中の人をふーさんに交代</button>' : '') : '<button class="bopt" data-m="req">🙋 ロビーに戻りたい（ホストに伝える）</button>') +
      '<button class="bopt" data-m="vib">📳 あなたの番の振動：' + (vibOn() ? 'ON' : 'OFF') + '</button><button class="bopt" data-m="leave">🚪 ' + (host ? '部屋を閉じる' : '退出する') + '</button><div class="row"><button class="btn" data-x>とじる</button></div>', 'menu');
    $('dlg').onclick = function (e) {
      var b = e.target.closest('[data-m]'); if (e.target.closest('[data-x]')) return closeDlg(); if (!b) return; closeDlg();
      var m = b.dataset.m;
      if (m === 'abort') confirmBox('中断してロビーに戻りますか？', 'いまのゲームを終了して、全員をこの部屋のロビーに戻します。部屋コード・参加者はそのままです。', '中断してロビーへ', function () { hostToLobby('⏸️ ホストがゲームを中断しました'); });
      else if (m === 'take') host.room.pids.forEach(function (_, q) { var s = seatOfP(q); if (s && s.kind === 'remote' && !s.connected) takeover(q); });
      else if (m === 'req') { send({ t: 'lobbyReq' }); toast('ホストに「ロビーに戻りたい」と伝えました'); }
      else if (m === 'vib') { lsSet(LS_VIB, vibOn() ? 'off' : 'on'); toast('振動 ' + (vibOn() ? 'ON' : 'OFF')); }
      else if (m === 'leave') leaveRoom();
    };
  }
  function leaveRoom() {
    if (host) confirmBox('部屋を閉じますか？', '参加者全員の接続が切れ、ゲームは終了します。', '部屋を閉じる', function () {
      Object.keys(host.conns).forEach(function (cid) { try { host.conns[cid].send({ t: 'closed' }); } catch (e) {} });
      setTimeout(function () { try { host.peer.destroy(); } catch (e) {} location.href = location.pathname; }, 400);
    });
    else confirmBox('部屋を出ますか？', 'ゲーム中に出ても、同じニックネームで入り直せば元の席に戻れます（それまではふーさん🐻が代わりにプレイ）。', '部屋を出る', function () { try { sessionStorage.removeItem(SS_JOINED); } catch (e) {} leaveClient(true); });
  }
  var seenNotice = null;
  function noticeUi(v) {
    if (seenNotice === null) seenNotice = v.notice ? v.notice.id : 0;
    else if (v.notice && v.notice.id !== seenNotice) { seenNotice = v.notice.id; if (!host) toast(v.notice.msg + (v.phase === 'lobby' ? '。ロビーで次のゲームを待っています' : '')); }
    var bar = $('lobbyReqBar'), key = host && v.lobbyReq && v.phase !== 'lobby' ? v.lobbyReq.sid + ':' + v.lobbyReq.at : '';
    if (bar.dataset.key !== key) {
      bar.dataset.key = key;
      bar.innerHTML = key ? '<span>🙋 ' + esc(v.lobbyReq.name) + '「ロビーに戻りたい」</span><button data-lr="abort">中断してロビーへ</button><button data-lr="no">とじる</button>' : '';
      bar.classList.toggle('show', !!key);
    }
  }
  $('lobbyReqBar').addEventListener('click', function (e) {
    var b = e.target.closest('button[data-lr]'); if (!b || !host) return;
    host.room.lobbyReq = null;
    if (b.dataset.lr === 'abort') hostToLobby('⏸️ ホストがゲームを中断しました'); else hostBroadcast();
  });

  // ---------------- ロビー ----------------
  function renderLobby(v) {
    var isHost = !!host, n = Math.max(3, v.opts.n, v.seats.length);
    $('codeBig').textContent = v.code;
    var url = inviteUrl(v.code); $('inviteUrl').textContent = url;
    if ($('qr').dataset.url !== url) { try { var qr = qrcode(0, 'M'); qr.addData(url); qr.make(); $('qr').innerHTML = qr.createSvgTag({ cellSize: 4, margin: 2, scalable: true }); } catch (e) { $('qr').textContent = ''; } $('qr').dataset.url = url; }
    var rows = v.seats.map(function (s, i) {
      return '<div class="seat' + (s.connected ? '' : ' off') + '"><span class="dot" style="background:' + COLORS[i] + '"></span><span class="nm">' + esc(s.name) + '</span>' + (s.kind === 'host' ? '<span class="tagx">ホスト</span>' : '') + (i === v.you ? '<span class="tagx" style="background:#ffe28a">あなた</span>' : '') + (s.connected ? '' : '<span class="tagx">切断</span>') +
        (isHost && s.kind !== 'host' ? '<button class="xbtn" data-sid="' + s.sid + '" aria-label="外す">×</button>' : '') + '</div>';
    });
    var ncpu = n - v.seats.length;
    for (var k = 0; k < ncpu; k++) rows.push('<div class="seat cpu"><span class="dot" style="background:' + COLORS[v.seats.length + k] + '"></span><span class="nm">' + (ncpu > 1 ? 'ふーさん🐻' + (k + 1) : 'ふーさん🐻') + '</span><span class="tagx">🐻 CPU</span></div>');
    $('seatList').innerHTML = rows.join('');
    $('seatCount').textContent = v.seats.length + '人 ＋ ふーさん' + ncpu + '人';
    $('seatHint').textContent = '招待URL・QR・部屋コードで最大4人まで参加できます。足りない席はふーさん🐻が入ります。';
    $('nSeg').innerHTML = [3, 4].map(function (x) { return '<button data-n="' + x + '" class="' + (v.opts.n === x ? 'on' : '') + '"' + (isHost && x >= v.seats.length ? '' : ' disabled') + '>' + x + '人</button>'; }).join('');
  }
  $('nSeg').addEventListener('click', function (e) { var b = e.target.closest('button[data-n]'); if (!b || !host || host.room.phase !== 'lobby') return; host.room.opts.n = +b.dataset.n; hostBroadcast(); });
  $('lobbyStart').onclick = function () { if (host && host.room.phase === 'lobby') hostStartGame(); };
  $('seatList').addEventListener('click', function (e) {
    var b = e.target.closest('button[data-sid]'); if (!b || !host) return;
    var R = host.room, seat = seatBySid(+b.dataset.sid); if (!seat || seat.kind === 'host' || R.phase !== 'lobby') return;
    confirmBox(seat.name + 'を外しますか？', '部屋から退出させます。', '外す', function () {
      var c = host.conns[seat.clientId]; if (c) { try { c.send({ t: 'kicked' }); } catch (x) {} setTimeout(function () { try { c.close(); } catch (x) {} }, 300); delete host.conns[seat.clientId]; }
      R.seats.splice(R.seats.indexOf(seat), 1); hostBroadcast();
    });
  });
  $('leaveBtn1').onclick = leaveRoom;
  $('copyBtn').onclick = function () { var u = $('inviteUrl').textContent; (navigator.clipboard ? navigator.clipboard.writeText(u) : Promise.reject()).then(function () { toast('招待URLをコピーしました'); }, function () { toast('URLを長押ししてコピーしてください'); }); };
  $('shareBtn').onclick = function () { var u = $('inviteUrl').textContent; if (navigator.share) navigator.share({ title: 'ふーさんの もりびらき', text: 'いっしょに森の村づくりをしよう！', url: u }).catch(function () {}); else $('copyBtn').click(); };

  // ---------------- タイトル（1台 / オンライン） ----------------
  function setTitleMode(m) {
    Array.prototype.forEach.call($('modeSeg').children, function (b) { b.classList.toggle('on', b.dataset.mode === m); });
    $('localPanel').style.display = m === 'local' ? '' : 'none'; $('onlinePanel').style.display = m === 'online' ? '' : 'none';
  }
  $('modeSeg').addEventListener('click', function (e) { var b = e.target.closest('button[data-mode]'); if (b) setTitleMode(b.dataset.mode); });
  function renderOnlineTitle() {
    if (!$('nameIn').value) $('nameIn').value = lsGet(LS_NAME) || '';
    var inv = normCode(Q.get('room'));
    $('inviteJoinBox').style.display = inv.length === 4 ? '' : 'none'; $('invCode').textContent = inv;
    if (inv.length === 4) { $('codeIn').value = inv; setTitleMode('online'); }
  }
  function getName() { var n = cleanName($('nameIn').value); if (!n) { toast('ニックネームを入力してください'); $('nameIn').focus(); return null; } lsSet(LS_NAME, n); return n; }
  $('createBtn').onclick = function () { var n = getName(); if (n) startHost(n); };
  function joinRoom(code) { var n = getName(); if (!n) return; code = normCode(code); if (code.length !== 4) { toast('4文字の部屋コードを入力してください'); return; } startClient(code, n); }
  $('joinBtn').onclick = function () { joinRoom($('codeIn').value); };
  $('joinInvitedBtn').onclick = function () { joinRoom(Q.get('room')); };
  $('codeIn').addEventListener('input', function () { this.value = normCode(this.value); });
  renderOnlineTitle();

  window.__mori = { G: function () { return G; }, setG: function (g) { G = g; buildBoard(); step(); }, act: doAct, viewer: function () { return viewer; }, M: M,
    view: null, role: function () { return host ? 'host' : client ? 'guest' : 'local'; }, host: function () { return host ? host.room : null; }, hostStep: function () { hostStep(); }, hostBroadcast: function () { hostBroadcast(); } };
  renderSetup();
})();
