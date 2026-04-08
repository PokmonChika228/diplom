/**
 * Каталог: фильтр по hash (#mens, #womens, #accessories, #sale).
 * DYNAMIC: заменить на запрос к API с теми же категориями.
 */
(function () {
  const grid = document.querySelector("[data-catalog-grid]");
  if (!grid) return;
  const sortSelect = document.querySelector("[data-sort]");
  const pagination = document.querySelector(".pagination");
  const PAGE_SIZE = 6;
  let currentPage = 1;
  let bootstrapped = false;

  const HASH_TO_CAT = {
    "#mens": "mens",
    "#womens": "womens",
    "#accessories": "accessories",
    "#sale": "sale",
  };

  function currentCategory() {
    const h = (location.hash || "").toLowerCase();
    return HASH_TO_CAT[h] || "all";
  }

  function setNavActive(cat) {
    document.querySelectorAll("[data-nav-cat]").forEach((link) => {
      const v = link.getAttribute("data-nav-cat");
      const active = cat === "all" ? false : v === cat;
      link.classList.toggle("is-active", active);
    });
  }

  function cardData(card) {
    const name = (card.getAttribute("data-name") || "").trim();
    const price = parseInt(card.getAttribute("data-price") || "0", 10) || 0;
    const onSale = card.getAttribute("data-sale") === "true";
    const isNew = card.getAttribute("data-new") === "true";
    const cats = (card.getAttribute("data-category") || "").split(/\s+/).filter(Boolean);
    return { name, price, onSale, isNew, cats };
  }

  function makeCard(product) {
    const category = String(product.category || "other").toLowerCase();
    const categoryTokens =
      category === "unisex" ? "mens womens unisex" : category;
    const isSale = !!product.sale;
    const isNew = false;
    const price = Number(product.price || 0);
    const oldPrice = Number(product.oldPrice || 0);
    const hasOldPrice = oldPrice > price;
    const img = product.image || "https://placehold.co/800x600?text=Product";
    const id = product.id;

    const article = document.createElement("article");
    article.className = "product-card";
    article.setAttribute("data-category", categoryTokens);
    article.setAttribute("data-sale", String(isSale));
    article.setAttribute("data-name", product.name || "");
    article.setAttribute("data-price", String(price));
    article.setAttribute("data-new", String(isNew));
    article.innerHTML = `
      <div class="product-card__top">
        ${isSale ? '<div class="product-card__badges"><span class="badge badge--sale">Sale</span></div>' : ""}
        <div class="product-card__media">
          <img src="${img}" alt="" width="800" height="600" loading="lazy" />
        </div>
      </div>
      <div class="product-card__body">
        <h3 class="product-card__name">${product.name || "Без названия"}</h3>
        <p class="product-card__price">${
          hasOldPrice
            ? `<del>${oldPrice.toLocaleString("ru-RU")} ₽</del> <strong>${price.toLocaleString("ru-RU")} ₽</strong>`
            : `${price.toLocaleString("ru-RU")} ₽`
        }</p>
      </div>
      <a href="product.html?id=${encodeURIComponent(id)}" class="product-card__stretched-link">
        <span class="visually-hidden">${product.name || "Товар"} — карточка товара</span>
      </a>
    `;
    return article;
  }

  function renderPagination(totalPages) {
    if (!pagination) return;
    pagination.innerHTML = "";

    const makeLink = (label, page, disabled, current, aria) => {
      const el = document.createElement(current ? "span" : "a");
      el.textContent = label;
      if (aria) el.setAttribute("aria-label", aria);
      if (current) {
        el.className = "is-current";
        el.setAttribute("aria-current", "page");
      } else {
        el.href = "#";
        if (disabled) {
          el.style.pointerEvents = "none";
          el.style.opacity = "0.45";
        } else {
          el.addEventListener("click", (e) => {
            e.preventDefault();
            currentPage = page;
            apply();
          });
        }
      }
      pagination.appendChild(el);
    };

    makeLink("←", Math.max(1, currentPage - 1), currentPage === 1, false, "Предыдущая");
    for (let p = 1; p <= totalPages; p++) {
      makeLink(String(p), p, false, p === currentPage);
    }
    makeLink("→", Math.min(totalPages, currentPage + 1), currentPage === totalPages, false, "Следующая");
  }

  function apply() {
    const cat = currentCategory();
    const cards = Array.from(grid.querySelectorAll(".product-card"));
    const visiblePool = cards.filter((card) => {
      const d = cardData(card);
      if (cat === "sale") return d.onSale;
      if (cat !== "all") return d.cats.includes(cat);
      return true;
    });

    // Sort visible cards
    const mode = sortSelect?.value || "new";
    visiblePool.sort((a, b) => {
      const da = cardData(a);
      const db = cardData(b);
      if (mode === "price-asc") return da.price - db.price;
      if (mode === "price-desc") return db.price - da.price;
      if (mode === "name") return da.name.localeCompare(db.name, "ru");
      if (da.isNew !== db.isNew) return da.isNew ? -1 : 1;
      return db.price - da.price;
    });

    const totalVisible = visiblePool.length;
    const totalPages = Math.max(1, Math.ceil(totalVisible / PAGE_SIZE));
    currentPage = Math.min(currentPage, totalPages);
    const start = (currentPage - 1) * PAGE_SIZE;
    const end = start + PAGE_SIZE;
    const pageCards = new Set(visiblePool.slice(start, end));

    cards.forEach((card) => {
      const isVisible = pageCards.has(card);
      card.classList.toggle("is-hidden", !isVisible);
    });

    // Keep sorted order in DOM
    visiblePool.forEach((c) => grid.appendChild(c));

    const shown = pageCards.size;
    const total = totalVisible;
    const elShown = document.querySelector("[data-catalog-shown]");
    const elTotal = document.querySelector("[data-catalog-total]");
    if (elShown) elShown.textContent = String(shown);
    if (elTotal) elTotal.textContent = String(total);

    const countEl = document.querySelector(".catalog-count");
    if (countEl && !elShown)
      countEl.textContent = `Показано ${shown} из ${total}`;

    setNavActive(cat);
    renderPagination(totalPages);
  }

  async function bootstrapFromApi() {
    if (bootstrapped) return;
    bootstrapped = true;
    try {
      const res = await fetch("/api/products");
      if (!res.ok) throw new Error("Products API failed");
      const products = await res.json();
      if (!Array.isArray(products)) throw new Error("Invalid products payload");
      grid.innerHTML = "";
      products.forEach((p) => grid.appendChild(makeCard(p)));
    } catch {
      // If API is unavailable, don't show stale static mock products.
      grid.innerHTML = "";
    }
  }

  sortSelect?.addEventListener("change", () => {
    currentPage = 1;
    apply();
  });

  window.addEventListener("hashchange", () => {
    currentPage = 1;
    apply();
  });

  bootstrapFromApi().finally(apply);
})();
