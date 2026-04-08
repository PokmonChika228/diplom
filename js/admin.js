(function () {
  /* ===================== UTIL ===================== */
  function fmt(n) {
    return Math.round(Number(n) || 0)
      .toString()
      .replace(/\B(?=(\d{3})+(?!\d))/g, "\u00a0") + "\u00a0₽";
  }

  function esc(s) {
    const d = document.createElement("div");
    d.textContent = s;
    return d.innerHTML;
  }

  function fmtDate(iso) {
    if (!iso) return "—";
    const d = new Date(iso);
    return d.toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit", year: "2-digit" }) +
      " " + d.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });
  }

  function catLabel(cat) {
    const MAP = { mens: "Мужское", womens: "Женское", unisex: "Унисекс", accessories: "Аксессуары", other: "Другое" };
    return MAP[cat] || cat;
  }

  /* ===================== AUTH ===================== */
  const token = sessionStorage.getItem("adminToken") || "";
  const headers = { "Content-Type": "application/json", "x-admin-token": token };

  function authFetch(url, opts) {
    opts = opts || {};
    return fetch(url, Object.assign({}, opts, {
      headers: Object.assign({}, opts.headers || {}, headers),
    }));
  }

  document.getElementById("admin-logout") && document.getElementById("admin-logout").addEventListener("click", function () {
    sessionStorage.removeItem("adminToken");
    window.location.href = "admin-login.html";
  });

  /* ===================== TABS ===================== */
  const tabLinks = document.querySelectorAll(".nav-tab");
  const tabPanels = document.querySelectorAll(".admin-tab");

  function showTab(name) {
    tabLinks.forEach(function (l) { l.classList.toggle("is-active", l.dataset.tab === name); });
    tabPanels.forEach(function (p) { p.hidden = p.id !== "tab-" + name; });
    sessionStorage.setItem("adminActiveTab", name);
    if (name === "analytics") loadAnalytics();
    if (name === "products") loadProducts();
    if (name === "inventory") loadInventory();
    if (name === "orders") loadOrders();
    if (name === "promocodes") loadPromos();
    if (name === "interface") loadUiSettings();
  }

  tabLinks.forEach(function (l) {
    l.addEventListener("click", function (e) {
      e.preventDefault();
      showTab(l.dataset.tab);
    });
  });

  /* ===================== LOAD ALL ===================== */
  var DB = { products: [], inventory: {}, orders: [], promos: [], analytics: {} };

  function loadAll() {
    authFetch("/api/admin/dashboard").then(function (r) {
      if (r.status === 401) { window.location.href = "admin-login.html"; return; }
      if (!r.ok) throw new Error();
      return r.json();
    }).then(function (data) {
      if (!data) return;
      DB = data;
      syncProductSelect();
      showTab(sessionStorage.getItem("adminActiveTab") || "products");
    }).catch(function () {
      alert("Не удалось загрузить данные. Проверьте авторизацию.");
    });
  }

  /* ===================== PRODUCTS ===================== */
  function loadProducts() {
    var tbody = document.querySelector("#products-table tbody");
    if (!tbody) return;
    tbody.innerHTML = "";
    (DB.products || []).forEach(function (p) {
      var tr = document.createElement("tr");
      var saleLabel = p.sale ? '<span style="color:var(--color-sale)">●</span>' : "—";
      tr.innerHTML =
        "<td>" + p.id + "</td>" +
        "<td><strong>" + esc(p.name) + "</strong></td>" +
        "<td>" + esc(catLabel(p.category)) + "</td>" +
        "<td>" + saleLabel + "</td>" +
        "<td>" + (p.oldPrice > 0 ? fmt(p.oldPrice) : "—") + "</td>" +
        "<td>" + fmt(p.price) + "</td>" +
        "<td>" + (p.priceUsd > 0 ? "$" + Number(p.priceUsd).toLocaleString("en-US") : "—") + "</td>" +
        "<td" + (p.stock <= 5 ? ' style="color:var(--color-sale)"' : "") + ">" + p.stock + "</td>" +
        '<td class="actions">' +
          '<button class="btn btn--outline" style="padding:4px 10px;font-size:0.75rem;color:var(--color-sale)" onclick="deleteProduct(' + p.id + ')">✕</button>' +
        "</td>";
      tbody.appendChild(tr);
    });
  }

  window.deleteProduct = function (id) {
    if (!confirm("Удалить товар?")) return;
    authFetch("/api/products/" + id, { method: "DELETE" }).then(function (r) {
      if (!r.ok) { alert("Ошибка удаления"); return; }
      DB.products = (DB.products || []).filter(function (p) { return p.id !== id; });
      syncProductSelect();
      loadProducts();
    });
  };

  /* ===================== INVENTORY ===================== */
  function syncProductSelect() {
    var sel = document.querySelector("[name='productId']");
    if (!sel) return;
    var prev = sel.value;
    sel.innerHTML = (DB.products || []).map(function (p) {
      return "<option value='" + p.id + "'>" + esc(p.name) + " (" + p.stock + " шт.)</option>";
    }).join("");
    if (prev) sel.value = prev;
  }

  function loadInventory() {
    var inv = DB.inventory || {};
    var products = inv.products || DB.products || [];
    var logs = inv.logs || [];

    var tbody = document.querySelector("#inventory-table tbody");
    if (tbody) {
      tbody.innerHTML = "";
      products.forEach(function (p) {
        var cls = p.stock === 0 ? "status-badge cancelled" : (p.stock <= 5 ? "status-badge processing" : "status-badge done");
        var label = p.stock === 0 ? "Нет" : (p.stock <= 5 ? "Мало" : "ОК");
        var tr = document.createElement("tr");
        tr.innerHTML = "<td>" + p.id + "</td><td>" + esc(p.name) + "</td><td>" + esc(catLabel(p.category)) + "</td><td><strong>" + p.stock + "</strong></td><td><span class='" + cls + "'>" + label + "</span></td>";
        tbody.appendChild(tr);
      });
    }

    var ltbody = document.querySelector("#logs-table tbody");
    if (ltbody) {
      ltbody.innerHTML = "";
      logs.forEach(function (l) {
        var product = (DB.products || []).find(function (p) { return p.id === l.productId; }) || {};
        var tr = document.createElement("tr");
        tr.innerHTML = "<td>" + fmtDate(l.createdAt) + "</td><td>" + esc(product.name || ("ID " + l.productId)) + "</td><td>+" + l.qty + "</td><td>" + esc(l.note || "—") + "</td>";
        ltbody.appendChild(tr);
      });
    }
  }

  var deliveryForm = document.getElementById("delivery-form");
  if (deliveryForm) {
    deliveryForm.addEventListener("submit", function (e) {
      e.preventDefault();
      var fd = new FormData(e.target);
      authFetch("/api/inventory/delivery", {
        method: "POST",
        body: JSON.stringify({
          productId: parseInt(fd.get("productId"), 10),
          qty: parseInt(fd.get("qty"), 10),
          note: fd.get("note"),
        }),
      }).then(function (r) {
        if (!r.ok) { alert("Ошибка"); return; }
        e.target.reset();
        authFetch("/api/admin/dashboard").then(function (fr) {
          if (fr.ok) return fr.json().then(function (d) { DB = d; syncProductSelect(); loadInventory(); });
        });
      });
    });
  }

  /* ===================== ORDERS ===================== */
  var orderSearch = "";

  var STATUS_MAP = { new: "Новый", processing: "В обработке", shipped: "Отправлен", done: "Выполнен", cancelled: "Отменён" };

  function renderOrders(orders) {
    var tbody = document.querySelector("#orders-table tbody");
    if (!tbody) return;
    tbody.innerHTML = "";
    (orders || []).forEach(function (o) {
      var items = (o.items || []).map(function (it) { return esc(it.productName) + " ×" + it.qty; }).join("<br>");
      var promoInfo = o.promoCode ? '<span style="color:var(--color-sale)">' + esc(o.promoCode) + "</span><br>–" + fmt(o.discountAmount || 0) : "—";
      var totalInfo = fmt(o.subtotal || 0) + " товары<br>" + fmt(o.deliveryCost || 0) + " дост." +
        (o.discountAmount ? "<br>–" + fmt(o.discountAmount) + " скидка" : "") +
        "<br><strong>" + fmt(o.total || 0) + "</strong>";

      var statusOpts = Object.keys(STATUS_MAP).map(function (s) {
        return "<option value='" + s + "'" + (o.status === s ? " selected" : "") + ">" + STATUS_MAP[s] + "</option>";
      }).join("");

      var tr = document.createElement("tr");
      tr.innerHTML =
        "<td><strong>#" + o.id + "</strong></td>" +
        "<td style='white-space:nowrap'>" + fmtDate(o.createdAt) + "</td>" +
        "<td>" + esc(o.customerName) + "</td>" +
        "<td style='font-size:0.8rem'>" + esc(o.phone || "") + "<br>" + esc(o.email || "") + "<br><span style='color:var(--color-text-muted)'>" + esc(o.address || "") + "</span></td>" +
        "<td>" + esc(o.deliveryLabel || o.delivery || "—") + "<br><span style='color:var(--color-text-muted);font-size:0.8rem'>" + (o.deliveryCost === 0 ? "Бесплатно" : fmt(o.deliveryCost || 0)) + "</span></td>" +
        "<td>" + esc(o.paymentLabel || o.payment || "—") + "</td>" +
        "<td style='font-size:0.8rem'>" + items + "</td>" +
        "<td style='font-size:0.8rem'>" + promoInfo + "</td>" +
        "<td style='font-size:0.8rem'>" + totalInfo + "</td>" +
        "<td><select class='select status-select' onchange='updateStatus(" + o.id + ", this.value)'>" + statusOpts + "</select></td>";
      tbody.appendChild(tr);
    });
  }

  function loadOrders() {
    var orders = (DB.orders || []).slice();
    if (orderSearch) {
      var q = orderSearch.trim().toLowerCase();
      orders = orders.filter(function (o) {
        return String(o.id) === q ||
          String(o.customerName || "").toLowerCase().indexOf(q) >= 0 ||
          String(o.email || "").toLowerCase().indexOf(q) >= 0;
      });
    }
    renderOrders(orders);
  }

  var orderSearchForm = document.getElementById("order-search-form");
  if (orderSearchForm) {
    orderSearchForm.addEventListener("submit", function (e) {
      e.preventDefault();
      orderSearch = new FormData(e.target).get("orderId") || "";
      loadOrders();
    });
  }

  window.updateStatus = function (id, status) {
    authFetch("/api/orders/" + id + "/status", {
      method: "PUT",
      body: JSON.stringify({ status: status }),
    }).then(function (r) {
      if (!r.ok) { alert("Ошибка смены статуса"); return; }
      var order = (DB.orders || []).find(function (o) { return o.id === id; });
      if (order) order.status = status;
    });
  };

  /* ===================== PROMOCODES ===================== */
  function loadPromos() {
    var tbody = document.querySelector("#promos-table tbody");
    if (!tbody) return;
    tbody.innerHTML = "";
    (DB.promos || []).forEach(function (p) {
      var valLabel = p.type === "percent" ? p.value + "%" : fmt(p.value);
      var activeLabel = p.active
        ? '<span class="status-badge done">Активен</span>'
        : '<span class="status-badge cancelled">Неактивен</span>';
      var tr = document.createElement("tr");
      tr.innerHTML =
        "<td>" + p.id + "</td>" +
        "<td><strong>" + esc(p.code) + "</strong></td>" +
        "<td>" + (p.type === "percent" ? "Процент" : "Фиксированный") + "</td>" +
        "<td>" + valLabel + "</td>" +
        "<td>" + activeLabel + "</td>" +
        "<td style='white-space:nowrap'>" + fmtDate(p.createdAt) + "</td>" +
        '<td class="actions">' +
          '<button class="btn btn--outline" style="padding:4px 10px;font-size:0.75rem" onclick="togglePromo(' + p.id + ')">' + (p.active ? "Откл." : "Вкл.") + "</button> " +
          '<button class="btn btn--outline" style="padding:4px 10px;font-size:0.75rem;color:var(--color-sale)" onclick="deletePromo(' + p.id + ')">✕</button>' +
        "</td>";
      tbody.appendChild(tr);
    });
  }

  var promoForm = document.getElementById("promo-form");
  if (promoForm) {
    promoForm.addEventListener("submit", function (e) {
      e.preventDefault();
      var fd = new FormData(e.target);
      authFetch("/api/promocodes", {
        method: "POST",
        body: JSON.stringify({
          code: String(fd.get("code") || "").trim().toUpperCase(),
          type: fd.get("type"),
          value: parseInt(fd.get("value"), 10),
        }),
      }).then(function (r) {
        if (!r.ok) { return r.json().catch(function () { return {}; }).then(function (d) { alert(d.error || "Ошибка"); }); }
        return r.json().then(function (promo) {
          DB.promos = DB.promos || [];
          DB.promos.push(promo);
          loadPromos();
          e.target.reset();
        });
      });
    });
  }

  window.togglePromo = function (id) {
    var p = (DB.promos || []).find(function (x) { return x.id === id; });
    if (!p) return;
    authFetch("/api/promocodes/" + id, {
      method: "PUT",
      body: JSON.stringify({ active: !p.active }),
    }).then(function (r) {
      if (!r.ok) { alert("Ошибка"); return; }
      return r.json().then(function (updated) {
        var idx = (DB.promos || []).findIndex(function (x) { return x.id === id; });
        if (idx >= 0) DB.promos[idx] = updated;
        loadPromos();
      });
    });
  };

  window.deletePromo = function (id) {
    if (!confirm("Удалить промокод?")) return;
    authFetch("/api/promocodes/" + id, { method: "DELETE" }).then(function (r) {
      if (!r.ok) { alert("Ошибка"); return; }
      DB.promos = (DB.promos || []).filter(function (p) { return p.id !== id; });
      loadPromos();
    });
  };

  /* ===================== ANALYTICS ===================== */
  function loadAnalytics() {
    var a = DB.analytics || {};
    function setText(id, val) {
      var el = document.getElementById(id);
      if (el) el.textContent = val;
    }
    setText("kpi-orders", a.totalOrders != null ? a.totalOrders : 0);
    setText("kpi-items", a.totalItemsSold != null ? a.totalItemsSold : 0);
    setText("kpi-products", a.totalProducts != null ? a.totalProducts : 0);
    setText("kpi-revenue", fmt(a.totalRevenue || 0));
    setText("kpi-avg", fmt(a.avgOrderValue || 0));
    setText("kpi-discounts", fmt(a.totalDiscounts || 0));
    setText("kpi-promo", a.ordersWithPromo != null ? a.ordersWithPromo : 0);
    setText("kpi-stock", a.totalStock != null ? a.totalStock : 0);
    setText("kpi-lowstock", (a.lowStockProducts || []).length);

    drawChart(a.byDay || []);
    renderBreakdown("status-breakdown", formatStatusBreakdown(a.byStatus || {}));
    renderBreakdown("delivery-breakdown", (a.byDelivery || []).map(function (x) { return { label: x.method, value: x.count }; }));
    renderBreakdown("payment-breakdown", (a.byPayment || []).map(function (x) { return { label: x.method, value: x.count }; }));
    renderCategoryBreakdown(a.byCategory || []);
    renderLowStock(a.lowStockProducts || []);

    var rateEl = document.getElementById("kpi-exchange-rate");
    if (rateEl) {
      fetch("/api/exchange-rate").then(function (r) { return r.json(); }).then(function (d) {
        rateEl.textContent = d.rate ? d.rate.toFixed(2) + " ₽/$ " + (d.fromCache ? "(кэш)" : "(ЦБ РФ)") : "—";
      }).catch(function () { rateEl.textContent = "—"; });
    }

    var topQtyEl = document.getElementById("top-qty");
    if (topQtyEl) {
      topQtyEl.innerHTML = (a.topByQty || []).map(function (x) { return "<li>" + esc(x.productName) + " — <strong>" + x.qty + " шт.</strong></li>"; }).join("") || "<li>Нет данных</li>";
    }
    var topRevEl = document.getElementById("top-revenue");
    if (topRevEl) {
      topRevEl.innerHTML = (a.topByRevenue || []).map(function (x) { return "<li>" + esc(x.productName) + " — <strong>" + fmt(x.revenue) + "</strong></li>"; }).join("") || "<li>Нет данных</li>";
    }
  }

  function formatStatusBreakdown(byStatus) {
    var LABELS = { new: "Новый", processing: "В обработке", shipped: "Отправлен", done: "Выполнен", cancelled: "Отменён" };
    return Object.keys(byStatus).map(function (k) { return { label: LABELS[k] || k, value: byStatus[k] }; });
  }

  function renderBreakdown(containerId, rows) {
    var el = document.getElementById(containerId);
    if (!el) return;
    if (!rows.length) { el.innerHTML = '<p style="color:var(--color-text-muted);font-size:0.875rem">Нет данных</p>'; return; }
    var max = Math.max.apply(null, rows.map(function (r) { return r.value; }).concat([1]));
    el.innerHTML = rows.map(function (r) {
      return '<div class="breakdown-row"><span>' + esc(r.label) + '</span><strong style="margin-left:8px">' + r.value + '</strong></div>' +
        '<div class="breakdown-bar"><div class="breakdown-bar-fill" style="width:' + Math.round((r.value / max) * 100) + '%"></div></div>';
    }).join("");
  }

  function renderCategoryBreakdown(rows) {
    var el = document.getElementById("category-breakdown");
    if (!el) return;
    if (!rows.length) { el.innerHTML = '<p style="color:var(--color-text-muted);font-size:0.875rem">Нет данных</p>'; return; }
    var max = Math.max.apply(null, rows.map(function (r) { return r.revenue; }).concat([1]));
    el.innerHTML = rows.map(function (r) {
      return '<div class="breakdown-row"><span>' + esc(catLabel(r.category)) + '</span><strong style="margin-left:8px">' + fmt(r.revenue) + '</strong></div>' +
        '<div class="breakdown-bar"><div class="breakdown-bar-fill success" style="width:' + Math.round((r.revenue / max) * 100) + '%"></div></div>';
    }).join("");
  }

  function renderLowStock(products) {
    var el = document.getElementById("lowstock-list");
    if (!el) return;
    if (!products.length) { el.innerHTML = '<p style="color:var(--color-success);font-size:0.875rem">Всё в норме ✓</p>'; return; }
    el.innerHTML = products.map(function (p) {
      return '<div class="breakdown-row"><span>' + esc(p.name) + '</span><strong style="color:' + (p.stock === 0 ? "var(--color-sale)" : "var(--color-text)") + ';margin-left:8px">' + p.stock + ' шт.</strong></div>';
    }).join("");
  }

  /* ===================== CHART ===================== */
  var rawByDay = [];
  var chartPeriod = "day";

  function groupByPeriod(byDay, period) {
    if (period === "day") return byDay;
    var map = new Map();
    byDay.forEach(function (d) {
      var key;
      if (period === "month") {
        key = d.date.slice(0, 7);
      } else {
        var dt = new Date(d.date);
        var day = dt.getDay();
        var diff = dt.getDate() - day + (day === 0 ? -6 : 1);
        var mon = new Date(dt);
        mon.setDate(diff);
        key = mon.toISOString().slice(0, 10);
      }
      map.set(key, (map.get(key) || 0) + d.revenue);
    });
    return Array.from(map.entries())
      .map(function (e) { return { date: e[0], revenue: e[1] }; })
      .sort(function (a, b) { return a.date > b.date ? 1 : -1; });
  }

  function formatLabel(dateStr, period) {
    if (period === "month") {
      var parts = dateStr.split("-");
      var months = ["Янв","Фев","Мар","Апр","Май","Июн","Июл","Авг","Сен","Окт","Ноя","Дек"];
      return months[parseInt(parts[1], 10) - 1] + " " + parts[0].slice(2);
    }
    if (period === "week") {
      return dateStr.slice(5).replace("-", ".");
    }
    return dateStr.slice(5).replace("-", ".");
  }

  function drawChart(byDay) {
    rawByDay = byDay || [];
    renderChart();
  }

  function renderChart() {
    var canvas = document.getElementById("sales-chart");
    if (!canvas) return;
    var ctx = canvas.getContext("2d");
    var dpr = window.devicePixelRatio || 1;
    canvas.style.width = "";
    canvas.style.height = "";
    var cssW = canvas.offsetWidth || parseInt(canvas.getAttribute("width"), 10) || 600;
    var cssH = parseInt(canvas.getAttribute("height"), 10) || 260;
    canvas.width = cssW * dpr;
    canvas.height = cssH * dpr;
    canvas.style.width = cssW + "px";
    canvas.style.height = cssH + "px";
    ctx.scale(dpr, dpr);
    var W = cssW;
    var H = cssH;
    ctx.clearRect(0, 0, W, H);

    var data = groupByPeriod(rawByDay, chartPeriod);

    if (!data.length) {
      ctx.fillStyle = "#555";
      ctx.font = "14px Manrope, sans-serif";
      ctx.textAlign = "center";
      ctx.fillText("Нет данных за период", W / 2, H / 2);
      return;
    }

    var pad = { t: 24, r: 24, b: 46, l: 72 };
    var maxVal = Math.max.apply(null, data.map(function (d) { return d.revenue; }).concat([1]));
    var areaW = W - pad.l - pad.r;
    var areaH = H - pad.t - pad.b;
    var stepX = areaW / Math.max(data.length - 1, 1);
    var scaleY = areaH / maxVal;
    var GRID = 5;

    ctx.strokeStyle = "rgba(255,255,255,0.06)";
    ctx.lineWidth = 1;
    for (var g = 0; g <= GRID; g++) {
      var gy = pad.t + (g / GRID) * areaH;
      ctx.beginPath();
      ctx.moveTo(pad.l, gy);
      ctx.lineTo(W - pad.r, gy);
      ctx.stroke();
      var val = maxVal * (1 - g / GRID);
      var label = val >= 1000000 ? (val / 1000000).toFixed(1) + "М" : (val / 1000).toFixed(0) + "к";
      ctx.fillStyle = "#777";
      ctx.font = "11px Manrope, sans-serif";
      ctx.textAlign = "right";
      ctx.fillText(label, pad.l - 8, gy + 4);
    }

    ctx.beginPath();
    data.forEach(function (d, i) {
      var x = pad.l + i * stepX;
      var y = H - pad.b - d.revenue * scaleY;
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    });
    ctx.strokeStyle = "rgba(220,220,220,0.9)";
    ctx.lineWidth = 2;
    ctx.lineJoin = "round";
    ctx.stroke();

    var lastX = pad.l + (data.length - 1) * stepX;
    var grad = ctx.createLinearGradient(0, pad.t, 0, H - pad.b);
    grad.addColorStop(0, "rgba(200,200,200,0.22)");
    grad.addColorStop(1, "rgba(200,200,200,0)");
    ctx.lineTo(lastX, H - pad.b);
    ctx.lineTo(pad.l, H - pad.b);
    ctx.closePath();
    ctx.fillStyle = grad;
    ctx.fill();

    var maxLabels = Math.floor(areaW / 50);
    var step = data.length <= maxLabels ? 1 : Math.ceil(data.length / maxLabels);
    ctx.fillStyle = "#777";
    ctx.font = "10px Manrope, sans-serif";
    ctx.textAlign = "center";
    data.forEach(function (d, i) {
      if (i % step !== 0 && i !== data.length - 1) return;
      ctx.fillText(formatLabel(d.date, chartPeriod), pad.l + i * stepX, H - pad.b + 16);
    });

    var dotStep = data.length <= 60 ? 1 : Math.ceil(data.length / 60);
    ctx.fillStyle = "#fff";
    data.forEach(function (d, i) {
      if (i % dotStep !== 0) return;
      ctx.beginPath();
      ctx.arc(pad.l + i * stepX, H - pad.b - d.revenue * scaleY, 2.5, 0, Math.PI * 2);
      ctx.fill();
    });
  }

  document.querySelectorAll(".chart-period-btn").forEach(function (btn) {
    btn.addEventListener("click", function () {
      chartPeriod = btn.dataset.period;
      document.querySelectorAll(".chart-period-btn").forEach(function (b) { b.classList.remove("is-active"); });
      btn.classList.add("is-active");
      renderChart();
    });
  });

  /* ===================== SIMULATION ===================== */
  var btnParse = document.getElementById("btn-parse-vitrine");
  if (btnParse) {
    btnParse.addEventListener("click", function () {
      var statusEl = document.getElementById("parse-status");
      var resultEl = document.getElementById("parse-result");
      var countInput = document.getElementById("parse-count");
      var forceInput = document.getElementById("parse-force");
      var count = parseInt((countInput && countInput.value) || "10", 10);
      var force = !!(forceInput && forceInput.checked);
      btnParse.disabled = true;
      if (statusEl) statusEl.textContent = "Загружаю данные…";
      if (resultEl) resultEl.style.display = "none";
      authFetch("/api/admin/parse-vitrine", {
        method: "POST",
        body: JSON.stringify({ count: count, force: force }),
      })
        .then(function (r) { return r.json().catch(function () { return {}; }).then(function (d) { return { ok: r.ok, data: d }; }); })
        .then(function (res) {
          if (!res.ok) throw new Error(res.data.error || "Ошибка");
          var data = res.data;
          var el = function (id) { return document.getElementById(id); };
          if (el("parse-added")) el("parse-added").textContent = data.added != null ? data.added : 0;
          if (el("parse-skipped")) el("parse-skipped").textContent = data.skipped != null ? data.skipped : 0;
          var sourceLabels = { "vitrine.market": "vitrine.market", demo: "Демо-каталог", fallback: "Демо-каталог" };
          if (el("parse-source")) el("parse-source").textContent = sourceLabels[data.source] || data.source || "—";
          if (resultEl) resultEl.style.display = "";
          if (statusEl) statusEl.textContent = "Готово! Добавлено " + (data.added || 0) + " товаров.";
          return authFetch("/api/admin/dashboard").then(function (fr) {
            if (fr.ok) return fr.json().then(function (d) { DB = d; syncProductSelect(); });
          });
        })
        .catch(function (err) {
          if (statusEl) statusEl.textContent = "Ошибка: " + (err.message || "неизвестная");
        })
        .finally(function () { btnParse.disabled = false; });
    });
  }

  var btnGenOrders = document.getElementById("btn-gen-orders");
  if (btnGenOrders) {
    btnGenOrders.addEventListener("click", function () {
      var statusEl = document.getElementById("gen-orders-status");
      var resultEl = document.getElementById("gen-orders-result");
      var countInput = document.getElementById("gen-orders-count");
      var count = parseInt((countInput && countInput.value) || "10", 10);
      btnGenOrders.disabled = true;
      if (statusEl) statusEl.textContent = "Генерирую заказы…";
      if (resultEl) resultEl.style.display = "none";
      authFetch("/api/admin/generate-orders", {
        method: "POST",
        body: JSON.stringify({ count: count }),
      })
        .then(function (r) { return r.json().catch(function () { return {}; }).then(function (d) { return { ok: r.ok, data: d }; }); })
        .then(function (res) {
          if (!res.ok) throw new Error(res.data.error || "Ошибка");
          var data = res.data;
          var el = function (id) { return document.getElementById(id); };
          if (el("gen-orders-added")) el("gen-orders-added").textContent = data.generated != null ? data.generated : 0;
          if (statusEl) statusEl.textContent = "Готово! Создано " + (data.generated || 0) + " заказов.";
          return authFetch("/api/admin/dashboard").then(function (fr) {
            if (fr.ok) return fr.json().then(function (d) {
              DB = d;
              syncProductSelect();
              var totalEl = document.getElementById("gen-orders-total");
              if (totalEl) totalEl.textContent = (d.orders || []).length;
              if (resultEl) resultEl.style.display = "";
            });
          });
        })
        .catch(function (err) {
          if (statusEl) statusEl.textContent = "Ошибка: " + (err.message || "неизвестная");
        })
        .finally(function () { btnGenOrders.disabled = false; });
    });
  }

  /* ===================== INTERFACE SETTINGS ===================== */
  function loadUiSettings() {
    authFetch("/api/ui-settings").then(function (r) {
      if (!r.ok) return;
      return r.json().then(function (s) {
        var tickerEnabled = document.getElementById("ticker-enabled");
        var tickerText = document.getElementById("ticker-text");
        var tickerPreviewWrap = document.getElementById("ticker-preview-wrap");
        var tickerPreviewText = document.getElementById("ticker-preview-text");
        if (tickerEnabled) tickerEnabled.checked = !!(s.ticker && s.ticker.enabled);
        if (tickerText) tickerText.value = (s.ticker && s.ticker.text) || "";
        if (tickerPreviewWrap && tickerPreviewText && s.ticker && s.ticker.text) {
          tickerPreviewText.textContent = s.ticker.text;
          tickerPreviewWrap.style.display = "";
        }
        var heroUrl = document.getElementById("hero-url");
        var heroPreviewWrap = document.getElementById("hero-preview-wrap");
        var heroPreviewImg = document.getElementById("hero-preview-img");
        if (heroUrl) heroUrl.value = (s.heroImage && s.heroImage.src) || "";
        if (heroPreviewWrap && heroPreviewImg && s.heroImage && s.heroImage.src) {
          heroPreviewImg.src = s.heroImage.src;
          heroPreviewWrap.style.display = "";
        }
      });
    });
  }

  var btnSaveTicker = document.getElementById("btn-save-ticker");
  if (btnSaveTicker) {
    btnSaveTicker.addEventListener("click", function () {
      var enabled = !!(document.getElementById("ticker-enabled") || {}).checked;
      var text = (document.getElementById("ticker-text") || {}).value || "";
      var statusEl = document.getElementById("ticker-status");
      var previewWrap = document.getElementById("ticker-preview-wrap");
      var previewText = document.getElementById("ticker-preview-text");
      btnSaveTicker.disabled = true;
      if (statusEl) statusEl.textContent = "Сохраняю…";
      authFetch("/api/admin/ui-settings", {
        method: "POST",
        body: JSON.stringify({ ticker: { enabled: enabled, text: text } }),
      }).then(function (r) {
        return r.json().then(function (d) {
          if (!r.ok) throw new Error(d.error || "Ошибка");
          if (statusEl) statusEl.textContent = "Сохранено ✓";
          if (previewText) previewText.textContent = text;
          if (previewWrap) previewWrap.style.display = text ? "" : "none";
          setTimeout(function () { if (statusEl) statusEl.textContent = ""; }, 2500);
        });
      }).catch(function (err) {
        if (statusEl) statusEl.textContent = "Ошибка: " + err.message;
      }).finally(function () { btnSaveTicker.disabled = false; });
    });
  }

  var btnUploadHero = document.getElementById("btn-upload-hero");
  if (btnUploadHero) {
    btnUploadHero.addEventListener("click", function () {
      var fileInput = document.getElementById("hero-file");
      var statusEl = document.getElementById("hero-upload-status");
      var heroUrlInput = document.getElementById("hero-url");
      if (!fileInput || !fileInput.files || !fileInput.files[0]) {
        if (statusEl) statusEl.textContent = "Выберите файл";
        return;
      }
      var fd = new FormData();
      fd.append("image", fileInput.files[0]);
      btnUploadHero.disabled = true;
      if (statusEl) statusEl.textContent = "Загружаю…";
      fetch("/api/upload-image", { method: "POST", body: fd, credentials: "same-origin" })
        .then(function (r) { return r.json().then(function (d) { return { ok: r.ok, data: d }; }); })
        .then(function (res) {
          if (!res.ok) throw new Error(res.data.error || "Ошибка загрузки");
          if (heroUrlInput) heroUrlInput.value = res.data.url;
          if (statusEl) statusEl.textContent = "Загружено ✓";
          setTimeout(function () { if (statusEl) statusEl.textContent = ""; }, 2500);
        }).catch(function (err) {
          if (statusEl) statusEl.textContent = "Ошибка: " + err.message;
        }).finally(function () { btnUploadHero.disabled = false; });
    });
  }

  var btnSaveHero = document.getElementById("btn-save-hero");
  if (btnSaveHero) {
    btnSaveHero.addEventListener("click", function () {
      var src = (document.getElementById("hero-url") || {}).value || "";
      var statusEl = document.getElementById("hero-status");
      var previewWrap = document.getElementById("hero-preview-wrap");
      var previewImg = document.getElementById("hero-preview-img");
      btnSaveHero.disabled = true;
      if (statusEl) statusEl.textContent = "Сохраняю…";
      authFetch("/api/admin/ui-settings", {
        method: "POST",
        body: JSON.stringify({ heroImage: { src: src } }),
      }).then(function (r) {
        return r.json().then(function (d) {
          if (!r.ok) throw new Error(d.error || "Ошибка");
          if (statusEl) statusEl.textContent = "Сохранено ✓";
          if (previewImg) previewImg.src = src;
          if (previewWrap) previewWrap.style.display = src ? "" : "none";
          setTimeout(function () { if (statusEl) statusEl.textContent = ""; }, 2500);
        });
      }).catch(function (err) {
        if (statusEl) statusEl.textContent = "Ошибка: " + err.message;
      }).finally(function () { btnSaveHero.disabled = false; });
    });
  }

  /* ===================== CLEANUP ===================== */
  document.querySelectorAll("[data-cleanup]").forEach(function (btn) {
    btn.addEventListener("click", function () {
      var type = btn.dataset.cleanup;
      if (!type) return;
      var strong = btn.querySelector("strong");
      var msg = type === "all"
        ? "Полностью очистить базу данных? Все товары, заказы, промокоды и поставки будут удалены."
        : "Очистить «" + (strong ? strong.textContent : type) + "»?";
      if (!confirm(msg)) return;
      authFetch("/api/admin/cleanup", {
        method: "POST",
        body: JSON.stringify({ type: type }),
      }).then(function (r) {
        if (!r.ok) { alert("Ошибка очистки"); return; }
        return authFetch("/api/admin/dashboard").then(function (fr) {
          if (fr.ok) return fr.json().then(function (d) { DB = d; syncProductSelect(); alert("Очистка завершена."); });
        });
      });
    });
  });

  /* ===================== START ===================== */
  loadAll();
})();
