# Mai Cúp Điện

PWA thông báo lịch cúp điện cho tỉnh Tây Ninh. Mỗi người chỉ theo dõi 1 xã/phường
duy nhất (chọn xã/phường trước, rồi chọn khu phố trong xã/phường đó). Không cần
đăng nhập, không cần cài đặt qua store — chỉ cần mở web, chọn khu vực, bật thông báo.

Ngoài thông báo ngay khi phát hiện lịch mới, hệ thống còn tự động **nhắc lại
riêng khoảng 24 giờ trước giờ cúp điện** (ví dụ lịch cúp lúc 7h ngày mai thì
sáng nay khoảng 7h sẽ có tin nhắc "Mai cúp điện rồi, chuẩn bị trước nha!").

## Kiến trúc

```
GitHub Actions #1 (cron, mỗi 6 tiếng)
   → scripts/lay-du-lieu.mjs              lặp qua TẤT CẢ đơn vị điện lực cấp
                                            huyện/thị xã trong danh-muc-dien-luc.json,
                                            gọi API EVNSPC — TỰ ĐỘNG nhận diện và bổ
                                            sung Xã/Phường + khu phố/ấp mới vào
                                            danh-muc-khu-pho.json nếu chưa có
   → scripts/dong-bo-va-gui-thong-bao.mjs
        1) ghi vào Firestore (idempotent, không tạo trùng khi chạy lại)
        2) với bản ghi MỚI: so bitmask với người đăng ký CÙNG xã/phường
           (query theo ma_phuong, không đọc hết toàn bộ người dùng) → gửi push
           "Sắp cúp điện" ngay lập tức
        3) xoá các bản ghi lich_cup_dien đã quá thời gian kết thúc
   → Nếu danh-muc-khu-pho.json có thay đổi (phát hiện dữ liệu mới) →
     tự động commit + push lại vào repo

GitHub Actions #2 (cron, mỗi 15 phút) — LUỒNG RIÊNG
   → scripts/nhac-truoc-gio-cup-dien.mjs   tìm các bản ghi còn ≤24h nữa là tới giờ
                                            cúp và CHƯA được nhắc (da_gui_nhac == false)
                                            → gửi "Mai cúp điện rồi, chuẩn bị trước nha!"
                                            → đánh dấu da_gui_nhac = true

Trình duyệt người dùng (GitHub Pages)
   → index.html + src/app.js       chọn xã/phường → chọn khu phố → xin quyền
                                     thông báo → lưu {ma_phuong, bitmask} vào Firestore
   → firebase-messaging-sw.js      service worker nhận push khi app không mở
```

### 2 file danh mục — đừng nhầm lẫn

- **`data/danh-muc-dien-luc.json`** — danh sách **đơn vị điện lực cấp huyện/thị
  xã** (mã `madvi`) mà script sẽ gọi API. File này **cần bạn tự điền tay** khi
  muốn crawl thêm 1 huyện/thị xã mới — hiện có sẵn 23 đơn vị của tỉnh Tây Ninh
  (cả vùng Tây Ninh cũ và Long An cũ).
- **`data/danh-muc-khu-pho.json`** — danh sách **Xã/Phường + khu phố/ấp**,
  dùng cho giao diện chọn khu vực và tính bitmask. File này **được tự động bổ
  sung** bởi `lay-du-lieu.mjs` mỗi khi phát hiện tên Xã/Phường hoặc khu phố/ấp
  mới trong dữ liệu thật từ EVNSPC — bạn không cần (và không nên) tự gõ tay
  toàn bộ danh sách này, vì rất dễ sai lệch so với tên gọi chính thức EVNSPC
  đang dùng.

### Mô hình bitset — bitmask CỤC BỘ theo từng xã/phường

Khác với bản đầu (chỉ 1 phường Trảng Bàng, đánh bit toàn cục), từ khi mở rộng
cả tỉnh: **mỗi xã/phường có bảng bit riêng, độc lập với xã/phường khác**. Vị
trí (index) của 1 khu phố trong mảng `khu_pho` của xã/phường đó chính là
`chi_so_bit` dùng cho bitmask — xem `data/danh-muc-khu-pho.json`.

Vì mỗi người chỉ đăng ký 1 xã/phường, tài liệu `dang_ky_thong_bao/{token}` giờ
lưu `{ ma_phuong, bitmask }` thay vì mảng tên khu phố toàn cục. Điều này giải
quyết đồng thời 2 vấn đề khi mở rộng quy mô lớn:

1. **Trùng tên khu phố giữa các xã/phường khác nhau** (vd "Khu phố 1" xuất
   hiện ở nhiều xã) — không còn là vấn đề vì bitmask không dùng chung không
   gian số giữa các phường.
2. **Hiệu năng khi gửi thông báo** — thay vì đọc TOÀN BỘ người đăng ký trong
   cả tỉnh mỗi lần có lịch mới, giờ chỉ query đúng người đăng ký CÙNG xã/phường
   (`where("ma_phuong", "==", ...)`), nên vẫn nhanh dù số người dùng tăng lên
   hàng nghìn.

**QUY TẮC BẤT BIẾN của `data/danh-muc-khu-pho.json`:** chỉ được **thêm** tên
khu phố mới vào **cuối** mảng `khu_pho` của 1 xã/phường (script tự làm đúng
quy tắc này — nếu bạn sửa tay, phải giữ đúng quy tắc). Không bao giờ xoá, đổi
tên, hay sắp xếp lại — vì vị trí trong mảng chính là bit đã "cấp phát" cho
người đã đăng ký trước đó, đổi vị trí sẽ làm bitmask cũ trỏ nhầm sang khu phố khác.

### Cách thêm 1 huyện/thị xã mới

Mở `data/danh-muc-dien-luc.json`, thêm 1 phần tử mới vào mảng `don_vi`:

```json
{ "ma_dien_luc": "PBxxxx", "ten_don_vi": "Điện lực Tên Huyện" }
```

- `ma_dien_luc` là tham số `madvi` tra trên trang gốc của EVNSPC:
  https://www.cskh.evnspc.vn/TraCuu/LichNgungGiamCungCapDien (chọn đơn vị
  tương ứng, xem tham số `madvi` gửi lên trong network request).
- Sau khi thêm, lần chạy `lay-du-lieu.mjs` tiếp theo sẽ tự động crawl đơn vị
  này và tự bổ sung mọi Xã/Phường + khu phố/ấp phát hiện được vào
  `data/danh-muc-khu-pho.json` — không cần làm gì thêm.
- Vì dữ liệu chỉ xuất hiện khi EVNSPC **thực sự công bố lịch cúp điện** cho
  khu vực đó, 1 Xã/Phường có thể mất một thời gian mới hiện đủ trong danh sách
  chọn của người dùng (tuỳ tần suất cúp điện thật của khu vực đó).

### Nếu muốn sửa tay `data/danh-muc-khu-pho.json`

Vẫn làm được (ví dụ bạn có sẵn danh sách chính xác từ nguồn khác, muốn nạp
trước cho nhanh thay vì chờ tự khám phá) — chỉ cần theo đúng mẫu:

```json
"TN-VIDU": {
  "ten_phuong": "Tên xã hoặc phường",
  "ten_huyen": "Tên thị xã/huyện (có thể để trống)",
  "ma_dien_luc": "PBxxxx",
  "khu_pho": ["Khu phố 1", "Khu phố 2", "..."]
}
```

**Lưu ý quan trọng:** nếu 1 Xã/Phường đã có người dùng thật đăng ký (đã có
`ma_phuong` đó trong Firestore), **không được sửa lại thứ tự hoặc xoá bớt**
các phần tử đã có trong mảng `khu_pho` — chỉ được thêm mới vào cuối, nếu không
sẽ làm sai bitmask của người đã đăng ký trước đó.

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
    // Cho phep DOC lai chinh tai lieu cua minh (can de app kiem tra "da dang ky chua"
    // khi mo lai trang), nhung KHONG cho doc tai lieu cua nguoi khac.
    match /dang_ky_thong_bao/{token} {
      allow get: if request.auth == null; // Firestore khong phan biet duoc "chinh minh" khi khong dang nhap,
                                            // nen o day cho phep doc theo dung token (token nhu 1 "mat khau ngau nhien"
                                            // ma chi thiet bi cua ho moi biet) — chap nhan duoc voi quy mo MVP.
      allow list: if false; // KHONG cho liet ke toan bo danh sach dang ky cua moi nguoi
      allow write: if request.resource.data.keys().hasAll(['bitmask', 'ma_phuong']);
    }
    // lich_cup_dien: ai cung doc/query duoc (can thiet cho man hinh trang thai),
    // chi Admin SDK (GitHub Actions) moi ghi duoc
    match /lich_cup_dien/{id} {
      allow read: if true;
      allow write: if false; // Admin SDK dung service account, khong bi Rules chan
    }
  }
}
```

**⚠️ Nếu bạn đang nâng cấp từ bản chỉ có Trảng Bàng:** nhớ vào lại Firestore →
Rules và sửa `hasAll(['bitmask', 'ma_khu_pho'])` thành
`hasAll(['bitmask', 'ma_phuong'])` như trên — nếu không sửa, đăng ký của người
dùng sẽ bị Firestore từ chối ghi (lỗi `permission-denied`) vì tài liệu mới
không còn trường `ma_khu_pho` nữa.

**Lưu ý bảo mật:** vì không có đăng nhập, "khoá" bảo vệ dữ liệu đăng ký chính là bản thân FCM token (chuỗi ngẫu nhiên dài, khó đoán). Đây là đánh đổi hợp lý cho MVP không cần tài khoản, nhưng không phải bảo mật tuyệt đối — nếu sau này mở rộng và cần chặt chẽ hơn, nên cân nhắc Firebase Anonymous Auth để có `request.auth.uid` thật sự kiểm tra được.

### 3b. Composite Index bắt buộc cho luồng "nhắc trước giờ"

`scripts/nhac-truoc-gio-cup-dien.mjs` chạy 1 truy vấn kết hợp 3 điều kiện
(`da_gui_nhac == false` + `tu_luc > ...` + `tu_luc <= ...`) — Firestore **bắt
buộc phải có composite index** cho kiểu truy vấn này, khác với các truy vấn
1 điều kiện ở nơi khác trong dự án (những cái đó dùng single-field index, tự
tạo sẵn).

Cách tạo index dễ nhất: chạy thử `node scripts/nhac-truoc-gio-cup-dien.mjs`
1 lần (xem mục "Chạy thử trên máy" bên dưới) — nếu thiếu index, Firestore sẽ
báo lỗi kèm theo **đường link tạo sẵn**, chỉ cần bấm vào link đó và bấm
"Create Index" trên Firebase Console, đợi vài phút là xong (không cần tự tạo
tay từng field).

### 4. (Khuyến nghị) Bật Firestore TTL tự động

Ngoài việc `scripts/dong-bo-va-gui-thong-bao.mjs` tự xoá bản ghi hết hạn mỗi lần chạy, bạn nên bật thêm TTL gốc của Firestore để chắc chắn:

1. Vào **Firestore → TTL** (trong Console) → Create policy
2. Collection: `lich_cup_dien`, Timestamp field: `den_luc`

### 5. Bật GitHub Pages

**Settings → Pages** → Source: chọn nhánh `main`, thư mục `/ (root)`.

### 6. Chạy thử thủ công lần đầu

Vào tab **Actions** của repo → có 2 workflow:

- "Cap nhat lich cup dien va gui thong bao" (crawl + thông báo lịch mới)
- "Nhac truoc gio cup dien" (nhắc riêng trước 24h)

Bấm **Run workflow** ở từng cái để chạy tay lần đầu (không cần chờ tới lịch cron).

## Chạy thử trên máy (không qua GitHub Actions)

```bash
npm install
node scripts/lay-du-lieu.mjs                 # tạo data/lich-tho.json (tất cả xã/phường đã có ma_dien_luc)
FIREBASE_SERVICE_ACCOUNT_KEY_JSON='{...}' node scripts/dong-bo-va-gui-thong-bao.mjs
FIREBASE_SERVICE_ACCOUNT_KEY_JSON='{...}' node scripts/nhac-truoc-gio-cup-dien.mjs
```

Xem trang bằng server tĩnh bất kỳ (service worker cần chạy qua http/https, không mở trực tiếp file://):

```bash
npx serve .
```

## Lưu ý về iOS

Web Push chỉ hoạt động trên iOS 16.4+, và bắt buộc người dùng phải **"Thêm vào Màn hình chính"** trước khi bật thông báo — mở qua Safari trình duyệt thường sẽ không nhận được push. Trang đã có ghi chú hướng dẫn việc này ngay trong giao diện.

## Về "nhắc trước giờ cúp điện" — sai số và giới hạn

- Workflow nhắc chạy mỗi 15 phút, nên thời điểm gửi thực tế có thể lệch tối đa
  ~15 phút so với đúng "24h trước giờ cúp".
- Nếu 1 lịch cúp điện được **phát hiện lần đầu** khi đã còn CHƯA đến 24h nữa
  (ví dụ EVNSPC công bố gấp, chỉ trước 10 tiếng), hệ thống vẫn gửi nhắc ngay
  trong lần chạy gần nhất — trễ còn hơn không, theo đúng lựa chọn thiết kế.
- Vì luồng "nhắc trước giờ" và luồng "thông báo phát hiện lịch mới" là 2 luồng
  độc lập, trong trường hợp trên người dùng có thể nhận được **2 thông báo gần
  sát nhau** (1 lúc phát hiện, 1 lúc nhắc) — đây là đánh đổi có chủ đích để
  không bỏ sót ai, nếu muốn gộp lại thành 1 thông báo duy nhất trong trường
  hợp này, cần sửa thêm logic (có thể trao đổi thêm nếu cần).
