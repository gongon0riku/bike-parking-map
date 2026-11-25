"use strict";

// ---------- 状態 ----------
let stations = [];
let parkingIndex = {};       // station_id -> 件数
const parkingCache = {};     // station_id -> データ
let currentStation = null;
let currentParking = null;
let currentFilter = "all";
let map = null, detailMap = null;
let mapMarkers = [];

// ---------- ユーティリティ ----------
const $ = (sel) => document.querySelector(sel);

function haversineMeters(aLat, aLon, bLat, bLon) {
  const R = 6371000, rad = Math.PI / 180;
  const dLat = (bLat - aLat) * rad, dLon = (bLon - aLon) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(aLat * rad) * Math.cos(bLat * rad) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}
function walkLabel(m) {
  if (m < 100) return "すぐ";
  return "徒歩" + Math.max(1, Math.round(m / 80)) + "分";
}
function feeSummary(p) {
  const f = p.fees || {};
  const parts = [];
  if (f.free_minutes > 0) parts.push("最初" + f.free_minutes + "分無料");
  if (f.base_minutes && f.base_yen != null) parts.push(f.base_minutes + "分 " + f.base_yen + "円");
  if (f.max_yen_per_day != null) parts.push("最大 " + f.max_yen_per_day + "円");
  if (parts.length) return parts.join("・");
  return f.note || "料金は情報源をご確認ください";
}
const CC_LABEL = {
  "125": "125ccまで",
  "250": "250ccまで",
  "400": "400ccまで",
  "unlimited": "大型OK",
  "unknown": "排気量の条件は未確認"
};
function accepts(ccClass, filter) {
  if (filter === "all") return true;
  if (filter === "125") return ["125", "250", "400", "unlimited"].includes(ccClass);
  if (filter === "250") return ["250", "400", "unlimited"].includes(ccClass);
  if (filter === "large") return ccClass === "unlimited";
  return true;
}

// ---------- 画面遷移 ----------
function show(view) {
  document.querySelectorAll(".view").forEach(v => v.classList.remove("active"));
  $("#view-" + view).classList.add("active");
  window.scrollTo(0, 0);
  if (view === "map" && map) setTimeout(() => map.invalidateSize(), 50);
  if (view === "detail" && detailMap) setTimeout(() => detailMap.invalidateSize(), 50);
}

// ---------- 画面1: エリアを探す ----------
function stationRow(s, distMeters) {
  const count = parkingIndex[s.id] || 0;
  const btn = document.createElement("button");
  btn.className = "station-row";
  const linesText = s.lines.map(l => l.line).filter(Boolean).slice(0, 3).join("・");
  let right = '<span class="count-badge' + (count ? "" : " zero") + '">' + count + '件</span>';
  if (distMeters != null) {
    const d = distMeters < 1000 ? Math.round(distMeters) + "m" : (distMeters / 1000).toFixed(1) + "km";
    right = '<span class="dist-label">' + d + "</span>" + right;
  }
  btn.innerHTML =
    '<div class="station-main"><div class="station-name"></div>' +
    '<div class="station-sub"></div></div>' + right +
    '<span class="station-arrow">›</span>';
  btn.querySelector(".station-name").textContent = s.name;
  btn.querySelector(".station-sub").textContent = s.ward + (linesText ? "｜" + linesText : "");
  btn.addEventListener("click", () => openStation(s));
  return btn;
}

function renderSearchResults(keyword) {
  const kw = (keyword || "").trim();
  const results = $("#search-results");
  const tabs = $("#browse-tabs");
  if (!kw) {
    results.hidden = true;
    tabs.hidden = false;
    return;
  }
  results.hidden = false;
  tabs.hidden = true;
  const list = $("#station-list");
  list.innerHTML = "";
  const matched = stations.filter(s =>
    s.name.includes(kw) || (s.yomi || "").includes(kw) || s.ward.includes(kw) ||
    s.lines.some(l => (l.line || "").includes(kw)));
  const status = $("#search-status");
  if (matched.length) {
    status.textContent = "";
    $("#station-empty").hidden = true;
    for (const s of matched) list.appendChild(stationRow(s));
  } else {
    status.textContent = "住所として検索しています…";
    $("#station-empty").hidden = true;
    searchByAddress(kw);
  }
}

let addressSearchSeq = 0;
async function searchByAddress(kw) {
  const seq = ++addressSearchSeq;
  const status = $("#search-status");
  const list = $("#station-list");
  try {
    const res = await fetch("https://msearch.gsi.go.jp/address-search/AddressSearch?q=" + encodeURIComponent(kw));
    const data = await res.json();
    if (seq !== addressSearchSeq) return; // 入力が変わっていたら破棄
    if (!data || !data.length) throw new Error("no result");
    const [lon, lat] = data[0].geometry.coordinates;
    const title = (data[0].properties && data[0].properties.title) || kw;
    const near = stations
      .map(s => ({ s, d: haversineMeters(lat, lon, s.lat, s.lon) }))
      .sort((a, b) => a.d - b.d)
      .slice(0, 20);
    status.textContent = "「" + title + "」に近い順";
    list.innerHTML = "";
    for (const { s, d } of near) list.appendChild(stationRow(s, d));
    $("#station-empty").hidden = true;
  } catch (e) {
    if (seq !== addressSearchSeq) return;
    status.textContent = "";
    list.innerHTML = "";
    $("#station-empty").hidden = false;
  }
}

// ----- 駅名から探す（50音順） -----
const KANA_ROWS = [
  ["あ行", "あいうえお"], ["か行", "かきくけこ"], ["さ行", "さしすせそ"],
  ["た行", "たちつてと"], ["な行", "なにぬねの"], ["は行", "はひふへほ"],
  ["ま行", "まみむめも"], ["や行", "やゆよ"], ["ら行", "らりるれろ"],
  ["わ行", "わをん"]
];
const SMALL_KANA = { "ぁ": "あ", "ぃ": "い", "ぅ": "う", "ぇ": "え", "ぉ": "お", "ゃ": "や", "ゅ": "ゆ", "ょ": "よ", "ゎ": "わ" };
// 濁点・半濁点つきは清音の行に入れる（ば→は行、が→か行、ざ→さ行、だ→た行、ぱ→は行）
const VOICED_KANA = {
  "が": "か行", "ぎ": "か行", "ぐ": "か行", "げ": "か行", "ご": "か行",
  "ざ": "さ行", "じ": "さ行", "ず": "さ行", "ぜ": "さ行", "ぞ": "さ行",
  "だ": "た行", "ぢ": "た行", "づ": "た行", "で": "た行", "ど": "た行",
  "ば": "は行", "び": "は行", "ぶ": "は行", "べ": "は行", "ぼ": "は行",
  "ぱ": "は行", "ぴ": "は行", "ぷ": "は行", "ぺ": "は行", "ぽ": "は行",
  "ゔ": "あ行"
};
function kanaRowOf(yomi) {
  let c = (yomi || "").charAt(0);
  if (VOICED_KANA[c]) return VOICED_KANA[c];
  if (SMALL_KANA[c]) c = SMALL_KANA[c];
  for (const [label, chars] of KANA_ROWS) if (chars.includes(c)) return label;
  return "その他";
}

// 50音グループ＋ジャンプバー付きリストを作る（itemsはyomi順にソート済み前提）
function buildKanaList(items, yomiOf, makeRow) {
  const frag = document.createDocumentFragment();
  const heads = {};
  const jumpBar = document.createElement("div");
  jumpBar.className = "kana-jump";
  const labels = KANA_ROWS.map(([label]) => label);
  if (items.some(it => kanaRowOf(yomiOf(it)) === "その他")) labels.push("その他");
  for (const label of labels) {
    if (!items.some(it => kanaRowOf(yomiOf(it)) === label)) continue;
    const b = document.createElement("button");
    b.className = "kana-jump-btn";
    b.textContent = label === "その他" ? "他" : label.charAt(0);
    b.addEventListener("click", () => {
      if (heads[label]) heads[label].scrollIntoView({ behavior: "smooth", block: "start" });
    });
    jumpBar.appendChild(b);
  }
  frag.appendChild(jumpBar);

  let currentRow = null;
  let listEl = null;
  for (const it of items) {
    const row = kanaRowOf(yomiOf(it));
    if (row !== currentRow) {
      currentRow = row;
      const head = document.createElement("div");
      head.className = "kana-head";
      head.textContent = row;
      heads[row] = head;
      frag.appendChild(head);
      listEl = document.createElement("div");
      listEl.className = "station-list";
      frag.appendChild(listEl);
    }
    listEl.appendChild(makeRow(it));
  }
  return frag;
}

function renderStationPanel() {
  const panel = $("#panel-station");
  panel.innerHTML = "";
  const sorted = [...stations].sort((a, b) => (a.yomi || a.name).localeCompare(b.yomi || b.name, "ja"));
  panel.appendChild(buildKanaList(sorted, s => s.yomi, s => stationRow(s)));
}

// ----- 地名から探す（都道府県 → 区 → 駅） -----
let areaLevel = "pref";   // "pref" | "ward" | "stations"
let areaWard = null;

function renderAreaPanel() {
  const panel = $("#panel-area");
  panel.innerHTML = "";
  const listEl = document.createElement("div");
  listEl.className = "station-list";

  if (areaLevel === "pref") {
    // 対象エリアが増えたときも使えるよう、都道府県も50音リストで表示する
    const prefs = [{ name: "東京都", yomi: "とうきょうと", note: "対象は23区の駅です" }];
    panel.appendChild(buildKanaList(prefs, p => p.yomi, (p) => {
      const btn = document.createElement("button");
      btn.className = "station-row";
      btn.innerHTML =
        '<div class="station-main"><div class="station-name"></div>' +
        '<div class="station-sub"></div></div>' +
        '<span class="station-arrow">›</span>';
      btn.querySelector(".station-name").textContent = p.name;
      btn.querySelector(".station-sub").textContent = p.note;
      btn.addEventListener("click", () => { areaLevel = "ward"; renderAreaPanel(); });
      return btn;
    }));
    return;
  } else if (areaLevel === "ward") {
    panel.appendChild(areaBackRow("都道府県を選ぶ", () => { areaLevel = "pref"; renderAreaPanel(); }));
    const wards = [...new Set(stations.map(s => s.ward))]
      .sort((a, b) => (WARD_YOMI[a] || a).localeCompare(WARD_YOMI[b] || b, "ja"));
    panel.appendChild(buildKanaList(wards, w => WARD_YOMI[w] || w, (w) => {
      const inWard = stations.filter(s => s.ward === w);
      const btn = document.createElement("button");
      btn.className = "station-row";
      btn.innerHTML =
        '<div class="station-main"><div class="station-name"></div>' +
        '<div class="station-sub"></div></div>' +
        '<span class="station-arrow">›</span>';
      btn.querySelector(".station-name").textContent = w;
      btn.querySelector(".station-sub").textContent = inWard.length + "駅";
      btn.addEventListener("click", () => { areaLevel = "stations"; areaWard = w; renderAreaPanel(); });
      return btn;
    }));
    return;
  } else {
    panel.appendChild(areaBackRow("区を選ぶ", () => { areaLevel = "ward"; renderAreaPanel(); }));
    const title = document.createElement("div");
    title.className = "area-title";
    title.textContent = areaWard;
    panel.appendChild(title);
    const inWard = stations.filter(s => s.ward === areaWard)
      .sort((a, b) => (a.yomi || a.name).localeCompare(b.yomi || b.name, "ja"));
    panel.appendChild(buildKanaList(inWard, s => s.yomi, s => stationRow(s)));
    return;
  }
  panel.appendChild(listEl);
}

const WARD_YOMI = {
  "千代田区": "ちよだ", "中央区": "ちゅうおう", "港区": "みなと", "新宿区": "しんじゅく",
  "文京区": "ぶんきょう", "台東区": "たいとう", "墨田区": "すみだ", "江東区": "こうとう",
  "品川区": "しながわ", "大田区": "おおた", "目黒区": "めぐろ", "世田谷区": "せたがや",
  "渋谷区": "しぶや", "中野区": "なかの", "杉並区": "すぎなみ", "豊島区": "としま",
  "北区": "きた", "荒川区": "あらかわ", "板橋区": "いたばし", "練馬区": "ねりま",
  "足立区": "あだち", "葛飾区": "かつしか", "江戸川区": "えどがわ"
};

function areaBackRow(label, onClick) {
  const btn = document.createElement("button");
  btn.className = "area-back";
  btn.textContent = "‹ " + label;
  btn.addEventListener("click", onClick);
  return btn;
}

// ---------- 画面2: 地図＋リスト ----------
async function loadParking(stationId) {
  if (parkingCache[stationId]) return parkingCache[stationId];
  try {
    const res = await fetch("data/parking/" + stationId + ".json");
    if (!res.ok) throw new Error("not found");
    parkingCache[stationId] = await res.json();
  } catch (e) {
    parkingCache[stationId] = { parkings: [] };
  }
  return parkingCache[stationId];
}

async function openStation(station) {
  currentStation = station;
  currentFilter = "all";
  document.querySelectorAll("#cc-filter .chip").forEach(c =>
    c.classList.toggle("active", c.dataset.filter === "all"));
  $("#map-station-name").textContent = station.name;
  show("map");
  const data = await loadParking(station.id);
  renderMapAndList(data.parkings || []);
}

function renderMapAndList(parkings) {
  const s = currentStation;
  const filtered = parkings.filter(p => accepts(p.cc_class, currentFilter));

  if (!map) {
    map = L.map("map");
    L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: "© OpenStreetMap contributors", maxZoom: 19
    }).addTo(map);
  }
  mapMarkers.forEach(m => map.removeLayer(m));
  mapMarkers = [];

  const stationIcon = L.divIcon({
    className: "", html: '<div class="pin-station"><span>🚉</span></div>',
    iconSize: [32, 32], iconAnchor: [16, 30]
  });
  mapMarkers.push(L.marker([s.lat, s.lon], { icon: stationIcon }).addTo(map));

  const points = [[s.lat, s.lon]];
  for (const p of filtered) {
    const icon = L.divIcon({
      className: "", html: '<div class="pin-p"><span>P</span></div>',
      iconSize: [30, 30], iconAnchor: [15, 28]
    });
    const marker = L.marker([p.lat, p.lon], { icon }).addTo(map);
    marker.on("click", () => openDetail(p));
    mapMarkers.push(marker);
    points.push([p.lat, p.lon]);
  }
  if (points.length > 1) map.fitBounds(points, { padding: [40, 40] });
  else map.setView([s.lat, s.lon], 15);

  $("#map-count").textContent = filtered.length + "件の駐車場";
  const list = $("#parking-list");
  list.innerHTML = "";
  const empty = $("#parking-empty");
  if (!parkings.length) {
    empty.hidden = false;
    empty.textContent = "この駅周辺の駐車場データはまだ調査中です。";
  } else if (!filtered.length) {
    empty.hidden = false;
    empty.textContent = "この排気量で停められる駐車場は見つかりませんでした。";
  } else {
    empty.hidden = true;
  }

  const sorted = [...filtered].sort((a, b) =>
    haversineMeters(s.lat, s.lon, a.lat, a.lon) - haversineMeters(s.lat, s.lon, b.lat, b.lon));
  for (const p of sorted) {
    const dist = haversineMeters(s.lat, s.lon, p.lat, p.lon);
    const card = document.createElement("button");
    card.className = "parking-card";
    const tags = [];
    tags.push('<span class="tag' + (p.cc_class === "unknown" ? " warn" : "") + '">' + CC_LABEL[p.cc_class] + "</span>");
    if (p.roof === true) tags.push('<span class="tag">屋根あり</span>');
    if (p.hours) tags.push('<span class="tag">' + p.hours + "</span>");
    card.innerHTML =
      '<div class="p-icon">P</div><div class="p-main">' +
      '<div class="p-name"></div><div class="p-fee"></div>' +
      '<div class="p-tags">' + tags.join("") + "</div></div>" +
      '<div class="p-dist">' + walkLabel(dist) + "</div>";
    card.querySelector(".p-name").textContent = p.name;
    card.querySelector(".p-fee").textContent = feeSummary(p);
    card.addEventListener("click", () => openDetail(p));
    list.appendChild(card);
  }
}



// ---------- 広告（Google AdSense） ----------
let adsConfig = null;
async function initAds() {
  try {
    const res = await fetch("ads.json");
    adsConfig = await res.json();
  } catch (e) { adsConfig = null; }
  if (!adsConfig || !adsConfig.adsense_client) return; // 未設定なら広告枠は出さない
  const script = document.createElement("script");
  script.async = true;
  script.crossOrigin = "anonymous";
  script.src = "https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=" + adsConfig.adsense_client;
  document.head.appendChild(script);
  document.querySelectorAll(".ad-slot").forEach(slot => {
    const slotId = adsConfig.slots[slot.dataset.adSlot];
    if (!slotId) return;
    slot.hidden = false;
    slot.innerHTML = '<ins class="adsbygoogle" data-ad-client="' + adsConfig.adsense_client +
      '" data-ad-slot="' + slotId + '" data-ad-format="auto" data-full-width-responsive="true"></ins>';
    (window.adsbygoogle = window.adsbygoogle || []).push({});
  });
}

// ---------- アフィリエイト ----------
let affiliateItems = [];
function renderAffiliate() {
  const sec = $("#affiliate-section");
  const items = affiliateItems.filter(i => i.url);
  if (!items.length) { sec.hidden = true; sec.innerHTML = ""; return; }
  sec.hidden = false;
  sec.innerHTML = '<div class="affiliate-head">バイク用品（PR）</div>' + items.map(i =>
    '<a class="affiliate-item" href="' + i.url + '" target="_blank" rel="noopener sponsored">' +
    '<span class="af-title"></span>' +
    (i.store ? '<span class="af-store"></span>' : "") + "</a>").join("");
  sec.querySelectorAll(".affiliate-item").forEach((a, idx) => {
    a.querySelector(".af-title").textContent = items[idx].title;
    const st = a.querySelector(".af-store");
    if (st) st.textContent = items[idx].store;
  });
}

// ---------- 画面3: 詳細 ----------
function openDetail(p) {
  currentParking = p;
  $("#detail-name").textContent = p.name;
  show("detail");

  if (!detailMap) {
    detailMap = L.map("detail-map", {
      dragging: false, scrollWheelZoom: false, doubleClickZoom: false,
      zoomControl: false, attributionControl: false
    });
    L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 19 }).addTo(detailMap);
  }
  detailMap.setView([p.lat, p.lon], 16);
  if (detailMap._pin) detailMap.removeLayer(detailMap._pin);
  const icon = L.divIcon({
    className: "", html: '<div class="pin-p"><span>P</span></div>',
    iconSize: [30, 30], iconAnchor: [15, 28]
  });
  detailMap._pin = L.marker([p.lat, p.lon], { icon }).addTo(detailMap);
  setTimeout(() => detailMap.invalidateSize(), 50);

  const rows = [];
  const row = (ico, label, valueHtml) =>
    rows.push('<div class="detail-row"><div class="detail-ico">' + ico + '</div><div class="detail-label">' + label + '</div><div class="detail-value">' + valueHtml + "</div></div>");
  const esc = (t) => { const d = document.createElement("div"); d.textContent = t == null ? "" : String(t); return d.innerHTML; };

  row("💴", "料金", esc(feeSummary(p)) + (p.fees && p.fees.note ? "<br>" + esc(p.fees.note) : ""));
  row("🕐", "営業時間", esc(p.hours || "不明"));
  row("🏍️", "台数", p.capacity != null ? esc(p.capacity) + "台" : "不明");
  row("☂️", "屋根", p.roof === true ? "あり" : p.roof === false ? "なし" : "不明");
  row("🔧", "対応排気量", esc(CC_LABEL[p.cc_class]) + (p.displacement_note ? "<br>" + esc(p.displacement_note) : ""));
  if (p.monthly != null) row("📅", "月極", p.monthly ? "あり" : "なし");
  row("📍", "住所", esc(p.address));
  row("🔗", "情報源", '<a href="' + esc(p.source_url) + '" target="_blank" rel="noopener">情報源を見る</a>' +
    (p.data_note ? "<br>" + esc(p.data_note) : "") + "<br>確認日：" + esc(p.checked_date));

  renderAffiliate();
  $("#detail-card").innerHTML = rows.join("") +
    '<a class="gmap-btn" target="_blank" rel="noopener" href="https://www.google.com/maps/search/?api=1&query=' +
    p.lat + "," + p.lon + '">Googleマップで開く</a>';
}

// ---------- 初期化 ----------
async function init() {
  try {
    const [sRes, iRes] = await Promise.all([
      fetch("data/stations.json"),
      fetch("data/parking/index.json")
    ]);
    stations = await sRes.json();
    parkingIndex = await iRes.json();
  } catch (e) {
    stations = []; parkingIndex = {};
  }
  try {
    const aRes = await fetch("affiliate.json");
    affiliateItems = (await aRes.json()).items || [];
  } catch (e) { affiliateItems = []; }
  initAds();
  renderStationPanel();
  renderAreaPanel();

  let searchTimer = null;
  $("#station-search").addEventListener("input", (e) => {
    clearTimeout(searchTimer);
    const value = e.target.value;
    searchTimer = setTimeout(() => renderSearchResults(value), 350);
  });
  $("#tab-station").addEventListener("click", () => {
    $("#tab-station").classList.add("active");
    $("#tab-area").classList.remove("active");
    $("#panel-station").hidden = false;
    $("#panel-area").hidden = true;
  });
  $("#tab-area").addEventListener("click", () => {
    $("#tab-area").classList.add("active");
    $("#tab-station").classList.remove("active");
    $("#panel-area").hidden = false;
    $("#panel-station").hidden = true;
  });
  document.querySelectorAll("#cc-filter .chip").forEach(chip => {
    chip.addEventListener("click", async () => {
      currentFilter = chip.dataset.filter;
      document.querySelectorAll("#cc-filter .chip").forEach(c =>
        c.classList.toggle("active", c === chip));
      const data = await loadParking(currentStation.id);
      renderMapAndList(data.parkings || []);
    });
  });
  document.querySelectorAll(".back-btn").forEach(btn => {
    btn.addEventListener("click", () => show(btn.dataset.back));
  });
  $("#to-about").addEventListener("click", () => show("about"));
  $("#to-privacy").addEventListener("click", () => show("privacy"));
}
document.addEventListener("DOMContentLoaded", init);
