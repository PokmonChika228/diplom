/**
 * Корзина: рендер из sessionStorage + API товаров, промокод в корзине.
 */
(function () {
  const root = document.querySelector("[data-cart-lines]");
  if (!root || typeof window.getCartLines !== "function") return;

  const promoInput = document.getElementById("promo");
  const promoBtn = document.querySelector("[data-apply-promo]");
  const promoMsg = document.querySelector("[data-promo-message]");
  const discountRow = document.querySelector("[data-cart-discount-row]");
  const discountEl = document.querySelector("[data-cart-discount]");

  let productsById = new Map();
  let promoCodes = [];
  let appliedPromo = null;

  function formatRub(n) {
    return `${Math.round(Number(n) || 0)
      .toString()
      .replace(/\B(?=(\d{3})+(?!\d))/g, " ")} ₽`;
  }

  function escapeHtml(s) {
    const d = document.createElement("div");
    d.textContent = s;
    return d.innerHTML;
  }

  function lineTotalRub(line, product) {
    const unit = Number(product.price || 0);
    const qty = Math.max(1, parseInt(line.qty, 10) || 1);
    return unit * qty;
  }

  function calcDiscount(subtotal) {
    if (!appliedPromo) return 0;
    if (appliedPromo.type === "percent") {
      return Math.round((subtotal * Math.min(100, Number(appliedPromo.value || 0))) / 100);
    }
    return Math.min(subtotal, Number(appliedPromo.value || 0));
  }

  function renderLine(line) {
    const p = productsById.get(String(line.productId));
    const missing = !p;
    const productName = missing ? `Товар #${line.productId}` : p.name || "Товар";
    const qty = Math.max(1, parseInt(line.qty, 10) || 1);
    const art = document.createElement("article");
    art.className = "cart-row";
    art.setAttribute("role", "listitem");
    art.dataset.productId = String(line.productId);
    art.dataset.size = line.size;

    const thumbSrc = missing
      ? "https://placehold.co/400x300?text=Deleted"
      : p.image || "https://placehold.co/400x300?text=Product";
    const lineTotal = missing ? 0 : lineTotalRub(line, p);
    const isSale = !missing && p.sale && p.oldPrice > p.price;
    const priceHtml = missing
      ? formatRub(0)
      : isSale
        ? `<del style="opacity:.55;font-weight:400;margin-right:.35em">${formatRub(p.oldPrice * Math.max(1, parseInt(line.qty, 10) || 1))}</del><strong style="color:var(--color-sale)" data-line-total>${formatRub(lineTotal)}</strong>`
        : `<span data-line-total>${formatRub(lineTotal)}</span>`;
    art.innerHTML = `
      <a href="product.html?id=${encodeURIComponent(line.productId)}" class="product-thumb">
        <span class="product-thumb__media"><img src="${thumbSrc}" alt="" width="800" height="600" loading="lazy" /></span>
      </a>
      <div class="cart-row__info">
        <a href="product.html?id=${encodeURIComponent(line.productId)}" class="cart-row__name">${escapeHtml(productName)}</a>
        <p class="cart-row__meta">Размер: ${escapeHtml(line.size || "ONE")}</p>
        ${missing ? '<p class="cart-row__meta" style="color:#a33">Товар временно недоступен</p>' : ""}
        <p class="cart-row__price">${priceHtml}</p>
        <div class="cart-row__actions">
          <div class="qty" data-qty>
            <button type="button" data-qty-down aria-label="Уменьшить количество">−</button>
            <input type="number" min="1" max="99" value="${qty}" aria-label="Количество" />
            <button type="button" data-qty-up aria-label="Увеличить количество">+</button>
          </div>
          <button type="button" class="link-remove">Удалить</button>
        </div>
      </div>
    `;
    return art;
  }

  function updateSummary() {
    const lines = window.getCartLines();
    let subtotal = 0;
    lines.forEach((line) => {
      const p = productsById.get(String(line.productId));
      if (p) subtotal += lineTotalRub(line, p);
    });
    const discount = calcDiscount(subtotal);
    const total = Math.max(0, subtotal - discount);

    const itemsQty = lines.reduce((s, l) => s + Math.max(1, parseInt(l.qty, 10) || 1), 0);
    const label = document.querySelector("[data-cart-lines-label]");
    if (label) label.textContent = lines.length ? `Товары: ${itemsQty} шт.` : "Товары";
    const sub = document.querySelector("[data-cart-subtotal]");
    const tot = document.querySelector("[data-cart-total]");
    if (sub) sub.textContent = formatRub(subtotal);
    if (tot) tot.textContent = formatRub(total);

    if (discountRow && discountEl) {
      const has = discount > 0;
      discountRow.hidden = !has;
      discountEl.textContent = `− ${formatRub(discount)}`;
    }

    const empty = document.getElementById("cart-empty");
    const layout = document.querySelector("[data-cart-layout]");
    const summary = document.querySelector("[data-cart-summary]");
    if (empty && layout && summary) {
      const isEmpty = lines.length === 0;
      empty.hidden = !isEmpty;
      layout.hidden = isEmpty;
      summary.hidden = isEmpty;
    }
    if (typeof window.syncCartBadges === "function") window.syncCartBadges();
  }

  function bindRows() {
    root.querySelectorAll(".cart-row").forEach((row) => {
      const input = row.querySelector('.qty input[type="number"]');
      const pid = row.dataset.productId;
      const size = row.dataset.size;
      const product = productsById.get(String(pid));
      if (!input) return;

      const refreshRow = () => {
        const q = Math.max(1, parseInt(input.value, 10) || 1);
        input.value = String(q);
        window.updateCartLineQty(pid, size, q);
        const totalEl = row.querySelector("[data-line-total]");
        if (totalEl && product) totalEl.textContent = formatRub(Number(product.price || 0) * q);
        const delEl = row.querySelector(".cart-row__price del");
        if (delEl && product && product.oldPrice > product.price) {
          delEl.textContent = formatRub(Number(product.oldPrice || 0) * q);
        }
        updateSummary();
      };
      row.querySelector("[data-qty-down]")?.addEventListener("click", () => {
        input.value = String(Math.max(1, (parseInt(input.value, 10) || 1) - 1));
        refreshRow();
      });
      row.querySelector("[data-qty-up]")?.addEventListener("click", () => {
        input.value = String(Math.min(99, (parseInt(input.value, 10) || 1) + 1));
        refreshRow();
      });
      input.addEventListener("change", refreshRow);
    });
    root.querySelectorAll(".link-remove").forEach((btn) => {
      btn.addEventListener("click", () => {
        const row = btn.closest(".cart-row");
        if (!row) return;
        window.removeCartLine(row.dataset.productId, row.dataset.size);
        render();
      });
    });
  }

  function applyPromoCode(raw) {
    const code = String(raw || "").trim().toUpperCase();
    if (!code) {
      appliedPromo = null;
      sessionStorage.removeItem("brandPromoCode");
      if (promoMsg) {
        promoMsg.hidden = false;
        promoMsg.textContent = "Промокод очищен.";
      }
      updateSummary();
      return;
    }
    const p = promoCodes.find((x) => x.active && x.code === code);
    if (!p) {
      appliedPromo = null;
      sessionStorage.removeItem("brandPromoCode");
      if (promoMsg) {
        promoMsg.hidden = false;
        promoMsg.style.color = "var(--color-sale)";
        promoMsg.textContent = "Промокод не найден.";
      }
      updateSummary();
      return;
    }
    appliedPromo = p;
    sessionStorage.setItem("brandPromoCode", p.code);
    if (promoMsg) {
      promoMsg.hidden = false;
      promoMsg.style.color = "var(--color-success)";
      promoMsg.textContent =
        p.type === "percent"
          ? `Промокод ${p.code} применен: скидка ${p.value}%`
          : `Промокод ${p.code} применен: скидка ${formatRub(p.value)}`;
    }
    updateSummary();
  }

  async function loadData() {
    const [productsRes, promosRes] = await Promise.all([
      fetch("/api/products"),
      fetch("/api/promocodes"),
    ]);
    const products = productsRes.ok ? await productsRes.json() : [];
    promoCodes = promosRes.ok ? await promosRes.json() : [];
    productsById = new Map(products.map((p) => [String(p.id), p]));
  }

  function render() {
    const lines = window.getCartLines();
    root.innerHTML = "";
    lines.forEach((line) => {
      const el = renderLine(line);
      if (el) root.appendChild(el);
    });
    bindRows();
    updateSummary();
  }

  promoBtn?.addEventListener("click", () => {
    applyPromoCode(promoInput?.value || "");
  });
  promoInput?.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      applyPromoCode(promoInput.value);
    }
  });

  (async () => {
    await loadData().catch(() => {});
    const storedCode = sessionStorage.getItem("brandPromoCode") || "";
    if (promoInput) promoInput.value = storedCode;
    if (storedCode) applyPromoCode(storedCode);
    render();
  })();
})();
