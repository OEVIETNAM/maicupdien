// Doc data/lich-tho.json (do scripts/lay-du-lieu.mjs tao ra, MOI ban ghi
// thuoc dung 1 ma_phuong), lam 3 viec:
//   1) Ghi vao Firestore collection "lich_cup_dien" (idempotent — ma tai
//      lieu la hash noi dung, chay lai nhieu lan khong tao trung).
//      Tao moi thi dat them da_gui_nhac=false (danh cho
//      scripts/nhac-truoc-gio-cup-dien.mjs biet ban ghi nay CHUA duoc nhac
//      "sap den gio cup" — script nay KHONG dung lai gia tri do sau khi da
//      co san, tranh reset nham ve chua-nhac).
//   2) Voi TUNG NGUOI DANG KY, gui thong bao cho nhung ban ghi ho khop
//      bitmask MA CHUA TUNG DUOC GUI CHO RIENG HO (xet theo tung nguoi,
//      khong xet theo "ban ghi co moi voi he thong khong" — tranh bo sot
//      nguoi vua doi/dang ky sang 1 xa/phuong da co san lich tu truoc).
//   3) Xoa cac ban ghi lich_cup_dien da qua thoi gian ket thuc (don dep).
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

  return { co_so_du_lieu, nhan_tin: admin.messaging() };
}

/** Ban sao cua src/bitset.js — Node script chay doc lap, khong import truc
 *  tiep tu thu muc src de tranh rang buoc duong dan giua ESM trinh duyet va Node. */
function tao_bitmask(danh_sach_chi_so) {
  let ket_qua = 0n;
  for (const chi_so of danh_sach_chi_so) ket_qua |= (1n << BigInt(chi_so));
  return ket_qua;
}
function co_giao_nhau(a, b) {
  return (a & b) !== 0n;
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
      // CHI dat khi TAO MOI — khong ghi de neu da ton tai, tranh reset ve
      // "chua nhac" mat du scripts/nhac-truoc-gio-cup-dien.mjs da xu ly roi.
      du_lieu_ghi.da_gui_nhac = false;
      console.log(
        `[MOI] ${ban_ghi.ten_phuong} — ${(ban_ghi.ten_khu_pho || []).join(", ")} — ${ban_ghi.thoi_gian_nguyen_van.replace(/\s+/g, " ")}`
      );
    }

    await tham_chieu.set(du_lieu_ghi, { merge: true });
    ket_qua.push({ ...ban_ghi, bitmask, ma_tai_lieu, tu_luc, den_luc });
  }

  return ket_qua;
}

async function gui_thong_bao_con_thieu(co_so_du_lieu, nhan_tin, tat_ca_ban_ghi_hien_tai) {
  const bay_gio = new Date();

  const cac_ban_ghi_con_hieu_luc = tat_ca_ban_ghi_hien_tai.filter(
    (bg) => !bg.den_luc || bg.den_luc >= bay_gio
  );
  if (cac_ban_ghi_con_hieu_luc.length === 0) {
    console.log("Khong co ban ghi nao con hieu luc, khong can gui thong bao.");
    return;
  }

  const bo_ma_tai_lieu_hien_co = new Set(cac_ban_ghi_con_hieu_luc.map((bg) => bg.ma_tai_lieu));

  // Gom theo ma_phuong: chi doc dang_ky_thong_bao cho DUNG nhung xa/phuong
  // thuc su co ban ghi lien quan trong lan chay nay — tranh doc thua toan bo
  // nguoi dung khi mo rong nhieu xa/phuong (dung equality query, khong phai
  // tai het roi loc bang tay).
  const cac_ma_phuong_lien_quan = [...new Set(cac_ban_ghi_con_hieu_luc.map((bg) => bg.ma_phuong))];

  for (const ma_phuong of cac_ma_phuong_lien_quan) {
    const ban_ghi_cua_phuong_nay = cac_ban_ghi_con_hieu_luc.filter((bg) => bg.ma_phuong === ma_phuong);

    const snapshot_dang_ky = await co_so_du_lieu
      .collection("dang_ky_thong_bao")
      .where("ma_phuong", "==", ma_phuong)
      .get();

    for (const tai_lieu_dang_ky of snapshot_dang_ky.docs) {
      const du_lieu = tai_lieu_dang_ky.data();
      const token = tai_lieu_dang_ky.id;
      const bitmask_nguoi_dung = BigInt(du_lieu.bitmask || "0");
      const da_thong_bao_truoc_do = new Set(du_lieu.da_thong_bao || []);

      const ban_ghi_can_gui = ban_ghi_cua_phuong_nay.filter(
        (bg) => co_giao_nhau(bitmask_nguoi_dung, bg.bitmask) && !da_thong_bao_truoc_do.has(bg.ma_tai_lieu)
      );
      if (ban_ghi_can_gui.length === 0) continue;

      const danh_sach_tin = ban_ghi_can_gui.map((bg) => {
        const bitmask_giao_nhau = bitmask_nguoi_dung & bg.bitmask;
        const chi_so_giao_nhau = bitmask_sang_danh_sach_chi_so(bitmask_giao_nhau);
        const ten_khu_pho_rieng_cua_ho = (bg.ten_khu_pho || []).filter((_, i) =>
          chi_so_giao_nhau.includes(bg.chi_so_khu_pho[i])
        );
        return {
          token,
          ma_tai_lieu: bg.ma_tai_lieu,
          message: {
            token,
            notification: {
              title: "Sắp cúp điện",
              body: `${bg.ten_phuong} — khu phố ${ten_khu_pho_rieng_cua_ho.join(", ")}: ${bg.thoi_gian_nguyen_van.replace(/\s+/g, " ")}. Lý do: ${bg.ly_do}`,
            },
          },
        };
      });

      const ket_qua_gui = await nhan_tin.sendEach(danh_sach_tin.map((t) => t.message));
      console.log(
        `Da gui ${danh_sach_tin.length} tin cho 1 thiet bi (thanh cong: ${ket_qua_gui.successCount}, that bai: ${ket_qua_gui.failureCount}) — ${ma_phuong}`
      );

      const ma_da_gui_thanh_cong = danh_sach_tin
        .filter((_, chi_so) => ket_qua_gui.responses[chi_so]?.success)
        .map((t) => t.ma_tai_lieu);

      const da_thong_bao_moi = [...da_thong_bao_truoc_do, ...ma_da_gui_thanh_cong].filter((ma) =>
        bo_ma_tai_lieu_hien_co.has(ma)
      );

      await co_so_du_lieu
        .collection("dang_ky_thong_bao")
        .doc(token)
        .update({ da_thong_bao: da_thong_bao_moi })
        .catch(() => {}); // token co the da bi xoa giua chung — bo qua

      ket_qua_gui.responses.forEach((phan_hoi, chi_so) => {
        if (!phan_hoi.success && phan_hoi.error?.code === "messaging/registration-token-not-registered") {
          co_so_du_lieu.collection("dang_ky_thong_bao").doc(token).delete().catch(() => {});
        }
      });
    }
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

  const tat_ca_ban_ghi_hien_tai = await dong_bo_va_tra_ve_tat_ca(co_so_du_lieu, danh_sach_ban_ghi);
  await gui_thong_bao_con_thieu(co_so_du_lieu, nhan_tin, tat_ca_ban_ghi_hien_tai);
  await don_dep_ban_ghi_het_han(co_so_du_lieu);

  console.log("Hoan tat dong bo.");
}

chay().catch((loi) => {
  console.error("Loi khi dong bo:", loi);
  process.exit(1);
});
