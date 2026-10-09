// src/moreApps.ts — the "More from Simon Shih" catalogue.
//
// This file is IDENTICAL in every repo in the fleet. Copy it across unchanged
// and edit only SELF and RELATED at the bottom. Keeping FLEET identical means a
// new app or a changed tagline is one find-and-replace, not sixteen edits.
//
// Pure data, no imports, so it costs nothing and cannot break a build.
//
// Only apps that are LIVE on the App Store belong in FLEET. Checked 2026-10-08
// against App Store Connect: Last Seen is REJECTED, and Diner's Diary, Perkful
// and Unbottl are still PREPARE_FOR_SUBMISSION, so all four are deliberately
// absent. Adding an unreleased app sends people to a dead page.
//
// Taglines are the App Store subtitles verbatim, so the row matches what the
// person sees when they arrive. NDT's is the subtitle shipping in 1.2.0.

export interface FleetApp {
  /** key used by SELF and RELATED */
  key: string;
  /** short display name, not always the full App Store name */
  name: string;
  /** one line, taken from the App Store subtitle */
  line: string;
  /** numeric App Store id, verified from App Store Connect 2026-10-08 */
  id: string;
}

export const FLEET: FleetApp[] = [
  { key: 'apiicp',     name: 'API Inspector Cert Prep', line: '510, 570 & 653 exam practice',  id: '6785875538' },
  { key: 'billowe',    name: 'Billowe',                 line: 'Estimates & payment tracking',  id: '6789495253' },
  { key: 'dayporter',  name: 'DayPorter',               line: 'CRM for cleaning companies',    id: '6797908723' },
  { key: 'deckiq',     name: 'DeckIQ',                  line: 'Flashcards for exam prep',      id: '6759276345' },
  { key: 'dreamfeed',  name: 'Dreamfeed',               line: 'Baby log. No subscription.',    id: '6791590021' },
  { key: 'dundue',     name: 'Dundue',                  line: 'Get invoices paid, politely',   id: '6794547872' },
  { key: 'hitchwell',  name: 'HitchWell',               line: 'Day-rate money and invoices',   id: '6790066819' },
  { key: 'inkwell',    name: 'Inkwell',                 line: 'Your diary. No subscription.',  id: '6794589862' },
  { key: 'lessonledger', name: 'Lesson Ledger',         line: 'Invoices for private tutors',   id: '6801600367' },
  { key: 'mise',       name: 'Mise',                    line: 'Production tools for directors', id: '6759731914' },
  { key: 'ndt',        name: 'NDT Cert Study',          line: 'ASNT & ISO 9712 exam practice', id: '6785204471' },
  { key: 'numbernine', name: 'Number Nine',             line: 'A shortwave horror novella',    id: '6796237101' },
  { key: 'ptt',        name: 'Paint the Town',          line: 'Date nights, planned by AI',    id: '6793091030' },
  { key: 'sceneready', name: 'SceneReady',              line: 'Actor toolkit & scene practice', id: '6759228019' },
  { key: 'tally',      name: 'Tally',                   line: 'Scan receipts, split by item',  id: '6793970030' },
  { key: 'bindery',    name: 'The Bindery: Unwriting',  line: 'A journal. No hints. Ever.',    id: '6797783492' },
  { key: 'ugcio',      name: 'UGCio',                   line: 'UGC portfolio & rate card',     id: '6759463970' },
];

export function storeUrl(app: FleetApp): string {
  return `https://apps.apple.com/app/id${app.id}`;
}

// ---------------------------------------------------------------------------
// PER-REPO SETTINGS. These two lines are the only thing that changes per app.
// ---------------------------------------------------------------------------

/** which app this build is, so it never advertises itself */
export const SELF = 'lessonledger';

/** Hand-picked neighbours, best first, chosen for audience overlap. */
export const RELATED: string[] = ['dundue', 'billowe', 'tally'];

/** Resolved rows to render. Silently drops a bad key and never includes SELF. */
export function relatedApps(limit = 3): FleetApp[] {
  const byKey = new Map(FLEET.map((a) => [a.key, a]));
  const out: FleetApp[] = [];
  for (const key of RELATED) {
    if (key === SELF) continue;
    const app = byKey.get(key);
    if (app && !out.includes(app)) out.push(app);
    if (out.length >= limit) break;
  }
  return out;
}
