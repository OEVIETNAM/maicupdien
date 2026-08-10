// Lay lich cup dien phuong Trang Bang tu API that cua EVNSPC.
// Chay boi GitHub Actions (xem .github/workflows/cap-nhat-lich-cup-dien.yml)
//
// Dau ra: ghi file data/lich-tho.json — danh sach ban ghi da loc theo
// dung 14 khu pho phuong Trang Bang, kem theo chi_so_bit tuong ung.

import fetch from "node-fetch";
import * as cheerio from "cheerio";
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const THU_MUC_GOC = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

const MA_DIEN_LUC_TRANG_BANG = "PB0503";
const URL_API = "https://www.cskh.evnspc.vn/TraCuu/GetThongTinLichNgungGiamCungCapDien";
const URL_TRANG_GOC = "https://www.cskh.evnspc.vn/TraCuu/LichNgungGiamCungCapDien";

const TIEU_DE_GIA_LAP_TRINH_DUYET = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  "X-Requested-With": "XMLHttpRequest",
  Referer: URL_TRANG_GOC,
};

function doc_danh_muc_khu_pho() {
  const duong_dan = path.join(THU_MUC_GOC, "data", "danh-muc-khu-pho.json");
  const du_lieu_tho = JSON.parse(readFileSync(duong_dan, "utf-8"));
  return Object.fromEntries(
    Object.entries(du_lieu_tho).filter(([ma]) => !ma.startsWith("_"))
  );
}

function tach_khu_pho_tu_van_ban(van_ban_khu_vuc, danh_sach_ten_khu_pho) {
  const ket_qua = [];
  const cac_cum_theo_phuong = van_ban_khu_vuc.split(";");

  for (const cum of cac_cum_theo_phuong) {
    if (!cum.includes("Trảng Bàng")) continue;

    const phan_truoc_phuong = cum.split(/[Pp]hường\s*Trảng\s*Bàng/)[0];
    const bo_tien_to = phan_truoc_phuong.replace(/khu\s*phố/gi, "");
    const cac_ten_tho = bo_tien_to.split(",").map((t) => t.trim().replace(/[.\s]+$/, ""));

    for (const ten_tho of cac_ten_tho) {
      for (const ten_chuan of danh_sach_ten_khu_pho) {
        if (ten_chuan.toLowerCase() === ten_tho.toLowerCase()) {
          ket_qua.push(ten_chuan);
        }
      }
    }
  }
  return [...new Set(ket_qua)];
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

async function lay_html_lich_cup_dien(tu_ngay, den_ngay, chuoi_cookie) {
  const tham_so = new URLSearchParams({
    madvi: MA_DIEN_LUC_TRANG_BANG,
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

function phan_tich_html(html_tho, danh_muc_khu_pho) {
  const $ = cheerio.load(html_tho);
  const danh_sach_ten_khu_pho = Object.values(danh_muc_khu_pho).map((t) => t.ten_khu_pho);
  // map nguoc: ten khu pho -> ma_khu_pho (de tra chi_so_bit)
  const ten_sang_ma = Object.fromEntries(
    Object.entries(danh_muc_khu_pho).map(([ma, tt]) => [tt.ten_khu_pho, ma])
  );

  const ket_qua = [];

  $("div.entry").each((_, phan_tu) => {
    const van_ban_khu_vuc = $(phan_tu).find("span.where").text().replace(/^KHU VỰC:\s*/, "").trim();
    const van_ban_thoi_gian = $(phan_tu).find("span.time").text().replace(/^THỜI GIAN:\s*/, "").replace(/\s+/g, " ").trim();
    const van_ban_ly_do = $(phan_tu).find("span.cause").text().replace(/^LÝ DO NGỪNG CUNG CẤP ĐIỆN:\s*/, "").trim();

    const ten_khu_pho_phu_hop = tach_khu_pho_tu_van_ban(van_ban_khu_vuc, danh_sach_ten_khu_pho);
    if (ten_khu_pho_phu_hop.length === 0) return; // khong lien quan phuong Trang Bang

    const ma_khu_pho_phu_hop = ten_khu_pho_phu_hop.map((ten) => ten_sang_ma[ten]);
    const chi_so_bit_phu_hop = ma_khu_pho_phu_hop.map((ma) => danh_muc_khu_pho[ma].chi_so_bit);

    ket_qua.push({
      ma_khu_pho: ma_khu_pho_phu_hop,
      ten_khu_pho: ten_khu_pho_phu_hop,
      chi_so_bit: chi_so_bit_phu_hop,
      khu_vuc_nguyen_van: van_ban_khu_vuc,
      thoi_gian_nguyen_van: van_ban_thoi_gian,
      ly_do: van_ban_ly_do,
    });
  });

  return ket_qua;
}

async function chay() {
  const danh_muc_khu_pho = doc_danh_muc_khu_pho();

  const hom_nay = new Date();
  const ngay_ket_thuc = new Date(hom_nay);
  ngay_ket_thuc.setDate(hom_nay.getDate() + 4);

  console.log(`Dang lay lich cup dien tu ${dinh_dang_ngay(hom_nay)} den ${dinh_dang_ngay(ngay_ket_thuc)}...`);

  const chuoi_cookie = await lay_cookie_tu_trang_goc();
  const html_tho = await lay_html_lich_cup_dien(hom_nay, ngay_ket_thuc, chuoi_cookie);
  const ket_qua = phan_tich_html(html_tho, danh_muc_khu_pho);

  console.log(`Tim thay ${ket_qua.length} ban ghi lien quan phuong Trang Bang.`);

  const duong_dan_ra = path.join(THU_MUC_GOC, "data", "lich-tho.json");
  writeFileSync(duong_dan_ra, JSON.stringify(ket_qua, null, 2), "utf-8");
  console.log(`Da ghi ket qua vao ${duong_dan_ra}`);
}

chay().catch((loi) => {
  console.error("Loi khi lay du lieu:", loi);
  process.exit(1);
});
