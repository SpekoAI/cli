import { apiFetch } from './api-client.js';

/** `POST /v1/billing/top-up-link`: a one-tap payment link for the signed-in workspace. */
export interface TopUpLink {
  readonly url: string;
  readonly purpose: string;
  readonly expiresAt: string;
  readonly minAmountUsd?: number;
  readonly maxAmountUsd?: number;
}

/**
 * The link moves no money: it opens a Stripe page where the payer picks the
 * amount, and it can only pay into this workspace. That is why a CLI session,
 * which never holds the billing scope, may ask for one.
 */
export function createTopUpLink(fetchImpl?: typeof fetch): Promise<TopUpLink> {
  return apiFetch<TopUpLink>(
    '/billing/top-up-link',
    { method: 'POST', body: JSON.stringify({ purpose: 'generic' }) },
    fetchImpl,
  );
}

export function formatTopUpLink(link: TopUpLink): string[] {
  const min = link.minAmountUsd ?? 5;
  const max = link.maxAmountUsd ?? 10_000;
  return [
    'Add credit to this workspace:',
    '',
    `  ${link.url}`,
    '',
    `  Opens a secure Stripe page where you choose the amount ($${min} to $${max.toLocaleString('en-US')}).`,
    '  Nothing renews. The link works until ' + link.expiresAt + '.',
  ];
}
