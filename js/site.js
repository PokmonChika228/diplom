/**
 * Общий JS: хедер, мобильное меню, фильтры каталога, PDP (мини-галерея, лайтбокс, аккордеон).
 * Подключать на всех страницах после разметки.
 */
(function () {
  const header = document.querySelector(".site-header");
  const toggle = document.querySelector(".menu-toggle");
  const closeBtn = document.querySelector(".drawer-close");
  const backdrop = document.querySelector(".mobile-backdrop");
  const drawer = document.querySelector(".mobile-drawer");

  function setMenuOpen(open) {
    document.body.style.overflow = open ? "hidden" : "";
    backdrop?.classList.toggle("is-open", open);
    drawer?.classList.toggle("is-open", open);
    toggle?.setAttribute("aria-expanded", String(open));
  }

  toggle?.addEventListener("click", () => setMenuOpen(true));
  closeBtn?.addEventListener("click", () => setMenuOpen(false));
  backdrop?.addEventListener("click", () => setMenuOpen(false));

  drawer?.querySelectorAll("a[href]").forEach((a) => {
    a.addEventListener("click", () => setMenuOpen(false));
  });

  /* Фильтры каталога (моб.) */
  const filterToggle = document.querySelector("[data-filter-toggle]");
  const filterPanel = document.querySelector("[data-filters-panel]");
  const filterBackdrop = document.querySelector("[data-filters-backdrop]");
  const filterClose = document.querySelector("[data-filter-close]");

  function setFiltersOpen(open) {
    filterPanel?.classList.toggle("is-open", open);
    filterBackdrop?.classList.toggle("is-open", open);
    if (open && window.matchMedia("(max-width: 1023px)").matches) {
      document.body.style.overflow = "hidden";
    } else if (!open) {
      document.body.style.overflow = "";
    }
  }

  filterToggle?.addEventListener("click", () => setFiltersOpen(true));
  filterClose?.addEventListener("click", () => setFiltersOpen(false));
  filterBackdrop?.addEventListener("click", () => setFiltersOpen(false));

  window.addEventListener("resize", () => {
    if (window.innerWidth >= 1024) setFiltersOpen(false);
  });

  /* Fallback: клик по карточке товара открывает страницу товара */
  document.querySelectorAll(".product-card").forEach((card) => {
    const link = card.querySelector(".product-card__stretched-link");
    if (!link) return;
    card.addEventListener("click", (e) => {
      if (e.defaultPrevented) return;
      const interactive = e.target.closest(
        "a, button, input, select, textarea, label"
      );
      if (interactive) return;
      window.location.href = link.href;
    });
  });

  let ticking = false;
  window.addEventListener(
    "scroll",
    () => {
      if (!ticking) {
        requestAnimationFrame(() => {
          header?.classList.toggle("is-scrolled", window.scrollY > 8);
          ticking = false;
        });
        ticking = true;
      }
    },
    { passive: true }
  );

  /* Аккордеон */
  document.querySelectorAll("[data-accordion-trigger]").forEach((trigger) => {
    trigger.addEventListener("click", () => {
      const item = trigger.closest("[data-accordion-item]");
      const open = item?.classList.contains("is-open");
      document.querySelectorAll("[data-accordion-item]").forEach((i) => {
        i.classList.remove("is-open");
        i.querySelector("[data-accordion-trigger]")?.setAttribute("aria-expanded", "false");
      });
      if (!open && item) {
        item.classList.add("is-open");
        trigger.setAttribute("aria-expanded", "true");
      }
    });
  });
})();
