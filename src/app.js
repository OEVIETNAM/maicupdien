import { CAU_HINH_FIREBASE, VAPID_KEY_CONG_KHAI } from "./cau-hinh-firebase.js";
import { tao_bitmask_tu_danh_sach_chi_so, bitmask_sang_chuoi } from "./bitset.js";

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getMessaging, getToken } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-messaging.js";
import {
  getFirestore, doc, setDoc, serverTimestamp,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const the_ung_dung_firebase = initializeApp(CAU_HINH_FIREBASE);
const co_so_du_lieu = getFirestore(the_ung_dung_firebase);

const phan_tu_danh_sach_khu_pho = document.getElementById("danh-sach-khu-pho");
const phan_tu_form = document.getElementById("form-dang-ky");
const nut_dang_ky = document.getElementById("nut-dang-ky");
const hop_thong_diep = document.getElementById("thong-diep-trang-thai");

let danh_muc_khu_pho = {}; // { "TN-TB-00": { chi_so_bit, ten_khu_pho, ... }, ... }

function hien_thong_diep(noi_dung, loai) {
  hop_thong_diep.textContent = noi_dung;
  hop_thong_diep.className = `thong-diep-trang-thai hien ${loai}`;
}

async function nap_danh_muc_khu_pho() {
  const phan_hoi = await fetch("data/danh-muc-khu-pho.json");
  const du_lieu_tho = await phan_hoi.json();

  // Bo qua cac truong bat dau bang "_" (ghi chu noi bo, khong phai khu pho)
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
      ma_khu_pho: ma_cac_khu_pho_da_chon, // luu ca dang mang de doi chieu/hien thi de dang khi can
      cap_nhat_luc: serverTimestamp(),
    });

    const ten_hien_thi = ma_cac_khu_pho_da_chon
      .map((ma) => danh_muc_khu_pho[ma].ten_khu_pho)
      .join(", ");
    hien_thong_diep(`Đã bật thông báo cho: ${ten_hien_thi}. Bạn sẽ nhận tin trước khi khu vực này bị cúp điện.`, "thanh-cong");
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
}

khoi_dong();
