import { beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({
  generateLink: vi.fn(),
  createUser: vi.fn(),
  sendEmail: vi.fn(),
  headers: vi.fn(),
}));

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    auth: { admin: { generateLink: h.generateLink, createUser: h.createUser } },
  }),
}));

vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn() }));
vi.mock('@/lib/profile', () => ({ getOrCreateProfile: vi.fn() }));
vi.mock('@/lib/claim-reports', () => ({ claimAnonymousReports: vi.fn() }));
vi.mock('@/lib/email/send', () => ({ sendEmail: h.sendEmail }));
vi.mock('@/lib/posthog-server', () => ({
  captureServerException: vi.fn(),
  flushPostHog: vi.fn(),
}));
vi.mock('next/headers', () => ({ headers: h.headers }));
vi.mock('next/navigation', () => ({ redirect: vi.fn() }));

import { resetRateLimits } from '@/lib/rate-limit';
import { requestPasswordReset, signInWithMagicLink } from './actions';

function magicLinkForm(email: string) {
  const formData = new FormData();
  formData.set('email', email);
  formData.set('locale', 'pl');
  return formData;
}

function generatedLink() {
  return { data: { properties: { hashed_token: 'token-123' } }, error: null };
}

/** Shape of a GoTrue admin error as auth-js surfaces it. */
function authError(message: string, status: number, code?: string) {
  return { data: { properties: null }, error: { message, status, code } };
}

beforeEach(() => {
  resetRateLimits();
  vi.spyOn(console, 'error').mockImplementation(() => {});
  for (const mock of Object.values(h)) mock.mockReset();
  h.headers.mockResolvedValue(new Headers({ 'x-forwarded-for': '203.0.113.5' }));
  h.sendEmail.mockResolvedValue(undefined);
  h.createUser.mockResolvedValue({ data: { user: null }, error: null });
});

describe('signInWithMagicLink', () => {
  it('creates the missing account and retries once, then mails the link', async () => {
    h.generateLink
      .mockResolvedValueOnce(authError('User not found', 404, 'user_not_found'))
      .mockResolvedValueOnce(generatedLink());

    await expect(signInWithMagicLink(magicLinkForm('new@example.com'))).resolves.toEqual({
      success: true,
    });
    expect(h.createUser).toHaveBeenCalledWith({ email: 'new@example.com', email_confirm: true });
    expect(h.sendEmail).toHaveBeenCalledOnce();
  });

  it('never creates an account when the link failed for any other reason', async () => {
    h.generateLink.mockResolvedValue(authError('Database error', 500, 'unexpected_failure'));

    const result = await signInWithMagicLink(magicLinkForm('victim@example.com'));

    expect(h.createUser).not.toHaveBeenCalled();
    expect(h.generateLink).toHaveBeenCalledOnce();
    expect(h.sendEmail).not.toHaveBeenCalled();
    // Generic on purpose — the reply must not describe the account's state.
    expect(result).toEqual({ error: 'Something went wrong. Please try again.' });
  });

  it('recognises the legacy 404 shape that carries no error code', async () => {
    h.generateLink
      .mockResolvedValueOnce(authError('User not found', 404, undefined))
      .mockResolvedValueOnce(generatedLink());

    await expect(signInWithMagicLink(magicLinkForm('legacy@example.com'))).resolves.toEqual({
      success: true,
    });
    expect(h.createUser).toHaveBeenCalledOnce();
  });

  it('caps how many links one address can be mailed', async () => {
    h.generateLink.mockResolvedValue(generatedLink());

    for (let i = 0; i < 5; i += 1) {
      await expect(signInWithMagicLink(magicLinkForm('target@example.com'))).resolves.toEqual({
        success: true,
      });
    }

    await expect(signInWithMagicLink(magicLinkForm('target@example.com'))).resolves.toEqual({
      error: 'Too many requests. Please try again later.',
    });
    expect(h.sendEmail).toHaveBeenCalledTimes(5);
  });

  it('caps one IP across flows, not just per address', async () => {
    h.generateLink.mockResolvedValue(generatedLink());

    // Four addresses × five links exhausts the twenty-per-IP budget.
    for (let i = 0; i < 4; i += 1) {
      for (let attempt = 0; attempt < 5; attempt += 1) {
        await signInWithMagicLink(magicLinkForm(`user${i}@example.com`));
      }
    }
    expect(h.sendEmail).toHaveBeenCalledTimes(20);

    // A fresh address from the same IP has its own address budget but no IP budget.
    await expect(signInWithMagicLink(magicLinkForm('fifth@example.com'))).resolves.toEqual({
      error: 'Too many requests. Please try again later.',
    });
    // Another IP is unaffected.
    h.headers.mockResolvedValue(new Headers({ 'x-forwarded-for': '198.51.100.9' }));
    await expect(signInWithMagicLink(magicLinkForm('fifth@example.com'))).resolves.toEqual({
      success: true,
    });
  });
});

describe('requestPasswordReset', () => {
  it('stays silent when limited, so the reply never reveals the address', async () => {
    h.generateLink.mockResolvedValue(generatedLink());

    for (let i = 0; i < 5; i += 1) {
      await requestPasswordReset(magicLinkForm('target@example.com'));
    }
    expect(h.sendEmail).toHaveBeenCalledTimes(5);

    // Same answer as an unknown address gets.
    await expect(requestPasswordReset(magicLinkForm('target@example.com'))).resolves.toEqual({
      success: true,
    });
    expect(h.sendEmail).toHaveBeenCalledTimes(5);
  });
});
