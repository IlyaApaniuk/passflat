/**
 * Bot copy.
 *
 * Deliberately not wired into next-intl: those message files carry ~40
 * namespaces of website UI, and the bot needs a couple of dozen strings in two
 * languages (RU/UK — the diaspora this channel exists for; the site keeps all
 * four locales). Keeping them here means bot copy can change without touching
 * the site's translation surface.
 *
 * House style, from the RU marketing notes: "комуналка" in Cyrillic, and the
 * hidden-cost pain is доплаты по воде/свету, not a lump komunalka.
 */

export type BotLocale = 'ru' | 'uk';

export function normalizeLocale(languageCode: string | undefined): BotLocale {
  return languageCode?.toLowerCase().startsWith('uk') ? 'uk' : 'ru';
}

/**
 * Slavic plural agreement: "1 отчёт", "2 отчёта", "5 отчётов". Both locales
 * share the same rule, so one helper covers them.
 */
export function plural(count: number, forms: [string, string, string]): string {
  const mod100 = Math.abs(count) % 100;
  const mod10 = mod100 % 10;
  if (mod100 >= 11 && mod100 <= 14) return forms[2];
  if (mod10 === 1) return forms[0];
  if (mod10 >= 2 && mod10 <= 4) return forms[1];
  return forms[2];
}

/** "по 2 отчётам" / "за 2 звітами". */
const REPORT_FORMS: Record<BotLocale, [string, string, string]> = {
  ru: ['отчёту', 'отчётам', 'отчётам'],
  uk: ['звітом', 'звітами', 'звітами'],
};

/** "по 2 объявлениям" / "за 2 оголошеннями": the N of asking prices. */
const LISTING_FORMS: Record<BotLocale, [string, string, string]> = {
  ru: ['объявлению', 'объявлениям', 'объявлениям'],
  uk: ['оголошенням', 'оголошеннями', 'оголошеннями'],
};

/** "(2 наблюдения, 100 м)": a neighbour's own N. */
const OBSERVATION_FORMS: Record<BotLocale, [string, string, string]> = {
  ru: ['наблюдение', 'наблюдения', 'наблюдений'],
  uk: ['спостереження', 'спостереження', 'спостережень'],
};

/** "2 из 3 ответивших", "1 из 21 ответившего"; the UK relative clause does not agree. */
const ANSWERED_FORMS: Record<BotLocale, [string, string, string]> = {
  ru: ['ответившего', 'ответивших', 'ответивших'],
  uk: ['тих, хто відповів', 'тих, хто відповів', 'тих, хто відповів'],
};

export function reportsWord(locale: BotLocale, count: number): string {
  return plural(count, REPORT_FORMS[locale]);
}

export function listingsWord(locale: BotLocale, count: number): string {
  return plural(count, LISTING_FORMS[locale]);
}

export function observationsWord(locale: BotLocale, count: number): string {
  return plural(count, OBSERVATION_FORMS[locale]);
}

export function answeredWord(locale: BotLocale, count: number): string {
  return plural(count, ANSWERED_FORMS[locale]);
}

const PEOPLE_FORMS: Record<BotLocale, [string, string, string]> = {
  ru: ['человек', 'человека', 'человек'],
  uk: ['людина', 'людини', 'людей'],
};

export function peopleWord(locale: BotLocale, count: number): string {
  return plural(count, PEOPLE_FORMS[locale]);
}

type Vars = Record<string, string>;

/**
 * What the bot really does, one list shared by `start`, `startAfterPayload` and
 * `help` so they never drift apart (spec 04 §Promises and capabilities). The
 * command menu (`COMMAND_MENU`) names the same commands. No notifications: the
 * bot sends nothing on its own except the deposit follow-ups a user asked for.
 */
const CAPABILITIES_RU =
  '<b>Что я умею</b>\n' +
  '• Пришли адрес — расходы по дому, а если по нему данных нет, то по его району\n' +
  '• Напиши район (<code>Воля</code>, <code>Mokotów</code>) — медиана и место в рейтинге\n' +
  '• /districts — все районы Варшавы по расходам, от дешёвых к дорогим\n' +
  '• /deposit — как часто возвращают залог и как вернуть свой\n' +
  '• /my — сохранённые интересы: дома, районы, города\n' +
  '• /lang — русский / українська\n' +
  '• /cancel — выйти из вопросов о залоге';

const CAPABILITIES_UK =
  '<b>Що я вмію</b>\n' +
  '• Надішли адресу — витрати по будинку, а якщо по ньому даних немає, то по його району\n' +
  '• Напиши район (<code>Воля</code>, <code>Mokotów</code>) — медіана і місце в рейтингу\n' +
  '• /districts — усі райони Варшави за витратами, від дешевих до дорогих\n' +
  '• /deposit — як часто повертають заставу і як повернути свою\n' +
  '• /my — збережені інтереси: будинки, райони, міста\n' +
  '• /lang — русский / українська\n' +
  '• /cancel — вийти з питань про заставу';

const RU = {
  cityName: 'Варшава',

  start:
    '👋 Это Passflat — расходы на аренду в Варшаве, о которых сообщили жильцы.\n\n' +
    'Мы собираем то, чего нет в объявлениях: сколько жильцы <b>на самом деле</b> платят каждый месяц ' +
    'вместе с комуналкой и доплатами, и возвращают ли им залог.\n\n' +
    CAPABILITIES_RU +
    '\n\n<b>Пришли адрес</b> — покажу цифры по дому или по району.\n' +
    'Например: <code>Grójecka 45</code> или просто район: <code>Мокотов</code>',
  startAfterPayload:
    '👋 Это Passflat — расходы на аренду в Варшаве, о которых сообщили жильцы.\n\n' +
    CAPABILITIES_RU +
    '\n\n<b>Пришли адрес</b>, например <code>Grójecka 45</code>.',

  help:
    CAPABILITIES_RU +
    '\n\nНе возвращают залог? Напиши «залог» — разберу по закону и составлю письмо хозяину.\n\n' +
    'Цифры — из отчётов жильцов и из цен в объявлениях; у каждой указано, по скольким ' +
    'наблюдениям она посчитана. Свой отчёт можно оставить за 3 минуты.',

  // --- address answers: one block per group, each figure with its own N ---
  groupTenant: '👥 <b>Отчёты жильцов: {count}</b>{imported}',
  groupTenantImported: ' <i>(из них внесено Passflat: {count})</i>',
  groupAsking: '📰 <b>Цены из объявлений: {count}</b>',
  oneObservation: '<i>Одно наблюдение по этому адресу</i>',
  oneObservationArea: '<i>Одно наблюдение</i>',
  characteristicApartment: 'Вся квартира',
  characteristicRoom: 'Комната',
  characteristicRooms: 'комнат: {count}',
  characteristicArea: 'площадь ≈ {area} м²',
  headlineTotal: '💸 Всего в месяц: <b>{value}</b>{n}',
  headlineKnownPart: '💸 Известная часть расходов: <b>{value}</b>{n}',
  headlineRent: '💸 Аренда: <b>{value}</b>{n}',
  medianN: ' <i>(медиана по {count} {word})</i>',
  singleN: ' <i>(по {count} {word})</i>',
  detailKnownPart: '   Известная часть расходов: {value}{n}',
  detailRent: '   Аренда: {value}{n}',
  detailExpenses: '   Расходы: {value}{n}',
  knownPartHint:
    '   <i>Указаны не все коммунальные платежи — полная сумма в месяц может быть выше.</i>',
  referenceHeaderDistrict: '📊 <b>Для ориентира</b> — данные по району, а не по этому дому:',
  referenceHeaderCity: '📊 <b>Для ориентира</b> — данные по городу, а не по этому дому:',
  referenceDistrictName: 'Район {name}',
  referenceTenant: '   {area}, отчёты жильцов{metric}: <b>{value}</b> ({count})',
  referenceAsking: '   {area}, цены из объявлений{metric}: <b>{value}</b> ({count})',
  referenceKnownPart: ', известная часть расходов',
  referenceRent: ', аренда',
  neighbourLine: '• {address} — {value} <i>({count} {word}, {distance} м)</i>',

  // --- area answers: an address without its own data, and a typed district (renderDistrict) ---
  areaHeader: '📊 <b>{area}</b> — данные по району:',
  cityHeader: '📊 <b>{area}</b> — данные по городу:',
  areaBand: '   Обычный диапазон: {band}',
  neighboursHeader: '🏘 <b>Соседние дома с данными:</b>',
  noBuildingData: 'По этому дому отчётов пока нет.',
  noHouseNumber: 'Без номера дома точных данных не найти.',
  noAreaData: 'По этому дому, району и городу отчётов пока нет.',
  thinDistrict:
    'По району <b>{district}</b> отчётов пока мало, чтобы считать медиану — показываю Варшаву целиком.',
  beFirstPrompt:
    '👉 <b>Живёшь здесь?</b> Оставь отчёт — станешь первым по этому дому, и соседи увидят реальные цифры.',
  /** Ended tenancies only; the area is nominative: a Polish district name or the city. */
  depositLine: 'Вернули залог полностью или частично: {gotBack} из {answered} {word} ({area})',
  cardFooter: '<i>Passflat — расходы на аренду в Варшаве, о которых сообщили жильцы</i>',

  addressNotFound:
    '🤔 Не нашёл такой адрес в Варшаве.\n\nПопробуй в формате <code>улица + номер</code>, например <code>Grójecka 45</code> или <code>Marszałkowska 10</code>.',
  outsideCity: 'Пока я знаю только Варшаву. Другие города — позже.',
  outsideCityNamed:
    'Пока я знаю только Варшаву, {city} — ещё нет.\n\nНажми кнопку — запишу, что ты ждёшь этот город. Чем больше людей ждёт, тем раньше он появится.',
  btnCityWait: '📌 Жду {city}',
  cityWaitAdded:
    '✅ Записал, что ты ждёшь <b>{city}</b>. Автоматических сообщений о запуске пока нет.\n\nЭтот город уже ждут: {count} {people}.',
  cityWaitAlready:
    'Уже записал, что ты ждёшь <b>{city}</b>. Автоматических сообщений о запуске пока нет.\n\nЭтот город ждут: {count} {people}.',
  waitlistSuffix: 'ждём запуска',
  tooManyRequests: 'Слишком много запросов подряд. Подожди минуту.',
  genericError: 'Что-то пошло не так. Попробуй ещё раз через минуту.',
  /** `/start b_<id>` that opens no building (unknown, deleted, another city, malformed). */
  buildingLinkFailed: '🤔 Не получилось открыть этот дом по ссылке — пришли его адрес.',
  /** Added to a `/start b_<id>` reply while the deposit questions wait for an answer. */
  intakeStillOpen: 'ℹ️ Вопросы о залоге пока открыты — чтобы выйти из них, отправь /cancel.',

  // --- districts ---
  districtTableHeader: '📊 <b>Районы Варшавы: сколько реально уходит в месяц</b>',
  districtTableFooter:
    '<i>Медиана = аренда + комуналка + доплаты, по отчётам жильцов.</i>\nПришли свой адрес — сравню с домом.',
  ofWhichExpenses: 'из них расходы {expenses}',
  noDistrictData: 'Данных по районам пока мало. Пришли адрес — посмотрим, что есть.',
  districtRank: '🏷 {position}-е место из {total} по цене <i>(1 — самый дешёвый)</i>',
  districtAskAddress: '👉 Пришли адрес в этом районе — покажу конкретный дом и соседей.',
  districtThin: 'По району <b>{district}</b> отчётов пока мало, чтобы считать медиану.',
  districtThinPrompt:
    '👉 Живёшь здесь? Твой отчёт станет одним из первых — и район появится в рейтинге.',

  // --- deposit ---
  depositHeader: '🔐 <b>Залог в Варшаве</b>',
  depositNoData: 'Данных по залогам пока мало — но они появятся: каждый отчёт добавляет цифру.',
  depositAdvice:
    'Что решает возврат: протокол приёма-передачи с фото при заезде. Без него спор о залоге — слово против слова.',

  // --- saved interests (TelegramSubscription rows; nothing is sent from them) ---
  subscribeBuilding: '📌 Сохранить интерес к дому',
  subscribeDistrict: '📌 Сохранить интерес к району {district}',
  subscribedBuilding:
    '✅ Сохранил интерес к дому <b>{name}</b>. Автоматических уведомлений о новых данных пока нет.\n\nВсе сохранённые интересы — /my.',
  subscribedDistrict:
    '✅ Сохранил интерес к району <b>{name}</b>. Автоматических уведомлений о новых данных пока нет.\n\nВсе сохранённые интересы — /my.',
  alreadySubscribed: 'Этот интерес уже сохранён. /my — весь список.',
  unsubscribed: 'Убрал из сохранённых.',
  mySubsHeader: '📌 <b>Сохранённые интересы:</b>',
  mySubsEmpty:
    'Сохранённых интересов пока нет.\n\nПришли адрес или район и нажми «Сохранить интерес» — он появится в этом списке. Автоматических уведомлений пока нет.',
  unsubscribeButton: 'Отписаться',

  // --- buttons ---
  btnSubmit: '📝 Оставить отчёт',
  btnBeFirst: '📝 Стать первым по дому',
  btnOpenSite: '🌐 Открыть на сайте',
  btnDistricts: '📊 Районы',
  btnShare: '📤 Переслать соседям',
  shareHint:
    'Перешли это сообщение в чат дома или района — так данных станет больше, и цифры станут точнее.',

  langPrompt: 'Выбери язык / Обери мову',
  langSet: 'Готово. Пиши адрес.',
} as const;

export type TextKey = keyof typeof RU;
type Key = TextKey;

const UK: Record<Key, string> = {
  cityName: 'Варшава',

  start:
    '👋 Це Passflat — витрати на оренду у Варшаві, про які повідомили мешканці.\n\n' +
    'Ми збираємо те, чого немає в оголошеннях: скільки мешканці <b>насправді</b> платять щомісяця ' +
    'разом із комуналкою та доплатами, і чи повертають їм заставу.\n\n' +
    CAPABILITIES_UK +
    '\n\n<b>Надішли адресу</b> — покажу цифри по будинку або по району.\n' +
    'Наприклад: <code>Grójecka 45</code> або просто район: <code>Мокотув</code>',
  startAfterPayload:
    '👋 Це Passflat — витрати на оренду у Варшаві, про які повідомили мешканці.\n\n' +
    CAPABILITIES_UK +
    '\n\n<b>Надішли адресу</b>, наприклад <code>Grójecka 45</code>.',

  help:
    CAPABILITIES_UK +
    '\n\nНе повертають заставу? Напиши «застава» — розберу за законом і складу лист власнику.\n\n' +
    'Цифри — зі звітів мешканців і з цін в оголошеннях; для кожної вказано, за скількома ' +
    'спостереженнями її пораховано. Свій звіт можна залишити за 3 хвилини.',

  groupTenant: '👥 <b>Звіти мешканців: {count}</b>{imported}',
  groupTenantImported: ' <i>(з них внесено Passflat: {count})</i>',
  groupAsking: '📰 <b>Ціни з оголошень: {count}</b>',
  oneObservation: '<i>Одне спостереження за цією адресою</i>',
  oneObservationArea: '<i>Одне спостереження</i>',
  characteristicApartment: 'Вся квартира',
  characteristicRoom: 'Кімната',
  characteristicRooms: 'кімнат: {count}',
  characteristicArea: 'площа ≈ {area} м²',
  headlineTotal: '💸 Разом на місяць: <b>{value}</b>{n}',
  headlineKnownPart: '💸 Відома частина витрат: <b>{value}</b>{n}',
  headlineRent: '💸 Оренда: <b>{value}</b>{n}',
  medianN: ' <i>(медіана за {count} {word})</i>',
  singleN: ' <i>(за {count} {word})</i>',
  detailKnownPart: '   Відома частина витрат: {value}{n}',
  detailRent: '   Оренда: {value}{n}',
  detailExpenses: '   Витрати: {value}{n}',
  knownPartHint:
    '   <i>Вказано не всі комунальні платежі — повна сума на місяць може бути вищою.</i>',
  referenceHeaderDistrict: '📊 <b>Для орієнтиру</b> — дані по району, а не по цьому будинку:',
  referenceHeaderCity: '📊 <b>Для орієнтиру</b> — дані по місту, а не по цьому будинку:',
  referenceDistrictName: 'Район {name}',
  referenceTenant: '   {area}, звіти мешканців{metric}: <b>{value}</b> ({count})',
  referenceAsking: '   {area}, ціни з оголошень{metric}: <b>{value}</b> ({count})',
  referenceKnownPart: ', відома частина витрат',
  referenceRent: ', оренда',
  neighbourLine: '• {address} — {value} <i>({count} {word}, {distance} м)</i>',

  areaHeader: '📊 <b>{area}</b> — дані по району:',
  cityHeader: '📊 <b>{area}</b> — дані по місту:',
  areaBand: '   Звичайний діапазон: {band}',
  neighboursHeader: '🏘 <b>Сусідні будинки з даними:</b>',
  noBuildingData: 'По цьому будинку звітів поки немає.',
  noHouseNumber: 'Без номера будинку точних даних не знайти.',
  noAreaData: 'По цьому будинку, району й місту звітів поки немає.',
  thinDistrict:
    'По району <b>{district}</b> звітів поки замало, щоб рахувати медіану — показую Варшаву цілком.',
  beFirstPrompt:
    '👉 <b>Живеш тут?</b> Залиш звіт — станеш першим по цьому будинку, і сусіди побачать реальні цифри.',
  depositLine: 'Повернули заставу повністю або частково: {gotBack} з {answered} {word} ({area})',
  cardFooter: '<i>Passflat — витрати на оренду у Варшаві, про які повідомили мешканці</i>',

  addressNotFound:
    '🤔 Не знайшов такої адреси у Варшаві.\n\nСпробуй у форматі <code>вулиця + номер</code>, наприклад <code>Grójecka 45</code>.',
  outsideCity: 'Поки я знаю лише Варшаву. Інші міста — згодом.',
  outsideCityNamed:
    'Поки я знаю лише Варшаву, {city} — ще ні.\n\nНатисни кнопку — запишу, що ти чекаєш на це місто. Що більше людей чекає, то раніше воно з’явиться.',
  btnCityWait: '📌 Чекаю {city}',
  cityWaitAdded:
    '✅ Записав, що ти чекаєш на <b>{city}</b>. Автоматичних повідомлень про запуск поки немає.\n\nЦе місто вже чекають: {count} {people}.',
  cityWaitAlready:
    'Уже записав, що ти чекаєш на <b>{city}</b>. Автоматичних повідомлень про запуск поки немає.\n\nЦе місто чекають: {count} {people}.',
  waitlistSuffix: 'чекаємо запуску',
  tooManyRequests: 'Забагато запитів поспіль. Зачекай хвилину.',
  genericError: 'Щось пішло не так. Спробуй ще раз за хвилину.',
  buildingLinkFailed: '🤔 Не вдалося відкрити цей будинок за посиланням — надішли його адресу.',
  intakeStillOpen: 'ℹ️ Питання про заставу поки відкриті — щоб вийти з них, надішли /cancel.',

  districtTableHeader: '📊 <b>Райони Варшави: скільки реально йде на місяць</b>',
  districtTableFooter:
    '<i>Медіана = оренда + комуналка + доплати, за звітами мешканців.</i>\nНадішли свою адресу — порівняю з будинком.',
  ofWhichExpenses: 'з них витрати {expenses}',
  noDistrictData: 'Даних по районах поки мало. Надішли адресу — подивимось, що є.',
  districtRank: '🏷 {position}-е місце з {total} за ціною <i>(1 — найдешевший)</i>',
  districtAskAddress: '👉 Надішли адресу в цьому районі — покажу конкретний будинок і сусідів.',
  districtThin: 'По району <b>{district}</b> звітів поки замало, щоб рахувати медіану.',
  districtThinPrompt:
    '👉 Живеш тут? Твій звіт стане одним із перших — і район з’явиться в рейтингу.',

  depositHeader: '🔐 <b>Застава у Варшаві</b>',
  depositNoData: 'Даних по заставах поки мало — але вони з’являться: кожен звіт додає цифру.',
  depositAdvice:
    'Що вирішує повернення: протокол приймання-передавання з фото при заїзді. Без нього суперечка про заставу — слово проти слова.',

  subscribeBuilding: '📌 Зберегти інтерес до будинку',
  subscribeDistrict: '📌 Зберегти інтерес до району {district}',
  subscribedBuilding:
    '✅ Зберіг інтерес до будинку <b>{name}</b>. Автоматичних сповіщень про нові дані поки немає.\n\nУсі збережені інтереси — /my.',
  subscribedDistrict:
    '✅ Зберіг інтерес до району <b>{name}</b>. Автоматичних сповіщень про нові дані поки немає.\n\nУсі збережені інтереси — /my.',
  alreadySubscribed: 'Цей інтерес уже збережено. /my — весь список.',
  unsubscribed: 'Прибрав зі збережених.',
  mySubsHeader: '📌 <b>Збережені інтереси:</b>',
  mySubsEmpty:
    'Збережених інтересів поки немає.\n\nНадішли адресу або район і натисни «Зберегти інтерес» — він з’явиться в цьому списку. Автоматичних сповіщень поки немає.',
  unsubscribeButton: 'Відписатися',

  btnSubmit: '📝 Залишити звіт',
  btnBeFirst: '📝 Стати першим по будинку',
  btnOpenSite: '🌐 Відкрити на сайті',
  btnDistricts: '📊 Райони',
  btnShare: '📤 Переслати сусідам',
  shareHint:
    'Перешли це повідомлення в чат будинку або району — так даних стане більше, і цифри стануть точнішими.',

  langPrompt: 'Выбери язык / Обери мову',
  langSet: 'Готово. Пиши адресу.',
};

const DICTS: Record<BotLocale, Record<Key, string>> = { ru: RU, uk: UK };

/** Every text key, so tests can check all copy (for example for removed promises). */
export const TEXT_KEYS = Object.keys(RU) as TextKey[];

type MenuCommand = { command: string; description: string };

/**
 * The Telegram command menu, published by `scripts/tg-webhook.ts`: RU as the
 * default menu, UK for `language_code: 'uk'`. Same commands as the capability
 * list in `start` and `help`.
 */
export const COMMAND_MENU: Record<BotLocale, readonly MenuCommand[]> = {
  ru: [
    { command: 'districts', description: 'Районы Варшавы по расходам' },
    { command: 'deposit', description: 'Залог: как часто возвращают и как вернуть свой' },
    { command: 'my', description: 'Сохранённые интересы' },
    { command: 'lang', description: 'Язык / Мова' },
    { command: 'cancel', description: 'Выйти из вопросов о залоге' },
    { command: 'help', description: 'Что умеет бот' },
  ],
  uk: [
    { command: 'districts', description: 'Райони Варшави за витратами' },
    { command: 'deposit', description: 'Застава: як часто повертають і як повернути свою' },
    { command: 'my', description: 'Збережені інтереси' },
    { command: 'lang', description: 'Язык / Мова' },
    { command: 'cancel', description: 'Вийти з питань про заставу' },
    { command: 'help', description: 'Що вміє бот' },
  ],
};

export function t(locale: BotLocale, key: Key, vars?: Vars): string {
  const template = DICTS[locale][key] ?? DICTS.ru[key];
  if (!vars) return template;
  return template.replace(/\{(\w+)\}/g, (match, name: string) => vars[name] ?? match);
}
