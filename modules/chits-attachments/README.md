# chits-attachments

Local Expo module with two native modules used by Chits attachments. Everything works offline and requests no storage permission.

## `ChitsPdf` — in-app PDF viewer
- **iOS**: PDFKit `PDFView` (continuous vertical scroll, pinch-to-zoom, pan); PDFKit memory-maps the file.
- **Android**: platform `PdfRenderer` drawn by `PdfPagesView`; pages render on a background thread into a memory-bounded LRU cache, and the visible area re-renders at full resolution when zoomed.
- UI: `src/components/pdf/pdf-viewer.native.tsx`.

## `ChitsFiles` — file actions
- `exportAsync(uri, fileName, mimeType)` — saves a **copy** where the user chooses: iOS Files export sheet (`UIDocumentPickerViewController(forExporting:asCopy:)`), Android Storage Access Framework (`ACTION_CREATE_DOCUMENT`, bytes streamed natively; a failed copy deletes the partial file). Resolves `{ status: 'saved' | 'cancelled' }`; rejects with `ERR_FILE_MISSING`, `ERR_EXPORT_NO_SPACE`, `ERR_EXPORT_PERMISSION`, `ERR_EXPORT_IN_PROGRESS` or `ERR_EXPORT_FAILED`.
- `prepareNamedFileAsync(uri, fileName)` — zero-byte hard link under the original filename, so Share / Open with / Save show the real name.
- `openWithAsync(uri, mimeType)` — iOS "Open in…", Android app chooser (FileProvider content URI).
- App-facing API: `exportAttachment` / `shareAttachment` in `src/services/attachment-export.native.ts` and the `useAttachmentExport` hook.

## Rebuild required

Native code ships only in a new native build — an OTA/JS update will not include it. Autolinking picks the module up from `./modules`; no config plugin or `app.json` change is needed.

```sh
npx expo prebuild        # or: cd ios && pod install
npx expo run:ios / npx expo run:android   # or a new EAS build
```
