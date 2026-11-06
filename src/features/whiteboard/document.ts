export type CanvasPoint = { x: number; y: number; pressure: number };
export type CanvasObject = { id: string; type: 'pen' | 'highlighter' | 'text' | 'note'; x: number; y: number; width: number; height: number; color: string; opacity?: number; points?: CanvasPoint[]; text?: string; noteId?: string; noteKind?: 'card' | 'thought'; fontSize?: number };
export type CanvasDocument = { version: 1; id: string; title: string; createdAt: number; updatedAt: number; archived: boolean; objects: CanvasObject[]; viewport: { x: number; y: number; zoom: number }; guideDone: boolean };
export const canvasId = () => `canvas-${Date.now()}-${Math.random().toString(36).slice(2)}`;
export function newCanvas(): CanvasDocument { const now = Date.now(); return { version: 1, id: canvasId(), title: '', createdAt: now, updatedAt: now, archived: false, objects: [], viewport: { x: 24, y: 24, zoom: 1 }, guideDone: false }; }
export const canvasKey = (id: string) => `whiteboard.v1.${id}`;
