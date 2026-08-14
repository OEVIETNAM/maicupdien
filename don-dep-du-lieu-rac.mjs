// Chay 1 LAN DUY NHAT tren MAY CUA BAN de don sach du lieu rac da lo commit
// truoc khi bo tach ten duoc sua. Sau khi chay xong, XOA file nay di - khong
// can dua vao repo (chi la cong cu dung 1 lan).
//
// Cach chay:
//   node don-dep-du-lieu-rac.mjs
// (dat file nay ngay canh data/danh-muc-khu-pho.json roi chay, hoac sua
// duong dan DUONG_DAN ben duoi cho dung)

import { readFileSync, writeFileSync } from "node:fs";

const DUONG_DAN = "data/danh-muc-khu-pho.json";

const danh_muc = JSON.parse(readFileSync(DUONG_DAN, "utf-8"));

// 1) Xoa cac KHOA (Xa/Phuong) ro rang la rac: key qua dai bat thuong, hoac
//    ten_phuong chua ky tu xuong dong "\n", hoac chua nhieu hon 1 lan xuat
//    hien chu "xã "/"phường " (dau hieu bi gop nham nhieu xa lam 1).
const DAI_TOI_DA_HOP_LY = 40; // "TN-" + ten khong dau, binh thuong duoi 30-35 ky tu
let so_khoa_da_xoa = 0;
const danh_sach_khoa_da_xoa = [];

for (const khoa of Object.keys(danh_muc)) {
  if (khoa.startsWith("_")) continue;
  const phuong = danh_muc[khoa];
  const ten = phuong.ten_phuong || "";

  const co_xuong_dong = ten.includes("\n");
  const qua_dai = khoa.length > DAI_TOI_DA_HOP_LY;
  const so_lan_xa_phuong = (ten.match(/\bxã\b|\bphường\b/gi) || []).length;
  const co_nhieu_xa_phuong = so_lan_xa_phuong > 1;

  if (co_xuong_dong || qua_dai || co_nhieu_xa_phuong) {
    delete danh_muc[khoa];
    so_khoa_da_xoa += 1;
    danh_sach_khoa_da_xoa.push(`${khoa} ("${ten.replace(/\n/g, " / ")}")`);
  }
}

// 2) Voi cac Xa/Phuong CON LAI, loc bo cac phan tu khu_pho trong ro rang la
//    rac (mo ta duong/vi tri/cong trinh) - nhan dien bang cach: sau khi bo
//    tien to "Ấp "/"Khu phố ", phan con lai bat dau bang tu mo ta duong/vi
//    tri, hoac chua "một phần" chua duoc don (nghia la bi sot lai tu ban loi
//    truoc), hoac chua dau gach ngang " - " (dac trung cua mo ta tuyen duong).
const TU_MO_TA_LOAI_BO = /^(từ|đường|khu\s*vực|nhánh|cầu|ngã|trạm|cụm|công\s*ty|cty|nhà\s*máy|xí\s*nghiệp|chợ|hộ|dntn|doanh\s*nghiệp)(?=\s|$)/i;

let so_khu_pho_da_loc = 0;
for (const khoa of Object.keys(danh_muc)) {
  if (khoa.startsWith("_")) continue;
  const phuong = danh_muc[khoa];
  const khu_pho_sach = phuong.khu_pho.filter((ten_day_du) => {
    const ten_goc = ten_day_du.replace(/^(Ấp|Khu phố)\s+/i, "");
    const la_rac =
      /một phần/i.test(ten_goc) ||
      ten_goc.includes(" - ") ||
      TU_MO_TA_LOAI_BO.test(ten_goc);
    if (la_rac) so_khu_pho_da_loc += 1;
    return !la_rac;
  });
  phuong.khu_pho = khu_pho_sach;
}

// 3) Xoa luon cac Xa/Phuong ma sau khi loc khong con khu pho nao (vo nghia,
//    khong co gi de nguoi dung chon).
let so_phuong_rong_da_xoa = 0;
for (const khoa of Object.keys(danh_muc)) {
  if (khoa.startsWith("_")) continue;
  if (danh_muc[khoa].khu_pho.length === 0) {
    delete danh_muc[khoa];
    so_phuong_rong_da_xoa += 1;
  }
}

writeFileSync(DUONG_DAN, JSON.stringify(danh_muc, null, 2) + "\n", "utf-8");

console.log(`Da xoa ${so_khoa_da_xoa} Xa/Phuong ro rang la rac:`);
danh_sach_khoa_da_xoa.forEach((d) => console.log(`  - ${d}`));
console.log(`Da loc ${so_khu_pho_da_loc} khu pho/ap rac khoi cac Xa/Phuong con lai.`);
console.log(`Da xoa them ${so_phuong_rong_da_xoa} Xa/Phuong bi rong sau khi loc.`);
console.log("Hoan tat don dep. Kiem tra lai data/danh-muc-khu-pho.json roi commit + push.");
