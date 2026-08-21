# Mái Cúp Điện

PWA thông báo lịch cúp điện cho tỉnh Tây Ninh. Mỗi người chỉ theo dõi 1 xã/phường
duy nhất (chọn đơn vị điện lực → chọn xã/phường → chọn khu phố/ấp trong xã/phường
đó). Không cần đăng nhập, không cần cài đặt qua store — chỉ cần mở web, chọn khu
vực, bật thông báo.

Chỉ quét dữ liệu **2 lần/ngày** (6h sáng và 18h tối giờ Việt Nam). Có lịch mới thì
chỉ cập nhật lên web (màn hình trạng thái realtime), **không** đẩy thông báo ngay
lúc đó. Thông báo đẩy chỉ gửi **đúng 1 lần** cho mỗi lịch cúp điện, vào lần quét
gần nhất trước giờ cúp trong vòng 24h ("Mai cúp điện rồi, chuẩn bị trước nha!").

## Kiến trúc

```
GitHub Actions (cron, 2 lần/ngày: 6h sáng + 18h tối giờ VN)
   → scripts/lay-du-lieu.mjs              lặp qua TẤT CẢ đơn vị điện lực cấp
                                            huyện/thị xã trong danh-muc-dien-luc.json,
                                            gọi API EVNSPC — TỰ ĐỘNG nhận diện và bổ
                                            sung Xã/Phường + khu phố/ấp mới vào
                                            danh-muc-khu-pho.json nếu chưa có, TỰ
                                            LỌC bỏ "hộ kinh doanh/công ty..." lẫn
                                            trong dữ liệu nguồn (xem mục riêng bên dưới)
   → scripts/dong-bo-va-gui-thong-bao.mjs
        1) ghi vào Firestore (idempotent, không tạo trùng khi chạy lại) —
           CHỈ cập nhật dữ liệu, KHÔNG gửi push ở bước này
        2) gửi push "Mai cúp điện rồi, chuẩn bị trước nha!" ĐÚNG 1 LẦN cho mỗi
           bản ghi còn ≤24h nữa là tới giờ cúp và CHƯA từng được gửi (so bitmask
           với người đăng ký CÙNG xã/phường, query theo ma_phuong — không đọc
           hết toàn bộ người dùng)
        3) xoá các bản ghi lich_cup_dien đã quá thời gian kết thúc
   → Nếu danh-muc-khu-pho.json có thay đổi (phát hiện dữ liệu mới) →
     tự động commit + push lại vào repo

Trình duyệt người dùng (GitHub Pages)
   → index.html + src/app.js       chọn đơn vị điện lực → chọn xã/phường → chọn
                                     khu phố → xin quyền thông báo → lưu
                                     {ma_phuong, bitmask} vào Firestore
   → firebase-messaging-sw.js      service worker nhận push khi app không mở
```

### Vì sao chỉ quét 2 lần/ngày và chỉ báo 1 lần

Quyết định thiết kế có chủ đích: quét dày (mỗi 6 tiếng hay mỗi 15 phút) và báo
ngay khi phát hiện lịch mới tạo cảm giác làm phiền không cần thiết — người dùng
chỉ thực sự cần biết "**ngày mai/hôm nay có cúp điện không**", không cần biết
*khi nào* EVNSPC công bố lịch đó. Với lịch quét 6h & 18h, cửa sổ nhắc 24h đảm bảo
không bỏ sót: dù lịch được phát hiện ở lần quét nào, miễn còn ≤24h nữa là tới giờ
cúp, lần quét đó sẽ gửi thông báo ngay — nếu phát hiện sớm hơn 24h thì đợi đến
lần quét sau (gần giờ cúp hơn) mới gửi, tránh báo quá sớm khiến người dùng quên.

### 2 file danh mục — đừng nhầm lẫn

- **`data/danh-muc-dien-luc.json`** — danh sách **đơn vị điện lực cấp huyện/thị
  xã** (mã `madvi` + tên hiển thị dạng "Điện lực Trảng Bàng") mà script sẽ gọi
  API. File này **cần bạn tự điền tay** khi muốn crawl thêm 1 huyện/thị xã mới —
  hiện có sẵn 23 đơn vị của tỉnh Tây Ninh (cả vùng Tây Ninh cũ và Long An cũ).
  Giao diện dùng đúng field `ten_don_vi` trong file này để hiển thị tên đơn vị ở
  bước chọn đầu tiên — **không tự suy ra** từ dữ liệu khác, nên luôn hiển thị
  đúng "Điện lực X" thay vì mã số.
- **`data/danh-muc-khu-pho.json`** — danh sách **Xã/Phường + khu phố/ấp**,
  dùng cho giao diện chọn khu vực và tính bitmask. File này **được tự động bổ
  sung** bởi `lay-du-lieu.mjs` mỗi khi phát hiện tên Xã/Phường hoặc khu phố/ấp
  mới trong dữ liệu thật từ EVNSPC — bạn không cần (và không nên) tự gõ tay
  toàn bộ danh sách này, vì rất dễ sai lệch so với tên gọi chính thức EVNSPC
  đang dùng. Mỗi Xã/Phường có thêm field `loai_don_vi` ("Phường" hoặc "Xã") để
  hiển thị đầy đủ kiểu "Phường Trảng Bàng", "Xã Phước Chỉ" — nếu còn để trống
  (`""`), nghĩa là script chưa từng thấy Xã/Phường đó xuất hiện trong dữ liệu
  thật, sẽ tự điền đúng ở lần crawl kế tiếp khi phát hiện.

### Tự động lọc bỏ "hộ kinh doanh / công ty" lẫn trong dữ liệu nguồn

EVNSPC đôi khi liệt kê luôn tên hộ kinh doanh/công ty/trạm biến áp ngay trong
trường KHU VỰC lẫn với tên khu phố/ấp thật. `lay-du-lieu.mjs` có 1 danh sách từ
khoá loại bỏ (biến `TU_KHOA_LOAI_BO` — tìm trong file để xem/sửa): `hộ kinh doanh`, `hkd`, `công ty`, `cty`, `doanh nghiệp`, `dntn`, `cơ sở sản xuất`, `trạm biến áp`, `tba`, `nhà máy`, `xí nghiệp`, `chi nhánh`, `khách hàng`.

Nếu sau này thấy vẫn còn lọt tên lạ không phải khu phố/ấp thật, thêm từ khoá mới
vào biến `TU_KHOA_LOAI_BO` trong `scripts/lay-du-lieu.mjs` — không cần sửa gì
thêm ở chỗ khác.

### Mô hình bitset — bitmask CỤC BỘ theo từng xã/phường

**mỗi xã/phường có bảng bit riêng, độc lập với xã/phường khác**. Vị trí (index)
của 1 khu phố trong mảng `khu_pho` của xã/phường đó chính là `chi_so_bit` dùng
cho bitmask — xem `data/danh-muc-khu-pho.json`.

Vì mỗi người chỉ đăng ký 1 xã/phường, tài liệu `dang_ky_thong_bao/{token}` lưu
`{ ma_phuong, bitmask }`. Điều này giải quyết đồng thời 2 vấn đề khi mở rộng quy
mô lớn:

1. **Trùng tên khu phố giữa các xã/phường khác nhau** (vd "Khu phố 1" xuất
   hiện ở nhiều xã) — không còn là vấn đề vì bitmask không dùng chung không
   gian số giữa các phường.
2. **Hiệu năng khi gửi thông báo** — chỉ query đúng người đăng ký CÙNG xã/phường
   (`where("ma_phuong", "==", ...)`), nên vẫn nhanh dù số người dùng tăng lên
   hàng nghìn.

**QUY TẮC BẤT BIẾN của `data/danh-muc-khu-pho.json`** (áp dụng khi dự án đã ổn
định, có nhiều người dùng thật): chỉ được **thêm** tên khu phố mới vào **cuối**
mảng `khu_pho` của 1 xã/phường. Không xoá, đổi tên, hay sắp xếp lại — vì vị trí
trong mảng chính là bit đã "cấp phát" cho người đã đăng ký trước đó.

*(Ở giai đoạn đang xây dựng/thử nghiệm như hiện tại, việc chuẩn hoá lại tên gọi
cho rõ ràng — như đổi "KP 1" thành "Khu phố 1" — vẫn ưu tiên hơn giữ nguyên thứ
tự, miễn còn ít người dùng thật; càng về sau càng nên tuân thủ nghiêm quy tắc
này để không phá đăng ký của người dùng.)*

### Cách thêm 1 huyện/thị xã mới

Mở `data/danh-muc-dien-luc.json`, thêm 1 phần tử mới vào mảng `don_vi`:

```json
{ "ma_dien_luc": "PBxxxx", "ten_don_vi": "Điện lực Tên Huyện" }
```

- `ma_dien_luc` là tham số `madvi` tra trên trang gốc của EVNSPC:
  https://www.cskh.evnspc.vn/TraCuu/LichNgungGiamCungCapDien (chọn đơn vị
  tương ứng, xem tham số `madvi` gửi lên trong network request).
- `ten_don_vi` nên viết đầy đủ dạng "Điện lực Tên Huyện" — đây chính là chuỗi
  hiển thị cho người dùng ở bước chọn đầu tiên trên web.
- Sau khi thêm, lần chạy `lay-du-lieu.mjs` tiếp theo sẽ tự động crawl đơn vị
  này và tự bổ sung mọi Xã/Phường + khu phố/ấp phát hiện được vào
  `data/danh-muc-khu-pho.json` — không cần làm gì thêm.

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
    match /dang_ky_thong_bao/{token} {
      allow get: if request.auth == null;
      allow list: if false;
      allow write: if request.resource.data.keys().hasAll(['bitmask', 'ma_phuong']);
    }
    match /lich_cup_dien/{id} {
      allow read: if true;
      allow write: if false; // Admin SDK dung service account, khong bi Rules chan
    }
  }
}
```

**Lưu ý bảo mật:** vì không có đăng nhập, "khoá" bảo vệ dữ liệu đăng ký chính là bản thân FCM token (chuỗi ngẫu nhiên dài, khó đoán). Đây là đánh đổi hợp lý cho MVP không cần tài khoản.

### 3b. Composite Index bắt buộc cho việc gửi nhắc

`scripts/dong-bo-va-gui-thong-bao.mjs` chạy 1 truy vấn kết hợp 3 điều kiện
(`da_gui_nhac == false` + `tu_luc > ...` + `tu_luc <= ...`) — Firestore **bắt
buộc phải có composite index** cho kiểu truy vấn này.

Cách tạo index dễ nhất: chạy thử script 1 lần (xem mục "Chạy thử trên máy" bên
dưới) — nếu thiếu index, Firestore sẽ báo lỗi kèm theo **đường link tạo sẵn**,
chỉ cần bấm vào link đó và bấm "Create Index" trên Firebase Console, đợi vài
phút là xong.

### 4. (Khuyến nghị) Bật Firestore TTL tự động

1. Vào **Firestore → TTL** (trong Console) → Create policy
2. Collection: `lich_cup_dien`, Timestamp field: `den_luc`

### 5. Bật GitHub Pages

**Settings → Pages** → Source: chọn nhánh `main`, thư mục `/ (root)`.

### 6. Chạy thử thủ công lần đầu

Vào tab **Actions** của repo → chọn workflow "Cap nhat lich cup dien va gui
thong bao" → **Run workflow** để chạy tay lần đầu (không cần chờ tới lịch cron).

## Chạy thử trên máy (không qua GitHub Actions)

```bash
npm install
node scripts/lay-du-lieu.mjs                 # tạo data/lich-tho.json (tất cả đơn vị đã có trong danh-muc-dien-luc.json)
FIREBASE_SERVICE_ACCOUNT_KEY_JSON='{...}' node scripts/dong-bo-va-gui-thong-bao.mjs
```

Xem trang bằng server tĩnh bất kỳ (service worker cần chạy qua http/https, không mở trực tiếp file://):

```bash
npx serve .
```

## Lưu ý về iOS

Web Push chỉ hoạt động trên iOS 16.4+, và bắt buộc người dùng phải **"Thêm vào Màn hình chính"** trước khi bật thông báo — mở qua Safari trình duyệt thường sẽ không nhận được push. Trang đã có ghi chú hướng dẫn việc này ngay trong giao diện.

## Về việc chỉ báo 1 lần — sai số và giới hạn

- Chạy 2 lần/ngày (6h & 18h), nên thời điểm gửi thực tế có thể lệch tối đa
  ~12 tiếng so với đúng mốc 24h trước giờ cúp — ví dụ lịch cúp 7h sáng thì
  thông báo có thể tới lúc 18h chiều hôm trước (sớm hơn 24h khoảng 13 tiếng)
  thay vì đúng 7h sáng hôm trước, tuỳ lần quét nào bắt được lịch đó trước.
- Nếu 1 lịch cúp điện được **phát hiện lần đầu** khi đã còn CHƯA đến 24h nữa
  (ví dụ EVNSPC công bố gấp), hệ thống vẫn gửi ngay trong lần quét đó — trễ
  còn hơn không.
