// src/backup.ts
// Native side of backup. Export: write JSON to cache, open share sheet.
// Import: document picker -> read -> parseBackup (caller confirms and applies).
// Legacy file-system imports per house convention.

import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import * as DocumentPicker from 'expo-document-picker';
import { getAllForBackup } from './db';
import { BackupV1, parseBackup, serializeBackup } from './backupFormat';

const fileName = (nowMs: number): string => {
  const d = new Date(nowMs);
  const p = (n: number) => n.toString().padStart(2, '0');
  return `lessonledger-backup-${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}.json`;
};

/** Writes the backup and opens the share sheet. Throws on failure. */
export async function exportBackup(): Promise<void> {
  const now = Date.now();
  const json = serializeBackup(getAllForBackup(), now);
  const uri = `${FileSystem.cacheDirectory}${fileName(now)}`;
  await FileSystem.writeAsStringAsync(uri, json);
  if (!(await Sharing.isAvailableAsync())) {
    throw new Error('Sharing is not available on this device.');
  }
  await Sharing.shareAsync(uri, {
    mimeType: 'application/json',
    dialogTitle: 'Export Lesson Ledger backup',
  });
}

/** Picks a backup file and parses it. Returns null if the user cancelled.
 *  Throws with a readable message if the file is invalid. */
export async function pickBackup(): Promise<BackupV1 | null> {
  const res = await DocumentPicker.getDocumentAsync({
    type: ['application/json', 'text/plain', '*/*'],
    copyToCacheDirectory: true,
  });
  if (res.canceled || !res.assets?.length) return null;
  const json = await FileSystem.readAsStringAsync(res.assets[0].uri);
  return parseBackup(json);
}
