(function () {
  const root = document.querySelector("[data-checkout-lines]");
  const subEl = document.querySelector("[data-checkout-subtotal]");
  const totalEl = document.querySelector("[data-checkout-total]");
  const discountRow = document.querySelector("[data-checkout-discount-row]");
  const discountEl = document.querySelector("[data-checkout-discount]");
  const deliveryCostEl = document.querySelector("[data-checkout-delivery-cost]");
  if (!root || !window.getCartLines) return;

  const DELIVERY_OPTIONS = {
    pickup: { label: "Самовывоз", cost: 0 },
    courier: { label: "Курьер", cost: 500 },
    cdek: { label: "СДЭК / ПВЗ", cost: 350 },
  };

  function formatRub(n) {
    const x = Math.round(Number(n) || 0);
    return x.toString().replace(/\B(?=(\d{3})+(?!\d))/g, " ") + "\u00a0₽";
  }

  function fp(rub, usd) {
    return typeof window.formatPrice === "function"
      ? window.formatPrice(rub, usd)
      : formatRub(rub);
  }

  function escape(s) {
    const d = document.createElement("div");
    d.textContent = s;
    return d.innerHTML;
  }

  function getDeliveryCost() {
    const form = document.querySelector("[data-checkout-form]");
    const checked = form ? form.querySelector('[name="delivery"]:checked') : null;
    const val = checked ? checked.value : "pickup";
    return (DELIVERY_OPTIONS[val] || { cost: 0 }).cost;
  }

  let _state = null;

  function render() {
    if (!_state) return;
    const { lines, byId, sum, discount, deliveryCost } = _state;

    root.innerHTML = "";
    lines.forEach((line) => {
      const p = byId.get(String(line.productId));
      if (!p) return;
      const qty = Math.max(1, parseInt(line.qty, 10) || 1);
      const lineSum = Number(p.price || 0) * qty;
      const lineSumUsd = Number(p.priceUsd || 0) > 0
        ? Number(p.priceUsd) * qty
        : Math.round(lineSum / (window.EXCHANGE_RATE || 90));
      const row = document.createElement("div");
      row.className = "order-mini__line";
      const thumbSrc = p.image || "https://placehold.co/200x267?text=Product";
      row.innerHTML =
        '<a href="product.html?id=' +
        encodeURIComponent(line.productId) +
        '" class="product-thumb"><span class="product-thumb__media"><img src="' +
        thumbSrc +
        '" alt="" width="200" height="267" loading="lazy" /></span></a><div><div style="font-weight:600">' +
        escape(p.name) +
        '</div><div style="font-size:0.8125rem;color:var(--color-text-muted)">' +
        escape(line.size) +
        " · ×" +
        qty +
        '</div><div style="font-weight:600;margin-top:var(--space-xs)">' +
        fp(lineSum, lineSumUsd) +
        "</div></div>";
      root.appendChild(row);
    });

    if (subEl) {
      subEl.textContent = fp(sum, Math.round(sum / (window.EXCHANGE_RATE || 90)));
      subEl.dataset.value = Math.round(sum);
    }
    if (discountRow && discountEl) {
      discountRow.hidden = discount <= 0;
      discountEl.textContent = "− " + fp(discount, Math.round(discount / (window.EXCHANGE_RATE || 90)));
      discountEl.dataset.value = Math.round(discount);
    }
    if (deliveryCostEl) {
      deliveryCostEl.textContent = deliveryCost === 0
        ? "Бесплатно"
        : fp(deliveryCost, Math.round(deliveryCost / (window.EXCHANGE_RATE || 90)));
    }
    // Let checkout-submit.js recalculate total (it also knows loyalty discount)
    if (typeof window._updateCheckoutTotal === "function") {
      window._updateCheckoutTotal();
    } else {
      // Fallback before checkout-submit.js is loaded
      const loyaltyDisc = parseInt(window._loyaltySpendPoints || 0, 10) || 0;
      const total = Math.max(0, sum - discount - loyaltyDisc) + deliveryCost;
      if (totalEl) totalEl.textContent = fp(total, Math.round(total / (window.EXCHANGE_RATE || 90)));
    }
  }

  async function load() {
    const lines = window.getCartLines();
    const [productsRes, promoRes] = await Promise.all([
      fetch("/api/products"),
      fetch("/api/promocodes"),
    ]);
    const products = productsRes.ok ? (await productsRes.json()) || [] : [];
    const promoCodes = promoRes.ok ? (await promoRes.json()) || [] : [];
    const byId = new Map(products.map((p) => [String(p.id), p]));
    let sum = 0;
    lines.forEach((line) => {
      const p = byId.get(String(line.productId));
      if (!p) return;
      const qty = Math.max(1, parseInt(line.qty, 10) || 1);
      sum += Number(p.price || 0) * qty;
    });

    const promoCode = String(sessionStorage.getItem("brandPromoCode") || "")
      .trim()
      .toUpperCase();
    const promo = promoCodes.find((p) => p.active && p.code === promoCode);
    let discount = 0;
    if (promo) {
      if (promo.type === "percent") {
        discount = Math.round((sum * Math.min(100, Number(promo.value || 0))) / 100);
      } else {
        discount = Math.min(sum, Number(promo.value || 0));
      }
    }

    const deliveryCost = getDeliveryCost();
    _state = { lines, byId, sum, discount, deliveryCost };
    render();
  }

  document.querySelector("[data-checkout-form]")?.querySelectorAll('[name="delivery"]').forEach((r) => {
    r.addEventListener("change", () => {
      if (_state) {
        _state.deliveryCost = getDeliveryCost();
        render();
        if (typeof window._updateCheckoutTotal === "function") window._updateCheckoutTotal();
      }
    });
  });

  window.addEventListener("currencychange", render);

  load().catch(() => {
    if (subEl) subEl.textContent = "0 ₽";
    if (totalEl) totalEl.textContent = "0 ₽";
  });
})();
