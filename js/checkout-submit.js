/**
 * Чекаут: отправка заказа с доставкой и оплатой.
 */
(function () {
  const form = document.querySelector("[data-checkout-form]");
  const modal = document.querySelector("[data-checkout-modal]");
  const closeBtn = document.querySelector("[data-modal-close]");
  const errorBox = document.querySelector("[data-checkout-error]");
  if (!form || !modal) return;

  const DELIVERY_OPTIONS = {
    pickup: { label: "Самовывоз", cost: 0 },
    courier: { label: "Курьер", cost: 500 },
    cdek: { label: "СДЭК / ПВЗ", cost: 350 },
  };
  const PAYMENT_OPTIONS = {
    card: "Картой онлайн",
    sbp: "СБП",
    receipt: "При получении",
  };

  function getDeliveryInfo() {
    const checked = form.querySelector('[name="delivery"]:checked');
    const val = checked ? checked.value : "pickup";
    return DELIVERY_OPTIONS[val] || { label: "Самовывоз", cost: 0 };
  }

  function openModal() {
    modal.classList.add("is-open");
    modal.setAttribute("aria-hidden", "false");
    document.body.style.overflow = "hidden";
  }

  function closeModal() {
    modal.classList.remove("is-open");
    modal.setAttribute("aria-hidden", "true");
    document.body.style.overflow = "";
  }

  closeBtn?.addEventListener("click", closeModal);
  modal.addEventListener("click", (e) => {
    if (e.target === modal) closeModal();
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") closeModal();
  });

  async function submitOrder() {
    const lines =
      typeof window.getCartLines === "function" ? window.getCartLines() : [];
    if (!lines.length) throw new Error("Корзина пуста");

    const deliveryRadio = form.querySelector('[name="delivery"]:checked');
    const paymentRadio = form.querySelector('[name="pay"]:checked');
    const deliveryVal = deliveryRadio ? deliveryRadio.value : "pickup";
    const paymentVal = paymentRadio ? paymentRadio.value : "card";
    const deliveryInfo = DELIVERY_OPTIONS[deliveryVal] || { label: "Самовывоз", cost: 0 };

    const payload = {
      customerName: form.querySelector('[name="name"]')?.value?.trim(),
      phone: form.querySelector('[name="phone"]')?.value?.trim(),
      email: form.querySelector('[name="email"]')?.value?.trim(),
      address: form.querySelector('[name="address"]')?.value?.trim(),
      comment: form.querySelector('[name="comment"]')?.value?.trim(),
      promoCode: sessionStorage.getItem("brandPromoCode") || "",
      delivery: deliveryVal,
      deliveryLabel: deliveryInfo.label,
      deliveryCost: deliveryInfo.cost,
      payment: paymentVal,
      paymentLabel: PAYMENT_OPTIONS[paymentVal] || paymentVal,
      items: lines.map((l) => ({
        productId: l.productId,
        qty: l.qty,
      })),
    };

    const res = await fetch("/api/orders", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || "Не удалось оформить заказ");
    return data;
  }

  form.addEventListener("submit", async (e) => {
    e.preventDefault();

    if (!form.checkValidity()) {
      form.reportValidity();
      return;
    }

    if (errorBox) {
      errorBox.hidden = true;
      errorBox.textContent = "";
    }

    try {
      const order = await submitOrder();
      sessionStorage.removeItem("brandCartLines");
      sessionStorage.removeItem("brandPromoCode");
      if (typeof window.syncCartBadges === "function") window.syncCartBadges();
      const p = modal.querySelector("p");
      if (p) {
        p.textContent = `Спасибо! Заказ №${order.id} успешно принят. Мы свяжемся с вами для подтверждения.`;
      }
      openModal();
    } catch (err) {
      if (errorBox) {
        errorBox.hidden = false;
        errorBox.textContent = err.message || "Ошибка оформления заказа";
      } else {
        alert(err.message || "Ошибка оформления заказа");
      }
    }
  });

  // Обновлять стоимость доставки в сайдбаре при смене способа
  function updateDeliveryDisplay() {
    const info = getDeliveryInfo();
    const deliveryEl = document.querySelector("[data-checkout-delivery-cost]");
    if (deliveryEl) {
      deliveryEl.textContent = info.cost === 0 ? "Бесплатно" : `${info.cost} ₽`;
    }
    // Пересчитать итого
    const subtotalEl = document.querySelector("[data-checkout-subtotal]");
    const totalEl = document.querySelector("[data-checkout-total]");
    const discountEl = document.querySelector("[data-checkout-discount]");
    if (subtotalEl && totalEl) {
      const sub = parseInt(subtotalEl.dataset.value || "0", 10) || 0;
      const disc = parseInt((discountEl && discountEl.dataset.value) || "0", 10) || 0;
      const total = Math.max(0, sub - disc) + info.cost;
      totalEl.textContent = `${total.toString().replace(/\B(?=(\d{3})+(?!\d))/g, " ")} ₽`;
    }
  }

  form.querySelectorAll('[name="delivery"]').forEach((r) => {
    r.addEventListener("change", updateDeliveryDisplay);
  });
})();
