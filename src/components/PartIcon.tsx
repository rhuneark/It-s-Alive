import type { SlotId } from '../game/catalog';
import { layerKey } from '../game/layout';
import type { Power } from '../game/rampage';

const BASE = import.meta.env.BASE_URL;

/** The painted layer of a part the village chose (the spark is an icon: it is an effect). */
export function partIconSrc(slot: SlotId, parts: Partial<Record<SlotId, string>>): string | null {
  const id = parts[slot];
  if (!id) return null;
  if (slot === 'spark') return `${BASE}art/icons/${id}.png`;
  return `${BASE}art/parts/${layerKey(slot, id, parts)}.png`;
}

/** A power, shown as the first of its parts the village chose; dark until it wakes. */
export function PowerIcon({
  power,
  parts,
  lit,
}: {
  power: Power;
  parts: Partial<Record<SlotId, string>>;
  lit: boolean;
}) {
  const src = power.slots.map((s) => partIconSrc(s, parts)).find(Boolean);
  return (
    <span className={`power-icon ${lit ? 'lit' : ''}`} title={power.effect}>
      {src ? <img src={src} alt="" /> : <i aria-hidden="true">✶</i>}
    </span>
  );
}
