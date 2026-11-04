/**
 * Texts for the "Tụng kinh" panel. Each tap of the wooden fish moves to the next line.
 * Short texts live here. Longer sutras are plain text files in public/kinh/ (see public/kinh/HUONG-DAN.txt):
 * the owner pastes the version their own temple uses, and it shows up in the list by itself.
 */
export type Sutra = { id: string; name: string; blurb: string; lines: string[] };

export const BUILTIN_SUTRAS: Sutra[] = [
  { id: 'niem-phat', name: 'Niệm Phật', blurb: 'Sáu chữ hồng danh, mỗi tiếng mõ một chữ', lines: ['Nam', 'mô', 'A', 'Di', 'Đà', 'Phật'] },
  { id: 'quan-the-am', name: 'Niệm Quán Thế Âm', blurb: 'Danh hiệu đức Quán Thế Âm Bồ Tát', lines: ['Nam', 'mô', 'Quán', 'Thế', 'Âm', 'Bồ', 'Tát'] },
  {
    id: 'tu-hoang-thue',
    name: 'Tứ hoằng thệ nguyện',
    blurb: 'Bốn lời nguyện lớn',
    lines: ['Chúng sanh vô biên thệ nguyện độ', 'Phiền não vô tận thệ nguyện đoạn', 'Pháp môn vô lượng thệ nguyện học', 'Phật đạo vô thượng thệ nguyện thành'],
  },
  {
    id: 'ke-kim-cang',
    name: 'Kệ Kim Cang',
    blurb: 'Bài kệ bốn câu nhắc điều vô thường',
    lines: ['Nhất thiết hữu vi pháp', 'Như mộng huyễn bào ảnh', 'Như lộ diệc như điện', 'Ưng tác như thị quán'],
  },
  {
    id: 'hoi-huong',
    name: 'Kệ hồi hướng',
    blurb: 'Gửi công đức đến tất cả chúng sinh',
    lines: ['Nguyện đem công đức này', 'Hướng về khắp tất cả', 'Đệ tử và chúng sinh', 'Đều trọn thành Phật đạo'],
  },
];

/** Reads public/kinh/index.json: [{ "id": "tam-kinh", "name": "Bát Nhã Tâm Kinh", "file": "tam-kinh.txt" }], one line of text per sutra line */
export async function loadExtraSutras(): Promise<Sutra[]> {
  try {
    const res = await fetch('/kinh/index.json');
    if (!res.ok) return [];
    const index = (await res.json()) as Array<{ id: string; name: string; file: string; blurb?: string }>;
    const out: Sutra[] = [];
    for (const item of index) {
      if (!item?.id || !item?.name || !item?.file) continue;
      const r = await fetch(`/kinh/${encodeURIComponent(item.file)}`);
      if (!r.ok) continue;
      const lines = (await r.text()).split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
      if (lines.length) out.push({ id: item.id, name: item.name, blurb: item.blurb ?? 'Bản do chánh điện cung cấp', lines });
    }
    return out;
  } catch {
    return []; // no index (or the dev server answered with the page): just the built-in texts
  }
}
