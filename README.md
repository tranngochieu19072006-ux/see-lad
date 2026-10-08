# SEE LAD - Nền tảng nhắn tin & kết nối đa phương tiện

Được phát triển và thiết kế bởi: **TRẦN NGỌC HIẾU**

---

## 🌟 Giới thiệu

**SEE LAD** là ứng dụng web/app giao tiếp thời gian thực hiện đại, phong cách Cyber-clean / Glassmorphism kết hợp các hiệu ứng Animation mượt mà và trực quan.

## 🚀 Cách chạy ứng dụng

### Cách 1: Chạy trực tiếp qua trình duyệt (Đơn giản nhất)
Chỉ cần nhấp đúp vào tệp `index.html` hoặc chuột phải chọn **Open with** -> **Google Chrome**, **Microsoft Edge**, **Brave** hoặc trình duyệt bất kỳ.

### Cách 2: Chạy qua máy chủ nội bộ Python
Mở Terminal / PowerShell tại thư mục này và chạy:
```powershell
python -m http.server 3000
```
Sau đó mở trình duyệt truy cập: `http://localhost:3000`

---

## ✨ Danh sách tính năng nổi bật

1. **Màn hình giới thiệu Tác giả (Intro Animation)**:
   - Hiệu ứng gõ phím cơ (Keystroke typewriter) mô phỏng âm thanh chân thực bằng Web Audio API.
   - Trình diễn kịch bản gõ và xóa chữ mượt mà theo đúng nội dung tác giả Trần Ngọc Hiếu.
   - Nút khám phá chuyển cảnh 3D vào trang đăng nhập.

2. **Đăng nhập & Trạng thái hoạt động**:
   - Giao diện Glassmorphism 3D hiện đại.
   - Đăng nhập nhanh bằng 1 cú nhấp với các tài khoản mẫu (Trần Ngọc Hiếu, Thảo Nhi, Hoàng Nam, Minh Quân).
   - Bộ chọn trạng thái thời gian thực với đèn dạ quang:
     - 🟢 **Online (Xanh)**: Nhấp nháy vòng pulse êm ái.
     - 🟡 **Đang bận (Vàng)**: Ánh sáng hổ phách.
     - 🔴 **Offline (Đỏ)**: Trạng thái ngoại tuyến.

3. **Nhắn tin cá nhân & Nhóm (Chat & Groups)**:
   - Nhắn tin 1-1 và tạo Nhóm chat mới tùy chỉnh thành viên.
   - Đổi chủ đề màu sắc đoạn chat tức thì (Cyber Indigo, Sunset Blaze, Emerald Matrix, Midnight Neon).
   - Ghim tin nhắn (Pinned Messages) cố định trên đầu đoạn chat.
   - Bộ biểu tượng Emoji và icon màu sắc rực rỡ.
   - Gửi ảnh, video xem trực tiếp, tệp đính kèm không giới hạn.

4. **Cuộc gọi Thoại & Video HD**:
   - Giao diện cuộc gọi hiện đại với âm thanh chuông reo thực tế.
   - Bộ đếm thời lượng cuộc gọi chính xác.
   - Điều khiển Bật/Tắt Micro, Camera và kết thúc cuộc gọi.

5. **Ghi âm giọng nói HD (Khử nhiễu & Vẽ sóng âm)**:
   - Tích hợp chuẩn âm thanh khử ồn (Noise Suppression & Echo Cancellation).
   - Vẽ sóng âm trực tiếp thời gian thực trên HTML5 Canvas.
   - Nghe lại và gửi tin nhắn thoại với thanh phát âm thanh.

6. **Radar vị trí & Khoảng cách bạn bè (Leaflet GPS)**:
   - Bản đồ tương tác mượt mà tự động đồng bộ theo chế độ Sáng / Tối.
   - Tính toán khoảng cách (km) giữa bạn và bạn bè xung quanh.
   - Hiệu ứng quét radar lan tỏa (Radar Sweep).
   - Nhắn tin hoặc gọi điện trực tiếp từ ghim vị trí trên bản đồ.

7. **QR Studio - Bộ tùy biến mã QR cá nhân hóa**:
   - Tùy chỉnh màu sắc mã QR (Indigo, Emerald, Sunset, Gold, Đen hoặc mã màu tùy chọn).
   - Đổi kiểu dáng chấm QR (Bo tròn, Chấm tròn, Vuông góc).
   - Chèn ảnh đại diện Avatar hoặc logo vào tâm mã QR.
   - Tải về ảnh PNG chất lượng cao có khung thẻ định danh số để in hoặc chia sẻ.

8. **Hub truyền file không giới hạn & QR tải nhanh**:
   - Kéo thả file bất kỳ (Video, Ảnh, File Zip nén, PDF) không giới hạn kích thước.
   - Tự động tạo mã QR cho nội dung và file: người khác chỉ cần quét mã bằng điện thoại là xem hoặc tải được ngay.

9. **Bong bóng chat nổi (Chat Head kiểu Messenger)**:
   - Bong bóng nổi có thể kéo thả tự do khắp màn hình, tự động hít vào cạnh viền.
   - Bấm vào bong bóng để mở khung chat mini nhắn tin nhanh.

10. **Lên lịch tin nhắn & Nhắc hẹn khi Offline**:
    - Lên lịch gửi tin nhắn và nhắc công việc.
    - Tự động báo nhắc nhở khi bạn quay lại ứng dụng.

11. **Chế độ Sáng / Tối (Light & Dark Theme)**:
    - Nút bấm chuyển đổi nhanh với hiệu ứng xoay biểu tượng mặt trời / mặt trăng và chuyển màu nền êm ái.

12. **Bảo mật & Quản lý**:
    - Tính năng Chặn người dùng (Block / Unblock).
    - Báo cáo vi phạm (Report User) với form chọn lý do chuẩn mực.
    - Liên kết mời tham gia (Invite Links) có nút **"Đổi mã liên kết mới"** để vô hiệu hóa ngay các link cũ.
