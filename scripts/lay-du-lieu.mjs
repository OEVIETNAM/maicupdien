// Lay lich cup dien cho TAT CA don vi dien luc (cap huyen/thi xa) liet ke
// trong data/danh-muc-dien-luc.json, tu API that cua EVNSPC.
// Chay boi GitHub Actions (xem .github/workflows/cap-nhat-lich-cup-dien.yml)
//
// CHE DO TU KHAM PHA (auto-discovery): script se TU DONG nhan dien ten
// Xa/Phuong va ten khu pho/ap ngay trong du lieu that tra ve tu EVNSPC, roi
// TU BO SUNG vao data/danh-muc-khu-pho.json neu chua co - khong can go tay
// truoc danh sach nay cho tung Xa/Phuong. Ly do: du lieu chinh xac nhat luon
// la du lieu goc cua EVNSPC, khong phai danh sach tong hop tu nguon khac co
// the sai lech (vd ghi gop nhieu xa dung chung 1 danh sach ap).
//
// QUY TAC AN TOAN duy nhat khi tu dong ghi: CHI DUOC THEM vao CUOI mang
// khu_pho cua 1 Xa/Phuong da ton tai — khong bao gio xoa/doi vi tri phan tu
// cu, de khong lam sai bitmask cua nguoi da dang ky truoc do.
//
// Dau ra:
//   - data/lich-tho.json           danh sach ban ghi lich cup dien da loc
//   - data/danh-muc-khu-pho.json   CO THE duoc cap nhat (them Xa/Phuong hoac
//                                   khu pho/ap moi phat hien) — workflow se
//                                   tu dong commit lai file nay neu co thay doi

import fetch from "node-fetch";
import * as cheerio from "cheerio";
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const THU_MUC_GOC = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

const URL_API = "https://www.cskh.evnspc.vn/TraCuu/GetThongTinLichNgungGiamCungCapDien";
const URL_TRANG_GOC = "https://www.cskh.evnspc.vn/TraCuu/LichNgungGiamCungCapDien";

const TIEU_DE_GIA_LAP_TRINH_DUYET = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  "X-Requested-With": "XMLHttpRequest",
  Referer: URL_TRANG_GOC,
};

const DUONG_DAN_DANH_MUC_DIEN_LUC = path.join(THU_MUC_GOC, "data", "danh-muc-dien-luc.json");
const DUONG_DAN_DANH_MUC_KHU_PHO = path.join(THU_MUC_GOC, "data", "danh-muc-khu-pho.json");
const DUONG_DAN_LICH_THO = path.join(THU_MUC_GOC, "data", "lich-tho.json");

function doc_danh_sach_don_vi() {
  const du_lieu = JSON.parse(readFileSync(DUONG_DAN_DANH_MUC_DIEN_LUC, "utf-8"));
  return du_lieu.don_vi;
}

function doc_danh_muc_khu_pho() {
  return JSON.parse(readFileSync(DUONG_DAN_DANH_MUC_KHU_PHO, "utf-8"));
}

function ghi_danh_muc_khu_pho(danh_muc) {
  writeFileSync(DUONG_DAN_DANH_MUC_KHU_PHO, JSON.stringify(danh_muc, null, 2) + "\n", "utf-8");
}

/** Bo dau tieng Viet + chuan hoa thanh khoa dinh danh vd "TN-TRANGBANG". */
function tao_khoa_phuong(ten_phuong) {
  const khong_dau = ten_phuong
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/gi, (k) => (k === "đ" ? "d" : "D"));
  const slug = khong_dau.toUpperCase().replace(/[^A-Z0-9]/g, "");
  return `TN-${slug}`;
}

/** Tim hoac tao 1 Xa/Phuong trong danh_muc (mutate truc tiep). Tra ve khoa.
 *  Neu phuong da ton tai nhung con thieu loai_don_vi/ma_dien_luc (vd du lieu
 *  nhap tay truoc do), tu dong dien bu (tu chua lanh) tu du lieu crawl that. */
function tim_hoac_tao_phuong(danh_muc, ten_phuong, loai_don_vi, ma_dien_luc, ten_don_vi) {
  const khoa = tao_khoa_phuong(ten_phuong);
  if (!danh_muc[khoa]) {
    danh_muc[khoa] = {
      ten_phuong,
      loai_don_vi,
      ten_huyen: ten_don_vi.replace(/^Điện lực\s*/i, ""),
      ma_dien_luc,
      khu_pho: [],
    };
    console.log(`  [MOI] Phat hien Xa/Phuong moi: "${loai_don_vi} ${ten_phuong}" (${khoa})`);
  } else {
    if (!danh_muc[khoa].loai_don_vi) danh_muc[khoa].loai_don_vi = loai_don_vi;
    if (!danh_muc[khoa].ma_dien_luc) danh_muc[khoa].ma_dien_luc = ma_dien_luc;
  }
  return khoa;
}

/** Them ten_khu_pho vao mang khu_pho cua 1 phuong NEU CHUA CO (chi them vao
 *  cuoi). Tra ve chi_so_bit (vi tri) cua ten do trong mang, du la moi hay cu. */
function tim_hoac_them_khu_pho(danh_muc, khoa_phuong, ten_khu_pho) {
  const phuong = danh_muc[khoa_phuong];
  const chi_so_co_san = phuong.khu_pho.findIndex((t) => t.toLowerCase() === ten_khu_pho.toLowerCase());
  if (chi_so_co_san !== -1) return chi_so_co_san;

  phuong.khu_pho.push(ten_khu_pho);
  const chi_so_moi = phuong.khu_pho.length - 1;
  console.log(`  [MOI] "${phuong.ten_phuong}": them khu pho/ap moi "${ten_khu_pho}" (bit ${chi_so_moi})`);
  return chi_so_moi;
}

/** Tu khoa nhan dien cac don vi KHONG PHAI khu pho/ap that (ho kinh doanh, cong
 *  ty, tram bien ap...) - EVNSPC doi khi liet ke chung vao truong KHU VUC. Neu
 *  gap ten con lot qua bo loc nay, gui vi du that cho nguoi phat trien de bo
 *  sung them tu khoa. */
const TU_KHOA_LOAI_BO = /hộ kinh doanh|\bhkd\b|công ty|\bcty\b|doanh nghiệp|\bdntn\b|cơ sở sản xuất|trạm biến áp|\btba\b|nhà máy|xí nghiệp|chi nhánh|khách hàng/i;

/** Tach 1 cum van ban KHU VUC (da split theo ";") thanh
 *  {loai_don_vi: "Phường"|"Xã", ten_phuong, ten_khu_pho_tho[]}.
 *  Vi du cum: " khu phố An Hòa, An Phú. Phường Trảng Bàng"
 *  -> { loai_don_vi: "Phường", ten_phuong: "Trảng Bàng",
 *       ten_khu_pho_tho: ["Khu phố An Hòa", "Khu phố An Phú"] }
 *  Tong quat, khong gioi han vao 1 ten phuong cu the — nhan dien "Phường X" / "Xã X" bat ky. */
function tach_1_cum(cum_van_ban) {
  const khop_phuong = cum_van_ban.match(/([Pp]hường|[Xx]ã)\s+([^,;.]+?)(?:[,.]|$)/);
  if (!khop_phuong) return null;

  const loai_don_vi = khop_phuong[1].toLowerCase() === "phường" ? "Phường" : "Xã";
  const ten_phuong = khop_phuong[2].trim();
  const phan_truoc_phuong = cum_van_ban.slice(0, khop_phuong.index);

  // Xac dinh tien to chuan de gan lai cho tung ten (nguon hay chi ghi tien to
  // 1 lan roi liet ke ten cach nhau bang dau phay, khong lap lai tien to).
  let tien_to = null;
  if (/ấp/i.test(phan_truoc_phuong)) tien_to = "Ấp";
  else if (/khu\s*phố|\bkp\b/i.test(phan_truoc_phuong)) tien_to = "Khu phố";

  const bo_tien_to = phan_truoc_phuong.replace(/khu\s*phố|\bkp\b|ấp/gi, "");
  const ten_khu_pho_tho = bo_tien_to
    .split(",")
    .map((t) => t.trim().replace(/[.\s]+$/, ""))
    .filter(Boolean)
    .filter((t) => !TU_KHOA_LOAI_BO.test(t)) // loai bo ho kinh doanh/cong ty...
    .map((t) => (tien_to ? `${tien_to} ${t}` : t));

  return { loai_don_vi, ten_phuong, ten_khu_pho_tho };
}

async function lay_cookie_tu_trang_goc() {
  const phan_hoi = await fetch(URL_TRANG_GOC, { headers: TIEU_DE_GIA_LAP_TRINH_DUYET });
  const cac_cookie_tho = phan_hoi.headers.raw()["set-cookie"] || [];
  return cac_cookie_tho.map((c) => c.split(";")[0]).join("; ");
}

function dinh_dang_ngay(doi_tuong_ngay) {
  const ngay = String(doi_tuong_ngay.getDate()).padStart(2, "0");
  const thang = String(doi_tuong_ngay.getMonth() + 1).padStart(2, "0");
  const nam = doi_tuong_ngay.getFullYear();
  return `${ngay}-${thang}-${nam}`;
}

async function lay_html_lich_cup_dien(ma_dien_luc, tu_ngay, den_ngay, chuoi_cookie) {
  const tham_so = new URLSearchParams({
    madvi: ma_dien_luc,
    tuNgay: dinh_dang_ngay(tu_ngay),
    denNgay: dinh_dang_ngay(den_ngay),
    ChucNang: "MaDonVi",
  });

  const phan_hoi = await fetch(`${URL_API}?${tham_so}`, {
    headers: { ...TIEU_DE_GIA_LAP_TRINH_DUYET, Cookie: chuoi_cookie },
  });
  if (!phan_hoi.ok) throw new Error(`API tra ve loi HTTP ${phan_hoi.status} (ma_dien_luc=${ma_dien_luc})`);
  return phan_hoi.text();
}

/** Phan tich 1 trang HTML cua 1 don vi dien luc (co the chua NHIEU Xa/Phuong
 *  khac nhau trong cac ban ghi). Vua tra ve ban ghi, vua CAP NHAT danh_muc
 *  (mutate truc tiep) voi Xa/Phuong / khu pho moi phat hien. */
function phan_tich_html(html_tho, ma_dien_luc, ten_don_vi, danh_muc) {
  const $ = cheerio.load(html_tho);
  const ket_qua = [];

  $("div.entry").each((_, phan_tu) => {
    const van_ban_khu_vuc = $(phan_tu).find("span.where").text().replace(/^KHU VỰC:\s*/, "").trim();
    const van_ban_thoi_gian = $(phan_tu).find("span.time").text().replace(/^THỜI GIAN:\s*/, "").replace(/\s+/g, " ").trim();
    const van_ban_ly_do = $(phan_tu).find("span.cause").text().replace(/^LÝ DO NGỪNG CUNG CẤP ĐIỆN:\s*/, "").trim();

    for (const cum of van_ban_khu_vuc.split(";")) {
      const da_tach = tach_1_cum(cum);
      if (!da_tach || da_tach.ten_khu_pho_tho.length === 0) continue;

      const khoa_phuong = tim_hoac_tao_phuong(danh_muc, da_tach.ten_phuong, da_tach.loai_don_vi, ma_dien_luc, ten_don_vi);
      const chi_so_bit = da_tach.ten_khu_pho_tho.map((ten) => tim_hoac_them_khu_pho(danh_muc, khoa_phuong, ten));

      ket_qua.push({
        ma_phuong: khoa_phuong,
        ten_phuong: danh_muc[khoa_phuong].ten_phuong,
        ten_khu_pho: da_tach.ten_khu_pho_tho.map((_, i) => danh_muc[khoa_phuong].khu_pho[chi_so_bit[i]]),
        chi_so_bit,
        khu_vuc_nguyen_van: van_ban_khu_vuc,
        thoi_gian_nguyen_van: van_ban_thoi_gian,
        ly_do: van_ban_ly_do,
      });
    }
  });

  return ket_qua;
}

async function chay() {
  const danh_sach_don_vi = doc_danh_sach_don_vi();
  const danh_muc = doc_danh_muc_khu_pho();

  const hom_nay = new Date();
  const ngay_ket_thuc = new Date(hom_nay);
  ngay_ket_thuc.setDate(hom_nay.getDate() + 4);

  console.log(`Se crawl ${danh_sach_don_vi.length} don vi dien luc, tu ${dinh_dang_ngay(hom_nay)} den ${dinh_dang_ngay(ngay_ket_thuc)}...`);

  const chuoi_cookie = await lay_cookie_tu_trang_goc();
  const tat_ca_ban_ghi = [];

  for (const don_vi of danh_sach_don_vi) {
    try {
      const html_tho = await lay_html_lich_cup_dien(don_vi.ma_dien_luc, hom_nay, ngay_ket_thuc, chuoi_cookie);
      const ket_qua = phan_tich_html(html_tho, don_vi.ma_dien_luc, don_vi.ten_don_vi, danh_muc);
      tat_ca_ban_ghi.push(...ket_qua);
      console.log(`[${don_vi.ten_don_vi}] tim thay ${ket_qua.length} ban ghi.`);
    } catch (loi) {
      console.error(`[${don_vi.ten_don_vi}] Loi khi crawl (ma_dien_luc=${don_vi.ma_dien_luc}):`, loi.message);
      // Khong dung toan bo script chi vi 1 don vi loi - tiep tuc cac don vi con lai
    }
  }

  ghi_danh_muc_khu_pho(danh_muc); // co the khong doi gi ca - workflow se tu kiem tra git diff
  writeFileSync(DUONG_DAN_LICH_THO, JSON.stringify(tat_ca_ban_ghi, null, 2), "utf-8");
  console.log(`\nDa ghi ${tat_ca_ban_ghi.length} ban ghi (tat ca don vi) vao ${DUONG_DAN_LICH_THO}`);
}

chay().catch((loi) => {
  console.error("Loi khi lay du lieu:", loi);
  process.exit(1);
});
