export type HeraldSettings = { enabled: boolean; volume: number; frequency: 'major' | 'balanced' };
export const heraldDefaults: HeraldSettings = {
  enabled: false,
  volume: 0.7,
  frequency: 'balanced',
};
export type HeraldLine = { id: number; text: string; priority: number; at: number };
export interface NarrationTextProvider {
  compose(event: {
    type: string;
    title: string;
    body: string;
  }): { text: string; priority: number } | null;
}
export const deterministicHerald: NarrationTextProvider = {
  compose(event) {
    const priority =
      event.type === 'battle'
        ? 3
        : ['election', 'council'].includes(event.type)
          ? 2
          : ['chapter', 'milestone'].includes(event.type)
            ? 1
            : 0;
    if (!priority) return null;
    const text =
      event.type === 'milestone'
        ? `The streamer confirms: ${event.title}.`
        : `${event.title}. ${event.body}`;
    return { priority, text: text.replace(/[<>\x00-\x1f]/g, '').slice(0, 600) };
  },
};
export class HeraldQueue {
  private cursor = 0;
  private scope = '';
  private queue: HeraldLine[] = [];
  private nextAt = 0;
  ingest(scope: string, lines: HeraldLine[], enabled: boolean, quiet: boolean, frequency: string) {
    const newest = Math.max(0, ...lines.map((l) => l.id));
    if (scope !== this.scope) {
      this.scope = scope;
      this.cursor = newest;
      this.queue = [];
      this.nextAt = 0;
      return;
    }
    const fresh = lines.filter((l) => l.id > this.cursor);
    this.cursor = Math.max(this.cursor, newest);
    if (!enabled || quiet) {
      this.queue = [];
      return;
    }
    this.queue.push(...fresh.filter((l) => frequency !== 'major' || l.priority >= 2));
    if (frequency === 'major') this.queue = this.queue.filter((l) => l.priority >= 2);
    this.queue.sort((a, b) => b.priority - a.priority || a.id - b.id);
    this.queue = this.queue.slice(0, 5);
  }
  take(now: number, busy: boolean, worldNow: number) {
    this.queue = this.queue.filter((l) => worldNow - l.at < 30000);
    if (busy || now < this.nextAt) return null;
    const line = this.queue.shift() ?? null;
    if (line) this.nextAt = now + 12000;
    return line;
  }
}
