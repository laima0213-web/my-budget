/* ============================================================
   core.js — 가계부 계산 엔진 (화면과 무관한 순수 계산)
   ------------------------------------------------------------
   · 엑셀 「월간요약·연간추이·자산추이」의 수식과 같은 규칙을 씁니다.
   · 규칙
       구분 = 지출 / 수입 / 이체 / 카드할인 / 할부
       실질 지출 = 지출 + 할부 + 카드할인      (카드할인은 음수로 넣어 차감)
       수지     = 수입 − 실질 지출
       저축률   = 수지 ÷ 수입                  (수입이 0이면 계산 안 함)
       이체     = 내 계좌끼리 옮긴 돈 → 합계에서 제외
   · 이 파일은 브라우저(app.js)와 검산 스크립트가 함께 씁니다.
   ============================================================ */
var Core = (function () {
  'use strict';

  var OUTGOING = { '지출': 1, '할부': 1 };   // 실제로 나간 돈
  var KINDS = ['지출', '수입', '이체', '카드할인', '할부'];

  /* ---------- 날짜 ---------- */
  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function ymOf(dateStr) { return String(dateStr || '').slice(0, 7); }
  function todayStr(d) {
    d = d || new Date();
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  }
  function addMonths(ym, n) {
    var y = parseInt(ym.slice(0, 4), 10), m = parseInt(ym.slice(5, 7), 10) - 1 + n;
    var d = new Date(y, m, 1);
    return d.getFullYear() + '-' + pad(d.getMonth() + 1);
  }
  function monthLabel(ym) { return parseInt(ym.slice(5, 7), 10) + '월'; }
  function dayLabel(dateStr) {
    var w = ['일', '월', '화', '수', '목', '금', '토'][new Date(dateStr + 'T00:00:00').getDay()];
    return parseInt(dateStr.slice(5, 7), 10) + '/' + parseInt(dateStr.slice(8, 10), 10) + ' (' + w + ')';
  }
  function daysInMonth(ym) {
    return new Date(parseInt(ym.slice(0, 4), 10), parseInt(ym.slice(5, 7), 10), 0).getDate();
  }

  /* ---------- 숫자 ---------- */
  function num(v) { v = Number(v); return isFinite(v) ? v : 0; }
  function money(v) { return String(Math.round(num(v))).replace(/\B(?=(\d{3})+(?!\d))/g, ','); }
  function signed(v) {
    var n = Math.round(num(v));
    return (n > 0 ? '+' : n < 0 ? '−' : '') + String(Math.abs(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  }
  function won(v) { return money(v) + '원'; }
  function signedWon(v) { return signed(v) + '원'; }
  function pct(v, digits) {
    if (v === null || v === undefined || !isFinite(v)) return '—';
    return (v * 100).toFixed(digits === undefined ? 0 : digits) + '%';
  }
  function absSum(list, f) { var s = 0; for (var i = 0; i < list.length; i++) s += num(f ? f(list[i]) : list[i]); return s; }

  /* ---------- 목록 ---------- */
  function txOf(S, ym) {
    var out = [];
    var list = (S && S.tx) || [];
    for (var i = 0; i < list.length; i++) if (ymOf(list[i].date) === ym) out.push(list[i]);
    return out;
  }

  /* ---------- 한 달 요약 ---------- */
  function stats(S, ym) {
    var list = txOf(S, ym), r = {
      ym: ym, income: 0, expense: 0, installment: 0, discount: 0, transfer: 0,
      real: 0, balance: 0, saveRate: null, count: list.length,
      byKind: { '지출': 0, '수입': 0, '이체': 0, '카드할인': 0, '할부': 0 }
    };
    for (var i = 0; i < list.length; i++) {
      var t = list[i], a = num(t.amount);
      if (r.byKind[t.kind] === undefined) r.byKind[t.kind] = 0;
      r.byKind[t.kind] += a;
      if (t.kind === '수입') r.income += a;
      else if (t.kind === '지출') r.expense += a;
      else if (t.kind === '할부') r.installment += a;
      else if (t.kind === '카드할인') r.discount += a;
      else if (t.kind === '이체') r.transfer += a;
    }
    r.real = r.expense + r.installment + r.discount;         // 지출 + 할부 + 카드할인
    r.balance = r.income - r.real;                            // 수지
    r.saveRate = r.income ? r.balance / r.income : null;      // 저축률
    return r;
  }

  /* ---------- 지출 분류별 (이번 달 · 전월 · 예산) ---------- */
  function catSummary(S, ym, opts) {
    opts = opts || {};
    var cats = (S.settings.expCats || []).slice();
    var names = {}, rows = [], i;
    for (i = 0; i < cats.length; i++) { names[cats[i].name] = 1; rows.push({ name: cats[i].name, budget: num(cats[i].budget) }); }
    var cur = txOf(S, ym), prev = txOf(S, addMonths(ym, -1));
    var extra = {};
    function addTo(list, field) {
      for (var k = 0; k < list.length; k++) {
        var t = list[k];
        if (!OUTGOING[t.kind]) continue;
        var nm = t.cat || '(분류 없음)';
        if (!names[nm]) { extra[nm] = 1; continue; }
        for (var j = 0; j < rows.length; j++) if (rows[j].name === nm) { rows[j][field] += num(t.amount); break; }
      }
    }
    for (i = 0; i < rows.length; i++) { rows[i].now = 0; rows[i].prev = 0; }
    addTo(cur, 'now'); addTo(prev, 'prev');
    var extraNames = Object.keys(extra);
    for (i = 0; i < extraNames.length; i++) rows.push({ name: extraNames[i], budget: 0, now: 0, prev: 0, unknown: true });
    if (extraNames.length) {
      // 설정에 없는 분류의 금액도 빠지지 않게 다시 담는다
      var fill = function (list, field) {
        for (var k = 0; k < list.length; k++) {
          var t = list[k]; if (!OUTGOING[t.kind]) continue;
          var nm = t.cat || '(분류 없음)';
          if (names[nm]) continue;
          for (var j = 0; j < rows.length; j++) if (rows[j].name === nm) { rows[j][field] += num(t.amount); break; }
        }
      };
      for (i = 0; i < rows.length; i++) { rows[i].now = 0; rows[i].prev = 0; }
      addTo(cur, 'now'); addTo(prev, 'prev'); fill(cur, 'now'); fill(prev, 'prev');
    }
    for (i = 0; i < rows.length; i++) {
      var r = rows[i];
      r.diff = r.now - r.prev;
      r.diffRate = r.prev ? r.diff / Math.abs(r.prev) : null;
      r.useRate = r.budget ? r.now / r.budget : null;
    }
    rows = rows.filter(function (r) { return opts.all || r.now || r.prev || r.budget; });
    rows.sort(function (a, b) { return b.now - a.now || b.prev - a.prev; });
    return rows;
  }

  /* ---------- 결제수단별 (사용액 · 카드할인 · 실제 청구액) ---------- */
  function methodSummary(S, ym) {
    var list = (S.settings.methods || []).slice(), rows = [], i;
    for (i = 0; i < list.length; i++) rows.push({ name: list[i], used: 0, discount: 0, billed: 0 });
    var cur = txOf(S, ym);
    var seen = {};
    for (i = 0; i < cur.length; i++) {
      var t = cur[i];
      if (!(OUTGOING[t.kind] || t.kind === '카드할인')) continue;
      var nm = t.method || '(결제수단 없음)';
      var row = null;
      for (var j = 0; j < rows.length; j++) if (rows[j].name === nm) { row = rows[j]; break; }
      if (!row) { row = { name: nm, used: 0, discount: 0, billed: 0, unknown: true }; rows.push(row); }
      if (OUTGOING[t.kind]) row.used += num(t.amount); else row.discount += num(t.amount);
    }
    var total = { name: '합계', used: 0, discount: 0, billed: 0 };
    for (i = 0; i < rows.length; i++) { rows[i].billed = rows[i].used + rows[i].discount; total.used += rows[i].used; total.discount += rows[i].discount; total.billed += rows[i].billed; }
    return { rows: rows, total: total };
  }

  /* ---------- 최근 6개월 추이 ---------- */
  function trend(S, ym, n) {
    n = n || 6;
    var out = [];
    for (var i = n - 1; i >= 0; i--) {
      var m = addMonths(ym, -i), st = stats(S, m);
      out.push({ ym: m, label: monthLabel(m), income: st.income, real: st.real, balance: st.balance });
    }
    return out;
  }

  /* ---------- 연간 ---------- */
  function yearTable(S, year) {
    var rows = [], tot = { income: 0, expense: 0, installment: 0, discount: 0, real: 0, balance: 0, transfer: 0 };
    for (var m = 1; m <= 12; m++) {
      var ym = year + '-' + pad(m), st = stats(S, ym);
      rows.push({ ym: ym, month: m, label: m + '월', income: st.income, real: st.real, balance: st.balance,
        saveRate: st.saveRate, real0: st.expense + st.installment, discount: st.discount, transfer: st.transfer, count: st.count });
      tot.income += st.income; tot.real += st.real; tot.balance += st.balance;
      tot.expense += st.expense; tot.installment += st.installment; tot.discount += st.discount; tot.transfer += st.transfer;
    }
    tot.saveRate = tot.income ? tot.balance / tot.income : null;
    var active = rows.filter(function (r) { return r.count > 0; });
    tot.months = active.length;
    tot.avgIncome = active.length ? tot.income / active.length : 0;
    tot.avgReal = active.length ? tot.real / active.length : 0;
    return { year: year, rows: rows, total: tot };
  }

  function yearCatTotals(S, year) {
    var map = {}, cats = (S.settings.expCats || []).slice(), i;
    for (i = 0; i < cats.length; i++) map[cats[i].name] = 0;
    var list = (S.tx || []);
    for (i = 0; i < list.length; i++) {
      var t = list[i];
      if (!OUTGOING[t.kind] || String(t.date).slice(0, 4) !== String(year)) continue;
      var nm = t.cat || '(분류 없음)';
      map[nm] = (map[nm] || 0) + num(t.amount);
    }
    var rows = [];
    for (var k in map) if (map[k]) rows.push({ name: k, total: map[k] });
    rows.sort(function (a, b) { return b.total - a.total; });
    return rows;
  }

  function yearsInData(S) {
    var set = {}, list = (S.tx || []);
    for (var i = 0; i < list.length; i++) set[String(list[i].date).slice(0, 4)] = 1;
    var ys = Object.keys(set).map(Number).sort();
    if (!ys.length) ys.push(new Date().getFullYear());
    return ys;
  }

  /* ---------- 자산 ---------- */
  function assetMonths(S) {
    return Object.keys((S && S.assets) || {}).filter(function (k) { return /^\d{4}-\d{2}$/.test(k); }).sort();
  }
  function assetRow(S, ym) {
    var cols = (S.settings.assetCols || []);
    var a = (S.assets || {})[ym];
    if (!a) return null;
    var v = (a.v || []), total = 0, parts = [];
    for (var i = 0; i < cols.length; i++) { var x = num(v[i]); total += x; parts.push({ name: cols[i], value: x }); }
    var debt = num(a.debt), net = total - debt;
    var prevYm = addMonths(ym, -1), prev = (S.assets || {})[prevYm];
    var prevNet = null;
    if (prev) {
      var pv = 0, pc = (prev.v || []);
      for (var j = 0; j < cols.length; j++) pv += num(pc[j]);
      prevNet = pv - num(prev.debt);
    }
    var delta = prevNet === null ? null : net - prevNet;
    return {
      ym: ym, parts: parts, total: total, debt: debt, net: net,
      prevNet: prevNet, delta: delta, deltaRate: (prevNet ? delta / Math.abs(prevNet) : null),
      monthBalance: stats(S, ym).balance, ex: !!a.ex
    };
  }
  function assetSeries(S) {
    var ms = assetMonths(S), out = [];
    for (var i = 0; i < ms.length; i++) { var r = assetRow(S, ms[i]); if (r) out.push(r); }
    return out;
  }
  function latestNetWorth(S, ym) {
    // 그 달 또는 그 이전 달 중 가장 최근에 적어 둔 순자산 (엑셀의 INDEX/MATCH와 같은 취지)
    var ms = assetMonths(S), best = null;
    for (var i = 0; i < ms.length; i++) if (ms[i] <= ym) best = ms[i];
    if (!best) return null;
    var r = assetRow(S, best);
    return r ? { ym: best, net: r.net, delta: r.delta, exact: best === ym } : null;
  }

  /* ---------- 점검: 구분과 분류가 어긋난 줄 / 설정에 없는 결제수단 ---------- */
  function issues(S, ym) {
    var expNames = {}, incNames = {}, methods = {}, i;
    var ec = S.settings.expCats || [], ic = S.settings.incCats || [], mt = S.settings.methods || [];
    for (i = 0; i < ec.length; i++) expNames[ec[i].name] = 1;
    for (i = 0; i < ic.length; i++) incNames[ic[i]] = 1;
    for (i = 0; i < mt.length; i++) methods[mt[i]] = 1;
    var list = ym ? txOf(S, ym) : (S.tx || []), out = [];
    for (i = 0; i < list.length; i++) {
      var t = list[i], reasons = [];
      if ((t.kind === '지출' || t.kind === '할부') && t.cat && !expNames[t.cat]) reasons.push('분류 확인');
      if (t.kind === '수입' && t.cat && !incNames[t.cat]) reasons.push('분류 확인');
      if (!t.cat && (t.kind === '지출' || t.kind === '수입' || t.kind === '할부')) reasons.push('분류 없음');
      if (t.method && !methods[t.method]) reasons.push('결제수단 확인');
      if (reasons.length) out.push({ id: t.id, tx: t, reasons: reasons });
    }
    return out;
  }

  /* ---------- 고정비 → 이번 달 반영 대상 ---------- */
  function fixedPlan(S, ym) {
    var fixed = S.fixed || [], tx = txOf(S, ym), out = [];
    for (var i = 0; i < fixed.length; i++) {
      var f = fixed[i];
      var dup = null;
      for (var j = 0; j < tx.length; j++) {
        var t = tx[j];
        if (t.item && f.item && t.item === f.item && num(t.amount) === num(f.amount) && t.kind !== '이체') { dup = t; break; }
      }
      out.push({ f: f, dup: !!dup, dupTx: dup, ex: !!f.ex });
    }
    return out;
  }

  /* ---------- 표 내보내기용 ---------- */
  function monthRows(S, ym) {
    var list = txOf(S, ym).slice();
    list.sort(function (a, b) { return (a.date < b.date ? -1 : a.date > b.date ? 1 : 0) || (a.id > b.id ? 1 : -1); });
    return list;
  }

  return {
    KINDS: KINDS, OUTGOING: OUTGOING,
    ymOf: ymOf, todayStr: todayStr, addMonths: addMonths, monthLabel: monthLabel, dayLabel: dayLabel, daysInMonth: daysInMonth,
    money: money, signed: signed, won: won, signedWon: signedWon, pct: pct, num: num, absSum: absSum,
    txOf: txOf, stats: stats, catSummary: catSummary, methodSummary: methodSummary, trend: trend,
    yearTable: yearTable, yearCatTotals: yearCatTotals, yearsInData: yearsInData,
    assetMonths: assetMonths, assetRow: assetRow, assetSeries: assetSeries, latestNetWorth: latestNetWorth,
    issues: issues, fixedPlan: fixedPlan, monthRows: monthRows
  };
})();
if (typeof module !== 'undefined' && module.exports) module.exports = Core;
