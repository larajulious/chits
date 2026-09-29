import assert from 'node:assert/strict';
import test from 'node:test';

import {
  availableShareNoteModes, buildShareNoteSource, defaultShareNoteMode, fitShareNoteText, initialShareNoteImages, MAX_SHARE_NOTE_IMAGES,
  SHARE_NOTE_COPY, SHARE_NOTE_FORMATS, shareNoteAvailability, shareNoteFileName, shareNoteLayout, toggleShareNoteImage,
} from '../src/services/share-note.ts';
import { SHARE_NOTE_FONT_METRICS, SHARE_NOTE_THEMES, getShareNoteTheme } from '../src/constants/share-note-themes.ts';

const photo = (id) => ({ id, type: 'photo', storagePath: `attachments/${id}.jpg`, width: 1200, height: 900 });
const file = (id, type = 'file') => ({ id, type, storagePath: `attachments/${id}.bin`, width: null, height: null });

test('a thought or card maps to its text and photos only', () => {
  const source = buildShareNoteSource({
    title: 'Trip ideas',
    messages: [{ text: '  Lisbon in May ', attachments: [photo('a'), file('voice', 'audio')] }, { text: null, attachments: [photo('b')] }, { text: 'Book trams', attachments: [] }],
    cardAttachments: [file('pdf'), photo('c'), file('clip', 'video')],
  });
  assert.equal(source.text, 'Lisbon in May\n\nBook trams');
  assert.equal(source.title, 'Trip ideas');
  assert.deepEqual(source.images.map((image) => image.id), ['a', 'b', 'c']);
  assert.deepEqual(Object.keys(source.images[0]).sort(), ['height', 'id', 'storagePath', 'width']);
  assert.equal(source.unsupportedCount, 3);
});

test('a title that only repeats the note’s first words is dropped', () => {
  assert.equal(buildShareNoteSource({ title: 'Lisbon in May', messages: [{ text: 'Lisbon in May and June', attachments: [] }] }).title, null);
  assert.equal(buildShareNoteSource({ title: '  ', messages: [{ text: 'Hi', attachments: [] }] }).title, null);
});

test('notes with nothing drawable explain why instead of opening an empty composer', () => {
  assert.deepEqual(shareNoteAvailability(buildShareNoteSource({ messages: [{ text: '  ', attachments: [] }] })), { ok: false, reason: 'empty', message: SHARE_NOTE_COPY.empty });
  assert.deepEqual(shareNoteAvailability(buildShareNoteSource({ messages: [{ text: null, attachments: [file('pdf'), file('memo', 'audio')] }] })), { ok: false, reason: 'unsupported', message: SHARE_NOTE_COPY.unsupported });
  assert.deepEqual(shareNoteAvailability(buildShareNoteSource({ messages: [{ text: null, attachments: [photo('a')] }] })), { ok: true });
});

test('content modes follow what the note actually has', () => {
  const textOnly = buildShareNoteSource({ messages: [{ text: 'Hello', attachments: [] }] });
  assert.deepEqual(availableShareNoteModes(textOnly), { text: true, 'text-image': false, image: false });
  assert.equal(defaultShareNoteMode(textOnly), 'text');
  const imageOnly = buildShareNoteSource({ messages: [{ text: null, attachments: [photo('a')] }] });
  assert.deepEqual(availableShareNoteModes(imageOnly), { text: false, 'text-image': false, image: true });
  assert.equal(defaultShareNoteMode(imageOnly), 'image');
  const both = buildShareNoteSource({ messages: [{ text: 'Hi', attachments: [photo('a')] }] });
  assert.equal(defaultShareNoteMode(both), 'text-image');
});

test('at most two images are ever selected', () => {
  const source = buildShareNoteSource({ messages: [{ text: null, attachments: ['a', 'b', 'c', 'd'].map(photo) }] });
  let selected = initialShareNoteImages(source);
  assert.deepEqual(selected, ['a', 'b']);
  assert.equal(MAX_SHARE_NOTE_IMAGES, 2);
  const refused = toggleShareNoteImage(selected, 'c');
  assert.deepEqual(refused, { selected: ['a', 'b'], limited: true });
  selected = toggleShareNoteImage(selected, 'a').selected;
  assert.deepEqual(selected, ['b']);
  assert.deepEqual(toggleShareNoteImage(selected, 'd'), { selected: ['b', 'd'], limited: false });
});

const within = (rect, bounds, label) => {
  assert.ok(rect.top >= -0.001 && rect.top + rect.height <= bounds.height + 0.001, `${label} fits vertically`);
  if ('left' in rect) assert.ok(rect.left >= -0.001 && rect.left + rect.width <= bounds.width + 0.001, `${label} fits horizontally`);
};

test('every layout keeps photos, text and footer inside the card without overlapping', () => {
  for (const format of Object.keys(SHARE_NOTE_FORMATS)) {
    for (const mode of ['text', 'text-image', 'image']) {
      for (const imageCount of [0, 1, 2, 3]) {
        for (const hasTitle of [false, true]) {
          for (const showBranding of [false, true]) {
            const label = JSON.stringify({ format, mode, imageCount, hasTitle, showBranding });
            const layout = shareNoteLayout({ format, mode, imageCount, hasTitle, showMark: true, showBranding });
            const { canvas, card, content } = layout;
            assert.equal(canvas.width, 360);
            assert.equal(Math.round(canvas.height / canvas.width * 1000), Math.round(SHARE_NOTE_FORMATS[format].height / SHARE_NOTE_FORMATS[format].width * 1000), label);
            assert.ok(card.left + card.width <= canvas.width && card.top + card.height <= canvas.height, label);
            assert.equal(layout.images.length, mode === 'text' ? 0 : Math.min(imageCount, 2), label);
            layout.images.forEach((image, index) => {
              within(image, { width: content.width, height: layout.bodyHeight }, `${label} image ${index}`);
              assert.ok(image.width > 40 && image.height > 40, `${label} image ${index} is a usable size`);
            });
            if (layout.images.length === 2) {
              const [a, b] = layout.images;
              assert.ok(a.left + a.width <= b.left || a.top + a.height <= b.top, `${label} photos don't overlap`);
            }
            if (mode === 'image') { assert.equal(layout.text, null, label); continue; }
            within(layout.text, { width: content.width, height: layout.bodyHeight }, `${label} text`);
            within(layout.textBlock, { height: layout.bodyHeight }, `${label} text block`);
            for (const image of layout.images) assert.ok(image.top + image.height <= layout.textBlock.top, `${label} text sits below the photos`);
            assert.ok(layout.text.height >= 60, `${label} leaves room for text`);
            if (layout.footer) assert.ok(layout.footer.top >= layout.bodyHeight && layout.footer.top + layout.footer.height <= content.height, `${label} footer`);
          }
        }
      }
    }
  }
});

const metrics = SHARE_NOTE_FONT_METRICS.casual;

test('short notes get large type and longer notes step down', () => {
  const layout = shareNoteLayout({ format: 'portrait', mode: 'text', imageCount: 0, hasTitle: false, showMark: true, showBranding: true });
  const short = fitShareNoteText('Be kind today.', layout.text, { mode: 'text', format: 'portrait', metrics });
  const medium = fitShareNoteText('Remember to call Mum on Sunday and ask about the garden. She wanted help picking seeds for spring, and the shop closes early.', layout.text, { mode: 'text', format: 'portrait', metrics });
  assert.equal(short.fontSize, 36);
  assert.ok(medium.fontSize < short.fontSize && medium.fontSize >= 14);
  assert.equal(short.truncated, false);
  assert.equal(medium.truncated, false);
});

test('text never overflows its box, and too-long notes are clamped with a warning', () => {
  const long = 'All work and no play makes a very long note. '.repeat(80);
  for (const format of Object.keys(SHARE_NOTE_FORMATS)) {
    for (const mode of ['text', 'text-image']) {
      const layout = shareNoteLayout({ format, mode, imageCount: 2, hasTitle: true, showMark: true, showBranding: true });
      for (const [style, fontMetrics] of Object.entries(SHARE_NOTE_FONT_METRICS)) {
        for (const text of ['Hi', 'A few words to share with a friend.', long, 'line\n'.repeat(60)]) {
          const fit = fitShareNoteText(text, layout.text, { mode, format, metrics: fontMetrics });
          assert.ok(fit.maxLines * fit.lineHeight <= layout.text.height, `${format} ${mode} ${style}: clamped lines fit the box`);
          assert.ok(fit.fontSize >= 13, 'stays readable');
        }
        assert.equal(fitShareNoteText(long, layout.text, { mode, format, metrics: fontMetrics }).truncated, true);
      }
    }
  }
});

const lum = (hex) => {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const contrast = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((m, n) => n - m); return (x + 0.05) / (y + 0.05); };

test('the ten requested themes (and extras) exist and keep text readable', () => {
  const names = SHARE_NOTE_THEMES.map((theme) => theme.name);
  for (const required of ['Corporate', 'Casual', 'Love', 'Friends', 'Boss', 'Stranger', 'Motivation', 'Calm', 'Creative', 'Cute']) assert.ok(names.includes(required), required);
  assert.ok(SHARE_NOTE_THEMES.length >= 10);
  assert.equal(new Set(SHARE_NOTE_THEMES.map((theme) => theme.id)).size, SHARE_NOTE_THEMES.length);
  for (const theme of SHARE_NOTE_THEMES) {
    for (const [key, value] of Object.entries(theme.colors)) assert.match(value, /^#[0-9A-F]{6}$/i, `${theme.id} ${key}`);
    assert.ok(contrast(theme.colors.textPrimary, theme.colors.surface) >= 7, `${theme.id} body text`);
    assert.ok(contrast(theme.colors.textSecondary, theme.colors.surface) >= 4.5, `${theme.id} footer text`);
    assert.ok(contrast(theme.colors.accent, theme.colors.surface) >= 3, `${theme.id} accent title and marks stay readable`);
    assert.ok(SHARE_NOTE_FONT_METRICS[theme.fontStyle], `${theme.id} font metrics`);
  }
  assert.equal(getShareNoteTheme('nope').id, SHARE_NOTE_THEMES[0].id);
});

test('exported files get a readable, sortable name', () => {
  assert.equal(shareNoteFileName(new Date(2026, 8, 29, 7, 5, 3), 'png'), 'Chits Note 2026-09-29 07.05.03.png');
});
