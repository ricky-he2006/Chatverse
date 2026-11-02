import type { Chapter, WorldEvent } from './types';
export function nextOverlayNotice(events: WorldEvent[], cursor: number, settled: boolean) {
  return events.find(
    (event) =>
      event.id > cursor && !(settled && ['battle', 'territory', 'simulation'].includes(event.type)),
  );
}
export function overlayChapterVisible(
  chapter: Pick<Chapter, 'status' | 'createdAt' | 'resumedAt' | 'resolvedAt'> | null | undefined,
  now: number,
  pinned: boolean,
) {
  if (!chapter) return false;
  if (chapter.status === 'open' || chapter.status === 'paused')
    return pinned || now - (chapter.resumedAt ?? chapter.createdAt) < 12000;
  return (
    chapter.status === 'resolved' && chapter.resolvedAt !== null && now - chapter.resolvedAt < 16000
  );
}
export function overlayPresentation(url: string, anchor: string, motion: boolean, pinned = false) {
  const parsed = new URL(url, 'http://localhost');
  parsed.searchParams.set(
    'anchor',
    ['top-left', 'top-right', 'bottom-left', 'bottom-right'].includes(anchor)
      ? anchor
      : 'top-right',
  );
  parsed.searchParams.set('motion', motion ? 'on' : 'off');
  parsed.searchParams.set('ribbon', pinned ? 'pinned' : 'moments');
  return url.startsWith('/') ? parsed.pathname + parsed.search + parsed.hash : parsed.href;
}
