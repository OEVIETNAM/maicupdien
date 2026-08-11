import { CAU_HINH_FIREBASE, VAPID_KEY_CONG_KHAI } from "./cau-hinh-firebase.js";
import { tao_bitmask_tu_danh_sach_chi_so, bitmask_sang_chuoi } from "./bitset.js";

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getMessaging, getToken } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-messaging.js";
import {
  getFirestore, doc, getDoc, setDoc, serverTimestamp,
  collection, query, where, onSnapshot,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const the_ung_dung_firebase = initializeApp(CAU_HINH_FIREBASE);
const co_so_du_lieu = getFirestore(the_ung_dung_firebase);

const phan_tu_danh_sach_khu_pho = document.getElementById("danh-sach-khu-pho");
const phan_tu_form = document.getElementById("form-dang-ky");
const nut_dang_ky = document.getElementById("nut-dang-ky");
const hop_thong_diep = document.getElementById("thong-diep-trang-thai");

const man_hinh_trang_thai = document.getElementById("man-hinh-trang-thai");
const danh_sach_the_trang_thai = document.getElementById("danh-sach-the-trang-thai");
const nut_sua_dang_ky = document.getElementById("nut-sua-dang-ky");

let danh_muc_khu_pho = {};
let huy_lang_nghe_realtime = null;
let bo_dem_gio_cap_nhat = null;
let khu_pho_dang_ky_hien_tai = [];

function hien_thong_diep(noi_dung, loai) {
  hop_thong_diep.textContent = noi_dung;
  hop_thong_diep.className = `thong-diep-trang-thai hien ${loai}`;
}

async function nap_danh_muc_khu_pho() {
  const phan_hoi = await fetch("data/danh-muc-khu-pho.json");
  const du_lieu_tho = await phan_hoi.json();
  danh_muc_khu_pho = Object.fromEntries(
    Object.entries(du_lieu_tho).filter(([ma]) => !ma.startsWith("_"))
  );

  phan_tu_danh_sach_khu_pho.innerHTML = Object.entries(danh_muc_khu_pho)
    .sort((a, b) => a[1].ten_khu_pho.localeCompare(b[1].ten_khu_pho, "vi"))
    .map(([ma_khu_pho, thong_tin]) => `
      <div class="the-khu-pho">
        <input type="checkbox" id="kp-${ma_khu_pho}" name="khu-pho" value="${ma_khu_pho}" />
        <label for="kp-${ma_khu_pho}">${thong_tin.ten_khu_pho}</label>
      </div>
    `)
    .join("");
}

async function dang_ky_service_worker() {
  if (!("serviceWorker" in navigator)) return null;
  return navigator.serviceWorker.register("firebase-messaging-sw.js");
}

async function kiem_tra_dang_ky_hien_co() {
  if (!("serviceWorker" in navigator) || Notification.permission !== "granted") {
    return null;
  }
  try {
    const dang_ky_worker = await dang_ky_service_worker();
    const nhan_tin = getMessaging(the_ung_dung_firebase);
    const token_thiet_bi = await getToken(nhan_tin, {
      vapidKey: VAPID_KEY_CONG_KHAI,
      serviceWorkerRegistration: dang_ky_worker,
    });
    if (!token_thiet_bi) return null;

    const tham_chieu = doc(co_so_du_lieu, "dang_ky_thong_bao", token_thiet_bi);
    const tai_lieu = await getDoc(tham_chieu);
    if (!tai_lieu.exists()) return null;

    return { token: token_thiet_bi, ...tai_lieu.data() };
  } catch (loi) {
    console.warn("Khong kiem tra duoc dang ky hien co:", loi);
    return null;
  }
}

function tinh_trang_thai_khu_pho(ma_khu_pho, danh_sach_ban_ghi) {
  const bay_gio = new Date();

  const ban_ghi_dang_cup = danh_sach_ban_ghi.find((bg) => {
    if (!bg.ma_khu_pho?.includes(ma_khu_pho)) return false;
    if (!bg.tu_luc || !bg.den_luc) return false;
    return bg.tu_luc.toDate() <= bay_gio && bay_gio <= bg.den_luc.toDate();
  });
  if (ban_ghi_dang_cup) {
    return { trang_thai: "dang-cup", ban_ghi: ban_ghi_dang_cup };
  }

  const cac_ban_ghi_sap_toi = danh_sach_ban_ghi
    .filter((bg) => bg.ma_khu_pho?.includes(ma_khu_pho) && bg.tu_luc && bg.tu_luc.toDate() > bay_gio)
    .sort((a, b) => a.tu_luc.toDate() - b.tu_luc.toDate());

  return { trang_thai: "co-dien", ban_ghi_sap_toi: cac_ban_ghi_sap_toi[0] || null };
}

function dinh_dang_gio(ngay_gio) {
  return ngay_gio.toLocaleString("vi-VN", {
    hour: "2-digit", minute: "2-digit", day: "2-digit", month: "2-digit",
  });
}

function ve_lai_cac_the_trang_thai(danh_sach_ma_khu_pho, danh_sach_ban_ghi) {
  danh_sach_the_trang_thai.innerHTML = danh_sach_ma_khu_pho
    .map((ma_khu_pho) => {
      const ten_khu_pho = danh_muc_khu_pho[ma_khu_pho]?.ten_khu_pho || ma_khu_pho;
      const { trang_thai, ban_ghi, ban_ghi_sap_toi } = tinh_trang_thai_khu_pho(ma_khu_pho, danh_sach_ban_ghi);

      let nhan = "Đang có điện";
      let ghi_chu = "";
      if (trang_thai === "dang-cup") {
        nhan = "Đang cúp điện";
        ghi_chu = ban_ghi?.den_luc ? `Dự kiến có lại lúc ${dinh_dang_gio(ban_ghi.den_luc.toDate())}` : "";
      } else if (ban_ghi_sap_toi?.tu_luc) {
        ghi_chu = `Sắp cúp: ${dinh_dang_gio(ban_ghi_sap_toi.tu_luc.toDate())}`;
      }

      return `
        <div class="the-trang-thai ${trang_thai}">
          <span class="ten">${ten_khu_pho}</span>
          <span class="chi-tiet">
            <span class="nhan-trang-thai">${nhan}</span>
            ${ghi_chu ? `<span class="ghi-chu-them">${ghi_chu}</span>` : ""}
          </span>
        </div>
      `;
    })
    .join("");
}

function bat_dau_theo_doi_realtime(danh_sach_ma_khu_pho) {
  if (huy_lang_nghe_realtime) huy_lang_nghe_realtime();
  if (bo_dem_gio_cap_nhat) clearInterval(bo_dem_gio_cap_nhat);

  const truy_van = query(
    collection(co_so_du_lieu, "lich_cup_dien"),
    where("ma_khu_pho", "array-contains-any", danh_sach_ma_khu_pho.slice(0, 10))
  );

  let du_lieu_gan_nhat = [];
  huy_lang_nghe_realtime = onSnapshot(truy_van, (snapshot) => {
    du_lieu_gan_nhat = snapshot.docs.map((d) => d.data());
    ve_lai_cac_the_trang_thai(danh_sach_ma_khu_pho, du_lieu_gan_nhat);
  });

  bo_dem_gio_cap_nhat = setInterval(() => {
    ve_lai_cac_the_trang_thai(danh_sach_ma_khu_pho, du_lieu_gan_nhat);
  }, 30000);
}

function hien_thi_man_hinh_trang_thai(danh_sach_ma_khu_pho) {
  khu_pho_dang_ky_hien_tai = danh_sach_ma_khu_pho;
  phan_tu_form.classList.add("an");
  man_hinh_trang_thai.classList.remove("an");
  bat_dau_theo_doi_realtime(danh_sach_ma_khu_pho);
}

function hien_thi_man_hinh_chon_khu_vuc() {
  man_hinh_trang_thai.classList.add("an");
  phan_tu_form.classList.remove("an");
  if (huy_lang_nghe_realtime) { huy_lang_nghe_realtime(); huy_lang_nghe_realtime = null; }
  if (bo_dem_gio_cap_nhat) { clearInterval(bo_dem_gio_cap_nhat); bo_dem_gio_cap_nhat = null; }

  // Tick san lai dung nhung khu pho da dang ky truoc do, de nguoi dung
  // khong phai chon lai tu dau khi chi muon them/bot 1 khu pho
  phan_tu_form.querySelectorAll('input[name="khu-pho"]').forEach((o) => {
    o.checked = khu_pho_dang_ky_hien_tai.includes(o.value);
  });
}

async function xu_ly_gui_dang_ky(su_kien) {
  su_kien.preventDefault();

  const cac_o_da_chon = [...phan_tu_form.querySelectorAll('input[name="khu-pho"]:checked')];
  if (cac_o_da_chon.length === 0) {
    hien_thong_diep("Bạn cần chọn ít nhất 1 khu phố trước khi bật thông báo.", "loi");
    return;
  }

  nut_dang_ky.disabled = true;
  nut_dang_ky.textContent = "Đang bật thông báo...";

  try {
    const dang_ky_worker = await dang_ky_service_worker();

    const quyen = await Notification.requestPermission();
    if (quyen !== "granted") {
      hien_thong_diep(
        "Bạn chưa cho phép nhận thông báo. Vào cài đặt trình duyệt để bật lại quyền thông báo cho trang này.",
        "loi"
      );
      return;
    }

    const nhan_tin = getMessaging(the_ung_dung_firebase);
    const token_thiet_bi = await getToken(nhan_tin, {
      vapidKey: VAPID_KEY_CONG_KHAI,
      serviceWorkerRegistration: dang_ky_worker,
    });

    if (!token_thiet_bi) {
      hien_thong_diep("Không lấy được mã thiết bị. Vui lòng thử lại.", "loi");
      return;
    }

    const ma_cac_khu_pho_da_chon = cac_o_da_chon.map((o) => o.value);
    const cac_chi_so_bit = ma_cac_khu_pho_da_chon.map((ma) => danh_muc_khu_pho[ma].chi_so_bit);
    const bitmask = tao_bitmask_tu_danh_sach_chi_so(cac_chi_so_bit);

    await setDoc(doc(co_so_du_lieu, "dang_ky_thong_bao", token_thiet_bi), {
      bitmask: bitmask_sang_chuoi(bitmask),
      ma_khu_pho: ma_cac_khu_pho_da_chon,
      cap_nhat_luc: serverTimestamp(),
    });

    hien_thi_man_hinh_trang_thai(ma_cac_khu_pho_da_chon);
  } catch (loi) {
    console.error(loi);
    hien_thong_diep("Có lỗi khi bật thông báo. Vui lòng thử lại sau.", "loi");
  } finally {
    nut_dang_ky.disabled = false;
    nut_dang_ky.textContent = "Bật thông báo cho khu vực đã chọn";
  }
}

async function khoi_dong() {
  await nap_danh_muc_khu_pho();
  phan_tu_form.addEventListener("submit", xu_ly_gui_dang_ky);
  nut_sua_dang_ky.addEventListener("click", hien_thi_man_hinh_chon_khu_vuc);

  const dang_ky_hien_co = await kiem_tra_dang_ky_hien_co();
  if (dang_ky_hien_co?.ma_khu_pho?.length) {
    hien_thi_man_hinh_trang_thai(dang_ky_hien_co.ma_khu_pho);
  } else {
    hien_thi_man_hinh_chon_khu_vuc();
  }
}

khoi_dong();
