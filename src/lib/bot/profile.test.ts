import { join } from 'node:path';

import { InputFile } from 'grammy';
import { describe, expect, it } from 'vitest';

import { applyBotProfile, type BotProfileApi } from './profile';
import { BOT_PROFILE } from './profile-texts';

/**
 * `applyBotProfile` (D77) over a fake api that records each call: nothing here builds a grammY
 * `Bot` or `Api`, so nothing reaches Telegram.
 */

const PHOTO_PATH = join(process.cwd(), 'public/bot-avatar.png');

type Recorded = { method: string; args: unknown[] };

function fakeApi(): { api: BotProfileApi; calls: Recorded[] } {
  const calls: Recorded[] = [];
  const record =
    (method: string) =>
    async (...args: unknown[]): Promise<true> => {
      calls.push({ method, args });
      return true;
    };
  return {
    calls,
    api: {
      setMyName: record('setMyName'),
      setMyDescription: record('setMyDescription'),
      setMyShortDescription: record('setMyShortDescription'),
      setMyProfilePhoto: record('setMyProfilePhoto'),
    },
  };
}

const quiet = () => {};

describe('applyBotProfile', () => {
  it('sets name, description and short description for default, uk, en and pl, then the photo', async () => {
    const { api, calls } = fakeApi();
    await applyBotProfile(api, { dryRun: false, photoPath: PHOTO_PATH, log: quiet });

    const textCalls = (code: string | undefined, texts: typeof BOT_PROFILE.default) => [
      { method: 'setMyName', args: [texts.name, code ? { language_code: code } : undefined] },
      {
        method: 'setMyDescription',
        args: [texts.description, code ? { language_code: code } : undefined],
      },
      {
        method: 'setMyShortDescription',
        args: [texts.shortDescription, code ? { language_code: code } : undefined],
      },
    ];
    expect(calls.slice(0, 12)).toEqual([
      ...textCalls(undefined, BOT_PROFILE.default),
      ...textCalls('uk', BOT_PROFILE.uk),
      ...textCalls('en', BOT_PROFILE.en),
      ...textCalls('pl', BOT_PROFILE.en),
    ]);
    expect(calls).toHaveLength(13);
    expect(calls[12].method).toBe('setMyProfilePhoto');
  });

  it('sends the pl texts equal to the en texts', async () => {
    const { api, calls } = fakeApi();
    await applyBotProfile(api, { dryRun: false, photoPath: PHOTO_PATH, log: quiet });
    const byCode = (code: string) =>
      calls
        .filter(({ args }) => (args[1] as { language_code?: string })?.language_code === code)
        .map(({ method, args }) => [method, args[0]]);
    expect(byCode('pl')).toHaveLength(3);
    expect(byCode('pl')).toEqual(byCode('en'));
  });

  it('sends the photo as a static InputFile of public/bot-avatar.png', async () => {
    const { api, calls } = fakeApi();
    await applyBotProfile(api, { dryRun: false, photoPath: PHOTO_PATH, log: quiet });
    const [photoArg] = calls[12].args as [{ type: string; photo: unknown }];
    expect(photoArg.type).toBe('static');
    expect(photoArg.photo).toBeInstanceOf(InputFile);
    expect((photoArg.photo as InputFile).filename).toBe('bot-avatar.png');
  });

  it('returns the list of calls in order', async () => {
    const { api } = fakeApi();
    const result = await applyBotProfile(api, {
      dryRun: false,
      photoPath: PHOTO_PATH,
      log: quiet,
    });
    expect(result.map((call) => call.method)).toEqual([
      ...Array.from({ length: 4 }, () => [
        'setMyName',
        'setMyDescription',
        'setMyShortDescription',
      ]).flat(),
      'setMyProfilePhoto',
    ]);
    expect(result.map((call) => ('languageCode' in call ? call.languageCode : 'photo'))).toEqual([
      ...[undefined, 'uk', 'en', 'pl'].flatMap((code) => [code, code, code]),
      'photo',
    ]);
    expect(result[12]).toEqual({ method: 'setMyProfilePhoto', photoPath: PHOTO_PATH });
  });

  it('with dryRun prints every call and makes none', async () => {
    const { api, calls } = fakeApi();
    const lines: string[] = [];
    const result = await applyBotProfile(api, {
      dryRun: true,
      photoPath: PHOTO_PATH,
      log: (line) => lines.push(line),
    });
    expect(calls).toEqual([]);
    expect(result).toHaveLength(13);
    expect(lines).toHaveLength(13);
    expect(lines[0]).toBe(
      `[dry run] setMyName language_code=(default) (${BOT_PROFILE.default.name.length} characters)`,
    );
    expect(lines[4]).toBe(
      `[dry run] setMyDescription language_code=uk (${BOT_PROFILE.uk.description.length} characters)`,
    );
    expect(lines[11]).toBe(
      `[dry run] setMyShortDescription language_code=pl (${BOT_PROFILE.en.shortDescription.length} characters)`,
    );
    expect(lines[12]).toMatch(
      /^\[dry run\] setMyProfilePhoto static .*bot-avatar\.png \(\d+ bytes\)$/,
    );
  });

  it('with dryRun needs no api', async () => {
    const result = await applyBotProfile(undefined, {
      dryRun: true,
      photoPath: PHOTO_PATH,
      log: quiet,
    });
    expect(result).toHaveLength(13);
  });

  it('refuses a real run without an api', async () => {
    await expect(
      applyBotProfile(undefined, { dryRun: false, photoPath: PHOTO_PATH, log: quiet }),
    ).rejects.toThrow(/--dry-run/);
  });

  it('throws before the first call when a text breaks its limit, naming the language and key', async () => {
    const { api, calls } = fakeApi();
    const profile = { ...BOT_PROFILE, pl: { ...BOT_PROFILE.en, description: 'x'.repeat(513) } };
    await expect(
      applyBotProfile(api, { dryRun: false, photoPath: PHOTO_PATH, profile, log: quiet }),
    ).rejects.toThrow('pl description: 513 > 512');
    expect(calls).toEqual([]);
  });

  it('throws before the first call when the photo is missing', async () => {
    const { api, calls } = fakeApi();
    const photoPath = join(process.cwd(), 'public/no-such-avatar.png');
    await expect(applyBotProfile(api, { dryRun: false, photoPath, log: quiet })).rejects.toThrow(
      `Bot profile photo not found: ${photoPath}`,
    );
    expect(calls).toEqual([]);
  });
});
