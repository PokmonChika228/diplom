/**
 * Корзина в sessionStorage. Формат строк: { productId, size, qty }
 * DYNAMIC: заменить на API.
 */
(function () {
  const KEY = "brandCartLines";

  window.getCartLines = function () {
    try {
      const s = sessionStorage.getItem(KEY);
      const arr = s ? JSON.parse(s) : [];
      return Array.isArray(arr) ? arr : [];
    } catch {
      return [];
    }
  };

  function badgeTotal(lines) {
    return lines.reduce((sum, l) => sum + (parseInt(l.qty, 10) || 0), 0);
  }

  window.syncCartBadges = function () {
    const n = badgeTotal(window.getCartLines());
    document.querySelectorAll("[data-cart-count]").forEach((el) => {
      el.textContent = String(n);
      if (n === 0) el.setAttribute("hidden", "");
      else el.removeAttribute("hidden");
    });
  };

  window.saveCartLines = function (lines) {
    sessionStorage.setItem(KEY, JSON.stringify(lines));
    window.syncCartBadges();
  };

  window.addToCart = function (productId, size, qty) {
    if (!productId || !size) return false;
    qty = Math.max(1, parseInt(qty, 10) || 1);
    const lines = window.getCartLines();
    const idx = lines.findIndex(
      (l) => l.productId === productId && l.size === size
    );
    if (idx >= 0) lines[idx].qty = (parseInt(lines[idx].qty, 10) || 0) + qty;
    else lines.push({ productId, size, qty });
    window.saveCartLines(lines);
    return true;
  };

  window.updateCartLineQty = function (productId, size, qty) {
    qty = Math.max(1, parseInt(qty, 10) || 1);
    const lines = window.getCartLines();
    const idx = lines.findIndex(
      (l) => l.productId === productId && l.size === size
    );
    if (idx < 0) return;
    lines[idx].qty = qty;
    window.saveCartLines(lines);
  };

  window.removeCartLine = function (productId, size) {
    const lines = window.getCartLines().filter(
      (l) => !(l.productId === productId && l.size === size)
    );
    window.saveCartLines(lines);
  };

  window.syncCartBadges();
})();
