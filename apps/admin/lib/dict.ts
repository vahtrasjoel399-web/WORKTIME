export type Lang = "et" | "ru" | "en";
export const LANGS: Lang[] = ["et", "ru", "en"];

type Dict = Record<string, Record<Lang, string>>;

// Translations for the worker-facing flow + login. Keep keys short.
export const dict: Dict = {
  tagline: { et: "Tööaja arvestus", ru: "Учёт рабочего времени", en: "Work-time tracking" },

  // login tabs
  tabSignin: { et: "Logi sisse", ru: "Войти", en: "Sign in" },
  tabWorker: { et: "Olen töötaja", ru: "Я работник", en: "I'm a worker" },
  tabCompany: { et: "Loo ettevõte", ru: "Создать компанию", en: "Create company" },

  // fields
  email: { et: "E-post", ru: "Почта", en: "Email" },
  password: { et: "Parool", ru: "Пароль", en: "Password" },
  firstName: { et: "Eesnimi", ru: "Имя", en: "First name" },
  lastName: { et: "Perekonnanimi", ru: "Фамилия", en: "Last name" },
  companyName: { et: "Ettevõtte nimi", ru: "Название компании", en: "Company name" },
  companyCode: { et: "ETTEVÕTTE KOOD", ru: "КОД КОМПАНИИ", en: "COMPANY CODE" },

  // buttons
  signin: { et: "Logi sisse", ru: "Войти", en: "Sign in" },
  createWorker: { et: "Loo töötaja konto", ru: "Создать аккаунт работника", en: "Create worker account" },
  createCompany: { et: "Loo ettevõte", ru: "Создать компанию", en: "Create company" },
  forgotPassword: { et: "Unustasid parooli?", ru: "Забыли пароль?", en: "Forgot password?" },

  // hints & errors
  autoRole: { et: "Süsteem tuvastab ise: töötaja või tööandja.", ru: "Система сама определит: работник или начальник.", en: "The system detects your role automatically." },
  codeFromEmployer: { et: "Ettevõtte koodi annab tööandja.", ru: "Код компании даёт работодатель.", en: "Your employer gives you the company code." },
  errWrongCreds: { et: "Vale e-post või parool.", ru: "Неверная почта или пароль.", en: "Wrong email or password." },
  errExists: { et: "Selle e-postiga konto on juba olemas.", ru: "Аккаунт с этой почтой уже есть.", en: "An account with this email already exists." },
  errCreate: { et: "Konto loomine ebaõnnestus.", ru: "Не удалось создать аккаунт.", en: "Could not create the account." },
  errBadCode: { et: "Sellist ettevõtte koodi pole.", ru: "Такого кода компании нет. Уточните у работодателя.", en: "That company code doesn't exist." },
  errRegister: { et: "Registreerimine ebaõnnestus.", ru: "Не удалось зарегистрироваться.", en: "Could not register." },
  errCompany: { et: "Ettevõtte loomine ebaõnnestus.", ru: "Не удалось создать компанию.", en: "Could not create the company." },
  confirmEmail: { et: "Kinnita e-post ja logi sisse.", ru: "Подтвердите почту и войдите.", en: "Confirm your email, then sign in." },
  enterEmailFirst: { et: "Sisesta esmalt e-post.", ru: "Сначала введите почту.", en: "Enter your email first." },
  resetSent: { et: "Parooli taastamise link saadeti e-postile.", ru: "Ссылка для восстановления отправлена на почту.", en: "A password reset link was sent to your email." },
  setPassword: { et: "Määra parool", ru: "Установите пароль", en: "Set your password" },
  setPasswordHint: { et: "Kasuta vähemalt 10 tähemärki.", ru: "Используйте минимум 10 символов.", en: "Use at least 10 characters." },
  newPassword: { et: "Uus parool", ru: "Новый пароль", en: "New password" },
  confirmPassword: { et: "Korda parooli", ru: "Повторите пароль", en: "Confirm password" },
  savePassword: { et: "Salvesta parool", ru: "Сохранить пароль", en: "Save password" },
  passwordTooShort: { et: "Parool peab olema vähemalt 10 tähemärki.", ru: "Пароль должен содержать минимум 10 символов.", en: "Password must contain at least 10 characters." },
  passwordMismatch: { et: "Paroolid ei ühti.", ru: "Пароли не совпадают.", en: "Passwords do not match." },
  passwordUpdateFailed: { et: "Parooli salvestamine ebaõnnestus.", ru: "Не удалось сохранить пароль.", en: "Could not save the password." },

  companyCreated: { et: "Ettevõte loodud 🎉", ru: "Компания создана 🎉", en: "Company created 🎉" },
  shareCode: { et: "Jaga seda koodi töötajatega — nad sisestavad selle registreerumisel.", ru: "Дайте этот код работникам — они введут его при регистрации.", en: "Share this code with workers — they enter it when registering." },
  openPanel: { et: "Ava töölaud →", ru: "Открыть панель →", en: "Open dashboard →" },

  // worker screen
  shiftRunning: { et: "Vahetus käib", ru: "Смена идёт", en: "Shift running" },
  onBreak: { et: "Pausil", ru: "На перерыве", en: "On break" },
  notStarted: { et: "Vahetus alustamata", ru: "Смена не начата", en: "Shift not started" },
  startShift: { et: "Alusta vahetust", ru: "Начать смену", en: "Start shift" },
  finishShift: { et: "Lõpeta vahetus", ru: "Закончить смену", en: "Finish shift" },
  pause: { et: "Paus", ru: "Перерыв", en: "Break" },
  resume: { et: "Jätka", ru: "Продолжить", en: "Resume" },
  gpsDenied: { et: "Asukoht on väljas. Luba see brauseris, et alustada.", ru: "Геолокация выключена. Включите её в браузере, чтобы начать смену.", en: "Location is off. Enable it in the browser to start." },
  monthTotal: { et: "Kokku sel kuul", ru: "Всего за месяц", en: "Total this month" },
  weekTotal: { et: "Kokku sel nädalal", ru: "Всего за неделю", en: "Total this week" },
  weekShort: { et: "N", ru: "Н", en: "W" },
  paidWeekly: { et: "Palk makstakse iga nädal", ru: "Зарплата выплачивается каждую неделю", en: "Wages are paid every week" },
  thisWeek: { et: "See nädal", ru: "Эта неделя", en: "This week" },
  hoursUnit: { et: "h", ru: "ч", en: "h" },
  tabShift: { et: "Vahetus", ru: "Смена", en: "Shift" },
  tabHours: { et: "Minu tunnid", ru: "Мои часы", en: "My hours" },
  noShifts: { et: "Vahetusi veel pole.", ru: "Смен пока нет.", en: "No shifts yet." },
  breakShort: { et: "paus", ru: "перерыв", en: "break" },
  settings: { et: "Seaded", ru: "Настройки", en: "Settings" },
  companyRate: { et: "ettevõtte tunnitasu", ru: "по ставке компании", en: "company rate" },
  personalEstimate: { et: "isiklik hinnang", ru: "личная оценка", en: "personal estimate" },
  beforeTax: { et: "enne makse, ligikaudne", ru: "до налогов, ориентировочно", en: "before tax, approximate" },

  // settings
  rateByEmployer: { et: "Tunnitasu (määras tööandja)", ru: "Ставка (задана работодателем)", en: "Rate (set by employer)" },
  yourRate: { et: "Sinu tunnitasu €/h", ru: "Ваша ставка €/ч", en: "Your rate €/h" },
  showEarnings: { et: "Näita teenistust", ru: "Показывать заработок", en: "Show earnings" },
  save: { et: "Salvesta", ru: "Сохранить", en: "Save" },
  theme: { et: "teema", ru: "тема", en: "theme" },
  signOut: { et: "Logi välja", ru: "Выйти", en: "Sign out" },

  // pending
  pendingTitle: { et: "Ootab kinnitust", ru: "Ожидает подтверждения", en: "Waiting for approval" },
  pendingBody: { et: "Tööandja peab sind vastu võtma. Siis saad vahetust alustada.", ru: "Работодатель должен принять вас в компанию. Как только примет — сможете начать смену.", en: "Your employer needs to accept you. Then you can start a shift." },
  checkAgain: { et: "Kontrolli uuesti", ru: "Проверить снова", en: "Check again" },

  // Location notice acknowledgement. The employer documents the lawful basis.
  consentTitle: { et: "Asukoht alustamisel ja lõpetamisel", ru: "Геолокация при старте и завершении", en: "Location at start and finish" },
  consentBody: { et: "Rakendus salvestab asukoha ainult kahel hetkel: vahetuse alustamisel ja lõpetamisel. Taustal ei jälgita. Punkte hoitakse 24 kuud.", ru: "Приложение фиксирует местоположение только в два момента: при начале и завершении смены. В фоне отслеживания нет. Точки хранятся 24 месяца.", en: "Location is recorded only at two moments: starting and finishing a shift. No background tracking. Points kept 24 months." },
  agree: { et: "Sain aru", ru: "Понятно", en: "I understand" },
};
