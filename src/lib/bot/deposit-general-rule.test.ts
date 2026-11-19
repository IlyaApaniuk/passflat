import type { Api, Context } from 'grammy';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * FR-43 (D26): the deposit verdict when the contract could not be read, is not
 * a lease, or the case is unsupported (reason `other`, more returned than the
 * deposit). Texts are asserted as literals so a copy change cannot pass
 * unnoticed. Prisma, the contract reader and Telegram are fakes.
 */

const h = vi.hoisted(() => ({ rows: new Map<string, Record<string, unknown>>() }));

const prismaFake = vi.hoisted(() => ({
  depositCase: {
    findFirst: vi.fn(),
    findUnique: vi.fn(),
    update: vi.fn(),
  },
}));

vi.mock('@/lib/prisma', () => ({ prisma: prismaFake }));
vi.mock('./analytics', () => ({ track: vi.fn() }));
vi.mock('./contract', () => ({ readContract: vi.fn() }));
vi.mock('./store', () => ({ touchChat: vi.fn() }));
vi.mock('next/server', async (importOriginal) => ({
  ...(await importOriginal<typeof import('next/server')>()),
  after: vi.fn(),
}));
vi.mock('@/lib/posthog-server', () => ({ flushPostHog: vi.fn(async () => {}) }));

import { track } from './analytics';
import { readContract, type ContractReading } from './contract';
import { handleDepositText, processContract, renderVerdict } from './deposit-flow';

type Row = Parameters<typeof renderVerdict>[0];
type Locale = 'ru' | 'uk';

const TODAY = new Date('2026-11-19T09:00:00Z');
const CASE_ID = '00000000-0000-4000-8000-000000000042';
const TG_CHAT_ID = 777000111;

function caseRow(overrides: Record<string, unknown> = {}): Row {
  return {
    id: CASE_ID,
    chatId: 'chat-db-1',
    status: 'verdict',
    step: null,
    movedOutAt: new Date('2026-10-01T00:00:00Z'),
    depositAmount: 4000,
    returnedAmount: 1000,
    reason: 'wear',
    protocol: 'both',
    outcome: null,
    contractFiles: [],
    contractStatus: 'skipped',
    contractType: null,
    landlordKind: null,
    contractReturnValue: null,
    contractReturnUnit: null,
    renovationRule: null,
    cleaningRule: null,
    contractQuotes: null,
    letterParties: null,
    ...overrides,
  } as unknown as Row;
}

const TEXT = {
  ru: {
    header: '⚖️ <b>Общее правило</b>',
    oldHeader: 'Разбор',
    contractFailed:
      'Договор прочитать не удалось, поэтому ниже — общее правило закона, а не вывод по твоему договору. Срок в твоём договоре может быть другим.',
    notLease:
      'Это не похоже на договор аренды, поэтому ниже — общее правило закона, а не вывод по твоему договору. Срок в твоём договоре может быть другим.',
    disputed:
      'Если сумма спорная, лучше показать документы юристу или в бесплатный пункт помощи (nieodpłatna pomoc prawna).',
    above: 'Вернули больше, чем был залог, — такой случай бот не разбирает.',
    nothingOwed: 'Вернули столько же, сколько был залог, — значит, спорить не о чем 🙂',
    deadline: '⏰ Срок у хозяина истёк <b>02.11.2026</b>',
    phrases: [
      'Скорее всего, закон на твоей стороне',
      'Закон на твоей стороне',
      'Шансы хорошие',
      'Позиция слабее',
      'Здесь тоньше',
      'Это может быть законно',
    ],
    rules: {
      wear: 'За обычный износ от нормального использования жилец не отвечает (Kodeks cywilny, art. 675).',
      paint: 'По закону после выезда жилец должен «обновить» квартиру',
      damage: 'Повреждения и стоимость ремонта должен доказать хозяин.',
      damageNone: 'Без протокола спор о повреждениях — слово против слова.',
      bills: 'хозяин вправе их удержать',
      silent: 'Хозяин обязан вернуть залог или показать, что и за что удержал, — с документами.',
      other:
        'Хозяин должен объяснить удержание и подтвердить его документами. Без этого удерживать нельзя.',
    },
  },
  uk: {
    header: '⚖️ <b>Загальне правило</b>',
    oldHeader: 'Розбір',
    contractFailed:
      'Договір прочитати не вдалося, тому нижче — загальне правило закону, а не висновок щодо твого договору. Строк у твоєму договорі може бути іншим.',
    notLease:
      'Це не схоже на договір оренди, тому нижче — загальне правило закону, а не висновок щодо твого договору. Строк у твоєму договорі може бути іншим.',
    disputed:
      'Якщо сума спірна, краще показати документи юристу або в безоплатний пункт допомоги (nieodpłatna pomoc prawna).',
    above: 'Повернули більше, ніж була застава, — такий випадок бот не розбирає.',
    nothingOwed: 'Повернули стільки ж, скільки була застава, — отже, сперечатися нема про що 🙂',
    deadline: '⏰ Строк у власника минув <b>02.11.2026</b>',
    phrases: [
      'Найімовірніше, закон на твоєму боці',
      'Закон на твоєму боці',
      'Шанси добрі',
      'Позиція слабша',
      'Тут тонше',
      'Це може бути законно',
    ],
    rules: {
      wear: 'За звичайний знос від нормального користування мешканець не відповідає (Kodeks cywilny, art. 675).',
      paint: 'За законом після виїзду мешканець має «оновити» квартиру',
      damage: 'Пошкодження і вартість ремонту має довести власник.',
      damageNone: 'Без протоколу суперечка про пошкодження — слово проти слова.',
      bills: 'власник має право їх утримати',
      silent:
        'Власник зобов’язаний повернути заставу або показати, що і за що утримав, — з документами.',
      other:
        'Власник має пояснити утримання і підтвердити його документами. Без цього утримувати не можна.',
    },
  },
} as const;

const LOCALES: Locale[] = ['ru', 'uk'];
const STRENGTH_MARKS = ['✅', '⚠️', 'ℹ️'];

/** No strength phrase in any case, no strength mark, and not the old header. */
function expectNoConclusion(text: string, locale: Locale) {
  const lower = text.toLowerCase();
  for (const phrase of TEXT[locale].phrases) expect(lower).not.toContain(phrase.toLowerCase());
  for (const mark of STRENGTH_MARKS) expect(text).not.toContain(mark);
  expect(text).not.toContain(TEXT[locale].oldHeader);
}

/** Every reason with a strength phrase in a normal verdict, and its protocol. */
const STRENGTH_CASES = [
  { reason: 'wear', protocol: 'both', rule: 'wear' },
  { reason: 'wear', protocol: 'none', rule: 'wear' },
  { reason: 'paint', protocol: 'both', rule: 'paint' },
  { reason: 'damage', protocol: 'both', rule: 'damage' },
  { reason: 'damage', protocol: 'none', rule: 'damageNone' },
  { reason: 'bills', protocol: 'one', rule: 'bills' },
  { reason: 'silent', protocol: 'none', rule: 'silent' },
] as const;

beforeEach(() => {
  vi.clearAllMocks();
  h.rows.clear();
  prismaFake.depositCase.findUnique.mockImplementation(async ({ where }) => {
    const row = h.rows.get(where.id);
    return row ? { ...row } : null;
  });
  prismaFake.depositCase.update.mockImplementation(async ({ where, data }) => {
    const row = h.rows.get(where.id) ?? {};
    Object.assign(row, data);
    h.rows.set(where.id, row);
    return { ...row };
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe.each(LOCALES)('general-rule verdict (%s)', (locale) => {
  const t = TEXT[locale];

  it.each(STRENGTH_CASES)(
    'contract not read, $reason / $protocol: general rule, no strength phrase',
    ({ reason, protocol, rule }) => {
      const text = renderVerdict(
        caseRow({ reason, protocol, contractStatus: 'failed' }),
        locale,
        TODAY,
        'failed',
      );

      expect(text.startsWith(`${t.header}\n\n${t.contractFailed}\n\n`)).toBe(true);
      expect(text).not.toContain(t.notLease);
      expectNoConclusion(text, locale);
      // The statutory deadline and the factual explanation stay.
      expect(text).toContain(t.deadline);
      expect(text).toContain(t.rules[rule]);
      expect(text).toContain(t.disputed);
    },
  );

  it.each(STRENGTH_CASES)(
    'not a lease, $reason / $protocol: general rule with the not-a-lease sentence',
    ({ reason, protocol, rule }) => {
      const text = renderVerdict(
        caseRow({ reason, protocol, contractStatus: 'failed' }),
        locale,
        TODAY,
        'not_lease',
      );

      expect(text.startsWith(`${t.header}\n\n${t.notLease}\n\n`)).toBe(true);
      expect(text).not.toContain(t.contractFailed);
      expectNoConclusion(text, locale);
      expect(text).toContain(t.deadline);
      expect(text).toContain(t.rules[rule]);
      expect(text).toContain(t.disputed);
    },
  );

  it('a failed contract rendered without the reading result reads as "could not be read"', () => {
    const text = renderVerdict(caseRow({ contractStatus: 'failed' }), locale, TODAY);

    expect(text).toContain(t.header);
    expect(text).toContain(t.contractFailed);
  });

  it.each(['skipped', 'done'])('reason other, contract %s: general rule, no sentence', (status) => {
    const text = renderVerdict(
      caseRow({ reason: 'other', protocol: 'both', contractStatus: status }),
      locale,
      TODAY,
    );

    expect(text.startsWith(`${t.header}\n\n`)).toBe(true);
    expect(text).not.toContain(t.contractFailed);
    expect(text).not.toContain(t.notLease);
    expectNoConclusion(text, locale);
    expect(text).not.toContain('⚖️ ' + t.rules.other);
    expect(text).toContain(t.rules.other);
    expect(text).toContain(t.deadline);
    expect(text).toContain(t.disputed);
  });

  it('reason other with an unread contract: both the sentence and the disputed-sums line', () => {
    const text = renderVerdict(
      caseRow({ reason: 'other', contractStatus: 'failed' }),
      locale,
      TODAY,
      'failed',
    );

    expect(text).toContain(t.contractFailed);
    expect(text).toContain(t.disputed);
    expectNoConclusion(text, locale);
  });

  it('a normal verdict keeps its header and strength phrase and gets no general-rule line', () => {
    const text = renderVerdict(caseRow({ reason: 'wear', protocol: 'both' }), locale, TODAY);

    expect(text).not.toContain(t.header);
    expect(text).toContain(t.oldHeader);
    expect(text).toContain(t.phrases[0]);
    expect(text).not.toContain(t.disputed);
    expect(text).not.toContain(t.contractFailed);
  });
});

describe('normal verdict lines are unchanged by the split into phrase and rule', () => {
  const OLD = {
    ru: {
      wear: '✅ <b>Скорее всего, закон на твоей стороне.</b> За обычный износ от нормального использования жилец не отвечает (Kodeks cywilny, art. 675). Уборка — тоже, если договор отдельно не требует сдать квартиру после клининга.',
      paint:
        '⚖️ <b>Здесь тоньше.</b> По закону после выезда жилец должен «обновить» квартиру — например, покрасить стены, — если договор не говорит иначе (ustawa o ochronie praw lokatorów, art. 6e). Но удержать хозяин может только <b>реальные</b> расходы и обязан их доказать: суды отказывали хозяевам, которые не показали счёт за покраску. Проверь договор и попроси счёт.',
      silent:
        '✅ <b>Закон на твоей стороне.</b> Хозяин обязан вернуть залог или показать, что и за что удержал, — с документами.',
      damage:
        '⚖️ <b>Шансы хорошие.</b> Повреждения и стоимость ремонта должен доказать хозяин. Протокол с фото — твой главный аргумент.',
      damageNone:
        '⚠️ <b>Позиция слабее.</b> Без протокола спор о повреждениях — слово против слова. Но доказать ущерб и его стоимость всё равно должен хозяин, так что письмо отправить стоит.',
      bills:
        'ℹ️ <b>Это может быть законно.</b> Если остались реальные неоплаченные счета или доплата по rozliczenie, хозяин вправе их удержать. Но он должен показать расчёт с документами, а остаток — вернуть.',
    },
    uk: {
      wear: '✅ <b>Найімовірніше, закон на твоєму боці.</b> За звичайний знос від нормального користування мешканець не відповідає (Kodeks cywilny, art. 675). Прибирання — теж, якщо договір окремо не вимагає здати квартиру після клінінгу.',
      paint:
        '⚖️ <b>Тут тонше.</b> За законом після виїзду мешканець має «оновити» квартиру — наприклад, пофарбувати стіни, — якщо договір не каже інакше (ustawa o ochronie praw lokatorów, art. 6e). Але утримати власник може лише <b>реальні</b> витрати і мусить їх довести: суди відмовляли власникам, які не показали рахунок за фарбування. Перевір договір і попроси рахунок.',
      silent:
        '✅ <b>Закон на твоєму боці.</b> Власник зобов’язаний повернути заставу або показати, що і за що утримав, — з документами.',
      damage:
        '⚖️ <b>Шанси добрі.</b> Пошкодження і вартість ремонту має довести власник. Протокол із фото — твій головний аргумент.',
      damageNone:
        '⚠️ <b>Позиція слабша.</b> Без протоколу суперечка про пошкодження — слово проти слова. Але довести шкоду і її вартість усе одно має власник, тож лист надіслати варто.',
      bills:
        'ℹ️ <b>Це може бути законно.</b> Якщо лишилися реальні неоплачені рахунки або доплата за rozliczenie, власник має право їх утримати. Але він має показати розрахунок із документами, а решту — повернути.',
    },
  };

  it.each(LOCALES)('%s', (locale) => {
    const line = (reason: string, protocol = 'both') =>
      renderVerdict(caseRow({ reason, protocol }), locale, TODAY);

    expect(line('wear')).toContain(OLD[locale].wear);
    expect(line('paint')).toContain(OLD[locale].paint);
    expect(line('silent')).toContain(OLD[locale].silent);
    expect(line('damage')).toContain(OLD[locale].damage);
    expect(line('damage', 'none')).toContain(OLD[locale].damageNone);
    expect(line('bills')).toContain(OLD[locale].bills);
  });
});

describe.each(LOCALES)('returned amount at the intake (%s)', (locale) => {
  const t = TEXT[locale];

  function intake(depositAmount: number) {
    prismaFake.depositCase.findFirst.mockResolvedValue(
      caseRow({ status: 'intake', step: 'returned', depositAmount, returnedAmount: null }),
    );
    const reply = vi.fn(async () => ({}));
    return { ctx: { reply } as unknown as Context, reply };
  }

  it('above the deposit: no verdict, no letter, the unsupported reply and no outcome', async () => {
    const { ctx, reply } = intake(4000);

    expect(await handleDepositText(ctx, 'chat-db-1', locale, '5000')).toBe(true);

    expect(prismaFake.depositCase.update).toHaveBeenCalledTimes(1);
    const { data } = prismaFake.depositCase.update.mock.calls[0][0];
    expect(data).toEqual({ returnedAmount: 5000, status: 'resolved', step: null });
    expect(data).not.toHaveProperty('outcome');

    expect(reply).toHaveBeenCalledTimes(1);
    expect(reply).toHaveBeenCalledWith(`${t.above}\n\n${t.disputed}`);
    const text = (reply.mock.calls[0] as unknown[])[0] as string;
    expectNoConclusion(text, locale);
    expect(text).not.toContain(t.nothingOwed);
  });

  it('equal to the deposit: nothing owed, closed as returned in full, as before', async () => {
    const { ctx, reply } = intake(4000);

    expect(await handleDepositText(ctx, 'chat-db-1', locale, '4000')).toBe(true);

    expect(prismaFake.depositCase.update).toHaveBeenCalledWith({
      where: { id: CASE_ID },
      data: { returnedAmount: 4000, status: 'resolved', outcome: 'full', step: null },
    });
    expect(reply).toHaveBeenCalledTimes(1);
    const text = (reply.mock.calls[0] as unknown[])[0] as string;
    expect(text.startsWith(t.nothingOwed)).toBe(true);
    expect(text).not.toContain(t.above);
    expect(text).not.toContain(t.disputed);
  });

  it('below the deposit: on to the reason question', async () => {
    const { ctx, reply } = intake(4000);

    await handleDepositText(ctx, 'chat-db-1', locale, '1000');

    expect(prismaFake.depositCase.update).toHaveBeenCalledWith({
      where: { id: CASE_ID },
      data: { returnedAmount: 1000, step: 'reason' },
    });
    expect((reply.mock.calls[0] as unknown[])[0]).toMatch(/^4\/5\./);
  });
});

describe.each(LOCALES)('reading the contract (%s)', (locale) => {
  const t = TEXT[locale];

  function seedPending() {
    h.rows.set(
      CASE_ID,
      caseRow({
        status: 'intake',
        step: 'contract',
        contractStatus: 'pending',
      }) as unknown as Record<string, unknown>,
    );
    const sendMessage = vi.fn(async () => ({}));
    return { api: { sendMessage } as unknown as Api, sendMessage };
  }

  it('not a lease: the contract message, then the general-rule verdict that names it', async () => {
    const { api, sendMessage } = seedPending();
    vi.mocked(readContract).mockResolvedValueOnce({ isLease: false } as ContractReading);

    await processContract(api, TG_CHAT_ID, CASE_ID, locale);

    expect(h.rows.get(CASE_ID)).toMatchObject({ contractStatus: 'failed', status: 'verdict' });
    expect(track).toHaveBeenCalledWith(TG_CHAT_ID, 'tg_deposit_contract', {
      result: 'not_lease',
    });
    expect(sendMessage).toHaveBeenCalledTimes(2);
    const [contractMessage, verdict] = sendMessage.mock.calls.map(
      (call) => (call as unknown[])[1] as string,
    );
    expectNoConclusion(contractMessage, locale);
    expect(verdict.startsWith(`${t.header}\n\n${t.notLease}`)).toBe(true);
    expectNoConclusion(verdict, locale);
    expect(verdict).toContain(t.disputed);
  });

  it('reading failed: the general-rule verdict says the contract could not be read', async () => {
    const { api, sendMessage } = seedPending();
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.mocked(readContract).mockRejectedValueOnce(new Error('model refused'));

    await processContract(api, TG_CHAT_ID, CASE_ID, locale);

    expect(track).toHaveBeenCalledWith(TG_CHAT_ID, 'tg_deposit_contract', { result: 'failed' });
    const verdict = (sendMessage.mock.calls[1] as unknown[])[1] as string;
    expect(verdict.startsWith(`${t.header}\n\n${t.contractFailed}`)).toBe(true);
    expectNoConclusion(verdict, locale);
  });
});
