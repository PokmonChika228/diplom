(function () {
  var STORAGE_KEY = "zhuchy_currency";

  function getCurrency() {
    return localStorage.getItem(STORAGE_KEY) === "USD" ? "USD" : "RUB";
  }

  function setCurrency(c) {
    localStorage.setItem(STORAGE_KEY, c);
  }

  window.CURRENCY = getCurrency();

  window.formatPrice = function (priceRub, priceUsd) {
    if (window.CURRENCY === "USD") {
      var usd = Number(priceUsd || 0);
      if (usd > 0) return "$" + usd.toLocaleString("en-US");
      return "$" + Math.round((Number(priceRub || 0)) / 90).toLocaleString("en-US");
    }
    return Math.round(Number(priceRub || 0)).toLocaleString("ru-RU") + "\u00a0\u20bd";
  };

  window.formatOldPrice = function (priceRub, priceUsd) {
    if (window.CURRENCY === "USD") {
      var usd = Number(priceUsd || 0);
      if (usd > 0) return "$" + usd.toLocaleString("en-US");
      return "$" + Math.round((Number(priceRub || 0)) / 90).toLocaleString("en-US");
    }
    return Math.round(Number(priceRub || 0)).toLocaleString("ru-RU") + "\u00a0\u20bd";
  };

  function applyToggleState() {
    var c = window.CURRENCY;
    document.querySelectorAll("[data-currency-toggle]").forEach(function (btn) {
      btn.querySelector(".cur-rub") && (btn.querySelector(".cur-rub").classList.toggle("is-active-cur", c === "RUB"));
      btn.querySelector(".cur-usd") && (btn.querySelector(".cur-usd").classList.toggle("is-active-cur", c === "USD"));
    });
  }

  document.addEventListener("DOMContentLoaded", function () {
    applyToggleState();
    document.querySelectorAll("[data-currency-toggle]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        window.CURRENCY = window.CURRENCY === "RUB" ? "USD" : "RUB";
        setCurrency(window.CURRENCY);
        applyToggleState();
        window.dispatchEvent(new CustomEvent("currencychange", { detail: { currency: window.CURRENCY } }));
      });
    });
  });
})();
