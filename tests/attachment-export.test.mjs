import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { exportFeedback, exportFileName, exportMimeType, failureCodeFromNative } from '../src/services/attachment-export-naming.ts';

const root = new URL('../', import.meta.url);
const read = (path) => readFileSync(new URL(path, root), 'utf8');
const at = new Date(2026, 8, 27, 16, 3, 12).getTime();
const item = (overrides) => ({ type: 'file', storagePath: 'chits-attachments/files/lx3-k2.pdf', originalName: null, mimeType: null, createdAt: at, ...overrides });

test('export keeps the original filename, including spaces and renamed files', () => {
  assert.equal(exportFileName(item({ originalName: 'Invoice.pdf' })), 'Invoice.pdf');
  assert.equal(exportFileName(item({ originalName: 'Q3 Board Report (final).pdf' })), 'Q3 Board Report (final).pdf');
  assert.equal(exportFileName(item({ originalName: 'Voice note.m4a', type: 'audio', storagePath: 'chits-attachments/audio/abc.m4a' })), 'Voice note.m4a');
  assert.equal(exportFileName(item({ originalName: 'notes', storagePath: 'chits-attachments/files/abc.txt' })), 'notes.txt');
  assert.equal(exportFileName(item({ originalName: 'a/b:c.pdf' })), 'a-b-c.pdf');
});

test('the extension always matches the stored bytes (photos are stored as JPEG)', () => {
  assert.equal(exportFileName(item({ type: 'photo', originalName: 'IMG_1234.HEIC', mimeType: 'image/jpeg', storagePath: 'chits-attachments/chat/abc.jpg' })), 'IMG_1234.jpg');
  assert.equal(exportFileName(item({ type: 'video', originalName: 'clip.MOV', storagePath: 'chits-attachments/chat/abc.mov' })), 'clip.mov');
});

test('attachments without a name get a descriptive, timestamped one', () => {
  assert.equal(exportFileName(item({ type: 'photo', storagePath: 'chits-attachments/chat/abc.jpg' })), 'Photo 2026-09-27 16.03.12.jpg');
  assert.equal(exportFileName(item({ type: 'video', storagePath: 'chits-attachments/chat/abc.mp4' })), 'Video 2026-09-27 16.03.12.mp4');
  assert.equal(exportFileName(item({ type: 'audio', storagePath: 'chits-attachments/audio/abc', mimeType: 'audio/m4a' })), 'Voice note 2026-09-27 16.03.12.m4a');
  assert.equal(exportFileName(item({ storagePath: 'chits-attachments/files/abc', mimeType: 'application/octet-stream' })), 'Attachment 2026-09-27 16.03.12');
});

test('MIME types are specific and normalized, with octet-stream only as a last resort', () => {
  assert.equal(exportMimeType({ type: 'file', mimeType: 'application/pdf' }, 'Invoice.pdf'), 'application/pdf');
  assert.equal(exportMimeType({ type: 'photo', mimeType: 'image/heic' }, 'IMG_1234.jpg'), 'image/jpeg');
  assert.equal(exportMimeType({ type: 'photo', mimeType: 'image/png' }, 'shot.png'), 'image/png');
  assert.equal(exportMimeType({ type: 'video', mimeType: null }, 'clip.mp4'), 'video/mp4');
  assert.equal(exportMimeType({ type: 'audio', mimeType: 'audio/m4a' }, 'Voice note.m4a'), 'audio/mp4');
  assert.equal(exportMimeType({ type: 'file', mimeType: 'application/octet-stream' }, 'Budget.xlsx'), 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  assert.equal(exportMimeType({ type: 'file', mimeType: 'Text/Plain; charset=utf-8' }, 'a.txt'), 'text/plain');
  assert.equal(exportMimeType({ type: 'file', mimeType: null }, 'mystery.xyz'), 'application/octet-stream');
});

test('feedback: success is explicit, cancel is silent, failures are friendly', () => {
  assert.equal(exportFeedback({ status: 'saved' }), 'File saved successfully');
  assert.equal(exportFeedback({ status: 'cancelled' }), null);
  assert.equal(exportFeedback({ status: 'failed', code: 'failed' }), 'Unable to save this file. Please try again.');
  assert.equal(exportFeedback({ status: 'failed', code: 'missing' }), 'This file is no longer on this device.');
  assert.equal(failureCodeFromNative('ERR_EXPORT_NO_SPACE'), 'no_space');
  assert.equal(failureCodeFromNative('something else'), 'failed');
});

test('every entry point uses the one shared export path', () => {
  const uses = ['src/app/(tabs)/attachments.native.tsx', 'src/app/card/[id].native.tsx', 'src/app/(tabs)/chat.native.tsx', 'src/components/pdf/pdf-viewer.native.tsx', 'src/components/chat/message-row.native.tsx'];
  for (const path of uses) assert.match(read(path), /useAttachmentExport\(\)/, path);
  const service = read('src/services/attachment-export.native.ts');
  assert.match(service, /const mimeType = exportMimeType\(attachment, fileName\);/);
  assert.match(service, /ChitsFiles\.saveToDownloadsAsync\(uri, fileName, mimeType\)/);
  assert.match(service, /ChitsFiles\.saveToPhotosAsync\(uri, fileName,/);
  assert.match(service, /ChitsFiles\.exportAsync\(uri, fileName, mimeType\)/);
  assert.doesNotMatch(service, /copyAsync|moveAsync|deleteAsync/);
});

test('native export uses the system pickers with copy semantics and no storage permission', () => {
  const ios = read('modules/chits-attachments/ios/ChitsFilesModule.swift');
  assert.match(ios, /UIDocumentPickerViewController\(forExporting: \[named\], asCopy: true\)/);
  const android = read('modules/chits-attachments/android/src/main/java/expo/modules/chitsattachments/ChitsFilesModule.kt');
  assert.match(android, /Intent\.ACTION_CREATE_DOCUMENT/);
  assert.match(android, /DocumentsContract\.deleteDocument\(resolver, destination\)/);
  assert.doesNotMatch(read('modules/chits-attachments/android/src/main/AndroidManifest.xml'), /uses-permission/);
});

test('Download saves straight to the device where the platform allows it', async () => {
  const { downloadMethod, downloadActionLabel, exportFeedback: feedback } = await import('../src/services/attachment-export-naming.ts');
  // Android 10+ → public Downloads/Chits; older Android → the "Save as" picker (no storage permission).
  assert.equal(downloadMethod('android', 36, 'file'), 'downloads');
  assert.equal(downloadMethod('android', 29, 'photo'), 'downloads');
  assert.equal(downloadMethod('android', 28, 'photo'), 'picker');
  // iOS photos/videos → Photos app; everything else → Files sheet (no shared Downloads folder on iOS).
  assert.equal(downloadMethod('ios', '18.0', 'photo'), 'photos');
  assert.equal(downloadMethod('ios', '18.0', 'video'), 'photos');
  assert.equal(downloadMethod('ios', '18.0', 'file'), 'picker');
  assert.equal(downloadMethod('ios', '18.0', 'audio'), 'picker');
  assert.equal(downloadActionLabel('android', 'photo'), 'Download');
  assert.equal(downloadActionLabel('ios', 'video'), 'Save to Photos');
  assert.equal(downloadActionLabel('ios', 'file'), 'Save to Files');
  assert.equal(feedback({ status: 'saved', destination: 'downloads' }), 'Saved to Downloads/Chits');
  assert.equal(feedback({ status: 'saved', destination: 'photos' }), 'Saved to Photos');
  assert.equal(feedback({ status: 'saved', destination: 'chosen' }), 'File saved successfully');
  // A blocked Photos permission gets the explicit Settings prompt, not a toast.
  assert.equal(feedback({ status: 'failed', code: 'permission' }), null);

  const android = read('modules/chits-attachments/android/src/main/java/expo/modules/chitsattachments/ChitsFilesModule.kt');
  assert.match(android, /MediaStore\.Downloads\.EXTERNAL_CONTENT_URI/);
  assert.match(android, /saveToMediaStore\(uri, fileName, mimeType, MediaStore\.Downloads\.EXTERNAL_CONTENT_URI, Environment\.DIRECTORY_DOWNLOADS\)/);
  // Generated images (Share Note) go to Pictures/Chits, so they show in the gallery.
  assert.match(android, /saveToMediaStore\(uri, fileName, mimeType, MediaStore\.Images\.Media\.EXTERNAL_CONTENT_URI, Environment\.DIRECTORY_PICTURES\)/);
  assert.match(android, /RELATIVE_PATH, "\$directory\/Chits"/);
  assert.match(android, /IS_PENDING, 1/);
  const ios = read('modules/chits-attachments/ios/ChitsFilesModule.swift');
  assert.match(ios, /PHPhotoLibrary\.requestAuthorization\(for: \.addOnly\)/);
  const app = JSON.parse(read('app.json'));
  assert.ok(app.expo.ios.infoPlist.NSPhotoLibraryAddUsageDescription);
});
