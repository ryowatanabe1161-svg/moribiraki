/* ふーさんの もりびらき ― ルールとふーさん🐻（ブラウザ / Node 共通・通信なし） */
(function (root) {
  'use strict';
  var RES = ['wood', 'brick', 'wool', 'grain', 'ore'];
  var RES_INFO = {
    wood: { n: 'まるた', e: '🪵', tile: 'もり', c: '#3f8f4a' },
    brick: { n: 'ねんど', e: '🧱', tile: 'ねんど山', c: '#c4683a' },
    wool: { n: 'わたげ', e: '🐑', tile: 'まきば', c: '#a5cf6a' },
    grain: { n: 'こむぎ', e: '🌾', tile: 'はたけ', c: '#e9c24a' },
    ore: { n: 'いわ', e: '🪨', tile: 'いわやま', c: '#8e9aa8' },
    desert: { n: 'はらっぱ', e: '🌼', tile: 'はらっぱ', c: '#e6d6a6' }
  };
  var COST = {
    road: { wood: 1, brick: 1 }, sett: { wood: 1, brick: 1, wool: 1, grain: 1 },
    city: { grain: 2, ore: 3 }, dev: { wool: 1, grain: 1, ore: 1 }
  };
  var LIMIT = { road: 15, sett: 5, city: 4 };
  var DEV_INFO = {
    knight: { n: 'もりの番人', e: '🏹', d: 'いたずらアライグマ🦝を動かして、1枚もらう' },
    road: { n: 'こみちづくり', e: '🛤️', d: 'こみちを2本ただで作る' },
    plenty: { n: 'ほうさく', e: '🌈', d: '好きなめぐみを2枚もらう' },
    mono: { n: 'ひとりじめ', e: '🧲', d: 'めぐみを1種類えらび、全員から全部もらう' },
    vp: { n: 'たからもの', e: '🏆', d: '持っているだけで1点（かくしておける）' }
  };
  var TILES = ['wood', 'wood', 'wood', 'wood', 'brick', 'brick', 'brick', 'wool', 'wool', 'wool', 'wool', 'grain', 'grain', 'grain', 'grain', 'ore', 'ore', 'ore', 'desert'];
  var TOKENS = [2, 3, 3, 4, 4, 5, 5, 6, 6, 8, 8, 9, 9, 10, 10, 11, 11, 12];
  var PORTS = ['any', 'any', 'any', 'any', 'wood', 'brick', 'wool', 'grain', 'ore'];
  var PIPS = { 2: 1, 3: 2, 4: 3, 5: 4, 6: 5, 8: 5, 9: 4, 10: 3, 11: 2, 12: 1 };
  var WIN = 10;

  // ---- 盤（19マス・頂点54・辺72） ----
  var SQ3 = Math.sqrt(3), HEX = [], VERT = [], EDGE = [];
  (function () {
    var vk = {}, ek = {};
    for (var q = -2; q <= 2; q++) for (var r = Math.max(-2, -q - 2); r <= Math.min(2, -q + 2); r++) {
      var h = { q: q, r: r, x: SQ3 * (q + r / 2), y: 1.5 * r, v: [], e: [], nb: [] }, hi = HEX.length, i, a;
      for (i = 0; i < 6; i++) {
        a = Math.PI / 180 * (60 * i - 30);
        var x = h.x + Math.cos(a), y = h.y + Math.sin(a), k = Math.round(x * 1000) + ',' + Math.round(y * 1000);
        if (vk[k] == null) { vk[k] = VERT.length; VERT.push({ x: x, y: y, h: [], adj: [], e: [] }); }
        h.v.push(vk[k]); VERT[vk[k]].h.push(hi);
      }
      for (i = 0; i < 6; i++) {
        var va = Math.min(h.v[i], h.v[(i + 1) % 6]), vb = Math.max(h.v[i], h.v[(i + 1) % 6]), k2 = va + '-' + vb;
        if (ek[k2] == null) { ek[k2] = EDGE.length; EDGE.push({ a: va, b: vb, h: [] }); VERT[va].adj.push(vb); VERT[vb].adj.push(va); VERT[va].e.push(ek[k2]); VERT[vb].e.push(ek[k2]); }
        h.e.push(ek[k2]); EDGE[ek[k2]].h.push(hi);
      }
      HEX.push(h);
    }
    EDGE.forEach(function (e) { if (e.h.length === 2) { HEX[e.h[0]].nb.push(e.h[1]); HEX[e.h[1]].nb.push(e.h[0]); } });
  })();
  var COAST = EDGE.map(function (e, i) { return i; }).filter(function (i) { return EDGE[i].h.length === 1; })
    .sort(function (i, j) { var A = EDGE[i], B = EDGE[j]; return Math.atan2(VERT[A.a].y + VERT[A.b].y, VERT[A.a].x + VERT[A.b].x) - Math.atan2(VERT[B.a].y + VERT[B.b].y, VERT[B.a].x + VERT[B.b].x); });
  var PORT_SLOTS = [0, 3, 7, 10, 13, 17, 20, 23, 27];

  // ---- 乱数（状態に保存できる） ----
  function rand(G) { G.rs = (G.rs + 0x6D2B79F5) >>> 0; var t = G.rs; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }
  function shuffle(G, a) { for (var i = a.length - 1; i > 0; i--) { var j = Math.floor(rand(G) * (i + 1)), t = a[i]; a[i] = a[j]; a[j] = t; } return a; }
  function zero() { return { wood: 0, brick: 0, wool: 0, grain: 0, ore: 0 }; }
  function total(h) { var n = 0; for (var k in h) n += h[k] || 0; return n; }
  function has(h, need) { for (var k in need) if ((h[k] || 0) < need[k]) return false; return true; }
  function sub(h, c) { for (var k in c) h[k] -= c[k]; }
  function add(h, c) { for (var k in c) h[k] = (h[k] || 0) + c[k]; }

  // cfg: { players: [{ name, kind:'human'|'npc' }], seed }
  function createGame(cfg) {
    var n = cfg.players.length; if (n < 3 || n > 4) throw new Error('3〜4人で遊べます');
    var G = { rs: (cfg.seed != null ? cfg.seed : Math.floor(Math.random() * 4294967296)) >>> 0 };
    var tiles = shuffle(G, TILES.slice()), toks;
    for (var tries = 0; ; tries++) {
      toks = shuffle(G, TOKENS.slice()); var k = 0, num = [];
      for (var i = 0; i < 19; i++) num.push(tiles[i] === 'desert' ? 0 : toks[k++]);
      var bad = HEX.some(function (h, i) { return (num[i] === 6 || num[i] === 8) && h.nb.some(function (j) { return num[j] === 6 || num[j] === 8; }); });
      if (!bad) break;
    }
    G.hexes = tiles.map(function (t, i) { return { res: t, num: num[i] }; });
    G.robber = tiles.indexOf('desert');
    var pt = shuffle(G, PORTS.slice());
    G.ports = PORT_SLOTS.map(function (s, i) { return { e: COAST[s], t: pt[i] }; });
    G.portAt = []; for (i = 0; i < VERT.length; i++) G.portAt.push(null);
    G.ports.forEach(function (p) { G.portAt[EDGE[p.e].a] = p.t; G.portAt[EDGE[p.e].b] = p.t; });
    G.players = cfg.players.map(function (p, i) { return { name: p.name, kind: p.kind, res: zero(), dev: [], knights: 0, roads: [], setts: [], cities: [] }; });
    G.vOwner = VERT.map(function () { return null; });   // { p, city }
    G.eOwner = EDGE.map(function () { return -1; });
    G.bank = { wood: 19, brick: 19, wool: 19, grain: 19, ore: 19 };
    G.deck = shuffle(G, [].concat(rep('knight', 14), rep('vp', 5), rep('road', 2), rep('plenty', 2), rep('mono', 2)));
    G.setupOrder = []; for (i = 0; i < n; i++) G.setupOrder.push(i); for (i = n - 1; i >= 0; i--) G.setupOrder.push(i);
    G.setupIdx = 0; G.setupNeed = 'sett'; G.setupV = -1;
    G.turn = 0; G.turnNo = 0; G.phase = 'setup'; G.dice = null; G.devPlayed = false;
    G.discardNeed = {}; G.freeRoads = 0; G.ret = 'main';
    G.longest = -1; G.army = -1; G.winner = -1; G.log = []; G.seq = 0;
    return G;
  }
  function rep(x, n) { var a = []; for (var i = 0; i < n; i++) a.push(x); return a; }

  // ---- 判定 ----
  function vp(G, p, hidden) {
    var P = G.players[p], v = P.setts.length + 2 * P.cities.length + (G.longest === p ? 2 : 0) + (G.army === p ? 2 : 0);
    if (hidden !== false) v += P.dev.filter(function (d) { return d.t === 'vp'; }).length;
    return v;
  }
  function publicVp(G, p) { return vp(G, p, false); }
  function canSettle(G, p, v, setup) {
    if (G.vOwner[v]) return false;
    if (VERT[v].adj.some(function (u) { return G.vOwner[u]; })) return false;         // きょりのルール
    if (setup) return true;
    return VERT[v].e.some(function (e) { return G.eOwner[e] === p; });
  }
  function canRoad(G, p, e) {
    if (G.eOwner[e] !== -1) return false;
    var E = EDGE[e];
    if (G.phase === 'setup') return E.a === G.setupV || E.b === G.setupV;
    return [E.a, E.b].some(function (x) {
      var o = G.vOwner[x];
      if (o) return o.p === p;                                                         // 自分の家なら OK・ほかの人の家はとおれない
      return VERT[x].e.some(function (f) { return f !== e && G.eOwner[f] === p; });
    });
  }
  function validVerts(G, p, setup) { var o = []; for (var v = 0; v < VERT.length; v++) if (canSettle(G, p, v, setup)) o.push(v); return o; }
  function validEdges(G, p) { var o = []; for (var e = 0; e < EDGE.length; e++) if (canRoad(G, p, e)) o.push(e); return o; }
  function portRates(G, p) {
    var r = { wood: 4, brick: 4, wool: 4, grain: 4, ore: 4 }, P = G.players[p];
    P.setts.concat(P.cities).forEach(function (v) { var t = G.portAt[v]; if (!t) return; if (t === 'any') RES.forEach(function (k) { r[k] = Math.min(r[k], 3); }); else r[t] = 2; });
    return r;
  }
  // いちばん長いこみち：同じ辺は1回だけ。ほかの人の家がある頂点は通りぬけられない
  function roadLength(G, p) {
    var mine = G.players[p].roads, best = 0, used = {};
    if (!mine.length) return 0;
    function blocked(x) { var o = G.vOwner[x]; return o && o.p !== p; }
    function dfs(x, len) {
      if (len > best) best = len;
      VERT[x].e.forEach(function (e) {
        if (used[e] || G.eOwner[e] !== p) return;
        var y = EDGE[e].a === x ? EDGE[e].b : EDGE[e].a;
        used[e] = true;
        if (blocked(y)) { if (len + 1 > best) best = len + 1; } else dfs(y, len + 1);
        used[e] = false;
      });
    }
    var starts = {}; mine.forEach(function (e) { starts[EDGE[e].a] = 1; starts[EDGE[e].b] = 1; });
    Object.keys(starts).forEach(function (x) { dfs(+x, 0); });
    return best;
  }
  function updateLongest(G) {
    var lens = G.players.map(function (_, i) { return roadLength(G, i); }), h = G.longest, before = h;
    if (h >= 0 && lens[h] >= 5 && lens.every(function (l, i) { return i === h || l <= lens[h]; })) return;
    var best = Math.max.apply(null, lens), c = [];
    lens.forEach(function (l, i) { if (l === best && l >= 5) c.push(i); });
    G.longest = c.length === 1 ? c[0] : -1;
    if (G.longest !== before) note(G, G.longest >= 0 ? '🛤️ ' + G.players[G.longest].name + 'が「いちばん長いこみち」（' + best + '本）！' : '🛤️ 「いちばん長いこみち」はだれのものでもなくなった');
  }
  function updateArmy(G, p) {
    var k = G.players[p].knights, h = G.army;
    if (k >= 3 && (h < 0 || (h !== p && k > G.players[h].knights))) { G.army = p; note(G, '🏹 ' + G.players[p].name + 'が「いちばん強い番人たち」（' + k + '人）！'); }
  }
  function note(G, msg) { G.log.unshift(msg); if (G.log.length > 60) G.log.length = 60; }
  function checkWin(G) {
    if (G.phase === 'over' || G.phase === 'setup') return;
    if (vp(G, G.turn) >= WIN) { G.phase = 'over'; G.winner = G.turn; note(G, '🎉 ' + G.players[G.turn].name + 'が' + vp(G, G.turn) + '点で勝利！'); }
  }
  function playableDev(G, p, t) { return G.players[p].dev.some(function (d) { return d.t === t && d.turn < G.turnNo; }); }

  // ---- 行動：act(G, { p, type, ... }) → { ok, err?, ev? } ----
  function fail(err) { return { ok: false, err: err }; }
  function act(G, a) {
    var r = act0(G, a);
    if (r.ok) { G.seq++; if (G.phase !== 'over' && a.p === G.turn) checkWin(G); }
    return r;
  }
  function act0(G, a) {
    var p = a.p, P = G.players[p], ph = G.phase;
    if (ph === 'over') return fail('ゲームは終わっています');
    if (a.type === 'discard') return doDiscard(G, p, a.cards || {});
    if (p !== G.turn) return fail('あなたの番ではありません');
    if (ph === 'setup') {
      if (a.type === 'settle' && G.setupNeed === 'sett') {
        if (!canSettle(G, p, a.v, true)) return fail('そこには建てられません（となりに家があります）');
        placeSett(G, p, a.v); G.setupV = a.v; G.setupNeed = 'road';
        var got = zero();
        if (G.setupIdx >= G.players.length) VERT[a.v].h.forEach(function (h) { var t = G.hexes[h].res; if (t !== 'desert' && G.bank[t] > 0) { got[t]++; G.bank[t]--; P.res[t]++; } });
        note(G, '🏠 ' + P.name + 'がいえを建てた' + (total(got) ? '（' + resTxt(got) + '）' : ''));
        return { ok: true, ev: { type: 'settle', v: a.v, got: got } };
      }
      if (a.type === 'road' && G.setupNeed === 'road') {
        if (!canRoad(G, p, a.e)) return fail('いま建てたいえにつながるこみちにしてください');
        G.eOwner[a.e] = p; P.roads.push(a.e);
        G.setupIdx++; G.setupNeed = 'sett'; G.setupV = -1;
        if (G.setupIdx >= G.setupOrder.length) { G.phase = 'roll'; G.turn = 0; G.turnNo = 1; note(G, '🌅 じゅんび完了！ ' + G.players[0].name + 'の番から'); }
        else G.turn = G.setupOrder[G.setupIdx];
        return { ok: true, ev: { type: 'road', e: a.e } };
      }
      return fail('いまはできません');
    }
    switch (a.type) {
      case 'roll': {
        if (ph !== 'roll') return fail('もうサイコロをふりました');
        var d1 = 1 + Math.floor(rand(G) * 6), d2 = 1 + Math.floor(rand(G) * 6), s = d1 + d2;
        G.dice = [d1, d2];
        note(G, '🎲 ' + P.name + '：' + d1 + '＋' + d2 + '＝' + s);
        if (s === 7) {
          G.discardNeed = {};
          G.players.forEach(function (q, i) { var n = total(q.res); if (n > 7) G.discardNeed[i] = Math.floor(n / 2); });
          G.ret = 'main';
          G.phase = Object.keys(G.discardNeed).length ? 'discard' : 'robber';
          note(G, '🦝 7！ いたずらアライグマが出た' + (G.phase === 'discard' ? '（8枚以上の人は半分すてる）' : ''));
          return { ok: true, ev: { type: 'roll', dice: G.dice, sum: 7 } };
        }
        var prod = produce(G, s); G.phase = 'main';
        return { ok: true, ev: { type: 'roll', dice: G.dice, sum: s, prod: prod } };
      }
      case 'robber': {
        if (ph !== 'robber') return fail('いまはアライグマを動かせません');
        if (a.h === G.robber || !(a.h >= 0 && a.h < 19)) return fail('ちがうマスにしてください');
        G.robber = a.h;
        note(G, '🦝 ' + P.name + 'がアライグマを' + RES_INFO[G.hexes[a.h].res].tile + (G.hexes[a.h].num ? '(' + G.hexes[a.h].num + ')' : '') + 'へ');
        var vs = victims(G, p, a.h);
        if (!vs.length) { G.phase = G.ret; return { ok: true, ev: { type: 'robber', h: a.h } }; }
        if (vs.length === 1) { var st = steal(G, p, vs[0]); G.phase = G.ret; return { ok: true, ev: { type: 'robber', h: a.h, stole: st } }; }
        G.phase = 'steal'; return { ok: true, ev: { type: 'robber', h: a.h, choose: vs } };
      }
      case 'steal': {
        if (ph !== 'steal' || victims(G, p, G.robber).indexOf(a.v) < 0) return fail('その人からはもらえません');
        var st2 = steal(G, p, a.v); G.phase = G.ret; return { ok: true, ev: { type: 'steal', stole: st2 } };
      }
      case 'build': return doBuild(G, p, a);
      case 'buyDev': {
        if (ph !== 'main') return fail('サイコロのあとで買えます');
        if (!G.deck.length) return fail('ふしぎカードはもうありません');
        if (!has(P.res, COST.dev)) return fail('めぐみが足りません');
        pay(G, P, COST.dev); var t = G.deck.pop(); P.dev.push({ t: t, turn: G.turnNo });
        note(G, '🃏 ' + P.name + 'がふしぎカードを買った');
        return { ok: true, ev: { type: 'buyDev', t: t } };
      }
      case 'playDev': return doPlayDev(G, p, a);
      case 'endRoads': if (ph !== 'roads') return fail('いまはできません'); G.freeRoads = 0; G.phase = G.ret; return { ok: true };
      case 'bank': {
        if (ph !== 'main') return fail('サイコロのあとで交換できます');
        var rate = portRates(G, p)[a.give];
        if (!rate || RES.indexOf(a.get) < 0 || a.give === a.get) return fail('交換の内容がおかしいです');
        if (P.res[a.give] < rate) return fail(RES_INFO[a.give].n + 'が' + rate + '枚必要です');
        if (G.bank[a.get] < 1) return fail('森のくらに' + RES_INFO[a.get].n + 'がありません');
        P.res[a.give] -= rate; G.bank[a.give] += rate; P.res[a.get]++; G.bank[a.get]--;
        note(G, '🔁 ' + P.name + '：' + RES_INFO[a.give].e + '×' + rate + ' → ' + RES_INFO[a.get].e);
        return { ok: true, ev: { type: 'bank' } };
      }
      case 'trade': {   // 相手の同意は画面側（ふーさんは npcAccept、人間は確認ダイアログ）で取る
        if (ph !== 'main') return fail('サイコロのあとで交換できます');
        var Q = G.players[a.to]; if (!Q || a.to === p) return fail('相手がいません');
        if (!total(a.give) || !total(a.get)) return fail('出すものと、ほしいものを決めてください');
        if (!has(P.res, a.give)) return fail('出すめぐみが足りません');
        if (!has(Q.res, a.get)) return fail(Q.name + 'はそのめぐみを持っていません');
        sub(P.res, a.give); add(Q.res, a.give); sub(Q.res, a.get); add(P.res, a.get);
        note(G, '🤝 ' + P.name + '⇄' + Q.name + '：' + resTxt(a.give) + ' と ' + resTxt(a.get));
        return { ok: true, ev: { type: 'trade' } };
      }
      case 'end': {
        if (ph !== 'main') return fail('いまはターンを終われません');
        G.turn = (G.turn + 1) % G.players.length; G.turnNo++; G.phase = 'roll'; G.devPlayed = false; G.dice = null;
        return { ok: true, ev: { type: 'end' } };
      }
    }
    return fail('いまはできません');
  }
  function pay(G, P, c) { sub(P.res, c); add(G.bank, c); }
  function placeSett(G, p, v) { G.vOwner[v] = { p: p, city: false }; G.players[p].setts.push(v); }
  function doBuild(G, p, a) {
    var P = G.players[p], free = G.phase === 'roads' && a.what === 'road';
    if (G.phase !== 'main' && !free) return fail('サイコロのあとで建てられます');
    if (a.what === 'road') {
      if (P.roads.length >= LIMIT.road) return fail('こみちはもうありません（15本まで）');
      if (!free && !has(P.res, COST.road)) return fail('めぐみが足りません');
      if (!canRoad(G, p, a.e)) return fail('自分のこみちか家につながる場所にしてください');
      if (!free) pay(G, P, COST.road);
      G.eOwner[a.e] = p; P.roads.push(a.e); updateLongest(G);
      if (free) { G.freeRoads--; if (G.freeRoads <= 0 || !validEdges(G, p).length || P.roads.length >= LIMIT.road) { G.freeRoads = 0; G.phase = G.ret; } }
      note(G, '🛤️ ' + P.name + 'がこみちを作った' + (free ? '（ただ）' : ''));
      return { ok: true, ev: { type: 'build', what: 'road', e: a.e } };
    }
    if (a.what === 'sett') {
      if (P.setts.length >= LIMIT.sett) return fail('いえはもうありません（5けんまで）');
      if (!has(P.res, COST.sett)) return fail('めぐみが足りません');
      if (!canSettle(G, p, a.v, false)) return fail('自分のこみちにつながり、となりに家がない角にしてください');
      pay(G, P, COST.sett); placeSett(G, p, a.v); updateLongest(G);
      note(G, '🏠 ' + P.name + 'がいえを建てた');
      return { ok: true, ev: { type: 'build', what: 'sett', v: a.v } };
    }
    if (a.what === 'city') {
      if (P.cities.length >= LIMIT.city) return fail('やかたはもうありません（4つまで）');
      if (!has(P.res, COST.city)) return fail('めぐみが足りません');
      var o = G.vOwner[a.v]; if (!o || o.p !== p || o.city) return fail('自分のいえを選んでください');
      pay(G, P, COST.city); o.city = true; P.setts.splice(P.setts.indexOf(a.v), 1); P.cities.push(a.v);
      note(G, '🏰 ' + P.name + 'がいえをやかたにした');
      return { ok: true, ev: { type: 'build', what: 'city', v: a.v } };
    }
    return fail('いまはできません');
  }
  function doPlayDev(G, p, a) {
    var P = G.players[p], t = a.t;
    if (G.phase !== 'roll' && G.phase !== 'main') return fail('いまはふしぎカードを使えません');
    if (G.devPlayed) return fail('ふしぎカードは1ターンに1枚までです');
    if (t === 'vp' || !DEV_INFO[t]) return fail('そのカードは使うものではありません');
    if (!playableDev(G, p, t)) return fail(P.dev.some(function (d) { return d.t === t; }) ? '買ったターンには使えません' : 'そのカードを持っていません');
    if (t === 'plenty' && !(RES.indexOf(a.a) >= 0 && RES.indexOf(a.b) >= 0)) return fail('めぐみを2つ選んでください');
    if (t === 'plenty') { var need = {}; need[a.a] = 1; need[a.b] = (need[a.b] || 0) + 1; if (!has(G.bank, need)) return fail('森のくらに足りません'); }
    if (t === 'mono' && RES.indexOf(a.r) < 0) return fail('めぐみを選んでください');
    if (t === 'road' && (P.roads.length >= LIMIT.road || !validEdges(G, p).length)) return fail('こみちを作れる場所がありません');
    var k = -1; P.dev.forEach(function (d, i) { if (k < 0 && d.t === t && d.turn < G.turnNo) k = i; });
    P.dev.splice(k, 1); G.devPlayed = true;
    note(G, DEV_INFO[t].e + ' ' + P.name + 'が「' + DEV_INFO[t].n + '」を使った');
    var ev = { type: 'dev', t: t };
    if (t === 'knight') { P.knights++; updateArmy(G, p); G.ret = G.phase; G.phase = 'robber'; }
    else if (t === 'road') { G.ret = G.phase; G.freeRoads = 2; G.phase = 'roads'; }
    else if (t === 'plenty') { [a.a, a.b].forEach(function (r) { G.bank[r]--; P.res[r]++; }); note(G, '　→ ' + RES_INFO[a.a].e + RES_INFO[a.b].e + 'をもらった'); }
    else if (t === 'mono') {
      var n = 0; G.players.forEach(function (q, i) { if (i !== p) { n += q.res[a.r]; P.res[a.r] += q.res[a.r]; q.res[a.r] = 0; } });
      note(G, '　→ ' + RES_INFO[a.r].e + 'を' + n + '枚ひとりじめ'); ev.n = n;
    }
    return { ok: true, ev: ev };
  }
  function doDiscard(G, p, cards) {
    if (G.phase !== 'discard' || !G.discardNeed[p]) return fail('すてる必要はありません');
    var P = G.players[p];
    if (total(cards) !== G.discardNeed[p] || !has(P.res, cards) || RES.some(function (k) { return cards[k] < 0; })) return fail(G.discardNeed[p] + '枚えらんでください');
    pay(G, P, cards); delete G.discardNeed[p];
    note(G, '🗑️ ' + P.name + 'が' + total(cards) + '枚すてた');
    if (!Object.keys(G.discardNeed).length) G.phase = 'robber';
    return { ok: true, ev: { type: 'discard' } };
  }
  function victims(G, p, h) {
    var out = [];
    HEX[h].v.forEach(function (v) { var o = G.vOwner[v]; if (o && o.p !== p && out.indexOf(o.p) < 0 && total(G.players[o.p].res) > 0) out.push(o.p); });
    return out;
  }
  function steal(G, p, v) {
    var Q = G.players[v], bag = []; RES.forEach(function (k) { for (var i = 0; i < Q.res[k]; i++) bag.push(k); });
    if (!bag.length) return null;
    var r = bag[Math.floor(rand(G) * bag.length)]; Q.res[r]--; G.players[p].res[r]++;
    note(G, '🦝 ' + G.players[p].name + 'が' + Q.name + 'から1枚もらった');
    return { from: v, r: r };
  }
  // 生産：森のくらが足りないめぐみは、もらう人が2人以上ならだれももらえない（1人ならある分だけ）
  function produce(G, s) {
    var want = {}; RES.forEach(function (k) { want[k] = {}; });
    G.hexes.forEach(function (hx, h) {
      if (hx.num !== s || h === G.robber || hx.res === 'desert') return;
      HEX[h].v.forEach(function (v) { var o = G.vOwner[v]; if (o) want[hx.res][o.p] = (want[hx.res][o.p] || 0) + (o.city ? 2 : 1); });
    });
    var got = {};
    RES.forEach(function (k) {
      var ps = Object.keys(want[k]), need = 0; ps.forEach(function (q) { need += want[k][q]; });
      if (!ps.length) return;
      if (need > G.bank[k]) {
        if (ps.length > 1) { note(G, '🏚️ 森のくらの' + RES_INFO[k].n + 'が足りず、だれももらえない'); return; }
        want[k][ps[0]] = G.bank[k];
      }
      ps.forEach(function (q) { var n = want[k][q]; if (!n) return; G.players[q].res[k] += n; G.bank[k] -= n; (got[q] = got[q] || zero())[k] += n; });
    });
    Object.keys(got).forEach(function (q) { note(G, '　' + G.players[q].name + '：' + resTxt(got[q])); });
    return got;
  }
  function resTxt(h) { return RES.filter(function (k) { return h[k]; }).map(function (k) { return RES_INFO[k].e + '×' + h[k]; }).join(' '); }

  // =====================================================================
  //  ふーさん🐻（NPC）
  // =====================================================================
  function vScore(G, p, v, bonusRes) {
    var s = 0, kinds = {};
    VERT[v].h.forEach(function (h) { var hx = G.hexes[h]; if (hx.res === 'desert') return; var pip = PIPS[hx.num] || 0; if (h === G.robber) pip *= 0.4; s += pip; kinds[hx.res] = 1; if (bonusRes && !bonusRes[hx.res]) s += 1.2; });
    s += Object.keys(kinds).length * 0.8;
    if (G.portAt[v]) s += G.portAt[v] === 'any' ? 0.6 : (kinds[G.portAt[v]] ? 1.2 : 0.3);
    return s + rand(G) * 0.3;
  }
  function produced(G, p) {
    var k = {}; G.players[p].setts.concat(G.players[p].cities).forEach(function (v) { VERT[v].h.forEach(function (h) { var hx = G.hexes[h]; if (hx.res !== 'desert') k[hx.res] = (k[hx.res] || 0) + (PIPS[hx.num] || 0); }); });
    return k;
  }
  function missing(res, cost) { var m = {}, n = 0; for (var k in cost) { var d = cost[k] - (res[k] || 0); if (d > 0) { m[k] = d; n += d; } } m._n = n; return m; }
  function npcGoal(G, p) {
    var P = G.players[p], opts = [];
    if (P.cities.length < LIMIT.city && P.setts.length) opts.push(['city', 0]);
    var spots = validVerts(G, p, false).length;
    if (P.setts.length < LIMIT.sett && spots) opts.push(['sett', 0.2]);
    if (G.deck.length) opts.push(['dev', 1.2]);
    if (P.roads.length < LIMIT.road && (!spots || P.roads.length < 4)) opts.push(['road', spots ? 2 : -0.5]);
    var best = null, bs = 1e9;
    opts.forEach(function (o) { var s = missing(P.res, COST[o[0]])._n + o[1]; if (s < bs) { bs = s; best = o[0]; } });
    return best || 'dev';
  }
  function npcWeights(G, p) {
    var P = G.players[p], goal = npcGoal(G, p), m = missing(P.res, COST[goal]), pr = produced(G, p), w = {};
    RES.forEach(function (k) { w[k] = 1 + (m[k] ? 2 : 0) + ((pr[k] || 0) < 3 ? 0.6 : 0) - Math.max(0, P.res[k] - 3) * 0.3; });
    return w;
  }
  // ふーさんが交換を受けるか（proposer が give を出して get をほしがる）
  function npcAccept(G, p, proposer, give, get) {
    if (!has(G.players[p].res, get)) return false;
    if (publicVp(G, proposer) >= WIN - 2) return false;                          // もうすぐ勝ちそうな人には協力しない
    var w = npcWeights(G, p), gain = 0, loss = 0;
    RES.forEach(function (k) { gain += (give[k] || 0) * w[k]; loss += (get[k] || 0) * w[k]; });
    return gain > loss + 0.4;
  }
  function bestBy(list, f) { var b = null, bs = -1e9; list.forEach(function (x) { var s = f(x); if (s > bs) { bs = s; b = x; } }); return b; }
  function roadValue(G, p, e) {
    var E = EDGE[e], far = G.vOwner[E.a] && G.vOwner[E.a].p === p ? E.b : E.a, s = 0;
    if (canSettle(G, p, far, true)) s = vScore(G, p, far) + 2;
    VERT[far].adj.forEach(function (u) { if (canSettle(G, p, u, true)) s = Math.max(s, vScore(G, p, u) * 0.8); });
    return s + rand(G) * 0.2;
  }
  // 次にする1手を返す（null＝ターン終了）
  function npcAction(G, p) {
    var P = G.players[p], ph = G.phase, i;
    if (ph === 'discard' && G.discardNeed[p]) {
      var w = npcWeights(G, p), c = zero(), n = G.discardNeed[p], h = JSON.parse(JSON.stringify(P.res));
      while (n > 0) { var k = bestBy(RES.filter(function (k) { return h[k] > 0; }), function (k) { return h[k] / w[k]; }); h[k]--; c[k]++; n--; }
      return { p: p, type: 'discard', cards: c };
    }
    if (p !== G.turn) return null;
    if (ph === 'setup') {
      if (G.setupNeed === 'sett') { var pr = produced(G, p); return { p: p, type: 'settle', v: bestBy(validVerts(G, p, true), function (v) { return vScore(G, p, v, P.setts.length ? pr : null); }) }; }
      return { p: p, type: 'road', e: bestBy(validEdges(G, p), function (e) { return roadValue(G, p, e); }) };
    }
    var robberOnMe = HEX[G.robber].v.some(function (v) { return G.vOwner[v] && G.vOwner[v].p === p; });
    var canKnight = !G.devPlayed && playableDev(G, p, 'knight');
    if (ph === 'roll') { if (canKnight && (robberOnMe || (P.knights >= 2 && G.army !== p))) return { p: p, type: 'playDev', t: 'knight' }; return { p: p, type: 'roll' }; }
    if (ph === 'robber') return { p: p, type: 'robber', h: npcRobberHex(G, p) };
    if (ph === 'steal') { var vs = victims(G, p, G.robber); return { p: p, type: 'steal', v: bestBy(vs, function (q) { return publicVp(G, q) * 10 + total(G.players[q].res); }) }; }
    if (ph === 'roads') { var re = validEdges(G, p); return re.length && P.roads.length < LIMIT.road ? { p: p, type: 'build', what: 'road', e: bestBy(re, function (e) { return roadValue(G, p, e); }) } : { p: p, type: 'endRoads' }; }
    if (ph !== 'main') return null;
    // 1) 建てる
    if (has(P.res, COST.city) && P.cities.length < LIMIT.city && P.setts.length) return { p: p, type: 'build', what: 'city', v: bestBy(P.setts, function (v) { return vScore(G, p, v); }) };
    var spots = validVerts(G, p, false);
    if (has(P.res, COST.sett) && P.setts.length < LIMIT.sett && spots.length) return { p: p, type: 'build', what: 'sett', v: bestBy(spots, function (v) { return vScore(G, p, v); }) };
    // 2) ふしぎカードを使う
    if (!G.devPlayed) {
      if (canKnight && (robberOnMe || (P.knights >= 2 && G.army !== p))) return { p: p, type: 'playDev', t: 'knight' };
      var goal = npcGoal(G, p), m = missing(P.res, COST[goal]);
      if (playableDev(G, p, 'road') && P.roads.length <= LIMIT.road - 2 && validEdges(G, p).length && !spots.length) return { p: p, type: 'playDev', t: 'road' };
      if (playableDev(G, p, 'plenty')) { var want = []; RES.forEach(function (k) { for (i = 0; i < (m[k] || 0); i++) want.push(k); }); if (want.length >= 1) { var a1 = want[0], b1 = want[1] || want[0]; var nd = {}; nd[a1] = 1; nd[b1] = (nd[b1] || 0) + 1; if (has(G.bank, nd)) return { p: p, type: 'playDev', t: 'plenty', a: a1, b: b1 }; } }
      if (playableDev(G, p, 'mono') && m._n >= 2) { var mk = bestBy(RES.filter(function (k) { return m[k]; }), function (k) { return m[k]; }); return { p: p, type: 'playDev', t: 'mono', r: mk }; }
    }
    // 3) こみち（家を建てる場所がないとき・カードが多いとき）
    var edges = P.roads.length < LIMIT.road && has(P.res, COST.road) ? validEdges(G, p) : [];
    if (edges.length && (!spots.length || total(P.res) >= 8)) return { p: p, type: 'build', what: 'road', e: bestBy(edges, function (e) { return roadValue(G, p, e); }) };
    // 4) カード
    var g2 = npcGoal(G, p);
    if (has(P.res, COST.dev) && G.deck.length && (g2 === 'dev' || total(P.res) >= 8)) return { p: p, type: 'buyDev' };
    // 5) 森のくら・港で交換（目標に足りないものを、あまっているもので）
    var mm = missing(P.res, COST[g2]);
    if (mm._n > 0) {
      var rates = portRates(G, p), cost = COST[g2];
      var give = bestBy(RES.filter(function (k) { return P.res[k] - (cost[k] || 0) >= rates[k]; }), function (k) { return P.res[k] - (cost[k] || 0) - rates[k]; });
      var get = RES.filter(function (k) { return mm[k] && G.bank[k] > 0; })[0];
      if (give && get) return { p: p, type: 'bank', give: give, get: get };
    }
    return null;
  }
  function npcRobberHex(G, p) {
    var lead = -1, lv = -1;
    G.players.forEach(function (q, i) { if (i !== p && publicVp(G, i) > lv) { lv = publicVp(G, i); lead = i; } });
    return bestBy(HEX.map(function (_, h) { return h; }).filter(function (h) { return h !== G.robber; }), function (h) {
      var s = 0, pip = PIPS[G.hexes[h].num] || 0;
      HEX[h].v.forEach(function (v) { var o = G.vOwner[v]; if (!o) return; var m = o.city ? 2 : 1; if (o.p === p) s -= 8 * m; else s += pip * m * (o.p === lead ? 1.6 : 1) + (total(G.players[o.p].res) ? 1 : 0); });
      return s + rand(G) * 0.1;
    });
  }

  var api = {
    RES: RES, RES_INFO: RES_INFO, COST: COST, LIMIT: LIMIT, DEV_INFO: DEV_INFO, PIPS: PIPS, WIN: WIN, TILES: TILES, TOKENS: TOKENS,
    HEX: HEX, VERT: VERT, EDGE: EDGE, COAST: COAST,
    createGame: createGame, act: act, vp: vp, publicVp: publicVp, canSettle: canSettle, canRoad: canRoad, validVerts: validVerts, validEdges: validEdges,
    portRates: portRates, roadLength: roadLength, updateLongest: updateLongest, victims: victims, total: total, has: has, zero: zero, resTxt: resTxt,
    playableDev: playableDev, npcAction: npcAction, npcAccept: npcAccept, npcGoal: npcGoal, npcWeights: npcWeights, missing: missing
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.Mori = api;
})(this);
