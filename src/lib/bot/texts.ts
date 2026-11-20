/**
 * Bot copy.
 *
 * Deliberately not wired into next-intl: those message files carry ~40
 * namespaces of website UI, and the bot needs a few dozen strings in its own
 * languages (RU/UK — the diaspora this channel exists for — and EN, spec 04
 * §English bot locale; the site keeps all four locales). Keeping them here
 * means bot copy can change without touching the site's translation surface.
 *
 * House style, from the RU marketing notes: "комуналка" in Cyrillic, and the
 * hidden-cost pain is доплаты по воде/свету, not a lump komunalka. English:
 * plain words, "you", "utilities" for media / komunalka, and the website's
 * labels ("tenant reports", "asking prices from listings", "known part of the
 * costs"); never "market", "verified", "checked" or "actually".
 */

/**
 * The locales a chat is answered in (`TelegramChat.locale`), and the ones this
 * file holds texts for: every key has a value in each (`texts.test.ts`). The
 * deposit helper speaks only RU and UK (`depositLocale`, D63).
 */
export type BotLocale = 'ru' | 'uk' | 'en';

/**
 * Telegram client languages (`language_code` prefixes) answered in a locale
 * other than the default RU (spec 04 §English bot locale). **Assumption** (D68):
 * Polish clients get English, as there is no Polish bot locale (D50).
 * `normalizeLocale` reads it for a new chat, and `COMMAND_MENUS` publishes each
 * entry's menu, so the bot's language and its menu agree.
 */
const CLIENT_LANGUAGE_LOCALES = [
  ['uk', 'uk'],
  ['en', 'en'],
  ['pl', 'en'],
] as const;

/** `uk…` → uk; `en…` and `pl…` → en; anything else, or no language code, → ru. */
export function normalizeLocale(languageCode: string | undefined): BotLocale {
  const code = languageCode?.toLowerCase() ?? '';
  return CLIENT_LANGUAGE_LOCALES.find(([prefix]) => code.startsWith(prefix))?.[1] ?? 'ru';
}

/** Language names in their own words, for the /lang and deposit-gate buttons. */
export const LANGUAGE_NAMES: Record<BotLocale, string> = {
  ru: 'Русский',
  uk: 'Українська',
  en: 'English',
};

/**
 * The forms of a counted word per locale: Slavic one / few / many ("1 отчёт",
 * "2 отчёта", "5 отчётов"; RU and UK share the rule), English one / other.
 */
type PluralForms = {
  ru: readonly [one: string, few: string, many: string];
  uk: readonly [one: string, few: string, many: string];
  en: readonly [one: string, other: string];
};

/** The form of `forms` that agrees with `count` in `locale`. */
export function plural<L extends BotLocale>(
  locale: L,
  count: number,
  forms: PluralForms[L],
): string {
  if (locale === 'en') {
    const [one, other] = forms as PluralForms['en'];
    return count === 1 ? one : other;
  }
  const [one, few, many] = forms as PluralForms['ru'];
  const mod100 = Math.abs(count) % 100;
  const mod10 = mod100 % 10;
  if (mod100 >= 11 && mod100 <= 14) return many;
  if (mod10 === 1) return one;
  if (mod10 >= 2 && mod10 <= 4) return few;
  return many;
}

/** "по 2 отчётам" / "за 2 звітами" / "of 2 reports". */
const REPORT_FORMS: PluralForms = {
  ru: ['отчёту', 'отчётам', 'отчётам'],
  uk: ['звітом', 'звітами', 'звітами'],
  en: ['report', 'reports'],
};

/** "по 2 объявлениям" / "за 2 оголошеннями" / "of 2 listings": the N of asking prices. */
const LISTING_FORMS: PluralForms = {
  ru: ['объявлению', 'объявлениям', 'объявлениям'],
  uk: ['оголошенням', 'оголошеннями', 'оголошеннями'],
  en: ['listing', 'listings'],
};

/** "(2 наблюдения, 100 м)" / "(2 observations, 100 m)": a neighbour's own N. */
const OBSERVATION_FORMS: PluralForms = {
  ru: ['наблюдение', 'наблюдения', 'наблюдений'],
  uk: ['спостереження', 'спостереження', 'спостережень'],
  en: ['observation', 'observations'],
};

/**
 * "2 из 3 ответивших", "1 из 21 ответившего"; the UK relative clause and the
 * English "who answered" do not agree.
 */
const ANSWERED_FORMS: PluralForms = {
  ru: ['ответившего', 'ответивших', 'ответивших'],
  uk: ['тих, хто відповів', 'тих, хто відповів', 'тих, хто відповів'],
  en: ['who answered', 'who answered'],
};

export function reportsWord(locale: BotLocale, count: number): string {
  return plural(locale, count, REPORT_FORMS[locale]);
}

export function listingsWord(locale: BotLocale, count: number): string {
  return plural(locale, count, LISTING_FORMS[locale]);
}

export function observationsWord(locale: BotLocale, count: number): string {
  return plural(locale, count, OBSERVATION_FORMS[locale]);
}

export function answeredWord(locale: BotLocale, count: number): string {
  return plural(locale, count, ANSWERED_FORMS[locale]);
}

const PEOPLE_FORMS: PluralForms = {
  ru: ['человек', 'человека', 'человек'],
  uk: ['людина', 'людини', 'людей'],
  en: ['person', 'people'],
};

export function peopleWord(locale: BotLocale, count: number): string {
  return plural(locale, count, PEOPLE_FORMS[locale]);
}

type Vars = Record<string, string>;

/**
 * What the bot really does, one list shared by `start`, `startAfterPayload` and
 * `help` so they never drift apart (spec 04 §Promises and capabilities). The
 * command menu (`COMMAND_MENU`) names the same commands. No notifications: the
 * bot sends nothing on its own except the deposit follow-ups a user asked for.
 *
 * The `/mate` line is the `{mate}` variable, `capabilityMateOff` or
 * `capabilityMateOn` by the matching switch at reply time (spec 06 §Capability
 * text and command menu); `capabilityText` fills it. No line promises a date.
 */
const CAPABILITIES_RU =
  '<b>Что я умею</b>\n' +
  '• Пришли адрес — расходы по дому, а если по нему данных нет, то по его району\n' +
  '• Напиши район (<code>Воля</code>, <code>Mokotów</code>) — расходы по району\n' +
  '• /mate — {mate}\n' +
  '• /districts — расходы по всем районам Варшавы\n' +
  '• /deposit — как часто возвращают залог и как вернуть свой\n' +
  '• /my — сохранённые интересы: дома, районы, города\n' +
  '• /lang — русский / українська / English\n' +
  '• /cancel — выйти из вопросов: о залоге или для анкеты';

const CAPABILITIES_UK =
  '<b>Що я вмію</b>\n' +
  '• Надішли адресу — витрати по будинку, а якщо по ньому даних немає, то по його району\n' +
  '• Напиши район (<code>Воля</code>, <code>Mokotów</code>) — витрати по району\n' +
  '• /mate — {mate}\n' +
  '• /districts — витрати по всіх районах Варшави\n' +
  '• /deposit — як часто повертають заставу і як повернути свою\n' +
  '• /my — збережені інтереси: будинки, райони, міста\n' +
  '• /lang — русский / українська / English\n' +
  '• /cancel — вийти з питань: про заставу або для анкети';

/** The /lang line names each language in its own words, as the RU and UK lists do. */
const CAPABILITIES_EN =
  '<b>What I can do</b>\n' +
  '• Send an address — costs for the building, or for its district if the building has no data\n' +
  '• Type a district (<code>Wola</code>, <code>Mokotów</code>) — costs for the district\n' +
  '• /mate — {mate}\n' +
  '• /districts — costs in every Warsaw district\n' +
  '• /deposit — how often deposits come back and how to get yours back\n' +
  '• /my — saved interests: buildings, districts, cities\n' +
  '• /lang — English / русский / українська\n' +
  '• /cancel — leave the questions: about your deposit or for your profile';

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

  /** The `/mate` capability with the matching switch off (stage 1) and on (stage 2). */
  capabilityMateOff:
    'найти, с кем снять квартиру: заполни анкету и посмотри, сколько людей ищут в каждом районе; подбор откроется позже',
  capabilityMateOn:
    'найти, с кем снять квартиру: люди, которые тебе подходят, и обмен контактами только при взаимном интересе',

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
  /** The group of a single number (D23): a `/districts` row or a neighbour. */
  figureSourceTenant: 'отчёты жильцов',
  figureSourceAsking: 'цены из объявлений',
  neighbourLine: '• {address}, {source}{metric}: {value} <i>({count} {word}, {distance} м)</i>',
  /** One group of an area in one line (`areaGroupLines`, the roommate room cost reference). */
  areaGroupLine: '   {source}{metric}: <b>{value}</b>{n}',
  areaLineTotal: ', всего в месяц',
  oneObservationN: ' <i>(одно наблюдение)</i>',

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
  districtTableHeader: '📊 <b>Районы Варшавы: расходы в месяц</b>',
  districtRow: '• <b>{name}</b>, {source}{metric}: {value} <i>({count})</i>{expenses}',
  districtTableFooter:
    '<i>По каждому району — отчёты жильцов, а если их нет — цены из объявлений; в скобках — число наблюдений. Это не рейтинг: цифры из разных источников и по малому числу наблюдений напрямую не сравниваются.</i>\nПришли свой адрес — покажу дом и район.',
  ofWhichExpenses: 'из них расходы {expenses}',
  noDistrictData: 'Данных по районам пока мало. Пришли адрес — посмотрим, что есть.',
  districtRank: '🏷 {position}-е место из {total} по цене <i>(1 — самый дешёвый)</i>',
  districtAskAddress: '👉 Пришли адрес в этом районе — покажу конкретный дом и соседей.',
  districtThin: 'По району <b>{district}</b> отчётов пока мало, чтобы считать медиану.',
  districtThinPrompt: '👉 Живёшь здесь? Твой отчёт станет одним из первых по этому району.',

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

  langPrompt: 'Выбери язык / Обери мову / Choose a language',
  langSet: 'Готово. Пиши адрес.',

  // --- /cancel and the deposit entry: in every bot locale, unlike deposit-texts.ts (D63) ---
  cancelled: 'Ок, отменил. Если понадобится — напиши «залог».',
  remindersOff: 'Напоминания отключены.',
  nothingToCancel: 'Сейчас нечего отменять 🙂',
  btnStartFlow: '😤 Мне не возвращают залог',
  /** Sent only to an English chat (spec 04 §English bot locale); RU and UK fill the dictionary. */
  depositGate:
    'Помощник с залогом пока говорит по-русски и по-украински. Выбери язык, и он начнёт; дальше бот будет отвечать на этом языке (сменить — /lang).',
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

  capabilityMateOff:
    'знайти, з ким зняти квартиру: заповни анкету й подивись, скільки людей шукають у кожному районі; підбір відкриється пізніше',
  capabilityMateOn:
    'знайти, з ким зняти квартиру: люди, які тобі підходять, і обмін контактами лише за взаємного інтересу',

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
  figureSourceTenant: 'звіти мешканців',
  figureSourceAsking: 'ціни з оголошень',
  neighbourLine: '• {address}, {source}{metric}: {value} <i>({count} {word}, {distance} м)</i>',
  areaGroupLine: '   {source}{metric}: <b>{value}</b>{n}',
  areaLineTotal: ', разом на місяць',
  oneObservationN: ' <i>(одне спостереження)</i>',

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

  districtTableHeader: '📊 <b>Райони Варшави: витрати на місяць</b>',
  districtRow: '• <b>{name}</b>, {source}{metric}: {value} <i>({count})</i>{expenses}',
  districtTableFooter:
    '<i>Для кожного району — звіти мешканців, а якщо їх немає — ціни з оголошень; у дужках — кількість спостережень. Це не рейтинг: цифри з різних джерел і за малою кількістю спостережень напряму не порівнюються.</i>\nНадішли свою адресу — покажу будинок і район.',
  ofWhichExpenses: 'з них витрати {expenses}',
  noDistrictData: 'Даних по районах поки мало. Надішли адресу — подивимось, що є.',
  districtRank: '🏷 {position}-е місце з {total} за ціною <i>(1 — найдешевший)</i>',
  districtAskAddress: '👉 Надішли адресу в цьому районі — покажу конкретний будинок і сусідів.',
  districtThin: 'По району <b>{district}</b> звітів поки замало, щоб рахувати медіану.',
  districtThinPrompt: '👉 Живеш тут? Твій звіт стане одним із перших по цьому району.',

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

  langPrompt: 'Выбери язык / Обери мову / Choose a language',
  langSet: 'Готово. Пиши адресу.',

  cancelled: 'Ок, скасував. Якщо знадобиться — напиши «застава».',
  remindersOff: 'Нагадування вимкнено.',
  nothingToCancel: 'Зараз нема чого скасовувати 🙂',
  btnStartFlow: '😤 Мені не повертають заставу',
  depositGate:
    'Помічник із заставою поки говорить російською та українською. Обери мову, і він почне; далі бот відповідатиме цією мовою (змінити — /lang).',
};

/**
 * English (spec 04 §English bot locale), an agent draft for the owner's review.
 * Labels follow the website's English building page; the deposit helper itself
 * stays RU and UK (D63), which `help` says.
 */
const EN: Record<Key, string> = {
  cityName: 'Warsaw',

  start:
    '👋 This is Passflat — rental costs in Warsaw, as tenants reported them.\n\n' +
    'We collect what listings leave out: what tenants pay each month, with utilities and extra ' +
    'charges included, and whether they get their deposit back.\n\n' +
    CAPABILITIES_EN +
    '\n\n<b>Send an address</b> and I’ll show the figures for the building or its district.\n' +
    'For example: <code>Grójecka 45</code>, or just a district: <code>Mokotów</code>',
  startAfterPayload:
    '👋 This is Passflat — rental costs in Warsaw, as tenants reported them.\n\n' +
    CAPABILITIES_EN +
    '\n\n<b>Send an address</b>, for example <code>Grójecka 45</code>.',

  help:
    CAPABILITIES_EN +
    '\n\nNot getting your deposit back? Type “deposit”: the deposit helper goes through the law ' +
    'and drafts a letter to the landlord (in Russian or Ukrainian for now).\n\n' +
    'The figures come from tenant reports and from asking prices in listings; each one says how ' +
    'many observations it is based on. You can add your own report in 3 minutes.',

  capabilityMateOff:
    'find someone to rent a flat with: fill in a profile and see how many people are looking in each district; matching opens later',
  capabilityMateOn:
    'find someone to rent a flat with: people who fit you, and contacts are swapped only when the interest is mutual',

  groupTenant: '👥 <b>Tenant reports: {count}</b>{imported}',
  groupTenantImported: ' <i>(of which entered by Passflat: {count})</i>',
  groupAsking: '📰 <b>Asking prices from listings: {count}</b>',
  oneObservation: '<i>One observation at this address</i>',
  oneObservationArea: '<i>One observation</i>',
  characteristicApartment: 'Whole flat',
  characteristicRoom: 'Room',
  characteristicRooms: 'rooms: {count}',
  characteristicArea: 'area ≈ {area} m²',
  headlineTotal: '💸 All-in a month: <b>{value}</b>{n}',
  headlineKnownPart: '💸 Known part of the costs: <b>{value}</b>{n}',
  headlineRent: '💸 Rent: <b>{value}</b>{n}',
  medianN: ' <i>(median of {count} {word})</i>',
  singleN: ' <i>(from {count} {word})</i>',
  detailKnownPart: '   Known part of the costs: {value}{n}',
  detailRent: '   Rent: {value}{n}',
  detailExpenses: '   Expenses: {value}{n}',
  knownPartHint: '   <i>Not all utilities were listed, so the full monthly cost may be higher.</i>',
  referenceHeaderDistrict:
    '📊 <b>For reference</b> — figures for the district, not for this building:',
  referenceHeaderCity: '📊 <b>For reference</b> — figures for the city, not for this building:',
  referenceDistrictName: '{name} district',
  referenceTenant: '   {area}, tenant reports{metric}: <b>{value}</b> ({count})',
  referenceAsking: '   {area}, asking prices from listings{metric}: <b>{value}</b> ({count})',
  referenceKnownPart: ', known part of the costs',
  referenceRent: ', rent',
  figureSourceTenant: 'tenant reports',
  figureSourceAsking: 'asking prices from listings',
  neighbourLine: '• {address}, {source}{metric}: {value} <i>({count} {word}, {distance} m)</i>',
  areaGroupLine: '   {source}{metric}: <b>{value}</b>{n}',
  areaLineTotal: ', all-in a month',
  oneObservationN: ' <i>(one observation)</i>',

  areaHeader: '📊 <b>{area}</b> — figures for the district:',
  cityHeader: '📊 <b>{area}</b> — figures for the city:',
  areaBand: '   Typical range: {band}',
  neighboursHeader: '🏘 <b>Nearby buildings with data:</b>',
  noBuildingData: 'No reports for this building yet.',
  noHouseNumber: 'Without a building number there are no exact figures to find.',
  noAreaData: 'No reports for this building, its district or the city yet.',
  thinDistrict:
    'Too few reports for <b>{district}</b> to work out a median, so here is Warsaw as a whole.',
  beFirstPrompt:
    '👉 <b>Do you live here?</b> Add a report: you’ll be the first for this building, and your neighbours will see the figures.',
  depositLine: 'Got the deposit back, fully or partly: {gotBack} of {answered} {word} ({area})',
  cardFooter: '<i>Passflat — rental costs in Warsaw, as tenants reported them</i>',

  addressNotFound:
    '🤔 Couldn’t find that address in Warsaw.\n\nTry <code>street + number</code>, for example <code>Grójecka 45</code> or <code>Marszałkowska 10</code>.',
  outsideCity: 'For now I only know Warsaw. Other cities come later.',
  outsideCityNamed:
    'For now I only know Warsaw, not {city} yet.\n\nTap the button and I’ll note that you’re waiting for this city. The more people wait for it, the sooner it comes.',
  btnCityWait: '📌 Waiting for {city}',
  cityWaitAdded:
    '✅ Noted that you’re waiting for <b>{city}</b>. There are no automatic launch messages yet.\n\nWaiting for this city so far: {count} {people}.',
  cityWaitAlready:
    'Already noted that you’re waiting for <b>{city}</b>. There are no automatic launch messages yet.\n\nWaiting for this city: {count} {people}.',
  waitlistSuffix: 'waiting for launch',
  tooManyRequests: 'Too many requests in a row. Wait a minute.',
  genericError: 'Something went wrong. Try again in a minute.',
  buildingLinkFailed: '🤔 Couldn’t open this building from the link. Send its address.',
  intakeStillOpen: 'ℹ️ The deposit questions are still open. To leave them, send /cancel.',

  districtTableHeader: '📊 <b>Warsaw districts: costs a month</b>',
  districtRow: '• <b>{name}</b>, {source}{metric}: {value} <i>({count})</i>{expenses}',
  districtTableFooter:
    '<i>For each district: tenant reports, or asking prices from listings where there are none; in brackets, the number of observations. This is not a ranking: figures from different sources or from few observations can’t be compared directly.</i>\nSend your address and I’ll show the building and the district.',
  ofWhichExpenses: 'of which expenses {expenses}',
  noDistrictData: 'Not much district data yet. Send an address and let’s see what there is.',
  districtRank: '🏷 No. {position} of {total} by price <i>(1 = the cheapest)</i>',
  districtAskAddress:
    '👉 Send an address in this district and I’ll show that building and its neighbours.',
  districtThin: 'Too few reports for <b>{district}</b> to work out a median yet.',
  districtThinPrompt:
    '👉 Do you live here? Your report will be one of the first for this district.',

  depositHeader: '🔐 <b>Deposits in Warsaw</b>',
  depositNoData: 'Not much deposit data yet, but every report adds a figure.',
  depositAdvice:
    'What decides the return: a handover protocol with photos at move-in (protokół zdawczo-odbiorczy). Without it, a deposit dispute is one word against another.',

  subscribeBuilding: '📌 Save interest in this building',
  subscribeDistrict: '📌 Save interest in {district}',
  subscribedBuilding:
    '✅ Saved your interest in <b>{name}</b>. There are no automatic notifications about new data yet.\n\nAll saved interests: /my.',
  subscribedDistrict:
    '✅ Saved your interest in the <b>{name}</b> district. There are no automatic notifications about new data yet.\n\nAll saved interests: /my.',
  alreadySubscribed: 'This interest is already saved. /my shows the whole list.',
  unsubscribed: 'Removed from your saved interests.',
  mySubsHeader: '📌 <b>Saved interests:</b>',
  mySubsEmpty:
    'No saved interests yet.\n\nSend an address or a district and tap “Save interest”: it will appear in this list. There are no automatic notifications yet.',
  unsubscribeButton: 'Remove',

  btnSubmit: '📝 Add a report',
  btnBeFirst: '📝 Be the first for this building',
  btnOpenSite: '🌐 Open on the website',
  btnDistricts: '📊 Districts',
  btnShare: '📤 Forward to neighbours',
  shareHint:
    'Forward this message to your building or district chat: the more data there is, the more precise the figures get.',

  langPrompt: 'Choose a language / Выбери язык / Обери мову',
  langSet: 'Done. Send an address.',

  cancelled: 'OK, cancelled. If you need it again, type “deposit”.',
  remindersOff: 'Reminders are off.',
  nothingToCancel: 'Nothing to cancel right now 🙂',
  btnStartFlow: '😤 I’m not getting my deposit back',
  depositGate:
    'The deposit helper speaks Russian and Ukrainian for now. Pick a language and it starts; the bot then answers you in that language (/lang changes it).',
};

const DICTS: Record<BotLocale, Record<Key, string>> = { ru: RU, uk: UK, en: EN };

/** Every text key, so tests can check all copy (for example for removed promises). */
export const TEXT_KEYS = Object.keys(RU) as TextKey[];

type MenuCommand = { command: string; description: string };

/**
 * The Telegram command menu, published by `scripts/tg-webhook.ts` through
 * `COMMAND_MENUS`. Same commands as the capability list in `start` and `help`.
 * `/mate` reads the same in both switch states; `/cancel` leaves the deposit
 * questions and the roommate questions.
 */
export const COMMAND_MENU: Record<BotLocale, readonly MenuCommand[]> = {
  ru: [
    { command: 'mate', description: 'Найти, с кем снять квартиру' },
    { command: 'districts', description: 'Районы Варшавы по расходам' },
    { command: 'deposit', description: 'Залог: как часто возвращают и как вернуть свой' },
    { command: 'my', description: 'Сохранённые интересы' },
    { command: 'lang', description: 'Язык / Мова' },
    { command: 'cancel', description: 'Выйти из вопросов' },
    { command: 'help', description: 'Что умеет бот' },
  ],
  uk: [
    { command: 'mate', description: 'Знайти, з ким зняти квартиру' },
    { command: 'districts', description: 'Райони Варшави за витратами' },
    { command: 'deposit', description: 'Застава: як часто повертають і як повернути свою' },
    { command: 'my', description: 'Збережені інтереси' },
    { command: 'lang', description: 'Язык / Мова' },
    { command: 'cancel', description: 'Вийти з питань' },
    { command: 'help', description: 'Що вміє бот' },
  ],
  en: [
    { command: 'mate', description: 'Find someone to rent a flat with' },
    { command: 'districts', description: 'Warsaw districts by costs' },
    { command: 'deposit', description: 'Deposit: how often it comes back and how to get yours' },
    { command: 'my', description: 'Saved interests' },
    { command: 'lang', description: 'Language / Язык / Мова' },
    { command: 'cancel', description: 'Leave the questions' },
    { command: 'help', description: 'What the bot can do' },
  ],
};

/**
 * The menus `scripts/tg-webhook.ts` publishes, one `setMyCommands` call each:
 * RU as the default (no `languageCode`), then each client language of
 * `CLIENT_LANGUAGE_LOCALES` with its locale's menu (UK for `uk`, EN for `en`
 * and `pl`). It takes effect only when the owner runs `npm run bot:webhook`.
 */
export const COMMAND_MENUS: readonly {
  languageCode?: (typeof CLIENT_LANGUAGE_LOCALES)[number][0];
  commands: readonly MenuCommand[];
}[] = [
  { commands: COMMAND_MENU.ru },
  ...CLIENT_LANGUAGE_LOCALES.map(([languageCode, locale]) => ({
    languageCode,
    commands: COMMAND_MENU[locale],
  })),
];

/** A text with `{name}` placeholders filled; no fallback to another locale (every key has each). */
export function t(locale: BotLocale, key: Key, vars?: Vars): string {
  const template = DICTS[locale][key];
  if (!vars) return template;
  return template.replace(/\{(\w+)\}/g, (match, name: string) => vars[name] ?? match);
}

/** The replies that carry the capability list. */
export type CapabilityTextKey = 'start' | 'startAfterPayload' | 'help';

/**
 * A reply with the capability list, its `/mate` line worded by the matching
 * switch. The caller passes `isMatchingEnabled()` read at reply time, so the
 * greeting, `/help` and the roommate flow agree on the state.
 */
export function capabilityText(
  locale: BotLocale,
  key: CapabilityTextKey,
  matchingEnabled: boolean,
): string {
  const mate = t(locale, matchingEnabled ? 'capabilityMateOn' : 'capabilityMateOff');
  return t(locale, key, { mate });
}
