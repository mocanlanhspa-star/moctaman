# Kế hoạch nâng cấp lên game (để phiên mới làm tiếp)

Hiện trạng: web Tâm Tịnh Tâm An chạy được (chánh điện 3D, chibi, nhiều người, thắp hương, rung chuông, gõ mõ, lời nguyện, đèn hoa đăng, tượng Phật bằng ảnh `public/assets/altar.webp`). Chạy thử: `CHAY-WEB.bat` (cổng 3200). Kiểm tra kiểu: `npm run lint`.

Sếp Mộc yêu cầu thêm (làm theo thứ tự, mỗi bước chạy `npm run lint` rồi thử trên trình duyệt):

1. **Kinh và nhạc chùa**
   - `src/sutras.ts`: danh sách kinh để người chơi chọn khi gõ mõ: Niệm Phật (Nam mô A Di Đà Phật), Bát Nhã Tâm Kinh, Chú Đại Bi, Chú Vãng Sanh, Lục Tự Đại Minh, Niệm Quán Thế Âm, Tứ Hoằng Thệ Nguyện, Kệ Kim Cang, Kệ Hồi Hướng. Mỗi lần gõ mõ chạy sang một câu; xong bài thì chuông nhỏ và dòng hồi hướng. Ghi chú: bản phổ biến, mỗi nơi có thể khác đôi chữ.
   - `src/audio.ts`: nhạc nền tự tạo bằng WebAudio (không dính bản quyền): Tĩnh tâm (file mp3 hiện có), Sáo trúc và chuông, Mưa đêm và chuông gió, Đêm sen (dế, nước), Mõ và niệm trầm. Có chọn bài, thanh âm lượng, âm thanh môi trường đổi theo khu vực (trong điện, ngoài sân).
2. **Nhân vật tự đi lại**: phím WASD hoặc mũi tên, Shift để chạy, bấm vào sàn để đi tới đó, cần ảo trên điện thoại, kéo chuột để xoay camera, cuộn để phóng to. Phím K để quỳ và đứng. Camera đi theo sau nhân vật. Va chạm: `src/three/walk.ts`. Đồng bộ vị trí nhiều người: máy chủ nhận `POST /api/move` khoảng 5 lần mỗi giây, phát gộp sự kiện `moves` mỗi 150 ms; bỏ hẳn chỗ ngồi cố định. Thắp hương: nhân vật tự đi từ chỗ đang đứng tới bàn hương rồi quay về (chỉ khi đứng gần bàn hương).
3. **Khuôn viên ngoài chánh điện** (`src/three/yard.ts`): sân lát đá, hai ao sen (lá, hoa, cá chép, nước có gợn và ánh trăng), hành lang có mái hai bên, cây thông tỉa, cây bồ đề, tre, đèn đá, cổng tam quan, mái ngói cho chánh điện kèm biển tên, bầu trời đêm có trăng sao, đom đóm.
4. **Giao diện game**: bảng chọn kinh, bảng chọn nhạc, bản đồ nhỏ, biển tên khu vực khi bước vào (Chánh điện, Sân chùa, Ao sen, Hành lang, Tam quan), hướng dẫn phím lần đầu.

Giữ nguyên các quyết định cũ: không gọi là "chùa" hay "cúng dường" trên giao diện, không nhận quà tặng, luôn có dòng "không gian thư giãn mang tính giải trí".
