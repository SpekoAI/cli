import { describe, expect, it, vi } from 'vitest';

// `apiFetch` reads the stored credential first, so the module is stubbed.
vi.mock('./credentials.js', () => ({
  readCredentials: () => ({ accessToken: 'tok', apiUrl: 'https://api.test' }),
  userAgent: () => 'speko-cli/test',
}));

const { ApiError, apiFetch, paymentLinkFrom } = await import('./api-client.js');
const { createTopUpLink, formatTopUpLink } = await import('./top-up.js');
const { DASHBOARD_URL } = await import('./constants.js');

const TOP_UP_URL = 'https://platform.speko.ai/v1/public/top-up/tu1.claims.mac';

const json = (status: number, body: unknown): typeof fetch =>
  (async () =>
    new Response(JSON.stringify(body), {
      status,
      headers: { 'content-type': 'application/json' },
    })) as unknown as typeof fetch;

describe('paymentLinkFrom', () => {
  it('prefers the one-tap link, which needs no sign-in', () => {
    expect(paymentLinkFrom({ topUpUrl: TOP_UP_URL, billingUrl: '/settings/billing' })).toBe(
      TOP_UP_URL,
    );
  });

  it('makes a console path absolute', () => {
    expect(paymentLinkFrom({ billingUrl: '/settings/billing' })).toBe(
      `${DASHBOARD_URL}/settings/billing`,
    );
  });

  it('prints nothing that is not https or a console path', () => {
    expect(paymentLinkFrom({ topUpUrl: 'http://platform.speko.ai/x' })).toBeUndefined();
    expect(paymentLinkFrom({ topUpUrl: 'javascript:alert(1)' })).toBeUndefined();
    expect(paymentLinkFrom({ billingUrl: '//evil.example/x' })).toBeUndefined();
    expect(paymentLinkFrom({})).toBeUndefined();
    expect(paymentLinkFrom(null)).toBeUndefined();
  });
});

describe('a payment refusal', () => {
  it('carries the link the server sent instead of dropping it', async () => {
    const refusal = apiFetch(
      '/sessions/phone',
      { method: 'POST', body: '{}' },
      json(402, {
        error: 'Insufficient credit balance.',
        code: 'INSUFFICIENT_CREDITS',
        hint: 'Add credit with the one-tap `topUpUrl`.',
        topUpUrl: TOP_UP_URL,
      }),
    );
    await expect(refusal).rejects.toBeInstanceOf(ApiError);
    const error = (await refusal.catch((e: unknown) => e)) as InstanceType<typeof ApiError>;
    expect(error.status).toBe(402);
    expect(error.link).toBe(TOP_UP_URL);
    expect(error.hint).toContain('topUpUrl');
  });

  it('keeps a link off every other error', async () => {
    const error = (await apiFetch(
      '/x',
      {},
      json(400, { error: 'bad', topUpUrl: TOP_UP_URL }),
    ).catch((e: unknown) => e)) as InstanceType<typeof ApiError>;
    expect(error.link).toBeUndefined();
  });
});

describe('top-up', () => {
  it('asks the server for a link and prints it with the amount range', async () => {
    const seen: Request[] = [];
    const fetchImpl = (async (input: string | URL | Request, init?: RequestInit) => {
      seen.push(new Request(input, init));
      return new Response(
        JSON.stringify({
          url: TOP_UP_URL,
          purpose: 'generic',
          expiresAt: '2026-11-16T00:00:00.000Z',
          minAmountUsd: 5,
          maxAmountUsd: 10000,
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      );
    }) as unknown as typeof fetch;

    const link = await createTopUpLink(fetchImpl);
    expect(seen[0]?.method).toBe('POST');
    expect(new URL(seen[0]?.url ?? '').pathname).toMatch(/\/billing\/top-up-link$/);
    const lines = formatTopUpLink(link).join('\n');
    expect(lines).toContain(TOP_UP_URL);
    expect(lines).toContain('$5 to $10,000');
    // The CLI never suggests an amount.
    expect(lines).not.toMatch(/\$(10|25|50|100)(?![0-9,])/);
  });
});
