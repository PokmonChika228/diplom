(function () {
  const form = document.getElementById("admin-login-form");
  const errorEl = document.getElementById("admin-login-error");
  if (!form) return;

  function showError(text) {
    if (!errorEl) return;
    errorEl.hidden = !text;
    errorEl.textContent = text || "";
  }

  fetch("/api/admin/session")
    .then((r) => (r.ok ? r.json() : null))
    .then((data) => {
      if (data?.authenticated) location.href = "/admin";
    })
    .catch(() => {});

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    showError("");
    const fd = new FormData(form);
    const payload = {
      login: String(fd.get("login") || "").trim(),
      password: String(fd.get("password") || ""),
    };
    try {
      const res = await fetch("/api/admin/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Ошибка авторизации");
      location.href = "/admin";
    } catch (err) {
      showError(err.message || "Ошибка авторизации");
    }
  });
})();
