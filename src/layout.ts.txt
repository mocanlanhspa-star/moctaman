/** The 120 cushions in the hall. Pure numbers, shared by the 3D scene and the server (which picks the nearest free seat). */
export const MAX_SEATS = 120;
export const COLS = 10; // seats per row: 5 on each side of the aisle
export const ROWS = MAX_SEATS / COLS;
export const ROW_GAP = 1.15;
const ROW0_Z = -4.6; // the row nearest the altar
const X0 = 1.9;
const X_GAP = 1.0;

/** Seat index 0..119 (shown to people as number 1..120). Seats fill from the front row, next to the aisle, outward. */
export function seatXZ(i: number) {
  const row = Math.floor(i / COLS);
  const s = i % COLS;
  const side = s % 2 ? 1 : -1;
  return { x: side * (X0 + Math.floor(s / 2) * X_GAP), z: ROW0_Z + row * ROW_GAP };
}

/** The nearest seat to (x, z) that `isTaken` says is free, or -1 when the hall is full */
export function nearestFreeSeat(x: number, z: number, isTaken: (i: number) => boolean) {
  let best = -1;
  let bestD = Infinity;
  for (let i = 0; i < MAX_SEATS; i++) {
    if (isTaken(i)) continue;
    const p = seatXZ(i);
    const d = (p.x - x) ** 2 + (p.z - z) ** 2;
    if (d < bestD) {
      bestD = d;
      best = i;
    }
  }
  return best;
}

export const SEAT_MINUTES = 5; // how long one person may keep a seat
export const SEAT_MS = SEAT_MINUTES * 60_000;
export const SEAT_COOLDOWN_MS = 90_000; // wait this long after being asked to stand before taking a seat again
