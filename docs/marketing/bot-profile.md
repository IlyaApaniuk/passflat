# Bot profile texts (BotFather)

**Draft for the owner.** Agent drafts (PRD 3 FR-41, spec 05 §Posting kit). You set them in
BotFather after the deploy; nobody else owns them, and no code or check sets them.

- **Description** (`/setdescription`): shown in an empty chat before the person presses Start.
  At most 512 characters.
- **About** (`/setabouttext`): shown on the bot's profile page and with a shared link to the bot.
  At most 120 characters.
- **Languages.** BotFather sets one default text. The bot answers a client language it does not
  know in Russian (`normalizeLocale` in `src/lib/bot/texts.ts`), so RU fits as the default. The
  UK and EN texts can be set per client language through the Bot API (`setMyDescription` and
  `setMyShortDescription` with `language_code` `uk`, `en`, and `pl`, which the bot answers in
  English, D68). That is an owner action; the code does not call these methods.
- Each text names what the bot does now: costs by address and district, the deposit helper and
  roommate matching. None promises a match, a date or a result, names a figure or says
  "verified". The roommate line holds with the matching switch off and on, so the texts need no
  change on the day of the switch. The deposit helper speaks Russian and Ukrainian only (D63), and
  the EN text says so.
- `src/lib/bot/roommate-posting-kit.test.ts` checks the character limits.

## Description

RU

```text
Passflat — расходы на аренду в Варшаве, о которых сообщили жильцы.

• Пришли адрес или район — покажу расходы: отдельно по отчётам жильцов и по ценам в объявлениях, у каждой цифры указано число наблюдений.
• /mate — ищешь, с кем снять квартиру? Заполни анкету и посмотри, сколько людей ищут в каждом районе. Контакты — только при взаимном интересе.
• /deposit — не возвращают залог? Помогу подготовить письмо хозяину.

Бесплатно. Бот говорит по-русски, по-украински и по-английски.
```

UK

```text
Passflat — витрати на оренду у Варшаві, про які повідомили мешканці.

• Надішли адресу або район — покажу витрати: окремо за звітами мешканців і за цінами в оголошеннях, біля кожної цифри — кількість спостережень.
• /mate — шукаєш, з ким зняти квартиру? Заповни анкету й подивись, скільки людей шукають у кожному районі. Контакти — лише за взаємного інтересу.
• /deposit — не повертають заставу? Допоможу підготувати лист власникові.

Безкоштовно. Бот говорить українською, російською та англійською.
```

EN

```text
Passflat: rental costs in Warsaw, as tenants reported them.

• Send an address or a district: costs from tenant reports and from listing prices, apart, each with its number of observations.
• /mate: looking for someone to rent with? Fill in a profile and see how many people look in each district. Contacts only on mutual interest.
• /deposit: deposit not coming back? I help you prepare a letter to the landlord, in Russian or Ukrainian for now.

Free. The bot speaks English, Russian and Ukrainian.
```

## About

RU

```text
Расходы на аренду в Варшаве по отчётам жильцов и объявлениям, помощь с залогом, поиск, с кем снять квартиру.
```

UK

```text
Витрати на оренду у Варшаві за звітами мешканців і оголошеннями, допомога із заставою, пошук, з ким зняти житло.
```

EN

```text
Warsaw rental costs from tenant reports and listings, deposit help, and finding someone to rent with.
```
