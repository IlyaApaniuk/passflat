import { statSync } from 'node:fs';

import { type Api, InputFile } from 'grammy';

import {
  BOT_PROFILE,
  BOT_PROFILE_LANGUAGES,
  botProfileLimitBreaches,
  type BotProfileLanguage,
  type BotProfileTexts,
} from './profile-texts';

/**
 * Sets the bot's profile through the Bot API (D77): the name, the description and the short
 * description for the default language (no `language_code`, RU) and for `uk`, `en` and `pl`,
 * then the profile photo. Run by the owner as `npm run bot:profile` (`scripts/tg-profile.ts`);
 * checks call it only with a fake api. Each call is idempotent, so a run that stops halfway is
 * run again.
 */

/** The four Bot API methods the profile needs (a grammY `Api` has them). */
export type BotProfileApi = Pick<
  Api,
  'setMyName' | 'setMyDescription' | 'setMyShortDescription' | 'setMyProfilePhoto'
>;

type TextMethod = 'setMyName' | 'setMyDescription' | 'setMyShortDescription';

export type BotProfileCall =
  | {
      method: TextMethod;
      /** `undefined` for the default (RU) texts. */
      languageCode: Exclude<BotProfileLanguage, 'default'> | undefined;
      text: string;
    }
  | { method: 'setMyProfilePhoto'; photoPath: string };

interface ApplyBotProfileOptions {
  dryRun: boolean;
  /** The static profile photo; the script passes `public/bot-avatar.png` (T114). */
  photoPath: string;
  /** The texts; tests pass others, the script never does. */
  profile?: Readonly<Record<BotProfileLanguage, BotProfileTexts>>;
  log?: (line: string) => void;
}

const TEXT_METHODS: readonly { method: TextMethod; key: keyof BotProfileTexts }[] = [
  { method: 'setMyName', key: 'name' },
  { method: 'setMyDescription', key: 'description' },
  { method: 'setMyShortDescription', key: 'shortDescription' },
];

function plannedCalls(
  profile: Readonly<Record<BotProfileLanguage, BotProfileTexts>>,
  photoPath: string,
): BotProfileCall[] {
  const calls: BotProfileCall[] = [];
  for (const language of BOT_PROFILE_LANGUAGES) {
    const languageCode = language === 'default' ? undefined : language;
    for (const { method, key } of TEXT_METHODS) {
      calls.push({ method, languageCode, text: profile[language][key] });
    }
  }
  calls.push({ method: 'setMyProfilePhoto', photoPath });
  return calls;
}

function describeCall(call: BotProfileCall, photoBytes: number): string {
  if (call.method === 'setMyProfilePhoto') {
    return `setMyProfilePhoto static ${call.photoPath} (${photoBytes} bytes)`;
  }
  return `${call.method} language_code=${call.languageCode ?? '(default)'} (${call.text.length} characters)`;
}

async function send(api: BotProfileApi, call: BotProfileCall): Promise<void> {
  if (call.method === 'setMyProfilePhoto') {
    await api.setMyProfilePhoto({ type: 'static', photo: new InputFile(call.photoPath) });
    return;
  }
  const other = call.languageCode ? { language_code: call.languageCode } : undefined;
  if (call.method === 'setMyName') await api.setMyName(call.text, other);
  else if (call.method === 'setMyDescription') await api.setMyDescription(call.text, other);
  else await api.setMyShortDescription(call.text, other);
}

/**
 * Validates every text against `BOT_PROFILE_LIMITS` and checks the photo file before the first
 * call (a breach throws, naming the language and the key); then makes each call in order, or,
 * with `dryRun`, only prints it. Returns the calls.
 */
export async function applyBotProfile(
  api: BotProfileApi | undefined,
  {
    dryRun,
    photoPath,
    profile = BOT_PROFILE,
    log = (line: string) => console.log(line),
  }: ApplyBotProfileOptions,
): Promise<BotProfileCall[]> {
  const breaches = botProfileLimitBreaches(profile);
  if (breaches.length > 0) {
    throw new Error(`Bot profile texts over the Bot API limits: ${breaches.join('; ')}`);
  }
  const photo = statSync(photoPath, { throwIfNoEntry: false });
  if (!photo?.isFile()) throw new Error(`Bot profile photo not found: ${photoPath}`);
  if (!dryRun && !api) throw new Error('No Bot API client: pass one, or run with --dry-run.');

  const calls = plannedCalls(profile, photoPath);
  for (const call of calls) {
    const line = describeCall(call, photo.size);
    if (dryRun || !api) {
      log(`[dry run] ${line}`);
      continue;
    }
    await send(api, call);
    log(`done: ${line}`);
  }
  return calls;
}
