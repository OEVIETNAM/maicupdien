import { CAU_HINH_FIREBASE, VAPID_KEY_CONG_KHAI } from "./cau-hinh-firebase.js";
import {
  tao_bitmask_tu_danh_sach_chi_so, bitmask_sang_chuoi, chuoi_sang_bitmask,
  bitmask_sang_danh_sach_chi_so,
} from "./bitset.js";

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getMessaging, getToken, onMessage } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-messaging.js";
import {
  getFirestore, doc, getDoc, setDoc, deleteDoc, serverTimestamp,
  collection, query, where, onSnapshot,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import {
  luu_thong_bao_moi, lay_danh_sach_thong_bao,
  dem_so_thong_bao_chua_xem, danh_dau_tat_ca_da_xem,
} from "./kho-thong-bao.js";

const the_ung_dung_firebase = initializeApp(CAU_HINH_FIREBASE);
const co_so_du_lieu = getFirestore(the_ung_dung_firebase);
// 1 instance messaging DUY NHAT, dung chung cho ca luc lay token lan luc
// lang nghe thong bao foreground (onMessage o cuoi file) - tranh tao nhieu
// instance khong can thiet.
const nhan_tin = getMessaging(the_ung_dung_firebase);

// Khoa luu trong localStorage de nho token FCM GAN NHAT ma CHINH THIET BI
// NAY (trinh duyet) da dung de dang ky. Firebase Messaging co the cap token
// MOI cho CUNG 1 thiet bi/trinh duyet trong 1 so truong hop (vi du: nguoi
// dung bat thong bao khi con dung tab Chrome thuong, sau do "Cai dat ung
// dung" (Them vao man hinh chinh) - Android tao ra 1 danh tinh WebAPK rieng,
// khien FCM cap token KHAC cho cung thiet bi). Vi ca 2 token cu va moi deu
// con "song" (Firestore van con ca 2 ban ghi dang_ky_thong_bao), server se
// gui thong bao CHO CA 2 -> nguoi dung nhan 2 lan cho cung 1 su kien. localStorage
// dung chung 1 vung luu tru giua tab trinh duyet va ban PWA da cai (cung 1
// origin), nen dung no de PHAT HIEN va DON DEP token cu moi khi thay doi.
const KHOA_LUU_TOKEN_FCM = "mai_cup_dien_token_fcm_da_dang_ky";

/** So sanh token FCM vua lay duoc voi token da luu tu lan truoc (neu co).
 *  Neu khac nhau, tuc thiet bi nay da tung dang ky bang 1 token cu khac ->
 *  xoa ban ghi dang_ky_thong_bao cua token cu do (best-effort, khong chan
 *  luong chinh neu loi), roi cap nhat lai localStorage voi token moi nhat. */
async function don_dep_token_fcm_cu_neu_khac(token_moi) {
  let token_cu = null;
  try {
    token_cu = localStorage.getItem(KHOA_LUU_TOKEN_FCM);
  } catch (loi) {
    console.warn("Khong doc duoc token cu tu localStorage:", loi);
  }

  if (token_cu && token_cu !== token_moi) {
    try {
      await deleteDoc(doc(co_so_du_lieu, "dang_ky_thong_bao", token_cu));
      console.log("Da don dep dang ky thong bao cu (token doi):", token_cu);
    } catch (loi) {
      console.warn("Khong xoa duoc dang ky thong bao cu:", loi);
    }
  }

  try {
    localStorage.setItem(KHOA_LUU_TOKEN_FCM, token_moi);
  } catch (loi) {
    console.warn("Khong luu duoc token moi vao localStorage:", loi);
  }
}

const chon_don_vi_el = document.getElementById("chon-don-vi");
const chon_phuong_el = document.getElementById("chon-phuong");
const the_chon_khu_pho_el = document.getElementById("the-chon-khu-pho");
const phan_tu_danh_sach_khu_pho = document.getElementById("danh-sach-khu-pho");
const thong_diep_chua_chon_phuong_el = document.getElementById("thong-diep-chua-chon-phuong");
const phan_tu_form = document.getElementById("form-dang-ky");
const nut_dang_ky = document.getElementById("nut-dang-ky");
const hop_thong_diep = document.getElementById("thong-diep-trang-thai");

const man_hinh_trang_thai = document.getElementById("man-hinh-trang-thai");
const ten_phuong_dang_theo_doi_el = document.getElementById("ten-phuong-dang-theo-doi");
const danh_sach_the_trang_thai = document.getElementById("danh-sach-the-trang-thai");
const nut_sua_dang_ky = document.getElementById("nut-sua-dang-ky");

const nut_chuong_thong_bao = document.getElementById("nut-chuong-thong-bao");
const huy_hieu_so_thong_bao_el = document.getElementById("huy-hieu-so-thong-bao");
const lop_phu_thong_bao_el = document.getElementById("lop-phu-thong-bao");
const danh_sach_thong_bao_da_nhan_el = document.getElementById("danh-sach-thong-bao-da-nhan");
const nut_dong_thong_bao = document.getElementById("nut-dong-thong-bao");

let danh_muc_theo_phuong = {}; // { ma_phuong: { ten_phuong, ten_huyen, ma_dien_luc, khu_pho: [...] } }
let danh_muc_theo_don_vi = {}; // { ma_dien_luc: { ten_don_vi, cac_ma_phuong: [ma_phuong, ...] } }
let huy_lang_nghe_realtime = null;
let bo_dem_gio_cap_nhat = null;
let dang_ky_hien_tai = { ma_phuong: "", ten_khu_pho: [] }; // dung khi bam "Sua dang ky"

function hien_thong_diep(noi_dung, loai) {
  hop_thong_diep.textContent = noi_dung;
  hop_thong_diep.className = `thong-diep-trang-thai hien ${loai}`;
}

async function nap_danh_muc_khu_pho() {
  const [phan_hoi_khu_pho, phan_hoi_dien_luc] = await Promise.all([
    fetch("data/danh-muc-khu-pho.json"),
    fetch("data/danh-muc-dien-luc.json"),
  ]);
  const du_lieu_tho = await phan_hoi_khu_pho.json();
  const du_lieu_dien_luc = await phan_hoi_dien_luc.json();

  // Ten "Dien luc X" chuan lay tu danh-muc-dien-luc.json (nguon 1 tro true
  // duy nhat cho ten don vi) - khong tu ghep tu ten_huyen cua tung Xa/Phuong
  // nua, tranh truong hop 1 phuong nao do dien thieu ten_huyen se hien nham
  // ra ma dien luc (dang so) thay vi ten.
  const ten_don_vi_theo_ma = Object.fromEntries(
    du_lieu_dien_luc.don_vi.map((dv) => [dv.ma_dien_luc, dv.ten_don_vi])
  );

  // Chi lay cac Xa/Phuong da duoc dien ma_dien_luc VA co it nhat 1 khu pho -
  // nhung phuong con dang "de trong cho dien du lieu" se khong hien ra de
  // tranh nguoi dung chon nham khu vuc chua co du lieu that.
  danh_muc_theo_phuong = Object.fromEntries(
    Object.entries(du_lieu_tho)
      .filter(([ma]) => !ma.startsWith("_"))
      .filter(([, tt]) => tt.ma_dien_luc && tt.ma_dien_luc.trim() !== "" && tt.khu_pho?.length > 0)
  );

  // Gom nhom Xa/Phuong theo don vi dien luc de lam tang loc dau tien - giup
  // danh sach do rieng mat hon khi so Xa/Phuong ngay cang nhieu.
  danh_muc_theo_don_vi = {};
  for (const [ma_phuong, tt] of Object.entries(danh_muc_theo_phuong)) {
    if (!danh_muc_theo_don_vi[tt.ma_dien_luc]) {
      danh_muc_theo_don_vi[tt.ma_dien_luc] = {
        ten_don_vi: ten_don_vi_theo_ma[tt.ma_dien_luc] || tt.ma_dien_luc,
        cac_ma_phuong: [],
      };
    }
    danh_muc_theo_don_vi[tt.ma_dien_luc].cac_ma_phuong.push(ma_phuong);
  }

  const danh_sach_don_vi_sap_xep = Object.entries(danh_muc_theo_don_vi)
    .sort((a, b) => a[1].ten_don_vi.localeCompare(b[1].ten_don_vi, "vi"));

  chon_don_vi_el.innerHTML =
    `<option value="">— Chọn huyện/thị xã —</option>` +
    danh_sach_don_vi_sap_xep
      .map(([ma_dien_luc, tt]) => `<option value="${ma_dien_luc}">${tt.ten_don_vi}</option>`)
      .join("");
}

/** Ve lai <select> xa/phuong dua theo 1 don vi dien luc da chon. Neu chua
 *  chon don vi nao, khoa select lai va hien placeholder. */
function ve_lai_danh_sach_phuong(ma_dien_luc) {
  const don_vi = danh_muc_theo_don_vi[ma_dien_luc];
  if (!don_vi) {
    chon_phuong_el.innerHTML = `<option value="">— Chọn huyện/thị xã ở trên trước —</option>`;
    chon_phuong_el.disabled = true;
    return;
  }

  const danh_sach_phuong_sap_xep = don_vi.cac_ma_phuong
    .map((ma_phuong) => [ma_phuong, danh_muc_theo_phuong[ma_phuong]])
    .sort((a, b) => a[1].ten_phuong.localeCompare(b[1].ten_phuong, "vi"));

  chon_phuong_el.innerHTML =
    `<option value="">— Chọn xã/phường —</option>` +
    danh_sach_phuong_sap_xep
      .map(([ma_phuong, tt]) => `<option value="${ma_phuong}">${ten_hien_thi_phuong(tt)}</option>`)
      .join("");
  chon_phuong_el.disabled = false;
}

/** "Phường Trảng Bàng" hoac "Xã Phước Chỉ" - neu chua biet loai_don_vi (dang
 *  cho tu dong kham pha lan crawl toi) thi chi hien ten, khong doan bua. */
function ten_hien_thi_phuong(thong_tin_phuong) {
  return thong_tin_phuong.loai_don_vi
    ? `${thong_tin_phuong.loai_don_vi} ${thong_tin_phuong.ten_phuong}`
    : thong_tin_phuong.ten_phuong;
}

const BIEU_THUC_MOT_PHAN = /^\s*một\s*phần\s+/i;

/** Neu ten bat dau bang "Một phần ", quy ve dung ten ap goc (bo tien to,
 *  viet hoa lai chu cai dau). Dung de GOM 1 ap va cac ban ghi "cup 1 phan
 *  ap do" lai thanh CHUNG 1 khu vuc/field, thay vi hien thanh 2 dong rieng
 *  biet nhu du lieu tho tu EVNSPC hay bi tach ra. */
function quy_ve_ten_ap_goc(ten) {
  if (!BIEU_THUC_MOT_PHAN.test(ten)) return ten;
  const ten_con_lai = ten.replace(BIEU_THUC_MOT_PHAN, "").trim();
  if (!ten_con_lai) return ten;
  return ten_con_lai.charAt(0).toUpperCase() + ten_con_lai.slice(1);
}

/** Gom cac chi so trong mang khu_pho cua 1 Xa/Phuong theo TEN AP GOC (sau khi
 *  quy_ve_ten_ap_goc). Vi du khu_pho = ["Ấp Thái Trị", "Một phần ấp Thái Trị"]
 *  se gom thanh 1 nhom { ten_goc: "Ấp Thái Trị", cac_chi_so: [4, 5] } - nguoi
 *  dung chi thay VA chon 1 the "Ấp Thái Trị" duy nhat, nhung tick vao la dang
 *  ky nhan tin cho CA HAI truong hop (cup nguyen ap lan cup 1 phan ap). */
function gom_nhom_khu_pho_theo_ten_goc(thong_tin_phuong) {
  const nhom_theo_ten_goc = new Map(); // ten_goc -> { ten_goc, cac_chi_so: [] }
  thong_tin_phuong.khu_pho.forEach((ten_khu_pho, chi_so) => {
    const ten_goc = quy_ve_ten_ap_goc(ten_khu_pho);
    if (!nhom_theo_ten_goc.has(ten_goc)) {
      nhom_theo_ten_goc.set(ten_goc, { ten_goc, cac_chi_so: [] });
    }
    nhom_theo_ten_goc.get(ten_goc).cac_chi_so.push(chi_so);
  });
  return [...nhom_theo_ten_goc.values()];
}

/** Ve lai luoi checkbox khu pho cho 1 Xa/Phuong cu the. Value cua moi checkbox
 *  la DANH SACH CHI SO (cach nhau boi dau phay) gom tat ca chi_so_bit thuoc
 *  cung 1 ten ap goc - xem gom_nhom_khu_pho_theo_ten_goc. */
function ve_lai_luoi_khu_pho(ma_phuong, danh_sach_ten_da_chon_truoc = []) {
  const thong_tin_phuong = danh_muc_theo_phuong[ma_phuong];
  if (!thong_tin_phuong) {
    phan_tu_danh_sach_khu_pho.innerHTML = "";
    phan_tu_danh_sach_khu_pho.classList.add("an");
    thong_diep_chua_chon_phuong_el.classList.remove("an");
    return;
  }

  phan_tu_danh_sach_khu_pho.classList.remove("an");
  thong_diep_chua_chon_phuong_el.classList.add("an");

  const cac_nhom_khu_pho = gom_nhom_khu_pho_theo_ten_goc(thong_tin_phuong);

  phan_tu_danh_sach_khu_pho.innerHTML = cac_nhom_khu_pho
    .map(({ ten_goc, cac_chi_so }, chi_so_nhom) => `
      <div class="the-khu-pho">
        <input type="checkbox" id="kp-${chi_so_nhom}" name="khu-pho" value="${cac_chi_so.join(",")}"
          ${danh_sach_ten_da_chon_truoc.includes(ten_goc) ? "checked" : ""} />
        <label for="kp-${chi_so_nhom}">${ten_goc}</label>
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
    const token_thiet_bi = await getToken(nhan_tin, {
      vapidKey: VAPID_KEY_CONG_KHAI,
      serviceWorkerRegistration: dang_ky_worker,
    });
    if (!token_thiet_bi) return null;
    await don_dep_token_fcm_cu_neu_khac(token_thiet_bi);

    const tham_chieu = doc(co_so_du_lieu, "dang_ky_thong_bao", token_thiet_bi);
    const tai_lieu = await getDoc(tham_chieu);
    if (!tai_lieu.exists()) return null;

    const du_lieu = tai_lieu.data();
    const ma_phuong = du_lieu.ma_phuong;
    const thong_tin_phuong = danh_muc_theo_phuong[ma_phuong];
    if (!thong_tin_phuong) return null; // phuong da dang ky khong con hop le (vd bi doi ma)

    const bitmask = chuoi_sang_bitmask(du_lieu.bitmask);
    // Quy ve ten ap goc roi loc trung - vi "Ấp X" va "Một phần ấp X" co the
    // ung voi 2 chi_so bit khac nhau nhung nguoi dung chi can thay 1 the.
    const ten_khu_pho = [...new Set(
      bitmask_sang_danh_sach_chi_so(bitmask)
        .map((chi_so) => thong_tin_phuong.khu_pho[chi_so])
        .filter(Boolean)
        .map((ten) => quy_ve_ten_ap_goc(ten))
    )];

    if (ten_khu_pho.length === 0) return null;
    return { token: token_thiet_bi, ma_phuong, ten_khu_pho };
  } catch (loi) {
    console.warn("Khong kiem tra duoc dang ky hien co:", loi);
    return null;
  }
}

function tinh_trang_thai_khu_pho(ten_khu_pho, danh_sach_ban_ghi) {
  const bay_gio = new Date();

  // So khop theo TEN AP GOC (sau quy_ve_ten_ap_goc) o ca 2 phia - vi ban ghi
  // tu Firestore co the ghi "Ấp X" (cup nguyen ap) hoac "Một phần ấp X" (cup
  // 1 phan), nhung the trang thai chi hien thi 1 dong duy nhat cho "Ấp X".
  const khop_ten_ap = (bg) => bg.ten_khu_pho?.some((ten) => quy_ve_ten_ap_goc(ten) === ten_khu_pho);

  const ban_ghi_dang_cup = danh_sach_ban_ghi.find((bg) => {
    if (!khop_ten_ap(bg)) return false;
    if (!bg.tu_luc || !bg.den_luc) return false;
    return bg.tu_luc.toDate() <= bay_gio && bay_gio <= bg.den_luc.toDate();
  });
  if (ban_ghi_dang_cup) {
    return { trang_thai: "dang-cup", ban_ghi: ban_ghi_dang_cup };
  }

  const cac_ban_ghi_sap_toi = danh_sach_ban_ghi
    .filter((bg) => khop_ten_ap(bg) && bg.tu_luc && bg.tu_luc.toDate() > bay_gio)
    .sort((a, b) => a.tu_luc.toDate() - b.tu_luc.toDate());

  return { trang_thai: "co-dien", ban_ghi_sap_toi: cac_ban_ghi_sap_toi[0] || null };
}

function dinh_dang_gio(ngay_gio) {
  return ngay_gio.toLocaleString("vi-VN", {
    hour: "2-digit", minute: "2-digit", day: "2-digit", month: "2-digit",
  });
}

function ve_lai_cac_the_trang_thai(danh_sach_ten_khu_pho, danh_sach_ban_ghi) {
  danh_sach_the_trang_thai.innerHTML = danh_sach_ten_khu_pho
    .map((ten_khu_pho) => {
      const { trang_thai, ban_ghi, ban_ghi_sap_toi } = tinh_trang_thai_khu_pho(ten_khu_pho, danh_sach_ban_ghi);

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

function bat_dau_theo_doi_realtime(ma_phuong, danh_sach_ten_khu_pho) {
  if (huy_lang_nghe_realtime) huy_lang_nghe_realtime();
  if (bo_dem_gio_cap_nhat) clearInterval(bo_dem_gio_cap_nhat);

  // Query theo ma_phuong (khong phai array-contains-any tren danh sach khu
  // pho) - vua don gian hoa, vua tranh gioi han 10 gia tri cua Firestore.
  const truy_van = query(
    collection(co_so_du_lieu, "lich_cup_dien"),
    where("ma_phuong", "==", ma_phuong)
  );

  let du_lieu_gan_nhat = [];
  huy_lang_nghe_realtime = onSnapshot(truy_van, (snapshot) => {
    du_lieu_gan_nhat = snapshot.docs.map((d) => d.data());
    ve_lai_cac_the_trang_thai(danh_sach_ten_khu_pho, du_lieu_gan_nhat);
  });

  bo_dem_gio_cap_nhat = setInterval(() => {
    ve_lai_cac_the_trang_thai(danh_sach_ten_khu_pho, du_lieu_gan_nhat);
  }, 30000);
}

function hien_thi_man_hinh_trang_thai(ma_phuong, danh_sach_ten_khu_pho) {
  dang_ky_hien_tai = { ma_phuong, ten_khu_pho: danh_sach_ten_khu_pho };
  const thong_tin_phuong = danh_muc_theo_phuong[ma_phuong];
  ten_phuong_dang_theo_doi_el.textContent = thong_tin_phuong
    ? ten_hien_thi_phuong(thong_tin_phuong)
    : ma_phuong;

  phan_tu_form.classList.add("an");
  man_hinh_trang_thai.classList.remove("an");
  bat_dau_theo_doi_realtime(ma_phuong, danh_sach_ten_khu_pho);
}

function hien_thi_man_hinh_chon_khu_vuc() {
  man_hinh_trang_thai.classList.add("an");
  phan_tu_form.classList.remove("an");
  if (huy_lang_nghe_realtime) { huy_lang_nghe_realtime(); huy_lang_nghe_realtime = null; }
  if (bo_dem_gio_cap_nhat) { clearInterval(bo_dem_gio_cap_nhat); bo_dem_gio_cap_nhat = null; }

  // Tick san dung don vi + phuong + khu pho da dang ky truoc do, de nguoi
  // dung khong phai chon lai tu dau khi chi muon them/bot 1 khu pho.
  if (dang_ky_hien_tai.ma_phuong) {
    const thong_tin_phuong = danh_muc_theo_phuong[dang_ky_hien_tai.ma_phuong];
    chon_don_vi_el.value = thong_tin_phuong?.ma_dien_luc || "";
    ve_lai_danh_sach_phuong(chon_don_vi_el.value);
    chon_phuong_el.value = dang_ky_hien_tai.ma_phuong;
    ve_lai_luoi_khu_pho(dang_ky_hien_tai.ma_phuong, dang_ky_hien_tai.ten_khu_pho);
  } else {
    chon_don_vi_el.value = "";
    ve_lai_danh_sach_phuong("");
    ve_lai_luoi_khu_pho("");
  }
}

async function xu_ly_gui_dang_ky(su_kien) {
  su_kien.preventDefault();

  const ma_phuong = chon_phuong_el.value;
  if (!ma_phuong) {
    hien_thong_diep("Bạn cần chọn đơn vị điện lực và xã/phường trước khi bật thông báo.", "loi");
    return;
  }

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

    const token_thiet_bi = await getToken(nhan_tin, {
      vapidKey: VAPID_KEY_CONG_KHAI,
      serviceWorkerRegistration: dang_ky_worker,
    });

    if (!token_thiet_bi) {
      hien_thong_diep("Không lấy được mã thiết bị. Vui lòng thử lại.", "loi");
      return;
    }
    await don_dep_token_fcm_cu_neu_khac(token_thiet_bi);

    const thong_tin_phuong = danh_muc_theo_phuong[ma_phuong];
    // Moi checkbox co the mang theo NHIEU chi_so (gom nhom theo ten ap goc -
    // xem gom_nhom_khu_pho_theo_ten_goc), nen can "trai phang" danh sach ra.
    const cac_chi_so_bit = cac_o_da_chon.flatMap((o) => o.value.split(",").map(Number));
    const bitmask = tao_bitmask_tu_danh_sach_chi_so(cac_chi_so_bit);
    // Ten hien thi/luu lai chi lay ten ap goc, khong lap lai vi 1 checkbox co
    // the ung voi ca "Ấp X" lan "Một phần ấp X" (cung 1 ten goc "Ấp X").
    const ten_khu_pho_da_chon = [...new Set(
      cac_chi_so_bit.map((chi_so) => quy_ve_ten_ap_goc(thong_tin_phuong.khu_pho[chi_so]))
    )];

    // Ghi de toan bo tai lieu (khong merge) - vi doi phuong nghia la bo hoan
    // toan dang ky cu, khong con lai bitmask cua phuong truoc do.
    await setDoc(doc(co_so_du_lieu, "dang_ky_thong_bao", token_thiet_bi), {
      ma_phuong,
      bitmask: bitmask_sang_chuoi(bitmask),
      cap_nhat_luc: serverTimestamp(),
    });

    hien_thi_man_hinh_trang_thai(ma_phuong, ten_khu_pho_da_chon);
  } catch (loi) {
    console.error(loi);
    hien_thong_diep("Có lỗi khi bật thông báo. Vui lòng thử lại sau.", "loi");
  } finally {
    nut_dang_ky.disabled = false;
    nut_dang_ky.textContent = "Bật thông báo cho khu vực đã chọn";
  }
}

// ================== CHUONG XEM LAI THONG BAO ==================
// Bam vao thong bao he thong xong la no BIEN MAT, khong con cho nao xem lai
// noi dung. Bieu tuong chuong nay luu tam toi da 3 thong bao gan nhat (xem
// src/kho-thong-bao.js) de nguoi dung bam vao xem lai bat cu luc nao, chu
// khong rieng gi thong bao chua doc.

function dinh_dang_thoi_gian_thong_bao(thoi_gian_epoch_ms) {
  return new Date(thoi_gian_epoch_ms).toLocaleString("vi-VN", {
    day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit",
  });
}

/** Cap nhat so hien tren huy hieu do o goc chuong = so thong bao CHUA XEM. */
async function cap_nhat_huy_hieu_chuong() {
  try {
    const so_luong_chua_xem = await dem_so_thong_bao_chua_xem();
    if (so_luong_chua_xem > 0) {
      huy_hieu_so_thong_bao_el.textContent = String(so_luong_chua_xem);
      huy_hieu_so_thong_bao_el.classList.remove("an");
    } else {
      huy_hieu_so_thong_bao_el.classList.add("an");
    }
  } catch (loi) {
    console.warn("Khong cap nhat duoc huy hieu chuong:", loi);
  }
}

/** Mo popup liet ke toi da 3 thong bao gan nhat (chu co lon cho de doc),
 *  roi danh dau tat ca la da xem (huy hieu do se tat sau khi mo popup). */
async function mo_lop_phu_thong_bao() {
  const danh_sach = await lay_danh_sach_thong_bao().catch(() => []);

  danh_sach_thong_bao_da_nhan_el.innerHTML = danh_sach.length
    ? danh_sach
        .map(
          (bg) => `
            <div class="the-thong-bao-da-nhan">
              <div class="tieu-de-thong-bao-da-nhan">${bg.tieu_de}</div>
              <div class="noi-dung-thong-bao-da-nhan">${bg.noi_dung}</div>
              <div class="thoi-gian-thong-bao-da-nhan">${dinh_dang_thoi_gian_thong_bao(bg.thoi_gian)}</div>
            </div>
          `
        )
        .join("")
    : `<p class="trong-khong-co-thong-bao">Chưa có thông báo nào được gửi tới bạn.</p>`;

  lop_phu_thong_bao_el.classList.remove("an");

  await danh_dau_tat_ca_da_xem().catch(() => {});
  cap_nhat_huy_hieu_chuong();
}

function dong_lop_phu_thong_bao() {
  lop_phu_thong_bao_el.classList.add("an");
}

nut_chuong_thong_bao.addEventListener("click", mo_lop_phu_thong_bao);
nut_dong_thong_bao.addEventListener("click", dong_lop_phu_thong_bao);
lop_phu_thong_bao_el.addEventListener("click", (su_kien) => {
  if (su_kien.target === lop_phu_thong_bao_el) dong_lop_phu_thong_bao(); // bam ra ngoai hop thoai
});
document.addEventListener("keydown", (su_kien) => {
  if (su_kien.key === "Escape") dong_lop_phu_thong_bao();
});

// Thong bao NHAN LUC APP DANG MO SAN (foreground): Firebase Messaging trong
// truong hop nay se KHONG tu dong hien thong bao he thong (khac voi luc app
// dong - do firebase-messaging-sw.js dam nhiem), nen phai tu luu lai o day
// de nguoi dung van thay duoc qua chuong, du dang mo san trang.
onMessage(nhan_tin, (payload) => {
  const tieu_de = payload?.notification?.title || "Lịch cúp điện";
  const noi_dung = payload?.notification?.body || "";
  luu_thong_bao_moi(tieu_de, noi_dung)
    .then(cap_nhat_huy_hieu_chuong)
    .catch((loi) => console.warn("Khong luu duoc thong bao (foreground):", loi));
});

async function khoi_dong() {
  await nap_danh_muc_khu_pho();
  cap_nhat_huy_hieu_chuong();

  chon_don_vi_el.addEventListener("change", () => {
    ve_lai_danh_sach_phuong(chon_don_vi_el.value);
    ve_lai_luoi_khu_pho(""); // doi don vi thi bo trong luoi khu pho, cho chon lai phuong
  });
  chon_phuong_el.addEventListener("change", () => ve_lai_luoi_khu_pho(chon_phuong_el.value));
  phan_tu_form.addEventListener("submit", xu_ly_gui_dang_ky);
  nut_sua_dang_ky.addEventListener("click", hien_thi_man_hinh_chon_khu_vuc);

  const dang_ky_hien_co = await kiem_tra_dang_ky_hien_co();
  if (dang_ky_hien_co?.ten_khu_pho?.length) {
    hien_thi_man_hinh_trang_thai(dang_ky_hien_co.ma_phuong, dang_ky_hien_co.ten_khu_pho);
  } else {
    ve_lai_danh_sach_phuong("");
    ve_lai_luoi_khu_pho("");
    hien_thi_man_hinh_chon_khu_vuc();
  }
}

khoi_dong();
