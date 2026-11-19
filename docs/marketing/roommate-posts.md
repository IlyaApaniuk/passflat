# Roommate posting kit

**Draft for the owner.** Agent drafts (PRD 3 FR-41, spec 05 §Posting kit); read and change them
before the first slot. The posting itself is yours (D46); log every slot in
[`roommate-posting-log.md`](roommate-posting-log.md).

## Rules (D53)

1. **Reply, do not broadcast.** Answer people who post that they look for a roommate or for
   someone to rent with (demand capture). Do not post the bot into a group on your own.
2. **Vary the wording.** Use a different template, or reword one, for each reply; never paste
   the same text twice in a row or into two groups in the same slot.
3. **At most 3 – 4 groups per slot.** Two 30-minute slots a day (D46).
4. **Ask the admins first.** Before the first reply in a group, ask its admins whether a link to
   the bot is allowed. Note the answer in the group-key table below. A group that bans links gets
   the version without a link.
5. **Prefer Telegram.** Telegram groups first; Facebook, Threads and Instagram after.
6. **Facebook: never the same link twice.** Identical links across Facebook groups risk a block of
   the passflat.com domain. Every group has its own key, so its bot link differs from every other
   group's; never paste a passflat.com link across Facebook groups either.

What every reply keeps, also when you reword it (spec 05 §Posting kit):

- No promise of a match, a date or a result ("you'll find someone", "matching opens on …",
  "guaranteed").
- No figure. The bot shows each figure with its group and its number of observations; a number
  copied into a post loses both. If you ever quote one, take it from the bot's reply with its
  group and count.
- Never "verified" or "checked" about profiles or people.
- No names, phone numbers or handles of the person you reply to.

## How to use a template

- Replace `<bot>` with the bot's username without the `@` (the production value of
  `NEXT_PUBLIC_TELEGRAM_BOT_USERNAME`).
- A link ends in `?start=mate_<source>_<key>`. The source is the platform: `tg`, `fb`, `ig` or
  `threads`. Replace `group` at the end of a template's link with the group's key from the table
  below, and change the source when you use the template on another platform. The bot records the source and the key as `entry_source` and `entry_detail` of
  `tg_roommate_flow_started` (spec 04 §Start payloads); a key outside the table's shape lands as
  `other` and is lost for the readout.
- **Delete the "not open yet" sentence before the first slot.** The templates were written for
  a launch with the matching switch off. Since D75 the switch is on from the deploy, so the
  sentence «Подбор пока не открыт.» / «Підбір поки що не відкрито.» / "Matching isn't open yet."
  is false from day 0: delete it from every template before your first slot (the templates keep
  it here so you see what to cut; nothing else in them changes). Keep it only if you ever set the
  switch off again.

## Templates

### 1. Short and direct · Telegram

For a short "ищу соседа" post.

RU

```text
Если ещё ищешь, с кем снять квартиру: я делаю бесплатного Telegram-бота Passflat. Там короткая анкета (районы, бюджет на человека, месяц заезда, языки), и видно, сколько людей ищут в каждом районе Варшавы. Подбор пока не открыт.
https://t.me/<bot>?start=mate_tg_group
```

UK

```text
Якщо ще шукаєш, з ким зняти квартиру: я роблю безкоштовного Telegram-бота Passflat. Там коротка анкета (райони, бюджет на людину, місяць заїзду, мови), і видно, скільки людей шукають у кожному районі Варшави. Підбір поки що не відкрито.
https://t.me/<bot>?start=mate_tg_group
```

EN

```text
If you're still looking for someone to rent with: I'm building Passflat, a free Telegram bot. You fill in a short profile (districts, budget per person, move-in month, languages) and see how many people are looking in each Warsaw district. Matching isn't open yet.
https://t.me/<bot>?start=mate_tg_group
```

### 2. Districts · Telegram

For a post that names a district.

RU

```text
Какие районы смотришь? В Telegram-боте Passflat отмечаешь свои районы и видишь, сколько людей с анкетой ищут в каждом из них, без имён и контактов. Удалить анкету можно в любой момент. Подбор пока не открыт.
https://t.me/<bot>?start=mate_tg_group
```

UK

```text
Які райони дивишся? У Telegram-боті Passflat позначаєш свої райони й бачиш, скільки людей з анкетою шукають у кожному з них, без імен і контактів. Видалити анкету можна будь-коли. Підбір поки що не відкрито.
https://t.me/<bot>?start=mate_tg_group
```

EN

```text
Which districts are you looking at? In the Passflat Telegram bot you pick your districts and see how many people with a profile are looking in each one, without names or contacts. You can delete your profile any time. Matching isn't open yet.
https://t.me/<bot>?start=mate_tg_group
```

### 3. Money per person · Telegram

For a post that names a budget or asks what a room costs. It names no figure on purpose.

RU

```text
Если планируешь снимать вдвоём, деньги лучше прикинуть заранее. В Telegram-боте Passflat после короткой анкеты видно, сколько в твоих районах стоят комнаты: отдельно по отчётам жильцов и по объявлениям, у каждой цифры указано, по скольким наблюдениям она посчитана. Где отчётов о квартирах хватает, бот показывает и сколько выходит каждому из двоих.
https://t.me/<bot>?start=mate_tg_group
```

UK

```text
Якщо плануєш знімати вдвох, гроші краще прикинути заздалегідь. У Telegram-боті Passflat після короткої анкети видно, скільки у твоїх районах коштують кімнати: окремо за звітами мешканців і за оголошеннями, біля кожної цифри вказано, за скількома спостереженнями її пораховано. Де звітів про квартири досить, бот показує й скільки виходить кожному з двох.
https://t.me/<bot>?start=mate_tg_group
```

EN

```text
If you plan to rent as two, it helps to work out the money first. After a short profile, the Passflat Telegram bot shows what rooms cost in your districts: tenant reports and listing prices apart, each figure with the number of observations behind it. Where there are enough flat reports, it also shows roughly what each of two people would pay.
https://t.me/<bot>?start=mate_tg_group
```

### 4. Privacy · Telegram

For someone who posted a phone number or worries about writing to strangers.

RU

```text
Если не хочется светить номер в общем чате: в боте Passflat анкета без телефонов и ссылок, а контакты появятся, только если интерес взаимный. Анкета живёт 30 дней, удалить её можно сразу. Только 18+. Подбор пока не открыт.
https://t.me/<bot>?start=mate_tg_group
```

UK

```text
Якщо не хочеться світити номер у спільному чаті: у боті Passflat анкета без телефонів і посилань, а контакти зʼявляться, лише якщо інтерес взаємний. Анкета живе 30 днів, видалити її можна одразу. Лише 18+. Підбір поки що не відкрито.
https://t.me/<bot>?start=mate_tg_group
```

EN

```text
If you'd rather not post your number in a group chat: a Passflat bot profile has no phone numbers or links, and contacts appear only when the interest is mutual. A profile lasts 30 days and you can delete it straight away. 18+ only. Matching isn't open yet.
https://t.me/<bot>?start=mate_tg_group
```

### 5. A longer comment · Facebook

For a Facebook group post; a comment there can be a little longer.

RU

```text
Привет! Если ещё не нашёл(ла), с кем снимать: я делаю Passflat, бесплатный Telegram-бот для тех, кто ищет, с кем снять жильё в Варшаве. Отвечаешь на несколько вопросов (районы, бюджет на человека вместе с комуналкой и доплатами, месяц заезда, языки) и видишь, сколько людей ищут в тех же районах. Подбор пока не открыт.
https://t.me/<bot>?start=mate_fb_group
```

UK

```text
Привіт! Якщо ще не знайшов(ла), з ким знімати: я роблю Passflat, безкоштовний Telegram-бот для тих, хто шукає, з ким зняти житло у Варшаві. Відповідаєш на кілька запитань (райони, бюджет на людину разом із комуналкою й доплатами, місяць заїзду, мови) і бачиш, скільки людей шукають у тих самих районах. Підбір поки що не відкрито.
https://t.me/<bot>?start=mate_fb_group
```

EN

```text
Hi! If you haven't found someone yet: I'm building Passflat, a free Telegram bot for people looking for someone to rent with in Warsaw. You answer a few questions (districts, budget per person including building charges and bills, move-in month, languages) and see how many people are looking in the same districts. Matching isn't open yet.
https://t.me/<bot>?start=mate_fb_group
```

### 6. One line · Threads

For a reply under a Threads post; the shortest version.

RU

```text
Я делаю бота для тех, кто ищет, с кем снять квартиру в Варшаве: анкета на пару минут, видно, сколько людей ищут в каждом районе, контакты только при взаимном интересе. Подбор пока не открыт.
https://t.me/<bot>?start=mate_threads_group
```

UK

```text
Я роблю бота для тих, хто шукає, з ким зняти квартиру у Варшаві: анкета на кілька хвилин, видно, скільки людей шукають у кожному районі, контакти лише за взаємного інтересу. Підбір поки що не відкрито.
https://t.me/<bot>?start=mate_threads_group
```

EN

```text
I'm building a bot for people looking for someone to rent with in Warsaw: a profile takes a couple of minutes, you see how many people are looking in each district, and contacts are shared only on mutual interest. Matching isn't open yet.
https://t.me/<bot>?start=mate_threads_group
```

### 7. Languages · Telegram

For a post that names a language, or in an English-speaking group.

RU

```text
Если важно, на каком языке говорить с соседом: в анкете бота Passflat отмечаешь удобные языки (польский, английский, русский, украинский). Сам бот отвечает по-русски, по-украински и по-английски. Подбор пока не открыт.
https://t.me/<bot>?start=mate_tg_group
```

UK

```text
Якщо важливо, якою мовою говорити із сусідом: в анкеті бота Passflat позначаєш зручні мови (польську, англійську, російську, українську). Сам бот відповідає українською, російською та англійською. Підбір поки що не відкрито.
https://t.me/<bot>?start=mate_tg_group
```

EN

```text
If the language you share a flat in matters: in the Passflat bot profile you tick the languages you're comfortable with (Polish, English, Russian or Ukrainian). The bot itself speaks English, Russian and Ukrainian. Matching isn't open yet.
https://t.me/<bot>?start=mate_tg_group
```

## Without a link

For a group whose admins ban links. It names the bot by username, so a person who follows it
arrives through `/mate` and is counted as `bot_menu` (or `direct`), not under the group's key:
log the reply with the link tag `no-link`.

RU

```text
Ссылки здесь нельзя, поэтому так: в Telegram найди бота @<bot> и отправь ему /mate. Это бесплатная анкета для тех, кто ищет, с кем снять квартиру в Варшаве: районы, бюджет на человека, месяц заезда, языки. Подбор пока не открыт.
```

UK

```text
Посилання тут не можна, тож так: у Telegram знайди бота @<bot> і надішли йому /mate. Це безкоштовна анкета для тих, хто шукає, з ким зняти квартиру у Варшаві: райони, бюджет на людину, місяць заїзду, мови. Підбір поки що не відкрито.
```

EN

```text
Links aren't allowed here, so: search for @<bot> in Telegram and send it /mate. It's a free profile for people looking for someone to rent with in Warsaw: districts, budget per person, move-in month, languages. Matching isn't open yet.
```

## Group keys

Fill one row per group before its first reply. Public group handles or public group names only;
no admin names or private contacts. The key is 1 – 24 characters of `a-z` and `0-9` (no
capitals, dashes or underscores), unique in the table; the source is `tg`, `fb`, `ig` or
`threads`. `src/lib/bot/roommate-posting-kit.test.ts` checks every filled row and every link in
this file. Candidate channels from research: `docs/research/roommate-market-2026-11-19.md`.

| Key | Source | Public group (handle or name) | Language | Links allowed | Admins asked (date, answer) | Notes |
| --- | ------ | ----------------------------- | -------- | ------------- | --------------------------- | ----- |
