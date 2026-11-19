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

/** "по 12 наблюдениям": a count that blends tenant reports and asking prices (Q-2). */
const OBSERVATION_BASIS_FORMS: Record<BotLocale, [string, string, string]> = {
  ru: ['наблюдению', 'наблюдениям', 'наблюдениям'],
  uk: ['спостереженням', 'спостереженнями', 'спостереженнями'],
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

export function observationsBasisWord(locale: BotLocale, count: number): string {
  return plural(count, OBSERVATION_BASIS_FORMS[locale]);
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

const RU = {
  cityName: 'Варшава',

  start:
    '👋 Это Passflat — расходы на аренду в Варшаве, о которых сообщили жильцы.\n\n' +
    'Мы собираем то, чего нет в объявлениях: сколько жильцы <b>на самом деле</b> платят каждый месяц ' +
    'вместе с комуналкой и доплатами, и возвращают ли им залог.\n\n' +
    '<b>Пришли адрес</b> — покажу цифры по дому или по району.\n' +
    'Например: <code>Grójecka 45</code> или просто район: <code>Мокотов</code>',
  startAfterPayload:
    '👋 Это Passflat — расходы на аренду в Варшаве, о которых сообщили жильцы.\n\n<b>Пришли адрес</b>, например <code>Grójecka 45</code>.',

  help:
    '<b>Что я умею</b>\n\n' +
    '• Пришли адрес — расходы по дому, а если дома нет в базе, то по его району\n' +
    '• Напиши район (<code>Воля</code>, <code>Mokotów</code>) — медиана и место в рейтинге\n' +
    '• /districts — все районы Варшавы по расходам, от дешёвых к дорогим\n' +
    '• /deposit — как часто возвращают залог и как вернуть свой\n' +
    '• Не возвращают залог? Напиши «залог» — разберу по закону и составлю письмо хозяину\n' +
    '• /my — на что ты подписан\n' +
    '• /lang — русский / українська\n\n' +
    'Данные — из отчётов жильцов. Чем больше отчётов, тем точнее цифры: ' +
    'свой можно оставить за 3 минуты.',

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

  // --- the typed-district answer (renderDistrict) ---
  splitLine: '   Аренда {rent} + расходы {expenses}',
  basedOn: '   <i>по {count} {word}</i>',
  areaTotal: '💸 Медиана: <b>{total}</b> в месяц',

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
    'Пока я знаю только Варшаву, {city} — ещё нет.\n\nНажми кнопку — напишу сюда, как только заработаем в этом городе. Чем больше людей ждёт, тем раньше он появится.',
  btnCityWait: '🔔 Жду {city}',
  cityWaitAdded:
    '✅ Записал. Напишу сюда, когда Passflat заработает в городе <b>{city}</b>.\n\nЭтот город уже ждут: {count} {people}.',
  cityWaitAlready:
    'Ты уже в списке — напишу, когда появится <b>{city}</b>.\n\nЭтот город ждут: {count} {people}.',
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
  districtThinCity:
    '📊 Для ориентира — медиана по Варшаве: <b>{total}</b> в месяц.\nВсе районы по цене: /districts',
  districtThinPrompt:
    '👉 Живёшь здесь? Твой отчёт станет одним из первых — и район появится в рейтинге.',

  // --- deposit ---
  depositHeader: '🔐 <b>Залог в Варшаве</b>',
  depositNoData: 'Данных по залогам пока мало — но они появятся: каждый отчёт добавляет цифру.',
  depositAdvice:
    'Что решает возврат: протокол приёма-передачи с фото при заезде. Без него спор о залоге — слово против слова.',

  // --- subscriptions ---
  subscribeBuilding: '🔔 Следить за домом',
  subscribeDistrict: '🔔 Следить за районом {district}',
  subscribedBuilding:
    '✅ Слежу за <b>{name}</b>. Напишу, когда появится новый отчёт по этому дому.',
  subscribedDistrict: '✅ Слежу за районом <b>{name}</b>. Напишу, когда там появятся новые данные.',
  alreadySubscribed: 'Уже слежу за этим. /my — весь список.',
  unsubscribed: 'Больше не слежу за этим.',
  mySubsHeader: '🔔 <b>Ты следишь за:</b>',
  mySubsEmpty:
    'Пока ни за чем не слежу.\n\nПришли адрес и нажми «Следить» — напишу, когда по нему появятся данные.',
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
    '<b>Надішли адресу</b> — покажу цифри по будинку або по району.\n' +
    'Наприклад: <code>Grójecka 45</code> або просто район: <code>Мокотув</code>',
  startAfterPayload:
    '👋 Це Passflat — витрати на оренду у Варшаві, про які повідомили мешканці.\n\n<b>Надішли адресу</b>, наприклад <code>Grójecka 45</code>.',

  help:
    '<b>Що я вмію</b>\n\n' +
    '• Надішли адресу — витрати по будинку, а якщо будинку немає в базі, то по його району\n' +
    '• Напиши район (<code>Воля</code>, <code>Mokotów</code>) — медіана і місце в рейтингу\n' +
    '• /districts — усі райони Варшави за витратами, від дешевих до дорогих\n' +
    '• /deposit — як часто повертають заставу і як повернути свою\n' +
    '• Не повертають заставу? Напиши «застава» — розберу за законом і складу лист власнику\n' +
    '• /my — на що ти підписаний\n' +
    '• /lang — русский / українська\n\n' +
    'Дані — зі звітів мешканців. Що більше звітів, то точніші цифри: ' +
    'свій можна залишити за 3 хвилини.',

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

  splitLine: '   Оренда {rent} + витрати {expenses}',
  basedOn: '   <i>за {count} {word}</i>',
  areaTotal: '💸 Медіана: <b>{total}</b> на місяць',

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
    'Поки я знаю лише Варшаву, {city} — ще ні.\n\nНатисни кнопку — напишу сюди, щойно запрацюємо в цьому місті. Що більше людей чекає, то раніше воно з’явиться.',
  btnCityWait: '🔔 Чекаю {city}',
  cityWaitAdded:
    '✅ Записав. Напишу сюди, коли Passflat запрацює в місті <b>{city}</b>.\n\nЦе місто вже чекають: {count} {people}.',
  cityWaitAlready:
    'Ти вже в списку — напишу, коли з’явиться <b>{city}</b>.\n\nЦе місто чекають: {count} {people}.',
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
  districtThinCity:
    '📊 Для орієнтиру — медіана по Варшаві: <b>{total}</b> на місяць.\nУсі райони за ціною: /districts',
  districtThinPrompt:
    '👉 Живеш тут? Твій звіт стане одним із перших — і район з’явиться в рейтингу.',

  depositHeader: '🔐 <b>Застава у Варшаві</b>',
  depositNoData: 'Даних по заставах поки мало — але вони з’являться: кожен звіт додає цифру.',
  depositAdvice:
    'Що вирішує повернення: протокол приймання-передавання з фото при заїзді. Без нього суперечка про заставу — слово проти слова.',

  subscribeBuilding: '🔔 Стежити за будинком',
  subscribeDistrict: '🔔 Стежити за районом {district}',
  subscribedBuilding:
    '✅ Стежу за <b>{name}</b>. Напишу, коли з’явиться новий звіт по цьому будинку.',
  subscribedDistrict: '✅ Стежу за районом <b>{name}</b>. Напишу, коли там з’являться нові дані.',
  alreadySubscribed: 'Уже стежу за цим. /my — весь список.',
  unsubscribed: 'Більше не стежу за цим.',
  mySubsHeader: '🔔 <b>Ти стежиш за:</b>',
  mySubsEmpty:
    'Поки ні за чим не стежу.\n\nНадішли адресу і натисни «Стежити» — напишу, коли по ній з’являться дані.',
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

export function t(locale: BotLocale, key: Key, vars?: Vars): string {
  const template = DICTS[locale][key] ?? DICTS.ru[key];
  if (!vars) return template;
  return template.replace(/\{(\w+)\}/g, (match, name: string) => vars[name] ?? match);
}
