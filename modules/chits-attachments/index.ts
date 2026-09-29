import { requireNativeModule, requireNativeView } from 'expo';
import type { ComponentType } from 'react';
import type { NativeSyntheticEvent, ViewProps } from 'react-native';

export type PdfLoadCompleteEvent = { pageCount: number };
export type PdfPageChangedEvent = { page: number; pageCount: number };
export type PdfErrorCode = 'invalid_uri' | 'missing' | 'permission' | 'corrupt' | 'locked' | 'empty' | 'unknown';
export type PdfErrorEvent = { code: PdfErrorCode; message: string };

export type ChitsPdfViewProps = ViewProps & {
  /** Local file:// URI (or an Android content:// URI) of the PDF. */
  source: string;
  /** Hex color shown around and between pages. */
  canvasColor?: string;
  onLoadComplete?: (event: NativeSyntheticEvent<PdfLoadCompleteEvent>) => void;
  onPageChanged?: (event: NativeSyntheticEvent<PdfPageChangedEvent>) => void;
  onError?: (event: NativeSyntheticEvent<PdfErrorEvent>) => void;
};

/** Native PDF renderer: PDFKit on iOS, PdfRenderer on Android. */
export const ChitsPdfView: ComponentType<ChitsPdfViewProps> = requireNativeView('ChitsPdf');

export type NativeExportResult = { status: 'saved'; uri?: string; location?: string; fileName?: string } | { status: 'cancelled' };

type ChitsFilesNativeModule = {
  /** Reads in bounded native chunks, including large videos; no file bytes enter JS. */
  hashFileAsync(uri: string): Promise<string>;
  /** Atomically replaces a small recovery journal without a delete/rename gap. */
  atomicWriteFileAsync(uri: string, contents: string): Promise<void>;
  /** Hard-links (or copies, if linking fails) the file into a cache folder under `fileName`, returning its file:// URI. */
  prepareNamedFileAsync(uri: string, fileName: string): Promise<string>;
  /** iOS: file:// URI, presents "Open in…". Android: content:// URI, presents an app chooser. Resolves false when no app can open it. */
  openWithAsync(uri: string, mimeType: string | null): Promise<boolean>;
  /**
   * Presents the system "save a copy" UI (iOS Files export sheet / Android Storage Access
   * Framework) and copies the original bytes there. Rejects with codes ERR_FILE_MISSING,
   * ERR_EXPORT_NO_SPACE, ERR_EXPORT_PERMISSION, ERR_EXPORT_IN_PROGRESS or ERR_EXPORT_FAILED.
   */
  exportAsync(uri: string, fileName: string, mimeType: string | null): Promise<NativeExportResult>;
  /** Android 10+: one-tap copy into the public Download/Chits folder (MediaStore; no permission). Rejects with ERR_UNSUPPORTED below Android 10. */
  saveToDownloadsAsync(uri: string, fileName: string, mimeType: string | null): Promise<NativeExportResult>;
  /** iOS: one-tap copy of a photo or video into the Photos library (add-only access). Rejects with ERR_EXPORT_PERMISSION if access is refused. */
  saveToPhotosAsync(uri: string, fileName: string, kind: 'photo' | 'video'): Promise<NativeExportResult>;
};

export const ChitsFiles = requireNativeModule<ChitsFilesNativeModule>('ChitsFiles');
