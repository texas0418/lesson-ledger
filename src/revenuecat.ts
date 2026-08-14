// src/revenuecat.ts
// RevenueCat configuration for Lesson Ledger Pro — the fleet's FIRST
// auto-renewing subscription ($4.99/month or $49.99/year), not the usual
// one-time unlock.
//
// FAIL-OPEN HOUSE RULE: while these keys are placeholders — or
// react-native-purchases is not in the running build (e.g. Expo Go) — Pro is
// treated as UNLOCKED. We never lock content without a working way to pay.
// Gate logic lives in proAccess.ts.
//
// What Pro buys: unlimited students. The first student is completely free —
// every feature included (schedule, lessons, invoices, PDF, reminders). The
// gate only appears when adding a second active student. Export is never
// gated (core record-keeping house rule).
//
// SETUP (Simon): after creating the RevenueCat "Lesson Ledger" project, paste
// the PUBLIC SDK keys below. Then open the RC Entitlements page and confirm
// ENTITLEMENT_ID matches EXACTLY what the wizard created — identifiers are
// IMMUTABLE (the Billowe capital-`P` trap: the wizard auto-created `Pro`, not
// `pro`). Whatever it created, this constant must equal it
// character-for-character. Both subscription products go in ONE offering with
// monthly + annual packages.

// Public SDK keys (safe to ship in the app bundle — these are NOT secret).
export const RC_API_KEY_IOS = 'appl_ThAQWUVpUYHOmSxaJHMKqvoVNUX'; // RC project ec6e7f51
export const RC_API_KEY_ANDROID = 'REPLACE_WITH_RC_ANDROID_KEY'; // starts with "goog_"

// The entitlement that grants Pro. CONFIRMED on the RC Entitlements page
// 2026-08-14 by Simon during setup: identifier is exactly `pro` (lowercase).
export const ENTITLEMENT_ID = 'pro';

// App Store Connect auto-renewable subscription product ids. Must match ASC
// exactly. Same subscription group so upgrades/crossgrades work.
export const PRODUCT_ID_MONTHLY = 'lessonledger_pro_monthly';
export const PRODUCT_ID_YEARLY = 'lessonledger_pro_yearly';

/** Active (non-archived) students before the Pro prompt. */
export const FREE_STUDENTS = 1;

const PLACEHOLDER_KEYS = new Set([
  'REPLACE_WITH_RC_IOS_KEY',
  'REPLACE_WITH_RC_ANDROID_KEY',
  '',
]);

export function keyForPlatform(os: 'ios' | 'android'): string {
  return os === 'ios' ? RC_API_KEY_IOS : RC_API_KEY_ANDROID;
}

export function isPlaceholderKey(key: string): boolean {
  return PLACEHOLDER_KEYS.has(key.trim());
}
