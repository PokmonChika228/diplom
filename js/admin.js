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
    if (name === "users") loadUsers();
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
        '<td class="actions" style="white-space:nowrap">' +
          '<button class="btn btn--outline" style="padding:4px 10px;font-size:0.75rem;margin-right:4px" onclick="editProduct(' + p.id + ')">✎ Изменить</button>' +
          '<button class="btn btn--outline" style="padding:4px 10px;font-size:0.75rem;color:var(--color-sale)" onclick="deleteProduct(' + p.id + ')">✕</button>' +
        "</td>";
      tbody.appendChild(tr);
    });
  }

  /* ===== Product Modal ===== */
  var productModal = document.getElementById("product-modal-overlay");
  var productModalForm = document.getElementById("product-modal-form");
  var productModalTitle = document.getElementById("product-modal-title");
  var productModalStatus = document.getElementById("product-modal-status");

  function openProductModal(product) {
    if (!productModal) return;
    var isNew = !product;
    if (productModalTitle) productModalTitle.textContent = isNew ? "Добавить товар" : "Редактировать товар";
    document.getElementById("pm-id").value = isNew ? "" : product.id;
    document.getElementById("pm-name").value = isNew ? "" : (product.name || "");
    document.getElementById("pm-category").value = isNew ? "other" : (product.category || "other");
    document.getElementById("pm-price").value = isNew ? "" : (product.price || 0);
    document.getElementById("pm-old-price").value = isNew ? "" : (product.oldPrice || 0);
    document.getElementById("pm-stock").value = isNew ? "" : (product.stock || 0);
    document.getElementById("pm-sale").checked = isNew ? false : !!product.sale;
    document.getElementById("pm-image").value = isNew ? "" : (product.image || "");
    document.getElementById("pm-sizes").value = isNew ? "" : (Array.isArray(product.sizes) ? product.sizes.join(", ") : (product.sizes || ""));
    document.getElementById("pm-colors").value = isNew ? "" : (Array.isArray(product.colors) ? product.colors.join(", ") : (product.colors || ""));
    document.getElementById("pm-description").value = isNew ? "" : (product.description || "");
    document.getElementById("pm-composition").value = isNew ? "" : (product.composition || "");
    document.getElementById("pm-care").value = isNew ? "" : (product.care || "");
    if (productModalStatus) productModalStatus.textContent = "";
    productModal.style.display = "";
    document.body.style.overflow = "hidden";
  }

  function closeProductModal() {
    if (!productModal) return;
    productModal.style.display = "none";
    document.body.style.overflow = "";
  }

  var btnAddProduct = document.getElementById("btn-add-product");
  if (btnAddProduct) {
    btnAddProduct.addEventListener("click", function () { openProductModal(null); });
  }

  var productModalClose = document.getElementById("product-modal-close");
  if (productModalClose) productModalClose.addEventListener("click", closeProductModal);
  var productModalCancel = document.getElementById("product-modal-cancel");
  if (productModalCancel) productModalCancel.addEventListener("click", closeProductModal);
  if (productModal) {
    productModal.addEventListener("click", function (e) {
      if (e.target === productModal) closeProductModal();
    });
  }

  if (productModalForm) {
    productModalForm.addEventListener("submit", function (e) {
      e.preventDefault();
      var id = document.getElementById("pm-id").value;
      var isNew = !id;
      var payload = {
        name: document.getElementById("pm-name").value.trim(),
        category: document.getElementById("pm-category").value,
        price: parseFloat(document.getElementById("pm-price").value) || 0,
        oldPrice: parseFloat(document.getElementById("pm-old-price").value) || 0,
        stock: parseInt(document.getElementById("pm-stock").value, 10) || 0,
        sale: document.getElementById("pm-sale").checked,
        image: document.getElementById("pm-image").value.trim(),
        sizes: document.getElementById("pm-sizes").value.split(",").map(function (s) { return s.trim(); }).filter(Boolean),
        colors: document.getElementById("pm-colors").value.split(",").map(function (s) { return s.trim(); }).filter(Boolean),
        description: document.getElementById("pm-description").value.trim(),
        composition: document.getElementById("pm-composition").value.trim(),
        care: document.getElementById("pm-care").value.trim(),
      };
      var submitBtn = document.getElementById("product-modal-submit");
      if (submitBtn) submitBtn.disabled = true;
      if (productModalStatus) productModalStatus.textContent = "Сохраняю…";
      var url = isNew ? "/api/products" : "/api/products/" + id;
      var method = isNew ? "POST" : "PUT";
      authFetch(url, { method: method, body: JSON.stringify(payload) })
        .then(function (r) { return r.json().then(function (d) { return { ok: r.ok, data: d }; }); })
        .then(function (res) {
          if (!res.ok) throw new Error(res.data.error || "Ошибка");
          if (isNew) {
            DB.products = DB.products || [];
            DB.products.push(res.data);
          } else {
            var idx = (DB.products || []).findIndex(function (p) { return String(p.id) === String(id); });
            if (idx >= 0) DB.products[idx] = res.data;
          }
          syncProductSelect();
          loadProducts();
          closeProductModal();
        })
        .catch(function (err) {
          if (productModalStatus) productModalStatus.textContent = "Ошибка: " + (err.message || "неизвестная");
        })
        .finally(function () { if (submitBtn) submitBtn.disabled = false; });
    });
  }

  window.editProduct = function (id) {
    var product = (DB.products || []).find(function (p) { return p.id === id; });
    if (!product) return;
    openProductModal(product);
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

  function buildInventoryCard(p) {
    var sizes = (p.sizes && p.sizes.length > 0) ? p.sizes : ["ONE SIZE"];
    var stockBySizes = p.stockBySizes || {};

    var sizeHeaders = sizes.map(function (s) {
      return "<th style='min-width:72px;text-align:center;font-weight:600'>" + esc(s) + "</th>";
    }).join("");

    var total = sizes.reduce(function (sum, s) {
      return sum + (stockBySizes[s] !== undefined ? parseInt(stockBySizes[s], 10) : 0);
    }, 0);

    var sizeCells = sizes.map(function (s) {
      var qty = stockBySizes[s] !== undefined ? parseInt(stockBySizes[s], 10) : 0;
      var col = qty === 0 ? "var(--color-sale)" : (qty <= 3 ? "#f4a261" : "var(--color-text)");
      return "<td style='text-align:center;padding:8px 4px'>"
        + "<input type='number' min='0' data-pid='" + p.id + "' data-size='" + esc(s) + "' value='" + qty + "'"
        + " style='width:64px;text-align:center;background:var(--color-bg-card);border:1px solid var(--color-border);"
        + "color:" + col + ";border-radius:6px;padding:4px 6px;font-size:.9rem;font-family:inherit' />"
        + "</td>";
    }).join("");

    var totalCls = total === 0 ? "cancelled" : (total <= 10 ? "processing" : "done");
    var totalLabel = total === 0 ? "Нет в наличии" : (total <= 10 ? "Мало (" + total + " шт.)" : "В наличии (" + total + " шт.)");

    var card = document.createElement("div");
    card.className = "admin-card";
    card.style.marginBottom = "0";
    card.dataset.name = String(p.name).toLowerCase();
    card.dataset.pid = p.id;
    card.innerHTML =
      "<div style='display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px;margin-bottom:12px'>"
      + "<div><strong>" + esc(p.name) + "</strong>"
      + " <span style='color:var(--color-text-muted);font-size:.8rem'>" + esc(catLabel(p.category)) + " · ID " + p.id + "</span></div>"
      + "<div style='display:flex;gap:8px;align-items:center;flex-wrap:wrap'>"
      + "<span class='status-badge " + totalCls + "' id='inv-badge-" + p.id + "'>" + totalLabel + "</span>"
      + "<button class='btn btn--outline btn-save-product-stock' data-pid='" + p.id + "' type='button' style='padding:4px 12px;font-size:.8rem'>Сохранить</button>"
      + "</div>"
      + "</div>"
      + "<div class='table-wrap' style='overflow-x:auto'><table class='admin-table' style='min-width:0'>"
      + "<thead><tr>" + sizeHeaders + "<th style='text-align:center;min-width:60px'>Итого</th></tr></thead>"
      + "<tbody><tr>" + sizeCells
      + "<td style='text-align:center;font-weight:600' id='inv-total-" + p.id + "'>" + total + "</td>"
      + "</tr></tbody></table></div>";
    return card;
  }

  function filterInventory(query) {
    var grid = document.getElementById("inventory-grid");
    var emptyMsg = document.getElementById("inventory-empty");
    if (!grid) return;
    var cards = grid.querySelectorAll(".admin-card[data-name]");
    var q = (query || "").toLowerCase().trim();
    var visible = 0;
    cards.forEach(function (card) {
      var match = !q || card.dataset.name.indexOf(q) !== -1;
      card.style.display = match ? "" : "none";
      if (match) visible++;
    });
    if (emptyMsg) emptyMsg.style.display = (visible === 0 && cards.length > 0) ? "" : "none";
  }

  function loadInventory() {
    var inv = DB.inventory || {};
    var products = inv.products || DB.products || [];
    var grid = document.getElementById("inventory-grid");
    if (!grid) return;
    grid.innerHTML = "";

    products.forEach(function (p) {
      grid.appendChild(buildInventoryCard(p));
    });

    var searchInput = document.getElementById("inventory-search");
    if (searchInput) {
      searchInput.oninput = function () { filterInventory(searchInput.value); };
      filterInventory(searchInput.value);
    }

    grid.addEventListener("click", function (e) {
      var btn = e.target.closest(".btn-save-product-stock");
      if (!btn) return;
      var pid = btn.dataset.pid;
      if (!pid) return;
      var inputs = grid.querySelectorAll("input[data-pid='" + pid + "']");
      var stockBySizes = {};
      inputs.forEach(function (inp) {
        stockBySizes[inp.dataset.size] = parseInt(inp.value, 10) || 0;
      });
      btn.disabled = true;
      btn.textContent = "Сохранение…";
      authFetch("/api/products/" + pid + "/stock-by-sizes", {
        method: "PUT",
        body: JSON.stringify({ stockBySizes: stockBySizes }),
      }).then(function (r) {
        if (!r.ok) { alert("Ошибка сохранения остатков товара " + pid); }
        else { btn.textContent = "Сохранено ✓"; setTimeout(function () { btn.textContent = "Сохранить"; }, 1500); }
      }).catch(function () {
        alert("Ошибка сети при сохранении");
      }).finally(function () {
        btn.disabled = false;
        if (btn.textContent === "Сохранение…") btn.textContent = "Сохранить";
      });
    });

    grid.addEventListener("input", function (e) {
      var inp = e.target;
      if (!inp.dataset.pid) return;
      var pid = inp.dataset.pid;
      var inputs = grid.querySelectorAll("input[data-pid='" + pid + "']");
      var sum = 0;
      inputs.forEach(function (i) {
        var v = parseInt(i.value, 10) || 0;
        sum += v;
        i.style.color = v === 0 ? "var(--color-sale)" : (v <= 3 ? "#f4a261" : "var(--color-text)");
      });
      var totalCell = document.getElementById("inv-total-" + pid);
      var badge = document.getElementById("inv-badge-" + pid);
      if (totalCell) totalCell.textContent = sum;
      if (badge) {
        badge.className = "status-badge " + (sum === 0 ? "cancelled" : (sum <= 10 ? "processing" : "done"));
        badge.textContent = sum === 0 ? "Нет в наличии" : (sum <= 10 ? "Мало (" + sum + " шт.)" : "В наличии (" + sum + " шт.)");
      }
    });
  }

  var btnGenStock = document.getElementById("btn-gen-stock");
  if (btnGenStock) {
    btnGenStock.addEventListener("click", function () {
      if (!confirm("Сгенерировать случайные остатки для всех товаров? Текущие данные будут заменены.")) return;
      btnGenStock.disabled = true;
      btnGenStock.textContent = "Генерация…";
      authFetch("/api/admin/generate-stock", { method: "POST" }).then(function (r) {
        if (!r.ok) { alert("Ошибка генерации"); btnGenStock.disabled = false; btnGenStock.textContent = "Генерировать случайно"; return; }
        authFetch("/api/admin/dashboard").then(function (fr) {
          if (fr.ok) return fr.json().then(function (d) { DB = d; loadInventory(); });
        }).finally(function () { btnGenStock.disabled = false; btnGenStock.textContent = "Генерировать случайно"; });
      });
    });
  }

  var btnSaveStock = document.getElementById("btn-save-stock");
  if (btnSaveStock) {
    btnSaveStock.addEventListener("click", function () {
      var grid = document.getElementById("inventory-grid");
      if (!grid) return;
      var inputs = grid.querySelectorAll("input[data-pid]");
      var byProduct = {};
      inputs.forEach(function (inp) {
        var pid = inp.dataset.pid;
        var size = inp.dataset.size;
        if (!byProduct[pid]) byProduct[pid] = {};
        byProduct[pid][size] = parseInt(inp.value, 10) || 0;
      });
      var pids = Object.keys(byProduct);
      btnSaveStock.disabled = true;
      btnSaveStock.textContent = "Сохранение…";
      var done = 0;
      var errors = 0;
      pids.forEach(function (pid) {
        authFetch("/api/products/" + pid + "/stock-by-sizes", {
          method: "PUT",
          body: JSON.stringify({ stockBySizes: byProduct[pid] }),
        }).then(function (r) {
          if (!r.ok) errors++;
        }).finally(function () {
          done++;
          if (done === pids.length) {
            btnSaveStock.disabled = false;
            btnSaveStock.textContent = "Сохранить изменения";
            if (errors > 0) alert("Сохранено с ошибками: " + errors + " товаров не удалось обновить.");
            else alert("Остатки сохранены!");
          }
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
      var totalRub = o.total || 0;
      var totalInfo = fmt(o.subtotal || 0) + " товары<br>" + fmt(o.deliveryCost || 0) + " дост." +
        (o.discountAmount ? "<br>–" + fmt(o.discountAmount) + " скидка" : "") +
        "<br><strong>" + fmt(totalRub) + "</strong>";

      var statusOpts = Object.keys(STATUS_MAP).map(function (s) {
        return "<option value='" + s + "'" + (o.status === s ? " selected" : "") + ">" + STATUS_MAP[s] + "</option>";
      }).join("");

      var isPaid = o.paymentConfirmed;
      var paymentBadge = isPaid
        ? "<br><span style='color:#4caf50;font-size:0.75rem;font-weight:600'>✓ Оплачено</span>"
        : "<br><span style='color:var(--color-sale);font-size:0.75rem'>⏳ Ожидает оплаты</span>";

      var tr = document.createElement("tr");
      if (!isPaid) tr.style.opacity = "0.65";
      tr.innerHTML =
        "<td><strong>#" + o.id + "</strong></td>" +
        "<td style='white-space:nowrap'>" + fmtDate(o.createdAt) + "</td>" +
        "<td>" + esc(o.customerName) + "</td>" +
        "<td style='font-size:0.8rem'>" + esc(o.phone || "") + "<br>" + esc(o.email || "") + "<br><span style='color:var(--color-text-muted)'>" + esc(o.address || "") + "</span></td>" +
        "<td>" + esc(o.deliveryLabel || o.delivery || "—") + "<br><span style='color:var(--color-text-muted);font-size:0.8rem'>" + (o.deliveryCost === 0 ? "Бесплатно" : fmt(o.deliveryCost || 0)) + "</span></td>" +
        "<td style='font-size:0.8rem'>" + esc(o.paymentLabel || o.payment || "—") + paymentBadge + "</td>" +
        "<td style='font-size:0.8rem'>" + items + "</td>" +
        "<td style='font-size:0.8rem'>" + promoInfo + "</td>" +
        "<td style='font-size:0.8rem'>" + totalInfo + "</td>" +
        "<td style='white-space:nowrap'>"
        + "<select class='select status-select' onchange='updateStatus(" + o.id + ", this.value)' style='margin-bottom:6px'>" + statusOpts + "</select>"
        + "<br><button class='btn btn--outline' style='padding:3px 10px;font-size:0.75rem;color:var(--color-sale)' onclick='deleteOrder(" + o.id + ")'>✕ Удалить</button>"
        + "</td>";
      tbody.appendChild(tr);
    });
  }

  window.checkAllUnpaid = function (btn) {
    var unpaid = (DB.orders || []).filter(function (o) { return !o.paymentConfirmed && o.paymentId; });
    if (!unpaid.length) {
      btn.textContent = "Нет неоплаченных";
      setTimeout(function () { btn.textContent = "Проверить все неоплаченные"; }, 2000);
      return;
    }
    btn.disabled = true;
    btn.textContent = "Проверяем 0 / " + unpaid.length + "…";
    var done = 0;
    var updated = 0;
    unpaid.forEach(function (o) {
      fetch("/api/payment/check-order/" + o.id, { method: "POST" })
        .then(function (r) { return r.json(); })
        .then(function (data) {
          if (data.status === "succeeded") {
            o.paymentStatus = "succeeded";
            o.paymentConfirmed = true;
            updated++;
          }
        })
        .catch(function () {})
        .finally(function () {
          done++;
          btn.textContent = "Проверяем " + done + " / " + unpaid.length + "…";
          if (done === unpaid.length) {
            btn.disabled = false;
            btn.textContent = "Проверить все неоплаченные";
            if (updated > 0) loadOrders();
            var result = updated > 0 ? ("Оплачено: " + updated) : "Новых оплат нет";
            btn.insertAdjacentHTML("afterend", "<span id='check-result' style='margin-left:8px;font-size:0.8rem;color:var(--color-text-muted)'>" + result + "</span>");
            setTimeout(function () { var el = document.getElementById("check-result"); if (el) el.remove(); }, 4000);
          }
        });
    });
  };

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

  window.deleteOrder = function (id) {
    if (!confirm("Удалить заказ #" + id + "? Это действие необратимо.")) return;
    authFetch("/api/orders/" + id, { method: "DELETE" }).then(function (r) {
      if (!r.ok) { alert("Ошибка удаления заказа"); return; }
      DB.orders = (DB.orders || []).filter(function (o) { return o.id !== id; });
      loadOrders();
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
  var chartRange = "all";

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

  function filterByRange(byDay, range) {
    if (range === "all") return byDay;
    var now = new Date();
    var cutoff;
    if (range === "year") {
      cutoff = new Date(now);
      cutoff.setFullYear(now.getFullYear() - 1);
    } else {
      cutoff = new Date(now);
      cutoff.setDate(now.getDate() - 30);
    }
    var cutoffStr = cutoff.toISOString().slice(0, 10);
    return byDay.filter(function (d) { return d.date >= cutoffStr; });
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
    var cssW = canvas.offsetWidth || 600;
    var cssH = 260;
    canvas.width = cssW * dpr;
    canvas.height = cssH * dpr;
    canvas.style.width = cssW + "px";
    canvas.style.height = cssH + "px";
    ctx.scale(dpr, dpr);
    var W = cssW;
    var H = cssH;
    ctx.clearRect(0, 0, W, H);

    var filtered = filterByRange(rawByDay, chartRange);
    var data = groupByPeriod(filtered, chartPeriod);

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

  document.querySelectorAll(".chart-range-btn").forEach(function (btn) {
    btn.addEventListener("click", function () {
      chartRange = btn.dataset.range;
      document.querySelectorAll(".chart-range-btn").forEach(function (b) { b.classList.remove("is-active"); });
      btn.classList.add("is-active");
      renderChart();
    });
  });

  var chartGroupSelect = document.getElementById("chart-group-select");
  if (chartGroupSelect) {
    chartGroupSelect.addEventListener("change", function () {
      chartPeriod = chartGroupSelect.value;
      renderChart();
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
        body: JSON.stringify({ target: type }),
      }).then(function (r) {
        if (!r.ok) { alert("Ошибка очистки"); return; }
        return authFetch("/api/admin/dashboard").then(function (fr) {
          if (fr.ok) return fr.json().then(function (d) { DB = d; syncProductSelect(); alert("Очистка завершена."); });
        });
      });
    });
  });

  /* ===================== TOAST SYSTEM ===================== */
  function showToast(title, msg, cls) {
    var container = document.getElementById("admin-toast-container");
    if (!container) return;
    var toast = document.createElement("div");
    toast.className = "admin-toast" + (cls ? " " + cls : "");
    toast.innerHTML =
      '<div class="admin-toast__icon">' + (cls === "toast-new-order" ? "🛒" : "ℹ️") + "</div>" +
      '<div class="admin-toast__body">' +
        '<div class="admin-toast__title">' + esc(title) + "</div>" +
        (msg ? '<div class="admin-toast__msg">' + esc(msg) + "</div>" : "") +
      "</div>";
    toast.addEventListener("click", function () { toast.remove(); });
    container.appendChild(toast);
    setTimeout(function () {
      toast.style.opacity = "0";
      toast.style.transform = "translateX(40px)";
      toast.style.transition = "all 0.3s ease";
      setTimeout(function () { toast.remove(); }, 320);
    }, 5000);
  }

  /* ===================== ORDER NOTIFICATION POLLING ===================== */
  var _lastKnownOrderId = 0;
  var _badgeCount = 0;
  var _pollInitialized = false;

  function initOrderPolling() {
    authFetch("/api/admin/orders/latest-id").then(function (r) {
      if (!r.ok) return;
      return r.json().then(function (d) {
        _lastKnownOrderId = d.latestId || 0;
        _pollInitialized = true;
      });
    }).catch(function () {});

    setInterval(function () {
      authFetch("/api/admin/orders/latest-id").then(function (r) {
        if (!r.ok) return;
        return r.json().then(function (d) {
          var newId = d.latestId || 0;
          if (_pollInitialized && newId > _lastKnownOrderId) {
            var newCount = newId - _lastKnownOrderId;
            _badgeCount += newCount;
            var badge = document.getElementById("orders-badge");
            if (badge) {
              badge.textContent = _badgeCount;
              badge.hidden = false;
            }
            showToast(
              "Новый заказ!",
              "Поступил" + (newCount > 1 ? "о " + newCount + " новых заказа" : " новый заказ") + ". Откройте раздел «Заказы».",
              "toast-new-order"
            );
          }
          _lastKnownOrderId = newId;
        });
      }).catch(function () {});
    }, 10000);
  }

  document.querySelectorAll(".nav-tab[data-tab='orders']").forEach(function (link) {
    link.addEventListener("click", function () {
      _badgeCount = 0;
      var badge = document.getElementById("orders-badge");
      if (badge) badge.hidden = true;
    });
  });

  /* ===================== DATABASE VIEWER ===================== */
  var _dbLastRows = [];
  var _dbLastFields = [];

  function initDatabaseTab() {
    var tablesList = document.getElementById("db-tables-list");
    var queryInput = document.getElementById("db-query-input");
    var btnRun = document.getElementById("btn-db-run");
    var btnClear = document.getElementById("btn-db-clear");
    var btnCsv = document.getElementById("btn-db-csv");
    var queryStatus = document.getElementById("db-query-status");
    var resultsCard = document.getElementById("db-results-card");
    var errorCard = document.getElementById("db-error-card");
    var errorText = document.getElementById("db-error-text");
    var resultsMeta = document.getElementById("db-results-meta");
    var resultsHead = document.getElementById("db-results-head");
    var resultsBody = document.getElementById("db-results-body");

    if (!tablesList) return;

    fetch("/api/admin/db/tables").then(function (r) { return r.json(); }).then(function (tables) {
      tablesList.innerHTML = "";
      tables.forEach(function (t) {
        var btn = document.createElement("button");
        btn.type = "button";
        btn.style.cssText = "display:flex;align-items:center;justify-content:space-between;width:100%;text-align:left;padding:6px 8px;border-radius:6px;border:none;background:none;cursor:pointer;font-size:0.8125rem;color:var(--color-text);gap:6px;transition:background .15s";
        btn.innerHTML = "<span style='font-weight:500'>" + t.table_name + "</span><span style='font-size:0.75rem;color:var(--color-text-muted);background:var(--color-border);border-radius:999px;padding:1px 7px'>" + (t.row_count || 0) + "</span>";
        btn.addEventListener("mouseenter", function () { btn.style.background = "var(--color-border)"; });
        btn.addEventListener("mouseleave", function () { btn.style.background = "none"; });
        btn.addEventListener("click", function () {
          queryInput.value = "SELECT *\nFROM " + t.table_name + "\nLIMIT 50;";
          runQuery();
        });
        tablesList.appendChild(btn);
      });
    }).catch(function () {
      tablesList.innerHTML = "<div style='font-size:0.8125rem;color:#c0392b'>Ошибка загрузки</div>";
    });

    function showError(msg) {
      resultsCard.style.display = "none";
      errorCard.style.display = "block";
      errorText.textContent = msg;
    }

    function showResults(fields, rows, ms) {
      errorCard.style.display = "none";
      _dbLastFields = fields;
      _dbLastRows = rows;

      resultsHead.innerHTML = "<tr>" + fields.map(function (f) { return "<th>" + f + "</th>"; }).join("") + "</tr>";
      resultsBody.innerHTML = rows.map(function (row) {
        return "<tr>" + fields.map(function (f) {
          var val = row[f];
          if (val === null || val === undefined) return "<td style='color:var(--color-text-muted);font-style:italic'>NULL</td>";
          if (typeof val === "object") val = JSON.stringify(val);
          var str = String(val);
          var short = str.length > 120 ? str.slice(0, 120) + "…" : str;
          return "<td title='" + str.replace(/'/g, "&#39;") + "'>" + short + "</td>";
        }).join("") + "</tr>";
      }).join("");

      resultsMeta.textContent = rows.length + " строк · " + ms + " мс";
      resultsCard.style.display = "block";
    }

    function runQuery() {
      var sql = queryInput.value.trim();
      if (!sql) return;
      queryStatus.textContent = "Выполняется…";
      btnRun.disabled = true;
      resultsCard.style.display = "none";
      errorCard.style.display = "none";

      fetch("/api/admin/db/query", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sql: sql })
      }).then(function (r) { return r.json().then(function (d) { return { ok: r.ok, data: d }; }); }).then(function (res) {
        btnRun.disabled = false;
        if (!res.ok) {
          queryStatus.textContent = "";
          showError(res.data.error || "Неизвестная ошибка");
        } else {
          queryStatus.textContent = "";
          showResults(res.data.fields, res.data.rows, res.data.ms);
        }
      }).catch(function (err) {
        btnRun.disabled = false;
        queryStatus.textContent = "";
        showError(err.message);
      });
    }

    btnRun.addEventListener("click", runQuery);
    btnClear.addEventListener("click", function () {
      queryInput.value = "";
      resultsCard.style.display = "none";
      errorCard.style.display = "none";
      queryStatus.textContent = "";
    });

    queryInput.addEventListener("keydown", function (e) {
      if ((e.ctrlKey || e.metaKey) && e.key === "Enter") { e.preventDefault(); runQuery(); }
    });

    btnCsv.addEventListener("click", function () {
      if (!_dbLastFields.length) return;
      var lines = [_dbLastFields.join(",")].concat(
        _dbLastRows.map(function (row) {
          return _dbLastFields.map(function (f) {
            var v = row[f];
            if (v === null || v === undefined) return "";
            if (typeof v === "object") v = JSON.stringify(v);
            v = String(v).replace(/"/g, '""');
            return v.includes(",") || v.includes("\n") || v.includes('"') ? '"' + v + '"' : v;
          }).join(",");
        })
      );
      var blob = new Blob(["\uFEFF" + lines.join("\r\n")], { type: "text/csv;charset=utf-8;" });
      var url = URL.createObjectURL(blob);
      var a = document.createElement("a");
      a.href = url; a.download = "db-export.csv"; a.click();
      URL.revokeObjectURL(url);
    });
  }

  document.querySelectorAll(".nav-tab[data-tab='database']").forEach(function (link) {
    link.addEventListener("click", function () { initDatabaseTab(); });
  });

  /* ===================== USERS ===================== */
  var usersData = [];

  function loadUsers() {
    var tbody = document.querySelector("#users-table tbody");
    if (!tbody) return;
    authFetch("/api/admin/users").then(function (r) { return r.json(); }).then(function (users) {
      usersData = users || [];
      renderUsersTable(usersData);
    }).catch(function () {
      if (tbody) tbody.innerHTML = '<tr><td colspan="10" style="text-align:center;color:var(--color-sale)">Ошибка загрузки</td></tr>';
    });

    var searchInput = document.getElementById("user-search");
    if (searchInput && !searchInput._bound) {
      searchInput._bound = true;
      searchInput.addEventListener("input", function () {
        var q = this.value.toLowerCase();
        var filtered = q ? usersData.filter(function (u) {
          return (u.name || "").toLowerCase().includes(q) || (u.email || "").toLowerCase().includes(q);
        }) : usersData;
        renderUsersTable(filtered);
      });
    }

    var btnClose = document.getElementById("btn-close-user");
    if (btnClose && !btnClose._bound) {
      btnClose._bound = true;
      btnClose.addEventListener("click", function () {
        document.getElementById("user-detail-panel").style.display = "none";
        document.getElementById("user-list-panel").style.display = "";
      });
    }
  }

  function renderUsersTable(users) {
    var tbody = document.querySelector("#users-table tbody");
    if (!tbody) return;
    if (!users.length) {
      tbody.innerHTML = '<tr><td colspan="10" style="text-align:center;color:var(--color-text-muted);padding:24px">Пользователей нет</td></tr>';
      return;
    }
    tbody.innerHTML = "";
    users.forEach(function (u) {
      var tr = document.createElement("tr");
      var roleColor = u.role === "admin" ? "color:var(--color-sale)" : "";
      tr.innerHTML =
        "<td>" + u.id + "</td>" +
        "<td><strong>" + esc(u.name || "—") + "</strong></td>" +
        "<td style='font-size:0.8rem'>" + esc(u.email) + "</td>" +
        "<td style='" + roleColor + "'>" + esc(u.role || "customer") + "</td>" +
        "<td style='text-align:center'>" + (u.isVerified ? "✓" : "—") + "</td>" +
        "<td style='text-align:center'>" + (u.loyaltyPoints || 0) + " б" + "</td>" +
        "<td style='text-align:center'>" + (u.orderCount || 0) + "</td>" +
        "<td>" + fmt(u.totalSpent || 0) + "</td>" +
        "<td style='font-size:0.8rem'>" + fmtDate(u.createdAt) + "</td>" +
        '<td><button class="btn btn--outline" style="padding:4px 10px;font-size:0.75rem" onclick="viewUser(' + u.id + ')">Открыть</button></td>';
      tbody.appendChild(tr);
    });
  }

  window.viewUser = function (id) {
    authFetch("/api/admin/users/" + id).then(function (r) { return r.json(); }).then(function (data) {
      var u = data.user;
      var orders = data.orders || [];
      var refs = data.referrals || [];
      document.getElementById("udp-title").textContent = (u.name || "Аккаунт") + " — " + u.email;
      document.getElementById("udp-body").innerHTML = renderUserDetail(u, orders, refs);
      document.getElementById("user-list-panel").style.display = "none";
      document.getElementById("user-detail-panel").style.display = "";
      bindUserDetailEvents(u);
    }).catch(function () { alert("Ошибка загрузки пользователя"); });
  };

  function renderUserDetail(u, orders, refs) {
    var statusMap = { new: "Новый", processing: "В обработке", shipped: "Отправлен", done: "Выполнен", cancelled: "Отменён" };
    var html = '<div style="display:grid;grid-template-columns:1fr 1fr;gap:24px;margin-bottom:24px;flex-wrap:wrap">' +
      '<div>' +
        '<h4 style="margin:0 0 12px;font-size:0.875rem;color:var(--color-text-muted);text-transform:uppercase;letter-spacing:1px">Профиль</h4>' +
        infoRow("ID", u.id) +
        infoRow("Email", u.email) +
        infoRow("Имя", u.name || "—") +
        infoRow("Телефон", u.phone || "—") +
        infoRow("Дата регистрации", fmtDate(u.createdAt)) +
        infoRow("Верифицирован", u.isVerified ? "✓ Да" : "✕ Нет") +
        infoRow("Баллов лояльности", '<strong style="color:#16a34a">' + (u.loyaltyPoints || 0) + ' б</strong>') +
      '</div>' +
      '<div>' +
        '<h4 style="margin:0 0 12px;font-size:0.875rem;color:var(--color-text-muted);text-transform:uppercase;letter-spacing:1px">Управление</h4>' +
        '<div style="display:flex;flex-direction:column;gap:10px">' +
          '<div style="display:flex;flex-direction:column;gap:6px">' +
            '<label style="font-size:0.8125rem;color:var(--color-text-muted)">Роль</label>' +
            '<select class="select" id="udp-role" style="max-width:200px">' +
              '<option value="customer"' + (u.role==="customer"?" selected":"") + '>customer</option>' +
              '<option value="admin"' + (u.role==="admin"?" selected":"") + '>admin</option>' +
            '</select>' +
          '</div>' +
          '<div style="display:flex;flex-direction:column;gap:6px">' +
            '<label style="font-size:0.8125rem;color:var(--color-text-muted)">Баллы лояльности (итоговое значение)</label>' +
            '<input class="input" id="udp-loyalty" type="number" min="0" value="' + (u.loyaltyPoints || 0) + '" style="max-width:200px" />' +
          '</div>' +
          '<div style="display:flex;flex-direction:column;gap:6px">' +
            '<label style="font-size:0.8125rem;color:var(--color-text-muted)">Причина корректировки (необязательно)</label>' +
            '<input class="input" id="udp-loyalty-reason" type="text" placeholder="Ручная корректировка" style="max-width:300px" />' +
          '</div>' +
          '<button class="btn btn--secondary" id="udp-save" type="button" data-uid="' + u.id + '" style="width:fit-content">Сохранить</button>' +
          '<span id="udp-save-msg" style="font-size:0.875rem"></span>' +
        '</div>' +
        '<div style="margin-top:16px">' +
          '<button class="btn btn--outline" id="udp-delete" type="button" data-uid="' + u.id + '" style="color:var(--color-sale);border-color:var(--color-sale)">Удалить аккаунт</button>' +
        '</div>' +
      '</div>' +
    '</div>';

    html += '<h4 style="margin:0 0 12px;font-size:0.875rem;color:var(--color-text-muted);text-transform:uppercase;letter-spacing:1px">Заказы (' + orders.length + ')</h4>';
    if (!orders.length) {
      html += '<p style="color:var(--color-text-muted);font-size:0.875rem;margin-bottom:24px">Заказов нет.</p>';
    } else {
      html += '<div class="table-wrap" style="margin-bottom:24px"><table class="admin-table"><thead><tr><th>ID</th><th>Дата</th><th>Статус</th><th>Доставка</th><th>Сумма</th><th>Состав</th></tr></thead><tbody>';
      orders.forEach(function (o) {
        html += '<tr>' +
          '<td>#' + o.id + '</td>' +
          '<td style="font-size:0.8rem">' + fmtDate(o.createdAt) + '</td>' +
          '<td>' + esc(statusMap[o.status] || o.status) + '</td>' +
          '<td style="font-size:0.8rem">' + esc(o.deliveryLabel || o.delivery || "—") + '</td>' +
          '<td>' + fmt(o.total) + '</td>' +
          '<td style="font-size:0.75rem;max-width:200px">' + (o.items || []).map(function (it) { return esc(it.productName || "?") + " ×" + it.qty; }).join(", ") + '</td>' +
        '</tr>';
      });
      html += '</tbody></table></div>';
    }

    return html;
  }

  function infoRow(label, value) {
    return '<div style="display:flex;gap:8px;margin-bottom:8px;font-size:0.875rem">' +
      '<span style="color:var(--color-text-muted);min-width:160px;flex-shrink:0">' + esc(label) + '</span>' +
      '<span>' + (typeof value === 'number' ? value : (value || "—")) + '</span></div>';
  }

  function bindUserDetailEvents(u) {
    var saveBtn = document.getElementById("udp-save");
    if (saveBtn) {
      saveBtn.addEventListener("click", async function () {
        var role = document.getElementById("udp-role").value;
        var loyaltyPoints = parseInt(document.getElementById("udp-loyalty").value) || 0;
        var loyaltyReason = document.getElementById("udp-loyalty-reason").value.trim();
        var oldPoints = u.loyaltyPoints || 0;
        var loyaltyAdjust = loyaltyPoints - oldPoints;
        var msg = document.getElementById("udp-save-msg");
        try {
          const r = await authFetch("/api/admin/users/" + u.id, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ role, loyaltyPoints, loyaltyAdjust, loyaltyReason: loyaltyReason || undefined })
          });
          const d = await r.json();
          if (!r.ok) { msg.style.color = "var(--color-sale)"; msg.textContent = d.error || "Ошибка"; return; }
          msg.style.color = "#16a34a"; msg.textContent = "Сохранено!";
          u.loyaltyPoints = loyaltyPoints;
          loadUsers();
        } catch (e) { msg.style.color = "var(--color-sale)"; msg.textContent = "Ошибка сети"; }
      });
    }

    var deleteBtn = document.getElementById("udp-delete");
    if (deleteBtn) {
      deleteBtn.addEventListener("click", async function () {
        if (!confirm("Удалить аккаунт " + u.email + "? Это действие необратимо.")) return;
        try {
          await authFetch("/api/admin/users/" + u.id, { method: "DELETE" });
          document.getElementById("user-detail-panel").style.display = "none";
          document.getElementById("user-list-panel").style.display = "";
          loadUsers();
        } catch (e) { alert("Ошибка удаления"); }
      });
    }
  }

  /* ===================== START ===================== */
  loadAll();
  initOrderPolling();
})();
