import type { GameMode, TowerEngine } from './tower-engine';
type Tool = { name: string; title: string; description: string; inputSchema: object; annotations: { readOnlyHint: boolean; untrustedContentHint: boolean }; execute: (input: unknown) => unknown };
type Context = { registerTool: (tool: Tool, options?: { signal: AbortSignal }) => void | Promise<void> };
export function registerGameTools(engine: TowerEngine, actions: { start: (mode: GameMode) => void; pause: () => void }) {
  const context = (document as Document & { modelContext?: Context }).modelContext;
  if (!context?.registerTool) return () => {};
  const lifecycle = new AbortController();
  const tools: Tool[] = [
    { name: 'read_tower_run', title: 'Read tower run', description: 'Read current floor, score, combo, and game status.', inputSchema: {type:'object',properties:{},additionalProperties:false}, annotations: {readOnlyHint:true,untrustedContentHint:false}, execute: () => engine.snapshot() },
    { name: 'start_tower_run', title: 'Start tower run', description: 'Start a fresh tower climb. Replaces the current run. Arcade includes rising frost; practice removes the timed chase.', inputSchema: { type:'object',properties:{mode:{type:'string',enum:['arcade','practice']}},required:['mode'],additionalProperties:false }, annotations:{readOnlyHint:false,untrustedContentHint:false}, execute: input => { const mode = (input as {mode?:unknown})?.mode; if(mode!=='arcade'&&mode!=='practice') throw new Error('mode must be arcade or practice'); actions.start(mode); return engine.snapshot(); } },
    { name: 'pause_tower_run', title: 'Pause tower run', description: 'Pause an active run without changing the score or climber position.', inputSchema:{type:'object',properties:{},additionalProperties:false}, annotations:{readOnlyHint:false,untrustedContentHint:false}, execute: () => { if(engine.status!=='playing') throw new Error('No active run to pause'); actions.pause(); return engine.snapshot(); } },
  ];
  for (const tool of tools) { try { void Promise.resolve(context.registerTool(tool,{signal:lifecycle.signal})).catch(() => {}); } catch { /* WebMCP is an optional enhancement. */ } }
  return () => lifecycle.abort();
}
