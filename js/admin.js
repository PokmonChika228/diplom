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
        "<td" + (p.stock <= 5 ? ' style="color:var(--color-sale)"' : "") + ">" + p.stock + "</td>" +
        '<td class="actions">' +
          '<button class="btn btn--outline" style="padding:4px 10px;font-size:0.75rem" onclick="editProduct(' + p.id + ')">✎</button> ' +
          '<button class="btn btn--outline" style="padding:4px 10px;font-size:0.75rem;color:var(--color-sale)" onclick="deleteProduct(' + p.id + ')">✕</button>' +
        "</td>";
      tbody.appendChild(tr);
    });
  }

  var productForm = document.getElementById("product-form");
  var productReset = document.getElementById("product-reset");

  if (productForm) {
    productForm.addEventListener("submit", function (e) {
      e.preventDefault();
      var fd = new FormData(productForm);
      var id = fd.get("id");
      var file = fd.get("imageFile");
      var imageUrl = fd.get("image") || "";

      function doSave(imgUrl) {
        var body = {
          name: fd.get("name"),
          category: fd.get("category"),
          price: parseInt(fd.get("price") || "0", 10),
          oldPrice: parseInt(fd.get("oldPrice") || "0", 10),
          stock: parseInt(fd.get("stock") || "0", 10),
          sale: !!fd.get("sale"),
          sizes: fd.get("sizes") ? fd.get("sizes").split(",").map(function (s) { return s.trim(); }).filter(Boolean) : [],
          colors: fd.get("colors") ? fd.get("colors").split(",").map(function (s) { return s.trim(); }).filter(Boolean) : [],
          image: imgUrl,
          description: fd.get("description"),
          composition: fd.get("composition"),
          care: fd.get("care"),
        };
        var url = id ? "/api/products/" + id : "/api/products";
        var method = id ? "PUT" : "POST";
        authFetch(url, { method: method, body: JSON.stringify(body) }).then(function (r) {
          if (!r.ok) return r.json().then(function (d) { alert(d.error || "Ошибка"); });
          return r.json().then(function (product) {
            if (id) {
              var idx = DB.products.findIndex(function (p) { return p.id === product.id; });
              if (idx >= 0) DB.products[idx] = product;
            } else {
              DB.products.push(product);
            }
            syncProductSelect();
            loadProducts();
            productForm.reset();
            productForm.querySelector('[name="id"]').value = "";
          });
        });
      }

      if (file && file.size > 0) {
        var uploadForm = new FormData();
        uploadForm.append("image", file);
        fetch("/api/upload", { method: "POST", headers: { "x-admin-token": token }, body: uploadForm })
          .then(function (ur) { return ur.json().catch(function () { return {}; }); })
          .then(function (ud) { doSave(ud.url || imageUrl); })
          .catch(function () { doSave(imageUrl); });
      } else {
        doSave(imageUrl);
      }
    });
  }

  if (productReset) {
    productReset.addEventListener("click", function () {
      productForm.reset();
      productForm.querySelector('[name="id"]').value = "";
    });
  }

  window.editProduct = function (id) {
    var p = (DB.products || []).find(function (x) { return x.id === id; });
    if (!p) return;
    var f = productForm;
    f.querySelector('[name="id"]').value = p.id;
    f.querySelector('[name="name"]').value = p.name || "";
    f.querySelector('[name="category"]').value = p.category || "other";
    f.querySelector('[name="price"]').value = p.price || 0;
    f.querySelector('[name="oldPrice"]').value = p.oldPrice || 0;
    f.querySelector('[name="stock"]').value = p.stock || 0;
    f.querySelector('[name="sale"]').checked = !!p.sale;
    f.querySelector('[name="sizes"]').value = (p.sizes || []).join(", ");
    f.querySelector('[name="colors"]').value = (p.colors || []).join(", ");
    f.querySelector('[name="image"]').value = p.image || "";
    f.querySelector('[name="description"]').value = p.description || "";
    f.querySelector('[name="composition"]').value = p.composition || "";
    f.querySelector('[name="care"]').value = p.care || "";
    showTab("products");
    f.scrollIntoView({ behavior: "smooth" });
  };

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
  function drawChart(byDay) {
    var canvas = document.getElementById("sales-chart");
    if (!canvas) return;
    var ctx = canvas.getContext("2d");
    var W = canvas.width;
    var H = canvas.height;
    ctx.clearRect(0, 0, W, H);

    if (!byDay.length) {
      ctx.fillStyle = "#555";
      ctx.font = "14px Manrope";
      ctx.textAlign = "center";
      ctx.fillText("Нет данных за период", W / 2, H / 2);
      return;
    }

    var pad = { t: 20, r: 20, b: 40, l: 64 };
    var maxVal = Math.max.apply(null, byDay.map(function (d) { return d.revenue; }).concat([1]));
    var stepX = (W - pad.l - pad.r) / Math.max(byDay.length - 1, 1);
    var scaleY = (H - pad.t - pad.b) / maxVal;
    var GRID = 4;

    ctx.strokeStyle = "rgba(255,255,255,0.07)";
    ctx.lineWidth = 1;
    for (var i = 0; i <= GRID; i++) {
      var y = pad.t + (i / GRID) * (H - pad.t - pad.b);
      ctx.beginPath();
      ctx.moveTo(pad.l, y);
      ctx.lineTo(W - pad.r, y);
      ctx.stroke();
      ctx.fillStyle = "#666";
      ctx.font = "11px Manrope";
      ctx.textAlign = "right";
      ctx.fillText(((maxVal * (1 - i / GRID)) / 1000).toFixed(0) + "к", pad.l - 6, y + 4);
    }

    ctx.beginPath();
    byDay.forEach(function (d, i) {
      var x = pad.l + i * stepX;
      var y = H - pad.b - d.revenue * scaleY;
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    });

    var grad = ctx.createLinearGradient(0, pad.t, 0, H - pad.b);
    grad.addColorStop(0, "rgba(200,200,200,0.3)");
    grad.addColorStop(1, "rgba(200,200,200,0)");
    ctx.strokeStyle = "rgba(200,200,200,0.8)";
    ctx.lineWidth = 2;
    ctx.stroke();

    ctx.lineTo(pad.l + (byDay.length - 1) * stepX, H - pad.b);
    ctx.lineTo(pad.l, H - pad.b);
    ctx.closePath();
    ctx.fillStyle = grad;
    ctx.fill();

    var step = byDay.length <= 10 ? 1 : Math.ceil(byDay.length / 10);
    ctx.fillStyle = "#666";
    ctx.font = "10px Manrope";
    ctx.textAlign = "center";
    byDay.forEach(function (d, i) {
      if (i % step !== 0) return;
      ctx.fillText(d.date.slice(5), pad.l + i * stepX, H - pad.b + 14);
    });

    ctx.fillStyle = "#fff";
    byDay.forEach(function (d, i) {
      if (byDay.length > 20 && i % step !== 0) return;
      ctx.beginPath();
      ctx.arc(pad.l + i * stepX, H - pad.b - d.revenue * scaleY, 3, 0, Math.PI * 2);
      ctx.fill();
    });
  }

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
