/**
 * The bot's profile in Telegram (D77): the name, the description (shown in an empty chat
 * before Start) and the short description (the "About" text on the profile page and with a
 * shared link). This module is the source of truth: `npm run bot:profile`
 * (`scripts/tg-profile.ts` → `applyBotProfile` in `profile.ts`) sets these texts through the
 * Bot API. `docs/marketing/bot-profile.md` is the human-readable copy, and
 * `profile-texts.test.ts` fails when the two differ.
 *
 * Draft copy for the owner's review (D29). `default` is RU and is what Telegram shows a client
 * language without its own text, as `normalizeLocale` answers it in Russian; `pl` gets the EN
 * texts, as the bot answers Polish in English (D68); the deposit helper speaks RU and UK only
 * (D63), which the EN description says.
 */

export interface BotProfileTexts {
  name: string;
  description: string;
  shortDescription: string;
}

/** The Bot API limits, in characters (`setMyName`, `setMyDescription`, `setMyShortDescription`). */
export const BOT_PROFILE_LIMITS: Readonly<Record<keyof BotProfileTexts, number>> = {
  name: 64,
  description: 512,
  shortDescription: 120,
};

/** `default` is sent without a `language_code`; the others as their `language_code`. */
export type BotProfileLanguage = 'default' | 'uk' | 'en' | 'pl';

/** The order the script sets the languages in. */
export const BOT_PROFILE_LANGUAGES: readonly BotProfileLanguage[] = ['default', 'uk', 'en', 'pl'];

const RU: BotProfileTexts = {
  name: 'Passflat',
  description: [
    'Passflat — расходы на аренду в Варшаве, о которых сообщили жильцы.',
    '',
    '• Пришли адрес или район — покажу расходы: отдельно по отчётам жильцов и по ценам в объявлениях, у каждой цифры указано число наблюдений.',
    '• /mate — ищешь, с кем снять квартиру? Заполни анкету и посмотри, сколько людей ищут в каждом районе. Контакты — только при взаимном интересе.',
    '• /deposit — не возвращают залог? Помогу подготовить письмо хозяину.',
    '',
    'Бесплатно. Бот говорит по-русски, по-украински и по-английски.',
  ].join('\n'),
  shortDescription:
    'Расходы на аренду в Варшаве по отчётам жильцов и объявлениям, помощь с залогом, поиск, с кем снять квартиру.',
};

const UK: BotProfileTexts = {
  name: 'Passflat',
  description: [
    'Passflat — витрати на оренду у Варшаві, про які повідомили мешканці.',
    '',
    '• Надішли адресу або район — покажу витрати: окремо за звітами мешканців і за цінами в оголошеннях, біля кожної цифри — кількість спостережень.',
    '• /mate — шукаєш, з ким зняти квартиру? Заповни анкету й подивись, скільки людей шукають у кожному районі. Контакти — лише за взаємного інтересу.',
    '• /deposit — не повертають заставу? Допоможу підготувати лист власникові.',
    '',
    'Безкоштовно. Бот говорить українською, російською та англійською.',
  ].join('\n'),
  shortDescription:
    'Витрати на оренду у Варшаві за звітами мешканців і оголошеннями, допомога із заставою, пошук, з ким зняти житло.',
};

const EN: BotProfileTexts = {
  name: 'Passflat',
  description: [
    'Passflat: rental costs in Warsaw, as tenants reported them.',
    '',
    '• Send an address or a district: costs from tenant reports and from listing prices, apart, each with its number of observations.',
    '• /mate: looking for someone to rent with? Fill in a profile and see how many people look in each district. Contacts only on mutual interest.',
    '• /deposit: deposit not coming back? I help you prepare a letter to the landlord, in Russian or Ukrainian for now.',
    '',
    'Free. The bot speaks English, Russian and Ukrainian.',
  ].join('\n'),
  shortDescription:
    'Warsaw rental costs from tenant reports and listings, deposit help, and finding someone to rent with.',
};

export const BOT_PROFILE: Readonly<Record<BotProfileLanguage, BotProfileTexts>> = {
  default: RU,
  uk: UK,
  en: EN,
  pl: EN,
};

/** Every text over its Bot API limit, as "<language> <key>: <length> > <limit>". */
export function botProfileLimitBreaches(
  profile: Readonly<Record<BotProfileLanguage, BotProfileTexts>>,
): string[] {
  const breaches: string[] = [];
  for (const language of BOT_PROFILE_LANGUAGES) {
    for (const key of Object.keys(BOT_PROFILE_LIMITS) as (keyof BotProfileTexts)[]) {
      const length = profile[language][key].length;
      const limit = BOT_PROFILE_LIMITS[key];
      if (length > limit) breaches.push(`${language} ${key}: ${length} > ${limit}`);
    }
  }
  return breaches;
}
