
# Ứng Dụng Nhắc Nhở Lịch Cúp Điện Tỉnh Tây Ninh

> 💡 **Lý do ra đời:** Mỗi lần cúp điện thường bị động và không biết trước để chuẩn bị. Ứng dụng này được tạo ra nhằm giải quyết vấn đề đó bằng cách quét và tự động gửi thông báo trước **1 ngày** cho người dân trước khi có lịch cúp điện, giúp bạn chủ động hơn trong sinh hoạt và công việc.

---

## 🛠️ Công Nghệ Sử Dụng

* **Backend / Database:** Google Firebase (Spark Plan - Bản miễn phí).
* **Tính năng chính:** Tự động quét lịch cúp điện và gửi thông báo đẩy (Push Notification) đến người dùng.

---

## 📍 Phạm Vi Hoạt Động Hiện Tại

* Hiện tại, ứng dụng đang được cấu hình sẵn để quét lịch cúp điện dành riêng cho khu vực **tỉnh Tây Ninh** (do giới hạn tài nguyên của gói Firebase Free).

---

## 🌍 Hướng Dẫn Dành Cho Các Tỉnh Thành Khác (Clone & Customize)

Nếu bạn muốn triển khai ứng dụng này cho tỉnh thành hoặc khu vực của riêng mình, hãy làm theo các bước sau:

1. **Clone dự án về máy:**

```bash
git clone <URL_REPOSITORY_CUA_BAN>

```

2. **Cấu hình lại Firebase:**

* Tạo một dự án Firebase mới (hoặc sử dụng project cá nhân).
* Thay thế thông số cấu hình Firebase trong mã nguồn của bạn.

3. **Thay đổi nguồn dữ liệu lịch cúp điện:**

* Cập nhật lại phần cào dữ liệu (crawler) hoặc nguồn API lịch cúp điện phù hợp với khu vực/tỉnh thành bạn muốn hướng tới.

4. **Triển khai (Deploy):**

* Đưa dự án lên hosting (Firebase Hosting, Vercel, hoặc Render...) để bắt đầu sử dụng.

---

## 🤝 Đóng Góp (Contributing)

Mọi đóng góp, báo lỗi (issue) hoặc kéo yêu cầu (pull request) để cải thiện ứng dụng đều rất hoan nghênh. Hãy thoải mái fork và phát triển thêm tính năng cho cộng đồng nhé!

---

Bạn có muốn bổ sung thêm hướng dẫn cài đặt chi tiết (lệnh chạy code, cấu hình env) vào file README này luôn không?
