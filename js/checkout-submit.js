/**
 * Чекаут: вместо сабмита (и ошибки) показываем окно «Заказ принят».
 * DYNAMIC: заменить на реальный запрос к API.
 */
(function () {
  const form = document.querySelector("[data-checkout-form]");
  const modal = document.querySelector("[data-checkout-modal]");
  const closeBtn = document.querySelector("[data-modal-close]");
  const errorBox = document.querySelector("[data-checkout-error]");
  if (!form || !modal) return;

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

    const payload = {
      customerName: form.querySelector('[name="name"]')?.value?.trim(),
      phone: form.querySelector('[name="phone"]')?.value?.trim(),
      email: form.querySelector('[name="email"]')?.value?.trim(),
      address: form.querySelector('[name="address"]')?.value?.trim(),
      promoCode: sessionStorage.getItem("brandPromoCode") || "",
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

    // Мягкая валидация: покажем нативные подсказки браузера
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
})();

