/**
 * Signup password rules.
 *
 * Two parts: the local requirements shown live on the form, and a check
 * against Have I Been Pwned's breach corpus. HIBP is queried with
 * k-anonymity — only the first 5 characters of the SHA-1 hash leave the
 * browser, and the full password never does.
 */

export interface Rule {
  label: string;
  ok: (password: string) => boolean;
}

/** What a password must contain. Order is the order shown on the form. */
export const PASSWORD_RULES: Rule[] = [
  { label: 'At least 12 characters', ok: (p) => p.length >= 12 },
  { label: 'Upper and lower case letters', ok: (p) => /[a-z]/.test(p) && /[A-Z]/.test(p) },
  { label: 'At least one number', ok: (p) => /\d/.test(p) },
  { label: 'At least one symbol (! ? # $ …)', ok: (p) => /[^A-Za-z0-9]/.test(p) },
  // Repeats and sequences are what cracking dictionaries try first.
  { label: 'No repeated or sequential runs (aaa, 123, abc)', ok: (p) => !hasRun(p) },
];

export const unmetRules = (password: string): Rule[] =>
  PASSWORD_RULES.filter((r) => !r.ok(password));

/** True when three or more characters repeat or run consecutively. */
export function hasRun(password: string): boolean {
  const lower = password.toLowerCase();
  for (let i = 0; i + 2 < lower.length; i++) {
    const [a, b, c] = [lower.charCodeAt(i), lower.charCodeAt(i + 1), lower.charCodeAt(i + 2)];
    if (a === b && b === c) return true;
    if (b - a === 1 && c - b === 1) return true;
    if (a - b === 1 && b - c === 1) return true;
  }
  return false;
}

/**
 * Reads HIBP's range response — lines of "<35-char hash suffix>:<count>" —
 * and returns how many breaches contain the password with this suffix.
 */
export function countInRange(body: string, suffix: string): number {
  const wanted = suffix.toUpperCase();
  for (const line of body.split('\n')) {
    const [hash, count] = line.trim().split(':');
    if (hash?.toUpperCase() === wanted) return parseInt(count, 10) || 0;
  }
  return 0;
}

async function sha1Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-1', new TextEncoder().encode(text));
  return [...new Uint8Array(digest)]
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
    .toUpperCase();
}

/**
 * How many known breaches this password appears in. 0 means it was not found.
 *
 * ponytail: a network or crypto failure returns 0 rather than blocking signup —
 * the local rules still apply. Fail closed instead if the threat model changes.
 */
export async function breachCount(password: string): Promise<number> {
  try {
    const hash = await sha1Hex(password);
    const res = await fetch(`https://api.pwnedpasswords.com/range/${hash.slice(0, 5)}`);
    if (!res.ok) return 0;
    return countInRange(await res.text(), hash.slice(5));
  } catch {
    return 0;
  }
}
