/* =========================================================
   صفحة تفاصيل الحقل — field.js
   ========================================================= */

function normalizeAr(str) {
  if (!str) return "";
  return str.toString()
    .replace(/[\u064B-\u065F\u0670]/g, "")
    .replace(/[أإآ]/g, "ا").replace(/ة/g, "ه").replace(/ى/g, "ي")
    .replace(/[^\u0600-\u06FF0-9a-zA-Z\s]/g, " ")
    .replace(/\s+/g, " ").trim().toLowerCase();
}

function getParam(name) {
  return new URLSearchParams(window.location.search).get(name);
}

function badgeClass(f) { return f.type === "غاز" ? "gas" : "oil"; }

function renderField(f, allFields) {
  document.title = `${f.name} — خريطة الحقول النفطية العراقية`;
  document.getElementById("crumbName").textContent = f.name;

  const relatedByFormation = allFields.filter(o =>
    o.id !== f.id && (o.formations || []).some(form => (f.formations || []).includes(form))
  ).slice(0, 6);

  const imagesHtml = (f.images && f.images.length)
    ? f.images.map(src => `<img src="${src}" alt="${f.name}" loading="lazy">`).join("")
    : `<div class="no-img"><img src="icons/no-image.svg" alt="لا توجد صورة متاحة"></div>`;

  document.getElementById("fieldContent").innerHTML = `
    <div class="field-hero">
      <div>
        <h1>${f.name}</h1>
        <div class="sub">${f.governorate} · الشركة المشغّلة: ${f.company}</div>
        <div class="badges">
          <span class="badge ${badgeClass(f)}">${f.type}</span>
          <span class="badge oil" style="background:rgba(255,255,255,.08); color:var(--slate-300); border-color:var(--line);">${f.status}</span>
        </div>
        <p class="desc">${f.description || ""}</p>
      </div>
      <div>
        <div class="mini-map" id="miniMap"></div>
        <div class="mini-map-caption">الإحداثيات: <span class="mono">${f.lat.toFixed(4)}, ${f.lng.toFixed(4)}</span></div>
      </div>
    </div>

    <div class="info-grid">
      <div class="info-card"><div class="k">نوع الحقل</div><div class="v">${f.type}</div></div>
      <div class="info-card"><div class="k">الحالة</div><div class="v">${f.status}</div></div>
      <div class="info-card"><div class="k">العمر الجيولوجي</div><div class="v">${f.age}</div></div>
      <div class="info-card"><div class="k">العمق التقريبي</div><div class="v">${f.depth}</div></div>
      <div class="info-card"><div class="k">درجة API</div><div class="v">${f.api || "—"}</div></div>
      <div class="info-card"><div class="k">الصخر الغطاء</div><div class="v" style="font-size:.85rem;">${f.cap_rock}</div></div>
    </div>

    <div class="section-block">
      <h2>جدول التكوينات والصخور الخزنية</h2>
      <table class="data-table">
        <thead><tr><th>التكوينات المنتجة</th><th>نوع الصخر الخزني</th><th>الصخر الغطاء</th></tr></thead>
        <tbody>
          <tr>
            <td>${(f.formations || []).join("، ")}</td>
            <td>${f.reservoir}</td>
            <td>${f.cap_rock}</td>
          </tr>
        </tbody>
      </table>
    </div>

    <div class="section-block">
      <h2>جدول الصخور المصدرية</h2>
      <table class="data-table">
        <thead><tr><th>الصخر المصدري</th><th>العمر الجيولوجي المرتبط</th></tr></thead>
        <tbody>
          ${(f.source_rocks || []).map(sr => `<tr><td>${sr}</td><td>${f.age}</td></tr>`).join("")}
        </tbody>
      </table>
    </div>

    <div class="section-block">
      <h2>صور الحقل</h2>
      <div class="image-grid">${imagesHtml}</div>
      <div class="notes-box" style="margin-top:12px;">لا تتوفر صور موثّقة لهذا الحقل ضمن قاعدة البيانات الحالية. يمكن إضافة صور حقيقية لاحقاً بوضعها داخل مجلد <code class="mono">images/</code> وربطها في <code class="mono">data.json</code>.</div>
    </div>

    ${relatedByFormation.length ? `
    <div class="section-block">
      <h2>حقول أخرى تشترك في نفس التكوين المنتج</h2>
      <div class="chip-list">
        ${relatedByFormation.map(o => `<a class="chip" href="field.html?id=${o.id}" style="text-decoration:none;">${o.name}</a>`).join("")}
      </div>
    </div>` : ""}

    <div class="section-block">
      <h2>المراجع</h2>
      <ul class="ref-list">
        ${(f.references || []).map(r => `<li>${r}</li>`).join("")}
      </ul>
    </div>

    <div class="section-block">
      <h2>ملاحظات جيولوجية</h2>
      <div class="notes-box">
        بعض القيم الجيولوجية والتشغيلية في هذه الصفحة (خصوصاً نطاقات العمق والإحداثيات الدقيقة ودرجة API) تقديرية استناداً إلى الأدبيات العامة المتاحة،
        وتحتاج تدقيقاً رسمياً من وزارة النفط العراقية أو الشركة المشغّلة قبل استخدامها في تقارير فنية أو تعاقدية.
      </div>
    </div>
  `;

  const mini = L.map("miniMap", { zoomControl: false, dragging: false, scrollWheelZoom: false, attributionControl: false })
    .setView([f.lat, f.lng], 7);
  L.tileLayer("https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png", { subdomains: "abcd" }).addTo(mini);
  const icon = L.icon({
    iconUrl: f.type === "غاز" ? "icons/marker-gas.svg" : "icons/marker-oil.svg",
    iconSize: [26, 34], iconAnchor: [13, 34]
  });
  L.marker([f.lat, f.lng], { icon }).addTo(mini);
}

(async function () {
  const id = getParam("id");
  const res = await fetch("data.json");
  const all = await res.json();
  const field = all.find(f => f.id === id) || all[0];
  if (!field) {
    document.getElementById("fieldContent").innerHTML = `<p>لم يتم العثور على الحقل المطلوب.</p>`;
    return;
  }
  renderField(field, all);
})();
