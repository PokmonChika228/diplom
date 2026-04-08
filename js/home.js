/**
 * Главная: лёгкий параллакс hero (картинка).
 */
(function () {
  const heroImg = document.querySelector(".hero__parallax-img");
  const saleGrid = document.querySelector("[data-home-sale-grid]");
  const saleEmpty = document.querySelector("[data-home-sale-empty]");
  if (!heroImg && !saleGrid) return;

  let ticking = false;
  if (heroImg) {
    window.addEventListener(
      "scroll",
      () => {
        if (!ticking) {
          requestAnimationFrame(() => {
            const y = window.scrollY;
            const shift = Math.min(y * 0.25, 80);
            heroImg.style.transform = `scale(1.08) translateY(${shift * 0.15}px)`;
            ticking = false;
          });
          ticking = true;
        }
      },
      { passive: true }
    );
  }

  function formatRub(n) {
    return `${Math.round(Number(n) || 0)
      .toString()
      .replace(/\B(?=(\d{3})+(?!\d))/g, " ")} ₽`;
  }

  function escapeHtml(s) {
    const d = document.createElement("div");
    d.textContent = s;
    return d.innerHTML;
  }

  function fp(rub, usd) { return typeof window.formatPrice === "function" ? window.formatPrice(rub, usd) : formatRub(rub); }

  let _saleProducts = [];

  function renderSaleCards(products) {
    _saleProducts = products || _saleProducts;
    if (!saleGrid) return;
    saleGrid.innerHTML = "";
    _saleProducts.forEach((p) => {
      const name = escapeHtml(p.name || "Товар");
      const price = fp(p.price, p.priceUsd);
      const hasOldPrice = Number(p.oldPrice || 0) > Number(p.price || 0);
      const oldPrice = fp(p.oldPrice, 0);
      const image = p.image || "https://placehold.co/800x600?text=Product";
      const id = encodeURIComponent(String(p.id));
      const card = document.createElement("article");
      card.className = "product-card";
      card.setAttribute("data-price", String(Number(p.price || 0)));
      card.setAttribute("data-price-usd", String(Number(p.priceUsd || 0)));
      card.setAttribute("data-old-price", String(Number(p.oldPrice || 0)));
      card.innerHTML = `
        <div class="product-card__top">
          <div class="product-card__badges"><span class="badge badge--sale">Sale</span></div>
          <div class="product-card__media">
            <img src="${image}" alt="${name}" width="800" height="600" loading="lazy" />
          </div>
        </div>
        <div class="product-card__body">
          <h3 class="product-card__name">${name}</h3>
          <p class="product-card__price">${
            hasOldPrice ? `<del>${oldPrice}</del> <strong>${price}</strong>` : price
          }</p>
        </div>
        <a href="product.html?id=${id}" class="product-card__stretched-link">
          <span class="visually-hidden">${name} — карточка товара</span>
        </a>
      `;
      saleGrid.appendChild(card);
    });
  }

  async function loadSale() {
    if (!saleGrid) return;
    try {
      const res = await fetch("/api/products");
      if (!res.ok) throw new Error("products request failed");
      const products = await res.json();
      const saleProducts = (Array.isArray(products) ? products : [])
        .filter((p) => !!p.sale)
        .slice(0, 12);
      renderSaleCards(saleProducts);
      if (saleEmpty) saleEmpty.hidden = saleProducts.length > 0;
    } catch {
      renderSaleCards([]);
      if (saleEmpty) saleEmpty.hidden = false;
    }
  }

  loadSale();
  window.addEventListener("currencychange", () => renderSaleCards());
})();
