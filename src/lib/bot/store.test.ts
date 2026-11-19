import { beforeEach, describe, expect, it, vi } from 'vitest';

const prismaFake = vi.hoisted(() => ({
  telegramChat: { findUnique: vi.fn(), update: vi.fn(), create: vi.fn() },
}));

vi.mock('@/lib/prisma', () => ({ prisma: prismaFake }));

import { touchChat, waitlistCitySlug } from './store';
import { normalizeLocale, peopleWord } from './texts';

describe('waitlistCitySlug', () => {
  it('collapses spellings of one city into one waitlist key', () => {
    expect(waitlistCitySlug('Kraków')).toBe('krakow');
    expect(waitlistCitySlug('Краков')).toBe('krakow');
    expect(waitlistCitySlug('krakow')).toBe('krakow');
    expect(waitlistCitySlug('Zielona Góra')).toBe('zielona-gora');
    expect(waitlistCitySlug('Łódź')).toBe('lodz');
  });
});

describe('peopleWord', () => {
  it('agrees with the count', () => {
    expect(peopleWord('ru', 1)).toBe('человек');
    expect(peopleWord('ru', 3)).toBe('человека');
    expect(peopleWord('uk', 5)).toBe('людей');
  });
});

describe('touchChat and the chat locale (spec 04 §English bot locale)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prismaFake.telegramChat.create.mockImplementation(
      async ({ data }: { data: { locale: string } }) => ({ id: 'new-row', locale: data.locale }),
    );
  });

  it('stores the detected locale for a new chat, English included', async () => {
    prismaFake.telegramChat.findUnique.mockResolvedValue(null);

    const chat = await touchChat({ chatId: 42, locale: normalizeLocale('pl') });

    expect(prismaFake.telegramChat.create).toHaveBeenCalledWith({
      data: { chatId: BigInt(42), locale: 'en', startPayload: null },
      select: { id: true, locale: true },
    });
    expect(chat).toEqual({ id: 'new-row', locale: 'en', isNew: true });
  });

  it('defaults a new chat without a language code to ru', async () => {
    prismaFake.telegramChat.findUnique.mockResolvedValue(null);

    expect((await touchChat({ chatId: 42 })).locale).toBe('ru');
  });

  it('keeps an existing chat’s stored locale and never writes it', async () => {
    prismaFake.telegramChat.findUnique.mockResolvedValue({
      id: 'row',
      locale: 'ru',
      startPayload: 'dep',
    });

    const chat = await touchChat({ chatId: 42, locale: normalizeLocale('en-GB') });

    expect(chat).toEqual({ id: 'row', locale: 'ru', isNew: false });
    expect(prismaFake.telegramChat.create).not.toHaveBeenCalled();
    const [{ data }] = prismaFake.telegramChat.update.mock.calls[0] as [{ data: object }];
    expect(data).not.toHaveProperty('locale');
  });
});
