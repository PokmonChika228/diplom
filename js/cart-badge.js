/** Обновить бейджи корзины по данным в sessionStorage (после cart-storage.js). */
(function () {
  if (typeof window.syncCartBadges === "function") {
    window.syncCartBadges();
  }
})();
