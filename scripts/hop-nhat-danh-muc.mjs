#!/usr/bin/env node
// Git MERGE DRIVER rieng cho data/danh-muc-khu-pho.json.
//
// File nay la du lieu TU DONG PHINH TO (workflow chi THEM Xa/Phuong hoac
// khu pho/ap moi, khong bao gio xoa/doi vi tri phan tu da co). Vi vay xung
// dot git kieu van ban thong thuong la khong can thiet - chi can HOP NHAT
// (union) ca 2 phia: Xa/Phuong nao co o ca 2 ban thi gop mang khu_pho lai
// (giu nguyen thu tu ben "ours", noi them nhung ten ben "theirs" chua co vao
// CUOI mang) - dung quy tac chi-them-vao-cuoi, khong lam sai bitmask ai ca.
//
// Duoc kich hoat qua .gitattributes + 1 dong `git config` truoc khi
// pull/rebase (xem .github/workflows/cap-nhat-lich-cup-dien.yml). Khong can
// chay tay file nay - git tu goi khi merge/rebase gap file duoc khai bao
// dung merge driver nay.

import { readFileSync, writeFileSync } from "node:fs";

// Git goi merge driver voi cu phap: <driver> %A %O %B
// %A = file "ours" (se bi GHI DE boi ket qua merge cuoi cung)
// %O = file goc chung (base) - khong dung toi trong logic union don gian nay
// %B = file "theirs"
const [, , duong_dan_ours, , duong_dan_theirs] = process.argv;

const ours = JSON.parse(readFileSync(duong_dan_ours, "utf-8"));
const theirs = JSON.parse(readFileSync(duong_dan_theirs, "utf-8"));

const ket_qua = { ...ours };

for (const [khoa, phuong_theirs] of Object.entries(theirs)) {
  if (khoa.startsWith("_")) continue;

  if (!ket_qua[khoa]) {
    // Xa/Phuong nay ben "theirs" co ma "ours" khong co -> lay nguyen
    ket_qua[khoa] = phuong_theirs;
    continue;
  }

  const phuong_ours = ket_qua[khoa];
  const ten_da_co_thuong = new Set((phuong_ours.khu_pho || []).map((t) => t.toLowerCase()));
  const khu_pho_hop_nhat = [...(phuong_ours.khu_pho || [])];

  for (const ten of phuong_theirs.khu_pho || []) {
    if (!ten_da_co_thuong.has(ten.toLowerCase())) {
      khu_pho_hop_nhat.push(ten); // CHI THEM VAO CUOI - dung quy tac bat bien
      ten_da_co_thuong.add(ten.toLowerCase());
    }
  }

  ket_qua[khoa] = {
    ...phuong_theirs,
    ...phuong_ours, // uu tien gia tri "ours" cho cac truong don (ten_phuong, ma_dien_luc...)
    khu_pho: khu_pho_hop_nhat,
  };
}

writeFileSync(duong_dan_ours, JSON.stringify(ket_qua, null, 2) + "\n", "utf-8");
console.log(`[hop-nhat-danh-muc] Da gop xong, ghi vao ${duong_dan_ours}`);
process.exit(0); // exit 0 = git hieu la merge THANH CONG, khong con xung dot
