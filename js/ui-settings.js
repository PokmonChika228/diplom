(function () {
  fetch("/api/ui-settings")
    .then(function (r) { return r.ok ? r.json() : null; })
    .then(function (s) {
      if (!s) return;

      if (s.ticker && s.ticker.enabled && s.ticker.text) {
        var ticker = document.getElementById("site-ticker");
        var t1 = document.getElementById("site-ticker-text");
        var t2 = document.getElementById("site-ticker-text2");
        if (ticker && t1) {
          var sep = "   \u2022   ";
          var repeated = s.ticker.text + sep + s.ticker.text + sep + s.ticker.text + sep + s.ticker.text;
          t1.textContent = repeated;
          if (t2) t2.textContent = repeated;
          ticker.hidden = false;
        }
      }

      if (s.heroImage && s.heroImage.src) {
        var heroImg = document.querySelector(".hero__parallax-img");
        if (heroImg) heroImg.src = s.heroImage.src;
      }
    })
    .catch(function () {});
})();
