// Ban 2 - chat hon ban truoc, danh cho cac key con sot lai (vd "Đội Tân
// Thạnh - Ấp Kiến Bình", "Tân Tây và một phần ấp Tuyên Nhơn - xã Thạnh Hoá")
// ma tieu chi cu (do dai key, dem so lan "xã"/"phường") chua bat duoc.
//
// Cach chay: dat canh thu muc data/, chay `node don-dep-v2.mjs`

import { readFileSync, writeFileSync } from "node:fs";

const DUONG_DAN = "data/danh-muc-khu-pho.json";
const danh_muc = JSON.parse(readFileSync(DUONG_DAN, "utf-8"));

// Dau hieu 1 ten_phuong la RAC (khong phai 1 Xa/Phuong that):
//  - chua dau gach ngang " - " (dac trung noi 2 cum lai voi nhau)
//  - chua " và " (noi 2 thu lai)
//  - chua "một phần"/"1 phần" (qualifier bi lot vao ten)
//  - chua "ấp " o giua ten (1 Xa/Phuong that khong bao gio "chua" tu Ap mo ta
//    1 don vi khac ben trong ten cua chinh no)
//  - chua ky tu xuong dong
//  - dai bat thuong (>20 ky tu, ten Xa/Phuong that hiem khi dai vay)
function la_ten_rac(ten) {
  return (
    ten.includes("\n") ||
    / - /.test(ten) ||
    / và /i.test(ten) ||
    /một phần|1 phần/i.test(ten) ||
    /\bấp\s/i.test(ten) ||
    ten.length > 20
  );
}

let so_khoa_da_xoa = 0;
const danh_sach_da_xoa = [];

for (const khoa of Object.keys(danh_muc)) {
  if (khoa.startsWith("_")) continue;
  const ten = danh_muc[khoa].ten_phuong || "";
  if (la_ten_rac(ten)) {
    delete danh_muc[khoa];
    so_khoa_da_xoa += 1;
    danh_sach_da_xoa.push(`${khoa} ("${ten}")`);
  }
}

writeFileSync(DUONG_DAN, JSON.stringify(danh_muc, null, 2) + "\n", "utf-8");

console.log(`Da xoa them ${so_khoa_da_xoa} Xa/Phuong rac:`);
danh_sach_da_xoa.forEach((d) => console.log(`  - ${d}`));
console.log("Hoan tat. Kiem tra lai data/danh-muc-khu-pho.json roi commit + push.");
