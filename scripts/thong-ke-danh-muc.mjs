// Script THONG KE (KHONG dong bo Firestore, KHONG goi mang, chi doc file
// data/danh-muc-khu-pho.json san co) - in ra 1 BAO CAO CO DANH SO THU TU va
// SAP XEP THEO TEN (dung thu tu chu cai tieng Viet), phan theo 3 cap:
//
//   Dien luc  ->  Xa/Phuong  ->  Khu pho/Ap
//
// Muc dich: giup nguoi quan ly nhin nhanh, DEM duoc tung cap con bao nhieu
// muc, de DOI CHIEU voi danh sach chinh thuc cua EVNSPC xem da du Xa/Phuong,
// da du Khu pho/Ap trong tung Xa/Phuong hay chua - va tien theo doi khi
// scripts/lay-du-lieu.mjs tu dong phat hien them Xa/Phuong hoac Khu pho/Ap
// MOI (thong ke se doi theo ngay khi chay lai).
//
// Cach chay:
//   node scripts/thong-ke-danh-muc.mjs
//   (hoac: npm run thong-ke)
//
// Ket qua:
//   - In tom tat (so luong Xa/Phuong theo tung Dien luc) ra console.
//   - Ghi bao cao day du (co danh so tung Khu pho/Ap) ra file
//     bao-cao-danh-muc.md o thu muc goc du an - mo bang trinh doc Markdown
//     bat ky (VS Code, GitHub, ...) de xem/in ra doi chieu.

import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const THU_MUC_GOC = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const DUONG_DAN_DANH_MUC = path.join(THU_MUC_GOC, "data", "danh-muc-khu-pho.json");
const DUONG_DAN_BAO_CAO = path.join(THU_MUC_GOC, "bao-cao-danh-muc.md");

// So sanh chuoi THEO DUNG THU TU CHU CAI TIENG VIET (a, ă, â, b, ... chu
// khong phai theo ma Unicode tho, se sai thu tu voi cac chu co dau).
const so_sanh_tieng_viet = new Intl.Collator("vi", { sensitivity: "base", numeric: true }).compare;

function doc_danh_muc() {
  const noi_dung = readFileSync(DUONG_DAN_DANH_MUC, "utf-8");
  const du_lieu = JSON.parse(noi_dung);
  // Bo qua cac khoa bat dau bang "_" (vd "_ghi_chu") - khong phai 1 Xa/Phuong.
  return Object.entries(du_lieu).filter(([ma]) => !ma.startsWith("_"));
}

/** Gom cac Xa/Phuong theo ma_dien_luc, roi sap xep ca 3 cap:
 *  Dien luc theo ma, Xa/Phuong theo ten, Khu pho/Ap theo ten. */
function gom_va_sap_xep(danh_sach_xa_phuong) {
  const nhom_theo_dien_luc = new Map(); // ma_dien_luc -> mang cac Xa/Phuong

  for (const [ma, thong_tin] of danh_sach_xa_phuong) {
    const ma_dien_luc = thong_tin.ma_dien_luc || "(chưa rõ điện lực)";
    if (!nhom_theo_dien_luc.has(ma_dien_luc)) nhom_theo_dien_luc.set(ma_dien_luc, []);
    nhom_theo_dien_luc.get(ma_dien_luc).push({ ma, ...thong_tin });
  }

  return [...nhom_theo_dien_luc.entries()]
    .sort(([ma_a], [ma_b]) => so_sanh_tieng_viet(ma_a, ma_b))
    .map(([ma_dien_luc, cac_xa_phuong]) => ({
      ma_dien_luc,
      cac_xa_phuong: cac_xa_phuong
        .slice()
        .sort((a, b) => so_sanh_tieng_viet(a.ten_phuong, b.ten_phuong))
        .map((xa_phuong) => ({
          ...xa_phuong,
          khu_pho_da_sap_xep: [...(xa_phuong.khu_pho || [])].sort(so_sanh_tieng_viet),
        })),
    }));
}

function dem_tong(du_lieu_da_gom) {
  const tong_so_xa_phuong = du_lieu_da_gom.reduce((tong, d) => tong + d.cac_xa_phuong.length, 0);
  const tong_so_khu_pho = du_lieu_da_gom.reduce(
    (tong, d) => tong + d.cac_xa_phuong.reduce((t2, xp) => t2 + xp.khu_pho_da_sap_xep.length, 0),
    0
  );
  return { tong_so_dien_luc: du_lieu_da_gom.length, tong_so_xa_phuong, tong_so_khu_pho };
}

function xay_dung_bao_cao_markdown(du_lieu_da_gom) {
  const { tong_so_dien_luc, tong_so_xa_phuong, tong_so_khu_pho } = dem_tong(du_lieu_da_gom);

  const dong = [];
  dong.push(`# Thống kê danh mục Điện lực / Xã-Phường / Khu phố-Ấp`);
  dong.push("");
  dong.push(
    "_Tự động sinh từ `data/danh-muc-khu-pho.json` — chạy lại khi cần: `node scripts/thong-ke-danh-muc.mjs`_"
  );
  dong.push("");
  dong.push(
    `**Tổng cộng:** ${tong_so_dien_luc} điện lực · ${tong_so_xa_phuong} xã/phường · ${tong_so_khu_pho} khu phố/ấp`
  );
  dong.push("");
  dong.push("## Danh sách điện lực");
  dong.push("");
  du_lieu_da_gom.forEach((dien_luc, chi_so) => {
    dong.push(`${chi_so + 1}. **${dien_luc.ma_dien_luc}** — ${dien_luc.cac_xa_phuong.length} xã/phường`);
  });
  dong.push("");
  dong.push("---");
  dong.push("");

  du_lieu_da_gom.forEach((dien_luc, chi_so_dien_luc) => {
    dong.push(
      `## ${chi_so_dien_luc + 1}. Điện lực ${dien_luc.ma_dien_luc} (${dien_luc.cac_xa_phuong.length} xã/phường)`
    );
    dong.push("");

    dien_luc.cac_xa_phuong.forEach((xa_phuong, chi_so_xa_phuong) => {
      const nhan_loai = xa_phuong.loai_don_vi ? `${xa_phuong.loai_don_vi} ` : "";
      dong.push(
        `${chi_so_xa_phuong + 1}. **${nhan_loai}${xa_phuong.ten_phuong}** _(mã: \`${xa_phuong.ma}\`${
          xa_phuong.ten_huyen ? `, huyện: ${xa_phuong.ten_huyen}` : ""
        }, ${xa_phuong.khu_pho_da_sap_xep.length} khu phố/ấp)_`
      );
      xa_phuong.khu_pho_da_sap_xep.forEach((ten_khu_pho, chi_so_khu_pho) => {
        dong.push(`   ${chi_so_khu_pho + 1}. ${ten_khu_pho}`);
      });
      dong.push("");
    });
  });

  return dong.join("\n");
}

function in_tom_tat_console(du_lieu_da_gom) {
  const { tong_so_dien_luc, tong_so_xa_phuong, tong_so_khu_pho } = dem_tong(du_lieu_da_gom);

  console.log("=== TOM TAT ===");
  du_lieu_da_gom.forEach((dien_luc, chi_so) => {
    console.log(`${chi_so + 1}. Dien luc ${dien_luc.ma_dien_luc}: ${dien_luc.cac_xa_phuong.length} xa/phuong`);
  });
  console.log("");
  console.log(
    `Tong cong: ${tong_so_dien_luc} dien luc, ${tong_so_xa_phuong} xa/phuong, ${tong_so_khu_pho} khu pho/ap.`
  );
}

function chay() {
  const danh_sach_xa_phuong = doc_danh_muc();
  const du_lieu_da_gom = gom_va_sap_xep(danh_sach_xa_phuong);

  writeFileSync(DUONG_DAN_BAO_CAO, xay_dung_bao_cao_markdown(du_lieu_da_gom), "utf-8");
  in_tom_tat_console(du_lieu_da_gom);
  console.log(`\nDa ghi bao cao day du (co danh so tung khu pho/ap) vao: ${DUONG_DAN_BAO_CAO}`);
}

chay();
