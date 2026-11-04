# Tâm Tịnh Tâm An · Không gian thư giãn mở 24/24

Một chánh điện 3D yên tĩnh trên web. Ai vào cũng có một nhân vật chibi ngồi trên tọa cụ, thấy nhau thời gian thực, cùng thắp hương, rung chuông, gõ mõ, gửi lời nguyện và thả đèn hoa đăng.

Đây là không gian thư giãn mang tính giải trí, không phải chùa và không đại diện cho tổ chức tôn giáo nào. Không thu tiền, không nhận quà tặng, không dính TikTok.

## Chạy thử trên máy

Bấm đúp `CHAY-WEB.bat`, rồi mở http://localhost:3200. Mở thêm vài tab để thấy nhiều người cùng ngồi trong chánh điện.

## Đưa lên mạng cho mọi người vào (24/24)

Cần một dịch vụ chạy được Node.js liên tục (không dùng được hosting tĩnh, vì cần máy chủ giữ kết nối thời gian thực):

1. Đưa thư mục này lên một repo GitHub.
2. Tạo dịch vụ mới trên Render, Railway hoặc Fly.io, chọn "Deploy from Docker" (đã có sẵn `Dockerfile`).
3. Cổng dùng biến `PORT` do dịch vụ cấp, không cần cấu hình thêm.
4. Gói miễn phí của Render sẽ ngủ khi không có ai vào; muốn chạy thật sự 24/24 thì chọn gói trả phí nhỏ.
5. Gắn tên miền riêng trong phần cài đặt của dịch vụ.

Nếu chỉ đưa file tĩnh (thư mục `dist`) lên hosting thường, trang vẫn mở được nhưng ở "chế độ một mình" (không thấy người khác).

## Cách hoạt động

- `server.ts`: Express, một luồng SSE `/api/stream` cho mỗi người, `/api/act` nhận thao tác. Giới hạn tốc độ theo người và theo IP, lọc từ cấm, chặn liên kết và số điện thoại trong lời nguyện, tối đa 120 người cùng lúc. Số liệu trong ngày lưu ở `data/stats.json`.
- `src/three/hall.ts`: toàn bộ chánh điện dựng bằng code (cột sơn son, sàn gỗ, đèn lồng, bàn thờ, tượng Phật, khói hương, cánh sen).
- `src/three/chibi.ts`: nhân vật chibi dựng bằng hình khối, 4 draw call mỗi người nên nhẹ máy.
- `src/three/world.ts`: camera, hiệu ứng sáng, đồng bộ người trong chánh điện.
- Những bạn ngồi không có tên là nhân vật trang trí cho đỡ vắng, không tính vào số người online.

## Tài nguyên

Giấy phép MIT chỉ áp dụng cho code. Nhạc nền `public/assets/audio/chill_relax.mp3` do mô hình AI ACE-Step tạo. Không còn dùng bất kỳ mô hình hay âm thanh nào của bên thứ ba.

## Điều khiển

- W A S D hoặc mũi tên để đi, Shift để chạy, bấm xuống sàn để đi tới đó, kéo chuột để xoay camera, cuộn để phóng to, K để quỳ lạy. Điện thoại: cần bên trái để đi, vuốt để xoay, chụm hai ngón để phóng to.
- Khuôn viên: chánh điện, sân vườn có hai ao sen, hành lang đi dạo hai bên, cây thông tỉa, cây bồ đề, tre, đèn đá và cổng tam quan (src/three/yard.ts). Vị trí mọi người được đồng bộ qua /api/move.

## Chỗ ngồi, hàng chờ, kinh và nhạc

- Chánh điện có 120 chỗ ngồi đánh số. Mỗi người ngồi tối đa 5 phút rồi bị mời đứng dậy, sau đó chờ 90 giây mới được ngồi lại. Đặt đúng số thì được đúng chỗ đó. Hết chỗ thì vào hàng chờ, ai chờ trước được xếp trước; vẫn được vào tham quan sân và chánh điện. Logic nằm ở server.ts (/api/seat) và src/layout.ts.
- Tụng kinh: các bài ngắn nằm trong src/sutras.ts. Bài dài thì thêm file .txt vào public/kinh theo hướng dẫn trong public/kinh/HUONG-DAN.txt.
- Nhạc nền: 5 bản tự tạo bằng WebAudio, chọn trong nút nhạc (src/audio.ts).
- Nhạc do Sếp Mộc làm: 9 bài mp3 trong public/assets/audio (Nam Mô A Di Đà Phật, Bát Nhã Tâm Kinh, Chú Đại Bi, Chú Lăng Nghiêm, Dược Sư Tâm Chú, Chú Dược Sư, Dược Sư Phật, Địa Tạng Vương Bồ Tát, Nam Mô Bổn Sư). Thêm bài mới: chép mp3 vào thư mục đó rồi thêm một dòng vào danh sách OWN_FILES ở đầu src/audio.ts.
- Trang phục: chọn nam hoặc nữ, áo lam, áo tràng, áo dài, áo bà ba, áo nâu sồng, màu áo, kiểu tóc và màu da (src/look.ts). Lựa chọn được nhớ trong trình duyệt và mọi người trong chánh điện đều thấy.

## Tài khoản, cấp độ, bảng vàng

- Đăng ký bằng tài khoản và mật khẩu (mật khẩu chỉ lưu dạng băm). Chơi khách vẫn được nhưng cấp độ chỉ tính trong lần ghé đó.
- Điểm công đức đến từ tu tập: lạy 8, thắp hương 40, rung chuông 6, lời nguyện 15, đèn hoa đăng 25, mỗi tiếng mõ 2, mỗi phút ngồi thiền 12, điểm danh mỗi ngày 20. Không có giới hạn thời gian để cày, chỉ có khoảng cách ngắn giữa hai lần cùng một hành động để hoạt ảnh không chồng nhau. Cấp tối đa 120 (src/progress.ts).
- Hào quang đổi theo cấp 10, 20, 50, 100, 120. Nón lá mở khóa ở cấp 5, 20, 50, 100.
- 20 huy hiệu, 6 bảng xếp hạng (công đức, hôm nay, lạy, niệm, thiền, chuyên cần). Điểm không liên quan đến tiền hay quà tặng.
- Hai hệ thống nhạc chạy riêng: nhạc nền và nhạc chùa của Sếp, mỗi bên có công tắc và âm lượng riêng.
- Xem trước hào quang của cấp bất kỳ trên màn hình mình: thêm ?previewlv=120 vào địa chỉ (không lưu, người khác không thấy).

## Đưa lên mạng công khai (có nhiều người và có lưu tài khoản)

Cần chạy server.ts liên tục. Dùng render.yaml (Render, gói starter có ổ đĩa giữ dữ liệu). Gói free của Render xóa ổ đĩa khi khởi động lại nên phải dùng thêm Upstash Redis miễn phí: đặt UPSTASH_REDIS_REST_URL và UPSTASH_REDIS_REST_TOKEN.
