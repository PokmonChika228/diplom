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
          t1.textContent = s.ticker.text;
          if (t2) t2.textContent = s.ticker.text;
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
