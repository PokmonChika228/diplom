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

  /* ===== Валидация ===== */

  function showFieldError(input, msg) {
    clearFieldError(input);
    input.classList.add("input--error");
    const err = document.createElement("span");
    err.className = "field-error";
    err.textContent = msg;
    err.setAttribute("role", "alert");
    input.parentNode.appendChild(err);
    input.setAttribute("aria-invalid", "true");
  }

  function clearFieldError(input) {
    input.classList.remove("input--error");
    input.removeAttribute("aria-invalid");
    const prev = input.parentNode.querySelector(".field-error");
    if (prev) prev.remove();
  }

  function clearAllErrors() {
    form.querySelectorAll(".input--error, .textarea--error").forEach(function (el) {
      clearFieldError(el);
    });
    form.querySelectorAll(".field-error").forEach(function (el) { el.remove(); });
  }

  function validatePhone(val) {
    const clean = val.replace(/[\s\-\(\)]/g, "");
    return /^(\+7|8)\d{10}$/.test(clean);
  }

  function validateName(val) {
    const parts = val.trim().split(/\s+/);
    return parts.length >= 2 && parts.every(function (p) { return p.length >= 2; });
  }

  function getDeliveryVal() {
    const checked = form.querySelector('[name="delivery"]:checked');
    return checked ? checked.value : "pickup";
  }

  function validateForm() {
    clearAllErrors();
    let valid = true;

    const nameEl = form.querySelector('[name="name"]');
    const phoneEl = form.querySelector('[name="phone"]');
    const emailEl = form.querySelector('[name="email"]');
    const addressEl = form.querySelector('[name="address"]');

    if (!nameEl.value.trim()) {
      showFieldError(nameEl, "Введите имя и фамилию");
      valid = false;
    } else if (!validateName(nameEl.value)) {
      showFieldError(nameEl, "Укажите имя и фамилию через пробел");
      valid = false;
    }

    if (!phoneEl.value.trim()) {
      showFieldError(phoneEl, "Введите номер телефона");
      valid = false;
    } else if (!validatePhone(phoneEl.value)) {
      showFieldError(phoneEl, "Формат: +7 (999) 123-45-67 или 8 999 123 45 67");
      valid = false;
    }

    if (!emailEl.value.trim()) {
      showFieldError(emailEl, "Введите email");
      valid = false;
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailEl.value.trim())) {
      showFieldError(emailEl, "Некорректный email");
      valid = false;
    }

    const delivery = getDeliveryVal();
    if (delivery !== "pickup" && !addressEl.value.trim()) {
      showFieldError(addressEl, "Укажите адрес доставки");
      valid = false;
    }

    return valid;
  }

  /* live-валидация при blur */
  form.querySelector('[name="name"]').addEventListener("blur", function () {
    if (!this.value.trim()) { showFieldError(this, "Введите имя и фамилию"); return; }
    if (!validateName(this.value)) { showFieldError(this, "Укажите имя и фамилию через пробел"); return; }
    clearFieldError(this);
  });
  form.querySelector('[name="phone"]').addEventListener("blur", function () {
    if (!this.value.trim()) { showFieldError(this, "Введите номер телефона"); return; }
    if (!validatePhone(this.value)) { showFieldError(this, "Формат: +7 (999) 123-45-67 или 8 999 123 45 67"); return; }
    clearFieldError(this);
  });
  form.querySelector('[name="email"]').addEventListener("blur", function () {
    if (!this.value.trim()) { showFieldError(this, "Введите email"); return; }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(this.value.trim())) { showFieldError(this, "Некорректный email"); return; }
    clearFieldError(this);
  });
  form.querySelectorAll('[name="delivery"]').forEach(function (r) {
    r.addEventListener("change", function () {
      const addressEl = form.querySelector('[name="address"]');
      if (getDeliveryVal() === "pickup") {
        clearFieldError(addressEl);
      }
    });
  });

  /* ===== Модальное окно ===== */

  function getDeliveryInfo() {
    const val = getDeliveryVal();
    return DELIVERY_OPTIONS[val] || { label: "Самовывоз", cost: 0 };
  }

  function openModal() {
    modal.classList.add("is-open");
    modal.setAttribute("aria-hidden", "false");
    document.body.style.overflow = "hidden";
  }

  var _orderSuccess = false;

  function closeModal() {
    modal.classList.remove("is-open");
    modal.setAttribute("aria-hidden", "true");
    document.body.style.overflow = "";
    if (_orderSuccess) {
      window.location.href = "index.html";
    }
  }

  closeBtn && closeBtn.addEventListener("click", closeModal);
  modal.addEventListener("click", function (e) {
    if (e.target === modal) closeModal();
  });
  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape") closeModal();
  });

  /* ===== Отправка заказа ===== */

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
      customerName: form.querySelector('[name="name"]').value.trim(),
      phone: form.querySelector('[name="phone"]').value.trim(),
      email: form.querySelector('[name="email"]').value.trim(),
      address: form.querySelector('[name="address"]').value.trim(),
      comment: form.querySelector('[name="comment"]').value.trim(),
      promoCode: sessionStorage.getItem("brandPromoCode") || "",
      delivery: deliveryVal,
      deliveryLabel: deliveryInfo.label,
      deliveryCost: deliveryInfo.cost,
      payment: paymentVal,
      paymentLabel: PAYMENT_OPTIONS[paymentVal] || paymentVal,
      items: lines.map(function (l) { return { productId: l.productId, qty: l.qty }; }),
    };

    const res = await fetch("/api/orders", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await res.json().catch(function () { return {}; });
    if (!res.ok) throw new Error(data.error || "Не удалось оформить заказ");

    if ((paymentVal === "card" || paymentVal === "sbp") && data.total > 0) {
      const payRes = await fetch("/api/payment/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderId: data.id, amount: data.total, paymentType: paymentVal }),
      });
      const payData = await payRes.json().catch(function () { return {}; });
      if (payRes.ok && payData.confirmationUrl) {
        data._redirectUrl = payData.confirmationUrl;
      }
    }

    return data;
  }

  form.addEventListener("submit", async function (e) {
    e.preventDefault();

    if (!validateForm()) {
      const firstErr = form.querySelector(".input--error");
      if (firstErr) firstErr.scrollIntoView({ behavior: "smooth", block: "center" });
      return;
    }

    if (errorBox) {
      errorBox.hidden = true;
      errorBox.textContent = "";
    }

    const submitBtn = form.querySelector('[type="submit"]');
    if (submitBtn) { submitBtn.disabled = true; submitBtn.textContent = "Оформляем…"; }

    try {
      const order = await submitOrder();
      if (typeof window.saveCartLines === "function") window.saveCartLines([]);
      sessionStorage.removeItem("brandPromoCode");
      if (typeof window.syncCartBadges === "function") window.syncCartBadges();

      if (order._redirectUrl) {
        window.location.href = order._redirectUrl;
        return;
      }

      _orderSuccess = true;
      const p = modal.querySelector("p");
      if (p) {
        p.textContent = "Спасибо! Заказ №" + order.id + " успешно принят. Мы свяжемся с вами для подтверждения.";
      }
      openModal();
    } catch (err) {
      if (errorBox) {
        errorBox.hidden = false;
        errorBox.textContent = err.message || "Ошибка оформления заказа";
      } else {
        alert(err.message || "Ошибка оформления заказа");
      }
    } finally {
      if (submitBtn) { submitBtn.disabled = false; submitBtn.textContent = "Подтвердить заказ"; }
    }
  });

  /* ===== Стоимость доставки ===== */
  function updateDeliveryDisplay() {
    const info = getDeliveryInfo();
    const deliveryEl = document.querySelector("[data-checkout-delivery-cost]");
    if (deliveryEl) {
      deliveryEl.textContent = info.cost === 0 ? "Бесплатно" : info.cost + " ₽";
    }
    const subtotalEl = document.querySelector("[data-checkout-subtotal]");
    const totalEl = document.querySelector("[data-checkout-total]");
    const discountEl = document.querySelector("[data-checkout-discount]");
    if (subtotalEl && totalEl) {
      const sub = parseInt(subtotalEl.dataset.value || "0", 10) || 0;
      const disc = parseInt((discountEl && discountEl.dataset.value) || "0", 10) || 0;
      const total = Math.max(0, sub - disc) + info.cost;
      totalEl.textContent = total.toString().replace(/\B(?=(\d{3})+(?!\d))/g, " ") + " ₽";
    }
  }

  form.querySelectorAll('[name="delivery"]').forEach(function (r) {
    r.addEventListener("change", updateDeliveryDisplay);
  });
})();
