/**
 * Levels, titles, auras, hats and badges. Pure data and rules, shared by the server (which decides) and the page (which shows).
 * Everything is earned by practising in the hall: nothing here is bought and nothing is tied to money or gifts.
 */
export const LEVEL_MAX = 120;
/** Total merit (điểm công đức) needed to reach a level. Level 120 is a long road on purpose. */
export const xpForLevel = (l: number) => (l <= 1 ? 0 : Math.round(40 * Math.pow(Math.min(l, LEVEL_MAX) - 1, 1.9)));

export function levelOf(xp: number) {
  let lv = Math.min(LEVEL_MAX, Math.floor(Math.pow(Math.max(0, xp) / 40, 1 / 1.9)) + 1);
  while (lv < LEVEL_MAX && xp >= xpForLevel(lv + 1)) lv++;
  while (lv > 1 && xp < xpForLevel(lv)) lv--;
  return lv;
}

/** Merit for each kind of practice. No daily cap and no waiting time: practise as long as you like. */
export const XP = { bow: 8, incense: 40, bell: 6, wish: 15, lantern: 25, chant: 2, meditate: 12 } as const;

export type Stats = { bows: number; incense: number; bells: number; chants: number; meditate: number; wishes: number; lanterns: number };
export const emptyStats = (): Stats => ({ bows: 0, incense: 0, bells: 0, chants: 0, meditate: 0, wishes: 0, lanterns: 0 });
export type Progress = { xp: number; stats: Stats; streak: number };

// ---- aura tiers: the character gains a glow at levels 10, 20, 50, 100 and 120 ----
export const AURA_TIERS = [
  { min: 10, name: 'Sen búp', desc: 'Vòng sáng nhẹ dưới chân' },
  { min: 20, name: 'Sen hé', desc: 'Thêm vòng hào quang trên đầu' },
  { min: 50, name: 'Sen nở rộ', desc: 'Cột sáng và những đốm sáng bay quanh' },
  { min: 100, name: 'Sen vàng', desc: 'Hào quang kép và cánh sen bay quanh' },
  { min: 120, name: 'Sen thanh tịnh', desc: 'Hào quang vàng rực, tòa sen dưới chân' },
];
/** 0 (no aura) to 5 */
export const tierOf = (lv: number) => AURA_TIERS.filter((t) => lv >= t.min).length;
export const titleOf = (lv: number) => (tierOf(lv) === 0 ? 'Người ghé thăm' : AURA_TIERS[tierOf(lv) - 1].name);

// ---- hats: each needs a level before it can be chosen ----
export const HATS = [
  { id: 0, name: 'Không đội', min: 0 },
  { id: 1, name: 'Nón lá', min: 5 },
  { id: 2, name: 'Nón lá quai đỏ', min: 20 },
  { id: 3, name: 'Nón lá viền vàng', min: 50 },
  { id: 4, name: 'Nón lá sen vàng', min: 100 },
];

// ---- badges ----
export type BadgeDef = { id: string; name: string; desc: string; icon: string; test: (p: Progress, lv: number) => boolean };
export const BADGES: BadgeDef[] = [
  { id: 'moi-vao', name: 'Người ghé thăm', desc: 'Bước chân đầu tiên vào chánh điện', icon: 'sparkles', test: (p) => p.xp > 0 },
  { id: 'lay-100', name: 'Trăm lạy', desc: 'Lạy 100 lạy', icon: 'heart', test: (p) => p.stats.bows >= 100 },
  { id: 'lay-1000', name: 'Ngàn lạy', desc: 'Lạy 1.000 lạy', icon: 'heart', test: (p) => p.stats.bows >= 1000 },
  { id: 'huong-10', name: 'Mười nén hương', desc: 'Thắp 10 nén hương', icon: 'flame', test: (p) => p.stats.incense >= 10 },
  { id: 'huong-100', name: 'Trăm nén hương', desc: 'Thắp 100 nén hương', icon: 'flame', test: (p) => p.stats.incense >= 100 },
  { id: 'niem-500', name: 'Năm trăm câu niệm', desc: 'Niệm 500 câu', icon: 'drum', test: (p) => p.stats.chants >= 500 },
  { id: 'niem-5000', name: 'Năm ngàn câu niệm', desc: 'Niệm 5.000 câu', icon: 'drum', test: (p) => p.stats.chants >= 5000 },
  { id: 'thien-30', name: 'Nửa giờ thiền', desc: 'Ngồi thiền tổng cộng 30 phút', icon: 'moon', test: (p) => p.stats.meditate >= 30 },
  { id: 'thien-300', name: 'Năm giờ thiền', desc: 'Ngồi thiền tổng cộng 300 phút', icon: 'moon', test: (p) => p.stats.meditate >= 300 },
  { id: 'chuong-30', name: 'Tiếng chuông an lành', desc: 'Rung chuông 30 lần', icon: 'bell', test: (p) => p.stats.bells >= 30 },
  { id: 'nguyen-10', name: 'Lời nguyện lành', desc: 'Gửi 10 lời nguyện', icon: 'pen', test: (p) => p.stats.wishes >= 10 },
  { id: 'den-10', name: 'Đèn hoa đăng', desc: 'Thả 10 đèn hoa đăng', icon: 'lamp', test: (p) => p.stats.lanterns >= 10 },
  { id: 'chuoi-7', name: 'Bảy ngày chuyên cần', desc: 'Ghé tu tập 7 ngày liên tiếp', icon: 'sun', test: (p) => p.streak >= 7 },
  { id: 'chuoi-30', name: 'Ba mươi ngày chuyên cần', desc: 'Ghé tu tập 30 ngày liên tiếp', icon: 'sun', test: (p) => p.streak >= 30 },
  { id: 'chuoi-100', name: 'Trăm ngày chuyên cần', desc: 'Ghé tu tập 100 ngày liên tiếp', icon: 'sun', test: (p) => p.streak >= 100 },
  { id: 'cap-10', name: 'Sen búp', desc: 'Đạt cấp 10', icon: 'award', test: (_p, lv) => lv >= 10 },
  { id: 'cap-20', name: 'Sen hé', desc: 'Đạt cấp 20', icon: 'award', test: (_p, lv) => lv >= 20 },
  { id: 'cap-50', name: 'Sen nở rộ', desc: 'Đạt cấp 50', icon: 'award', test: (_p, lv) => lv >= 50 },
  { id: 'cap-100', name: 'Sen vàng', desc: 'Đạt cấp 100', icon: 'crown', test: (_p, lv) => lv >= 100 },
  { id: 'cap-120', name: 'Sen thanh tịnh', desc: 'Đạt cấp cao nhất, cấp 120', icon: 'crown', test: (_p, lv) => lv >= LEVEL_MAX },
];
export const earnedBadges = (p: Progress) => {
  const lv = levelOf(p.xp);
  return BADGES.filter((b) => b.test(p, lv)).map((b) => b.id);
};
