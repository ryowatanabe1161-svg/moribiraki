/* ふーさんの もりびらき ― 画面（1台で順番に遊ぶ・通信なし） */
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
  function show(id) { ['setup', 'game'].forEach(function (s) { $(s).classList.toggle('active', s === id); }); }

  // ---------- ゲーム状態 ----------
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
  function say(p, kind) { if (Math.random() < 0.75 || kind === 'yes' || kind === 'no') G.log.unshift('🐻 ' + G.players[p].name + '「' + pick(LINES[kind]) + '」'); }
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
    if (mode && viewer === me && G.players[me].kind === 'human') {
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
        '<div class="nm"><i></i>' + esc(P.name) + '</div><div class="st"><span class="vp">★' + v + '</span><span>🎴' + M.total(P.res) + '</span><span>🃏' + P.dev.length + '</span><span>🏹' + P.knights + '</span><span>🛤' + M.roadLength(G, i) + '</span></div></div>';
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
    var mine = me === cur && G.players[cur].kind === 'human' && G.phase !== 'over';
    // disabled 属性だと押しても何も起きず「反応しない」と感じるので、見た目だけ薄くして、押したら理由を出す
    var why = !mine ? (G.phase === 'over' ? 'ゲームは終わりました' : G.players[cur].kind === 'npc' ? G.players[cur].name + 'の番です。考え中クマ…ちょっと待ってね' : G.players[cur].name + 'の番です')
      : G.phase === 'setup' ? 'じゅんび中：盤の光っている所をタップしてね' : G.phase === 'roll' ? '先にサイコロをふってね' : G.phase === 'robber' ? '先にアライグマを動かしてね（盤のマスをタップ）'
      : G.phase === 'steal' ? '先にだれから1枚もらうか選んでね' : G.phase === 'roads' ? 'ただのこみちを置いてね（盤の辺をタップ）' : G.phase === 'discard' ? '手札をすてる人を待っています' : '';
    setAct('rollBtn', mine && G.phase === 'roll', mine && G.phase === 'main' ? 'サイコロはもうふりました' : why);
    setAct('buildBtn', mine && G.phase === 'main', why); setAct('tradeBtn', mine && G.phase === 'main', why);
    setAct('devBtn', mine && (G.phase === 'main' || G.phase === 'roll'), why);
    setAct('endBtn', mine && G.phase === 'main', why);
    var st = '', cn = esc(G.players[cur].name), cancel = false;
    if (G.phase === 'over') st = '🎉 ' + esc(G.players[G.winner].name) + 'の勝ち！';
    else if (G.players[cur].kind === 'npc') st = cn + 'が考え中クマ…' + (G.phase === 'setup' ? '（じゅんび）' : '');
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
  function openDlg(html) { $('dlg').innerHTML = html; $('dlgOv').classList.add('active'); }
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
      openDlg('<h2>🗑️ ' + esc(P.name) + '：' + need + '枚すてる</h2><p class="hint" style="text-align:center">手札が8枚以上なので半分すてます（' + M.total(c) + ' / ' + need + '）</p>' + stepper('dc', c, P.res) + '<div class="row"><button class="btn main" data-ok' + (M.total(c) === need ? '' : ' disabled') + '>すてる</button></div>');
    }
    draw();
    $('dlg').onclick = function (e) {
      var b = e.target.closest('[data-d]');
      if (b) { var k = b.dataset.r; c[k] = Math.max(0, Math.min(P.res[k], c[k] + +b.dataset.d)); if (M.total(c) > need) c[k]--; draw(); return; }
      if (e.target.closest('[data-ok]')) { lock(false); closeDlg(); doAct({ p: p, type: 'discard', cards: c }); }
    };
  }
  function openSteal() {
    var p = G.turn, vs = M.victims(G, p, G.robber); lock(true);
    openDlg('<h2>🦝 だれから1枚もらう？</h2>' + vs.map(function (q) { return '<div class="resp"><span style="color:' + COLORS[q] + '">●</span>' + esc(G.players[q].name) + '（手札' + M.total(G.players[q].res) + '枚）<button class="btn main" data-v="' + q + '">もらう</button></div>'; }).join(''));
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
  function showEnd() { $('toast').classList.remove('show');
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
    openDlg('<h2>メニュー</h2><button class="bopt" data-m="home">🏠 タイトルへ（つづきから再開できます）</button><button class="bopt" data-m="new">🔄 同じメンバーで新しいゲーム</button><div class="row"><button class="btn" data-x>とじる</button></div>');
    $('dlg').onclick = function (e) {
      var b = e.target.closest('[data-m]'); if (e.target.closest('[data-x]')) return closeDlg(); if (!b) return; closeDlg();
      if (b.dataset.m === 'home') { clearTimeout(npcT); var g = G; G = null; save0(g); show('setup'); renderSetup(); }
      else newGame(G.players.map(function (p) { return { name: p.name, kind: p.kind }; }));
    };
  };
  function save0(g) { try { localStorage.setItem(SAVE, JSON.stringify({ G: g, at: Date.now() })); } catch (e) {} }
  $('rulesBtn1').onclick = $('rulesBtn2').onclick = function () {
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

  window.__mori = { G: function () { return G; }, setG: function (g) { G = g; buildBoard(); step(); }, act: doAct, viewer: function () { return viewer; }, M: M };
  renderSetup();
})();
