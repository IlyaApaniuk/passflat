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
 * counts, opt-in button, renewal reminder with the date in place of "in 3
 * days", delete). The bot says «ты» / «ти» (D42); the one «вы» / «ви» is the
 * PRD's "if you two already swapped contacts" in `deleteConfirm`.
 *
 * Callers pass every value from data or from the person (district names, the
 * short text, the privacy URL) through `escapeHtml` first: the texts are HTML.
 * District names are the Polish `nameKey` in every locale ("Mokotów").
 *
 * Not here yet, by design: the opt-in confirmation (T084), the closing message
 * (T083) and the stage 2 texts (spec 07 tasks), each added with its task.
 */

export type RoommateLocale = 'ru' | 'uk' | 'en';

type Vars = Record<string, string>;

const RU = {
  // --- entry and routing (spec 06 §Entry and routing) ---
  btnStart: '🏠 Найти, с кем снять квартиру',
  intro:
    'Найдём, с кем снять квартиру. Ответь на несколько коротких вопросов: районы, бюджет на человека, месяц заезда, языки. Анкету никто не видит, пока не откроется подбор. Анкета живёт 30 дней, удалить её можно в любой момент. Только для 18+. Как мы храним данные: <a href="{privacyUrl}">политика конфиденциальности</a>.',
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
} as const;

type Key = keyof typeof RU;

const UK: Record<Key, string> = {
  btnStart: '🏠 Знайти, з ким зняти квартиру',
  intro:
    'Знайдемо, з ким зняти квартиру. Дай відповідь на кілька коротких запитань: райони, бюджет на людину, місяць заїзду, мови. Анкету ніхто не бачить, доки не відкриється підбір. Анкета живе 30 днів, видалити її можна будь-коли. Лише для 18+. Як ми зберігаємо дані: <a href="{privacyUrl}">політика конфіденційності</a>.',
  banned:
    'У цьому чаті не можна створити анкету для підбору сусідів. Чому і як це оскаржити — у повідомленні про рішення, яке ти отримав(-ла) раніше.',
  btnDeleteMyProfile: '🗑 Видалити мою анкету',
  depositQuestionsOpen: 'ℹ️ Питання про заставу поки відкриті — щоб вийти з них, надішли /cancel.',
  roommateQuestionsOpen: 'ℹ️ Питання для анкети поки відкриті — щоб вийти з них, надішли /cancel.',
  cancelledDraft: 'Ок, питання для анкети закрито — нічого не збережено. Почати знову: /mate.',
  cancelledEdit: 'Ок, зміну скасовано. Анкета лишилася як була.',
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
};

const EN: Record<Key, string> = {
  btnStart: '🏠 Find someone to rent with',
  intro:
    'Let\'s find someone to rent with. Answer a few short questions: districts, budget per person, move-in month, languages. Nobody sees your profile until matching opens. It lasts 30 days and you can delete it any time. 18+ only. How we keep your data: <a href="{privacyUrl}">privacy policy</a>.',
  banned:
    "This chat can't create a matching profile. Why, and how to appeal, is in the decision message you received earlier.",
  btnDeleteMyProfile: '🗑 Delete my profile',
  depositQuestionsOpen: 'ℹ️ The deposit questions are still open. To leave them, send /cancel.',
  roommateQuestionsOpen: 'ℹ️ The profile questions are still open. To leave them, send /cancel.',
  cancelledDraft:
    'OK, the profile questions are closed and nothing was saved. To start again: /mate.',
  cancelledEdit: 'OK, the change is cancelled. Your profile stays as it was.',
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
