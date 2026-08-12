// Doc data/lich-tho.json (do scripts/lay-du-lieu.mjs tao ra), lam 3 viec:
//   1) Ghi vao Firestore collection "lich_cup_dien" (idempotent — chay lai
//      nhieu lan khong tao trung du lieu, nho ma tai lieu la hash noi dung)
//   2) Voi NHUNG BAN GHI MOI (chua tung thay), doi chieu bitmask voi NGUOI
//      DANG KY CUNG XA/PHUONG (query rieng theo ma_phuong — khong doc het
//      toan bo nguoi dang ky trong tinh, de van chay nhanh khi mo rong ca
//      tinh Tay Ninh) va gui push FCM "Lich cup dien moi" ngay lap tuc
//   3) Xoa cac ban ghi lich_cup_dien da qua thoi gian ket thuc (don dep)
//
// Nhac truoc gio cup dien (24h) la 1 luong RIENG, xem
// scripts/nhac-truoc-gio-cup-dien.mjs — chay theo lich rieng, thuong xuyen hon.
//
// Can bien moi truong FIREBASE_SERVICE_ACCOUNT_KEY_JSON (JSON service account,
// luu trong GitHub Actions Secrets — xem README.md).

import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";

import admin from "firebase-admin";

const THU_MUC_GOC = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

function khoi_tao_firebase_admin() {
  const chuoi_khoa = process.env.FIREBASE_SERVICE_ACCOUNT_KEY_JSON;
  if (!chuoi_khoa) {
    throw new Error("Thieu bien moi truong FIREBASE_SERVICE_ACCOUNT_KEY_JSON");
  }
  const thong_tin_dang_nhap = JSON.parse(chuoi_khoa);
  admin.initializeApp({ credential: admin.credential.cert(thong_tin_dang_nhap) });
  return { co_so_du_lieu: admin.firestore(), nhan_tin: admin.messaging() };
}

/** Tao bitmask (BigInt) tu danh sach chi_so_bit — ban sao cua src/bitset.js vi
 *  Node script chay doc lap, khong import truc tiep tu thu muc src de tranh
 *  rang buoc duong dan phuc tap giua ESM trinh duyet va Node. */
function tao_bitmask(danh_sach_chi_so) {
  let ket_qua = 0n;
  for (const chi_so of danh_sach_chi_so) ket_qua |= (1n << BigInt(chi_so));
  return ket_qua;
}
function bitmask_sang_danh_sach_chi_so(bitmask) {
  const ket_qua = [];
  let con_lai = bitmask;
  let chi_so = 0;
  while (con_lai > 0n) {
    if (con_lai & 1n) ket_qua.push(chi_so);
    con_lai >>= 1n;
    chi_so += 1;
  }
  return ket_qua;
}

/** Sinh ma tai lieu on dinh tu noi dung (bao gom ma_phuong de tranh trung giua
 *  cac Xa/Phuong khac nhau), de chay lai nhieu lan khong bi trung. */
function tao_ma_tai_lieu(ban_ghi) {
  const chuoi_goc = `${ban_ghi.ma_phuong}|${ban_ghi.khu_vuc_nguyen_van}|${ban_ghi.thoi_gian_nguyen_van}|${ban_ghi.ly_do}`;
  return createHash("sha256").update(chuoi_goc, "utf-8").digest("hex").slice(0, 24);
}

/** Phan tich "Từ HH:MM:SS ngày DD/MM/YYYY đến HH:MM:SS ngày DD/MM/YYYY" thanh 2 Date (gio Viet Nam UTC+7). */
function phan_tich_khoang_thoi_gian(van_ban_tho) {
  const van_ban_gon = van_ban_tho.replace(/\s+/g, " ").trim();
  const khop = van_ban_gon.match(
    /Từ\s+(\d{2}:\d{2}:\d{2})\s+ngày\s+(\d{2})\/(\d{2})\/(\d{4})\s+đến\s+(\d{2}:\d{2}:\d{2})\s+ngày\s+(\d{2})\/(\d{2})\/(\d{4})/
  );
  if (!khop) return { tu_luc: null, den_luc: null };

  const [, gio1, ngay1, thang1, nam1, gio2, ngay2, thang2, nam2] = khop;
  const tu_luc = new Date(`${nam1}-${thang1}-${ngay1}T${gio1}+07:00`);
  const den_luc = new Date(`${nam2}-${thang2}-${ngay2}T${gio2}+07:00`);
  return { tu_luc, den_luc };
}

async function dong_bo_va_tra_ve_ban_ghi_moi(co_so_du_lieu, danh_sach_ban_ghi) {
  const bo_suu_tap = co_so_du_lieu.collection("lich_cup_dien");
  const cac_ban_ghi_moi = [];

  for (const ban_ghi of danh_sach_ban_ghi) {
    const ma_tai_lieu = tao_ma_tai_lieu(ban_ghi);
    const tham_chieu = bo_suu_tap.doc(ma_tai_lieu);
    const da_ton_tai = (await tham_chieu.get()).exists;

    const { tu_luc, den_luc } = phan_tich_khoang_thoi_gian(ban_ghi.thoi_gian_nguyen_van);
    const bitmask = tao_bitmask(ban_ghi.chi_so_bit);

    await tham_chieu.set({
      ma_phuong: ban_ghi.ma_phuong,
      ten_phuong: ban_ghi.ten_phuong,
      ten_khu_pho: ban_ghi.ten_khu_pho,
      bitmask: bitmask.toString(),
      khu_vuc_nguyen_van: ban_ghi.khu_vuc_nguyen_van,
      thoi_gian_nguyen_van: ban_ghi.thoi_gian_nguyen_van,
      ly_do: ban_ghi.ly_do,
      tu_luc: tu_luc ? admin.firestore.Timestamp.fromDate(tu_luc) : null,
      den_luc: den_luc ? admin.firestore.Timestamp.fromDate(den_luc) : null,
      da_gui_nhac: false, // dung boi scripts/nhac-truoc-gio-cup-dien.mjs, khong dong vao day
      cap_nhat_luc: admin.firestore.FieldValue.serverTimestamp(),
    }, { merge: true });

    if (!da_ton_tai) {
      cac_ban_ghi_moi.push({ ...ban_ghi, bitmask, ma_tai_lieu });
      console.log(`[MOI] ${ban_ghi.ten_phuong} — ${ban_ghi.ten_khu_pho.join(", ")} — ${ban_ghi.thoi_gian_nguyen_van.replace(/\s+/g, " ")}`);
    }
  }

  return cac_ban_ghi_moi;
}

/** Lay danh sach nguoi dang ky CUNG 1 Xa/Phuong (query truc tiep, khong doc
 *  het toan bo collection — quan trong de van nhanh khi so nguoi dang ky
 *  tang len sau khi mo rong ca tinh). */
async function lay_nguoi_dang_ky_theo_phuong(co_so_du_lieu, ma_phuong) {
  const snapshot = await co_so_du_lieu
    .collection("dang_ky_thong_bao")
    .where("ma_phuong", "==", ma_phuong)
    .get();
  return snapshot.docs.map((d) => ({
    token: d.id,
    bitmask: BigInt(d.data().bitmask || "0"),
  }));
}

async function gui_thong_bao_cho_ban_ghi_moi(co_so_du_lieu, nhan_tin, cac_ban_ghi_moi) {
  if (cac_ban_ghi_moi.length === 0) {
    console.log("Khong co ban ghi moi, khong can gui thong bao.");
    return;
  }

  // Gom nhom theo ma_phuong de chi query nguoi dang ky 1 lan cho moi phuong
  // (du 1 phuong co nhieu ban ghi moi trong cung 1 lan chay).
  const cache_nguoi_dang_ky_theo_phuong = new Map();

  for (const ban_ghi of cac_ban_ghi_moi) {
    if (!cache_nguoi_dang_ky_theo_phuong.has(ban_ghi.ma_phuong)) {
      const nguoi_dang_ky = await lay_nguoi_dang_ky_theo_phuong(co_so_du_lieu, ban_ghi.ma_phuong);
      cache_nguoi_dang_ky_theo_phuong.set(ban_ghi.ma_phuong, nguoi_dang_ky);
      console.log(`[${ban_ghi.ten_phuong}] So nguoi da dang ky: ${nguoi_dang_ky.length}`);
    }

    const nguoi_dang_ky = cache_nguoi_dang_ky_theo_phuong.get(ban_ghi.ma_phuong);
    const danh_sach_tin_can_gui = [];

    for (const nd of nguoi_dang_ky) {
      const bitmask_giao_nhau = nd.bitmask & ban_ghi.bitmask;
      if (bitmask_giao_nhau === 0n) continue; // khong lien quan gi den nguoi nay

      const chi_so_giao_nhau = bitmask_sang_danh_sach_chi_so(bitmask_giao_nhau);
      const ten_khu_pho_rieng_cua_ho = ban_ghi.ten_khu_pho.filter((_, i) =>
        chi_so_giao_nhau.includes(ban_ghi.chi_so_bit[i])
      );

      danh_sach_tin_can_gui.push({
        token: nd.token,
        notification: {
          title: "Sắp cúp điện",
          body: `${ban_ghi.ten_phuong} — khu phố ${ten_khu_pho_rieng_cua_ho.join(", ")}: ${ban_ghi.thoi_gian_nguyen_van.replace(/\s+/g, " ")}. Lý do: ${ban_ghi.ly_do}`,
        },
      });
    }

    if (danh_sach_tin_can_gui.length === 0) continue;

    const ket_qua_gui = await nhan_tin.sendEach(danh_sach_tin_can_gui);
    console.log(
      `Da gui cho ${danh_sach_tin_can_gui.length} thiet bi (thanh cong: ${ket_qua_gui.successCount}, that bai: ${ket_qua_gui.failureCount}) — ban ghi: ${ban_ghi.ten_phuong} — ${ban_ghi.ten_khu_pho.join(", ")}`
    );

    ket_qua_gui.responses.forEach((phan_hoi, chi_so) => {
      if (!phan_hoi.success && phan_hoi.error?.code === "messaging/registration-token-not-registered") {
        const token_loi = danh_sach_tin_can_gui[chi_so].token;
        co_so_du_lieu.collection("dang_ky_thong_bao").doc(token_loi).delete().catch(() => {});
      }
    });
  }
}

async function don_dep_ban_ghi_het_han(co_so_du_lieu) {
  const bay_gio = admin.firestore.Timestamp.now();
  const snapshot_het_han = await co_so_du_lieu
    .collection("lich_cup_dien")
    .where("den_luc", "<", bay_gio)
    .get();

  if (snapshot_het_han.empty) {
    console.log("Khong co ban ghi nao het han can don dep.");
    return;
  }

  const lo_ghi = co_so_du_lieu.batch();
  snapshot_het_han.docs.forEach((tai_lieu) => lo_ghi.delete(tai_lieu.ref));
  await lo_ghi.commit();
  console.log(`Da xoa ${snapshot_het_han.size} ban ghi da het han.`);
}

async function chay() {
  const { co_so_du_lieu, nhan_tin } = khoi_tao_firebase_admin();

  const duong_dan_du_lieu = path.join(THU_MUC_GOC, "data", "lich-tho.json");
  const danh_sach_ban_ghi = JSON.parse(readFileSync(duong_dan_du_lieu, "utf-8"));

  const cac_ban_ghi_moi = await dong_bo_va_tra_ve_ban_ghi_moi(co_so_du_lieu, danh_sach_ban_ghi);
  await gui_thong_bao_cho_ban_ghi_moi(co_so_du_lieu, nhan_tin, cac_ban_ghi_moi);
  await don_dep_ban_ghi_het_han(co_so_du_lieu);

  console.log("Hoan tat dong bo.");
}

chay().catch((loi) => {
  console.error("Loi khi dong bo:", loi);
  process.exit(1);
});
