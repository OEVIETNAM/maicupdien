# Mái Cúp Điện

PWA thông báo lịch cúp điện trước 1 ngày cho phường Trảng Bàng, Tây Ninh.
Không cần đăng nhập, không cần cài đặt qua store — chỉ cần mở web, chọn khu phố, bật thông báo.

## Kiến trúc

```
GitHub Actions (cron, mỗi 6 tiếng)
   → scripts/lay-du-lieu.mjs        gọi thẳng API thật của EVNSPC, lọc theo 14 khu phố Trảng Bàng
   → scripts/dong-bo-va-gui-thong-bao.mjs
        1) ghi vào Firestore (idempotent, không tạo trùng khi chạy lại)
        2) so bitmask giữa bản ghi MỚI và người đăng ký → gửi push FCM
        3) xoá các bản ghi lich_cup_dien đã quá thời gian kết thúc

Trình duyệt người dùng (GitHub Pages)
   → index.html + src/app.js       chọn khu phố, xin quyền thông báo, lưu bitmask vào Firestore
   → firebase-messaging-sw.js      service worker nhận push khi app không mở
```

### Mô hình bitset

Mỗi khu phố có 1 `chi_so_bit` cố định (xem `data/danh-muc-khu-pho.json`), không tái sử dụng số cũ dù sau này xoá khu phố nào. Đăng ký của người dùng và bản ghi lịch cúp điện đều lưu dưới dạng bitmask (`BigInt`, chuyển thành chuỗi khi lưu Firestore vì Firestore không hỗ trợ BigInt). So khớp chỉ cần 1 phép AND — mở rộng thêm hàng chục nghìn khu phố toàn quốc vẫn nhẹ, không cần đổi cấu trúc.

Muốn mở rộng thêm phường/tỉnh khác: chỉ cần thêm dòng mới vào `data/danh-muc-khu-pho.json` với `chi_so_bit` = số lớn nhất hiện có + 1.

## Thiết lập lần đầu

### 1. Tạo dự án Firebase

1. Vào [Firebase Console](https://console.firebase.google.com) → Tạo dự án mới
2. Bật **Firestore Database** (chế độ Production)
3. Bật **Cloud Messaging**
4. Vào **Project settings → General → Your apps** → thêm 1 Web App → copy cấu hình vào `src/cau-hinh-firebase.js` **và** `firebase-messaging-sw.js` (phải điền cả 2 chỗ, vì service worker không đọc được ES module)
5. Vào **Project settings → Cloud Messaging → Web configuration → Web Push certificates** → bấm "Generate key pair" → copy VAPID key vào `VAPID_KEY_CONG_KHAI` trong `src/cau-hinh-firebase.js`

### 2. Tạo Service Account cho GitHub Actions

1. Vào **Project settings → Service accounts** → "Generate new private key" → tải file JSON
2. Vào repo GitHub → **Settings → Secrets and variables → Actions** → New repository secret
   - Tên: `FIREBASE_SERVICE_ACCOUNT_KEY_JSON`
   - Giá trị: dán nguyên nội dung file JSON vừa tải

### 3. Firestore Security Rules

Vào Firestore → Rules, dán:

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    // Nguoi dung tu ghi dang ky cua chinh minh (doc id = FCM token cua ho)
    match /dang_ky_thong_bao/{token} {
      allow read: if false;       // khong ai doc duoc danh sach dang ky cua nguoi khac
      allow write: if request.resource.data.keys().hasAll(['bitmask', 'ma_khu_pho']);
    }
    // lich_cup_dien chi GitHub Actions (Admin SDK) moi ghi duoc, ai cung doc duoc de hien thi cong khai neu can
    match /lich_cup_dien/{id} {
      allow read: if true;
      allow write: if false; // Admin SDK dung service account, khong bi Rules chan
    }
  }
}
```

### 4. (Khuyến nghị) Bật Firestore TTL tự động

Ngoài việc `scripts/dong-bo-va-gui-thong-bao.mjs` tự xoá bản ghi hết hạn mỗi lần chạy, bạn nên bật thêm TTL gốc của Firestore để chắc chắn:

1. Vào **Firestore → TTL** (trong Console) → Create policy
2. Collection: `lich_cup_dien`, Timestamp field: `den_luc`

### 5. Bật GitHub Pages

**Settings → Pages** → Source: chọn nhánh `main`, thư mục `/ (root)`.

### 6. Chạy thử thủ công lần đầu

Vào tab **Actions** của repo → chọn workflow "Cập nhật lịch cúp điện..." → **Run workflow** để chạy tay lần đầu (không cần chờ tới lịch cron).

## Chạy thử trên máy (không qua GitHub Actions)

```bash
npm install
node scripts/lay-du-lieu.mjs                 # tạo data/lich-tho.json
FIREBASE_SERVICE_ACCOUNT_KEY_JSON='{...}' node scripts/dong-bo-va-gui-thong-bao.mjs
```

Xem trang bằng server tĩnh bất kỳ (service worker cần chạy qua http/https, không mở trực tiếp file://):

```bash
npx serve .
```

## Lưu ý về iOS

Web Push chỉ hoạt động trên iOS 16.4+, và bắt buộc người dùng phải **"Thêm vào Màn hình chính"** trước khi bật thông báo — mở qua Safari trình duyệt thường sẽ không nhận được push. Trang đã có ghi chú hướng dẫn việc này ngay trong giao diện.
