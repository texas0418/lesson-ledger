// src/proAccess.ts
// Fail-open Pro gate for Lesson Ledger. Pro = unlimited students, via an
// auto-renewing subscription (monthly or yearly — the fleet's first).
// The first student is free with every feature; export is never gated.
//
// HOUSE RULE: if react-native-purchases is not in the running build (Expo Go,
// or a build without the native module) OR the RevenueCat key is still a
// placeholder, Pro is UNLOCKED. Never hide a feature behind a wall the user
// cannot pay through.

import { useEffect, useState } from 'react';
import { Platform } from 'react-native';
import {
  ENTITLEMENT_ID,
  PRODUCT_ID_MONTHLY,
  PRODUCT_ID_YEARLY,
  isPlaceholderKey,
  keyForPlatform,
} from './revenuecat';

export type ProTerm = 'monthly' | 'yearly';

type Listener = (pro: boolean) => void;

let pro = false;
let initialized = false;
let failOpen = false; // true once we decide RC can't gate (no native module / placeholder key)
const listeners = new Set<Listener>();

function setPro(next: boolean): void {
  if (next === pro) return;
  pro = next;
  listeners.forEach((l) => l(pro));
}

// Lazy, guarded access to the native SDK. Returns null when it isn't in this build.
function getPurchases(): any | null {
  try {
    // require (not a static import) so a missing native module can't crash module load.
    const mod = require('react-native-purchases');
    return mod?.default ?? mod ?? null;
  } catch {
    return null;
  }
}

function hasEntitlement(info: any): boolean {
  return !!info?.entitlements?.active?.[ENTITLEMENT_ID];
}

export function isProUnlocked(): boolean {
  return pro;
}

export function isFailOpen(): boolean {
  return failOpen;
}

export function subscribeProAccess(l: Listener): () => void {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
}

/** Configure RevenueCat once at app start. Safe to call unconditionally. */
export async function initPurchases(): Promise<void> {
  if (initialized) return;
  initialized = true;

  const os = Platform.OS === 'android' ? 'android' : 'ios';
  const apiKey = keyForPlatform(os);
  const Purchases = getPurchases();

  // Fail-open: no SDK in this build, or keys not configured yet.
  if (!Purchases || isPlaceholderKey(apiKey)) {
    failOpen = true;
    setPro(true);
    return;
  }

  try {
    Purchases.configure({ apiKey });
    Purchases.addCustomerInfoUpdateListener((info: any) => {
      setPro(hasEntitlement(info));
    });
    const info = await Purchases.getCustomerInfo();
    setPro(hasEntitlement(info));
  } catch (e) {
    // Configuration failed in a real build — fail open rather than trap the user.
    console.warn('RevenueCat init failed; unlocking Pro (fail-open):', e);
    failOpen = true;
    setPro(true);
  }
}

/** Subscribe (monthly or yearly). Resolves true if Pro is active afterwards.
 *  Throws on real errors; a user cancel surfaces as an error with `userCancelled`. */
export async function purchasePro(term: ProTerm): Promise<boolean> {
  const Purchases = getPurchases();
  if (!Purchases || failOpen) return true; // nothing to buy — already unlocked

  const wantedId = term === 'monthly' ? PRODUCT_ID_MONTHLY : PRODUCT_ID_YEARLY;
  const offerings = await Purchases.getOfferings();
  const pkgs = offerings?.current?.availablePackages ?? [];
  const pkg =
    pkgs.find((p: any) => p?.product?.identifier === wantedId) ??
    pkgs.find((p: any) =>
      term === 'monthly'
        ? p?.packageType === 'MONTHLY'
        : p?.packageType === 'ANNUAL',
    );
  if (!pkg)
    throw new Error('No subscriptions available right now. Please try again later.');

  const { customerInfo } = await Purchases.purchasePackage(pkg);
  const ok = hasEntitlement(customerInfo);
  setPro(ok);
  return ok;
}

/** Restore prior purchases (required for App Review). Resolves true if Pro is active. */
export async function restorePurchases(): Promise<boolean> {
  const Purchases = getPurchases();
  if (!Purchases || failOpen) return true;

  const info = await Purchases.restorePurchases();
  const ok = hasEntitlement(info);
  setPro(ok);
  return ok;
}

/** React hook: re-renders when Pro access changes. */
export function useProAccess(): boolean {
  const [value, setValue] = useState<boolean>(isProUnlocked());
  useEffect(() => subscribeProAccess(setValue), []);
  return value;
}
