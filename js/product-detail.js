/**
 * Страница товара: данные из API + добавление в корзину.
 */
(function () {
  const params = new URLSearchParams(location.search);
  const id = params.get("id");
  if (!id) return;

  const mainImg = document.querySelector("[data-pdp-main]");
  const thumbsRoot = document.querySelector("[data-pdp-thumbs]");
  const colorWrap = document.querySelector("[data-pdp-colors-wrap]");
  const colorsRoot = document.querySelector("[data-pdp-colors]");
  const sizesRoot = document.querySelector("[data-pdp-sizes]");
  const relatedRoot = document.querySelector("[data-pdp-related]");
  const addBtn = document.querySelector("[data-add-to-cart]");
  const toast = document.querySelector("[data-pdp-toast]");

  function formatRub(n) {
    return `${Math.round(Number(n) || 0)
      .toString()
      .replace(/\B(?=(\d{3})+(?!\d))/g, " ")} ₽`;
  }

  function productPriceHtml(product) {
    const current = Number(product.price || 0);
    const old = Number(product.oldPrice || 0);
    if (old > current) {
      return `<del>${formatRub(old)}</del> <strong>${formatRub(current)}</strong>`;
    }
    return formatRub(current);
  }

  function selectedSize() {
    const sel = document.querySelector("[data-pdp-sizes] .size-btn.is-selected");
    return sel ? sel.textContent.trim() : "";
  }

  function setupLightbox() {
    const lightbox = document.querySelector("[data-lightbox]");
    const lightboxImg = lightbox?.querySelector("img");
    const lightboxClose = document.querySelector("[data-lightbox-close]");
    if (!lightbox || !lightboxImg || !mainImg) return;
    const open = () => {
      lightboxImg.src = mainImg.src;
      lightboxImg.alt = mainImg.alt;
      lightbox.classList.add("is-open");
      document.body.style.overflow = "hidden";
    };
    const close = () => {
      lightbox.classList.remove("is-open");
      document.body.style.overflow = "";
    };
    mainImg.addEventListener("click", open);
    lightboxClose?.addEventListener("click", close);
    lightbox.addEventListener("click", (e) => e.target === lightbox && close());
    document.addEventListener("keydown", (e) => e.key === "Escape" && close());
  }

  function setThumbs(imageUrl) {
    if (!mainImg || !thumbsRoot) return;
    mainImg.src = imageUrl;
    mainImg.alt = "";
    thumbsRoot.innerHTML = "";
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "pdp-thumb is-active";
    btn.innerHTML = `<img src="${imageUrl}" alt="" width="72" height="72" />`;
    thumbsRoot.appendChild(btn);
  }

  function setSizes(sizes) {
    if (!sizesRoot) return;
    const items = Array.isArray(sizes) && sizes.length ? sizes : ["ONE"];
    sizesRoot.innerHTML = "";
    items.forEach((s, idx) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "size-btn" + (idx === 0 ? " is-selected" : "");
      btn.textContent = String(s);
      btn.addEventListener("click", () => {
        sizesRoot.querySelectorAll(".size-btn").forEach((b) => b.classList.remove("is-selected"));
        btn.classList.add("is-selected");
      });
      sizesRoot.appendChild(btn);
    });
  }

  function setColors(colors) {
    if (!colorWrap || !colorsRoot) return;
    if (!Array.isArray(colors) || !colors.length) {
      colorWrap.hidden = true;
      return;
    }
    colorWrap.hidden = false;
    const map = {
      black: "swatch--black",
      white: "swatch--white",
      beige: "swatch--beige",
      blue: "swatch--blue",
    };
    colorsRoot.innerHTML = "";
    colors.forEach((c, i) => {
      const key = String(c).toLowerCase();
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = `swatch ${map[key] || "swatch--black"}${i === 0 ? " is-selected" : ""}`;
      btn.setAttribute("aria-label", key);
      btn.setAttribute("aria-pressed", i === 0 ? "true" : "false");
      btn.addEventListener("click", () => {
        colorsRoot.querySelectorAll(".swatch").forEach((b) => {
          b.classList.remove("is-selected");
          b.setAttribute("aria-pressed", "false");
        });
        btn.classList.add("is-selected");
        btn.setAttribute("aria-pressed", "true");
      });
      colorsRoot.appendChild(btn);
    });
  }

  function renderRelated(products, currentId) {
    if (!relatedRoot) return;
    relatedRoot.innerHTML = "";
    products
      .filter((p) => String(p.id) !== String(currentId))
      .slice(0, 4)
      .forEach((p) => {
        const card = document.createElement("article");
        card.className = "product-card";
        card.innerHTML = `
          <div class="product-card__top">
            <div class="product-card__media">
              <img src="${p.image || "https://placehold.co/800x600?text=Product"}" alt="" width="800" height="600" loading="lazy" />
            </div>
          </div>
          <div class="product-card__body">
            <h3 class="product-card__name">${p.name}</h3>
            <p class="product-card__price">${productPriceHtml(p)}</p>
          </div>
          <a href="product.html?id=${encodeURIComponent(p.id)}" class="product-card__stretched-link"><span class="visually-hidden">${p.name}</span></a>
        `;
        relatedRoot.appendChild(card);
      });
  }

  async function init() {
    try {
      const [productRes, allRes] = await Promise.all([
        fetch(`/api/products/${encodeURIComponent(id)}`),
        fetch("/api/products"),
      ]);
      if (!productRes.ok) throw new Error("Товар не найден");
      const product = await productRes.json();
      const allProducts = allRes.ok ? await allRes.json() : [];

      document.title = `${product.name} — ZHUCHY club`;
      const bc = document.querySelector("[data-pdp-breadcrumb]");
      if (bc) bc.textContent = product.name;
      const h1 = document.querySelector(".pdp-buy__title");
      if (h1) h1.textContent = product.name;
      const price = document.querySelector("[data-pdp-price]");
      if (price) price.innerHTML = productPriceHtml(product);
      const stock = document.querySelector(".pdp-buy__stock");
      if (stock) stock.textContent = product.stock > 0 ? "В наличии" : "Нет в наличии";
      const desc = document.querySelector("[data-pdp-desc]");
      const comp = document.querySelector("[data-pdp-composition]");
      const care = document.querySelector("[data-pdp-care]");
      if (desc) desc.textContent = product.description || "Описание скоро появится.";
      if (comp) comp.textContent = "Состав уточняется.";
      if (care) care.textContent = "Рекомендации по уходу уточняются.";

      setThumbs(product.image || "https://placehold.co/1200x900?text=Product");
      setSizes(product.sizes);
      setColors(product.colors);
      renderRelated(Array.isArray(allProducts) ? allProducts : [], product.id);
      setupLightbox();

      if (addBtn && typeof window.addToCart === "function") {
        addBtn.addEventListener("click", () => {
          const size = selectedSize() || "ONE";
          window.addToCart(String(product.id), size, 1);
          if (toast) {
            toast.hidden = false;
            clearTimeout(addBtn._toastT);
            addBtn._toastT = setTimeout(() => (toast.hidden = true), 2200);
          }
        });
      }
    } catch (e) {
      const h1 = document.querySelector(".pdp-buy__title");
      if (h1) h1.textContent = "Товар не найден";
    }
  }

  init();
})();
