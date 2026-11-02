import { test } from 'node:test';
import assert from 'node:assert/strict';
import { territoryCells } from '../shared/cartography';
import { WORLD_TERRITORIES } from '../shared/expansion';
import { overlayPresentation, overlayChapterVisible } from '../shared/overlay';
import { REALMS, realmIdentity } from '../shared/realms';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

test('configured streamer realms use distinct, available panoramic artwork', () => {
  const paths = new Set<string>(),
    hashes = new Set<string>();
  for (const realm of REALMS) {
    const asset = readFileSync(new URL('../public' + realm.mapImage, import.meta.url));
    assert.equal(asset.toString('hex', 0, 8), '89504e470d0a1a0a');
    assert(asset.readUInt32BE(16) >= 2000);
    assert(asset.readUInt32BE(16) / asset.readUInt32BE(20) > 2.7);
    paths.add(realm.mapImage);
    hashes.add(createHash('sha256').update(asset).digest('hex'));
    assert.equal(realmIdentity(realm.id).mapImage, realm.mapImage);
  }
  assert.equal(paths.size, REALMS.length);
  assert.equal(hashes.size, REALMS.length);
  assert.equal(realmIdentity('home').mapImage, '/everfall-realms-v2.png');
});
test('ownership map partitions the canvas and contains each territory at its authoritative coordinates', () => {
  const cells = territoryCells(WORLD_TERRITORIES);
  const area = cells.reduce(
    (sum, { points }) =>
      sum +
      Math.abs(
        points.reduce((s, p, i) => {
          const q = points[(i + 1) % points.length];
          return s + p[0] * q[1] - q[0] * p[1];
        }, 0),
      ) /
        2,
    0,
  );
  assert(Math.abs(area - 360000) < 0.001);
  for (const { territory: t, points } of cells) {
    assert(points.length >= 3);
    assert(
      points.every(
        ([x, y]) =>
          Number.isFinite(x) &&
          Number.isFinite(y) &&
          x >= -1e-6 &&
          x <= 1000.000001 &&
          y >= -1e-6 &&
          y <= 360.000001,
      ),
    );
    const signs = points.map((p, i) => {
      const q = points[(i + 1) % points.length];
      return (q[0] - p[0]) * (t.y * 3.6 - p[1]) - (q[1] - p[1]) * (t.x * 10 - p[0]);
    });
    assert(signs.every((s) => s >= -1e-6) || signs.every((s) => s <= 1e-6), t.id);
  }
  const changed = WORLD_TERRITORIES.map((t) => ({ ...t, owner: 'west' as const }));
  assert(territoryCells(changed).every((c) => c.territory.owner === 'west'));
  assert.deepEqual(territoryCells([]), []);
});
test('overlay presentation preserves the mode, realm and private fragment capability', () => {
  const original = 'http://localhost:3000/overlay/simulation?realm=emberwatch#key=private-example';
  const styled = new URL(overlayPresentation(original, 'bottom-left', false));
  assert.equal(styled.pathname, '/overlay/simulation');
  assert.equal(styled.searchParams.get('realm'), 'emberwatch');
  assert.equal(styled.searchParams.get('anchor'), 'bottom-left');
  assert.equal(styled.searchParams.get('motion'), 'off');
  assert.equal(styled.searchParams.get('ribbon'), 'moments');
  assert.equal(
    new URL(overlayPresentation(original, 'bottom-left', true, true)).searchParams.get('ribbon'),
    'pinned',
  );
  const open = { status: 'open' as const, createdAt: 1000, resolvedAt: null };
  assert(overlayChapterVisible(open, 12999, false));
  assert(!overlayChapterVisible(open, 13000, false));
  assert(overlayChapterVisible(open, 100000, true));
  assert(overlayChapterVisible({ ...open, status: 'resolved', resolvedAt: 20000 }, 35999, false));
  assert(!overlayChapterVisible({ ...open, status: 'resolved', resolvedAt: 20000 }, 36000, true));
  assert(!overlayChapterVisible({ ...open, status: 'cancelled' }, 1100, true));
  assert.equal(styled.hash, '#key=private-example');
  assert.equal(
    new URL(overlayPresentation(original, 'invalid', true)).searchParams.get('anchor'),
    'top-right',
  );
});
