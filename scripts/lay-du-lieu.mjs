// Lay lich cup dien TOAN BO cac Xa/Phuong da biet trong data/danh-muc-khu-pho.json,
// gom nhom theo ma_dien_luc (moi ma_dien_luc chi goi API 1 lan, du co nhieu
// Xa/Phuong cung thuoc 1 don vi dien luc).
//
// TU DONG KHAM PHA: neu trong luc phan tich phat hien Xa/Phuong hoac khu
// pho/ap MOI (chua co trong danh muc) o cung 1 ma_dien_luc dang crawl, script
// se TU THEM vao data/danh-muc-khu-pho.json (chi them vao CUOI mang khu_pho,
// khong bao gio sua/xoa/sap xep lai phan tu da co — xem _ghi_chu trong file
// do de biet ly do). Ghi de file nay se duoc buoc sau trong workflow tu dong
// commit lai (xem .github/workflows/cap-nhat-lich-cup-dien.yml).
//
// Dau ra: data/lich-tho.json — danh sach ban ghi { ma_phuong, ten_phuong,
// chi_so_khu_pho, ten_khu_pho, khu_vuc_nguyen_van, thoi_gian_nguyen_van, ly_do }

import fetch from "node-fetch";
import * as cheerio from "cheerio";
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const THU_MUC_GOC = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const DUONG_DAN_DANH_MUC_KHU_PHO = path.join(THU_MUC_GOC, "data", "danh-muc-khu-pho.json");
const DUONG_DAN_DANH_MUC_DIEN_LUC = path.join(THU_MUC_GOC, "data", "danh-muc-dien-luc.json");
const DUONG_DAN_LICH_THO = path.join(THU_MUC_GOC, "data", "lich-tho.json");

const URL_API = "https://www.cskh.evnspc.vn/TraCuu/GetThongTinLichNgungGiamCungCapDien";
const URL_TRANG_GOC = "https://www.cskh.evnspc.vn/TraCuu/LichNgungGiamCungCapDien";

const TIEU_DE_GIA_LAP_TRINH_DUYET = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  "X-Requested-With": "XMLHttpRequest",
  Referer: URL_TRANG_GOC,
};

const BIEU_THUC_TIEN_TO = /^(Khu\s*phố|Ấp|Khóm|Tổ\s*dân\s*phố)\s+/i;

// Cac cum tu cho thay day KHONG PHAI ten khu pho/ap that, ma la ten ho kinh
// doanh/cong ty/tram bien ap... bi EVNSPC liet ke lan trong truong KHU VUC.
// Neu 1 token (sau khi tach theo dau phay) chua bat ky tu khoa nao duoi day,
// se BI LOAI BO hoan toan — khong dung de doi chieu VA khong bao gio duoc
// tu dong them vao danh-muc-khu-pho.json.
const TU_KHOA_LOAI_BO = [
  "hộ kinh doanh", "hkd", "công ty", "cty", "doanh nghiệp", "dntn",
  "cơ sở sản xuất", "trạm biến áp", "tba", "nhà máy", "xí nghiệp",
  "chi nhánh", "khách hàng",
];

function la_ten_can_loai_bo(ten) {
  const ten_thuong = ten.toLowerCase();
  return TU_KHOA_LOAI_BO.some((tu_khoa) => ten_thuong.includes(tu_khoa));
}

// ---------- Tien ich doc/ghi JSON ----------

function doc_json(duong_dan) {
  return JSON.parse(readFileSync(duong_dan, "utf-8"));
}
function ghi_json(duong_dan, doi_tuong) {
  writeFileSync(duong_dan, JSON.stringify(doi_tuong, null, 2) + "\n", "utf-8");
}
function nghi(mili_giay) {
  return new Promise((giai_quyet) => setTimeout(giai_quyet, mili_giay));
}

// ---------- Chuan hoa / so sanh ten ----------

/** Bo tien to loai don vi (Khu pho/Ap/Khom/To dan pho) va viet thuong de so sanh khong nham lan hoa-thuong. */
function chuan_hoa_de_so_sanh(ten) {
  return ten.replace(BIEU_THUC_TIEN_TO, "").trim().toLowerCase();
}

/** "Trảng Bàng" -> "TRANGBANG" (bo dau, bo khoang trang) de sinh ma Xa/Phuong moi. */
function bo_dau_va_viet_hoa(ten) {
  return ten
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[đĐ]/g, "d")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");
}

/** Sinh ma Xa/Phuong moi duy nhat, tranh trung voi ma da co san. */
function tao_ma_xa_phuong_moi(ten, danh_muc) {
  const goc = `TN-${bo_dau_va_viet_hoa(ten)}`;
  if (!danh_muc[goc]) return goc;
  let dem = 2;
  while (danh_muc[`${goc}-${dem}`]) dem += 1;
  return `${goc}-${dem}`;
}

/** Tim Xa/Phuong da co trong danh muc, cung ma_dien_luc, trung ten (khong phan biet hoa-thuong). */
function tim_ma_phuong_theo_ten(danh_muc, ma_dien_luc, ten) {
  const ten_chuan = ten.trim().toLowerCase();
  for (const [ma, tt] of Object.entries(danh_muc)) {
    if (ma.startsWith("_")) continue;
    if (tt.ma_dien_luc === ma_dien_luc && (tt.ten_phuong || "").trim().toLowerCase() === ten_chuan) {
      return ma;
    }
  }
  return null;
}

// ---------- Phan tich van ban "KHU VUC" ----------

/** Tim don vi hanh chinh (Phuong/Xa + ten) xuat hien trong 1 cum van ban, vi tri bat dau cua no. */
function tim_don_vi_hanh_chinh_trong_cum(cum) {
  const khop = cum.match(/(Phường|phường|Xã|xã)\s+([^,;.\n]+)/);
  if (!khop) return null;
  return {
    loai: /^ph/i.test(khop[1]) ? "Phường" : "Xã",
    ten: khop[2].trim(),
    chi_so_bat_dau: khop.index,
  };
}

/** Tach danh sach ten khu pho/ap tho tu doan van ban truoc ten Phuong/Xa.
 *  Neu 1 token khong co san tien to (vi du "An Hội" sau dau phay dung sau
 *  "Khu phố An Quới,"), tu dong ke thua tien to cua token dau tien trong cum. */
function tach_danh_sach_ten_khu_pho(doan_truoc_phuong) {
  const token_tho = doan_truoc_phuong
    .split(",")
    .map((t) => t.trim().replace(/[.\s]+$/, ""))
    .filter(Boolean);
  if (token_tho.length === 0) return [];

  const khop_tien_to_dau = token_tho[0].match(BIEU_THUC_TIEN_TO);
  const tien_to_ke_thua = khop_tien_to_dau ? khop_tien_to_dau[0].trim() : null;

  return token_tho.map((tho) =>
    BIEU_THUC_TIEN_TO.test(tho) || !tien_to_ke_thua ? tho : `${tien_to_ke_thua} ${tho}`
  ).filter((ten) => !la_ten_can_loai_bo(ten));
}

// ---------- Goi API EVNSPC ----------

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
  if (!phan_hoi.ok) throw new Error(`API tra ve loi HTTP ${phan_hoi.status}`);
  return phan_hoi.text();
}

// ---------- Xu ly chinh cho 1 ma_dien_luc ----------

/** Xu ly toan bo entry cua 1 ma_dien_luc: khop/tu tao Xa-Phuong va khu pho,
 *  day thang vao danh_muc_khu_pho (co side-effect, sua truc tiep object nay). */
function xu_ly_html_cho_1_dien_luc(html_tho, ma_dien_luc, ten_don_vi, danh_muc_khu_pho, ket_qua_ra) {
  const $ = cheerio.load(html_tho);
  let co_thay_doi = false;

  $("div.entry").each((_, phan_tu) => {
    const van_ban_khu_vuc = $(phan_tu).find("span.where").text().replace(/^KHU VỰC:\s*/, "").trim();
    const van_ban_thoi_gian = $(phan_tu).find("span.time").text().replace(/^THỜI GIAN:\s*/, "").replace(/\s+/g, " ").trim();
    const van_ban_ly_do = $(phan_tu).find("span.cause").text().replace(/^LÝ DO NGỪNG CUNG CẤP ĐIỆN:\s*/, "").trim();

    for (const cum of van_ban_khu_vuc.split(";")) {
      const dvhc = tim_don_vi_hanh_chinh_trong_cum(cum);
      if (!dvhc) continue;

      const doan_truoc = cum.slice(0, dvhc.chi_so_bat_dau);
      const danh_sach_ten_tho = tach_danh_sach_ten_khu_pho(doan_truoc);
      if (danh_sach_ten_tho.length === 0) continue;

      let ma_phuong = tim_ma_phuong_theo_ten(danh_muc_khu_pho, ma_dien_luc, dvhc.ten);
      if (!ma_phuong) {
        ma_phuong = tao_ma_xa_phuong_moi(dvhc.ten, danh_muc_khu_pho);
        danh_muc_khu_pho[ma_phuong] = {
          ten_phuong: dvhc.ten,
          ten_huyen: (ten_don_vi || "").replace(/^Điện lực\s*/i, ""),
          ma_dien_luc,
          khu_pho: [],
          loai_don_vi: dvhc.loai,
        };
        co_thay_doi = true;
        console.log(`  [XA/PHUONG MOI] ${ma_phuong} — ${dvhc.loai} ${dvhc.ten}`);
      }

      const thong_tin_phuong = danh_muc_khu_pho[ma_phuong];
      const chi_so_khop = [];
      const ten_khop = [];

      for (const ten_tho of danh_sach_ten_tho) {
        let chi_so = thong_tin_phuong.khu_pho.findIndex(
          (t) => chuan_hoa_de_so_sanh(t) === chuan_hoa_de_so_sanh(ten_tho)
        );
        if (chi_so === -1) {
          // CHI THEM VAO CUOI MANG — khong bao gio sua/xoa/sap xep lai phan tu cu
          thong_tin_phuong.khu_pho.push(ten_tho);
          chi_so = thong_tin_phuong.khu_pho.length - 1;
          co_thay_doi = true;
          console.log(`  [KHU PHO MOI] ${ma_phuong}[${chi_so}] = "${ten_tho}"`);
        }
        chi_so_khop.push(chi_so);
        ten_khop.push(thong_tin_phuong.khu_pho[chi_so]);
      }

      ket_qua_ra.push({
        ma_phuong,
        ten_phuong: thong_tin_phuong.ten_phuong,
        chi_so_khu_pho: chi_so_khop,
        ten_khu_pho: ten_khop,
        khu_vuc_nguyen_van: van_ban_khu_vuc,
        thoi_gian_nguyen_van: van_ban_thoi_gian,
        ly_do: van_ban_ly_do,
      });
    }
  });

  return co_thay_doi;
}

// ---------- Ham chinh ----------

async function chay() {
  const danh_muc_dien_luc = doc_json(DUONG_DAN_DANH_MUC_DIEN_LUC).don_vi;
  const danh_muc_khu_pho = doc_json(DUONG_DAN_DANH_MUC_KHU_PHO); // GIU NGUYEN ca khoa "_ghi_chu"

  const hom_nay = new Date();
  const ngay_ket_thuc = new Date(hom_nay);
  ngay_ket_thuc.setDate(hom_nay.getDate() + 4);
  console.log(`Khoang ngay crawl: ${dinh_dang_ngay(hom_nay)} -> ${dinh_dang_ngay(ngay_ket_thuc)}`);

  const chuoi_cookie = await lay_cookie_tu_trang_goc();

  const tat_ca_ban_ghi = [];
  let co_thay_doi_danh_muc = false;
  let so_don_vi_loi = 0;

  for (const { ma_dien_luc, ten_don_vi } of danh_muc_dien_luc) {
    console.log(`--- ${ten_don_vi} (${ma_dien_luc}) ---`);
    try {
      const html_tho = await lay_html_lich_cup_dien(ma_dien_luc, hom_nay, ngay_ket_thuc, chuoi_cookie);

      if (!html_tho.includes('class="entry"') && !html_tho.includes("KHU VỰC")) {
        console.warn(`  Bo qua: HTML tra ve khong giong trang du lieu that (co the bi WAF chan luc nay).`);
        so_don_vi_loi += 1;
      } else {
        const co_thay_doi = xu_ly_html_cho_1_dien_luc(
          html_tho, ma_dien_luc, ten_don_vi, danh_muc_khu_pho, tat_ca_ban_ghi
        );
        if (co_thay_doi) co_thay_doi_danh_muc = true;
      }
    } catch (loi) {
      console.warn(`  Bo qua do loi: ${loi.message}`);
      so_don_vi_loi += 1;
    }

    await nghi(700); // nghi giua cac lan goi de bot ap luc len WAF cua EVNSPC
  }

  if (co_thay_doi_danh_muc) {
    ghi_json(DUONG_DAN_DANH_MUC_KHU_PHO, danh_muc_khu_pho);
    console.log("\nDa cap nhat data/danh-muc-khu-pho.json (phat hien Xa/Phuong hoac khu pho/ap moi).");
  }

  ghi_json(DUONG_DAN_LICH_THO, tat_ca_ban_ghi);
  console.log(
    `\nHoan tat. Tong so ban ghi: ${tat_ca_ban_ghi.length}. So don vi dien luc bi loi/bo qua: ${so_don_vi_loi}/${danh_muc_dien_luc.length}.`
  );

  // Neu TOAN BO don vi deu loi (vd WAF chan dong loat), coi la thau that bai
  // that su de workflow bao do, thay vi am tham ghi ra file rong.
  if (so_don_vi_loi === danh_muc_dien_luc.length) {
    throw new Error("Tat ca don vi dien luc deu loi — co the bi WAF chan toan bo lan chay nay.");
  }
}

chay().catch((loi) => {
  console.error("Loi khi lay du lieu:", loi);
  process.exit(1);
});
