/** Where a visitor may stand: the hall, the doorway, and the garden, minus ponds, trees, columns and lanterns. */
export type Circle = { x: number; z: number; r: number };
type Rect = { x0: number; x1: number; z0: number; z1: number };

const inRect = (r: Rect, x: number, z: number, m = 0) => x >= r.x0 - m && x <= r.x1 + m && z >= r.z0 - m && z <= r.z1 + m;

const HALL: Rect = { x0: -8.4, x1: 8.4, z0: -7.0, z1: 14.0 };
const TABLE: Rect = { x0: -1.8, x1: 1.8, z0: -7.1, z1: -6.3 };
const DOOR: Rect = { x0: -1.5, x1: 1.5, z0: 13.5, z1: 15.2 };
const YARD: Rect = { x0: -19.4, x1: 19.4, z0: 14.8, z1: 59.2 };
export const PONDS: Rect[] = [
  { x0: -12.6, x1: -3.6, z0: 24, z1: 44 },
  { x0: 3.6, x1: 12.6, z0: 24, z1: 44 },
];

const fixed: Circle[] = [];
for (const x of [-7.3, 7.3]) for (const z of [-6, 0, 6, 12]) fixed.push({ x, z, r: 0.55 });
let dynamic: Circle[] = [];

export const addObstacles = (list: Circle[]) => fixed.push(...list);
/** Decorative kneelers sitting on cushions block the way like real people would */
export const setDynamicObstacles = (list: Circle[]) => (dynamic = list);

export function walkable(x: number, z: number) {
  const inside = (inRect(HALL, x, z) && !inRect(TABLE, x, z)) || inRect(DOOR, x, z) || inRect(YARD, x, z);
  if (!inside) return false;
  for (const p of PONDS) if (inRect(p, x, z, 0.5)) return false;
  for (const c of fixed) if ((x - c.x) ** 2 + (z - c.z) ** 2 < c.r * c.r) return false;
  for (const c of dynamic) if ((x - c.x) ** 2 + (z - c.z) ** 2 < c.r * c.r) return false;
  return true;
}

/** Move by (dx, dz), sliding along whatever blocks the way */
export function slideMove(x: number, z: number, dx: number, dz: number): [number, number] {
  if (walkable(x + dx, z + dz)) return [x + dx, z + dz];
  if (walkable(x + dx, z)) return [x + dx, z];
  if (walkable(x, z + dz)) return [x, z + dz];
  return [x, z];
}

/** Visitors appear in the garden in front of the hall door, facing it */
export const SPAWN = { x: 0, z: 17.2 };

export type ZoneName = 'Chánh điện' | 'Sân vườn' | 'Ao sen' | 'Hành lang' | 'Tam quan';
export function zoneAt(x: number, z: number): ZoneName {
  if (z < 14.6) return 'Chánh điện';
  if (z > 55) return 'Tam quan';
  if (Math.abs(x) > 14.8) return 'Hành lang';
  for (const p of PONDS) if (inRect(p, x, z, 2.6)) return 'Ao sen';
  return 'Sân vườn';
}
