/**
 * Каталог товаров для прототипа. DYNAMIC: заменить ответом API.
 * id совпадает с ?id= в product.html и ссылками из каталога.
 */
(function () {
  const u = (path, w) =>
    `https://images.unsplash.com/${path}?w=${w}&q=80&auto=format&fit=crop`;

  window.PRODUCT_CATALOG = {
    coat: {
      name: "Пальто оверсайз, шерсть",
      priceRub: 42900,
      compareAtRub: null,
      stock: "В наличии",
      breadcrumbShort: "Пальто оверсайз",
      images: [
        {
          full: u("photo-1539533018447-63fcce2678e3", 1200),
          thumb: u("photo-1539533018447-63fcce2678e3", 200),
          alt: "Пальто — вид спереди",
        },
        {
          full: u("photo-1594938298603-c8148c4dae35", 1200),
          thumb: u("photo-1594938298603-c8148c4dae35", 200),
          alt: "Пальто — фактура ткани",
        },
        {
          full: u("photo-1617137968427-85924c800a22", 1200),
          thumb: u("photo-1617137968427-85924c800a22", 200),
          alt: "Пальто в образе",
        },
      ],
      description:
        "Минималистичный крой, широкие лацканы, скрытая застёжка. Подкладка из вискозы. Длина ниже колена, оверсайз-силуэт.",
      composition: "80% шерсть, 20% полиамид.",
      care: "Только химчистка. Не отбеливать. Хранить на широких плечиках.",
      sizes: [
        { code: "XS", available: true },
        { code: "S", available: true },
        { code: "M", available: true },
        { code: "L", available: true },
        { code: "XL", available: false },
      ],
      colors: [
        { className: "swatch--black", label: "Чёрный" },
        { className: "swatch--beige", label: "Песочный" },
      ],
    },
    sweater: {
      name: "Кашемировый свитер",
      priceRub: 18500,
      compareAtRub: null,
      stock: "В наличии",
      breadcrumbShort: "Кашемировый свитер",
      images: [
        {
          full: u("photo-1576566588028-4147f3842f27", 1200),
          thumb: u("photo-1576566588028-4147f3842f27", 200),
          alt: "Свитер — общий вид",
        },
        {
          full: u("photo-1434389677669-e08b4cac3105", 1200),
          thumb: u("photo-1434389677669-e08b4cac3105", 200),
          alt: "Свитер — деталь вязки",
        },
      ],
      description:
        "Мягкий кашемир, классическая посадка. Идеален как базовый слой или самостоятельная верхняя вещь в прохладную погоду.",
      composition: "100% кашемир.",
      care: "Ручная стирка 30°C. Сушить в горизонтальном положении.",
      sizes: [
        { code: "XS", available: true },
        { code: "S", available: true },
        { code: "M", available: true },
        { code: "L", available: true },
        { code: "XL", available: true },
      ],
      colors: [
        { className: "swatch--beige", label: "Бежевый" },
        { className: "swatch--black", label: "Графит" },
      ],
    },
    pants: {
      name: "Брюки с защипами",
      priceRub: 9900,
      compareAtRub: 12900,
      stock: "В наличии",
      breadcrumbShort: "Брюки с защипами",
      images: [
        {
          full: u("photo-1594938298603-c8148c4dae35", 1200),
          thumb: u("photo-1594938298603-c8148c4dae35", 200),
          alt: "Брюки — вид спереди",
        },
        {
          full: u("photo-1620799140408-ed534d3b6327", 1200),
          thumb: u("photo-1620799140408-ed534d3b6327", 200),
          alt: "Брюки — силуэт",
        },
      ],
      description:
        "Высокая посадка, защипы, стрелки. Ткань с лёгким блеском, хорошо держит форму.",
      composition: "65% вискоза, 33% полиэстер, 2% эластан.",
      care: "Стирка 30°C, деликатный режим. Гладить с изнанки.",
      sizes: [
        { code: "44", available: true },
        { code: "46", available: true },
        { code: "48", available: true },
        { code: "50", available: true },
        { code: "52", available: false },
      ],
      colors: [{ className: "swatch--blue", label: "Тёмно-синий" }],
    },
    blazer: {
      name: "Пиджак двубортный",
      priceRub: 31200,
      compareAtRub: null,
      stock: "В наличии",
      breadcrumbShort: "Пиджак двубортный",
      images: [
        {
          full: u("photo-1617137968427-85924c800a22", 1200),
          thumb: u("photo-1617137968427-85924c800a22", 200),
          alt: "Пиджак",
        },
        {
          full: u("photo-1539533018447-63fcce2678e3", 1200),
          thumb: u("photo-1539533018447-63fcce2678e3", 200),
          alt: "Пиджак — другой ракурс",
        },
      ],
      description:
        "Двубортный пиджак с мягкой конструкцией плеча. Подойдёт и к брюкам, и к дениму.",
      composition: "54% шерсть, 46% полиэстер.",
      care: "Химчистка.",
      sizes: [
        { code: "44", available: true },
        { code: "46", available: true },
        { code: "48", available: true },
        { code: "50", available: true },
      ],
      colors: [{ className: "swatch--black", label: "Чёрный" }],
    },
    jacket: {
      name: "Куртка утеплённая",
      priceRub: 27400,
      compareAtRub: null,
      stock: "Осталось мало",
      breadcrumbShort: "Куртка утеплённая",
      images: [
        {
          full: u("photo-1591047139829-d91aecb6caea", 1200),
          thumb: u("photo-1591047139829-d91aecb6caea", 200),
          alt: "Куртка",
        },
        {
          full: u("photo-1591047139829-d91aecb6caea", 1200),
          thumb: u("photo-1591047139829-d91aecb6caea", 200),
          alt: "Куртка — вид сбоку",
        },
      ],
      description:
        "Лёгкий утеплитель, ветрозащитная ткань, капюшон складывается в воротник.",
      composition: "Верх: 100% полиамид. Утеплитель: синтепон.",
      care: "Стирка 30°C, без отжима.",
      sizes: [
        { code: "S", available: true },
        { code: "M", available: true },
        { code: "L", available: false },
        { code: "XL", available: true },
      ],
      colors: [
        { className: "swatch--black", label: "Чёрный" },
        { className: "swatch--blue", label: "Синий" },
      ],
    },
    shirt: {
      name: "Рубашка изо льна",
      priceRub: 9800,
      compareAtRub: null,
      stock: "В наличии",
      breadcrumbShort: "Рубашка изо льна",
      images: [
        {
          full: u("photo-1434389677669-e08b4cac3105", 1200),
          thumb: u("photo-1434389677669-e08b4cac3105", 200),
          alt: "Рубашка",
        },
      ],
      description:
        "Плотный лён, свободный крой. Естественная фактура ткани с характерными складками.",
      composition: "100% лён.",
      care: "Стирка 30°C. Гладить влажной.",
      sizes: [
        { code: "XS", available: true },
        { code: "S", available: true },
        { code: "M", available: true },
        { code: "L", available: true },
      ],
      colors: [
        { className: "swatch--white", label: "Белый" },
        { className: "swatch--beige", label: "Песок" },
      ],
    },
    tee: {
      name: "Футболка плотный хлопок",
      priceRub: 4200,
      compareAtRub: null,
      stock: "В наличии",
      breadcrumbShort: "Футболка",
      images: [
        {
          full: u("photo-1620799140408-ed534d3b6327", 1200),
          thumb: u("photo-1620799140408-ed534d3b6327", 200),
          alt: "Футболка",
        },
      ],
      description: "Плотный трикотаж, круглый вырез, аккуратные швы.",
      composition: "100% хлопок.",
      care: "Стирка до 40°C.",
      sizes: [
        { code: "XS", available: true },
        { code: "S", available: true },
        { code: "M", available: true },
        { code: "L", available: true },
        { code: "XL", available: true },
      ],
      colors: [
        { className: "swatch--black", label: "Чёрный" },
        { className: "swatch--white", label: "Белый" },
      ],
    },
    bag: {
      name: "Кожаная сумка",
      priceRub: 24000,
      compareAtRub: null,
      stock: "В наличии",
      breadcrumbShort: "Кожаная сумка",
      images: [
        {
          full: u("photo-1548036328-c9fa89d128fa", 1200),
          thumb: u("photo-1548036328-c9fa89d128fa", 200),
          alt: "Сумка",
        },
        {
          full: u("photo-1548036328-c9fa89d128fa", 1200),
          thumb: u("photo-1548036328-c9fa89d128fa", 200),
          alt: "Сумка — вид сбоку",
        },
      ],
      description:
        "Натуральная кожа, вместительное отделение, съёмный плечевой ремень.",
      composition: "Натуральная кожа, фурнитура — латунь.",
      care: "Сухая чистка. Хранить в чехле.",
      sizes: [{ code: "One size", available: true }],
      colors: [],
    },
    dress: {
      name: "Платье миди",
      priceRub: 15600,
      compareAtRub: null,
      stock: "В наличии",
      breadcrumbShort: "Платье миди",
      images: [
        {
          full: u("photo-1595777457583-95e059d581b8", 1200),
          thumb: u("photo-1595777457583-95e059d581b8", 200),
          alt: "Платье",
        },
      ],
      description: "Миди-длина, плавный крой по фигуре, потайная молния сзади.",
      composition: "92% вискоза, 8% эластан.",
      care: "Стирка 30°C.",
      sizes: [
        { code: "XS", available: true },
        { code: "S", available: true },
        { code: "M", available: true },
        { code: "L", available: true },
      ],
      colors: [{ className: "swatch--black", label: "Чёрный" }],
    },
    blouse: {
      name: "Шёлковая блузка",
      priceRub: 11200,
      compareAtRub: null,
      stock: "В наличии",
      breadcrumbShort: "Шёлковая блузка",
      images: [
        {
          full: u("photo-1564257631407-4deb1f99d992", 1200),
          thumb: u("photo-1564257631407-4deb1f99d992", 200),
          alt: "Блузка",
        },
      ],
      description: "Натуральный шёлк, классический воротник, манжеты на пуговицах.",
      composition: "100% шёлк.",
      care: "Химчистка или деликатная ручная стирка.",
      sizes: [
        { code: "XS", available: true },
        { code: "S", available: true },
        { code: "M", available: true },
        { code: "L", available: false },
      ],
      colors: [
        { className: "swatch--white", label: "Молочный" },
        { className: "swatch--beige", label: "Пудра" },
      ],
    },
  };

  window.getProductById = function (id) {
    return window.PRODUCT_CATALOG[id] || null;
  };
})();
