/* ============================================================
   app.js — 우리집 가계부 (PWA)
   ------------------------------------------------------------
   · 이 파일은 **공개 저장소에 올라가는 코드**입니다.
     개인 거래내역·이메일·비밀번호·PIN 평문은 절대 넣지 않습니다.
   · 실제 데이터는 ① 이 기기(localStorage) ② seed-ledger.json(가져오기용, git 제외)
     ③ (다음 단계) Firebase 실시간 DB 에만 있습니다.
   ============================================================ */
(function () {
  'use strict';

  /* ============================================================
     0. 배포 설정 — 다음 단계에서 여기만 채우면 클라우드 동기화가 켜집니다.
        (비어 있으면 이 기기 저장 모드로 안전하게 동작)
        · firebaseConfig : Firebase 콘솔 > 프로젝트 설정 > 웹 앱
        · DB_ROOT        : 이 앱이 읽고 쓸 DB 경로 — ledgers/<내 계정 UID> 하위에서만 읽고 씁니다
                           (루트에는 쓰기 권한이 없어 반드시 이 경로의 ref 로 update 합니다)
        · ACCOUNT        : 가계부 전용 계정 아이디(이메일). **비밀번호는 코드에 절대 넣지 않습니다.**
                           처음 한 번만 화면에서 직접 입력하고, 이후에는 로그인이 기억됩니다.
        · PIN 잠금은 평문 대신 SHA-256 해시만 auth/pinHash · auth/salt 로 저장합니다.
     ============================================================ */
  var CLOUD = {
    firebaseConfig: {
      apiKey: "AIzaSyDKviQMHHcZiBCHKH_G8YqHWSEZj_NrE2o",
      authDomain: "family-dashboard-782e7.firebaseapp.com",
      databaseURL: "https://family-dashboard-782e7-default-rtdb.asia-southeast1.firebasedatabase.app",
      projectId: "family-dashboard-782e7",
      storageBucket: "family-dashboard-782e7.firebasestorage.app",
      messagingSenderId: "530235893435",
      appId: "1:530235893435:web:a5f2030bc6310f1933eb9e"
    },
    DB_ROOT: "ledgers/41CtUwOvUPZyYcflaxJq0PiCFUx2",
    ACCOUNT: "mybudget@family.local",
    SDK: {
      app: "https://www.gstatic.com/firebasejs/10.14.1/firebase-app-compat.js",
      auth: "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth-compat.js",
      db: "https://www.gstatic.com/firebasejs/10.14.1/firebase-database-compat.js"
    }
  };
  function cloudConfigured() {
    return !!(CLOUD.firebaseConfig.apiKey && CLOUD.firebaseConfig.databaseURL);
  }

  var APP = {
    version: 1,
    LS: "myBudget.v1",
    LS_PREFS: "myBudget.prefs.v1",
    BCAST: "my-budget-v1",
    SEED_URL: "seed-ledger.json",
    PIN_SCHEME: "my-budget|v1|",   // sha256(PIN_SCHEME + salt + '|' + pin)
    PIN_LEN: 4,
    PIN_MAX_FAIL: 5,
    PIN_COOL_MS: 15000
  };

  /* ============================================================
     1. 작은 도구들
     ============================================================ */
  function $(s, r) { return (r || document).querySelector(s); }
  function $$(s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }

  /* ---------- 아이콘 (이모지 대신 SVG — 어떤 기기에서도 똑같이 보임) ---------- */
  var SVG = {
    chart: '<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>',
    receipt: '<path d="M6 2h12v20l-3-2-3 2-3-2-3 2z"/><path d="M9 7h6M9 11h6M9 15h4"/>',
    trend: '<path d="M3 17l6-6 4 4 7-7"/><path d="M15 8h6v6"/>',
    repeat: '<path d="M3 11a8 8 0 0 1 13.7-5.7L20 8"/><path d="M20 3v5h-5"/><path d="M21 13a8 8 0 0 1-13.7 5.7L4 16"/><path d="M4 21v-5h5"/>',
    gear: '<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M19.1 4.9L17 7M7 17l-2.1 2.1"/>',
    cloud: '<path d="M7 18a4 4 0 0 1 0-8 5.5 5.5 0 0 1 10.6-1A3.5 3.5 0 0 1 18 18z"/>',
    food: '<path d="M7 3v7a2 2 0 0 0 4 0V3"/><path d="M9 10v11"/><path d="M17 3c-1.5 1.5-2 3-2 5s.5 3 2 3 2-1 2-3-.5-3.5-2-5z"/><path d="M17 11v10"/>',
    card: '<rect x="2.5" y="5" width="19" height="14" rx="3"/><path d="M2.5 10h19"/><path d="M6 15h4"/>',
    bank: '<path d="M3 10l9-6 9 6"/><path d="M5 10v9M9.5 10v9M14.5 10v9M19 10v9"/><path d="M3 21h18"/>',
    tag: '<path d="M3 12V4a1 1 0 0 1 1-1h8l9 9-9 9z"/><circle cx="7.5" cy="7.5" r="1.4"/>',
    target: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="4.5"/><circle cx="12" cy="12" r=".7"/>',
    lock: '<rect x="4.5" y="10" width="15" height="11" rx="2.5"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/><circle cx="12" cy="15.5" r="1.2"/>',
    download: '<path d="M12 3v12"/><path d="M7 11l5 5 5-5"/><path d="M4 20h16"/>',
    upload: '<path d="M12 21V9"/><path d="M7 13l5-5 5 5"/><path d="M4 4h16"/>',
    sparkle: '<path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z"/><path d="M18.5 16.5l.7 2 2 .7-2 .7-.7 2-.7-2-2-.7 2-.7z"/>',
    coin: '<circle cx="12" cy="12" r="8.5"/><path d="M9 9.5c0-1 1.3-1.8 3-1.8s3 .8 3 1.8-1.3 1.7-3 1.7-3 .8-3 1.8 1.3 1.8 3 1.8 3-.8 3-1.8"/><path d="M12 6v12"/>',
    wallet: '<rect x="3" y="6" width="18" height="13" rx="3"/><path d="M3 10h18"/><circle cx="17" cy="14.5" r="1.2"/>',
    swap: '<path d="M4 9h13l-3-3"/><path d="M20 15H7l3 3"/>',
    pie: '<path d="M12 3a9 9 0 1 0 9 9h-9z"/><path d="M12 8V3a9 9 0 0 1 9 9h-5"/>'
  };
  function ic(name, size, cls) {
    return '<svg class="ico ' + (cls || '') + '" viewBox="0 0 24 24" width="' + (size || 16) + '" height="' + (size || 16) +
      '" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
      (SVG[name] || '') + '</svg>';
  }
  var toastTimer = null;
  function toast(msg) {
    var t = $('#toast'); t.textContent = msg; t.classList.add('on');
    clearTimeout(toastTimer); toastTimer = setTimeout(function () { t.classList.remove('on'); }, 2200);
  }
  function haptic(ms) { try { if (navigator.vibrate) navigator.vibrate(ms || 8); } catch (e) {} }

  /* ---------- SHA-256 (crypto.subtle 없을 때 폴백) ---------- */
  function sha256Sync(ascii) {
    function rightRotate(v, a) { return (v >>> a) | (v << (32 - a)); }
    var mathPow = Math.pow, maxWord = mathPow(2, 32), result = '', words = [], asciiBitLength = ascii.length * 8;
    var hash = sha256Sync.h = sha256Sync.h || [];
    var k = sha256Sync.k = sha256Sync.k || [];
    var primeCounter = k.length, isComposite = {};
    for (var candidate = 2; primeCounter < 64; candidate++) {
      if (!isComposite[candidate]) {
        for (var i = 0; i < 313; i += candidate) isComposite[i] = candidate;
        hash[primeCounter] = (mathPow(candidate, 0.5) * maxWord) | 0;
        k[primeCounter++] = (mathPow(candidate, 1 / 3) * maxWord) | 0;
      }
    }
    ascii += '\x80';
    while (ascii.length % 64 - 56) ascii += '\x00';
    for (i = 0; i < ascii.length; i++) {
      var j = ascii.charCodeAt(i);
      if (j >> 8) return '';
      words[i >> 2] |= j << ((3 - i) % 4) * 8;
    }
    words[words.length] = ((asciiBitLength / maxWord) | 0);
    words[words.length] = (asciiBitLength);
    for (j = 0; j < words.length;) {
      var w = words.slice(j, j += 16), oldHash = hash;
      hash = hash.slice(0, 8);
      for (i = 0; i < 64; i++) {
        var w15 = w[i - 15], w2 = w[i - 2];
        var a = hash[0], e = hash[4];
        var temp1 = hash[7] + (rightRotate(e, 6) ^ rightRotate(e, 11) ^ rightRotate(e, 25)) + ((e & hash[5]) ^ ((~e) & hash[6])) + k[i]
          + (w[i] = (i < 16) ? w[i] : (w[i - 16] + (rightRotate(w15, 7) ^ rightRotate(w15, 18) ^ (w15 >>> 3))
            + w[i - 7] + (rightRotate(w2, 17) ^ rightRotate(w2, 19) ^ (w2 >>> 10))) | 0);
        var temp2 = (rightRotate(a, 2) ^ rightRotate(a, 13) ^ rightRotate(a, 22)) + ((a & hash[1]) ^ (a & hash[2]) ^ (hash[1] & hash[2]));
        hash = [(temp1 + temp2) | 0].concat(hash);
        hash[4] = (hash[4] + temp1) | 0;
      }
      for (i = 0; i < 8; i++) hash[i] = (hash[i] + oldHash[i]) | 0;
    }
    for (i = 0; i < 8; i++) for (j = 3; j + 1; j--) {
      var b = (hash[i] >> (j * 8)) & 255;
      result += ((b < 16) ? '0' : '') + b.toString(16);
    }
    return result;
  }
  function sha256Hex(str) {
    try {
      if (window.crypto && window.crypto.subtle && window.crypto.subtle.digest && window.TextEncoder) {
        var buf = new TextEncoder().encode(str);
        return window.crypto.subtle.digest('SHA-256', buf).then(function (d) {
          var b = new Uint8Array(d), out = '';
          for (var i = 0; i < b.length; i++) out += ('0' + b[i].toString(16)).slice(-2);
          return out;
        });
      }
    } catch (e) { /* 폴백 */ }
    return Promise.resolve(sha256Sync(str));
  }
  function pinDigest(pin, salt) { return sha256Hex(APP.PIN_SCHEME + (salt || '') + '|' + String(pin)); }

  /* ============================================================
     2. 상태
     ============================================================ */
  var S = null;        // 데이터
  var ui = {
    tab: 'summary', ym: Core.ymOf(Core.todayStr()), year: new Date().getFullYear(),
    trendSeg: 'year', catAll: false, q: '', fKind: '', fCat: '', fMethod: '',
    listView: 'cal',   // 거래 탭 기본 화면: 'cal' 한달 달력 / 'list' 내역 목록
    selDate: '', selWeek: null,   // 달력에서 고른 날짜 · 주 (달을 바꾸면 풀림)
    openCats: {}, openMethods: {}, openDonut: {},   // 요약에서 펼쳐 둔 분류·결제수단·도넛 분류 (달을 바꾸면 접힘)
    cloudState: 'local', seedApplied: false, lockFail: 0, lockUntil: 0,
    skipPin: false,   // 방금 이메일+비밀번호로 직접 로그인했을 때는 PIN을 또 묻지 않아요
    pinPassed: false  // 이번에 앱을 연 뒤 PIN을 통과했는지
  };
  var memPrefs = {};

  function defaultCats() {
    return ['식비', '교통', '생활용품', '주거·공과금', '병원·약국', '문화·여가', '경조사', '기타'];
  }
  function emptyState() {
    return {
      v: 1,
      settings: {
        expCats: defaultCats().map(function (n) { return { name: n, budget: 0 }; }),
        incCats: ['급여', '부수입'],
        methods: ['현금', '체크카드', '신용카드'],
        targetRate: 0.3,
        monthBudget: 0,
        assetCols: ['입출금·현금', '예금·적금', '투자(주식·펀드)', '연금', '기타 자산'],
        assetStart: Core.ymOf(Core.todayStr())
      },
      /* updatedAt 을 0 으로 두는 이유:
         로그인 전(빈 화면) 상태가 '지금 시각'을 들고 있으면, 클라우드보다 최신이라고 판단해
         빈 가계부로 DB 를 덮어써 버립니다. 0 이면 절대 '내가 최신'이 되지 않아요. */
      tx: [], fixed: [], assets: {}, auth: null, updatedAt: 0
    };
  }
  /* Firebase 는 배열을 키 0·1·2… 인 객체로 돌려줄 때가 있어요(중간이 비면 특히).
     두 모양 모두 배열로 받아들입니다. */
  function arrOf(v) {
    if (!v) return [];
    if (Array.isArray(v)) return v;
    if (typeof v === 'object') return Object.keys(v).map(function (k) { return v[k]; }).filter(function (x) { return x != null; });
    return [];
  }
  function normalize(d) {
    var base = emptyState(), out = Object.assign(base, d || {});
    out.settings = Object.assign(base.settings, (d && d.settings) || {});
    out.settings.expCats = (out.settings.expCats || []).map(function (c) {
      return (typeof c === 'string') ? { name: c, budget: 0 } : { name: c.name, budget: Core.num(c.budget) };
    });
    out.settings.incCats = (out.settings.incCats || []).slice();
    out.settings.methods = (out.settings.methods || []).slice();
    out.settings.assetCols = (out.settings.assetCols || base.settings.assetCols).slice();
    out.tx = arrOf(out.tx).map(function (t) {
      return { id: t.id || uid(), date: t.date, kind: t.kind || '지출', cat: t.cat || '', item: t.item || '',
        amount: Core.num(t.amount), method: t.method || '', memo: t.memo || '' };
    });
    out.fixed = arrOf(out.fixed).map(function (f) {
      return { id: f.id || uid(), item: f.item || '', cat: f.cat || '', amount: Core.num(f.amount),
        method: f.method || '', day: f.day == null ? '' : String(f.day), memo: f.memo || '', ex: !!f.ex };
    });
    out.assets = out.assets || {};
    Object.keys(out.assets).forEach(function (k) {
      var a = out.assets[k] || {};
      out.assets[k] = { v: (a.v || []).map(Core.num), debt: Core.num(a.debt), ex: !!a.ex };
    });
    out.auth = out.auth || null;
    return out;
  }
  function fromSeed(seed) {
    return normalize({
      settings: {
        expCats: (seed.settings.expCats || []).map(function (c) { return { name: c.name, budget: Core.num(c.budget) }; }),
        incCats: seed.settings.incCats, methods: seed.settings.methods,
        targetRate: seed.settings.targetRate, monthBudget: seed.settings.monthBudget || 0,
        assetCols: seed.settings.assetCols, assetStart: seed.settings.assetStart
      },
      tx: (seed.tx || []).map(function (t) { return Object.assign({ id: uid() }, t); }),
      fixed: (seed.fixed || []).map(function (f) { return Object.assign({ id: uid() }, f); }),
      assets: seed.assets || {},
      auth: seed.auth ? { pinHash: seed.auth.pinHash, salt: seed.auth.salt, updatedAt: seed.auth.updatedAt || Date.now() } : null
    });
  }

  /* ---------- 저장 ---------- */
  var saveTimer = null;
  function save(opts) {
    opts = opts || {};
    S.updatedAt = Date.now();
    try { localStorage.setItem(APP.LS, JSON.stringify(S)); } catch (e) { /* 저장 못 하는 환경 */ }
    try { if (window.BroadcastChannel) { var ch = new BroadcastChannel(APP.BCAST); ch.postMessage({ t: 'patch' }); ch.close(); } } catch (e) {}
    if (Cloud.ready) Cloud.queuePush();
    if (opts.render !== false) render();
  }
  function saveLocal() {
    try { localStorage.setItem(APP.LS, JSON.stringify(S)); } catch (e) { /* 저장 못 하는 환경 */ }
    try { if (window.BroadcastChannel) { var ch = new BroadcastChannel(APP.BCAST); ch.postMessage({ t: 'patch' }); ch.close(); } } catch (e) {}
  }
  function loadLocal() {
    try {
      var raw = localStorage.getItem(APP.LS);
      if (!raw) return null;
      return normalize(JSON.parse(raw));
    } catch (e) { return null; }
  }
  function fetchSeed() {
    if (window.__SEED__) return Promise.resolve(window.__SEED__);
    return fetch(APP.SEED_URL, { cache: 'no-store' }).then(function (r) {
      if (!r.ok) throw new Error('no-seed');
      return r.json();
    }).catch(function () { return null; });
  }

  /* ============================================================
     3. 클라우드(Firebase RTDB) — 설정을 채우면 켜집니다
     ============================================================ */
  var Cloud = {
    ready: false, ref: null, pushTimer: null, pending: false,
    loadScript: function (src) {
      return new Promise(function (res, rej) {
        if (document.querySelector('script[src="' + src + '"]')) return res();
        var s = document.createElement('script'); s.src = src; s.async = true;
        s.onload = function () { res(); }; s.onerror = function () { rej(new Error('sdk')); };
        document.head.appendChild(s);
      });
    },
    init: function () {
      var self = this;
      if (!cloudConfigured()) return Promise.resolve(false);
      if (self.initing) return self.initing;
      self.initing = self.loadScript(CLOUD.SDK.app).then(function () { return self.loadScript(CLOUD.SDK.auth); })
        .then(function () {
          /* 같은 주소(github.io)의 가족 대시보드도 이 Firebase 프로젝트를 씁니다.
             기본 앱을 함께 쓰면 두 앱이 같은 로그인 자리를 덮어써서,
             대시보드에 로그인된 기기에서는 가계부가 '남의 계정으로 로그인됨'이 되어 버립니다.
             그래서 가계부는 이름이 다른(budget) 앱을 따로 만들어 로그인 자리를 분리합니다. */
          var bapp = null;
          (firebase.apps || []).forEach(function (a) { if (a.name === 'budget') bapp = a; });
          if (!bapp) bapp = firebase.initializeApp(CLOUD.firebaseConfig, 'budget');
          var auth = bapp.auth();
          return auth.setPersistence(firebase.auth.Auth.Persistence.LOCAL).catch(function () {});
        })
        .then(function () { return self.loadScript(CLOUD.SDK.db); })
        .then(function () { return self.connectIfSignedIn(); })
        .catch(function () {
          ui.cloudState = 'error';
          hideSplash();
          showGate('서버에 연결하지 못했어요 · 잠시 뒤 다시 시도해 주세요');
          return false;
        });
      return self.initing;
    },
    /* 로그인 자리(Firebase auth)는 앱을 여는 동안 한 번만 지켜봅니다.
       로그인·로그아웃이 일어나면 onUser 가 이어받아 데이터를 불러옵니다. */
    connectIfSignedIn: function () {
      var self = this;
      if (!cloudConfigured()) return Promise.resolve(false);
      if (!self.watching) {
        self.watching = true;
        self.first = new Promise(function (res) { self.firstRes = res; });
        firebase.app('budget').auth().onAuthStateChanged(function (u) { self.onUser(u); });
      }
      return self.first;
    },
    onUser: function (u) {
      var self = this;
      var done = function (ok) {
        if (self.firstRes) { var r = self.firstRes; self.firstRes = null; r(ok); }
      };
      /* ① 로그인 안 된 상태 — 빈 0원 화면을 보여 주는 대신 로그인 화면을 자동으로 띄웁니다 */
      if (!u) {
        self.detach();
        ui.cloudState = 'signed-out';
        hideSplash();
        if (cloudConfigured()) showGate('');
        done(false);
        return;
      }
      if (self.uid === u.uid && self.ref) { hideGate(); hideSplash(); done(true); return; }
      self.uid = u.uid;
      var db = firebase.app('budget').database();
      self.ref = db.ref(CLOUD.DB_ROOT);
      self.ready = true; ui.cloudState = 'live';
      try {
        db.ref('.info/connected').on('value', function (s) { ui.cloudState = (s && s.val()) ? 'live' : 'offline'; });
      } catch (e) {}
      /* ② 처음 한 번: DB 와 이 기기 중 무엇이 최신인지 견줘 정한다.
         (빈 기기에서 실수로 DB 를 지우지 않도록, 이 기기에 기록이 없거나 updatedAt 이 0이면 DB 를 따른다) */
      self.ref.once('value').then(function (snap) {
        var root = snap.val();
        var localTx = (S && S.tx) ? S.tx.length : 0;
        var localAt = Core.num(S && S.updatedAt);
        if (!root) { self.pushAll(); }
        else if (!localTx || !localAt) { self.applyRemote(root); }
        else if (!Core.num(root.updatedAt) || localAt > Core.num(root.updatedAt)) { self.pushAll(); }
        else { self.applyRemote(root); }
        hideGate();
        hideSplash();
        render();
        if (!self.pinChecked) {
          self.pinChecked = true;
          if (!ui.skipPin && S.auth && S.auth.pinHash && !ui.pinPassed && !$('#lock').classList.contains('on')) showLock();
          ui.skipPin = false;
        }
        if (!self.valueBound) {
          self.valueBound = true;
          self.ref.on('value', function (sn2) {
            var r2 = sn2.val();
            if (!r2) return;
            /* 원격이 이 기기보다 오래됐거나 같을 때만 무시하고,
               더 새로운 원격(다른 기기에서 방금 넣은 지출)은 바로 받아옵니다 */
            if (r2.updatedAt && S && Core.num(S.updatedAt) >= Core.num(r2.updatedAt)) return;
            self.applyRemote(r2); render();
          }, function () { ui.cloudState = 'offline'; });
        }
        done(true);
      }).catch(function () {
        ui.cloudState = 'offline';
        hideSplash();
        if (!(S && S.tx && S.tx.length)) showGate('불러오지 못했어요 · 잠시 뒤 다시 시도해 주세요');
        done(false);
      });
    },
    detach: function () {
      try { if (this.ref) this.ref.off(); } catch (e) {}
      this.ref = null; this.ready = false; this.uid = null;
      this.valueBound = false; this.pinChecked = false;
    },
    signIn: function (email, pw) {
      return new Promise(function (res, rej) {
        if (!cloudConfigured()) return rej(new Error('not-configured'));
        var bapp = null;
        try { bapp = firebase.app('budget'); } catch (e) { bapp = null; }
        if (!bapp) return rej(new Error('sdk-not-ready'));
        bapp.auth().signInWithEmailAndPassword(String(email).trim(), String(pw)).then(res, rej);
      });
    },
    /* 다른 기기(클라우드) 내용을 이 기기에 받아들일 때.
       이때 save() 를 쓰면 updatedAt 이 새로 매겨지고 다시 클라우드로 올라가,
       '올림 → 내려옴 → 또 올림' 이 끝없이 반복됩니다. 그래서 이 기기에만 적고 올리지 않습니다. */
    applyRemote: function (root) {
      S = normalize(root);
      if (root && root.updatedAt) S.updatedAt = root.updatedAt;
      saveLocal();
    },
    pushAll: function () {
      if (!this.ready) return;
      this.ref.update({ settings: S.settings, tx: S.tx, fixed: S.fixed, assets: S.assets, auth: S.auth, updatedAt: Date.now() })
        .catch(function () {});
    },
    queuePush: function () {
      var self = this;
      clearTimeout(self.pushTimer);
      self.pushTimer = setTimeout(function () { self.pushAll(); }, 700);
    }
  };

  /* ============================================================
     4. 부팅
     ============================================================ */
  var booted = false;
  function boot() {
    S = loadLocal();
    if (S) { afterBoot(false); return; }
    fetchSeed().then(function (seed) {
      if (seed && seed.tx && seed.tx.length) {
        S = fromSeed(seed);
        ui.seedApplied = true;
        if (seed.viewMonth) ui.ym = seed.viewMonth;
        var y = (seed.tx[0] && String(seed.tx[0].date).slice(0, 4)) || ui.year;
        ui.year = parseInt(y, 10) || ui.year;
        save({ render: false });
      } else {
        S = emptyState();
      }
      afterBoot(true);
    });
  }
  function afterBoot(fresh) {
    if (booted) return; booted = true;
    bindEvents();
    /* 이미 이 폰에서 로그인했던 기기면 PIN 부터 (데이터는 그 뒤에 채워집니다) */
    if (S.auth && S.auth.pinHash) showLock();
    render();
    if (fresh && S.tx.length) toast('엑셀 가계부 ' + S.tx.length + '건을 불러왔어요');
    if (!cloudConfigured()) { hideSplash(); return; }
    /* 로그인 세션이 없으면 빈 0원 화면 대신 로그인 화면이 뜹니다(onUser).
       세션이 있으면 데이터를 받는 동안 '가계부 불러오는 중…' 을 보여 줘 0원이 깜빡이지 않게 해요. */
    showSplash('가계부 불러오는 중…');
    Cloud.init();
    /* 네트워크가 막히면 로딩 화면에 갇히지 않도록 15초 뒤 풀어 줍니다 */
    setTimeout(function () {
      if (Cloud.ready) return;
      hideSplash();
      if (ui.cloudState !== 'live') showGate('연결이 늦어지고 있어요 · 다시 시도해 주세요');
    }, 15000);
  }

  /* ============================================================
     4-b. 첫 접속 로그인 화면(자동) · 불러오는 중 표시
     ============================================================ */
  var gateBusy = false;
  function setGateMsg(t) { var m = $('#gateMsg'); if (m) m.textContent = t || ''; }
  function showGate(msg) {
    if (!cloudConfigured()) return;
    var g = $('#gate'); if (!g) return;
    var em = $('#gateEmail');
    if (em && !em.value) em.value = CLOUD.ACCOUNT;
    setGateMsg(msg || '');
    g.hidden = false;
    setTimeout(function () { var p = $('#gatePw'); if (p && !p.value && !p.disabled) { try { p.focus(); } catch (e) {} } }, 260);
  }
  function hideGate() {
    var g = $('#gate'); if (g) g.hidden = true;
    var p = $('#gatePw'); if (p) p.value = '';
    setGateMsg('');
  }
  function gateBusySet(on) {
    gateBusy = !!on;
    var b = $('#gateBtn'), e = $('#gateEmail'), p = $('#gatePw');
    if (b) { b.disabled = gateBusy; b.textContent = gateBusy ? '가계부 불러오는 중…' : '로그인'; }
    if (e) e.disabled = gateBusy;
    if (p) p.disabled = gateBusy;
  }
  function gateErr(e) {
    var c = ((e && e.code) || '') + ' ' + ((e && e.message) || '');
    if (c.indexOf('wrong-password') >= 0 || c.indexOf('invalid-credential') >= 0 || c.indexOf('invalid-login') >= 0) return '비밀번호가 맞지 않아요';
    if (c.indexOf('user-not-found') >= 0) return '등록된 이메일이 아니에요';
    if (c.indexOf('too-many-requests') >= 0) return '조금 뒤에 다시 시도해 주세요';
    if (c.indexOf('network') >= 0) return '인터넷 연결을 확인해 주세요';
    if (c.indexOf('sdk-not-ready') >= 0 || c.indexOf('no-firebase') >= 0) return '서버에 연결하지 못했어요 · 잠시 뒤 다시 시도해 주세요';
    return '로그인하지 못했어요 · 다시 시도해 주세요';
  }
  function gateSubmit() {
    if (gateBusy || !cloudConfigured()) return;
    var emailEl = $('#gateEmail'), pwEl = $('#gatePw');
    var email = (emailEl && emailEl.value ? emailEl.value : '').trim() || CLOUD.ACCOUNT;
    var pw = pwEl ? pwEl.value : '';
    if (!pw || pw.length < 4) { setGateMsg('비밀번호를 넣어 주세요'); if (pwEl) pwEl.focus(); return; }
    gateBusySet(true); setGateMsg('');
    ui.skipPin = true;
    var ready = (window.firebase && Cloud.watching) ? Promise.resolve(true) : Cloud.init();
    ready.then(function () { return Cloud.signIn(email, pw); })
      .then(function () { gateBusySet(false); })
      .catch(function (e) {
        ui.skipPin = false;
        gateBusySet(false);
        hideSplash();
        setGateMsg(gateErr(e));
        try { if (pwEl) { pwEl.value = ''; pwEl.focus(); } } catch (err) {}
      });
  }
  function showSplash(msg) {
    var s = $('#splash'); if (!s) return;
    var p = s.querySelector('p'); if (p && msg) p.textContent = msg;
    s.hidden = false;
  }
  function hideSplash() { var s = $('#splash'); if (s) s.hidden = true; }

  /* ============================================================
     5. 화면 틀
     ============================================================ */
  function render() {
    $$('#nav .nav').forEach(function (b) { b.classList.toggle('on', b.getAttribute('data-v') === ui.tab); });
    var v = $('#view');
    if (ui.tab === 'summary') v.innerHTML = viewSummary();
    else if (ui.tab === 'list') v.innerHTML = viewList();
    else if (ui.tab === 'trend') v.innerHTML = viewTrend();
    else if (ui.tab === 'fixed') v.innerHTML = viewFixed();
    else if (ui.tab === 'settings') v.innerHTML = viewSettings();
    if (ui.tab === 'list') { var q = $('#q'); if (q) { q.value = ui.q; } }
    window.scrollTo(0, 0);
  }
  function monthBar(ym, opts) {
    opts = opts || {};
    return '<div class="monthbar">' +
      '<button class="nav" data-act="mon" data-v="-1" aria-label="이전 달">◀</button>' +
      '<div class="cur">' + esc(ym.slice(0, 4)) + '년 ' + esc(ym.slice(5, 7)) + '월</div>' +
      '<button class="nav" data-act="mon" data-v="1" aria-label="다음 달">▶</button>' +
      (opts.noToday ? '' : '<button class="today" data-act="today">이번 달</button>') +
      '</div>';
  }
  function kpi(cls, label, value, cap, extra) {
    return '<div class="kpi ' + (cls || '') + '"><div class="lb">' + label + '</div>' +
      '<div class="vl num">' + value + '</div>' +
      '<div class="cap num">' + (cap || '') + (extra || '') + '</div></div>';
  }

  /* ---------- 주별 지출 막대 그림 (요약 카드·달력 카드 공용) ----------
     막대 하나하나가 '그 주에 얼마 썼는지'를 그림으로 보여 줍니다. */
  function weekBars(cal, opts) {
    opts = opts || {};
    var scale = Math.max(1, cal.maxWeek) * 1.02, avg = cal.avgWeek, out = [];
    cal.weeks.forEach(function (w) {
      if (w.startDay === null) return;
      var pct = w.expense ? Math.max(4, w.expense / scale * 100) : 0;
      var top = w.expense > 0 && w.expense >= cal.maxWeek;
      var sel = !!opts.sel && ui.selWeek === w.idx;
      var inner = '<span class="wk">' + w.label + '</span>' +
        '<span class="wbar"><i class="' + (top ? 'top' : '') + '" style="width:' + pct.toFixed(1) + '%"></i>' +
        (opts.avg ? '<b class="avg" style="left:' + Math.min(98, avg / scale * 100).toFixed(1) + '%"></b>' : '') + '</span>' +
        '<span class="wamt num">' + (w.expense ? Core.money(w.expense) + '<small>원</small>' : '<span class="muted">—</span>') + '</span>';
      out.push('<button class="wrow' + (sel ? ' sel' : '') + (top ? ' top' : '') + '" data-act="' + (opts.act || 'calweek') + '" data-v="' + w.idx + '" aria-label="' + w.label + ' 지출 ' + Core.money(w.expense) + '원">' + inner + '</button>');
    });
    return out.join('');
  }

  /* ---------- 지출 비중 그림 (도넛 + 순위 목록) ----------
     지출이 있는 분류를 큰 순서로 하나도 묶지 않고 전부 도넛 조각으로 보여 줍니다.
     식비 3가지는 한 가지 색으로, 나머지 분류는 서로 겹치지 않는 차분한 색을 돌아가며 씁니다.
     도넛 띠 안에는 그 조각의 이름을 짧게 흰 글씨로 적어, 색만 보고도 어디에 썼는지 읽히게 합니다.
     글자는 놓기 전에 자리를 계산해(상자끼리 비교) 서로 겹치지 않게 하고,
     띠가 아주 얇아 글자가 들어갈 수 없는 조각은 도넛에 이름을 적지 않고 아래 목록에서 보여 줍니다. */
  var DONUT_FOOD = '#CE7B67';                 /* 식비 3가지 공통 색 */
  var DONUT_COLORS = ['#7FA98A', '#D6A94C', '#7E9FC0', '#C98F9E', '#9DAF6B', '#A99BC4',
    '#B58F6E', '#6FA3A0', '#D79C5E', '#8894B8', '#7DB198', '#A98BA8',
    '#86AEC1', '#A5AB70', '#6E8F7C', '#7C6E8F'];
  var DONUT_GEO = { cx: 150, cy: 150, R: 84, w: 62 };   /* viewBox 300 · 띠 두께 62 */
  var DONUT_INSIDE_DEG = 18;                  /* 5% 이상 — 띠 안 정가운데 이름 */
  var DONUT_MIN_DEG = 7.5;                    /* 1.5% 미만 — 도넛에 이름 없이 목록에서만 */
  var DONUT_FS = 10.5;                        /* 띠 안 이름 글자 크기 */
  var DONUT_OUT_FS = 10;                      /* 띠 밖 이름 글자 크기 */
  var DONUT_OUT_R = 137;                      /* 띠 밖 이름 중심 거리 */
  var DONUT_SHORT = {
    '식비(배달외식)': '배달외식', '식비(식재료)': '식재료', '식비(간식)': '간식',
    '교통,주유': '교통주유', '헤어뷰티.패션': '뷰티패션', '가구,가전': '가구가전',
    '경조사비,모임회비': '경조사', '문화생활.여행': '문화여행', '병원,약국': '병원약국',
    '관리비,통신비,정수기': '관리비', '대출이자.세금': '대출이자', '학원,교재비': '학원교재'
  };

  function donutParts(cats) {
    var list = [], total = 0, i;
    for (i = 0; i < cats.length; i++) {
      var now = Core.num(cats[i].now);
      if (now > 0) { list.push({ name: cats[i].name, now: now, unknown: !!cats[i].unknown }); total += now; }
    }
    list.sort(function (a, b) { return b.now - a.now || (a.name < b.name ? -1 : 1); });
    var ci = 0;
    for (i = 0; i < list.length; i++) {
      list[i].food = list[i].name.indexOf('식비') === 0;
      list[i].color = list[i].food ? DONUT_FOOD : DONUT_COLORS[ci++ % DONUT_COLORS.length];
    }
    return { parts: list, total: total, count: list.length };
  }

  /* 띠 안에 적을 짧은 이름 — 모르는 분류는 괄호 안(있으면)이나 앞 4자 */
  function donutShortName(name) {
    var s = String(name || '');
    if (DONUT_SHORT[s]) return DONUT_SHORT[s];
    var p = s.match(/^[^(]+\(([^)]+)\)$/);
    if (p) s = p[1];
    s = s.replace(/[,.·\/\s]/g, '');
    return s.length > 4 ? s.slice(0, 4) : s;
  }
  function donutHalfName(nm) { return nm.length > 2 ? nm.slice(0, 2) : nm; }

  /* 글자 폭 어림 (한글은 글자 크기만큼, 영문·숫자는 조금 좁게) */
  function textWidth(s, fs) {
    var w = 0;
    for (var i = 0; i < s.length; i++) {
      var ch = s.charAt(i), c = s.charCodeAt(i);
      if (c >= 0x1100) w += fs;
      else if (/[A-Za-z0-9]/.test(ch)) w += fs * 0.66;
      else if (ch === ' ') w += fs * 0.3;
      else w += fs * 0.45;
    }
    return w;
  }
  function boxHit(a, b) {
    return a.x1 < b.x2 && a.x2 > b.x1 && a.y1 < b.y2 && a.y2 > b.y1;
  }

  /* 도넛 조각 위의 한글 이름
     · 5% 이상 넓은 조각: 띠 안 정가운데에 흰 글씨 (넓은 조각부터 자리를 잡음)
     · 1.5~5% 좁은 조각: 띠 밖에 짧은 이름 + 연결선 (좌우·위아래로 밀어 겹침을 피함)
     · 1.5% 미만: 색 띠만 남기고 이름은 아래 목록에서
     놓기 전 상자끼리 비교해서 글자가 서로 겹치는 일이 없게 합니다. */
  function donutLabels(parts, total) {
    var G = DONUT_GEO, placed = [], out = [], acc = 0, i, j;
    function freeBox(b) {
      if (b.x1 < 2 || b.x2 > 298 || b.y1 < 2 || b.y2 > 298) return false;
      for (j = 0; j < placed.length; j++) if (boxHit(b, placed[j])) return false;
      return true;
    }
    for (i = 0; i < parts.length; i++) {
      var share = total ? parts[i].now / total : 0;
      var deg = share * 360, mid = acc + deg / 2;
      acc += deg;
      if (deg < DONUT_MIN_DEG) continue;
      var rad = mid * Math.PI / 180, sn = Math.sin(rad), cs = Math.cos(rad);
      var full = donutShortName(parts[i].name);
      var box = null, txt = '';

      if (deg >= DONUT_INSIDE_DEG) {                     /* 띠 안 */
        var x = G.cx + G.R * sn, y = G.cy - G.R * cs;
        var cand = full.length > 2 ? [full, donutHalfName(full)] : [full];
        for (var k = 0; k < cand.length && !box; k++) {
          var w = textWidth(cand[k], DONUT_FS);
          var b = { x1: x - w / 2 - 2, x2: x + w / 2 + 2,
            y1: y - DONUT_FS * 0.62 - 1, y2: y + DONUT_FS * 0.62 + 1, x: x, y: y };
          if (freeBox(b)) { box = b; txt = cand[k]; }
        }
        if (box) {
          placed.push(box);
          out.push('<text class="dlbl" x="' + box.x.toFixed(1) + '" y="' + box.y.toFixed(1) + '" text-anchor="middle" dy=".34em">' + esc(txt) + '</text>');
          continue;
        }
        /* 자리가 모자라면 아래 띠 밖 규칙으로 */
      }

      /* 띠 밖 — 짧은 이름 + 연결선 */
      txt = donutHalfName(full);
      var ow = textWidth(txt, DONUT_OUT_FS), oh = DONUT_OUT_FS * 0.62;
      var ox = G.cx + DONUT_OUT_R * sn, oy = G.cy - DONUT_OUT_R * cs;
      var moves = [[0, 0], [0, -13], [0, 13], [-10, -7], [10, -7], [0, -26], [0, 26], [-14, 8], [14, 8], [-16, -14], [16, -14]];
      for (var m = 0; m < moves.length && !box; m++) {
        var bx = ox + moves[m][0], by = oy + moves[m][1];
        var b2 = { x1: bx - ow / 2 - 1, x2: bx + ow / 2 + 1, y1: by - oh - 1, y2: by + oh + 1, x: bx, y: by };
        if (freeBox(b2)) { box = b2; }
      }
      if (!box) continue;
      placed.push(box);
      var r1 = G.R + G.w / 2 + 1, r2 = DONUT_OUT_R - oh - 6;
      out.push('<line class="dlead" stroke="' + parts[i].color + '" x1="' + (G.cx + r1 * sn).toFixed(1) + '" y1="' + (G.cy - r1 * cs).toFixed(1) +
        '" x2="' + (G.cx + r2 * sn).toFixed(1) + '" y2="' + (G.cy - r2 * cs).toFixed(1) + '"/>');
      out.push('<text class="dout" x="' + box.x.toFixed(1) + '" y="' + box.y.toFixed(1) + '" text-anchor="middle" dy=".34em">' + esc(txt) + '</text>');
    }
    return out.join('');
  }

  /* 비중 표기 — 0원은 —, 0.1% 미만은 <0.1% (10% 이상도 18.4% 처럼 한 자리) */
  function shareLabel(share) {
    var p = share * 100;
    if (!p) return '—';
    if (p < 0.1) return '&lt;0.1%';
    return p.toFixed(1) + '%';
  }

  function svgDonut(parts, total) {
    var G = DONUT_GEO, C = 2 * Math.PI * G.R, gap = parts.length > 1 ? 1.2 : 0, acc = 0, segs = '', i;
    for (i = 0; i < parts.length; i++) {
      var len = total ? parts[i].now / total * C : 0;
      var dash = Math.max(0, len - gap);
      segs += '<circle class="dseg" cx="' + G.cx + '" cy="' + G.cy + '" r="' + G.R + '" stroke="' + parts[i].color + '"' +
        ' stroke-dasharray="' + dash.toFixed(2) + ' ' + (C - dash).toFixed(2) + '"' +
        ' stroke-dashoffset="' + (-(acc + gap / 2)).toFixed(2) + '"/>';
      acc += len;
    }
    return '<svg class="donut" viewBox="0 0 300 300" role="img" aria-label="지출 비중 도넛 · 분류 합계 ' + Core.money(total) + '원">' +
      '<g transform="rotate(-90 ' + G.cx + ' ' + G.cy + ')">' + segs + '</g>' +
      donutLabels(parts, total) +
      '<text class="dctr-lb" x="' + G.cx + '" y="134" text-anchor="middle">총 지출</text>' +
      '<text class="dctr-amt" x="' + G.cx + '" y="159" text-anchor="middle">' + Core.money(total) + '원</text>' +
      '</svg>';
  }

  /* 카드 하나 — 도넛 + 순위·비중·금액 막대 목록 (줄을 누르면 그 분류 내역이 펼쳐짐) */
  function donutCard(cats) {
    var dp = donutParts(cats);
    var out = ['<div class="card donutcard"><h2>' + ic('pie', 15) + ' 어디에 많이 썼을까 <span class="sub">지출 비중</span></h2>'];
    if (!dp.total) {
      out.push('<div class="empty">이 달 지출이 쌓이면 어디에 많이 썼는지 그림으로 보여 드려요</div></div>');
      return { html: out.join(''), total: 0, parts: [] };
    }
    var maxShare = 0;
    dp.parts.forEach(function (p) { if (p.now / dp.total > maxShare) maxShare = p.now / dp.total; });
    out.push('<div class="donutwrap"><div class="donutbox">' + svgDonut(dp.parts, dp.total) + '</div><div class="dlist">');
    dp.parts.forEach(function (p) {
      var share = p.now / dp.total;
      var w = Math.max(3, share / maxShare * 100);
      var open = !!ui.openDonut[p.name];
      out.push('<button class="drow' + (open ? ' open' : '') + '" data-act="donut-cat" data-cat="' + esc(p.name) + '" aria-expanded="' + (open ? 'true' : 'false') + '">' +
        '<span class="dl1"><i class="dot" style="background:' + p.color + '"></i>' +
        '<span class="nm">' + esc(p.name) + (p.unknown ? ' <span class="badge warn">설정에 없음</span>' : '') + '</span>' +
        '<span class="pc num">' + shareLabel(share) + '</span>' +
        '<span class="chev" aria-hidden="true">' + (open ? '▾' : '▸') + '</span></span>' +
        '<span class="dl2"><span class="dbar"><i style="width:' + w.toFixed(1) + '%;background:' + p.color + '"></i></span>' +
        '<span class="amt num">' + Core.money(p.now) + '원</span></span></button>');
      if (open) out.push(detailRows(Core.catTx(S, ui.ym, p.name), 'cat'));
    });
    out.push('</div></div>');
    out.push('<p class="hint">지출이 있는 분류 ' + dp.count + '개를 큰 순서로 모두 보여 드려요. 분류를 누르면 이 달 내역이 펼쳐져요.</p>');
    out.push('</div>');
    return { html: out.join(''), total: dp.total, parts: dp.parts };
  }

  /* ---------- 요약 ---------- */
  function viewSummary() {
    var ym = ui.ym, st = Core.stats(S, ym), prev = Core.stats(S, Core.addMonths(ym, -1));
    var net = Core.latestNetWorth(S, ym);
    var target = Core.num(S.settings.targetRate);
    var out = [];

    out.push(monthBar(ym));
    out.push('<div class="kpis">');
    out.push(kpi('mint', '이번 달 수입', Core.money(st.income), '전월 대비 ' + Core.signedWon(st.income - prev.income)));
    out.push(kpi('rose', '실질 지출', Core.money(st.real),
      (st.installment ? '할부 ' + Core.money(st.installment) + ' 포함' : '지출 ' + Core.money(st.expense)) +
      (st.discount ? ' · 할인 ' + Core.signed(st.discount) : '')));
    out.push(kpi('', '이번 달 수지', Core.signedWon(st.balance), '전월 대비 ' + Core.signedWon(st.balance - prev.balance) +
      (st.transfer ? ' · 이체 ' + Core.money(st.transfer) + '은 제외' : '')));
    out.push(kpi('sage', '저축률',
      st.saveRate === null ? '—' : Core.pct(st.saveRate, 0),
      '목표 ' + Core.pct(target, 0) + ' ',
      st.saveRate === null ? '<span class="badge n">수입 0원</span>' :
        (st.saveRate >= target ? '<span class="badge ok">달성</span>' : '<span class="badge no">미달</span>')));
    out.push(kpi('wide blue', '순자산', net ? Core.money(net.net) : '—',
      net ? (net.ym === ym ? '이번 달 자산추이 기준' : net.ym + ' 기준(자산추이)') +
        (net.delta === null ? '' : ' · 전월 대비 ' + Core.signedWon(net.delta))
        : '추이 > 자산에 잔액을 적으면 보여요'));
    out.push('</div>');

    /* 📅 한달 달력 · 주별 지출 그림 바로가기 (문을 한 번에 찾게) */
    var calSum = Core.monthCalendar(S, ym);
    out.push('<div class="card calcue">' +
      '<h2>' + ic('coin', 15) + ' 한달 달력 · 주별 지출 그림 <span class="sub">' + esc(ym.slice(5, 7)) + '월</span></h2>' +
      '<div class="weekchart">' + weekBars(calSum, { avg: true, act: 'gocal' }) + '</div>' +
      '<div class="calcue-foot"><span class="tiny muted num">' + calSum.spentDays + '일 지출 · 주 평균 ' + Core.money(calSum.avgWeek) + '원</span>' +
      '<button class="chip mini gobtn" data-act="gocal">한달 달력으로 보기 ›</button></div></div>');

    /* 🍩 어디에 많이 썼을까 — 지출 비중 도넛 + 순위 목록 */
    var allCats = Core.catSummary(S, ym, { all: true });
    var donut = donutCard(allCats);
    var catTotal = donut.total;
    var catMax = 0;
    allCats.forEach(function (r) { if (Core.num(r.now) > catMax) catMax = Core.num(r.now); });
    out.push(donut.html);

    var cats = allCats.filter(function (r) { return ui.catAll || r.now || r.prev || r.budget; });
    var catRows = cats.slice(0, ui.catAll ? 99 : 8);
    out.push('<div class="card"><h2>' + ic('food', 15) + ' 지출 분류별 <span class="sub">이번 달 · 전월 · 예산</span></h2><div class="rows">');
    if (!catRows.length) out.push('<div class="empty">이 달 지출이 아직 없어요</div>');
    catRows.forEach(function (r) {
      var meta = r.prev ? '전월 ' + Core.money(r.prev) + ' (' + Core.signed(r.diff) + ')' : '전월 —';
      if (r.useRate !== null) meta = '예산 ' + Core.money(r.budget) + ' 중 ' + Core.pct(r.useRate, 0);
      /* 전체 지출 대비 비중 — 예산이 없어도 이 줄이 몇 % 인지 바로 읽히게 */
      var share = catTotal ? r.now / catTotal : 0;
      var shareW = r.now && catMax ? Math.max(3, r.now / catMax * 100) : 0;
      var bar = r.useRate !== null
        ? '<span class="bar"><i class="' + (r.useRate > 1 ? 'over' : '') + '" style="width:' + Math.min(100, Math.max(2, r.useRate * 100)) + '%"></i></span>'
        : (shareW ? '<span class="bar share"><i style="width:' + shareW.toFixed(1) + '%"></i></span>' : '');
      var open = !!ui.openCats[r.name];
      out.push('<button class="row rowtap' + (open ? ' open' : '') + '" data-act="sum-cat" data-cat="' + esc(r.name) + '" aria-expanded="' + (open ? 'true' : 'false') + '">' +
        '<span class="l1">' +
        '<span class="nm">' + esc(r.name) + (r.unknown ? ' <span class="badge warn">설정에 없음</span>' : '') + '</span>' +
        '<span class="pc num' + (r.now ? '' : ' zero') + '">' + shareLabel(share) + '</span>' +
        '<span class="amt num">' + Core.money(r.now) + '</span>' +
        '<span class="chev" aria-hidden="true">' + (open ? '▾' : '▸') + '</span></span>' +
        '<span class="l2">' + bar +
        '<span class="meta">' + esc(meta) + '</span></span></button>');
      if (open) out.push(detailRows(Core.catTx(S, ym, r.name), 'cat'));
    });
    if (cats.length > 8) out.push('<button class="btn ghost sm" data-act="catall" style="margin-top:8px">' + (ui.catAll ? '접기' : '분류 ' + cats.length + '개 모두 보기') + '</button>');
    out.push('<div class="totrow"><span>지출 합계</span><span class="muted tiny">카드할인 ' + Core.signed(st.discount) + '</span><span class="amt num">' + Core.money(st.real) + '</span></div>');
    out.push('</div>');
    if (!cats.some(function (r) { return r.budget; })) out.push('<p class="hint">막대는 이번 달 지출 중 이 분류가 차지하는 비중이에요. 설정에서 분류별 월 예산을 넣으면 예산 사용률 막대로 바뀝니다.</p>');
    out.push('</div>');

    /* 결제수단 */
    var ms = Core.methodSummary(S, ym);
    out.push('<div class="card"><h2>' + ic('card', 15) + ' 결제수단별 청구액 <span class="sub">사용액 · 할인 · 청구</span></h2><div class="rows">');
    ms.rows.forEach(function (r) {
      if (!r.used && !r.discount) return;
      var open = !!ui.openMethods[r.name];
      out.push('<button class="row rowtap' + (open ? ' open' : '') + '" data-act="sum-method" data-method="' + esc(r.name) + '" aria-expanded="' + (open ? 'true' : 'false') + '">' +
        '<span class="l1"><span class="nm">' + esc(r.name) + '</span>' +
        '<span class="amt num">' + Core.money(r.billed) + '</span>' +
        '<span class="chev" aria-hidden="true">' + (open ? '▾' : '▸') + '</span></span>' +
        '<span class="l2"><span class="meta">사용 ' + Core.money(r.used) + (r.discount ? ' · 할인 ' + Core.signed(r.discount) : '') + '</span></span></button>');
      if (open) out.push(detailRows(Core.methodTx(S, ym, r.name), 'method'));
    });
    out.push('<div class="totrow"><span>합계</span><span class="muted tiny">' + (ms.total.discount ? '할인 ' + Core.signed(ms.total.discount) : '') + '</span>' +
      '<span class="amt num">' + Core.money(ms.total.billed) + '</span></div></div>');
    if (!ms.total.used) out.push('<p class="hint">이 달 결제수단이 적힌 지출이 없어요.</p>');
    out.push('</div>');

    /* 6개월 추이 */
    var tr = Core.trend(S, ym, 6);
    out.push('<div class="card"><h2>' + ic('trend', 15) + ' 최근 6개월 수입 vs 실질 지출</h2>' + svgBars(tr) +
      '<div class="legend"><span><i style="background:#A9CDB4"></i>수입</span><span><i style="background:#EBD9C4"></i>실질 지출</span></div>');
    out.push('</div>');
    return out.join('');
  }

  /* 요약 행 아래에 펼칠 내역 — 날짜 · 항목 · 결제수단 · 메모 · 금액(할인은 −) */
  function signedMoney(v) { v = Core.num(v); return (v < 0 ? '−' : '') + Core.money(Math.abs(v)); }
  function detailRows(list, kind) {
    var sum = 0;
    list.forEach(function (t) { sum += Core.num(t.amount); });
    var out = ['<div class="subrows" role="group" aria-label="' + (kind === 'method' ? '이 결제수단' : '이 분류') + ' 내역">'];
    out.push('<div class="subhead"><span>' + list.length + '건' + (kind === 'method' && list.some(function (t) { return t.kind === '카드할인'; }) ? ' · 카드할인 포함' : '') + '</span>' +
      '<span>합계 ' + signedMoney(sum) + '원</span></div>');
    if (!list.length) out.push('<div class="subempty">이 달에는 내역이 없어요</div>');
    list.forEach(function (t) {
      var sub = [];
      if (t.kind === '할부') sub.push('할부');
      if (t.kind === '카드할인') sub.push('카드할인');
      if (t.method && t.kind !== '수입') sub.push(t.method);
      if (t.memo) sub.push(t.memo);
      out.push('<button class="tx sub" data-act="txopen" data-v="' + esc(t.id) + '">' +
        '<span class="td num">' + esc(String(t.date).slice(5, 7)) + '/' + esc(String(t.date).slice(8, 10)) + '</span>' +
        '<span class="tb"><span class="ti">' + esc(t.item || t.cat || '(항목 없음)') + '</span>' +
        '<span class="tm">' + esc(sub.join(' · ') || '—') + '</span></span>' +
        '<span class="ta num">' + (t.kind === '카드할인' ? signedMoney(t.amount) : signedMoney(-Math.abs(Core.num(t.amount)))) + '</span></button>');
    });
    out.push('</div>');
    return out.join('');
  }

  /* 요약 아코디언: 펼침/접힘을 기억하고, 누른 줄이 화면 밖으로 밀리지 않게 자리를 지킵니다 */
  function toggleSumRow(key, name, act, attr) {
    if (name == null) return;
    var y = window.pageYOffset || window.scrollY || 0;
    if (!ui[key]) ui[key] = {};
    var opening = !ui[key][name];
    if (opening) ui[key][name] = 1; else delete ui[key][name];
    render();
    window.scrollTo(0, y);
    var els = $$('[data-act="' + act + '"]'), box = null;
    for (var i = 0; i < els.length; i++) if (els[i].getAttribute(attr) === name) { box = els[i]; break; }
    if (!box) return;
    var rect = box.getBoundingClientRect(), limit = window.innerHeight - 76;
    if (rect.top < 56 || (opening && rect.bottom > limit)) window.scrollTo(0, Math.max(0, y + rect.top - 62));
  }

  /* ---------- 차트: 월별 막대 ---------- */
  function svgBars(items) {
    var W = 320, H = 150, pl = 2, pr = 50, pt = 18, pb = 16;
    var max = 1;
    items.forEach(function (i) { max = Math.max(max, i.income, i.real); });
    var step = niceStep(max), top = Math.ceil(max / step) * step || 1;
    var n = items.length, slot = (W - pl - pr) / n, bw = Math.min(14, slot * 0.30);
    var y = function (v) { return pt + (H - pt - pb) * (1 - v / top); };
    var g = '';
    for (var k = 0; k <= 2; k++) {
      var val = top * k / 2, yy = y(val);
      g += '<line class="grid" x1="' + pl + '" x2="' + (W - pr + 2) + '" y1="' + yy.toFixed(1) + '" y2="' + yy.toFixed(1) + '"/>';
      g += '<text class="lbl" x="' + (W - 1) + '" y="' + (yy + 3).toFixed(1) + '" text-anchor="end">' + shortNum(val) + '</text>';
    }
    var bars = '';
    items.forEach(function (it, i) {
      var cx = pl + slot * (i + 0.5);
      var h1 = Math.max(0, H - pb - y(it.income)), h2 = Math.max(0, H - pb - y(it.real));
      bars += '<rect class="inc" x="' + (cx - bw - 1).toFixed(1) + '" y="' + y(it.income).toFixed(1) + '" width="' + bw.toFixed(1) + '" height="' + h1.toFixed(1) + '" rx="3"/>';
      bars += '<rect class="exp" x="' + (cx + 1).toFixed(1) + '" y="' + y(it.real).toFixed(1) + '" width="' + bw.toFixed(1) + '" height="' + h2.toFixed(1) + '" rx="3"/>';
      bars += '<text class="lbl" x="' + cx.toFixed(1) + '" y="' + (H - 4) + '" text-anchor="middle">' + esc(it.label) + '</text>';
    });
    return '<svg class="chart" viewBox="0 0 ' + W + ' ' + H + '" preserveAspectRatio="xMidYMid meet" role="img" aria-label="월별 수입과 실질 지출">' + g + bars + '</svg>';
  }
  function niceStep(max) {
    var p = Math.pow(10, Math.floor(Math.log(max) / Math.LN10));
    var n = max / p;
    var m = n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10;
    return m * p;
  }
  function shortNum(v) {
    var s = v < 0 ? '-' : '';
    v = Math.abs(v);
    if (v >= 100000000) return s + (v / 100000000).toFixed(v % 100000000 ? 1 : 0) + '억';
    if (v >= 10000) return s + (v / 10000 >= 10 ? Math.round(v / 10000) : (v / 10000).toFixed(1).replace(/\.0$/, '')) + '만';
    if (v >= 1000) return s + Math.round(v / 1000) + '천';
    return s + String(Math.round(v));
  }

  /* ---------- 거래 탭: 한달 달력 / 내역 목록 ---------- */
  function viewList() {
    var seg = '<div class="seg listseg">' +
      '<button class="' + (ui.listView === 'cal' ? 'on' : '') + '" data-act="listseg" data-v="cal">📅 한달 달력</button>' +
      '<button class="' + (ui.listView === 'list' ? 'on' : '') + '" data-act="listseg" data-v="list">📋 내역 목록</button></div>';
    return monthBar(ui.ym) + seg + (ui.listView === 'cal' ? viewCalendar() : viewTxList());
  }

  /* ---------- 한달 달력 · 주간 총액 그림 ---------- */
  /* 달력 칸 금액은 '만' 으로 줄이지 않고 정확한 숫자 그대로 (1,184,001 / −12,000) */
  function calAmt(v) {
    v = Math.round(Core.num(v));
    if (!v) return '';
    return v < 0 ? '−' + Core.money(-v) : Core.money(v);
  }
  function heatLevel(exp, max) {
    if (!exp || !max) return 0;
    var r = exp / max;
    return r > 0.75 ? 4 : r > 0.5 ? 3 : r > 0.25 ? 2 : 1;
  }
  function calCell(c, cal, today) {
    if (!c) return '<div class="calcell blank" aria-hidden="true"></div>';
    var lv = heatLevel(c.expense, cal.maxDay);
    var cls = 'calcell' + (lv ? ' h' + lv : '') +
      (c.date === today ? ' today' : '') +
      (c.dow === 0 ? ' sun' : c.dow === 6 ? ' sat' : '') +
      (ui.selDate === c.date ? ' sel' : '');
    var amt = c.expense ? calAmt(c.expense) : '';
    var digits = amt.replace(/[^0-9]/g, '').length;
    var low = amt ? '<span class="dspend num' + (c.expense < 0 ? ' neg' : '') + (digits >= 7 ? ' long' : '') + '">' + amt + '</span>' : '';
    return '<button class="' + cls + '" data-act="calsel" data-v="' + c.date + '" aria-label="' + c.day + '일' +
      (c.expense > 0 ? ' 지출 ' + Core.money(c.expense) + '원' : c.expense < 0 ? ' 할인 ' + Core.money(-c.expense) + '원' : ' 지출 없음') +
      (c.income ? ' 수입 ' + Core.money(c.income) + '원' : '') + '">' +
      '<span class="dnum num">' + c.day + '</span>' + low + '</button>';
  }
  function viewCalendar() {
    var ym = ui.ym, cal = Core.monthCalendar(S, ym), today = Core.todayStr();
    var out = [], DOW = ['월', '화', '수', '목', '금', '토', '일'];

    /* ① 주별 지출 총액 그림 */
    out.push('<div class="card weekcard"><h2>' + ic('chart', 15) + ' 주별 지출 그림 <span class="sub">1주~' + cal.weeks.length + '주</span></h2>' +
      '<div class="weekchart">' + weekBars(cal, { avg: true, sel: true }) + '</div>' +
      '<p class="hint" style="margin-top:4px">' + (cal.maxWeek ? '가장 많이 쓴 주는 <b>' + cal.maxWeekIdx + '주</b> (' + Core.money(cal.maxWeek) + '원) · 점선은 주 평균 ' + Core.money(cal.avgWeek) + '원' : '아직 지출이 없어요') + '</p></div>');

    /* ② 한 달 달력 표 (월~일 · 매 주 아래 주간 합계 띠) */
    out.push('<div class="card calcard"><h2>' + ic('receipt', 15) + ' 한 달 달력 <span class="sub">' + esc(ym.slice(0, 4)) + '년 ' + cal.month + '월</span></h2>');
    out.push('<div class="caldow">' + DOW.map(function (d, i) {
      return '<span class="' + (i === 5 ? 'sat' : i === 6 ? 'sun' : '') + '">' + d + '</span>';
    }).join('') + '</div>');
    cal.weeks.forEach(function (w) {
      out.push('<div class="calweek">' + w.days.map(function (c) { return calCell(c, cal, today); }).join('') + '</div>');
      if (w.startDay === null) return;
      var pct = cal.maxWeek ? Math.max(3, w.expense / (cal.maxWeek * 1.02) * 100) : 0;
      out.push('<button class="calwk' + (ui.selWeek === w.idx ? ' sel' : '') + (w.expense >= cal.maxWeek && w.expense ? ' top' : '') + '" data-act="calweek" data-v="' + w.idx + '" aria-label="' + w.label + ' 합계 ' + Core.money(w.expense) + '원">' +
        '<span class="lb"><b>' + w.label + '</b><i>' + w.range + '</i></span>' +
        '<span class="wbar"><i style="width:' + pct.toFixed(1) + '%"></i></span>' +
        '<span class="amt num">' + (w.expense ? Core.money(w.expense) + '<small>원</small>' : '<span class="muted">—</span>') + '</span></button>');
    });
    out.push('<div class="caltot"><span>이 달 합계</span><span class="num">' + Core.money(cal.totalExpense) + '원</span></div>' +
      '<p class="hint">하루 평균 ' + Core.money(cal.avgDay) + '원 · ' + cal.count + '건 · 색이 진할수록 그날 지출이 많아요</p></div>');

    /* ③ 고른 날짜·주 상세 */
    if (ui.selDate) out.push(calDayCard(ui.selDate));
    else if (ui.selWeek) out.push(calWeekCard(cal, ui.selWeek));
    else out.push('<p class="hint" style="text-align:center;margin:2px 0 8px">날짜를 누르면 그날 내역이, 주차를 누르면 그 주 내역이 아래에 펼쳐져요</p>');
    return out.join('');
  }

  function calDayCard(date) {
    var txs = (S.tx || []).filter(function (t) { return t.date === date; });
    txs.sort(function (a, b) { return String(a.id) < String(b.id) ? -1 : 1; });
    var exp = 0, inc = 0, i;
    for (i = 0; i < txs.length; i++) {
      var a = Core.num(txs[i].amount);
      if (txs[i].kind === '수입') inc += a;
      else if (Core.OUTGOING[txs[i].kind] || txs[i].kind === '카드할인') exp += a;
    }
    var out = ['<div class="card daycard"><h2>' + ic('receipt', 15) + ' ' + esc(Core.dayLabel(date)) +
      '<span class="sub num">' + (exp ? '지출 ' + Core.money(exp) : '지출 없음') + (inc ? ' · 수입 ' + Core.money(inc) : '') + '</span></h2>'];
    if (!txs.length) out.push('<div class="empty">이날은 적은 내역이 없어요</div>');
    else {
      out.push('<div class="txlist">');
      txs.forEach(function (t) {
        var sub = [];
        if (t.cat) sub.push(t.cat);
        if (t.method && t.kind !== '수입') sub.push(t.method);
        if (t.memo) sub.push(t.memo);
        var sign = (t.kind === '지출' || t.kind === '할부') ? '−' : (t.kind === '수입' ? '+' : '');
        var amtTxt = t.kind === '카드할인' ? Core.signed(t.amount) : sign + Core.money(Math.abs(t.amount));
        out.push('<button class="tx k-' + esc(t.kind) + '" data-act="txopen" data-v="' + esc(t.id) + '">' +
          '<span class="tc">' + kindIcon(t.kind, 15) + '</span>' +
          '<span class="tb"><span class="ti">' + esc(t.item || '(항목 없음)') + '</span>' +
          '<span class="tm">' + esc(sub.join(' · ') || t.kind) + '</span></span>' +
          '<span class="ta num">' + amtTxt + '</span></button>');
      });
      out.push('</div>');
    }
    out.push('<button class="btn ghost sm widebtn" data-act="caladd" data-v="' + esc(date) + '">＋ 이날 거래 추가</button></div>');
    return out.join('');
  }

  function calWeekCard(cal, idx) {
    var w = cal.weeks.filter(function (x) { return x.idx === idx; })[0];
    if (!w) return '';
    var out = ['<div class="card daycard"><h2>' + ic('trend', 15) + ' ' + w.label + ' 내역 <span class="sub num">' +
      esc(w.range) + ' · ' + (w.expense ? '지출 ' + Core.money(w.expense) + '원' : '지출 없음') + '</span></h2>'];
    var any = false;
    w.days.forEach(function (c) {
      if (!c || !c.tx.length) return;
      var rows = c.tx.filter(function (t) { return t.kind === '카드할인' || Core.OUTGOING[t.kind]; });
      if (!rows.length) return;
      any = true;
      out.push('<div class="daygroup" style="margin-bottom:8px"><div class="dayhead"><span>' + esc(Core.dayLabel(c.date)) + '</span>' +
        '<span class="dsum num">' + (c.expense ? '지출 ' + Core.money(c.expense) : '지출 없음') + '</span></div><div class="txlist">');
      rows.forEach(function (t) {
        var sub = [];
        if (t.cat) sub.push(t.cat);
        if (t.method && t.kind !== '수입') sub.push(t.method);
        var sign = (t.kind === '지출' || t.kind === '할부') ? '−' : (t.kind === '수입' ? '+' : '');
        var amtTxt = t.kind === '카드할인' ? Core.signed(t.amount) : sign + Core.money(Math.abs(t.amount));
        out.push('<button class="tx k-' + esc(t.kind) + '" data-act="txopen" data-v="' + esc(t.id) + '">' +
          '<span class="tc">' + kindIcon(t.kind, 15) + '</span>' +
          '<span class="tb"><span class="ti">' + esc(t.item || '(항목 없음)') + '</span>' +
          '<span class="tm">' + esc(sub.join(' · ') || t.kind) + '</span></span>' +
          '<span class="ta num">' + amtTxt + '</span></button>');
      });
      out.push('</div></div>');
    });
    if (!any) out.push('<div class="empty">이 주에는 적은 내역이 없어요</div>');
    out.push('</div>');
    return out.join('');
  }

  /* ---------- 거래 목록 ---------- */
  function viewTxList() {
    var ym = ui.ym, all = Core.txOf(S, ym), out = [];
    var list = all.slice();
    if (ui.q) {
      var q = ui.q.toLowerCase();
      list = list.filter(function (t) {
        return (t.item || '').toLowerCase().indexOf(q) >= 0 || (t.cat || '').toLowerCase().indexOf(q) >= 0 ||
          (t.memo || '').toLowerCase().indexOf(q) >= 0 || (t.method || '').toLowerCase().indexOf(q) >= 0 ||
          Core.money(t.amount).indexOf(q) >= 0;
      });
    }
    if (ui.fKind) list = list.filter(function (t) { return t.kind === ui.fKind; });
    if (ui.fCat) list = list.filter(function (t) { return t.cat === ui.fCat; });
    if (ui.fMethod) list = list.filter(function (t) { return t.method === ui.fMethod; });
    list.sort(function (a, b) { return a.date < b.date ? 1 : a.date > b.date ? -1 : (a.id < b.id ? 1 : -1); });

    var iss = Core.issues(S, ym), issMap = {};
    iss.forEach(function (i) { issMap[i.id] = i.reasons; });
    out.push('<div class="searchbar"><input id="q" type="search" inputmode="search" placeholder="🔍 항목·분류·메모·금액 검색" value="' + esc(ui.q) + '" data-act="q"></div>');
    out.push('<div class="filters">' + ['', '지출', '수입', '이체', '카드할인', '할부'].map(function (k) {
      return '<button class="chip' + (ui.fKind === k ? ' on' : '') + '" data-act="fkind" data-v="' + k + '">' + (k || '전체') + '</button>';
    }).join('') + '</div>');

    var catNames = S.settings.expCats.map(function (c) { return c.name; }).concat(S.settings.incCats);
    var uniqCats = catNames.filter(function (v, i, a) { return a.indexOf(v) === i; });
    out.push('<div class="filters">' +
      '<select class="chip" data-act="fcat" style="max-width:44%">' + '<option value="">분류 전체</option>' +
      uniqCats.map(function (c) { return '<option value="' + esc(c) + '"' + (ui.fCat === c ? ' selected' : '') + '>' + esc(c) + '</option>'; }).join('') + '</select>' +
      '<select class="chip" data-act="fmethod" style="max-width:44%">' + '<option value="">결제수단 전체</option>' +
      S.settings.methods.map(function (m) { return '<option value="' + esc(m) + '"' + (ui.fMethod === m ? ' selected' : '') + '>' + esc(m) + '</option>'; }).join('') + '</select>' +
      (ui.fCat || ui.fMethod || ui.fKind || ui.q ? '<button class="chip mini" data-act="fclear">필터 지우기</button>' : '') +
      '</div>');

    if (iss.length) {
      out.push('<div class="card" style="border-color:#F0DDB6;background:#FEF9EE"><h2 style="color:#7D5A15">' + ic('tag', 15) + ' 점검할 줄 ' + iss.length + '개</h2>' +
        '<p class="hint" style="margin:0">설정에 없는 분류·결제수단이거나 분류가 비어 있어요. 줄을 눌러 고칠 수 있어요.</p></div>');
    }

    out.push('<div class="card" style="padding:10px 12px"><div class="l1" style="display:flex;align-items:baseline;gap:6px">' +
      '<b style="font-size:13px">' + esc(ym.slice(5, 7)) + '월 ' + list.length + '건</b>' +
      '<span class="muted tiny" style="margin-left:auto">수입 ' + Core.money(Core.stats(S, ym).income) + ' · 실질지출 ' + Core.money(Core.stats(S, ym).real) + '</span></div></div>');

    if (!list.length) {
      out.push('<div class="card"><div class="empty">' + (all.length ? '조건에 맞는 거래가 없어요' : '이 달 거래가 없어요.<br>아래 ＋ 로 첫 거래를 적어 보세요') + '</div></div>');
      return out.join('');
    }

    var groups = {}, order = [];
    list.forEach(function (t) {
      if (!groups[t.date]) { groups[t.date] = []; order.push(t.date); }
      groups[t.date].push(t);
    });
    order.forEach(function (d) {
      var daySum = 0, dayIn = 0;
      groups[d].forEach(function (t) {
        if (t.kind === '지출' || t.kind === '할부') daySum += Core.num(t.amount);
        else if (t.kind === '카드할인') daySum += Core.num(t.amount);
        else if (t.kind === '수입') dayIn += Core.num(t.amount);
      });
      out.push('<div class="daygroup"><div class="dayhead"><span>' + esc(Core.dayLabel(d)) + '</span>' +
        '<span class="dsum">' + (daySum ? '지출 ' + Core.money(daySum) : '') + (dayIn ? (daySum ? ' · ' : '') + '수입 ' + Core.money(dayIn) : '') + '</span></div><div class="txlist">');
      groups[d].forEach(function (t) {
        var warn = issMap[t.id] ? '<span class="warn" title="' + esc(issMap[t.id].join(', ')) + '">⚠️</span>' : '';
        var sub = [];
        if (t.cat) sub.push(t.cat);
        if (t.method && t.kind !== '수입') sub.push(t.method);
        if (t.memo) sub.push(t.memo);
        var sign = (t.kind === '지출' || t.kind === '할부') ? '−' : (t.kind === '수입' ? '+' : '');
        var amtTxt = t.kind === '카드할인' ? Core.signed(t.amount) : sign + Core.money(Math.abs(t.amount));
        out.push('<button class="tx k-' + esc(t.kind) + '" data-act="txopen" data-v="' + esc(t.id) + '">' +
          '<span class="tc">' + kindIcon(t.kind, 15) + '</span>' +
          '<span class="tb"><span class="ti">' + esc(t.item || '(항목 없음)') + warn + '</span>' +
          '<span class="tm">' + esc(sub.join(' · ') || t.kind) + '</span></span>' +
          '<span class="ta num">' + amtTxt + '</span></button>');
      });
      out.push('</div></div>');
    });
    return out.join('');
  }
  function kindIcon(k, size) {
    var m = { '지출': 'coin', '수입': 'wallet', '이체': 'swap', '카드할인': 'tag', '할부': 'receipt' };
    return ic(m[k] || 'coin', size || 14);
  }

  /* ---------- 추이 ---------- */
  function viewTrend() {
    var out = [];
    out.push('<div class="seg">' +
      '<button class="' + (ui.trendSeg === 'year' ? 'on' : '') + '" data-act="tseg" data-v="year">' + ic('trend', 14) + ' 연간추이</button>' +
      '<button class="' + (ui.trendSeg === 'asset' ? 'on' : '') + '" data-act="tseg" data-v="asset">' + ic('bank', 14) + ' 자산추이</button></div>');
    out.push(ui.trendSeg === 'year' ? viewYear() : viewAsset());
    return out.join('');
  }

  function viewYear() {
    var t = Core.yearTable(S, ui.year), ct = Core.yearCatTotals(S, ui.year), out = [];
    out.push('<div class="monthbar">' +
      '<button class="nav" data-act="year" data-v="-1">◀</button>' +
      '<div class="cur">' + ui.year + '년</div>' +
      '<button class="nav" data-act="year" data-v="1">▶</button>' +
      '<button class="today" data-act="yearnow">올해</button></div>');

    out.push('<div class="card"><h2>' + ui.year + '년 한 해 <span class="sub">월별</span></h2>' +
      '<table class="tbl"><thead><tr><th>월</th><th>수입</th><th>실질 지출</th><th>수지</th></tr></thead><tbody>');
    t.rows.forEach(function (r) {
      var zero = !r.count;
      out.push('<tr class="' + (zero ? 'zero' : '') + '"><td>' + r.month + '월</td>' +
        '<td>' + (zero ? '·' : Core.money(r.income)) + '</td>' +
        '<td>' + (zero ? '·' : Core.money(r.real)) + '</td>' +
        '<td>' + (zero ? '·' : Core.signed(r.balance)) + '</td></tr>');
    });
    out.push('</tbody><tfoot><tr><td>합계</td><td>' + Core.money(t.total.income) + '</td><td>' + Core.money(t.total.real) + '</td><td>' + Core.signed(t.total.balance) + '</td></tr>' +
      '<tr><td>월평균</td><td>' + Core.money(t.total.avgIncome) + '</td><td>' + Core.money(t.total.avgReal) + '</td><td>' +
      (t.total.months ? Core.signed(t.total.balance / t.total.months) : '—') + '</td></tr></tfoot></table>' +
      '<p class="hint">기록이 있는 달 ' + t.total.months + '개월 기준 · 저축률 ' + Core.pct(t.total.saveRate, 0) + '</p></div>');

    out.push('<div class="card"><h2>월별 그래프</h2>' + svgBars(t.rows.map(function (r) {
      return { label: r.month + '', income: r.income, real: r.real };
    })) + '<div class="legend"><span><i style="background:#A9CDB4"></i>수입</span><span><i style="background:#EBD9C4"></i>실질 지출</span></div></div>');

    out.push('<div class="card"><h2>분류별 연간 지출 <span class="sub">' + ui.year + '년 합계</span></h2><div class="rows">');
    if (!ct.length) out.push('<div class="empty">아직 지출 기록이 없어요</div>');
    ct.forEach(function (r) {
      var share = t.total.real ? r.total / (t.total.expense + t.total.installment) : 0;
      out.push('<div class="row"><div class="l1"><span class="nm">' + esc(r.name) + '</span><span class="amt num">' + Core.money(r.total) + '</span></div>' +
        '<div class="l2"><div class="bar"><i style="width:' + Math.min(100, Math.max(1, share * 100)) + '%"></i></div><span class="meta">' + Core.pct(share, 0) + '</span></div></div>');
    });
    out.push('</div></div>');
    return out.join('');
  }

  function viewAsset() {
    var series = Core.assetSeries(S), out = [];
    var cols = S.settings.assetCols || [];
    var exCount = series.filter(function (r) { return r.ex; }).length;
    var cur = Core.assetRow(S, ui.ym);

    out.push('<div class="card"><h2>' + ic('bank', 15) + ' 자산추이 <span class="sub">한 달에 한 번 적으면 그래프가 그려져요</span></h2>' +
      '<p class="hint" style="margin-top:0">시작 ' + esc(S.settings.assetStart || '—') + ' · 적은 달 ' + series.length + '개 · 항목 ' + cols.length + '개</p>' +
      '<p class="hint" style="margin-top:2px">' + cols.map(function (c) { return esc(c); }).join(' · ') + '</p>' +
      '<div class="btnline"><button class="btn ghost sm" data-act="assetmon">이번 달 잔액 적기</button>' +
      '<button class="btn ghost sm" data-act="assetcols">항목명 편집</button>' +
      (exCount ? '<button class="btn ghost sm" data-act="assetclear">예시 ' + exCount + '개 지우기</button>' : '') +
      '</div></div>');

    out.push('<div class="card"><h2>순자산 흐름</h2>' + svgLine(series) + '</div>');

    out.push('<div class="card"><h2>월별 자산 <span class="sub">' + (series.length ? series[0].ym + ' ~ ' + series[series.length - 1].ym : '') + '</span></h2><div class="rows">');
    if (!series.length) out.push('<div class="empty">자산을 적으면 여기에 달마다 쌓여요</div>');
    series.slice().reverse().forEach(function (r) {
      out.push('<button class="arow" style="width:100%;text-align:left;background:none" data-act="assetopen" data-v="' + esc(r.ym) + '">' +
        '<span class="am">' + esc(r.ym.slice(2)) + '</span>' +
        '<span class="ab"><span class="an num">' + Core.money(r.net) + '</span>' +
        '<div class="as">총자산 ' + Core.money(r.total) + ' · 부채 ' + Core.money(r.debt) +
        (r.delta === null ? '' : ' · 전월 ' + Core.signed(r.delta)) + '</div>' +
        '<div class="as">그 달 수지 ' + Core.signedWon(r.monthBalance) + (r.ex ? ' <span class="badge ex">예시</span>' : '') + '</div></span>' +
        '</button>');
    });
    out.push('</div>');
    if (cur) out.push('<p class="hint">' + esc(ui.ym) + ' 순자산 ' + Core.money(cur.net) + ' · 항목별로 눌러 고칠 수 있어요</p>');
    out.push('</div>');
    return out.join('');
  }
  function svgLine(series) {
    var W = 320, H = 150, pl = 2, pr = 48, pt = 18, pb = 20;
    if (!series.length) return '<div class="empty">아직 자산 기록이 없어요</div>';
    var vals = series.map(function (r) { return r.net; });
    var max = Math.max.apply(null, vals), min = Math.min.apply(null, vals);
    if (min > 0) min = 0;                                   // 모두 양수면 바닥은 0원부터
    if (max === min) { max = max + 100000; }
    var pad = (max - min) * 0.12; max += pad; if (min > 0) min = Math.max(0, min - pad);
    var x = function (i) { return pl + (W - pl - pr) * (series.length === 1 ? 0.5 : i / (series.length - 1)); };
    var y = function (v) { return pt + (H - pt - pb) * (1 - (v - min) / (max - min)); };
    var d = '', pts = [];
    series.forEach(function (r, i) {
      var px = x(i), py = y(r.net);
      pts.push([px, py]);
      d += (i ? 'L' : 'M') + px.toFixed(1) + ' ' + py.toFixed(1) + ' ';
    });
    var area = d + 'L' + x(series.length - 1).toFixed(1) + ' ' + (H - pb) + ' L' + x(0).toFixed(1) + ' ' + (H - pb) + ' Z';
    var g = '';
    for (var k = 0; k <= 2; k++) {
      var val = min + (max - min) * k / 2, yy = y(val);
      g += '<line class="grid" x1="' + pl + '" x2="' + (W - pr + 2) + '" y1="' + yy.toFixed(1) + '" y2="' + yy.toFixed(1) + '"/>' +
        '<text class="lbl" x="' + (W - 1) + '" y="' + (yy + 3).toFixed(1) + '" text-anchor="end">' + shortNum(val) + '</text>';
    }
    var dots = pts.map(function (p, i) {
      return '<circle class="dot" cx="' + p[0].toFixed(1) + '" cy="' + p[1].toFixed(1) + '" r="3"/>';
    }).join('');
    var labels = series.map(function (r, i) {
      if (series.length > 8 && i % 2) return '';
      return '<text class="lbl" x="' + x(i).toFixed(1) + '" y="' + (H - 6) + '" text-anchor="middle">' + esc(r.ym.slice(5)) + '</text>';
    }).join('');
    return '<svg class="chart" viewBox="0 0 ' + W + ' ' + H + '" preserveAspectRatio="xMidYMid meet" role="img" aria-label="순자산 흐름">' +
      '<defs><linearGradient id="ag" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#A9CDB4"/><stop offset="1" stop-color="#A9CDB4" stop-opacity="0"/></linearGradient></defs>' +
      g + '<path class="area" d="' + area + '"/><path class="line" d="' + d + '"/>' + dots + labels + '</svg>';
  }

  /* ---------- 고정비 ---------- */
  function viewFixed() {
    var plan = Core.fixedPlan(S, ui.ym), out = [];
    var sumF = 0, exN = 0, dupN = 0, addN = 0, zeroN = 0, zeroNo = 0;
    plan.forEach(function (p) {
      if (p.ex) { exN++; return; }
      sumF += Core.num(p.f.amount);
      if (p.zero) { if (p.dupTx) zeroN++; else zeroNo++; return; }
      if (p.dup) dupN++; else addN++;
    });
    var mm = ui.ym.slice(5, 7), rmN = dupN + zeroN;
    out.push('<div class="card"><h2>' + ic('repeat', 15) + ' 고정비 <span class="sub">매달 반복되는 항목</span></h2>' +
      '<p class="hint" style="margin-top:0">한 번 적어 두면 매달 <b>이번 달 거래내역에 넣기</b> 한 번으로 입력이 끝나요. 잘못 들어간 달은 <b>빼기</b>로 이번 달 거래내역에서만 되돌리고, 고정비 목록에는 그대로 남겨 둘 수 있어요.</p>' +
      '<div class="btnline"><button class="btn ghost sm" data-act="fixednew">＋ 고정비 추가</button>' +
      (addN ? '<button class="btn sm" data-act="fixedapply">' + ic('download', 14) + ' ' + esc(mm) + '월에 ' + addN + '건 넣기</button>' : '') +
      (rmN ? '<button class="btn danger-ghost sm" data-act="fixedunapply">' + ic('upload', 14) + ' ' + esc(mm) + '월에서 ' + rmN + '건 빼기</button>' : '') +
      (exN ? '<button class="btn ghost sm" data-act="fixedclear">예시 ' + exN + '개 지우기</button>' : '') +
      '</div></div>');

    out.push('<div class="card"><h2>목록 <span class="sub">합계 ' + Core.money(sumF) + '원 / 달</span></h2><div class="rows">');
    if (!plan.length) out.push('<div class="empty">아직 고정비가 없어요.<br>월세·통신비·구독처럼 매달 나가는 돈을 적어 두세요</div>');
    plan.forEach(function (p) {
      var f = p.f, badge, acts = '';
      if (p.ex) {
        badge = '<span class="badge ex">예시</span>';
      } else if (p.zero && p.dupTx) {
        badge = '<span class="badge warn">0원으로 들어감</span>';
        acts = '<button class="mini" data-act="fixedtake" data-v="' + esc(f.id) + '">빼기</button>';
      } else if (p.zero) {
        badge = '<span class="badge warn">금액 미입력</span>';
      } else if (p.dup) {
        badge = '<span class="badge ok">이번 달 들어감</span>';
        acts = '<button class="mini del" data-act="fixedtake" data-v="' + esc(f.id) + '">빼기</button>';
      } else {
        badge = '<span class="badge mute">이번 달 아직</span>';
        acts = '<button class="mini put" data-act="fixedput" data-v="' + esc(f.id) + '">넣기</button>';
      }
      out.push('<div class="li frow"><span class="tc" style="width:26px;height:26px;border-radius:9px;display:grid;place-items:center;background:var(--mint);color:var(--sage-ink);flex:0 0 auto">' + ic('repeat', 14) + '</span>' +
        '<span class="lb"><span class="nm">' + esc(f.item || '(항목 없음)') + '</span>' +
        '<span class="sb">' + esc([f.cat, f.method, f.day ? f.day + '일' : '', f.memo].filter(Boolean).join(' · ')) + '</span></span>' +
        '<span class="rt num">' + Core.money(f.amount) + '</span>' +
        '<div class="fx">' + badge + acts + '<span class="fsp"></span>' +
        '<button class="fbtn" data-act="fixededit" data-v="' + esc(f.id) + '" aria-label="고정비 수정">✎</button>' +
        '<button class="fbtn del" data-act="fixeddel" data-v="' + esc(f.id) + '" aria-label="고정비 목록에서 삭제">✕</button></div></div>');
    });
    out.push('</div>');
    if (dupN) out.push('<p class="hint">이번 달에 이미 들어간 ' + dupN + '건은 다시 넣지 않고, 위의 <b>' + esc(mm) + '월에서 빼기</b>나 줄별 <b>빼기</b>로 이번 달 거래내역에서만 뺄 수 있어요.</p>');
    if (zeroNo) out.push('<p class="hint">금액이 비어 있는 고정비 ' + zeroNo + '건은 넣기·빼기 계산에서 빠져 있어요. 금액을 적으면 함께 계산돼요.</p>');
    out.push('</div>');
    return out.join('');
  }

  /* ---------- 설정 ---------- */
  function viewSettings() {
    var out = [];
    var cloudTxt = !cloudConfigured() ? '이 기기에만 저장 중 (클라우드 미설정)' :
      ui.cloudState === 'live' ? '클라우드 동기화 중' :
        ui.cloudState === 'signed-out' ? '로그인 필요' : '연결 중…';
    out.push('<div class="card"><h2>' + ic('cloud', 15) + ' 저장·동기화</h2>' +
      '<div class="li"><span class="lb"><span class="nm">' + esc(cloudTxt) + '</span>' +
      '<span class="sb">' + (cloudConfigured() ? '실시간 DB · ' + esc(CLOUD.DB_ROOT) : '다음 단계에서 Firebase를 연결하면 폰·PC가 함께 최신이 돼요') + '</span></span>' +
      '<span class="rt"><span class="badge ' + (ui.cloudState === 'live' ? 'ok' : 'n') + '">' + (ui.cloudState === 'live' ? 'LIVE' : 'LOCAL') + '</span></span></div>' +
      '<div class="btnline"><button class="btn ghost sm" data-act="cloud">상태 자세히</button></div></div>');

    out.push('<div class="card"><h2>' + ic('tag', 15) + ' 분류·결제수단</h2>' +
      '<div class="li"><span class="lb"><span class="nm">지출 분류 ' + S.settings.expCats.length + '개</span><span class="sb">' + esc(S.settings.expCats.slice(0, 6).map(function (c) { return c.name; }).join(', ')) + (S.settings.expCats.length > 6 ? ' …' : '') + '</span></span></div>' +
      '<div class="li"><span class="lb"><span class="nm">수입 분류 ' + S.settings.incCats.length + '개</span><span class="sb">' + esc(S.settings.incCats.join(', ')) + '</span></span></div>' +
      '<div class="li"><span class="lb"><span class="nm">결제수단 ' + S.settings.methods.length + '개</span><span class="sb">' + esc(S.settings.methods.join(', ')) + '</span></span></div>' +
      '<div class="btnline" style="margin-top:8px"><button class="btn ghost sm" data-act="catsheet">분류·결제수단 관리</button>' +
      '<button class="btn ghost sm" data-act="budgetsheet">분류별 예산 설정</button></div></div>');

    out.push('<div class="card"><h2>' + ic('target', 15) + ' 목표</h2>' +
      '<div class="li"><span class="lb"><span class="nm">목표 저축률</span><span class="sb">월간요약 저축률 카드에 표시돼요</span></span>' +
      '<span class="rt num">' + Core.pct(S.settings.targetRate, 0) + '</span>' +
      '<span class="mv"><button data-act="targetset" aria-label="수정">✎</button></span></div>' +
      '<div class="li"><span class="lb"><span class="nm">월 전체 예산</span><span class="sb">쓰지 않아도 괜찮아요</span></span>' +
      '<span class="rt num">' + (S.settings.monthBudget ? Core.money(S.settings.monthBudget) : '—') + '</span>' +
      '<span class="mv"><button data-act="monthbudget" aria-label="수정">✎</button></span></div></div>');

    out.push('<div class="card"><h2>' + ic('lock', 15) + ' 앱 잠금</h2>' +
      '<div class="switchrow"><span class="lb"><span class="nm">4자리 PIN 잠금</span><span class="sb">' +
      (S.auth && S.auth.pinHash ? '켜짐 · 앱을 열 때 PIN을 물어요 (SHA-256 해시로만 저장)' : '꺼짐 · PIN을 정하면 앱을 열 때 물어봐요') +
      '</span></span><button class="switch ' + (S.auth && S.auth.pinHash ? 'on' : '') + '" data-act="pintoggle" aria-label="PIN 잠금"><i></i></button></div>' +
      (S.auth && S.auth.pinHash ? '<div class="btnline"><button class="btn ghost sm" data-act="pinchange">PIN 바꾸기</button></div>' : '') +
      '<p class="hint">PIN은 해시로만 저장하고, 평문은 어디에도 남기지 않아요.</p></div>');

    out.push('<div class="card"><h2>' + ic('download', 15) + ' 백업 · 내보내기</h2>' +
      '<div class="btnline"><button class="btn sm" data-act="xlsx">엑셀(.xlsx)로 내보내기</button>' +
      '<button class="btn ghost sm" data-act="jsonout">JSON 백업</button>' +
      '<button class="btn ghost sm" data-act="jsonin">JSON 가져오기</button></div>' +
      '<p class="hint">엑셀 파일은 거래내역·월간요약·설정·연간추이·자산추이·고정비 6장으로 만들어져요. 엑셀에서도 그대로 열려요.</p></div>');

    out.push('<div class="card"><h2>' + ic('sparkle', 15) + ' 데이터</h2>' +
      '<div class="li"><span class="lb"><span class="nm">거래 ' + S.tx.length + '건</span><span class="sb">' + (S.tx.length ? String(S.tx[0].date) + ' ~ ' + String(S.tx[S.tx.length - 1].date) : '기록 없음') + '</span></span></div>' +
      '<div class="btnline" style="margin-top:8px">' +
      '<button class="btn ghost sm" data-act="seedreload">엑셀 자료 다시 불러오기</button>' +
      '<button class="btn danger sm" data-act="resetall">전체 비우기</button></div>' +
      '<p class="hint">전체 비우기는 되돌릴 수 없어요. 먼저 JSON 백업을 받아 두세요.</p></div>');

    out.push('<p class="tiny muted" style="text-align:center;margin:14px 0 4px">우리집 가계부 v' + APP.version + ' · 엑셀 「1인 가계부 양식」 7시트 구조를 그대로 담았어요<br>값은 이 기기에서 계산되고, 서버로 보내지 않아요</p>');
    return out.join('');
  }

  /* ============================================================
     6. 시트(모달)
     ============================================================ */
  var sheetStack = [];
  function sheet(title, bodyHTML, opts) {
    opts = opts || {};
    var wrap = document.createElement('div');
    wrap.className = 'sheetwrap';
    wrap.innerHTML = '<div class="sheet"><div class="sheethead"><h3>' + esc(title) + '</h3>' +
      '<button class="x" data-close="1" aria-label="닫기">✕</button></div><div class="sheetbody">' + bodyHTML + '</div></div>';
    $('#sheetroot').appendChild(wrap);
    sheetStack.push(wrap);
    requestAnimationFrame(function () { wrap.classList.add('on'); });
    wrap.close = function () {
      wrap.classList.remove('on');
      setTimeout(function () { if (wrap.parentNode) wrap.parentNode.removeChild(wrap); }, 200);
      sheetStack = sheetStack.filter(function (w) { return w !== wrap; });
    };
    wrap.addEventListener('click', function (e) {
      if (e.target === wrap || e.target.getAttribute('data-close')) wrap.close();
    });
    wrap.body = wrap.querySelector('.sheetbody');
    return wrap;
  }

  function st_signVisible(kind) { return kind === '카드할인' || kind === '수입' || kind === '이체'; }

  /* 자주 쓰는 분류를 앞으로 — 한 손 입력에서 찾는 시간을 줄인다 */
  function recentFirst(names) {
    var cnt = {}, i;
    for (i = 0; i < names.length; i++) cnt[names[i]] = 0;
    var since = Core.addMonths(Core.ymOf(Core.todayStr()), -2);
    (S.tx || []).forEach(function (t) {
      if (cnt[t.cat] !== undefined && Core.ymOf(t.date) >= since) cnt[t.cat]++;
    });
    return names.map(function (n, idx) { return { n: n, c: cnt[n], i: idx }; })
      .sort(function (a, b) { return b.c - a.c || a.i - b.i; })
      .map(function (o) { return o.n; });
  }

  /* 다시 그릴 때 화면 위치를 지키고, 새로 펼친 카드가 화면 밖이면 살짝 움직여 줍니다.
     카드가 화면보다 길면(거래가 많은 날) 카드 제목부터 보이게 합니다. */
  function renderKeep(focusSel) {
    var y = window.pageYOffset || window.scrollY || 0;
    render();
    window.scrollTo(0, y);
    if (!focusSel) return;
    var box = $(focusSel);
    if (!box) return;
    var r = box.getBoundingClientRect(), limit = window.innerHeight - 76, top = 62;
    if (r.height > limit - top) {
      if (r.top < top || r.top > limit) window.scrollTo(0, Math.max(0, y + r.top - top));
      return;
    }
    if (r.bottom > limit) window.scrollTo(0, Math.max(0, y + (r.bottom - limit) + 10));
    else if (r.top < top) window.scrollTo(0, Math.max(0, y + r.top - top));
  }

  /* ---------- 거래 입력 ---------- */
  function openTxSheet(tx, dateStr) {
    var editing = !!tx;
    var d = tx ? Object.assign({}, tx) : {
      date: dateStr || Core.todayStr(), kind: '지출', cat: '', item: '', amount: 0,
      method: (S.settings.methods[0] || ''), memo: ''
    };
    var amtStr = String(Math.abs(Core.num(d.amount)) || '');
    var neg = Core.num(d.amount) < 0;

    var html = '' +
      '<div class="field"><label>날짜</label><input type="date" id="fDate" value="' + esc(d.date) + '"></div>' +
      '<div class="field"><label>구분</label><div class="chips" id="fKind">' +
      Core.KINDS.map(function (k) {
        return '<button class="chip' + (d.kind === k ? ' on' : '') + '" data-act="kindpick" data-v="' + k + '">' + kindIcon(k, 13) + ' ' + k + '</button>';
      }).join('') + '</div></div>' +
      '<div class="field"><label id="catLabel">분류</label><div class="chips" id="fCat"></div>' +
      '<p class="hint" id="catHint"></p></div>' +
      '<div class="amountbox"><div class="top"><span>금액</span>' +
      '<button class="chip mini" data-act="signflip" id="signBtn" style="margin-left:auto;' + (st_signVisible(d.kind) ? '' : 'display:none') + '">' + (neg ? '− 마이너스' : '+ 플러스') + '</button></div>' +
      '<div class="val num" id="amtDisp">0<small>원</small></div>' +
      '<div class="quick"><button data-act="quick" data-v="10000">+1만</button><button data-act="quick" data-v="5000">+5천</button>' +
      '<button data-act="quick" data-v="1000">+1천</button><button data-act="quick" data-v="0">지움</button></div>' +
      '<div class="keypad">' +
      ['1', '2', '3', '←', '4', '5', '6', '00', '7', '8', '9', 'C', '0'].map(function (k) {
        var cls = (k === '←' || k === 'C' || k === '00') ? '' : '';
        return '<button class="' + cls + '" data-act="key" data-v="' + k + '">' + k + '</button>';
      }).join('') + '<button data-act="txsave" class="wide" style="background:var(--sage);color:#fff;border-color:var(--sage);font-size:15px">저장</button>' +
      '</div></div>' +
      '<div class="field"><label>항목</label><input type="text" id="fItem" value="' + esc(d.item) + '" placeholder="예: 장보기, 주유비"></div>' +
      '<div class="field" id="fMethodField"><label>결제수단</label><div class="chips" id="fMethod"></div></div>' +
      '<div class="field"><label>메모</label><input type="text" id="fMemo" value="' + esc(d.memo) + '" placeholder="선택 사항"></div>' +
      '<div class="btnrow">' +
      (editing ? '<button class="btn danger" data-act="txdel">삭제</button>' : '') +
      '<button class="btn ghost" data-act="txclose">취소</button>' +
      '<button class="btn" data-act="txsave">저장</button></div>';

    var w = sheet(editing ? '거래 수정' : '빠른 입력', html);
    var st = { d: d, amtStr: amtStr, neg: neg };
    w.state = st;

    function drawCats() {
      var box = $('#fCat', w), hint = $('#catHint', w), label = $('#catLabel', w);
      var kind = st.d.kind;
      var list = [];
      if (kind === '수입') list = S.settings.incCats.slice();
      else if (kind === '이체' || kind === '카드할인') list = [];
      else list = recentFirst(S.settings.expCats.map(function (c) { return c.name; }));
      label.textContent = kind === '수입' ? '수입 분류' : '분류';
      if (!list.length) {
        box.innerHTML = '<span class="tiny muted">' + (kind === '이체' ? '이체는 내 계좌끼리 옮긴 돈이라 분류가 없어요.' : '카드할인은 분류를 비워 두세요. 음수로 넣으면 청구액에서 빠져요.') + '</span>';
        hint.textContent = '';
        return;
      }
      if (kind === '지출' || kind === '할부') {
        if (st.d.cat && list.indexOf(st.d.cat) < 0) list = list.concat([st.d.cat]);
      }
      box.innerHTML = list.map(function (c) {
        return '<button class="chip' + (st.d.cat === c ? ' on' : '') + '" data-act="catpick" data-v="' + esc(c) + '">' + esc(c) + '</button>';
      }).join('');
      hint.textContent = kind === '수입' ? '수입 분류는 설정에서 관리해요' : '';
    }
    function drawMethods() {
      var box = $('#fMethodField', w);
      if (box) box.style.display = st.d.kind === '수입' ? 'none' : '';
      $('#fMethod', w).innerHTML = S.settings.methods.map(function (m) {
        return '<button class="chip' + (st.d.method === m ? ' on' : '') + '" data-act="methodpick" data-v="' + esc(m) + '">' + esc(m) + '</button>';
      }).join('');
    }
    function drawAmount() {
      var show = st.amtStr ? Core.money(st.amtStr) : '0';
      $('#amtDisp', w).innerHTML = (st.neg ? '−' : '') + show + '<small>원</small>';
      var sb = $('#signBtn', w);
      if (sb) { sb.textContent = st.neg ? '− 마이너스' : '+ 플러스'; sb.style.display = st_signVisible(st.d.kind) ? '' : 'none'; }
    }
    drawCats(); drawMethods(); drawAmount();

    w.handlers = {
      kind: function (v) {
        st.d.kind = v;
        if (v === '카드할인') { st.neg = true; if (!st.d.method) st.d.method = S.settings.methods[0] || ''; }
        else if (v === '수입') { st.neg = false; st.d.method = ''; }
        else if (!st.d.method) st.d.method = S.settings.methods[0] || '';
        if (v === '이체' || v === '카드할인') st.d.cat = '';
        else if (S.settings.expCats.map(function (c) { return c.name; }).indexOf(st.d.cat) < 0 && S.settings.incCats.indexOf(st.d.cat) < 0) st.d.cat = '';
        $$('#fKind .chip', w).forEach(function (b) { b.classList.toggle('on', b.getAttribute('data-v') === v); });
        drawCats(); drawMethods(); drawAmount();
      },
      cat: function (v) { st.d.cat = (st.d.cat === v ? '' : v); drawCats(); },
      method: function (v) { st.d.method = v; drawMethods(); },
      sign: function () { st.neg = !st.neg; drawAmount(); },
      key: function (k) {
        if (k === 'C') st.amtStr = '';
        else if (k === '←') st.amtStr = st.amtStr.slice(0, -1);
        else if (k === '00') { if (st.amtStr) st.amtStr += '00'; }
        else { if (st.amtStr.length < 10) st.amtStr = (st.amtStr === '0' ? '' : st.amtStr) + k; }
        drawAmount();
      },
      quick: function (v) {
        if (v === '0') { st.amtStr = ''; drawAmount(); return; }
        var cur = Core.num(st.amtStr);
        st.amtStr = String(cur + Core.num(v));
        drawAmount();
      },
      save: function () {
        var date = $('#fDate', w).value || Core.todayStr();
        var item = $('#fItem', w).value.trim();
        var memo = $('#fMemo', w).value.trim();
        var amt = Core.num(st.amtStr);
        if (!amt) { toast('금액을 입력해 주세요'); return; }
        var amount = st.neg ? -amt : amt;
        var method = (st.d.kind === '수입') ? '' : st.d.method;
        if (editing) {
          var i = S.tx.findIndex(function (t) { return t.id === d.id; });
          if (i >= 0) S.tx[i] = { id: d.id, date: date, kind: st.d.kind, cat: st.d.cat, item: item, amount: amount, method: method, memo: memo };
        } else {
          S.tx.push({ id: uid(), date: date, kind: st.d.kind, cat: st.d.cat, item: item, amount: amount, method: method, memo: memo });
          ui.ym = Core.ymOf(date);
          ui.selDate = date; ui.selWeek = null;   // 달력에서 방금 적은 날을 바로 보여 줌
        }
        save();
        w.close();
        haptic(12);
        toast(editing ? '고쳤어요' : '저장했어요 · ' + Core.signedWon(amount));
      },
      del: function () {
        if (!window.confirm('이 거래를 지울까요?\n' + (d.item || '') + ' ' + Core.money(d.amount) + '원')) return;
        S.tx = S.tx.filter(function (t) { return t.id !== d.id; });
        save(); w.close(); toast('지웠어요');
      },
      close: function () { w.close(); }
    };
  }

  /* ---------- 분류·결제수단 관리 ---------- */
  function openCatSheet() {
    function draw(w) {
      var st = w.catState;
      var html = '<div class="seg" style="margin-bottom:10px">' +
        [['exp', '지출 ' + S.settings.expCats.length], ['inc', '수입 ' + S.settings.incCats.length], ['meth', '결제수단 ' + S.settings.methods.length]].map(function (x) {
          return '<button class="' + (st.seg === x[0] ? 'on' : '') + '" data-act="catseg" data-v="' + x[0] + '">' + x[1] + '</button>';
        }).join('') + '</div>';
      html += '<div class="rows">';
      var list = st.seg === 'exp' ? S.settings.expCats.map(function (c) { return c.name; }) : st.seg === 'inc' ? S.settings.incCats : S.settings.methods;
      if (!list.length) html += '<div class="empty">아직 없어요. 아래에서 추가해 보세요</div>';
      list.forEach(function (n, i) {
        html += '<div class="li"><span class="lb"><span class="nm">' + esc(n) + '</span>' +
          (st.seg === 'exp' ? '<span class="sb">예산 ' + (Core.num(S.settings.expCats[i].budget) ? Core.money(S.settings.expCats[i].budget) + '원' : '미설정') + '</span>' : '') +
          '</span><span class="mv">' +
          '<button data-act="catedit" data-v="' + esc(n) + '" aria-label="이름 바꾸기">✏️</button>' +
          '<button data-act="catup" data-v="' + esc(n) + '" aria-label="위로">↑</button>' +
          '<button data-act="catdown" data-v="' + esc(n) + '" aria-label="아래로">↓</button>' +
          '<button data-act="catdel" data-v="' + esc(n) + '" aria-label="삭제">🗑️</button></span></div>';
      });
      html += '</div>';
      html += '<div class="field" style="margin-top:12px"><label>새 ' + (st.seg === 'meth' ? '결제수단' : '분류') + ' 추가</label>' +
        '<div style="display:flex;gap:6px"><input type="text" id="catNew" placeholder="이름" style="flex:1">' +
        '<button class="btn sm" data-act="catadd" style="flex:0 0 auto">추가</button></div></div>';
      html += '<p class="hint">' + (st.seg === 'exp' ? '지출 분류는 25개 이상도 괜찮아요. 위에서부터 순서대로 입력·선택 목록에 나와요.' : '이름을 바꾸면 이미 적은 거래의 이름은 그대로예요.') + '</p>';
      return html;
    }
    var w = sheet('분류 · 결제수단', '', {});
    w.catState = { seg: 'exp' };
    w.redraw = function () { w.body.innerHTML = draw(w); };
    w.redraw();
  }

  /* ---------- 예산 ---------- */
  function openBudgetSheet() {
    var html = '<p class="hint" style="margin-top:0">분류마다 월 예산을 넣으면 월간요약에 사용률 막대가 그려져요. 0이면 표시하지 않아요.</p><div class="rows">';
    html += S.settings.expCats.map(function (c, i) {
      return '<div class="li"><span class="lb"><span class="nm">' + esc(c.name) + '</span></span>' +
        '<input type="number" inputmode="numeric" class="budin" data-i="' + i + '" value="' + (Core.num(c.budget) || '') + '" placeholder="0" style="width:104px;text-align:right;border:1px solid var(--line);border-radius:10px;padding:7px 9px;font-size:14px;font-variant-numeric:tabular-nums"></div>';
    }).join('') + '</div>' +
      '<button class="btn" data-act="budsave" style="margin-top:12px">예산 저장</button>';
    sheet('분류별 월 예산', html);
  }

  /* ---------- 자산 입력 ---------- */
  function openAssetSheet(ym) {
    ym = ym || ui.ym;
    var cols = S.settings.assetCols || [], a = S.assets[ym] || { v: [], debt: 0 };
    var html = '<div class="field"><label>연월</label><input type="text" id="aYm" value="' + esc(ym) + '" placeholder="2026-11" inputmode="numeric"></div>';
    html += cols.map(function (c, i) {
      return '<div class="field"><label>' + esc(c) + '</label><input type="number" inputmode="numeric" class="av" data-i="' + i + '" value="' + (Core.num((a.v || [])[i]) || '') + '" placeholder="0"></div>';
    }).join('');
    html += '<div class="field"><label>대출·부채</label><input type="number" inputmode="numeric" id="aDebt" value="' + (Core.num(a.debt) || '') + '" placeholder="0"></div>';
    html += '<div class="btnrow"><button class="btn ghost" data-close="1">취소</button><button class="btn" data-act="assetsave" data-v="' + esc(ym) + '">저장</button></div>';
    html += '<p class="hint">총자산·순자산·전월 대비·그 달 수지는 자동으로 계산돼요.</p>';
    sheet('자산 적기 · ' + ym, html);
  }

  /* ---------- 자산 항목명 ---------- */
  function openAssetColsSheet() {
    var cols = S.settings.assetCols || [];
    var html = cols.map(function (c, i) {
      return '<div class="field"><label>항목 ' + (i + 1) + '</label><input type="text" class="colin" data-i="' + i + '" value="' + esc(c) + '"></div>';
    }).join('');
    html += '<div class="field"><label>시작 연월</label><input type="text" id="aStart" value="' + esc(S.settings.assetStart || '') + '" placeholder="2026-04"></div>';
    html += '<div class="btnrow"><button class="btn ghost" data-close="1">취소</button><button class="btn" data-act="colsave">저장</button></div>';
    sheet('자산 항목명 편집', html);
  }

  /* ---------- 고정비 입력 ---------- */
  function openFixedSheet(f) {
    var editing = !!f;
    var d = f ? Object.assign({}, f) : { item: '', cat: (S.settings.expCats[0] || {}).name || '', amount: 0, method: S.settings.methods[0] || '', day: '', memo: '' };
    var html = '<div class="field"><label>항목</label><input type="text" id="xItem" value="' + esc(d.item) + '" placeholder="예: 월세, 넷플릭스"></div>' +
      '<div class="field"><label>분류</label><div class="chips">' + S.settings.expCats.map(function (c) {
        return '<button class="chip' + (d.cat === c.name ? ' on' : '') + '" data-act="xcat" data-v="' + esc(c.name) + '">' + esc(c.name) + '</button>';
      }).join('') + '</div></div>' +
      '<div class="field"><label>금액</label><input type="number" inputmode="numeric" id="xAmount" value="' + (Core.num(d.amount) || '') + '" placeholder="0"></div>' +
      '<div class="field"><label>결제수단</label><div class="chips">' + S.settings.methods.map(function (m) {
        return '<button class="chip' + (d.method === m ? ' on' : '') + '" data-act="xmethod" data-v="' + esc(m) + '">' + esc(m) + '</button>';
      }).join('') + '</div></div>' +
      '<div class="field"><label>결제일</label><input type="number" inputmode="numeric" id="xDay" value="' + esc(d.day || '') + '" placeholder="예: 25"></div>' +
      '<div class="field"><label>메모</label><input type="text" id="xMemo" value="' + esc(d.memo) + '" placeholder="선택 사항"></div>' +
      '<div class="btnrow">' + (editing ? '<button class="btn danger" data-act="xdel">삭제</button>' : '') +
      '<button class="btn ghost" data-close="1">취소</button><button class="btn" data-act="xsave">저장</button></div>';
    var w = sheet(editing ? '고정비 수정' : '고정비 추가', html);
    w.state = { d: d };
  }

  /* ---------- PIN ---------- */
  function openPinSheet(mode) {
    var html = '<p class="hint" style="margin-top:0">' + (mode === 'change' ? '지금 쓰는 PIN을 확인한 뒤 새 PIN을 정해요.' : '4자리 숫자를 정하면 앱을 열 때 물어봐요.') + '</p>' +
      (mode === 'change' ? '<div class="field"><label>지금 PIN</label><input type="password" inputmode="numeric" maxlength="4" id="pinOld" placeholder="••••"></div>' : '') +
      '<div class="field"><label>새 PIN</label><input type="password" inputmode="numeric" maxlength="4" id="pinNew" placeholder="••••"></div>' +
      '<div class="field"><label>새 PIN 확인</label><input type="password" inputmode="numeric" maxlength="4" id="pinNew2" placeholder="••••"></div>' +
      '<div class="btnrow"><button class="btn ghost" data-close="1">취소</button><button class="btn" data-act="pinsave" data-v="' + (mode || 'set') + '">저장</button></div>' +
      '<p class="hint">PIN은 SHA-256 해시로만 저장해요. 잊어버리면 이 기기의 데이터는 그대로 두고 PIN만 새로 정할 수 있어요.</p>';
    sheet(mode === 'change' ? 'PIN 바꾸기' : 'PIN 정하기', html);
  }

  /* ---------- 클라우드 상태 ---------- */
  function openCloudSheet() {
    var html;
    if (!cloudConfigured()) {
      html = '<p class="hint" style="margin-top:0">지금은 <b>이 기기에만</b> 저장하고 있어요. 데이터는 폰의 localStorage에 있고, 밖으로 나가지 않아요.</p>' +
        '<div class="li"><span class="lb"><span class="nm">클라우드 동기화</span><span class="sb">아직 설정하지 않았어요</span></span><span class="rt"><span class="badge n">LOCAL</span></span></div>' +
        '<p class="hint">다음 단계에서 Firebase 설정을 넣으면 폰·PC가 같은 가계부를 보고, 앱을 지웠다 깔아도 그대로 남아요. 그때 주소와 규칙은 index.html 맨 위 <b>CLOUD</b> 한 곳만 채우면 돼요.</p>';
    } else if (ui.cloudState === 'signed-out') {
      html = '<p class="hint" style="margin-top:0">가계부 전용 계정으로 로그인하면 다른 기기와 맞춰져요.</p>' +
        '<div class="field"><label>이메일</label><input type="text" id="cEmail" value="' + esc(CLOUD.ACCOUNT) + '" placeholder="you@example.com" autocomplete="username"></div>' +
        '<div class="field"><label>비밀번호</label><input type="password" id="cPw" placeholder="••••••••" autocomplete="current-password"></div>' +
        '<button class="btn" data-act="cloudlogin">로그인</button>';
    } else {
      html = '<div class="li"><span class="lb"><span class="nm">' + (ui.cloudState === 'live' ? '연결됨' : '연결 중…') + '</span>' +
        '<span class="sb">' + esc(CLOUD.DB_ROOT) + ' · ' + esc(CLOUD.firebaseConfig.projectId || '') + '</span></span>' +
        '<span class="rt"><span class="badge ' + (ui.cloudState === 'live' ? 'ok' : 'n') + '">' + ui.cloudState.toUpperCase() + '</span></span></div>' +
        '<p class="hint">바꾼 내용은 자동으로 저장되고, 다른 기기의 변경도 바로 들어와요.</p>' +
        '<div class="btnline"><button class="btn ghost sm" data-act="cloudsignout">다른 계정으로 로그인</button></div>';
    }
    sheet('저장 · 동기화', html);
  }

  /* ============================================================
     7. 엑셀 / JSON
     ============================================================ */
  function loadScriptOnce(src) {
    return new Promise(function (res, rej) {
      var s = document.createElement('script');
      s.src = src; s.async = true; s.onload = function () { res(); }; s.onerror = function () { rej(new Error(src)); };
      document.head.appendChild(s);
    });
  }
  var XLSX_CDNS = [
    'https://cdn.sheetjs.com/xlsx-0.20.3/package/dist/xlsx.full.min.js',
    'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js'
  ];
  function ensureXLSX() {
    if (window.XLSX) return Promise.resolve(window.XLSX);
    return XLSX_CDNS.reduce(function (p, url) {
      return p.catch(function () { return loadScriptOnce(url); });
    }, Promise.reject(new Error('start'))).then(function () {
      if (!window.XLSX) throw new Error('no-xlsx');
      return window.XLSX;
    });
  }
  function exportXlsx() {
    toast('엑셀 파일을 만드는 중…');
    ensureXLSX().then(function (XLSX) {
      var wb = XLSX.utils.book_new();
      var ym = ui.ym, st = Core.stats(S, ym);

      /* 거래내역 */
      var aoa = [['날짜', '연월', '구분', '분류', '항목', '금액', '결제수단', '메모']];
      S.tx.slice().sort(function (a, b) { return a.date < b.date ? -1 : a.date > b.date ? 1 : 0; }).forEach(function (t) {
        aoa.push([t.date, Core.ymOf(t.date), t.kind, t.cat, t.item, Core.num(t.amount), t.kind === '수입' ? '' : t.method, t.memo]);
      });
      XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(aoa), '거래내역');

      /* 월간요약 */
      var cats = Core.catSummary(S, ym, { all: true }), ms = Core.methodSummary(S, ym);
      var sum = [['월간요약', ym], [],
        ['이번 달 수입', st.income], ['실질 지출 (지출+할부+카드할인)', st.real], ['이번 달 수지', st.balance],
        ['저축률', st.saveRate === null ? '' : st.saveRate], ['이체 (합계 제외)', st.transfer],
        ['순자산 (자산추이)', (Core.latestNetWorth(S, ym) || {}).net || ''], [],
        ['지출 분류', '이번 달', '전월', '증감', '월 예산', '사용률']];
      cats.forEach(function (r) { sum.push([r.name, r.now, r.prev, r.diff, r.budget || '', r.useRate === null ? '' : r.useRate]); });
      sum.push([], ['결제수단', '사용액', '카드할인', '청구액']);
      ms.rows.forEach(function (r) { sum.push([r.name, r.used, r.discount, r.billed]); });
      sum.push(['합계', ms.total.used, ms.total.discount, ms.total.billed]);
      XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(sum), '월간요약');

      /* 설정 */
      var set = [['설정'], ['지출 분류', '월 예산', '', '수입 분류', '', '결제수단', '', '목표 저축률', Core.num(S.settings.targetRate)]];
      var maxN = Math.max(S.settings.expCats.length, S.settings.incCats.length, S.settings.methods.length);
      for (var i = 0; i < maxN; i++) {
        var e = S.settings.expCats[i], inc = S.settings.incCats[i], me = S.settings.methods[i];
        set.push([e ? e.name : '', e ? Core.num(e.budget) || '' : '', '', inc || '', '', me || '']);
      }
      XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(set), '설정');

      /* 연간추이 */
      var yrs = Core.yearsInData(S), yr = [['연도', ui.year], [], ['월', '수입', '실질 지출', '수지', '저축률']];
      var yt = Core.yearTable(S, ui.year);
      yt.rows.forEach(function (r) { yr.push([r.label, r.income, r.real, r.balance, r.saveRate === null ? '' : r.saveRate]); });
      yr.push(['합계', yt.total.income, yt.total.real, yt.total.balance, yt.total.saveRate === null ? '' : yt.total.saveRate], []);
      yr.push(['분류별 연간 지출']);
      Core.yearCatTotals(S, ui.year).forEach(function (r) { yr.push([r.name, r.total]); });
      XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(yr), '연간추이');

      /* 자산추이 */
      var cols = S.settings.assetCols || [];
      var aa = [['자산추이', '시작 ' + (S.settings.assetStart || '')], [],
        ['연월'].concat(cols).concat(['총자산', '대출·부채', '순자산', '전월 대비', '그 달 수지'])];
      Core.assetSeries(S).forEach(function (r) {
        aa.push([r.ym].concat(r.parts.map(function (p) { return p.value; })).concat([r.total, r.debt, r.net, r.delta === null ? '' : r.delta, r.monthBalance]));
      });
      XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(aa), '자산추이');

      /* 고정비 */
      var fx = [['고정비'], ['항목', '분류', '금액', '결제수단', '결제일', '메모']];
      S.fixed.forEach(function (f) { fx.push([f.item, f.cat, Core.num(f.amount), f.method, f.day || '', f.memo]); });
      fx.push(['합계', '', S.fixed.reduce(function (s, f) { return s + (f.ex ? 0 : Core.num(f.amount)); }, 0)]);
      XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(fx), '고정비');

      var name = '가계부_' + Core.todayStr().replace(/-/g, '') + '.xlsx';
      XLSX.writeFile(wb, name);
      toast('엑셀 파일을 내려받았어요');
    }).catch(function () {
      toast('엑셀 도구를 불러오지 못했어요 (인터넷 확인)');
    });
  }
  function download(name, text, type) {
    try {
      var blob = new Blob([text], { type: type || 'application/json' });
      var a = document.createElement('a');
      a.href = URL.createObjectURL(blob); a.download = name;
      document.body.appendChild(a); a.click();
      setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 1500);
    } catch (e) { toast('내려받기를 지원하지 않는 화면이에요'); }
  }

  /* ============================================================
     8. 잠금 화면
     ============================================================ */
  var lockPin = '';
  function showLock() {
    var el = $('#lock'); el.classList.add('on'); lockPin = '';
    drawLock();
  }
  function drawLock() {
    var el = $('#lock');
    el.innerHTML = '<div class="lk-ic">' + ic('lock', 34) + '</div><h2>우리집 가계부</h2><p>4자리 PIN을 눌러 주세요</p>' +
      '<div class="dots">' + [0, 1, 2, 3].map(function (i) { return '<i class="' + (i < lockPin.length ? 'f' : '') + '"></i>'; }).join('') + '</div>' +
      '<div class="err" id="lockErr"></div>' +
      '<div class="keypad">' + ['1', '2', '3', '4', '5', '6', '7', '8', '9', '←', '0', 'C'].map(function (k) {
        return '<button data-act="lockkey" data-v="' + k + '">' + k + '</button>';
      }).join('') + '</div>';
  }
  function lockKey(k) {
    if (Date.now() < ui.lockUntil) {
      $('#lockErr').textContent = '조금 뒤에 다시 시도해 주세요';
      return;
    }
    if (k === 'C') { lockPin = ''; drawLock(); return; }
    if (k === '←') { lockPin = lockPin.slice(0, -1); drawLock(); return; }
    if (lockPin.length >= APP.PIN_LEN) return;
    lockPin += k;
    drawLock();
    if (lockPin.length === APP.PIN_LEN) checkLock();
  }
  async function checkLock() {
    var rec = S.auth || {};
    var digest = await pinDigest(lockPin, rec.salt || '');
    if (digest === rec.pinHash) {
      ui.lockFail = 0;
      ui.pinPassed = true;
      $('#lock').classList.remove('on');
      $('#lock').innerHTML = '';
      lockPin = '';
      toast('반가워요 👋');
    } else {
      ui.lockFail++;
      lockPin = '';
      drawLock();
      if (ui.lockFail >= APP.PIN_MAX_FAIL) {
        ui.lockUntil = Date.now() + APP.PIN_COOL_MS; ui.lockFail = 0;
        $('#lockErr').textContent = '5번 틀렸어요 · 15초 뒤에 다시';
        setTimeout(function () { $('#lockErr').textContent = ''; }, APP.PIN_COOL_MS);
      } else {
        $('#lockErr').textContent = 'PIN이 맞지 않아요 (' + ui.lockFail + '/' + APP.PIN_MAX_FAIL + ')';
      }
      haptic(30);
    }
  }

  /* ============================================================
     9. 이벤트
     ============================================================ */
  function bindEvents() {
    document.addEventListener('click', function (e) {
      var el = e.target.closest ? e.target.closest('[data-act]') : null;
      if (!el) return;
      var act = el.getAttribute('data-act'), v = el.getAttribute('data-v');
      var w = el.closest('.sheetwrap');
      if (w && w.handlers && ['kindpick', 'catpick', 'methodpick', 'signflip', 'key', 'quick', 'txsave', 'txdel', 'txclose'].indexOf(act) >= 0) {
        var h = w.handlers;
        if (act === 'kindpick') h.kind(v);
        else if (act === 'catpick') h.cat(v);
        else if (act === 'methodpick') h.method(v);
        else if (act === 'signflip') h.sign();
        else if (act === 'key') h.key(v);
        else if (act === 'quick') h.quick(v);
        else if (act === 'txsave') h.save();
        else if (act === 'txdel') h.del();
        else if (act === 'txclose') h.close();
        return;
      }
      ACT[act] && ACT[act](v, el, e);
    });

    document.addEventListener('change', function (e) {
      var t = e.target;
      if (t.id === 'q') { /* handled on input */ }
      if (t.getAttribute && t.getAttribute('data-act') === 'fcat') { ui.fCat = t.value; render(); }
      if (t.getAttribute && t.getAttribute('data-act') === 'fmethod') { ui.fMethod = t.value; render(); }
    });
    document.addEventListener('input', function (e) {
      var t = e.target;
      if (t.id === 'q') {
        ui.q = t.value;
        var pos = t.selectionStart;
        render();
        var q = $('#q'); if (q) { q.focus(); try { q.setSelectionRange(pos, pos); } catch (err) {} }
      }
    });
    try {
      if (window.BroadcastChannel) {
        var ch = new BroadcastChannel(APP.BCAST);
        ch.onmessage = function (m) {
          if (m.data && m.data.t === 'patch') {
            var fresh = loadLocal();
            if (fresh) { S = fresh; render(); }
          }
        };
      }
    } catch (e) {}
    /* 첫 접속 로그인 화면 */
    var gb = $('#gateBtn');
    if (gb) gb.addEventListener('click', function (e) { e.preventDefault(); gateSubmit(); });
    ['#gateEmail', '#gatePw'].forEach(function (sel) {
      var i = $(sel);
      if (i) i.addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); gateSubmit(); } });
    });
  }

  var ACT = {
    tab: function (v) { ui.tab = v; if (v === 'trend') ui.year = parseInt(ui.ym.slice(0, 4), 10); render(); },
    mon: function (v) { ui.ym = Core.addMonths(ui.ym, parseInt(v, 10)); ui.openCats = {}; ui.openMethods = {}; ui.openDonut = {}; ui.selDate = ''; ui.selWeek = null; render(); },
    today: function () { ui.ym = Core.ymOf(Core.todayStr()); ui.openCats = {}; ui.openMethods = {}; ui.openDonut = {}; ui.selDate = ''; ui.selWeek = null; render(); },
    /* 거래 탭: 한달 달력 ↔ 내역 목록 */
    listseg: function (v) { ui.listView = v; render(); },
    gocal: function () { ui.tab = 'list'; ui.listView = 'cal'; ui.selDate = ''; ui.selWeek = null; render(); },
    calsel: function (v) {
      ui.selWeek = null;
      ui.selDate = (ui.selDate === v ? '' : v);
      renderKeep(ui.selDate ? '.daycard' : '');
    },
    calweek: function (v) {
      var n = parseInt(v, 10);
      ui.selDate = '';
      ui.selWeek = (ui.selWeek === n ? null : n);
      renderKeep(ui.selWeek ? '.daycard' : '');
    },
    caladd: function (v) { openTxSheet(null, v); },
    catall: function () { ui.catAll = !ui.catAll; render(); },
    'sum-cat': function (v, el) { toggleSumRow('openCats', el.getAttribute('data-cat'), 'sum-cat', 'data-cat'); },
    'donut-cat': function (v, el) { toggleSumRow('openDonut', el.getAttribute('data-cat'), 'donut-cat', 'data-cat'); },
    'sum-method': function (v, el) { toggleSumRow('openMethods', el.getAttribute('data-method'), 'sum-method', 'data-method'); },
    year: function (v) { ui.year += parseInt(v, 10); render(); },
    yearnow: function () { ui.year = new Date().getFullYear(); render(); },
    tseg: function (v) { ui.trendSeg = v; render(); },
    txnew: function () { openTxSheet(null); },
    txopen: function (id) { var t = S.tx.find(function (x) { return x.id === id; }); if (t) openTxSheet(t); },
    fkind: function (v) { ui.fKind = v; render(); },
    fclear: function () { ui.q = ''; ui.fKind = ''; ui.fCat = ''; ui.fMethod = ''; render(); },

    /* 분류·결제수단 관리 */
    catsheet: function () { openCatSheet(); },
    catseg: function (v, el) { var w = el.closest('.sheetwrap'); w.catState.seg = v; w.redraw(); },
    catadd: function (v, el) {
      var w = el.closest('.sheetwrap'), inp = $('#catNew', w), name = (inp.value || '').trim();
      if (!name) { toast('이름을 적어 주세요'); return; }
      var seg = w.catState.seg;
      if (seg === 'exp') { if (S.settings.expCats.some(function (c) { return c.name === name; })) return toast('이미 있어요'); S.settings.expCats.push({ name: name, budget: 0 }); }
      else if (seg === 'inc') { if (S.settings.incCats.indexOf(name) >= 0) return toast('이미 있어요'); S.settings.incCats.push(name); }
      else { if (S.settings.methods.indexOf(name) >= 0) return toast('이미 있어요'); S.settings.methods.push(name); }
      save({ render: false }); w.redraw(); toast('추가했어요');
    },
    catedit: function (v, el) {
      var w = el.closest('.sheetwrap'), seg = w.catState.seg;
      var name = window.prompt('새 이름', v);
      if (name === null) return;
      name = name.trim(); if (!name || name === v) return;
      if (seg === 'exp') { var c = S.settings.expCats.find(function (x) { return x.name === v; }); if (c) c.name = name; }
      else if (seg === 'inc') { var i = S.settings.incCats.indexOf(v); if (i >= 0) S.settings.incCats[i] = name; }
      else { var j = S.settings.methods.indexOf(v); if (j >= 0) S.settings.methods[j] = name; }
      save({ render: false }); w.redraw();
    },
    catdel: function (v, el) {
      var w = el.closest('.sheetwrap'), seg = w.catState.seg;
      if (!window.confirm('"' + v + '" 을(를) 목록에서 지울까요?\n이미 적은 거래의 이름은 그대로 남아요.')) return;
      if (seg === 'exp') S.settings.expCats = S.settings.expCats.filter(function (c) { return c.name !== v; });
      else if (seg === 'inc') S.settings.incCats = S.settings.incCats.filter(function (x) { return x !== v; });
      else S.settings.methods = S.settings.methods.filter(function (x) { return x !== v; });
      save({ render: false }); w.redraw();
    },
    catup: function (v, el) { moveItem(el.closest('.sheetwrap').catState.seg, v, -1, el); },
    catdown: function (v, el) { moveItem(el.closest('.sheetwrap').catState.seg, v, 1, el); },

    /* 예산 */
    budgetsheet: function () { openBudgetSheet(); },
    budsave: function (v, el) {
      var w = el.closest('.sheetwrap');
      $$('.budin', w).forEach(function (inp) {
        var i = parseInt(inp.getAttribute('data-i'), 10);
        if (S.settings.expCats[i]) S.settings.expCats[i].budget = Core.num(inp.value);
      });
      save(); w.close(); toast('예산을 저장했어요'); render();
    },
    targetset: function () {
      var cur = Math.round(Core.num(S.settings.targetRate) * 100);
      var v = window.prompt('목표 저축률 (%)', String(cur));
      if (v === null) return;
      var n = Core.num(v); if (n < 0 || n > 100) { toast('0~100 사이로 적어 주세요'); return; }
      S.settings.targetRate = n / 100; save(); toast('목표를 ' + n + '%로 했어요');
    },
    monthbudget: function () {
      var v = window.prompt('월 전체 예산 (원)', String(S.settings.monthBudget || ''));
      if (v === null) return;
      S.settings.monthBudget = Core.num(v); save(); toast('저장했어요');
    },

    /* 자산 */
    assetmon: function () { openAssetSheet(ui.ym); },
    assetopen: function (ym) { openAssetSheet(ym); },
    assetsave: function (v, el) {
      var w = el.closest('.sheetwrap');
      var ym = ($('#aYm', w).value || '').trim();
      if (!/^\d{4}-\d{2}$/.test(ym)) { toast('연월을 2026-11 처럼 적어 주세요'); return; }
      var vals = $$('.av', w).map(function (i) { return Core.num(i.value); });
      S.assets[ym] = { v: vals, debt: Core.num($('#aDebt', w).value) };
      var start = S.settings.assetStart;
      if (!start || ym < start) S.settings.assetStart = ym;
      save(); w.close(); toast(ym + ' 자산을 저장했어요');
    },
    assetcols: function () { openAssetColsSheet(); },
    colsave: function (v, el) {
      var w = el.closest('.sheetwrap');
      S.settings.assetCols = $$('.colin', w).map(function (i) { return i.value.trim() || '항목'; });
      var st = ($('#aStart', w).value || '').trim();
      if (/^\d{4}-\d{2}$/.test(st)) S.settings.assetStart = st;
      save(); w.close(); toast('항목명을 저장했어요');
    },
    assetclear: function () {
      if (!window.confirm('엑셀에 있던 예시 자산 숫자를 지울까요?\n(직접 적은 숫자도 함께 지워져요)')) return;
      Object.keys(S.assets).forEach(function (k) { if (S.assets[k].ex) delete S.assets[k]; });
      save(); toast('예시 자산을 지웠어요');
    },

    /* 고정비 */
    fixednew: function () { openFixedSheet(null); },
    fixededit: function (id) { var f = S.fixed.find(function (x) { return x.id === id; }); if (f) openFixedSheet(f); },
    fixeddel: function (id) {
      var f = S.fixed.find(function (x) { return x.id === id; });
      if (!f || !window.confirm('"' + f.item + '"을(를) 고정비 목록에서 완전히 지울까요?\n(이번 달 거래내역은 그대로 남고, 목록에서만 사라져요)')) return;
      S.fixed = S.fixed.filter(function (x) { return x.id !== id; }); save(); toast('고정비 목록에서 지웠어요');
    },
    fixedclear: function () {
      S.fixed = S.fixed.filter(function (f) { return !f.ex; }); save(); toast('예시 고정비를 지웠어요');
    },
    fixedput: function (id) {
      var f = S.fixed.find(function (x) { return x.id === id; });
      if (!f) return;
      if (Core.num(f.amount) <= 0) { toast('금액을 먼저 적어 주세요'); return; }
      var mm = ui.ym.slice(5, 7), p = null;
      Core.fixedPlan(S, ui.ym).forEach(function (x) { if (x.f.id === id) p = x; });
      if (p && p.dup) { toast('이번 달엔 이미 들어가 있어요'); return; }
      var dim = Core.daysInMonth(ui.ym), day = Math.min(dim, Math.max(1, parseInt(f.day, 10) || 1));
      S.tx.push({ id: uid(), fixedId: f.id, date: ui.ym + '-' + (day < 10 ? '0' + day : day), kind: '지출', cat: f.cat,
        item: f.item, amount: Core.num(f.amount), method: f.method, memo: f.memo || '고정비' });
      save(); toast((f.item || '고정비') + ' ' + Core.money(f.amount) + '원을 ' + mm + '월에 넣었어요');
    },
    fixedtake: function (id) {
      var mm = ui.ym.slice(5, 7), p = null;
      Core.fixedPlan(S, ui.ym).forEach(function (x) { if (x.f.id === id) p = x; });
      if (!p || !p.dupTx) { toast('이번 달에 들어간 항목이 아니에요'); return; }
      var msg = p.zero
        ? '"' + p.f.item + '"의 0원 거래를 ' + mm + '월 거래내역에서 뺄까요?'
        : '"' + p.f.item + '"을(를) ' + mm + '월 거래내역에서 뺄까요?\n(고정비 목록에는 그대로 남아요)';
      if (!window.confirm(msg)) return;
      var t = p.dupTx;
      S.tx = S.tx.filter(function (x) { return x !== t; });
      save(); toast('1건을 ' + mm + '월에서 뺐어요');
    },
    fixedapply: function () {
      var plan = Core.fixedPlan(S, ui.ym);
      var adds = plan.filter(function (p) { return !p.ex && !p.zero && !p.dup; });
      var dups = plan.filter(function (p) { return !p.ex && p.dup; }).length;
      var zeros = plan.filter(function (p) { return !p.ex && p.zero; }).length;
      if (!adds.length) { toast(dups ? '이번 달엔 이미 다 넣었어요' : '넣을 고정비가 없어요'); return; }
      var sum = adds.reduce(function (s, p) { return s + Core.num(p.f.amount); }, 0);
      if (!window.confirm(ui.ym + ' 거래내역에 ' + adds.length + '건(' + Core.money(sum) + '원)을 넣을까요?' +
        (dups ? '\n이미 넣은 ' + dups + '건은 건너뜁니다.' : '') +
        (zeros ? '\n금액이 비어 있는 ' + zeros + '건은 빼고 넣어요.' : ''))) return;
      var dim = Core.daysInMonth(ui.ym);
      adds.forEach(function (p) {
        var f = p.f, day = Math.min(dim, Math.max(1, parseInt(f.day, 10) || 1));
        S.tx.push({ id: uid(), fixedId: f.id, date: ui.ym + '-' + (day < 10 ? '0' + day : day), kind: '지출', cat: f.cat,
          item: f.item, amount: Core.num(f.amount), method: f.method, memo: f.memo || '고정비' });
      });
      save(); toast(adds.length + '건을 넣었어요');
    },
    fixedunapply: function () {
      var plan = Core.fixedPlan(S, ui.ym), mm = ui.ym.slice(5, 7);
      var dups = plan.filter(function (p) { return !p.ex && p.dupTx; });
      if (!dups.length) { toast('이번 달에서 뺄 고정비가 없어요'); return; }
      var sum = dups.reduce(function (s, p) { return s + Core.num(p.f.amount); }, 0);
      if (!window.confirm(ui.ym + ' 거래내역에서 이번 달에 들어간 고정비 ' + dups.length + '건(' + Core.money(sum) + '원)을 뺄까요?\n(고정비 목록은 남고 이번 달 거래내역에서만 빠져요)')) return;
      var set = dups.map(function (p) { return p.dupTx; });
      var before = S.tx.length;
      S.tx = S.tx.filter(function (t) { return set.indexOf(t) < 0; });
      save(); toast((before - S.tx.length) + '건을 ' + mm + '월에서 뺐어요');
    },
    xcat: function (v, el) { var w = el.closest('.sheetwrap'); w.state.d.cat = v; w.state.d.cat = v; el.parentNode.querySelectorAll('.chip').forEach(function (b) { b.classList.toggle('on', b.getAttribute('data-v') === v); }); },
    xmethod: function (v, el) { var w = el.closest('.sheetwrap'); w.state.d.method = v; el.parentNode.querySelectorAll('.chip').forEach(function (b) { b.classList.toggle('on', b.getAttribute('data-v') === v); }); },
    xsave: function (v, el) {
      var w = el.closest('.sheetwrap'), d = w.state.d;
      var item = $('#xItem', w).value.trim(), amount = Core.num($('#xAmount', w).value);
      if (!item) { toast('항목을 적어 주세요'); return; }
      if (!amount) { toast('금액을 적어 주세요'); return; }
      var rec = { id: d.id || uid(), item: item, cat: d.cat, amount: amount, method: d.method,
        day: $('#xDay', w).value.trim(), memo: $('#xMemo', w).value.trim() };
      if (d.id) { var i = S.fixed.findIndex(function (x) { return x.id === d.id; }); if (i >= 0) S.fixed[i] = rec; }
      else S.fixed.push(rec);
      save(); w.close(); toast('저장했어요');
    },
    xdel: function (v, el) {
      var w = el.closest('.sheetwrap'), d = w.state.d;
      if (!window.confirm('이 고정비를 지울까요?')) return;
      S.fixed = S.fixed.filter(function (x) { return x.id !== d.id; }); save(); w.close(); toast('지웠어요');
    },

    /* PIN */
    pintoggle: function () {
      if (S.auth && S.auth.pinHash) {
        if (!window.confirm('PIN 잠금을 끌까요?\n(다음부터 앱을 열 때 PIN을 묻지 않아요)')) return;
        S.auth = null; save(); toast('PIN 잠금을 껐어요');
      } else openPinSheet('set');
    },
    pinchange: function () { openPinSheet('change'); },
    pinsave: function (mode, el) {
      var w = el.closest('.sheetwrap');
      var oldV = mode === 'change' ? $('#pinOld', w).value : null;
      var a = $('#pinNew', w).value, b = $('#pinNew2', w).value;
      if (!/^\d{4}$/.test(a)) { toast('4자리 숫자로 정해 주세요'); return; }
      if (a !== b) { toast('두 번 적은 PIN이 달라요'); return; }
      var go = function () {
        var salt = Math.random().toString(16).slice(2, 10) + Math.random().toString(16).slice(2, 10);
        pinDigest(a, salt).then(function (hash) {
          S.auth = { salt: salt, pinHash: hash, updatedAt: Date.now() };
          save(); w.close(); toast('PIN을 저장했어요');
        });
      };
      if (mode === 'change') {
        pinDigest(oldV || '', (S.auth || {}).salt || '').then(function (h) {
          if (h !== (S.auth || {}).pinHash) { toast('지금 PIN이 맞지 않아요'); return; }
          go();
        });
      } else go();
    },
    lockkey: function (v) { lockKey(v); },

    /* 엑셀·백업 */
    xlsx: function () { exportXlsx(); },
    jsonout: function () { download('가계부_백업_' + Core.todayStr() + '.json', JSON.stringify(S, null, 1)); toast('백업 파일을 내려받았어요'); },
    jsonin: function () {
      var inp = document.createElement('input');
      inp.type = 'file'; inp.accept = '.json,application/json';
      inp.onchange = function () {
        var f = inp.files && inp.files[0]; if (!f) return;
        f.text().then(function (txt) {
          try {
            var d = JSON.parse(txt);
            if (!d.tx && !d.settings) throw new Error('bad');
            if (!window.confirm('지금 가계부를 이 파일로 바꿀까요? (' + ((d.tx || []).length) + '건)')) return;
            S = normalize(d); save(); toast('가져왔어요');
          } catch (e) { toast('가계부 파일이 아니에요'); }
        });
      };
      inp.click();
    },
    seedreload: function () {
      fetchSeed().then(function (seed) {
        if (!seed) { toast('seed-ledger.json 을 찾지 못했어요 (공개 저장소에는 없어요)'); return; }
        if (!window.confirm('엑셀 원본 ' + (seed.tx || []).length + '건으로 다시 채울까요?\n지금 적은 내용은 사라져요.')) return;
        S = fromSeed(seed); save(); toast('엑셀 자료를 다시 불러왔어요');
      });
    },
    resetall: function () {
      if (!window.confirm('모든 기록을 지울까요? 되돌릴 수 없어요.')) return;
      if (!window.confirm('정말 지울까요? 먼저 JSON 백업을 받아 두셨나요?')) return;
      S = emptyState(); save(); toast('비웠어요');
    },

    /* 클라우드 */
    cloud: function () { openCloudSheet(); },
    cloudlogin: function (v, el) {
      var w = el.closest('.sheetwrap');
      var email = $('#cEmail', w).value.trim(), pw = $('#cPw', w).value;
      ui.skipPin = true;
      Cloud.signIn(email, pw).then(function () { if (w && w.close) w.close(); hideGate(); toast('연결됐어요'); })
        .catch(function (e) { ui.skipPin = false; toast('로그인하지 못했어요'); });
    },
    cloudsignout: function (v, el) {
      var w = el.closest('.sheetwrap');
      if (w && w.close) w.close();
      /* 로그아웃하면 onUser 가 이어받아 로그인 화면을 다시 보여 줍니다 */
      firebase.app('budget').auth().signOut().catch(function () { toast('로그아웃하지 못했어요'); });
    }
  };

  function moveItem(seg, name, dir, el) {
    var arr = seg === 'exp' ? S.settings.expCats.map(function (c) { return c.name; }) : seg === 'inc' ? S.settings.incCats : S.settings.methods;
    var i = arr.indexOf(name), j = i + dir;
    if (i < 0 || j < 0 || j >= arr.length) return;
    if (seg === 'exp') { var tmp = S.settings.expCats[i]; S.settings.expCats[i] = S.settings.expCats[j]; S.settings.expCats[j] = tmp; }
    else if (seg === 'inc') { var t2 = S.settings.incCats[i]; S.settings.incCats[i] = S.settings.incCats[j]; S.settings.incCats[j] = t2; }
    else { var t3 = S.settings.methods[i]; S.settings.methods[i] = S.settings.methods[j]; S.settings.methods[j] = t3; }
    save({ render: false });
    var w = el.closest('.sheetwrap'); w.redraw();
  }

  /* 서비스 워커 (https 에서만) */
  try {
    if ('serviceWorker' in navigator && location.protocol === 'https:') {
      window.addEventListener('load', function () { navigator.serviceWorker.register('sw.js').catch(function () {}); });
    }
  } catch (e) {}

  /* 시작 */
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();

  /* 검산·확인용(테스트)에서 쓸 수 있게 */
  window.__budget = { get S() { return S; }, get ui() { return ui; }, act: ACT, Core: Core, sha256Hex: sha256Hex,
    render: render, normalize: normalize, fromSeed: fromSeed, pinDigest: pinDigest, Cloud: Cloud,
    showGate: showGate, hideGate: hideGate, showSplash: showSplash, hideSplash: hideSplash, emptyState: emptyState,
    views: { summary: viewSummary, list: viewList, trend: viewTrend, fixed: viewFixed, settings: viewSettings, bars: svgBars,
      calendar: viewCalendar, txlist: viewTxList, weekBars: weekBars, calAmt: calAmt } };
})();
