import { realpathSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { FullConfig } from '@playwright/test';

export default async function checkSameCheckout(config: FullConfig): Promise<void> {
  const base = config.projects[0].use.baseURL!;
  const here = realpathSync(fileURLToPath(new URL('..', import.meta.url)));
  const served = await fetch(new URL('/__checkout', base))
    .then((r) => (r.ok ? r.text() : ''))
    .catch(() => '');
  const there = served.startsWith('/') ? realpathSync(served) : null;
  if (there === here) return;
  throw new Error(
    there
      ? `The dev server on ${base} is serving ${there}, not this checkout (${here}). Stop it or run the tests from that checkout.`
      : `The server on ${base} is not this checkout's dev server. Stop it and run the tests again.`,
  );
}
