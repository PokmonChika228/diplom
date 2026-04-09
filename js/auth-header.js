(function () {
  var USER_ICON_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="22" height="22" aria-hidden="true"><circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7" stroke-linecap="round"/></svg>';

  function injectAccountBtn() {
    var actions = document.querySelector(".header-actions");
    if (!actions || document.getElementById("header-account-btn")) return;

    var btn = document.createElement("a");
    btn.id = "header-account-btn";
    btn.href = "account.html";
    btn.className = "icon-btn";
    btn.setAttribute("aria-label", "Мой аккаунт");
    btn.innerHTML = USER_ICON_SVG;
    btn.style.cssText = "position:relative";

    var cartBtn = actions.querySelector(".cart-btn");
    if (cartBtn) {
      actions.insertBefore(btn, cartBtn);
    } else {
      actions.prepend(btn);
    }

    fetch("/api/auth/me").then(function (r) { return r.json(); }).then(function (d) {
      if (d.user) {
        btn.title = d.user.name || d.user.email;
        var dot = document.createElement("span");
        dot.style.cssText = "position:absolute;top:2px;right:2px;width:6px;height:6px;border-radius:50%;background:var(--color-sale);border:1px solid var(--color-bg)";
        btn.appendChild(dot);
      } else {
        btn.href = "login.html";
      }
    }).catch(function () {
      btn.href = "login.html";
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", injectAccountBtn);
  } else {
    injectAccountBtn();
  }
})();
