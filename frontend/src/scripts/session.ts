import { setAppIdentity } from '../stores/garden';
import type { Account } from './account-preferences';
import { api } from './api';

type SessionResponse = { authenticated: boolean; account: Account | null } | Account;

let sessionPromise: Promise<Account | null> | null = null;
let cachedResolved = false;

export function invalidateSessionCache(): void {
  sessionPromise = null;
  cachedResolved = false;
}

/** Remove persisted user preferences on explicit sign-out so they never leak across accounts. */
export function clearLocalUserPreferences(): void {
  try {
    localStorage.removeItem('garden-theme');
    localStorage.removeItem('garden-reading');
    localStorage.removeItem('garden-default-mode');
    localStorage.removeItem('garden-fixed-toolbar');
  } catch {}
}

/**
 * Shared singleton session check using `/api/auth/session` (HTTP 200 for both guests and users).
 * Eliminates duplicate 401 console/network noise across page islands.
 */
export async function getSession(force = false): Promise<Account | null> {
  if (force || !sessionPromise) {
    cachedResolved = false;
    sessionPromise = api<SessionResponse>('/auth/session')
      .then((res) => {
        const account =
          res && typeof res === 'object' && 'authenticated' in res
            ? res.authenticated
              ? res.account
              : null
            : (res as Account | null);
        cachedResolved = true;
        setAppIdentity(account ?? null);
        return account ?? null;
      })
      .catch(() => {
        sessionPromise = null;
        cachedResolved = false;
        return null;
      });
  }
  return sessionPromise;
}

export function hasResolvedSession(): boolean {
  return cachedResolved;
}

if (typeof document !== 'undefined') {
  document.addEventListener('garden:account', () => {
    invalidateSessionCache();
  });
  document.addEventListener('garden:identity', (event) => {
    const detail = (event as CustomEvent<{ id?: string } | null>).detail;
    if (!detail) {
      invalidateSessionCache();
    }
  });
}
