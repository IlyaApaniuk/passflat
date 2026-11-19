import { peopleWord } from './texts';

/**
 * Bot copy for roommate matching (spec 06), in RU, UK and EN.
 *
 * Kept apart from `texts.ts` like the deposit copy: it is its own conversation,
 * and it already has English, which the rest of the bot gets only with the `en`
 * bot locale (spec 04 §English bot locale). Until that lands, `BotLocale` is
 * `'ru' | 'uk'`, so these texts carry their own locale type; T099 replaces it
 * with `BotLocale`.
 *
 * Every text is a draft for the owner's review. PRD 3 §8 drafts are used
 * verbatim where they exist (intro, gender and "live with", short text, 18+,
 * counts, opt-in button and the opt-in reply's first sentence, renewal reminder
 * with the date in place of "in 3 days", delete). The bot says «ты» / «ти»
 * (D42); the one «вы» / «ви» is the PRD's "if you two already swapped
 * contacts" in `deleteConfirm`.
 *
 * Callers pass every value from data or from the person (district names, the
 * short text, the privacy URL) through `escapeHtml` first: the texts are HTML.
 * District names are the Polish `nameKey` in every locale ("Mokotów").
 *
 * Stage 2 texts (spec 07) are added with their tasks; the cards' are here
 * (§Cards: the card, its buttons, "That's everyone", the username prompt, and
 * "matching is paused" of §Switch). The card reuses the own card's field labels.
 * "Interested" (§Interest) adds the daily limit and "already answered". The
 * reveal (§Reveal) adds the match line, the safety lines (PRD 3 §8 verbatim), the
 * reveal's username prompt and the three next steps. The daily push (§Daily push)
 * adds "<N> new people fit you"; its buttons reuse "Show" and "Stop daily messages". The
 * outcome question (§Outcome question) adds the question and its four answers.
 * A hide (§Statement of reasons, §Automatic hiding) adds the statement's parts and
 * the reporters' notice. `introMatching` is the intro with the switch on (§Switch): the PRD's sentence
 * that nobody sees the profile until matching opens is replaced by who sees what.
 */

export type RoommateLocale = 'ru' | 'uk' | 'en';

/** Roommate copy in the chat's stored bot language (`telegram_chats.locale`). */
export function roommateLocale(locale: string): RoommateLocale {
  return locale === 'uk' || locale === 'en' ? locale : 'ru';
}

type Vars = Record<string, string>;

const RU = {
  // --- entry and routing (spec 06 §Entry and routing) ---
  btnStart: '🏠 Найти, с кем снять квартиру',
  intro:
    'Найдём, с кем снять квартиру. Ответь на несколько коротких вопросов: районы, бюджет на человека, месяц заезда, языки. Анкету никто не видит, пока не откроется подбор. Анкета живёт 30 дней, удалить её можно в любой момент. Только для 18+. Как мы храним данные: <a href="{privacyUrl}">политика конфиденциальности</a>.',
  /** The intro with the switch on (spec 07 §Switch), an agent draft: who sees the profile and the username. */
  introMatching:
    'Найдём, с кем снять квартиру. Ответь на несколько коротких вопросов: районы, бюджет на человека, месяц заезда, языки. Анкету видят только подходящие тебе люди, а твой username — только при взаимном интересе. Анкета живёт 30 дней, удалить её можно в любой момент. Только для 18+. Как мы храним данные: <a href="{privacyUrl}">политика конфиденциальности</a>.',
  /** FR-14: a banned chat (or a hidden profile); points to the statement of reasons. */
  banned:
    'В этом чате нельзя создать анкету для подбора соседей. Почему и как это обжаловать — в сообщении о решении, которое ты получил(а) раньше.',
  btnDeleteMyProfile: '🗑 Удалить мою анкету',
  /** One open intake per chat: the roommate intake does not start. */
  depositQuestionsOpen: 'ℹ️ Вопросы о залоге пока открыты — чтобы выйти из них, отправь /cancel.',
  /** One open intake per chat: the deposit flow does not start, or text passed a button step. */
  roommateQuestionsOpen:
    'ℹ️ Вопросы для анкеты пока открыты — чтобы выйти из них, отправь /cancel.',
  cancelledDraft: 'Ок, вопросы для анкеты закрыты — ничего не сохранено. Начать заново: /mate.',
  cancelledEdit: 'Ок, изменение отменено. Анкета осталась как была.',
  /** `/cancel` while editing districts or languages: each tick is stored as it is tapped. */
  cancelledEditPicked: 'Ок, вопрос закрыт. Что ты уже отметил(а), сохранено в анкете.',
  /** A stale or repeated tap; the current step follows. */
  stepDone: 'Этот шаг уже пройден.',
  tapButton: 'Нажми одну из кнопок выше.',

  // --- intake steps (spec 06 §Intake steps) ---
  askDistricts:
    '<b>В каких районах ищешь жильё?</b>\nВыбери до {max} районов или «Любой район» и нажми «Готово». Название района можно и написать.',
  btnAnyDistrict: 'Любой район',
  btnDone: 'Готово',
  /** A picked district or "any" on its toggle button. */
  btnPicked: '✓ {name}',
  /** The callback toast for a 4th district. */
  districtLimit: 'Можно выбрать до {max} районов.',
  districtsEmpty: 'Выбери хотя бы один район или «Любой район».',
  tapDistrict: 'Не узнал район. Нажми на район в списке выше.',

  askBudget:
    '<b>Какой у тебя бюджет?</b>\nНа человека в месяц, всё включено: аренда, комуналка и доплаты. Нажми на вариант или напиши сумму в злотых.',
  /** Band labels; the bounds come from `BUDGET_BANDS` in `src/lib/roommate/rules.ts`. */
  bandUpTo: 'до {max} zł',
  bandRange: '{min} – {max} zł',
  bandFrom: '{min} zł и больше',
  tapBand: 'Не понял сумму. Нажми на вариант или напиши одно число, например <code>1650</code>.',

  askMonth: '<b>Когда хочешь заехать?</b>\nВыбери месяц.',
  monthPassed: 'Этот месяц уже прошёл — выбери из актуальных.',

  askLanguages:
    '<b>На каких языках тебе удобно общаться с соседями?</b>\nОтметь один или несколько и нажми «Готово».',
  langPl: 'Польский',
  langEn: 'Английский',
  langRu: 'Русский',
  langUk: 'Украинский',
  languagesEmpty: 'Отметь хотя бы один язык.',

  /** PRD 3 §8 "Gender and live with" is one paragraph; split over the two steps. */
  askGender:
    'Необязательно. Кто ты: женщина / мужчина / пропустить. Это нужно только для взаимного подбора и никому не показывается.',
  btnWoman: 'Женщина',
  btnMan: 'Мужчина',
  btnSkip: 'Пропустить',
  askPrefers:
    'С кем готов(а) жить: с кем угодно / с женщинами / с мужчинами. Это нужно только для взаимного подбора и никому не показывается.',
  btnPrefersAnyone: 'С кем угодно',
  btnPrefersWomen: 'С женщинами',
  btnPrefersMen: 'С мужчинами',

  askAbout:
    'Пара слов о себе, до 280 знаков. Без ссылок, телефонов и @ников: контакты появятся, только если интерес взаимный. Не пиши о здоровье, религии и других личных вещах.',
  aboutTooLong: 'Текст длиннее {max} знаков: сейчас {length}. Сократи и пришли ещё раз.',
  /** `found` is one of the `found*` keys below (the `AboutTextFinding` of `text-filter.ts`). */
  aboutRefused:
    'В тексте есть {found}. Контакты появятся, только если интерес взаимный, — убери это и пришли текст ещё раз.',
  foundLink: 'ссылка',
  foundEmail: 'e-mail',
  foundHandle: '@ник',
  foundPhone: 'номер телефона',
  foundIban: 'номер банковского счёта',

  askSmoking: '<b>Курение дома.</b> Необязательно.',
  smokingNo: 'Без курения',
  smokingOutside: 'Только на улице',
  smokingFine: 'Можно курить',
  askPets: '<b>Животные.</b> Необязательно.',
  petsNo: 'Без животных',
  petsHave: 'У меня есть питомец',
  petsFine: 'Не против животных',

  askAdult: 'Подтверди, что тебе 18 или больше.',
  btnAdultYes: 'Мне 18+',
  btnAdultNo: 'Мне меньше 18',
  underAge: 'Подбор соседей только для взрослых. Мы ничего не сохранили.',

  // --- own card (spec 06 §Save and the own card); shown only to its owner ---
  cardHeader: '🏠 <b>Твоя анкета</b>',
  cardDistricts: 'Районы: {districts}',
  cardAnyDistrict: 'Районы: любой',
  cardBudget: 'Бюджет на человека: {band}',
  cardMonth: 'Заезд: {month}',
  cardLanguages: 'Языки: {languages}',
  cardGender: 'Пол: {value}',
  cardGenderNone: 'не указан',
  cardPrefers: 'С кем жить: {value}',
  cardAbout: 'О себе: {about}',
  cardSmoking: 'Курение: {value}',
  cardPets: 'Животные: {value}',
  cardPrivateNote: '<i>Пол и «с кем жить» видишь только ты.</i>',
  cardHiddenUntilOpen: '<i>Пока подбор не открыт, анкету не видит никто.</i>',
  cardOptInOn: 'Сообщение, когда откроется подбор: включено',
  cardOptInOff: 'Сообщение, когда откроется подбор: выключено',
  cardPushOn: 'Ежедневное сообщение о новых подходящих людях: включено',
  cardPushOff: 'Ежедневное сообщение о новых подходящих людях: выключено',
  cardExpires: 'Анкета скроется {date}.',
  cardExpired:
    'Срок анкеты истёк {date}, сейчас её не учитывают. Продлить можно до {deleteDate}, потом анкета удалится.',
  btnEdit: '✏️ Изменить',
  btnDelete: '🗑 Удалить',
  btnCounts: '👥 Сколько людей ищут?',
  btnShowPeople: '👀 Показать людей',
  btnOptIn: 'Напиши мне, когда откроется подбор',
  btnOptOut: 'Не писать, когда откроется подбор',
  btnPushOn: 'Включить ежедневные сообщения',
  btnPushOff: 'Остановить ежедневные сообщения',
  btnRenew: '🔄 Продлить на 30 дней',

  // --- edit ---
  editPrompt: 'Что изменить?',
  editDistricts: 'Районы',
  editBudget: 'Бюджет',
  editMonth: 'Месяц заезда',
  editLanguages: 'Языки',
  editPreferences: 'Пол и с кем жить',
  editAbout: 'О себе',
  editRules: 'Курение и животные',
  btnBack: '← Назад',
  editSaved: 'Готово, анкета обновлена.',

  // --- delete (spec 06 §Delete) ---
  deleteConfirm:
    'Удалить анкету? Это сразу и навсегда. Если вы уже обменялись контактами, сообщение у другого человека останется.',
  btnDeleteConfirm: 'Да, удалить',
  btnKeep: 'Оставить',
  kept: 'Ок, анкета осталась.',
  deleted: 'Анкета удалена.',
  deleteReasonPrompt: 'Если хочешь, скажи, почему удаляешь, — это необязательно.',
  reasonFoundHere: 'Нашёлся сосед здесь',
  reasonFoundElsewhere: 'Нашёлся сосед в другом месте',
  reasonOther: 'Другое',
  reasonThanks: 'Спасибо, что ответил(а).',
  alreadyDeleted: 'Анкета уже удалена.',

  // --- renewal (spec 06 §Renewal) ---
  renewalReminder: 'Анкета скроется {date}. Продлить на 30 дней?',
  renewed: 'Анкета продлена, теперь она скроется {date}.',
  renewMonthFirst: 'Месяц заезда уже прошёл или скоро закончится — сначала выбери новый.',
  renewRefused: 'Эту анкету продлить нельзя.',

  // --- counts (spec 06 §Counts); items are joined with ", " ---
  countsLead: 'Кроме тебя, анкеты есть у: {items}.',
  countsItem: '{name} — {count}',
  /** The first item, which names the unit (PRD 3 §8 "Мокотув — 2 человека, Воля — 1"). */
  countsItemPeople: '{name} — {count} {people}',
  countsItemNobody: '{name} — пока никого',
  countsAnyItem: 'готовы к любому району — {count}',
  countsAnyItemNobody: 'готовых к любому району пока нет',
  countsTotal: 'Всего в Варшаве — {count} {people}.',
  /** A viewer who chose "any": the Warsaw total, then `countsTop`. */
  countsAnyLead: 'Кроме тебя, всего в Варшаве — {count} {people}.',
  countsTop: 'Чаще всего выбирают: {items}.',
  countsNobodyElse: 'Кроме тебя, анкет пока ни у кого нет.',
  countsOpensLater: 'Подбор откроется, когда людей станет больше.',
  countsUnavailable:
    'Посчитать, сколько людей ищут, сейчас не получилось. Анкета сохранена — попробуй позже кнопкой «Сколько людей ищут?».',

  // --- room cost reference lead-ins (spec 06 §Room cost reference); the figure lines are the bot's area-card texts ---
  roomHeader: '📊 <b>Для ориентира — комнаты</b>',
  roomAreaLead: '<b>{area}</b>:',
  roomFallback: 'В районе {district} меньше {min} отчётов по комнатам; Варшава:',
  roomFallbackMany: 'В районах {districts} меньше {min} отчётов по комнатам в каждом; Варшава:',
  roomNoFigures: 'Данных по комнатам здесь пока нет.',
  /** D61: half of the tenant all-in median of whole flats, N ≥ 2. */
  roomSplit:
    'На двоих — примерно по {value} с человека (половина медианы по целым квартирам, {area}; отчёты жильцов: {count}).',

  // --- the one-time message (spec 06 §Matching is open, FR-19); the verb agrees with the count ---
  openFitsOne: 'Подбор открыт. Сейчас тебе подходит {count} {people}.',
  openFitsMany: 'Подбор открыт. Сейчас тебе подходят {count} {people}.',
  openNobody: 'Подбор открыт. Пока тебе никто не подходит.',
  /** Backed by the daily push (spec 07 FR-27); left out when the push is off. */
  openNobodyDaily: 'Раз в день проверяю новые анкеты и напишу, когда появится подходящий человек.',
  btnShow: '👀 Показать',

  // --- the opt-in reply (spec 06 §Opt-in, FR-18): optInConfirm, then optInClosing ---
  /**
   * PRD 3 §8 verbatim, then the FR-18 edge case (the message goes to active profiles only); backed
   * by `sendMatchingOpenMessages` (roommate-daily.ts).
   */
  optInConfirm:
    'Напишу один раз, когда подбор откроется. Если анкета скроется раньше, этого сообщения не будет.',
  /** A repeat tap: put before the reply. */
  optInAlready: 'Уже включено.',

  // --- the closing route (spec 06 §Closing route, FR-20, D64) ---
  /**
   * The opt-in's closing sentence (D64, PRD 3 §8 verbatim), which the opt-in reply ends with;
   * backed by `POST /api/cron/roommate-close` (`runRoommateClose`).
   */
  optInClosing: 'Если подбор не откроется, напишу об этом и удалю анкету.',
  /** Sent by the closing route after the profile is deleted (PRD 3 §8 verbatim). */
  closingMessage:
    'Подбор так и не откроется. Твоя анкета уже удалена. Спасибо, что попробовал(а) Passflat.',

  // --- cards (spec 07 §Cards, FR-25), switch on only; the field lines are the own card's labels ---
  /** A stage 2 button tapped while the switch is off (spec 07 §Switch). */
  matchingPaused: 'Подбор сейчас на паузе.',
  /** "Show people" without a profile; the intake follows (reciprocity). */
  browseCreateFirst: 'Чтобы смотреть анкеты других, сначала создай свою.',
  browseRenew: 'Срок твоей анкеты истёк. Продли её, чтобы смотреть анкеты дальше.',
  /** The username prompt before the cards (context `browse`); its button is `btnDone`. */
  usernamePromptBrowse:
    'Чтобы смотреть анкеты, нужен username в Telegram: при взаимном интересе другой человек увидит его и сможет тебе написать. Задай его в настройках Telegram, потом нажми «Готово».',
  browseCardHeader: '👤 <b>Анкета</b>',
  browseAbout: 'О себе: {about}',
  btnInterested: '👍 Интересно',
  btnCardSkip: '⏭ Пропустить',
  /** The reveal's safety line names this button («Пожаловаться»). */
  btnReport: '🚩 Пожаловаться',
  browseNoneLeft: 'Пока это все, кто тебе подходит.',
  browseUnavailable: 'Эта анкета больше недоступна.',
  interestLimit:
    'На сегодня это лимит: не больше {limit} отметок «Интересно» за 24 часа. Попробуй позже.',
  interestAlready: 'Ответ на эту анкету уже сохранён.',

  // --- the reveal (spec 07 §Reveal, FR-26, FR-30); the safety lines are PRD 3 §8 verbatim ---
  revealMatch: 'Интерес взаимный. Напиши @{username}.',
  /** Names the Report button under the reveal (`btnReport`). */
  revealSafety:
    'Passflat никогда не просит денег. Не плати залог или «бронь» до просмотра квартиры и подписанного договора. Если человек просит деньги или документы — нажми «Пожаловаться».',
  /** The username prompt of a formed pair (context `reveal`); its button is `btnDone`. */
  usernamePromptReveal:
    'У тебя взаимный интерес. Чтобы другой человек смог тебе написать, нужен username в Telegram. Задай его в настройках Telegram, потом нажми «Готово».',
  btnNextAgreement: '📄 Соглашение соседей',
  btnNextAddress: '📍 Проверить адрес',
  btnNextCost: '💰 Расходы на аренду',
  /** The website's wording of the template (`documents.*`): a base template, a translation for reference. */
  nextStepAgreement:
    '📄 <b>Соглашение соседей</b> (umowa współlokatorska) — базовый образец, требует проверки юриста.\nИнформационный перевод на русский: <a href="{url}">PDF</a>\nПольский оригинал: <a href="{originalUrl}">PDF</a>',
  /** The bot's address prompt, as `startAfterPayload` asks for an address. */
  nextStepAddress:
    '<b>Пришли адрес</b>, например <code>Grójecka 45</code> — покажу расходы по дому или по его району.',
  nextStepCost: 'Расходы на аренду в Варшаве по домам и районам: <a href="{url}">passflat.com</a>',

  // --- the daily push (spec 07 §Daily push, FR-27): PRD 3 §8 verbatim; the EN verb agrees with N ---
  pushNewOne: 'Новых подходящих людей: {count}.',
  pushNewMany: 'Новых подходящих людей: {count}.',

  // --- the outcome question (spec 07 §Outcome question, FR-29); no PRD 3 §8 draft; the answer is
  // thanked with `reasonThanks` ---
  outcomeQuestion: 'Получилось найти, с кем снимать квартиру?',
  btnOutcomeRenting: 'Снимаем вместе',
  btnOutcomeTalking: 'Ещё общаемся',
  btnOutcomeNoFit: 'Не сложилось',
  btnOutcomeDontAsk: 'Не спрашивай',

  // --- the report (spec 07 §Report, FR-31); the receipt is the PRD 3 §8 draft with the hiding rule
  // spelled out (agent draft, D56); it names `btnReportUnder18` ---
  reportAsk: 'Что не так с этой анкетой? Выбери причину.',
  btnReportMoney: 'Просит деньги или залог',
  btnReportFake: 'Фейковая анкета',
  btnReportOffensive: 'Оскорбления',
  btnReportUnder18: 'Похоже, младше 18',
  btnReportOther: 'Другое',
  /** A stored report; backed by the hide notice to every reporter (spec 07 §Automatic hiding). */
  reportReceipt:
    'Жалоба получена. Проверка автоматическая. Эта анкета теперь скрыта от тебя. От всех она скроется, когда пожалуется ещё один человек, а по причине «Похоже, младше 18» — сразу. Когда это случится, напишу тебе.',
  /** A report on a profile already hidden: nothing is stored, so nothing more is promised. */
  reportReceiptHidden: 'Жалоба получена. Проверка автоматическая. Эта анкета уже скрыта от всех.',
  reportAlready: 'Жалоба на эту анкету уже отправлена.',

  // --- the statement of reasons to the hidden person (spec 07 §Statement of reasons, FR-33, DSA
  // Art. 17) and the notice to every reporter (§Automatic hiding, FR-32 criterion 4, DSA Art.
  // 16(5) – (6)); agent drafts, D56. `statementText` (`roommate-hide-messages.ts`) composes the
  // statement: what is restricted, the facts (counts and the reasons' button labels, never a
  // reporter), the automated decision with its ground in the terms, the redress ---
  statementRestriction:
    'Твоя анкета для подбора соседей скрыта: другие люди её больше не видят, а в этом чате нельзя создать новую анкету.',
  statementFacts: 'Жалоб на анкету: {count}. Причины: {reasons}.',
  statementGroundReports:
    'Решение принято автоматически: по правилам подбора анкету скрывают, когда на неё пожаловались два разных человека. Правила — в <a href="{termsUrl}">условиях использования</a>.',
  statementGroundUnder18:
    'Решение принято автоматически: по правилам подбора анкету скрывают сразу после жалобы «Похоже, младше 18» — подбор только для 18+. Правила — в <a href="{termsUrl}">условиях использования</a>.',
  statementRedress:
    'Обжаловать решение: ответь /appeal в этом чате или напиши на contact@passflat.com. Ещё можно подать жалобу координатору цифровых услуг — Prezes UKE (Urząd Komunikacji Elektronicznej) — или обратиться в суд.',
  hideNotice:
    'Анкета, на которую поступила твоя жалоба, теперь скрыта от всех. Решение принято автоматически.',
} as const;

type Key = keyof typeof RU;

const UK: Record<Key, string> = {
  btnStart: '🏠 Знайти, з ким зняти квартиру',
  intro:
    'Знайдемо, з ким зняти квартиру. Дай відповідь на кілька коротких запитань: райони, бюджет на людину, місяць заїзду, мови. Анкету ніхто не бачить, доки не відкриється підбір. Анкета живе 30 днів, видалити її можна будь-коли. Лише для 18+. Як ми зберігаємо дані: <a href="{privacyUrl}">політика конфіденційності</a>.',
  introMatching:
    'Знайдемо, з ким зняти квартиру. Дай відповідь на кілька коротких запитань: райони, бюджет на людину, місяць заїзду, мови. Анкету бачать лише люди, які тобі підходять, а твій username — лише за взаємного інтересу. Анкета живе 30 днів, видалити її можна будь-коли. Лише для 18+. Як ми зберігаємо дані: <a href="{privacyUrl}">політика конфіденційності</a>.',
  banned:
    'У цьому чаті не можна створити анкету для підбору сусідів. Чому і як це оскаржити — у повідомленні про рішення, яке ти отримав(-ла) раніше.',
  btnDeleteMyProfile: '🗑 Видалити мою анкету',
  depositQuestionsOpen: 'ℹ️ Питання про заставу поки відкриті — щоб вийти з них, надішли /cancel.',
  roommateQuestionsOpen: 'ℹ️ Питання для анкети поки відкриті — щоб вийти з них, надішли /cancel.',
  cancelledDraft: 'Ок, питання для анкети закрито — нічого не збережено. Почати знову: /mate.',
  cancelledEdit: 'Ок, зміну скасовано. Анкета лишилася як була.',
  cancelledEditPicked: 'Ок, питання закрито. Те, що ти вже позначив(-ла), збережено в анкеті.',
  stepDone: 'Цей крок уже пройдено.',
  tapButton: 'Натисни одну з кнопок вище.',

  askDistricts:
    '<b>У яких районах шукаєш житло?</b>\nОбери до {max} районів або «Будь-який район» і натисни «Готово». Назву району можна й написати.',
  btnAnyDistrict: 'Будь-який район',
  btnDone: 'Готово',
  btnPicked: '✓ {name}',
  districtLimit: 'Можна обрати до {max} районів.',
  districtsEmpty: 'Обери хоча б один район або «Будь-який район».',
  tapDistrict: 'Не впізнав район. Натисни на район у списку вище.',

  askBudget:
    '<b>Який у тебе бюджет?</b>\nНа людину на місяць, усе включено: оренда, комуналка й доплати. Натисни на варіант або напиши суму в злотих.',
  bandUpTo: 'до {max} zł',
  bandRange: '{min} – {max} zł',
  bandFrom: '{min} zł і більше',
  tapBand:
    'Не зрозумів суму. Натисни на варіант або напиши одне число, наприклад <code>1650</code>.',

  askMonth: '<b>Коли хочеш заїхати?</b>\nОбери місяць.',
  monthPassed: 'Цей місяць уже минув — обери з актуальних.',

  askLanguages:
    '<b>Якими мовами тобі зручно спілкуватися із сусідами?</b>\nПознач одну чи кілька й натисни «Готово».',
  langPl: 'Польська',
  langEn: 'Англійська',
  langRu: 'Російська',
  langUk: 'Українська',
  languagesEmpty: 'Познач хоча б одну мову.',

  askGender:
    'Необовʼязково. Хто ти: жінка / чоловік / пропустити. Це потрібно лише для взаємного підбору й нікому не показується.',
  btnWoman: 'Жінка',
  btnMan: 'Чоловік',
  btnSkip: 'Пропустити',
  askPrefers:
    'З ким готовий(-а) жити: з ким завгодно / з жінками / з чоловіками. Це потрібно лише для взаємного підбору й нікому не показується.',
  btnPrefersAnyone: 'З ким завгодно',
  btnPrefersWomen: 'З жінками',
  btnPrefersMen: 'З чоловіками',

  askAbout:
    'Кілька слів про себе, до 280 знаків. Без посилань, телефонів і @ніків: контакти зʼявляться, лише якщо інтерес взаємний. Не пиши про здоровʼя, релігію та інші особисті речі.',
  aboutTooLong: 'Текст довший за {max} знаків: зараз {length}. Скороти й надішли ще раз.',
  aboutRefused:
    'У тексті є {found}. Контакти зʼявляться, лише якщо інтерес взаємний, — прибери це й надішли текст ще раз.',
  foundLink: 'посилання',
  foundEmail: 'e-mail',
  foundHandle: '@нік',
  foundPhone: 'номер телефону',
  foundIban: 'номер банківського рахунку',

  askSmoking: '<b>Куріння вдома.</b> Необовʼязково.',
  smokingNo: 'Без куріння',
  smokingOutside: 'Лише надворі',
  smokingFine: 'Можна курити',
  askPets: '<b>Тварини.</b> Необовʼязково.',
  petsNo: 'Без тварин',
  petsHave: 'У мене є улюбленець',
  petsFine: 'Не проти тварин',

  askAdult: 'Підтверди, що тобі 18 або більше.',
  btnAdultYes: 'Мені 18+',
  btnAdultNo: 'Мені менше 18',
  underAge: 'Підбір сусідів лише для дорослих. Ми нічого не зберегли.',

  cardHeader: '🏠 <b>Твоя анкета</b>',
  cardDistricts: 'Райони: {districts}',
  cardAnyDistrict: 'Райони: будь-який',
  cardBudget: 'Бюджет на людину: {band}',
  cardMonth: 'Заїзд: {month}',
  cardLanguages: 'Мови: {languages}',
  cardGender: 'Стать: {value}',
  cardGenderNone: 'не вказано',
  cardPrefers: 'З ким жити: {value}',
  cardAbout: 'Про себе: {about}',
  cardSmoking: 'Куріння: {value}',
  cardPets: 'Тварини: {value}',
  cardPrivateNote: '<i>Стать і «з ким жити» бачиш лише ти.</i>',
  cardHiddenUntilOpen: '<i>Поки підбір не відкрито, анкету ніхто не бачить.</i>',
  cardOptInOn: 'Повідомлення, коли відкриється підбір: увімкнено',
  cardOptInOff: 'Повідомлення, коли відкриється підбір: вимкнено',
  cardPushOn: 'Щоденне повідомлення про нових людей, які тобі підходять: увімкнено',
  cardPushOff: 'Щоденне повідомлення про нових людей, які тобі підходять: вимкнено',
  cardExpires: 'Анкета сховається {date}.',
  cardExpired:
    'Строк анкети минув {date}, зараз її не враховують. Продовжити можна до {deleteDate}, потім анкету буде видалено.',
  btnEdit: '✏️ Змінити',
  btnDelete: '🗑 Видалити',
  btnCounts: '👥 Скільки людей шукають?',
  btnShowPeople: '👀 Показати людей',
  btnOptIn: 'Напиши мені, коли відкриється підбір',
  btnOptOut: 'Не писати, коли відкриється підбір',
  btnPushOn: 'Увімкнути щоденні повідомлення',
  btnPushOff: 'Зупинити щоденні повідомлення',
  btnRenew: '🔄 Продовжити на 30 днів',

  editPrompt: 'Що змінити?',
  editDistricts: 'Райони',
  editBudget: 'Бюджет',
  editMonth: 'Місяць заїзду',
  editLanguages: 'Мови',
  editPreferences: 'Стать і з ким жити',
  editAbout: 'Про себе',
  editRules: 'Куріння і тварини',
  btnBack: '← Назад',
  editSaved: 'Готово, анкету оновлено.',

  deleteConfirm:
    'Видалити анкету? Це одразу й назавжди. Якщо ви вже обмінялися контактами, повідомлення в іншої людини залишиться.',
  btnDeleteConfirm: 'Так, видалити',
  btnKeep: 'Залишити',
  kept: 'Ок, анкета лишилася.',
  deleted: 'Анкету видалено.',
  deleteReasonPrompt: 'Якщо хочеш, скажи, чому видаляєш, — це необовʼязково.',
  reasonFoundHere: 'Знайшовся сусід тут',
  reasonFoundElsewhere: 'Знайшовся сусід деінде',
  reasonOther: 'Інше',
  reasonThanks: 'Дякуємо за відповідь.',
  alreadyDeleted: 'Анкету вже видалено.',

  renewalReminder: 'Анкета сховається {date}. Продовжити на 30 днів?',
  renewed: 'Анкету продовжено, тепер вона сховається {date}.',
  renewMonthFirst: 'Місяць заїзду вже минув або скоро закінчиться — спершу обери новий.',
  renewRefused: 'Цю анкету не можна продовжити.',

  countsLead: 'Окрім тебе, анкети мають: {items}.',
  countsItem: '{name} — {count}',
  countsItemPeople: '{name} — {count} {people}',
  countsItemNobody: '{name} — поки нікого',
  countsAnyItem: 'готові до будь-якого району — {count}',
  countsAnyItemNobody: 'готових до будь-якого району поки немає',
  countsTotal: 'Усього у Варшаві — {count} {people}.',
  countsAnyLead: 'Окрім тебе, усього у Варшаві — {count} {people}.',
  countsTop: 'Найчастіше обирають: {items}.',
  countsNobodyElse: 'Окрім тебе, анкет поки ні в кого немає.',
  countsOpensLater: 'Підбір відкриється, коли людей стане більше.',
  countsUnavailable:
    'Порахувати, скільки людей шукають, зараз не вдалося. Анкету збережено — спробуй пізніше кнопкою «Скільки людей шукають?».',

  roomHeader: '📊 <b>Для орієнтиру — кімнати</b>',
  roomAreaLead: '<b>{area}</b>:',
  roomFallback: 'У районі {district} менше {min} звітів про кімнати; Варшава:',
  roomFallbackMany: 'У районах {districts} менше {min} звітів про кімнати в кожному; Варшава:',
  roomNoFigures: 'Даних про кімнати тут поки немає.',
  roomSplit:
    'Удвох — приблизно по {value} з людини (половина медіани за цілими квартирами, {area}; звіти мешканців: {count}).',

  openFitsOne: 'Підбір відкрито. Зараз тобі підходить {count} {people}.',
  openFitsMany: 'Підбір відкрито. Зараз тобі підходять {count} {people}.',
  openNobody: 'Підбір відкрито. Поки тобі ніхто не підходить.',
  openNobodyDaily:
    'Раз на день перевіряю нові анкети й напишу, коли зʼявиться людина, яка тобі підходить.',
  btnShow: '👀 Показати',

  optInConfirm:
    'Напишу один раз, коли підбір відкриється. Якщо анкета сховається раніше, цього повідомлення не буде.',
  optInAlready: 'Уже ввімкнено.',

  optInClosing: 'Якщо підбір не відкриється, напишу про це й видалю анкету.',
  closingMessage:
    'Підбір так і не відкриється. Твою анкету вже видалено. Дякуємо, що спробував(-ла) Passflat.',

  matchingPaused: 'Підбір зараз на паузі.',
  browseCreateFirst: 'Щоб дивитися анкети інших, спершу створи свою.',
  browseRenew: 'Строк твоєї анкети минув. Продовж її, щоб дивитися анкети далі.',
  usernamePromptBrowse:
    'Щоб дивитися анкети, потрібен username у Telegram: коли інтерес взаємний, інша людина побачить його й зможе тобі написати. Задай його в налаштуваннях Telegram, потім натисни «Готово».',
  browseCardHeader: '👤 <b>Анкета</b>',
  browseAbout: 'Про себе: {about}',
  btnInterested: '👍 Цікаво',
  btnCardSkip: '⏭ Пропустити',
  btnReport: '🚩 Поскаржитися',
  browseNoneLeft: 'Поки це всі, хто тобі підходить.',
  browseUnavailable: 'Ця анкета більше недоступна.',
  interestLimit:
    'На сьогодні це ліміт: не більше {limit} позначок «Цікаво» за 24 години. Спробуй пізніше.',
  interestAlready: 'Відповідь на цю анкету вже збережено.',

  revealMatch: 'Інтерес взаємний. Напиши @{username}.',
  revealSafety:
    'Passflat ніколи не просить грошей. Не плати заставу чи «бронь» до перегляду квартири й підписаного договору. Якщо людина просить гроші чи документи — натисни «Поскаржитися».',
  usernamePromptReveal:
    'У тебе взаємний інтерес. Щоб інша людина змогла тобі написати, потрібен username у Telegram. Задай його в налаштуваннях Telegram, потім натисни «Готово».',
  btnNextAgreement: '📄 Угода співмешканців',
  btnNextAddress: '📍 Перевірити адресу',
  btnNextCost: '💰 Витрати на оренду',
  nextStepAgreement:
    '📄 <b>Угода співмешканців</b> (umowa współlokatorska) — базовий зразок, потребує юридичної перевірки.\nІнформаційний переклад українською: <a href="{url}">PDF</a>\nПольський оригінал: <a href="{originalUrl}">PDF</a>',
  nextStepAddress:
    '<b>Надішли адресу</b>, наприклад <code>Grójecka 45</code> — покажу витрати по будинку або по його району.',
  nextStepCost:
    'Витрати на оренду у Варшаві по будинках і районах: <a href="{url}">passflat.com</a>',
  pushNewOne: 'Нових людей, які тобі підходять: {count}.',
  pushNewMany: 'Нових людей, які тобі підходять: {count}.',

  outcomeQuestion: 'Вдалося знайти, з ким винаймати квартиру?',
  btnOutcomeRenting: 'Винаймаємо разом',
  btnOutcomeTalking: 'Ще спілкуємося',
  btnOutcomeNoFit: 'Не склалося',
  btnOutcomeDontAsk: 'Не питай',

  reportAsk: 'Що не так із цією анкетою? Обери причину.',
  btnReportMoney: 'Просить гроші чи заставу',
  btnReportFake: 'Фейкова анкета',
  btnReportOffensive: 'Образи',
  btnReportUnder18: 'Схоже, молодше 18',
  btnReportOther: 'Інше',
  reportReceipt:
    'Скаргу отримано. Перевірка автоматична. Ця анкета тепер прихована від тебе. Від усіх вона сховається, коли поскаржиться ще одна людина, а з причини «Схоже, молодше 18» — одразу. Коли це станеться, напишу тобі.',
  reportReceiptHidden: 'Скаргу отримано. Перевірка автоматична. Ця анкета вже прихована від усіх.',
  reportAlready: 'Скаргу на цю анкету вже надіслано.',

  statementRestriction:
    'Твою анкету для підбору сусідів приховано: інші люди її більше не бачать, а в цьому чаті не можна створити нову анкету.',
  statementFacts: 'Скарг на анкету: {count}. Причини: {reasons}.',
  statementGroundReports:
    'Рішення ухвалено автоматично: за правилами підбору анкету приховують, коли на неї поскаржилися дві різні людини. Правила — в <a href="{termsUrl}">умовах використання</a>.',
  statementGroundUnder18:
    'Рішення ухвалено автоматично: за правилами підбору анкету приховують одразу після скарги «Схоже, молодше 18» — підбір лише для 18+. Правила — в <a href="{termsUrl}">умовах використання</a>.',
  statementRedress:
    'Оскаржити рішення: відповідай /appeal у цьому чаті або напиши на contact@passflat.com. Також можна подати скаргу координатору цифрових послуг — Prezes UKE (Urząd Komunikacji Elektronicznej) — або звернутися до суду.',
  hideNotice:
    'Анкету, на яку надійшла твоя скарга, тепер приховано від усіх. Рішення ухвалено автоматично.',
};

const EN: Record<Key, string> = {
  btnStart: '🏠 Find someone to rent with',
  intro:
    'Let\'s find someone to rent with. Answer a few short questions: districts, budget per person, move-in month, languages. Nobody sees your profile until matching opens. It lasts 30 days and you can delete it any time. 18+ only. How we keep your data: <a href="{privacyUrl}">privacy policy</a>.',
  introMatching:
    'Let\'s find someone to rent with. Answer a few short questions: districts, budget per person, move-in month, languages. Only people who fit you see your profile, and your username only when the interest is mutual. It lasts 30 days and you can delete it any time. 18+ only. How we keep your data: <a href="{privacyUrl}">privacy policy</a>.',
  banned:
    "This chat can't create a matching profile. Why, and how to appeal, is in the decision message you received earlier.",
  btnDeleteMyProfile: '🗑 Delete my profile',
  depositQuestionsOpen: 'ℹ️ The deposit questions are still open. To leave them, send /cancel.',
  roommateQuestionsOpen: 'ℹ️ The profile questions are still open. To leave them, send /cancel.',
  cancelledDraft:
    'OK, the profile questions are closed and nothing was saved. To start again: /mate.',
  cancelledEdit: 'OK, the change is cancelled. Your profile stays as it was.',
  cancelledEditPicked:
    'OK, the question is closed. What you already ticked is saved in your profile.',
  stepDone: 'This step is done.',
  tapButton: 'Tap one of the buttons above.',

  askDistricts:
    '<b>Which districts are you looking in?</b>\nPick up to {max} or “Any district”, then tap “Done”. You can also type a district name.',
  btnAnyDistrict: 'Any district',
  btnDone: 'Done',
  btnPicked: '✓ {name}',
  districtLimit: 'You can pick up to {max} districts.',
  districtsEmpty: 'Pick at least one district or “Any district”.',
  tapDistrict: "Couldn't find that district. Tap one in the list above.",

  askBudget:
    "<b>What's your budget?</b>\nPer person, all-in a month: rent, building charges and bills. Tap an option or type an amount in zł.",
  bandUpTo: 'up to {max} zł',
  bandRange: '{min} – {max} zł',
  bandFrom: '{min} zł or more',
  tapBand:
    "Couldn't read an amount. Tap an option or type one number, for example <code>1650</code>.",

  askMonth: '<b>When do you want to move in?</b>\nPick a month.',
  monthPassed: 'That month has passed. Pick one of the current months.',

  askLanguages:
    '<b>Which languages are you comfortable speaking with flatmates?</b>\nTick one or more, then tap “Done”.',
  langPl: 'Polish',
  langEn: 'English',
  langRu: 'Russian',
  langUk: 'Ukrainian',
  languagesEmpty: 'Tick at least one language.',

  askGender:
    'Optional. You are: a woman / a man / skip. Used only for mutual matching and never shown to anyone.',
  btnWoman: 'A woman',
  btnMan: 'A man',
  btnSkip: 'Skip',
  askPrefers:
    "Who you'd live with: anyone / women / men. Used only for mutual matching and never shown to anyone.",
  btnPrefersAnyone: 'Anyone',
  btnPrefersWomen: 'Women',
  btnPrefersMen: 'Men',

  askAbout:
    "A few words about you, up to 280 characters. No links, phone numbers or @handles: contacts appear only when the interest is mutual. Don't include health, religion or other personal details.",
  aboutTooLong:
    'The text is longer than {max} characters: {length} now. Shorten it and send it again.',
  aboutRefused:
    'The text has {found}. Contacts appear only when the interest is mutual, so remove it and send the text again.',
  foundLink: 'a link',
  foundEmail: 'an e-mail address',
  foundHandle: 'an @handle',
  foundPhone: 'a phone number',
  foundIban: 'a bank account number',

  askSmoking: '<b>Smoking at home.</b> Optional.',
  smokingNo: 'No smoking',
  smokingOutside: 'Outside only',
  smokingFine: 'Smoking is fine',
  askPets: '<b>Pets.</b> Optional.',
  petsNo: 'No pets',
  petsHave: 'I have a pet',
  petsFine: 'Fine with pets',

  askAdult: 'Please confirm you are 18 or older.',
  btnAdultYes: "I'm 18+",
  btnAdultNo: "I'm under 18",
  underAge: 'Matching is for adults only. We saved nothing.',

  cardHeader: '🏠 <b>Your profile</b>',
  cardDistricts: 'Districts: {districts}',
  cardAnyDistrict: 'Districts: any',
  cardBudget: 'Budget per person: {band}',
  cardMonth: 'Move-in: {month}',
  cardLanguages: 'Languages: {languages}',
  cardGender: 'Gender: {value}',
  cardGenderNone: 'not stated',
  cardPrefers: 'Live with: {value}',
  cardAbout: 'About you: {about}',
  cardSmoking: 'Smoking: {value}',
  cardPets: 'Pets: {value}',
  cardPrivateNote: "<i>Only you see your gender and who you'd live with.</i>",
  cardHiddenUntilOpen: '<i>Until matching opens, nobody sees your profile.</i>',
  cardOptInOn: 'Message when matching opens: on',
  cardOptInOff: 'Message when matching opens: off',
  cardPushOn: 'Daily message about new people who fit you: on',
  cardPushOff: 'Daily message about new people who fit you: off',
  cardExpires: 'Your profile hides on {date}.',
  cardExpired:
    'Your profile expired on {date} and is not counted now. You can renew it until {deleteDate}; after that it is deleted.',
  btnEdit: '✏️ Edit',
  btnDelete: '🗑 Delete',
  btnCounts: '👥 How many are looking?',
  btnShowPeople: '👀 Show people',
  btnOptIn: 'Message me when matching opens',
  btnOptOut: "Don't message me when matching opens",
  btnPushOn: 'Turn on daily messages',
  btnPushOff: 'Stop daily messages',
  btnRenew: '🔄 Renew for 30 days',

  editPrompt: 'What do you want to change?',
  editDistricts: 'Districts',
  editBudget: 'Budget',
  editMonth: 'Move-in month',
  editLanguages: 'Languages',
  editPreferences: 'Gender and live with',
  editAbout: 'About you',
  editRules: 'Smoking and pets',
  btnBack: '← Back',
  editSaved: 'Done, your profile is updated.',

  deleteConfirm:
    "Delete your profile? It's immediate and final. If you already swapped contacts, the other person keeps that message.",
  btnDeleteConfirm: 'Yes, delete',
  btnKeep: 'Keep',
  kept: 'OK, your profile stays.',
  deleted: 'Your profile is deleted.',
  deleteReasonPrompt: 'If you like, tell us why you deleted it. This is optional.',
  reasonFoundHere: 'Found someone here',
  reasonFoundElsewhere: 'Found someone elsewhere',
  reasonOther: 'Other',
  reasonThanks: 'Thanks for telling us.',
  alreadyDeleted: 'The profile is already deleted.',

  renewalReminder: 'Your profile hides on {date}. Renew for 30 days?',
  renewed: 'Renewed. Your profile now hides on {date}.',
  renewMonthFirst: 'Your move-in month has passed or ends soon. Pick a new month first.',
  renewRefused: "This profile can't be renewed.",

  countsLead: 'Besides you, people with a profile: {items}.',
  countsItem: '{name} {count}',
  countsItemPeople: '{name} {count}',
  countsItemNobody: '{name} (nobody yet)',
  countsAnyItem: 'open to any district {count}',
  countsAnyItemNobody: 'open to any district (nobody yet)',
  countsTotal: 'In Warsaw {count} in total.',
  countsAnyLead: 'Besides you, in Warsaw {count} in total.',
  countsTop: 'Most chosen: {items}.',
  countsNobodyElse: 'Besides you, nobody has a profile yet.',
  countsOpensLater: 'Matching opens when there are more people.',
  countsUnavailable:
    "Couldn't count who is looking right now. Your profile is saved; try again later with “How many are looking?”.",

  roomHeader: '📊 <b>For reference: rooms</b>',
  roomAreaLead: '<b>{area}</b>:',
  roomFallback: '{district} has fewer than {min} room reports; Warsaw:',
  roomFallbackMany: '{districts} have fewer than {min} room reports each; Warsaw:',
  roomNoFigures: 'No room figures for this area yet.',
  roomSplit:
    'For two people about {value} each (half of the median flat, {count} tenant reports, {area}).',

  openFitsOne: 'Matching is open. {count} person fits you right now.',
  openFitsMany: 'Matching is open. {count} people fit you right now.',
  openNobody: 'Matching is open. Nobody fits you yet.',
  openNobodyDaily: "I check new profiles once a day and I'll message you when someone new fits.",
  btnShow: '👀 Show',

  optInConfirm:
    "I'll message you once when matching opens. If your profile hides before then, this message won't come.",
  optInAlready: 'Already on.',

  optInClosing: "If matching does not open, we'll tell you and delete your profile.",
  closingMessage:
    'Matching will not open after all. Your profile is deleted now. Thanks for trying Passflat.',

  matchingPaused: 'Matching is paused right now.',
  browseCreateFirst: "To see other people's profiles, create yours first.",
  browseRenew: 'Your profile has expired. Renew it to keep browsing.',
  usernamePromptBrowse:
    'To see profiles you need a Telegram username: when the interest is mutual, the other person sees it and can write to you. Set one in Telegram Settings, then tap Done.',
  browseCardHeader: '👤 <b>Profile</b>',
  browseAbout: 'About: {about}',
  btnInterested: '👍 Interested',
  btnCardSkip: '⏭ Skip',
  btnReport: '🚩 Report',
  browseNoneLeft: "That's everyone for now.",
  browseUnavailable: 'This profile is no longer available.',
  interestLimit:
    'That\'s the limit for today: up to {limit} "Interested" taps in 24 hours. Try again later.',
  interestAlready: 'Your answer to this profile is already saved.',

  revealMatch: "It's mutual. Write to @{username}.",
  revealSafety:
    "Passflat never asks for money. Don't pay a deposit or a 'reservation' before a viewing and a signed contract. If someone asks for money or documents, tap Report.",
  usernamePromptReveal:
    'You have a mutual match. So the other person can write to you, you need a Telegram username. Set one in Telegram Settings, then tap Done.',
  btnNextAgreement: '📄 Roommate agreement',
  btnNextAddress: '📍 Check an address',
  btnNextCost: '💰 Rental costs',
  nextStepAgreement:
    '📄 <b>Roommate agreement</b> (umowa współlokatorska): a base template that requires legal review.\nInformational English translation: <a href="{url}">PDF</a>\nPolish original: <a href="{originalUrl}">PDF</a>',
  nextStepAddress:
    "<b>Send an address</b>, for example <code>Grójecka 45</code>, and I'll show the costs for the building or its district.",
  nextStepCost: 'Rental costs in Warsaw by building and district: <a href="{url}">passflat.com</a>',
  pushNewOne: '{count} new person fits you.',
  pushNewMany: '{count} new people fit you.',

  outcomeQuestion: 'Did you find someone to rent with?',
  btnOutcomeRenting: 'Renting together',
  btnOutcomeTalking: 'Still talking',
  btnOutcomeNoFit: 'Did not work out',
  btnOutcomeDontAsk: "Don't ask",

  reportAsk: "What's wrong with this profile? Pick a reason.",
  btnReportMoney: 'Asks for money or a deposit',
  btnReportFake: 'Fake profile',
  btnReportOffensive: 'Offensive',
  btnReportUnder18: 'Looks under 18',
  btnReportOther: 'Other',
  reportReceipt:
    "Report received. The check is automated. This profile is now hidden from you. It is hidden from everyone once one more person reports it, or at once for 'Looks under 18'. I'll tell you when that happens.",
  reportReceiptHidden:
    'Report received. The check is automated. This profile is already hidden from everyone.',
  reportAlready: 'You already reported this profile.',

  statementRestriction:
    'Your roommate-matching profile is hidden: other people no longer see it, and no new profile can be created in this chat.',
  statementFacts: 'Reports on the profile: {count}. Reasons: {reasons}.',
  statementGroundReports:
    'The decision was made automatically: under the matching rules a profile is hidden once two different people report it. The rules are in the <a href="{termsUrl}">terms of use</a>.',
  statementGroundUnder18:
    'The decision was made automatically: under the matching rules a profile is hidden at once after a \'Looks under 18\' report, as matching is for adults only. The rules are in the <a href="{termsUrl}">terms of use</a>.',
  statementRedress:
    'To appeal: reply /appeal in this chat or write to contact@passflat.com. You can also complain to the Digital Services Coordinator, the President of UKE (Prezes Urzędu Komunikacji Elektronicznej), or go to court.',
  hideNotice:
    'The profile you reported is now hidden from everyone. The decision was made automatically.',
};

const DICTS: Record<RoommateLocale, Record<Key, string>> = { ru: RU, uk: UK, en: EN };

/** Every roommate text key, so tests can walk all copy (values, promises, the address form). */
export const ROOMMATE_TEXT_KEYS = Object.keys(RU) as Key[];

/** A roommate text with `{name}` placeholders filled, like `t()`; no fallback to another locale. */
export function rt(locale: RoommateLocale, key: Key, vars?: Vars): string {
  const template = DICTS[locale][key];
  if (!vars) return template;
  return template.replace(/\{(\w+)\}/g, (match, name: string) => vars[name] ?? match);
}

/**
 * The `{people}` word of the counts texts: RU/UK plural agreement from
 * `texts.ts`; English templates do not use it.
 */
export function rtPeople(locale: RoommateLocale, count: number): string {
  if (locale === 'en') return count === 1 ? 'person' : 'people';
  return peopleWord(locale, count);
}
