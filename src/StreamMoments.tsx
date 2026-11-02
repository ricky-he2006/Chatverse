import { useRef, useState } from 'react';
import type { Context } from './App';
import { Button } from './ui';
import { STREAM_MOMENTS } from '../shared/stream-moments';

const presets = STREAM_MOMENTS;
type Draft = { milestone: string; actionId: string };

export function StreamMoments({ ctx }: { ctx: Context }) {
  const storageKey = `cv:moment:${ctx.s.mode}:${ctx.s.realmId}:${ctx.s.generation}:${ctx.s.integration.channel ?? ''}`;
  const [draft, setDraft] = useState<Draft | null>(() => {
    try {
      const stored = JSON.parse(sessionStorage.getItem(storageKey) ?? 'null');
      return stored &&
        presets.some((p) => p === stored.milestone) &&
        typeof stored.actionId === 'string'
        ? stored
        : null;
    } catch {
      return null;
    }
  });
  const sending = useRef(false);
  const choose = (value: Draft | null) => {
    if (value) sessionStorage.setItem(storageKey, JSON.stringify(value));
    else sessionStorage.removeItem(storageKey);
    setDraft(value);
  };
  const confirm = async () => {
    if (!draft || sending.current) return;
    sending.current = true;
    try {
      const result = await ctx.run(
        () => ctx.action('milestone', { ...draft, generation: ctx.s.generation }),
        `${draft.milestone} recorded in the Chronicle.`,
      );
      if (result) choose(null);
    } finally {
      sending.current = false;
    }
  };
  return (
    <div className="stream-moments" aria-label="Streamer-confirmed moments">
      <h3>Stream moments</h3>
      <p>
        Choose a moment, then confirm it for the stream. No automatic game detection or extra
        rewards.
      </p>
      <div className="room-actions">
        {draft ? (
          <>
            <Button disabled={ctx.busy} variant="primary" onClick={() => void confirm()}>
              Confirm {draft.milestone}
            </Button>
            <Button disabled={ctx.busy} onClick={() => choose(null)}>
              Cancel
            </Button>
          </>
        ) : (
          presets.map((milestone) => (
            <Button
              key={milestone}
              disabled={ctx.busy}
              onClick={() => choose({ milestone, actionId: crypto.randomUUID() })}
            >
              {milestone}
            </Button>
          ))
        )}
      </div>
      {draft && (
        <small role="status">
          Confirm only after this happened in your game.{' '}
          {ctx.s.settings.quiet
            ? 'Quiet mode is on; the event will be saved but hidden on stream.'
            : 'The confirmed label appears on your overlay.'}
        </small>
      )}
    </div>
  );
}
