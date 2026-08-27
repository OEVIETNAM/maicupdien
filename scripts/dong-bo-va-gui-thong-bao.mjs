// CHI DONG BO DU LIEU - KHONG GUI THONG BAO O DAY. Viec gui thong bao "sap
// cup dien" la nhiem vu RIENG cua scripts/nhac-truoc-gio-cup-dien.mjs (chay
// theo lich khac), de dam bao MOI nguoi dang ky chi nhan DUNG 1 thong bao
// cho 1 lan cup dien - gui ngay khi vua phat hien lich moi (nhu script nay
// tung lam truoc day) RỒI lai gui nhac truoc gio cup se lam phien nguoi dung
// bang 2 thong bao cho cung 1 su kien.
//
// Doc data/lich-tho.json (do scripts/lay-du-lieu.mjs tao ra, MOI ban ghi
// thuoc dung 1 ma_phuong), lam 2 viec:
//   1) Ghi vao Firestore collection "lich_cup_dien" (idempotent — ma tai
//      lieu la hash noi dung, chay lai nhieu lan khong tao trung).
//      Tao moi thi dat them da_gui_nhac_cho=[] (danh sach token FCM DA duoc
//      scripts/nhac-truoc-gio-cup-dien.mjs gui nhac - de trong luc moi tao,
//      script do se tu bo sung dan). Script nay KHONG dung lai mang do sau
//      khi da co san, tranh xoa mat lich su ai da duoc nhac.
//   2) Xoa cac ban ghi lich_cup_dien da qua thoi gian ket thuc (don dep).
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

  const co_so_du_lieu = admin.firestore();
  co_so_du_lieu.settings({ ignoreUndefinedProperties: true });

  return { co_so_du_lieu };
}

/** Ban sao cua src/bitset.js — Node script chay doc lap, khong import truc
 *  tiep tu thu muc src de tranh rang buoc duong dan giua ESM trinh duyet va Node. */
function tao_bitmask(danh_sach_chi_so) {
  let ket_qua = 0n;
  for (const chi_so of danh_sach_chi_so) ket_qua |= (1n << BigInt(chi_so));
  return ket_qua;
}

/** Sinh ma tai lieu on dinh tu noi dung (kem ca ma_phuong, vi 1 doan van ban
 *  "KHU VUC" co the sinh ra ban ghi cho NHIEU xa/phuong khac nhau cung luc). */
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

async function dong_bo_va_tra_ve_tat_ca(co_so_du_lieu, danh_sach_ban_ghi) {
  const bo_suu_tap = co_so_du_lieu.collection("lich_cup_dien");
  const ket_qua = [];

  for (const ban_ghi of danh_sach_ban_ghi) {
    if (
      !ban_ghi.ma_phuong ||
      !Array.isArray(ban_ghi.chi_so_khu_pho) ||
      ban_ghi.chi_so_khu_pho.length === 0
    ) {
      console.warn("[BO QUA] Ban ghi thieu du lieu hop le:", JSON.stringify(ban_ghi).slice(0, 200));
      continue;
    }

    const ma_tai_lieu = tao_ma_tai_lieu(ban_ghi);
    const tham_chieu = bo_suu_tap.doc(ma_tai_lieu);
    const tai_lieu_hien_co = await tham_chieu.get();
    const da_ton_tai = tai_lieu_hien_co.exists;

    const { tu_luc, den_luc } = phan_tich_khoang_thoi_gian(ban_ghi.thoi_gian_nguyen_van);
    const bitmask = tao_bitmask(ban_ghi.chi_so_khu_pho);

    const du_lieu_ghi = {
      ma_phuong: ban_ghi.ma_phuong,
      ten_phuong: ban_ghi.ten_phuong,
      ten_khu_pho: ban_ghi.ten_khu_pho,
      bitmask: bitmask.toString(),
      khu_vuc_nguyen_van: ban_ghi.khu_vuc_nguyen_van,
      thoi_gian_nguyen_van: ban_ghi.thoi_gian_nguyen_van,
      ly_do: ban_ghi.ly_do,
      tu_luc: tu_luc ? admin.firestore.Timestamp.fromDate(tu_luc) : null,
      den_luc: den_luc ? admin.firestore.Timestamp.fromDate(den_luc) : null,
      cap_nhat_luc: admin.firestore.FieldValue.serverTimestamp(),
    };

    if (!da_ton_tai) {
      // CHI dat khi TAO MOI — khong ghi de neu da ton tai, tranh mat lich su
      // "da gui nhac cho ai" ma scripts/nhac-truoc-gio-cup-dien.mjs da tich luy.
      du_lieu_ghi.da_gui_nhac_cho = [];
      console.log(
        `[MOI] ${ban_ghi.ten_phuong} — ${(ban_ghi.ten_khu_pho || []).join(", ")} — ${ban_ghi.thoi_gian_nguyen_van.replace(/\s+/g, " ")}`
      );
    }

    await tham_chieu.set(du_lieu_ghi, { merge: true });
    ket_qua.push({ ...ban_ghi, bitmask, ma_tai_lieu, tu_luc, den_luc });
  }

  return ket_qua;
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
  const { co_so_du_lieu } = khoi_tao_firebase_admin();

  const duong_dan_du_lieu = path.join(THU_MUC_GOC, "data", "lich-tho.json");
  const danh_sach_ban_ghi = JSON.parse(readFileSync(duong_dan_du_lieu, "utf-8"));

  await dong_bo_va_tra_ve_tat_ca(co_so_du_lieu, danh_sach_ban_ghi);
  await don_dep_ban_ghi_het_han(co_so_du_lieu);

  console.log("Hoan tat dong bo (khong gui thong bao - viec do do scripts/nhac-truoc-gio-cup-dien.mjs dam nhiem).");
}

chay().catch((loi) => {
  console.error("Loi khi dong bo:", loi);
  process.exit(1);
});
