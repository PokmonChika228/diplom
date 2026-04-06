/**
 * Контент ZHUCHY club.
 */
window.SITE_CONTENT = window.SITE_CONTENT || {
  brandName: "ZHUCHY club",
  home: {
    heroEyebrow: "Коллекция SS / 2026",
    heroTitle: "Тишина формы, чистота линии",
    heroLead:
      "Минималистичный гардероб для города и путешествий. Качество ткани и крой — без лишнего шума.",
    heroCtaPrimary: "Смотреть новинки",
    heroCtaSecondary: "О бренде",
    heroImageAlt: "Атмосферный снимок коллекции — заменить на брендовый кадр",
    heroImageSrc:
      "https://images.unsplash.com/photo-1469334031218-e382a71b716b?w=1920&q=80&auto=format&fit=crop",
    newArrivalsTitle: "Распродажа",
    newArrivalsLink: "В каталог",
    aboutTitle: "О бренде",
    aboutParagraphs: [
      "Мы про одежду, которая не конкурирует с человеком за внимание — она его поддерживает. Каждая вещь проходит контроль посадки и износостойкости.",
      "Производство и материалы указываются на карточке товара; здесь будет ваш реальный текст о философии и ценностях.",
    ],
    aboutImageAlt: "Деталь / ателье — заменить",
    aboutImageSrc:
      "https://images.unsplash.com/photo-1558171813-3c26a3e7c084?w=1200&q=80&auto=format&fit=crop",
    newsletterTitle: "Рассылка",
    newsletterText:
      "Анонсы коллекций и закрытых распродаж. Без спама — пара писем в месяц.",
    newsletterPlaceholder: "Электронная почта",
    newsletterCta: "Подписаться",
    newsletterNote: "Нажимая кнопку, вы соглашаетесь с обработкой данных. Текст заменить на юридический.",
  },
  nav: {
    categories: [
      { id: "mens", label: "Мужское", href: "catalog.html#mens" },
      { id: "womens", label: "Женское", href: "catalog.html#womens" },
      { id: "acc", label: "Аксессуары", href: "catalog.html#accessories" },
      { id: "sale", label: "Sale", href: "catalog.html#sale", highlight: true },
    ],
  },
  /** DYNAMIC: карточки с API — здесь только для прототипа */
  productsNew: [
    {
      id: "p1",
      name: "Пальто оверсайз, шерсть",
      price: "42 900 ₽",
      image:
        "https://images.unsplash.com/photo-1539533018447-63fcce2678e3?w=600&q=80&auto=format&fit=crop",
      badges: ["new"],
    },
    {
      id: "p2",
      name: "Кашемировый свитер",
      price: "18 500 ₽",
      image:
        "https://images.unsplash.com/photo-1576566588028-4147f3842f27?w=600&q=80&auto=format&fit=crop",
      badges: [],
    },
    {
      id: "p3",
      name: "Брюки с защипами",
      price: "12 900 ₽",
      salePrice: "9 900 ₽",
      image:
        "https://images.unsplash.com/photo-1594938298603-c8148c4dae35?w=600&q=80&auto=format&fit=crop",
      badges: ["sale"],
    },
    {
      id: "p4",
      name: "Кожаная сумка",
      price: "24 000 ₽",
      image:
        "https://images.unsplash.com/photo-1548036328-c9fa89d128fa?w=600&q=80&auto=format&fit=crop",
      badges: ["new"],
    },
  ],
};
