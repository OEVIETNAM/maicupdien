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
  apiKey: "AIzaSyCnSnNnqsvDNQNhMnESIvhRkVipqM2-PT4",
  authDomain: "maicupdien.firebaseapp.com",
  projectId: "maicupdien",
  storageBucket: "maicupdien.firebasestorage.app",
  messagingSenderId: "240311333784",
  appId: "1:240311333784:web:7919ee058342b5b0ce31ed",
  measurementId: "G-BRYKE1BZ76"
});

const messaging = firebase.messaging();

// ---- Ban sao thu gon cua src/kho-thong-bao.js ----
// Service Worker la "classic script" (importScripts, khong ho tro `import`
// ES module) nen khong the dung chung file src/kho-thong-bao.js voi app.js.
// Neu sua ten CSDL/kho hay logic o day, nho sua ca ben src/kho-thong-bao.js.
const TEN_CSDL_THONG_BAO = "mai-cup-dien-thong-bao";
const TEN_KHO_THONG_BAO = "thong_bao";
const SO_LUONG_THONG_BAO_TOI_DA = 3;

function mo_csdl_thong_bao() {
  return new Promise((giai_quyet, tu_choi) => {
    const yeu_cau_mo = indexedDB.open(TEN_CSDL_THONG_BAO, 1);
    yeu_cau_mo.onupgradeneeded = () => {
      const csdl = yeu_cau_mo.result;
      if (!csdl.objectStoreNames.contains(TEN_KHO_THONG_BAO)) {
        csdl.createObjectStore(TEN_KHO_THONG_BAO, { keyPath: "id", autoIncrement: true });
      }
    };
    yeu_cau_mo.onsuccess = () => giai_quyet(yeu_cau_mo.result);
    yeu_cau_mo.onerror = () => tu_choi(yeu_cau_mo.error);
  });
}

async function luu_thong_bao_moi(tieu_de, noi_dung) {
  const csdl = await mo_csdl_thong_bao();

  await new Promise((giai_quyet, tu_choi) => {
    const giao_dich = csdl.transaction(TEN_KHO_THONG_BAO, "readwrite");
    giao_dich.objectStore(TEN_KHO_THONG_BAO).add({
      tieu_de, noi_dung, thoi_gian: Date.now(), da_xem: false,
    });
    giao_dich.oncomplete = () => giai_quyet();
    giao_dich.onerror = () => tu_choi(giao_dich.error);
  });

  const tat_ca = await new Promise((giai_quyet, tu_choi) => {
    const yeu_cau = csdl.transaction(TEN_KHO_THONG_BAO, "readonly")
      .objectStore(TEN_KHO_THONG_BAO)
      .getAll();
    yeu_cau.onsuccess = () => giai_quyet(yeu_cau.result);
    yeu_cau.onerror = () => tu_choi(yeu_cau.error);
  });

  if (tat_ca.length > SO_LUONG_THONG_BAO_TOI_DA) {
    const can_xoa = tat_ca
      .sort((a, b) => a.thoi_gian - b.thoi_gian)
      .slice(0, tat_ca.length - SO_LUONG_THONG_BAO_TOI_DA);
    await new Promise((giai_quyet, tu_choi) => {
      const giao_dich = csdl.transaction(TEN_KHO_THONG_BAO, "readwrite");
      const kho = giao_dich.objectStore(TEN_KHO_THONG_BAO);
      can_xoa.forEach((bg) => kho.delete(bg.id));
      giao_dich.oncomplete = () => giai_quyet();
      giao_dich.onerror = () => tu_choi(giao_dich.error);
    });
  }

  csdl.close();
}

// Hien thong bao khi nhan push luc app dang chay nen (background)
messaging.onBackgroundMessage((payload) => {
  const tieu_de = payload?.notification?.title || "Lịch cúp điện";
  const noi_dung = payload?.notification?.body || "";

  return luu_thong_bao_moi(tieu_de, noi_dung)
    .catch((loi) => console.warn("Khong luu duoc thong bao (background):", loi))
    .then(() =>
      self.registration.showNotification(tieu_de, {
        body: noi_dung,
        icon: "icons/icon-192.png",
        badge: "icons/icon-192.png",
        vibrate: [200, 100, 200],
        data: { url: self.registration.scope }, // trang se mo khi nguoi dung bam vao thong bao
      })
    );
});

// Khi nguoi dung BAM VAO thong bao: dong thong bao lai, roi neu da co san 1
// tab dang mo trang nay thi CHUYEN QUA tab do (focus), con khong thi MO TAB
// MOI. Neu thieu doan nay, mac dinh trinh duyet chi dong thong bao ma khong
// lam gi ca — day chinh la ly do bam vao thong bao truoc day khong mo trang.
self.addEventListener("notificationclick", (su_kien) => {
  su_kien.notification.close();
  const duong_dan_can_mo = su_kien.notification.data?.url || self.registration.scope;

  su_kien.waitUntil(
    self.clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then((danh_sach_tab_dang_mo) => {
        const tab_co_san = danh_sach_tab_dang_mo.find(
          (tab) => tab.url === duong_dan_can_mo || tab.url.startsWith(self.registration.scope)
        );
        if (tab_co_san) return tab_co_san.focus();
        return self.clients.openWindow(duong_dan_can_mo);
      })
  );
});

// ---- Phan cache offline shell (tach biet voi phan messaging o tren) ----
const TEN_BO_NHO_DEM = "mai-cup-dien-v2";
const CAC_FILE_CAN_CACHE = [
  "./",
  "./index.html",
  "./manifest.webmanifest",
  "./src/style.css",
  "./src/app.js",
  "./src/bitset.js",
  "./src/cau-hinh-firebase.js",
  "./src/kho-thong-bao.js",
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
