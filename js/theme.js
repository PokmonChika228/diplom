(function () {
  var STORAGE_KEY = "zhuchy-theme";
  var LIGHT = "light";

  function getSaved() {
    try { return localStorage.getItem(STORAGE_KEY); } catch (e) { return null; }
  }
  function setSaved(v) {
    try { localStorage.setItem(STORAGE_KEY, v); } catch (e) {}
  }

  function applyTheme(theme) {
    if (theme === LIGHT) {
      document.documentElement.setAttribute("data-theme", "light");
    } else {
      document.documentElement.removeAttribute("data-theme");
    }
  }

  function getTheme() {
    var saved = getSaved();
    if (saved) return saved;
    return window.matchMedia && window.matchMedia("(prefers-color-scheme: light)").matches ? LIGHT : "dark";
  }

  var currentTheme = getTheme();
  applyTheme(currentTheme);

  function createBtn() {
    if (document.getElementById("theme-toggle")) return;

    var btn = document.createElement("button");
    btn.id = "theme-toggle";
    btn.setAttribute("aria-label", "Переключить тему");
    btn.setAttribute("title", currentTheme === LIGHT ? "Тёмная тема" : "Светлая тема");

    var actions = document.querySelector(".header-actions");
    if (actions) {
      btn.className = "icon-btn theme-toggle-btn";
      btn.innerHTML = currentTheme === LIGHT ? moonSvg() : sunSvg();
      actions.insertBefore(btn, actions.firstChild);
    } else {
      btn.className = "theme-toggle-fab";
      btn.innerHTML = currentTheme === LIGHT ? moonSvg() : sunSvg();
      document.body.appendChild(btn);
    }

    btn.addEventListener("click", function () {
      currentTheme = currentTheme === LIGHT ? "dark" : LIGHT;
      applyTheme(currentTheme);
      setSaved(currentTheme);
      btn.innerHTML = currentTheme === LIGHT ? moonSvg() : sunSvg();
      btn.setAttribute("title", currentTheme === LIGHT ? "Тёмная тема" : "Светлая тема");
    });
  }

  function sunSvg() {
    return '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
      '<circle cx="12" cy="12" r="4.5"/>' +
      '<line x1="12" y1="2" x2="12" y2="4.5"/>' +
      '<line x1="12" y1="19.5" x2="12" y2="22"/>' +
      '<line x1="2" y1="12" x2="4.5" y2="12"/>' +
      '<line x1="19.5" y1="12" x2="22" y2="12"/>' +
      '<line x1="4.93" y1="4.93" x2="6.64" y2="6.64"/>' +
      '<line x1="17.36" y1="17.36" x2="19.07" y2="19.07"/>' +
      '<line x1="4.93" y1="19.07" x2="6.64" y2="17.36"/>' +
      '<line x1="17.36" y1="6.64" x2="19.07" y2="4.93"/>' +
      '</svg>';
  }

  function moonSvg() {
    return '<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
      '<path d="M21 12.79A9 9 0 1 1 11.21 3a7 7 0 0 0 9.79 9.79z"/>' +
      '</svg>';
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", createBtn);
  } else {
    createBtn();
  }
})();
