const FALLBACK_FA = {
  app_name: 'Chart Intelligence',
  app_subtitle: 'سامانه هوشمند تحلیل نمودارهای مالی · فاز ۱',
  nav_watchlist: 'واچ‌لیست',
  nav_chart_view: 'نمودار',
  nav_prediction: 'پیش‌بینی',
  nav_settings: 'تنظیمات',
  login_setup_title: 'تعریف حساب شخصی مالک (ورود اول)',
  login_setup_subtitle: 'نام کاربری و رمز عبور شخصی خود را برای محافظت از محیط تحلیلی تعریف و ثبت کنید.',
  login_signin_title: 'ورود به حساب شخصی',
  login_signin_subtitle: 'برای دسترسی به واچ‌لیست و تب‌های نمودار، نام کاربری و رمز عبور خود را وارد کنید.',
  label_username: 'نام کاربری',
  label_password: 'رمز عبور',
  label_confirm_password: 'تکرار رمز عبور',
  login_remember_me: 'ذخیره رمز عبور و ورود خودکار در این مرورگر',
  action_create_owner_account: 'ثبت حساب شخصی و ورود به برنامه',
  action_sign_in: 'ورود به برنامه',
  action_sign_out: 'خروج از حساب',
  action_forgot_password: 'رمز عبور خود را فراموش کرده‌اید؟ (بازیابی با ایمیل)',
  sync_server_badge: 'متصل به سرور مشترک وب و اندروید',
};

const FALLBACK_EN = {
  app_name: 'Chart Intelligence',
  app_subtitle: 'Multi-Horizon Financial Chart Analysis · Phase 1',
  nav_watchlist: 'Watchlist',
  nav_chart_view: 'Chart',
  nav_prediction: 'Prediction',
  nav_settings: 'Settings',
  login_setup_title: 'Create Personal Owner Account (First Run)',
  login_setup_subtitle: 'Define your personal username and password to secure your workspace.',
  login_signin_title: 'Sign In to Personal Account',
  login_signin_subtitle: 'Enter your owner credentials to access your watchlist and chart tabs.',
  label_username: 'Username',
  label_password: 'Password',
  label_confirm_password: 'Confirm Password',
  login_remember_me: 'Save password & keep me signed in',
  action_create_owner_account: 'Create Owner Account & Enter',
  action_sign_in: 'Sign In',
  action_sign_out: 'Sign Out',
  action_forgot_password: 'Forgot your password? (Recover via Email)',
  sync_server_badge: 'Synced across Web & Android',
};

export class I18nManager {
  constructor() {
    this.lang = localStorage.getItem('ci_lang') || 'fa';
    this.dictionaries = {
      fa: { ...FALLBACK_FA },
      en: { ...FALLBACK_EN },
    };
  }

  async init() {
    this.applyDocumentDirection();
    try {
      const fetchWithTimeout = (url) =>
        Promise.race([
          fetch(url + '?v=1.28.8').then((r) => (r.ok ? r.json() : {})),
          new Promise((resolve) => setTimeout(() => resolve({}), 3000)),
        ]);
      const [faRes, enRes] = await Promise.all([
        fetchWithTimeout('./i18n/fa.json').catch(() => ({})),
        fetchWithTimeout('./i18n/en.json').catch(() => ({})),
      ]);
      this.dictionaries.fa = { ...FALLBACK_FA, ...(faRes || {}) };
      this.dictionaries.en = { ...FALLBACK_EN, ...(enRes || {}) };
    } catch {
      // Keep fallback dictionaries if network fails
    }
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
    return active[key] || this.dictionaries.fa[key] || this.dictionaries.en[key] || key;
  }
}
