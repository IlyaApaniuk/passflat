import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

// The bot's profile photo, sent by `npm run bot:profile` through setMyProfilePhoto (D77).
// Telegram shows it in a circle, so the file is a 512 x 512 square. The checks read only the
// PNG header, so any 512 x 512 PNG passes and the owner may replace the file with his own.
const AVATAR_PATH = join(process.cwd(), 'public', 'bot-avatar.png');
const AVATAR_SIDE = 512;
const MAX_BYTES = 200 * 1024;

// PNG layout: the 8-byte signature, then the IHDR chunk (4-byte length, 4-byte type "IHDR",
// 4-byte big-endian width at 16 - 19 and height at 20 - 23).
const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const IHDR_TYPE_OFFSET = 12;
const IHDR_WIDTH_OFFSET = 16;
const IHDR_HEIGHT_OFFSET = 20;

const readAvatar = () => readFileSync(AVATAR_PATH);

describe('public/bot-avatar.png', () => {
  it('is a PNG file (signature and IHDR chunk)', () => {
    const file = readAvatar();
    expect(file.subarray(0, PNG_SIGNATURE.length).equals(PNG_SIGNATURE)).toBe(true);
    expect(file.subarray(IHDR_TYPE_OFFSET, IHDR_TYPE_OFFSET + 4).toString('latin1')).toBe('IHDR');
  });

  it('is 512 x 512', () => {
    const file = readAvatar();
    expect(file.readUInt32BE(IHDR_WIDTH_OFFSET)).toBe(AVATAR_SIDE);
    expect(file.readUInt32BE(IHDR_HEIGHT_OFFSET)).toBe(AVATAR_SIDE);
  });

  it('is under 200 kB', () => {
    expect(readAvatar().length).toBeLessThan(MAX_BYTES);
  });
});
