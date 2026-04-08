const API = {
  products: "/api/products",
  inventory: "/api/inventory",
  delivery: "/api/inventory/delivery",
  orders: "/api/orders",
  promos: "/api/promocodes",
  analytics: "/api/analytics",
  cleanup: "/api/admin/cleanup",
  uploadImageSign: "/api/upload-image-sign",
};

const fmtRub = (n) =>
  `${Math.round(Number(n) || 0)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, " ")} ₽`;

async function jsonFetch(url, options = {}) {
  const res = await fetch(url, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  if (res.status === 401) {
    location.href = "/admin-login.html";
    throw new Error("Unauthorized");
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "Request failed");
  return data;
}

function fillForm(form, product) {
  form.id.value = product.id;
  form.name.value = product.name || "";
  form.category.value = product.category || "other";
  form.sale.checked = !!product.sale;
  form.price.value = product.price ?? 0;
  form.oldPrice.value = product.oldPrice ?? 0;
  form.stock.value = product.stock ?? 0;
  form.sizes.value = (product.sizes || []).join(", ");
  form.colors.value = (product.colors || []).join(", ");
  form.image.value = product.image || "";
  form.description.value = product.description || "";
}

function resetForm(form) {
  form.reset();
  form.id.value = "";
}

function drawSalesChart(canvas, data) {
  const ctx = canvas.getContext("2d");
  const W = canvas.width;
  const H = canvas.height;
  ctx.clearRect(0, 0, W, H);

  if (!data.length) {
    ctx.fillStyle = "#777";
    ctx.font = "14px Manrope";
    ctx.fillText("Нет данных по продажам", 20, 40);
    return;
  }

  const max = Math.max(...data.map((d) => d.revenue), 1);
  const left = 45;
  const bottom = H - 35;
  const top = 20;
  const chartW = W - left - 15;
  const chartH = bottom - top;
  const barW = Math.max(18, chartW / data.length - 8);

  ctx.strokeStyle = "#ddd";
  ctx.beginPath();
  ctx.moveTo(left, top);
  ctx.lineTo(left, bottom);
  ctx.lineTo(W - 10, bottom);
  ctx.stroke();

  data.forEach((item, i) => {
    const x = left + i * (barW + 8) + 6;
    const h = (item.revenue / max) * chartH;
    const y = bottom - h;
    ctx.fillStyle = "#c45c3e";
    ctx.fillRect(x, y, barW, h);

    ctx.fillStyle = "#666";
    ctx.font = "11px Manrope";
    ctx.fillText(item.date.slice(5), x, bottom + 14);
  });
}

async function loadProducts() {
  const products = await jsonFetch(API.products);
  const tbody = document.querySelector("#products-table tbody");
  const deliverySelect = document.querySelector('#delivery-form select[name="productId"]');
  tbody.innerHTML = "";
  deliverySelect.innerHTML = "";

  const form = document.getElementById("product-form");

  products.forEach((p) => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${p.id}</td>
      <td>${p.name}</td>
      <td>${p.category}</td>
      <td>${p.sale ? "true" : "false"}</td>
      <td>${p.oldPrice ? fmtRub(p.oldPrice) : "—"}</td>
      <td>${fmtRub(p.price)}</td>
      <td>${p.stock}</td>
      <td>
        <div class="actions">
          <button class="btn btn--outline" data-act="edit">Редактировать</button>
          <button class="btn btn--outline" data-act="delete">Удалить</button>
        </div>
      </td>
    `;
    tr.querySelector('[data-act="edit"]').addEventListener("click", () => fillForm(form, p));
    tr.querySelector('[data-act="delete"]').addEventListener("click", async () => {
      if (!confirm(`Удалить товар "${p.name}"?`)) return;
      await jsonFetch(`${API.products}/${p.id}`, { method: "DELETE" });
      await refreshAll();
    });
    tbody.appendChild(tr);

    const opt = document.createElement("option");
    opt.value = p.id;
    opt.textContent = `#${p.id} ${p.name}`;
    deliverySelect.appendChild(opt);
  });
}

async function loadInventory() {
  const data = await jsonFetch(API.inventory);
  const stockBody = document.querySelector("#inventory-table tbody");
  const logBody = document.querySelector("#logs-table tbody");
  stockBody.innerHTML = "";
  logBody.innerHTML = "";

  data.products.forEach((p) => {
    const tr = document.createElement("tr");
    tr.innerHTML = `<td>${p.name}</td><td>${p.stock}</td><td>${p.category}</td>`;
    stockBody.appendChild(tr);
  });

  data.logs.forEach((l) => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${new Date(l.createdAt).toLocaleString("ru-RU")}</td>
      <td>${l.productId}</td>
      <td>+${l.qty}</td>
      <td>${l.note || "-"}</td>
    `;
    logBody.appendChild(tr);
  });
}

async function loadOrders(filterOrderId = "") {
  const orders = await jsonFetch(API.orders);
  const tbody = document.querySelector("#orders-table tbody");
  tbody.innerHTML = "";

  const filtered = filterOrderId
    ? orders.filter((o) => String(o.id) === String(filterOrderId).trim())
    : orders;

  for (const o of filtered) {
    const tr = document.createElement("tr");
    const items = o.items
      .map((it) => `${it.productName} x${it.qty} (${fmtRub(it.price * it.qty)})`)
      .join("<br/>");
    const promoLabel = o.promoCode ? o.promoCode : "—";
    const sumsLabel = `подытог: ${fmtRub(o.subtotal || 0)}<br/>скидка: ${fmtRub(
      o.discount || 0
    )}<br/><strong>итого: ${fmtRub(o.total || 0)}</strong>`;
    tr.innerHTML = `
      <td>#${o.id}</td>
      <td>${new Date(o.createdAt).toLocaleString("ru-RU")}</td>
      <td>${o.customerName}</td>
      <td>${o.phone}<br/>${o.email}</td>
      <td>${o.address}</td>
      <td>${items}</td>
      <td>${promoLabel}</td>
      <td>${sumsLabel}</td>
      <td>
        <select class="select status-select">
          <option value="new">new</option>
          <option value="processing">processing</option>
          <option value="shipped">shipped</option>
          <option value="done">done</option>
          <option value="cancelled">cancelled</option>
        </select>
      </td>
    `;
    const sel = tr.querySelector(".status-select");
    sel.value = o.status || "new";
    sel.addEventListener("change", async () => {
      await jsonFetch(`${API.orders}/${o.id}/status`, {
        method: "PUT",
        body: JSON.stringify({ status: sel.value }),
      });
    });
    tbody.appendChild(tr);
  }

  if (!filtered.length) {
    const tr = document.createElement("tr");
    tr.innerHTML = `<td colspan="9" style="color:#777">Заказ не найден</td>`;
    tbody.appendChild(tr);
  }
}

async function loadPromos() {
  const promos = await jsonFetch(API.promos);
  const tbody = document.querySelector("#promos-table tbody");
  if (!tbody) return;
  tbody.innerHTML = "";
  promos.forEach((p) => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${p.id}</td>
      <td>${p.code}</td>
      <td>${p.type}</td>
      <td>${p.type === "percent" ? `${p.value}%` : fmtRub(p.value)}</td>
      <td>${p.active ? "Да" : "Нет"}</td>
      <td><button class="btn btn--outline" data-act="delete-promo">Удалить</button></td>
    `;
    tr.querySelector('[data-act="delete-promo"]').addEventListener("click", async () => {
      if (!confirm(`Удалить промокод ${p.code}?`)) return;
      await jsonFetch(`${API.promos}/${p.id}`, { method: "DELETE" });
      await loadPromos();
    });
    tbody.appendChild(tr);
  });
}

async function loadAnalytics() {
  const data = await jsonFetch(API.analytics);
  document.getElementById("kpi-orders").textContent = data.totalOrders;
  document.getElementById("kpi-products").textContent = data.totalProducts;
  document.getElementById("kpi-revenue").textContent = fmtRub(data.totalRevenue);

  const qtyList = document.getElementById("top-qty");
  const revList = document.getElementById("top-revenue");
  qtyList.innerHTML = "";
  revList.innerHTML = "";

  data.topByQty.forEach((t) => {
    const li = document.createElement("li");
    li.textContent = `${t.productName} — ${t.qty} шт.`;
    qtyList.appendChild(li);
  });
  data.topByRevenue.forEach((t) => {
    const li = document.createElement("li");
    li.textContent = `${t.productName} — ${fmtRub(t.revenue)}`;
    revList.appendChild(li);
  });

  drawSalesChart(document.getElementById("sales-chart"), data.byDay);
}

async function refreshAll() {
  await Promise.all([
    loadProducts(),
    loadInventory(),
    loadOrders(),
    loadPromos(),
    loadAnalytics(),
  ]);
}

function bindForms() {
  const productForm = document.getElementById("product-form");
  const productReset = document.getElementById("product-reset");
  const deliveryForm = document.getElementById("delivery-form");
  const promoForm = document.getElementById("promo-form");
  const orderSearchForm = document.getElementById("order-search-form");
  const imageFileInput = productForm?.querySelector('input[name="imageFile"]');
  const logoutBtn = document.getElementById("admin-logout");
  const cleanupButtons = Array.from(document.querySelectorAll("[data-cleanup]"));

  logoutBtn?.addEventListener("click", async () => {
    await fetch("/api/admin/logout", { method: "POST" }).catch(() => {});
    location.href = "/admin-login.html";
  });

  imageFileInput?.addEventListener("change", async () => {
    const file = imageFileInput.files?.[0];
    if (!file) return;
    try {
      const sign = await jsonFetch(API.uploadImageSign, { method: "POST" });
      const fd = new FormData();
      fd.append("file", file);
      fd.append("api_key", sign.apiKey);
      fd.append("timestamp", String(sign.timestamp));
      fd.append("signature", sign.signature);
      fd.append("folder", sign.folder);
      const uploadRes = await fetch(
        `https://api.cloudinary.com/v1_1/${encodeURIComponent(sign.cloudName)}/image/upload`,
        { method: "POST", body: fd }
      );
      const uploadData = await uploadRes.json().catch(() => ({}));
      if (!uploadRes.ok) {
        throw new Error(uploadData.error?.message || "Не удалось загрузить фото");
      }
      productForm.image.value = uploadData.secure_url || "";
    } catch (err) {
      alert(err.message || "Не удалось загрузить фото");
    }
  });

  productForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const fd = new FormData(productForm);
    const payload = Object.fromEntries(fd.entries());
    delete payload.imageFile;
    payload.sale = !!productForm.sale.checked;
    payload.price = Number(payload.price || 0);
    payload.oldPrice = Number(payload.oldPrice || 0);
    payload.stock = Number(payload.stock || 0);

    if (payload.id) {
      await jsonFetch(`${API.products}/${payload.id}`, {
        method: "PUT",
        body: JSON.stringify(payload),
      });
    } else {
      await jsonFetch(API.products, {
        method: "POST",
        body: JSON.stringify(payload),
      });
    }
    resetForm(productForm);
    await refreshAll();
  });

  productReset.addEventListener("click", () => resetForm(productForm));

  deliveryForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const fd = new FormData(deliveryForm);
    const payload = Object.fromEntries(fd.entries());
    payload.productId = Number(payload.productId);
    payload.qty = Number(payload.qty || 0);
    await jsonFetch(API.delivery, {
      method: "POST",
      body: JSON.stringify(payload),
    });
    deliveryForm.reset();
    await refreshAll();
  });

  promoForm?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const fd = new FormData(promoForm);
    const payload = Object.fromEntries(fd.entries());
    payload.value = Number(payload.value || 0);
    await jsonFetch(API.promos, {
      method: "POST",
      body: JSON.stringify(payload),
    });
    promoForm.reset();
    await loadPromos();
  });

  orderSearchForm?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const val = new FormData(orderSearchForm).get("orderId");
    await loadOrders(String(val || "").trim());
  });

  cleanupButtons.forEach((btn) => {
    btn.addEventListener("click", async () => {
      const target = String(btn.dataset.cleanup || "");
      if (!target) return;
      const ok = confirm(
        target === "all"
          ? "Полностью очистить базу данных? Это действие нельзя отменить."
          : `Очистить данные: ${target}?`
      );
      if (!ok) return;
      await jsonFetch(API.cleanup, {
        method: "POST",
        body: JSON.stringify({ target }),
      });
      await refreshAll();
    });
  });
}

bindForms();
refreshAll().catch((err) => {
  alert(`Ошибка загрузки админ-панели: ${err.message}`);
});

