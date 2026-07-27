import { afterEach, describe, expect, it } from 'vitest';
import { NextRequest } from 'next/server';

import { requireCronAuth } from './admin-auth';

const originalSecret = process.env.CRON_SECRET;

function cronRequest(authorization?: string): NextRequest {
  return new NextRequest('https://passflat.com/api/cron/cleanup-accounts', {
    headers: authorization ? { authorization } : undefined,
  });
}

afterEach(() => {
  if (originalSecret === undefined) delete process.env.CRON_SECRET;
  else process.env.CRON_SECRET = originalSecret;
});

describe('requireCronAuth', () => {
  it('fails closed with 500 when CRON_SECRET is unset', () => {
    delete process.env.CRON_SECRET;
    // The pre-hardening bug: `Bearer ${undefined}` used to authenticate.
    const response = requireCronAuth(cronRequest('Bearer undefined'));
    expect(response?.status).toBe(500);
  });

  it('rejects a missing or wrong bearer token', () => {
    process.env.CRON_SECRET = 'top-secret';
    expect(requireCronAuth(cronRequest())?.status).toBe(401);
    expect(requireCronAuth(cronRequest('Bearer wrong'))?.status).toBe(401);
    // Same length as the expected header — the constant-time path.
    expect(requireCronAuth(cronRequest('Bearer top-secreT'))?.status).toBe(401);
    expect(requireCronAuth(cronRequest('top-secret'))?.status).toBe(401);
  });

  it('returns null for the correct bearer token', () => {
    process.env.CRON_SECRET = 'top-secret';
    expect(requireCronAuth(cronRequest('Bearer top-secret'))).toBeNull();
  });
});
