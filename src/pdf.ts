// src/pdf.ts
// Native side of the invoice PDF: render the pure HTML (invoiceHtml.ts)
// through expo-print, rename the temp file to a friendly name, and open the
// share sheet. Legacy file-system imports per house convention.

import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import { InvoiceHtmlContext, renderInvoiceHtml } from './invoiceHtml';

const fileName = (invoiceNumber: string, studentName: string): string => {
  const base = [invoiceNumber.trim() || 'invoice', studentName.trim()]
    .filter(Boolean)
    .join('-')
    .replace(/[^a-zA-Z0-9._-]+/g, '_');
  return `${base}.pdf`;
};

/** Renders the invoice PDF and opens the share sheet. Throws on failure. */
export async function shareInvoicePdf(ctx: InvoiceHtmlContext): Promise<void> {
  // require at call time so a build without the native module fails at the
  // button (with a readable alert), not at app launch.
  const Print = require('expo-print') as typeof import('expo-print');
  const { uri } = await Print.printToFileAsync({
    html: renderInvoiceHtml(ctx),
  });
  const dest = `${FileSystem.cacheDirectory}${fileName(ctx.invoiceNumber, ctx.studentName)}`;
  if (dest !== uri) {
    await FileSystem.moveAsync({ from: uri, to: dest });
  }
  if (!(await Sharing.isAvailableAsync())) {
    throw new Error('Sharing is not available on this device.');
  }
  await Sharing.shareAsync(dest, {
    mimeType: 'application/pdf',
    dialogTitle: 'Send invoice',
    UTI: 'com.adobe.pdf',
  });
}
