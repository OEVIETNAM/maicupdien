// Service Worker chinh cua PWA. Lam 2 nhiem vu:
// 1) Nhan push notification tu FCM ngay ca khi app dang khong mo (Firebase Messaging)
// 2) Cache mot so file tinh de PWA co the cai dat va mo lai nhanh (offline shell)
//
// LUU Y quan trong ve trien khai: file nay PHAI nam o thu muc GOC cua site
// (cung cap voi index.html), khong duoc dat trong thu muc con, vi pham vi
// (scope) cua service worker mac dinh la thu muc chua no.

importScripts("https://www.gstatic.com/firebasejs/10.12.2/firebase-app-compat.js");
importScripts("https://www.gstatic.com/firebasejs/10.12.2/firebase-messaging-compat.js");

// Firebase Messaging trong service worker khong doc duoc ES module,
// nen phai khai bao lai cau hinh o day (copy tay tu src/cau-hinh-firebase.js
// moi khi thay doi — day la han che ky thuat cua Firebase, khong phai loi thiet ke).
firebase.initializeApp({
  apiKey: "DIEN_API_KEY_CUA_BAN",
  authDomain: "TEN_DU_AN.firebaseapp.com",
  projectId: "TEN_DU_AN",
  storageBucket: "TEN_DU_AN.appspot.com",
  messagingSenderId: "SO_DIEN_THOAI_GUI_TIN",
  appId: "APP_ID_CUA_BAN",
});

const messaging = firebase.messaging();

// Hien thong bao khi nhan push luc app dang chay nen (background)
messaging.onBackgroundMessage((payload) => {
  const tieu_de = payload?.notification?.title || "Lịch cúp điện";
  const noi_dung = payload?.notification?.body || "";
  self.registration.showNotification(tieu_de, {
    body: noi_dung,
    icon: "icons/icon-192.png",
    badge: "icons/icon-192.png",
    vibrate: [200, 100, 200],
  });
});

// ---- Phan cache offline shell (tach biet voi phan messaging o tren) ----
const TEN_BO_NHO_DEM = "mai-cup-dien-v1";
const CAC_FILE_CAN_CACHE = [
  "./",
  "./index.html",
  "./manifest.webmanifest",
  "./src/style.css",
  "./src/app.js",
  "./src/bitset.js",
  "./src/cau-hinh-firebase.js",
  "./data/danh-muc-khu-pho.json",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
];

self.addEventListener("install", (su_kien) => {
  su_kien.waitUntil(
    caches.open(TEN_BO_NHO_DEM).then((bo_nho_dem) => bo_nho_dem.addAll(CAC_FILE_CAN_CACHE))
  );
  self.skipWaiting();
});

self.addEventListener("activate", (su_kien) => {
  su_kien.waitUntil(
    caches.keys().then((cac_ten_cu) =>
      Promise.all(
        cac_ten_cu
          .filter((ten) => ten !== TEN_BO_NHO_DEM)
          .map((ten) => caches.delete(ten))
      )
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (su_kien) => {
  // Chi ap dung chien luoc cache cho request GET cung nguon (bo qua goi API Firestore/FCM)
  if (su_kien.request.method !== "GET") return;

  su_kien.respondWith(
    caches.match(su_kien.request).then((phan_hoi_cache) => {
      return (
        phan_hoi_cache ||
        fetch(su_kien.request).catch(() => caches.match("./index.html"))
      );
    })
  );
});
