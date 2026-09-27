import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { isPdfAttachment, pdfDisplayName } from '../src/services/pdf-attachment.ts';

const root = new URL('../', import.meta.url);
const read = (path) => readFileSync(new URL(path, root), 'utf8');
const file = (overrides) => ({ type: 'file', mimeType: null, originalName: null, storagePath: 'chits-attachments/files/abc123', ...overrides });

test('PDFs are detected by MIME type first, then by .pdf extension only when the MIME type is missing or generic', () => {
  assert.equal(isPdfAttachment(file({ mimeType: 'application/pdf', originalName: 'Scan' })), true);
  assert.equal(isPdfAttachment(file({ mimeType: 'Application/PDF; charset=binary' })), true);
  assert.equal(isPdfAttachment(file({ mimeType: 'application/x-pdf' })), true);
  assert.equal(isPdfAttachment(file({ originalName: 'Invoice.PDF' })), true);
  assert.equal(isPdfAttachment(file({ mimeType: 'application/octet-stream', originalName: 'report.pdf' })), true);
  assert.equal(isPdfAttachment(file({ storagePath: 'chits-attachments/files/lx3-k2.pdf' })), true);

  // A specific non-PDF MIME type wins over a misleading filename.
  assert.equal(isPdfAttachment(file({ mimeType: 'application/zip', originalName: 'bundle.pdf' })), false);
  assert.equal(isPdfAttachment(file({ mimeType: 'text/plain', originalName: 'notes.txt' })), false);
  assert.equal(isPdfAttachment(file({ originalName: 'pdf-notes.docx' })), false);
  // Media never opens in the PDF viewer.
  assert.equal(isPdfAttachment({ type: 'photo', mimeType: 'application/pdf', originalName: 'x.pdf', storagePath: 'a.pdf' }), false);
});

test('the viewer and exported copies always carry a .pdf filename', () => {
  assert.equal(pdfDisplayName({ originalName: 'Lease.pdf' }), 'Lease.pdf');
  assert.equal(pdfDisplayName({ originalName: 'Lease' }), 'Lease.pdf');
  assert.equal(pdfDisplayName({ originalName: '  ' }), 'Document.pdf');
  assert.equal(pdfDisplayName({ originalName: null }), 'Document.pdf');
});

test('PDF tiles open the shared in-app viewer while other files keep the share flow', () => {
  const row = read('src/components/chat/message-row.native.tsx');
  assert.match(row, /const pdf = isPdfAttachment\(attachment\)/);
  assert.match(row, /if \(pdf\) return <>[\s\S]*?onPress=\{\(\) => setViewerOpen\(true\)\}[\s\S]*?<PdfViewer attachment=\{attachment\}/);
  assert.match(row, /const open = async \(\) => \{[\s\S]*?Sharing\.shareAsync\(uri/);
});

test('PDF viewer shows the required error copy and recovery actions', () => {
  const viewer = read('src/components/pdf/pdf-viewer.native.tsx');
  assert.match(viewer, /Unable to preview this PDF\./);
  assert.match(viewer, />Try Again</);
  assert.match(viewer, />Open in Another App</);
  assert.match(viewer, />Share</);
  assert.match(viewer, /onRequestClose=\{onDismiss\}/);
  assert.match(viewer, /console\.warn\('\[pdf-viewer\] unable to preview'/);
});

test('native PDF module is autolinked for both platforms and requests no storage permission', () => {
  const config = JSON.parse(read('modules/chits-attachments/expo-module.config.json'));
  assert.deepEqual(config.platforms, ['apple', 'android']);
  const manifest = read('modules/chits-attachments/android/src/main/AndroidManifest.xml');
  assert.doesNotMatch(manifest, /uses-permission/);
});
