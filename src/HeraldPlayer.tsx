import { useEffect, useRef, useState } from 'react';
import {
  HeraldQueue,
  heraldDefaults,
  type HeraldLine,
  type HeraldSettings,
} from '../shared/herald';
import { realmUrl } from './api';
import type { Context } from './App';
export function HeraldControls({ ctx }: { ctx: Context }) {
  const h = ctx.s.settings.herald ?? heraldDefaults;
  const save = (patch: Partial<HeraldSettings>) =>
    void ctx.run(() => ctx.action('settings', { herald: { ...h, ...patch } }, 'PATCH'));
  return (
    <section className="stream-moments">
      <h3>Royal Herald</h3>
      <p>Local spoken announcements in the standalone overlay. Quiet Mode silences speech.</p>
      <label>
        <input
          type="checkbox"
          checked={h.enabled}
          disabled={ctx.busy}
          onChange={(e) => save({ enabled: e.target.checked })}
        />{' '}
        Enable voice
      </label>{' '}
      <label>
        Volume{' '}
        <input
          type="range"
          min="0"
          max="1"
          step="0.1"
          value={h.volume}
          disabled={ctx.busy}
          onChange={(e) => save({ volume: Number(e.target.value) })}
        />
      </label>{' '}
      <label>
        Frequency{' '}
        <select
          value={h.frequency}
          disabled={ctx.busy}
          onChange={(e) => save({ frequency: e.target.value as HeraldSettings['frequency'] })}
        >
          <option value="balanced">Battles, councils and moments</option>
          <option value="major">Battle results and leadership only</option>
        </select>
      </label>
    </section>
  );
}
export function HeraldPlayer({
  mode,
  realm,
  data,
}: {
  mode: string;
  realm: string;
  data: {
    generation: string;
    now: number;
    quiet: boolean;
    herald?: HeraldSettings;
    heraldLines: HeraldLine[];
  };
}) {
  const queue = useRef(new HeraldQueue()),
    audio = useRef<HTMLAudioElement | null>(null),
    busy = useRef(false),
    epoch = useRef(0),
    current = useRef(data),
    [caption, setCaption] = useState(''),
    [fallback, setFallback] = useState(false);
  current.current = data;
  useEffect(() => {
    const h = data.herald ?? heraldDefaults;
    queue.current.ingest(
      `${mode}:${realm}:${data.generation}`,
      data.heraldLines ?? [],
      h.enabled,
      data.quiet,
      h.frequency,
    );
    if (audio.current) audio.current.volume = h.volume;
    if (!h.enabled || data.quiet) {
      epoch.current++;
      audio.current?.pause();
      audio.current?.remove();
      audio.current = null;
      busy.current = false;
      setCaption('');
    }
  }, [data, mode, realm]);
  useEffect(() => {
    const timer = setInterval(async () => {
      const d = current.current,
        h = d.herald ?? heraldDefaults;
      if (!h.enabled || d.quiet) return;
      const line = queue.current.take(Date.now(), busy.current, d.now);
      if (!line) return;
      busy.current = true;
      const version = ++epoch.current;
      setCaption(line.text);
      setFallback(false);
      let url: string | undefined;
      try {
        const response = await fetch(
          realmUrl(
            `/api/${mode}/overlay/snapshot?heraldAudio=${line.id}&generation=${encodeURIComponent(d.generation)}`,
            realm,
          ),
          { signal: AbortSignal.timeout(18000) },
        );
        if (!response.ok) throw Error('Voice unavailable');
        await response.arrayBuffer();
        if (version !== epoch.current) return;
        url = realmUrl(
          `/api/${mode}/overlay/snapshot?heraldAudio=${line.id}&generation=${encodeURIComponent(d.generation)}`,
          realm,
        );
        const player = new Audio(url);
        audio.current = player;
        player.volume = current.current.herald?.volume ?? h.volume;
        player.hidden = true;
        document.body.appendChild(player);
        await player.play();
        await new Promise<void>((resolve, reject) => {
          player.onended = () => resolve();
          player.onerror = () => reject(Error('Audio playback failed'));
          player.onpause = () => resolve();
          setTimeout(resolve, 45000);
        });
      } catch {
        if (version === epoch.current) setFallback(true);
      } finally {
        if (version === epoch.current) {
          audio.current?.pause();
          audio.current?.remove();
        }
        if (version === epoch.current) {
          busy.current = false;
          setTimeout(() => {
            if (version === epoch.current) setCaption('');
          }, 6000);
        }
      }
    }, 500);
    return () => {
      clearInterval(timer);
      epoch.current++;
      audio.current?.pause();
      audio.current?.remove();
      audio.current = null;
      busy.current = false;
    };
  }, [mode, realm, data.generation]);
  return caption && !data.quiet ? (
    <div className="obs-herald" role="status">
      <strong>Royal Herald{fallback ? ' · text only' : ''}</strong>
      <p>{caption}</p>
      {fallback && (
        <small>
          Local voice unavailable or browser audio blocked. Allow sound for this overlay.
        </small>
      )}
    </div>
  ) : null;
}
