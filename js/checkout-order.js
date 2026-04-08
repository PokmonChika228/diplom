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
    return x.toString().replace(/\B(?=(\d{3})+(?!\d))/g, " ") + " ₽";
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
    root.innerHTML = "";
    lines.forEach((line) => {
      const p = byId.get(String(line.productId));
      if (!p) return;
      const qty = Math.max(1, parseInt(line.qty, 10) || 1);
      const lineSum = Number(p.price || 0) * qty;
      sum += lineSum;
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
        formatRub(lineSum) +
        "</div></div>";
      root.appendChild(row);
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
    const total = Math.max(0, sum - discount) + deliveryCost;

    if (subEl) {
      subEl.textContent = formatRub(sum);
      subEl.dataset.value = String(sum);
    }
    if (totalEl) totalEl.textContent = formatRub(total);
    if (discountRow && discountEl) {
      discountRow.hidden = discount <= 0;
      discountEl.textContent = `− ${formatRub(discount)}`;
      discountEl.dataset.value = String(discount);
    }
    if (deliveryCostEl) {
      deliveryCostEl.textContent = deliveryCost === 0 ? "Бесплатно" : formatRub(deliveryCost);
    }
  }

  load().catch(() => {
    if (subEl) subEl.textContent = "0 ₽";
    if (totalEl) totalEl.textContent = "0 ₽";
  });
})();
