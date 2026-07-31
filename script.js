/* =========================================================
   خريطة الحقول النفطية والغازية العراقية — script.js
   ========================================================= */

let ALL_FIELDS = [];
let markers = {};      // id -> leaflet marker
let markerLayer = null;
let map = null;

const state = {
  search: "",
  governorate: "",
  type: "",
  status: "",
  formation: "",
  sourceRock: "",
  company: "",
  age: ""
};

/* ---------------------------------------------------------
   أدوات نصية عامة (تطبيع النص العربي للمطابقة والبحث)
--------------------------------------------------------- */
function normalizeAr(str) {
  if (!str) return "";
  return str
    .toString()
    .replace(/[\u064B-\u065F\u0670]/g, "")   // تشكيل
    .replace(/[أإآ]/g, "ا")
    .replace(/ة/g, "ه")
    .replace(/ى/g, "ي")
    .replace(/[^\u0600-\u06FF0-9a-zA-Z\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function fieldSearchBlob(f) {
  return normalizeAr([
    f.name, f.governorate, f.company, f.type, f.status,
    (f.formations || []).join(" "),
    (f.source_rocks || []).join(" "),
    f.reservoir, f.cap_rock, f.age, f.depth, f.description
  ].join(" "));
}

/* ---------------------------------------------------------
   تحميل البيانات
--------------------------------------------------------- */
async function loadData() {
  const res = await fetch("data.json");
  ALL_FIELDS = await res.json();
  ALL_FIELDS.forEach(f => { f._blob = fieldSearchBlob(f); });
}

/* ---------------------------------------------------------
   تهيئة الخريطة
--------------------------------------------------------- */
function initMap() {
  map = L.map("map", { zoomControl: true, minZoom: 5, maxZoom: 12 })
    .setView([33.2, 43.9], 6);

  L.tileLayer("https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png", {
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>',
    subdomains: "abcd",
    maxZoom: 19
  }).addTo(map);

  markerLayer = L.layerGroup().addTo(map);

  // حدود المحافظات (تُحمَّل من CDN خارجي عند توفر اتصال بالإنترنت؛
  // فشل التحميل لا يوقف عمل الخريطة أو بقية الميزات)
  const govUrl = "https://cdn.jsdelivr.net/gh/wmgeolab/geoBoundaries@main/releaseData/gbOpen/IRQ/ADM1/geoBoundaries-IRQ-ADM1_simplified.geojson";
  fetch(govUrl).then(r => r.ok ? r.json() : Promise.reject()).then(geo => {
    L.geoJSON(geo, {
      style: { color: "#264B72", weight: 1.3, fillColor: "#0E2A4A", fillOpacity: 0.15 }
    }).addTo(map).bringToBack();
  }).catch(() => { /* تجاهل بصمت إن تعذّر الاتصال بمصدر الحدود الخارجي */ });
}

function oilIcon(type) {
  const file = type === "غاز" ? "icons/marker-gas.svg" : "icons/marker-oil.svg";
  return L.icon({
    iconUrl: file,
    iconSize: [30, 40],
    iconAnchor: [15, 40],
    popupAnchor: [0, -36]
  });
}

function buildPopupHtml(f) {
  const badgeClass = f.type === "غاز" ? "gas" : "oil";
  return `
  <div class="popup-card">
    <h3>${f.name}</h3>
    <div class="popup-gov">${f.governorate} · <span class="badge ${badgeClass}">${f.type}</span> · ${f.status}</div>
    <div class="popup-row"><b>الشركة المشغّلة:</b> ${f.company}</div>
    <div class="popup-row"><b>التكوينات المنتجة:</b> ${(f.formations||[]).join("، ")}</div>
    <div class="popup-row"><b>الصخور المصدرية:</b> ${(f.source_rocks||[]).join("، ")}</div>
    <div class="popup-row"><b>العمق التقريبي:</b> ${f.depth}</div>
    <div class="popup-row"><b>الإحداثيات:</b> <span class="mono">${f.lat.toFixed(4)}, ${f.lng.toFixed(4)}</span></div>
    <a class="popup-more" href="field.html?id=${encodeURIComponent(f.id)}">تفاصيل أكثر ←</a>
  </div>`;
}

function renderMarkers(list) {
  markerLayer.clearLayers();
  markers = {};
  list.forEach(f => {
    const m = L.marker([f.lat, f.lng], { icon: oilIcon(f.type) });
    m.bindPopup(buildPopupHtml(f));
    m.addTo(markerLayer);
    markers[f.id] = m;
  });
}

function focusField(id, openPopup = true) {
  const f = ALL_FIELDS.find(x => x.id === id);
  if (!f || !markers[id]) return;
  map.flyTo([f.lat, f.lng], 8, { duration: 0.8 });
  if (openPopup) setTimeout(() => markers[id].openPopup(), 750);
}

/* ---------------------------------------------------------
   بناء الفلاتر
--------------------------------------------------------- */
function unique(arr) { return [...new Set(arr)].filter(Boolean).sort((a, b) => a.localeCompare(b, "ar")); }

function populateSelect(selectEl, values, placeholder) {
  selectEl.innerHTML = `<option value="">${placeholder}</option>` +
    values.map(v => `<option value="${v}">${v}</option>`).join("");
}

function initFilters() {
  const governorates = unique(ALL_FIELDS.map(f => f.governorate));
  populateSelect(document.getElementById("filterGovernorate"), governorates, "كل المحافظات");

  const formationsSet = unique(ALL_FIELDS.flatMap(f => f.formations || []));
  populateSelect(document.getElementById("filterFormation"), formationsSet, "كل التكوينات");

  const sourceRocksSet = unique(ALL_FIELDS.flatMap(f => f.source_rocks || []));
  populateSelect(document.getElementById("filterSourceRock"), sourceRocksSet, "كل الصخور المصدرية");

  const companiesSet = unique(ALL_FIELDS.map(f => f.company));
  populateSelect(document.getElementById("filterCompany"), companiesSet, "كل الشركات");

  const agesSet = unique(ALL_FIELDS.map(f => f.age));
  populateSelect(document.getElementById("filterAge"), agesSet, "كل الأعمار الجيولوجية");

  // فلاتر النوع (شرائح)
  const typeWrap = document.getElementById("filterType");
  ["نفط", "غاز"].forEach(t => {
    const chip = document.createElement("button");
    chip.className = "chip";
    chip.textContent = t;
    chip.dataset.value = t;
    chip.addEventListener("click", () => {
      state.type = state.type === t ? "" : t;
      syncChipGroup(typeWrap, state.type, t === "غاز");
      applyFilters();
    });
    typeWrap.appendChild(chip);
  });

  // فلاتر الحالة (شرائح)
  const statusWrap = document.getElementById("filterStatus");
  const statuses = unique(ALL_FIELDS.map(f => f.status));
  statuses.forEach(s => {
    const chip = document.createElement("button");
    chip.className = "chip";
    chip.textContent = s;
    chip.dataset.value = s;
    chip.addEventListener("click", () => {
      state.status = state.status === s ? "" : s;
      syncChipGroup(statusWrap, state.status, false);
      applyFilters();
    });
    statusWrap.appendChild(chip);
  });

  document.getElementById("filterGovernorate").addEventListener("change", e => { state.governorate = e.target.value; applyFilters(); });
  document.getElementById("filterFormation").addEventListener("change", e => { state.formation = e.target.value; applyFilters(); });
  document.getElementById("filterSourceRock").addEventListener("change", e => { state.sourceRock = e.target.value; applyFilters(); });
  document.getElementById("filterCompany").addEventListener("change", e => { state.company = e.target.value; applyFilters(); });
  document.getElementById("filterAge").addEventListener("change", e => { state.age = e.target.value; applyFilters(); });

  document.getElementById("resetFilters").addEventListener("click", () => {
    Object.keys(state).forEach(k => state[k] = "");
    document.getElementById("globalSearch").value = "";
    document.getElementById("headerSearchWrap").classList.remove("has-value");
    ["filterGovernorate","filterFormation","filterSourceRock","filterCompany","filterAge"].forEach(id => document.getElementById(id).value = "");
    document.querySelectorAll(".chip.active").forEach(c => c.classList.remove("active","gas-active"));
    applyFilters();
  });
}

function syncChipGroup(wrap, activeValue, isGas) {
  [...wrap.children].forEach(chip => {
    const on = chip.dataset.value === activeValue;
    chip.classList.toggle("active", on);
    chip.classList.toggle("gas-active", on && isGas);
  });
}

/* ---------------------------------------------------------
   تطبيق الفلاتر + البحث
--------------------------------------------------------- */
function matchesState(f) {
  if (state.governorate && f.governorate !== state.governorate) return false;
  if (state.type && f.type !== state.type) return false;
  if (state.status && f.status !== state.status) return false;
  if (state.formation && !(f.formations || []).includes(state.formation)) return false;
  if (state.sourceRock && !(f.source_rocks || []).includes(state.sourceRock)) return false;
  if (state.company && f.company !== state.company) return false;
  if (state.age && f.age !== state.age) return false;
  if (state.search) {
    const q = normalizeAr(state.search);
    if (!f._blob.includes(q)) return false;
  }
  return true;
}

function applyFilters() {
  const filtered = ALL_FIELDS.filter(matchesState);
  renderMarkers(filtered);
  renderFieldList(filtered);
  updateResultsCount(filtered.length);
}

function updateResultsCount(n) {
  document.getElementById("resultsCount").textContent =
    n === ALL_FIELDS.length ? `عرض جميع الحقول (${n})` : `عرض ${n} من أصل ${ALL_FIELDS.length} حقلاً`;
}

function renderFieldList(list) {
  const wrap = document.getElementById("fieldList");
  if (!list.length) {
    wrap.innerHTML = `<div class="no-results">لا توجد حقول مطابقة لهذا البحث/الفلترة.</div>`;
    return;
  }
  wrap.innerHTML = list.map(f => `
    <div class="field-item" data-id="${f.id}">
      <h4>${f.name} <span class="badge ${f.type === "غاز" ? "gas" : "oil"}">${f.type}</span></h4>
      <p>${f.governorate} · ${f.status}</p>
    </div>`).join("");

  wrap.querySelectorAll(".field-item").forEach(el => {
    el.addEventListener("click", () => focusField(el.dataset.id));
  });
}

/* ---------------------------------------------------------
   لوحة الإحصاءات
--------------------------------------------------------- */
function renderStats() {
  document.getElementById("statTotal").textContent = ALL_FIELDS.length;
  document.getElementById("statProducing").textContent = ALL_FIELDS.filter(f => f.status === "منتج").length;
  document.getElementById("statGas").textContent = ALL_FIELDS.filter(f => f.type === "غاز").length;
  document.getElementById("statGov").textContent = unique(ALL_FIELDS.map(f => f.governorate)).length;
  document.getElementById("statFormations").textContent = unique(ALL_FIELDS.flatMap(f => f.formations || [])).length;
  document.getElementById("statSourceRocks").textContent = unique(ALL_FIELDS.flatMap(f => f.source_rocks || [])).length;
}

/* ---------------------------------------------------------
   البحث العلوي العام
--------------------------------------------------------- */
function initGlobalSearch() {
  const input = document.getElementById("globalSearch");
  const wrap = document.getElementById("headerSearchWrap");
  const clearBtn = document.getElementById("searchClear");

  input.addEventListener("input", () => {
    state.search = input.value;
    wrap.classList.toggle("has-value", !!input.value);
    applyFilters();
  });
  clearBtn.addEventListener("click", () => {
    input.value = ""; state.search = "";
    wrap.classList.remove("has-value");
    applyFilters();
  });
}

/* ---------------------------------------------------------
   مساعد الدردشة (محرك قواعد محلي — بدون اتصال بخادم خارجي)
--------------------------------------------------------- */
const CHAT = {
  panel: null, messages: null, input: null
};

function initChat() {
  CHAT.panel = document.getElementById("chatPanel");
  CHAT.messages = document.getElementById("chatMessages");
  CHAT.input = document.getElementById("chatInput");

  document.getElementById("chatToggle").addEventListener("click", () => {
    CHAT.panel.classList.toggle("open");
    if (CHAT.panel.classList.contains("open") && !CHAT.messages.dataset.greeted) {
      addBotMessage("أهلاً بك! اسألني عن أي حقل نفطي أو غازي في قاعدة البيانات، أو أي سؤال جيولوجي عام. مثلاً: «ما هي الصخور المصدرية في حقل شرق بغداد؟» أو «ما هي الحقول المنتجة من تكوين المشرف؟»");
      CHAT.messages.dataset.greeted = "1";
    }
  });
  document.getElementById("chatClose").addEventListener("click", () => CHAT.panel.classList.remove("open"));

  document.getElementById("chatSend").addEventListener("click", sendChat);
  CHAT.input.addEventListener("keydown", e => { if (e.key === "Enter") sendChat(); });

  document.querySelectorAll("#chatSuggestions button").forEach(btn => {
    btn.addEventListener("click", () => { CHAT.input.value = btn.dataset.q; sendChat(); });
  });
}

async function sendChat() {
  const q = CHAT.input.value.trim();
  if (!q) return;
  addUserMessage(q);
  CHAT.input.value = "";

  const typingEl = addTypingIndicator();

  // نحاول أولاً الاتصال بمساعد الذكاء الاصطناعي الحقيقي (Google Gemini عبر دالة Netlify).
  // إذا لم تكن الدالة مفعّلة بعد (مثلاً أثناء التطوير المحلي أو قبل ضبط مفتاح API)،
  // نعود تلقائياً إلى محرك القواعد المحلي حتى لا يتوقف المساعد عن العمل.
  try {
    const res = await fetch("/.netlify/functions/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ question: q })
    });
    if (!res.ok) throw new Error("fallback");
    const data = await res.json();
    if (!data.answer) throw new Error("fallback");
    removeTypingIndicator(typingEl);
    addBotMessage(data.answer.replace(/\n/g, "<br>"), []);
    const mentioned = ALL_FIELDS.filter(f => q.includes(f.name.split(" (")[0]) || data.answer.includes(f.name.split(" (")[0]));
    if (mentioned.length) highlightOnMap(mentioned.map(f => f.id));
    return;
  } catch (e) {
    // متابعة إلى المحرك المحلي أدناه
  }

  const answer = answerQuestion(q);
  removeTypingIndicator(typingEl);
  addBotMessage(answer.html, answer.fieldIds);
}

function addTypingIndicator() {
  const div = document.createElement("div");
  div.className = "msg bot";
  div.textContent = "…جارٍ التفكير";
  CHAT.messages.appendChild(div);
  CHAT.messages.scrollTop = CHAT.messages.scrollHeight;
  return div;
}
function removeTypingIndicator(el) { if (el && el.parentNode) el.parentNode.removeChild(el); }

function highlightOnMap(fieldIds) {
  const subset = ALL_FIELDS.filter(f => fieldIds.includes(f.id));
  if (!subset.length) return;
  renderMarkers(subset);
  const group = L.featureGroup(subset.map(f => markers[f.id]));
  map.fitBounds(group.getBounds().pad(0.3));
}

function addUserMessage(text) {
  const div = document.createElement("div");
  div.className = "msg user";
  div.textContent = text;
  CHAT.messages.appendChild(div);
  CHAT.messages.scrollTop = CHAT.messages.scrollHeight;
}

function addBotMessage(html, fieldIds = []) {
  const div = document.createElement("div");
  div.className = "msg bot";
  div.innerHTML = html;
  CHAT.messages.appendChild(div);
  CHAT.messages.scrollTop = CHAT.messages.scrollHeight;

  div.querySelectorAll(".mini-link").forEach(a => {
    a.addEventListener("click", () => {
      const id = a.dataset.id;
      focusField(id);
      // إبراز الحقل ضمن نتائج الشريط الجانبي أيضاً
      state.search = "";
      applyFilters();
    });
  });

  if (fieldIds && fieldIds.length) {
    // إظهار الحقول المطابقة فقط على الخريطة مؤقتاً
    const subset = ALL_FIELDS.filter(f => fieldIds.includes(f.id));
    renderMarkers(subset);
    if (subset.length) {
      const group = L.featureGroup(subset.map(f => markers[f.id]));
      map.fitBounds(group.getBounds().pad(0.3));
    }
  }
}

function fieldLink(f) {
  return `<span class="mini-link" data-id="${f.id}">${f.name}</span>`;
}

function findFieldByNameInText(qNorm) {
  let best = null, bestLen = 0;
  ALL_FIELDS.forEach(f => {
    const tokens = normalizeAr(f.name).split(/[\s()]+/).filter(t => t.length >= 3);
    tokens.forEach(t => {
      if (qNorm.includes(t) && t.length > bestLen) { best = f; bestLen = t.length; }
    });
  });
  return best;
}

function findFieldsByFormationKeyword(keyword) {
  const k = normalizeAr(keyword);
  if (!k) return [];
  return ALL_FIELDS.filter(f =>
    (f.formations || []).some(form => normalizeAr(form).includes(k) || k.includes(normalizeAr(form).split(" ")[0]))
  );
}

function findFieldsBySourceRockKeyword(keyword) {
  const k = normalizeAr(keyword);
  if (!k) return [];
  return ALL_FIELDS.filter(f =>
    (f.source_rocks || []).some(sr => normalizeAr(sr).includes(k) || k.includes(normalizeAr(sr).split(" ")[0]))
  );
}

function answerQuestion(rawQ) {
  const q = normalizeAr(rawQ);

  // 1) الحقول المنتجة/المرتبطة بتكوين معيّن
  if (/(الحقول|حقول).*(منتج|تنتج|من تكوين|من الحقول)/.test(q) || /من تكوين/.test(q) || (/حقول/.test(q) && /تكوين/.test(q))) {
    let after = q.split("تكوين")[1] || q.split("من")[1] || "";
    after = after.trim().split(" ").slice(0, 2).join(" ");
    if (after) {
      const list = findFieldsByFormationKeyword(after);
      if (list.length) {
        return {
          html: `الحقول المنتجة من تكوين «${after}» (${list.length}):<ul>` +
                list.map(f => `<li>${fieldLink(f)} — ${f.governorate}</li>`).join("") + `</ul>تم إبراز هذه الحقول على الخريطة.`,
          fieldIds: list.map(f => f.id)
        };
      }
    }
  }

  // 2) الحقول المرتبطة بصخر مصدري معيّن
  if (/صخر مصدري|صخور مصدريه|من صخر/.test(q)) {
    const parts = q.split(/صخر مصدري|صخور مصدريه/);
    const after = (parts[1] || "").trim().split(" ").slice(0, 2).join(" ");
    if (after) {
      const list = findFieldsBySourceRockKeyword(after);
      if (list.length) {
        return {
          html: `الحقول المرتبطة بالصخر المصدري «${after}» (${list.length}):<ul>` +
                list.map(f => `<li>${fieldLink(f)} — ${f.governorate}</li>`).join("") + `</ul>`,
          fieldIds: list.map(f => f.id)
        };
      }
    }
  }

  // 3) الحقول الغازية / النفطية عموماً
  if (/الحقول الغازيه|حقول الغاز/.test(q)) {
    const list = ALL_FIELDS.filter(f => f.type === "غاز");
    return {
      html: `الحقول الغازية في قاعدة البيانات (${list.length}):<ul>` +
            list.map(f => `<li>${fieldLink(f)} — ${f.governorate}</li>`).join("") + `</ul>`,
      fieldIds: list.map(f => f.id)
    };
  }
  if (/الحقول النفطيه|حقول النفط/.test(q) && !/غاز/.test(q)) {
    const list = ALL_FIELDS.filter(f => f.type === "نفط");
    return {
      html: `عدد الحقول النفطية في قاعدة البيانات: ${list.length}. أهمها: ` +
            list.slice(0, 6).map(fieldLink).join("، ") + " …",
      fieldIds: list.map(f => f.id)
    };
  }

  // 4) سؤال عن حقل محدد بخاصية معيّنة
  const field = findFieldByNameInText(q);
  if (field) {
    if (/مصدر/.test(q)) return { html: `الصخور المصدرية في حقل ${fieldLink(field)}: <b>${(field.source_rocks||[]).join("، ")}</b>`, fieldIds:[field.id] };
    if (/غطاء/.test(q)) return { html: `الصخر الغطاء في حقل ${fieldLink(field)}: <b>${field.cap_rock}</b>`, fieldIds:[field.id] };
    if (/الخزان|صخر خزني/.test(q)) return { html: `الخزان (نوع الصخر الخزني) في حقل ${fieldLink(field)}: <b>${field.reservoir}</b>`, fieldIds:[field.id] };
    if (/عمر/.test(q)) return { html: `العمر الجيولوجي لحقل ${fieldLink(field)}: <b>${field.age}</b>`, fieldIds:[field.id] };
    if (/عمق/.test(q)) return { html: `عمق الخزان التقريبي في حقل ${fieldLink(field)}: <b>${field.depth}</b>`, fieldIds:[field.id] };
    if (/api/.test(q)) return { html: `درجة API في حقل ${fieldLink(field)}: <b>${field.api}</b>`, fieldIds:[field.id] };
    if (/شرك/.test(q)) return { html: `الشركة المشغّلة لحقل ${fieldLink(field)}: <b>${field.company}</b>`, fieldIds:[field.id] };
    if (/حاله|الحاله/.test(q)) return { html: `حالة حقل ${fieldLink(field)}: <b>${field.status}</b>`, fieldIds:[field.id] };
    if (/احداثي|اين يقع|موقع|محافظ/.test(q)) return { html: `يقع حقل ${fieldLink(field)} في محافظة <b>${field.governorate}</b> — الإحداثيات: <span class="mono">${field.lat}, ${field.lng}</span>`, fieldIds:[field.id] };
    if (/تكوين/.test(q)) return { html: `التكوينات المنتجة في حقل ${fieldLink(field)}: <b>${(field.formations||[]).join("، ")}</b>`, fieldIds:[field.id] };

    // ملخص عام إذا لم يُحدَّد سؤال دقيق
    return {
      html: `${fieldLink(field)} — ${field.governorate} · ${field.type} · ${field.status}<br>${field.description}<br>
      يمكنك سؤالي أيضاً عن: الصخور المصدرية، الخزان، الغطاء، العمر الجيولوجي، العمق، الشركة المشغّلة لهذا الحقل.`,
      fieldIds: [field.id]
    };
  }

  // 5) بحث عام احتياطي
  const tokens = q.split(" ").filter(t => t.length >= 3);
  const matches = ALL_FIELDS.filter(f => tokens.some(t => f._blob.includes(t)));
  if (matches.length) {
    return {
      html: `لم أفهم السؤال بدقة، لكن وجدت حقولاً قد تكون ذات صلة: ` + matches.slice(0,5).map(fieldLink).join("، "),
      fieldIds: matches.slice(0,5).map(f => f.id)
    };
  }

  return {
    html: `لم أجد إجابة مباشرة لهذا السؤال. جرّب صياغة أوضح، مثل: «ما هي الصخور المصدرية في حقل X؟» أو استخدم مربع البحث وفلاتر الشريط الجانبي.`,
    fieldIds: []
  };
}

/* ---------------------------------------------------------
   التشغيل
--------------------------------------------------------- */
(async function main() {
  await loadData();
  initMap();
  renderMarkers(ALL_FIELDS);
  renderFieldList(ALL_FIELDS);
  updateResultsCount(ALL_FIELDS.length);
  renderStats();
  initFilters();
  initGlobalSearch();
  initChat();

  document.getElementById("sidebarToggleMobile").addEventListener("click", () => {
    document.getElementById("sidebar").classList.toggle("open-mobile");
    document.getElementById("sidebar").style.display =
      document.getElementById("sidebar").style.display === "block" ? "" : "block";
  });
})();
