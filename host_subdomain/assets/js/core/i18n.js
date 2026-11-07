export class I18nManager {
  constructor() {
    this.lang = localStorage.getItem('ci_lang') || 'fa';
    this.dictionaries = { fa: {}, en: {} };
  }

  async init() {
    const [faRes, enRes] = await Promise.all([
      fetch('./i18n/fa.json').then((r) => r.json()).catch(() => ({})),
      fetch('./i18n/en.json').then((r) => r.json()).catch(() => ({})),
    ]);
    this.dictionaries.fa = faRes;
    this.dictionaries.en = enRes;
    this.applyDocumentDirection();
  }

  setLanguage(lang) {
    this.lang = lang === 'en' ? 'en' : 'fa';
    localStorage.setItem('ci_lang', this.lang);
    this.applyDocumentDirection();
  }

  getCurrentLanguage() {
    return this.lang || 'fa';
  }

  getLanguage() {
    return this.lang || 'fa';
  }

  applyDocumentDirection() {
    document.documentElement.lang = this.lang;
    document.documentElement.dir = this.lang === 'fa' ? 'rtl' : 'ltr';
  }

  t(key) {
    const active = this.dictionaries[this.lang] || {};
    return active[key] || this.dictionaries.fa[key] || key;
  }
}
