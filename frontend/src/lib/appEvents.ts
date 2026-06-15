/**
 * Tiny typed event emitter used for decoupled cross-component signals
 * (replacing the previous ad-hoc window CustomEvent bus).
 *
 * Usage:
 *   const off = appEvents.on('tableRefresh', () => { ... });
 *   appEvents.emit('tableRefresh');
 *   off(); // unsubscribe
 */

export interface ColumnMetadataUpdate {
  columnId: string;
  options?: string[];
  option_colors?: Record<string, string>;
}

export interface RecordValuesUpdate {
  columnId: string;
  updates: { recordId: string; value: string }[];
}

// Map of event name -> payload type. Use `void` for payload-less events.
export interface AppEvents {
  tableRefresh: void;
  exportCollectionCsv: void;
  columnMetadata: ColumnMetadataUpdate;
  recordValues: RecordValuesUpdate;
}

type Handler<T> = (payload: T) => void;

class TypedEmitter<Events extends Record<string, any>> {
  private handlers: { [K in keyof Events]?: Set<Handler<Events[K]>> } = {};

  on<K extends keyof Events>(event: K, handler: Handler<Events[K]>): () => void {
    const set = (this.handlers[event] ??= new Set());
    set.add(handler);
    return () => this.off(event, handler);
  }

  off<K extends keyof Events>(event: K, handler: Handler<Events[K]>): void {
    this.handlers[event]?.delete(handler);
  }

  emit<K extends keyof Events>(
    event: K,
    ...args: Events[K] extends void ? [] : [payload: Events[K]]
  ): void {
    const payload = args[0] as Events[K];
    this.handlers[event]?.forEach((handler) => handler(payload));
  }
}

export const appEvents = new TypedEmitter<AppEvents>();
