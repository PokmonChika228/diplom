(function () {
  var STORAGE_KEY = "zhuchy_currency";
  window.EXCHANGE_RATE = 90;

  fetch("/api/exchange-rate")
    .then(function (r) { return r.json(); })
    .then(function (d) {
      var rate = d.usdToRub || 0;
      if (rate > 0) {
        window.EXCHANGE_RATE = rate;
        if (window.CURRENCY === "USD") {
          window.dispatchEvent(new CustomEvent("currencychange", { detail: { currency: "USD" } }));
        }
      }
    })
    .catch(function () {});

  function getCurrency() {
    return localStorage.getItem(STORAGE_KEY) === "USD" ? "USD" : "RUB";
  }

  function setCurrency(c) {
    localStorage.setItem(STORAGE_KEY, c);
  }

  window.CURRENCY = getCurrency();

  function rubToStr(priceRub) {
    return Math.round(Number(priceRub || 0)).toLocaleString("ru-RU") + "\u00a0\u20bd";
  }

  function rubToUsdStr(priceRub, priceUsd) {
    var usd = Number(priceUsd || 0);
    if (usd <= 0) usd = Math.round(Number(priceRub || 0) / window.EXCHANGE_RATE);
    return "~$" + usd.toLocaleString("en-US");
  }

  window.formatPrice = function (priceRub, priceUsd) {
    var rub = rubToStr(priceRub);
    if (window.CURRENCY === "USD") {
      return rub + " / " + rubToUsdStr(priceRub, priceUsd);
    }
    return rub;
  };

  window.formatOldPrice = function (priceRub, priceUsd) {
    var rub = rubToStr(priceRub);
    if (window.CURRENCY === "USD") {
      return rub + " / " + rubToUsdStr(priceRub, priceUsd);
    }
    return rub;
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
