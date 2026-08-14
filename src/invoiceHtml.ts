// src/invoiceHtml.ts
// Pure module (no expo imports): the invoice PDF's HTML, rendered by
// expo-print on a WKWebView. Node-testable. Hard-won WKWebView facts from
// Mise: keep it black-on-white and self-contained (no external assets), and
// don't rely on table headers repeating across page breaks — WKWebView
// doesn't repeat them (Chrome does), so a tutoring invoice stays fine as one
// flowing table that almost never exceeds a page.

import {
  formatDayLong,
  formatDuration,
  formatMoney,
} from './models';

export interface InvoiceLine {
  startMs: number;
  durationMin: number;
  amountCents: number;
  notes: string;
}

export interface InvoiceHtmlContext {
  invoiceNumber: string; // '' hides the number line
  issuedMs: number;
  dueMs: number;
  studentName: string;
  payerName: string; // '' collapses to just the student
  yourName: string;
  businessName: string;
  currencySymbol: string;
  lines: InvoiceLine[]; // chronological
  notes: string; // free text under the table, '' hides it
  paymentInstructions: string; // "Zelle: …" — the how-to-pay block, '' hides it
}

const esc = (s: string): string =>
  s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

export const invoiceTotalCents = (lines: { amountCents: number }[]): number =>
  lines.reduce((sum, l) => sum + l.amountCents, 0);

export function renderInvoiceHtml(ctx: InvoiceHtmlContext): string {
  const sym = ctx.currencySymbol;
  const from = [ctx.yourName.trim(), ctx.businessName.trim()].filter(Boolean);
  const billTo = [ctx.payerName.trim(), `for ${ctx.studentName.trim()}'s lessons`]
    .filter((s) => s && s !== "for 's lessons")
    .map(esc);
  if (!ctx.payerName.trim()) billTo.splice(0, billTo.length, esc(ctx.studentName.trim()));

  const rows = ctx.lines
    .map(
      (l) => `
      <tr>
        <td>${esc(formatDayLong(l.startMs))}</td>
        <td>Lesson${l.notes.trim() ? ` — ${esc(l.notes.trim())}` : ''}</td>
        <td class="num">${esc(formatDuration(l.durationMin))}</td>
        <td class="num">${esc(formatMoney(l.amountCents, sym))}</td>
      </tr>`,
    )
    .join('');

  const total = formatMoney(invoiceTotalCents(ctx.lines), sym);

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<style>
  body {
    font-family: -apple-system, 'Helvetica Neue', Helvetica, Arial, sans-serif;
    color: #111; margin: 48px; font-size: 13px; line-height: 1.45;
  }
  .head { display: flex; justify-content: space-between; align-items: flex-start; }
  .brand { font-size: 20px; font-weight: 700; }
  .brand .biz { font-size: 13px; font-weight: 400; color: #444; margin-top: 2px; }
  .doc { text-align: right; }
  .doc .kind { font-size: 24px; font-weight: 700; letter-spacing: 1px; }
  .doc .meta { color: #444; margin-top: 4px; }
  .billto { margin-top: 36px; }
  .label { font-size: 10px; text-transform: uppercase; letter-spacing: 1px; color: #777; }
  .billto .who { margin-top: 3px; font-size: 14px; }
  table { width: 100%; border-collapse: collapse; margin-top: 28px; }
  th { text-align: left; font-size: 10px; text-transform: uppercase;
       letter-spacing: 1px; color: #777; padding: 0 8px 6px 0;
       border-bottom: 1.5px solid #111; }
  td { padding: 8px 8px 8px 0; border-bottom: 1px solid #ddd; vertical-align: top; }
  .num, th.num { text-align: right; white-space: nowrap; }
  .totalrow td { border-bottom: none; padding-top: 14px; font-weight: 700; font-size: 15px; }
  .due { margin-top: 26px; font-size: 14px; }
  .due strong { font-size: 15px; }
  .notes { margin-top: 26px; color: #444; white-space: pre-wrap; }
  .paysec { margin-top: 26px; }
  .payhow { margin-top: 4px; color: #111; }
  .thanks { margin-top: 40px; color: #444; }
</style>
</head>
<body>
  <div class="head">
    <div class="brand">
      ${esc(from[0] ?? 'Invoice')}
      ${from[1] ? `<div class="biz">${esc(from[1])}</div>` : ''}
    </div>
    <div class="doc">
      <div class="kind">INVOICE</div>
      <div class="meta">
        ${ctx.invoiceNumber.trim() ? `No. ${esc(ctx.invoiceNumber.trim())}<br>` : ''}
        Issued ${esc(formatDayLong(ctx.issuedMs))}
      </div>
    </div>
  </div>

  <div class="billto">
    <div class="label">Billed to</div>
    <div class="who">${billTo.join('<br>')}</div>
  </div>

  <table>
    <tr>
      <th>Date</th><th>Description</th><th class="num">Duration</th><th class="num">Amount</th>
    </tr>
    ${rows}
    <tr class="totalrow">
      <td colspan="3">Total due</td>
      <td class="num">${esc(total)}</td>
    </tr>
  </table>

  <div class="due">Payment due <strong>${esc(formatDayLong(ctx.dueMs))}</strong></div>
  ${
    ctx.paymentInstructions.trim()
      ? `<div class="paysec"><div class="label">How to pay</div><div class="notes payhow">${esc(ctx.paymentInstructions.trim())}</div></div>`
      : ''
  }
  ${ctx.notes.trim() ? `<div class="notes">${esc(ctx.notes.trim())}</div>` : ''}
  <div class="thanks">Thank you!</div>
</body>
</html>`;
}
