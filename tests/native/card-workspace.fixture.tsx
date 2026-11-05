// Temporarily mount at src/app/card-workspace-qa.tsx and open with ?id=workspace-qa.
// Notes use disposable SQLite files in the card-workspace-qa cache directory.
// Exclusive transactions require a file shared by their separate connections.
// Only disposable QA media is written to Documents. Remove both after QA.
// Do not use this fixture to test routes outside Card Details: they use the app DB.
import { useCallback, useEffect, useState } from 'react';
import { Appearance } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { SQLiteProvider, type SQLiteDatabase } from 'expo-sqlite';
import { Asset } from 'expo-asset';
import * as FileSystem from 'expo-file-system/legacy';
import CardDetailScreen from '@/app/card/[id].native';
import { ThemeProvider, useTheme } from '@/components/theme-provider';
import { migrateDatabase } from '@/db/migrations';
import { serializeNoteContent, noteBlocksText, type NoteBlock } from '@/services/note-content';

export default function CardWorkspaceQA() {
  const { mode = 'light', accent = 'logo', style = 'classic', empty, hidden, long } = useLocalSearchParams<{ mode?: string; accent?: string; style?: string; empty?: string; hidden?: string; long?: string }>();
  const { appearance } = useTheme();
  const [session] = useState(() => Date.now());
  useEffect(() => () => Appearance.setColorScheme(appearance === 'system' ? 'unspecified' : appearance), [appearance]);
  const init = useCallback(async (db: SQLiteDatabase) => {
    await migrateDatabase(db);
    const now = Date.now();
    for (const [key, value] of [['app_appearance', mode], ['chat_color_theme', accent], ['app_style', style]]) await db.runAsync('INSERT OR REPLACE INTO app_settings VALUES (?, ?, ?)', key, value, now);
    await db.runAsync('INSERT INTO boards (id,name,accent,created_at,updated_at) VALUES (?,?,?,?,?)', 'workspace-board-qa', 'Little everyday things', null, now, now);
    await db.runAsync('INSERT INTO board_columns (id,board_id,name,position,created_at,updated_at) VALUES (?,?,?,0,?,?)', 'workspace-column-qa', 'workspace-board-qa', 'In progress', now, now);
    await db.runAsync('INSERT INTO cards (id,board_id,column_id,title,position,created_at,updated_at) VALUES (?,?,?,?,0,?,?)', 'workspace-qa', 'workspace-board-qa', 'workspace-column-qa', long ? 'A small weekend workspace, with room for all the little things that make a home feel like our own' : 'A little room to create', now - 86400000, now);
    if (empty) return;
    const asset = await Asset.fromModule(require('@/assets/images/default_header_mascot.webp')).downloadAsync();
    const image = FileSystem.documentDirectory + 'card-workspace-qa.webp';
    if (!(await FileSystem.getInfoAsync(image)).exists) await FileSystem.copyAsync({ from: asset.localUri ?? asset.uri, to: image });
    const pdf = FileSystem.documentDirectory + 'card-workspace-qa.pdf';
    await FileSystem.writeAsStringAsync(pdf, '%PDF-1.1\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Count 0/Kids[]>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF');
    const blocks: NoteBlock[] = [
      { type: 'text', text: 'A quiet corner for sketches, little ideas, and a cup of tea. Keep it simple and leave some space for whatever comes next.' },
      { type: 'text', text: 'Clear the desk by the window', list: { kind: 'bullet', id: 'ideas' } },
      { type: 'text', text: 'Find a home for the sketchbooks', list: { kind: 'bullet', id: 'ideas' } },
      { type: 'text', text: 'Bring a little green inside', list: { kind: 'checklist', id: 'plant', checked: true } },
      { type: 'image', attachmentId: 'workspace-photo-qa' },
      { type: 'text', text: 'Inspiration for the weekend. The details can wait.' },
    ];
    await db.runAsync('INSERT INTO messages (id,text,type,content_json,is_hidden_content,created_at,updated_at) VALUES (?,?,?,?,?,?,?)', 'workspace-message-qa', noteBlocksText(blocks), 'text', serializeNoteContent(blocks), hidden ? 1 : 0, now - 86400000, now);
    await db.runAsync('INSERT INTO attachments (id,message_id,type,storage_path,original_name,width,height,created_at) VALUES (?,?,?,?,?,?,?,?)', 'workspace-photo-qa', 'workspace-message-qa', 'photo', 'card-workspace-qa.webp', 'Weekend inspiration.webp', 1200, 800, now);
    await db.runAsync('INSERT INTO card_messages VALUES (?,?,0)', 'workspace-qa', 'workspace-message-qa');
    for (const [i,title] of ['Make a little space', 'Gather the sketchbooks'].entries()) await db.runAsync('INSERT INTO card_subtasks (id,card_id,title,is_completed,position,created_at,updated_at) VALUES (?,?,?,?,?,?,?)', `workspace-subtask-${i}`, 'workspace-qa', title, i === 0 ? 1 : 0, i, now, now);
    await db.runAsync('INSERT INTO card_comments (id,card_id,text,created_at,updated_at) VALUES (?,?,?,?,?)', 'workspace-comment-qa', 'workspace-qa', 'The little lamp from the living room would fit here nicely.', now - 3600000, now - 3600000);
    await db.runAsync('INSERT INTO card_reminders (card_id,scheduled_at,created_at,updated_at) VALUES (?,?,?,?)', 'workspace-qa', now + 86400000, now, now);
    await db.runAsync('INSERT INTO messages (id,text,type,created_at,updated_at) VALUES (?,?,?,?,?)', 'workspace-related-qa', 'A few ideas for the reading nook', 'text', now, now);
    await db.runAsync('INSERT INTO note_relationships (note_a,note_b,created_at,updated_at) VALUES (?,?,?,?)', 'card:workspace-qa', 'thought:workspace-related-qa', now, now);
    await db.runAsync('INSERT INTO card_attachments (id,card_id,type,storage_path,original_name,mime_type,size,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?)', 'workspace-file-qa', 'workspace-qa', 'file', 'card-workspace-qa.pdf', 'Weekend workspace ideas and measurements.pdf', 'application/pdf', 128, now, now);
  }, [mode, accent, style, empty, hidden, long]);
  const variant = [mode,accent,style,empty,hidden,long].join('-');
  return <SQLiteProvider key={variant} directory={FileSystem.cacheDirectory + 'card-workspace-qa'} databaseName={`${session}-${variant}.db`} options={{ useNewConnection: true }} onInit={init}><ThemeProvider><CardDetailScreen /></ThemeProvider></SQLiteProvider>;
}
