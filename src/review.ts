// src/review.ts
// One polite App Store review ask, at the win moment — an invoice marked
// paid. Never on first launch, never mid-composer; the only call site is
// the paid transition in InvoiceScreen. Asks at most once ever (kv flag;
// Apple further rate-limits on their side).
// Fail-open: if the native module is missing or throws, nothing happens.

import Storage from 'expo-sqlite/kv-store';

const ASKED_KEY = 'lessonledger.review-asked.v1';

function getStoreReview(): any | null {
  // Do NOT rely on try/catch around require() for fail-open here: when a
  // module's factory throws (native half missing from the binary), Metro's
  // guardedLoadModule reports it as a FATAL error itself — the exception
  // never reaches this catch, and a release build aborts. (This bricked a
  // Number Nine device build on 2026-07-27.) Check the native registry
  // BEFORE requiring so the factory can't throw.
  const native = (globalThis as any).expo?.modules?.ExpoStoreReview;
  if (!native) return null;
  try {
    const mod = require('expo-store-review');
    return mod?.default ?? mod ?? null;
  } catch {
    return null;
  }
}

/** Request a review if never asked before. Safe to call on every mark-paid. */
export function maybeAskForReview(): void {
  try {
    const SR = getStoreReview();
    if (!SR) return;
    Storage.getItem(ASKED_KEY)
      .then((asked) => {
        if (asked) return;
        return Storage.setItem(ASKED_KEY, String(Date.now())).then(() =>
          // isAvailableAsync + requestReview both resolve quietly; the OS
          // decides whether anything is actually shown.
          SR.isAvailableAsync?.().then((ok: boolean) => {
            if (ok) SR.requestReview?.();
          }),
        );
      })
      .catch(() => {});
  } catch {
    /* fail open */
  }
}
