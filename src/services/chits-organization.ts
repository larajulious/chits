import type { Message } from '@/db/types';

export const ORGANIZATION_ENABLED_KEY = 'chitsOrganizationSuggestionsEnabled';
export const ORGANIZATION_STATE_KEY = 'chitsOrganizationState';
export const SUGGESTION_DELAY_MS = 950;
const KEYWORDS = /\b(remember|idea|meeting|project|prepare|review|send|buy|call|later|important|reference|plan|draft|client|design)\b/i;

export type OrganizationChoice = 'board' | 'space';
export type OrganizationState = {
  introSeen: boolean;
  relationshipExplained: boolean;
  dismissCount: number;
  suggestionShownCount: number;
  boardSuggestionAcceptedCount: number;
  spaceSuggestionAcceptedCount: number;
  lastInteraction: number;
  lastAcceptedSuggestionType: OrganizationChoice | null;
};

export const DEFAULT_ORGANIZATION_STATE: OrganizationState = {
  introSeen: false, relationshipExplained: false, dismissCount: 0,
  suggestionShownCount: 0, boardSuggestionAcceptedCount: 0, spaceSuggestionAcceptedCount: 0,
  lastInteraction: 0, lastAcceptedSuggestionType: null,
};

export function parseOrganizationState(value: string | undefined): OrganizationState {
  if (!value) return { ...DEFAULT_ORGANIZATION_STATE };
  try {
    const parsed = JSON.parse(value) as Partial<OrganizationState>;
    const state = { ...DEFAULT_ORGANIZATION_STATE };
    for (const key of Object.keys(state) as (keyof OrganizationState)[]) {
      const candidate = parsed[key];
      if (typeof state[key] === 'number' && typeof candidate === 'number' && Number.isFinite(candidate) && candidate >= 0) (state as unknown as Record<string, unknown>)[key] = candidate;
      else if (typeof state[key] === 'boolean' && typeof candidate === 'boolean') (state as unknown as Record<string, unknown>)[key] = candidate;
    }
    if (parsed.lastAcceptedSuggestionType === 'board' || parsed.lastAcceptedSuggestionType === 'space') state.lastAcceptedSuggestionType = parsed.lastAcceptedSuggestionType;
    return state;
  } catch { return { ...DEFAULT_ORGANIZATION_STATE }; }
}

/** Only actual Chat text and attachments affect the score. Short acknowledgments stay quiet. */
export function scoreOrganizationCandidate(message: Pick<Message, 'text' | 'attachments'>): number {
  const text = message.text?.trim() ?? '';
  const attachments = message.attachments.filter((item) => item.type === 'file' || item.type === 'photo' || item.type === 'video');
  if (!attachments.length && text.length < 12) return 0;
  let score = 0;
  if (text.length > 60) score += 1;
  if (text.length >= 16 && text.includes('\n')) score += 1;
  if (attachments.length) score += 2;
  if (attachments.length > 1) score += 1;
  if (text.length >= 16 && KEYWORDS.test(text)) score += 1;
  if (text.length >= 45) score += 1;
  return score;
}

export function openingCopy(state: OrganizationState): string {
  if (!state.introSeen) return 'You can keep this here in Chat, or organize it into a Board or Space.';
  const lines = ['Want to put this somewhere?', 'Keep this one handy?', 'Should we organize this?', 'Where should this one live?', 'This looks worth keeping somewhere.'];
  return lines[state.suggestionShownCount % lines.length];
}

/** Called only after the existing Board or Space repository reports success. */
export async function markOrganizationAccepted(database: import('expo-sqlite').SQLiteDatabase, choice: OrganizationChoice): Promise<boolean> {
  const row = await database.getFirstAsync<{ value: string }>('SELECT value FROM app_settings WHERE key = ?', ORGANIZATION_STATE_KEY);
  const current = parseOrganizationState(row?.value);
  const now = Date.now();
  const next: OrganizationState = {
    ...current, lastInteraction: now, lastAcceptedSuggestionType: choice, relationshipExplained: true,
    boardSuggestionAcceptedCount: current.boardSuggestionAcceptedCount + (choice === 'board' ? 1 : 0),
    spaceSuggestionAcceptedCount: current.spaceSuggestionAcceptedCount + (choice === 'space' ? 1 : 0),
  };
  await database.runAsync('INSERT INTO app_settings (key, value, updated_at) VALUES (?, ?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at', ORGANIZATION_STATE_KEY, JSON.stringify(next), now);
  return !current.relationshipExplained;
}
