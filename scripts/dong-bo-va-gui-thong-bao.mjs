// Doc data/lich-tho.json (do scripts/lay-du-lieu.mjs tao ra), lam 3 viec:
//   1) Ghi vao Firestore collection "lich_cup_dien" (idempotent — chay lai
//      nhieu lan khong tao trung du lieu, nho ma tai lieu la hash noi dung)
//   2) Voi NHUNG BAN GHI MOI (chua tung thay), doi chieu bitmask voi
//      collection "dang_ky_thong_bao" va gui push FCM cho dung nguoi
//   3) Xoa cac ban ghi lich_cup_dien da qua thoi gian ket thuc (don dep)
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
  // Cho phep bo qua field co gia tri "undefined" thay vi lam crash toan bo
  // job (Firestore von khong chap nhan undefined, chi chap nhan null hoac
  // khong co field do). PHAI goi truoc bat ky thao tac Firestore nao khac.
  co_so_du_lieu.settings({ ignoreUndefinedProperties: true });

  return { co_so_du_lieu, nhan_tin: admin.messaging() };
}

/** Tao bitmask (BigInt) tu danh sach chi_so_bit — ban sao cua src/bitset.js vi
 *  Node script chay doc lap, khong import truc tiep tu thu muc src de tranh
 *  rang buoc duong dan phuc tap giua ESM trinh duyet va Node. */
function tao_bitmask(danh_sach_chi_so) {
  let ket_qua = 0n;
  for (const chi_so of danh_sach_chi_so) ket_qua |= (1n << BigInt(chi_so));
  return ket_qua;
}
function co_giao_nhau(a, b) {
  return (a & b) !== 0n;
}

/** Tach 1 bitmask thanh danh sach chi_so_bit dang bat (dung de biet CHINH XAC
 *  nhung khu pho nao giao nhau giua nguoi dang ky va ban ghi, thay vi hien
 *  thi toan bo danh sach khu pho cua ban ghi). */
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

/** Doc danh muc khu pho, tra ve map nguoc: chi_so_bit -> ten_khu_pho. */
function doc_map_chi_so_sang_ten() {
  const duong_dan = path.join(THU_MUC_GOC, "data", "danh-muc-khu-pho.json");
  const du_lieu_tho = JSON.parse(readFileSync(duong_dan, "utf-8"));
  const map_ket_qua = {};
  for (const [ma, thong_tin] of Object.entries(du_lieu_tho)) {
    if (ma.startsWith("_")) continue;
    map_ket_qua[thong_tin.chi_so_bit] = thong_tin.ten_khu_pho;
  }
  return map_ket_qua;
}

/** Sinh ma tai lieu on dinh tu noi dung, de chay lai nhieu lan khong bi trung. */
function tao_ma_tai_lieu(ban_ghi) {
  const chuoi_goc = `${ban_ghi.khu_vuc_nguyen_van}|${ban_ghi.thoi_gian_nguyen_van}|${ban_ghi.ly_do}`;
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
    // Bo qua ban ghi hong / thieu du lieu (vd: EVNSPC tra ve trang chan WAF
    // thay vi du lieu that, khien du lieu cao ve bi lech cau truc) — ghi
    // canh bao ra log de biet, thay vi ghi rac vao Firestore hoac lam crash job.
    if (!Array.isArray(ban_ghi.ma_khu_pho) || ban_ghi.ma_khu_pho.length === 0) {
      console.warn("[BO QUA] Ban ghi thieu ma_khu_pho hop le:", JSON.stringify(ban_ghi).slice(0, 200));
      continue;
    }

    const ma_tai_lieu = tao_ma_tai_lieu(ban_ghi);
    const tham_chieu = bo_suu_tap.doc(ma_tai_lieu);
    const da_ton_tai = (await tham_chieu.get()).exists;

    const { tu_luc, den_luc } = phan_tich_khoang_thoi_gian(ban_ghi.thoi_gian_nguyen_van);
    const bitmask = tao_bitmask(ban_ghi.chi_so_bit);

    await tham_chieu.set({
      ma_khu_pho: ban_ghi.ma_khu_pho,
      ten_khu_pho: ban_ghi.ten_khu_pho,
      bitmask: bitmask.toString(),
      khu_vuc_nguyen_van: ban_ghi.khu_vuc_nguyen_van,
      thoi_gian_nguyen_van: ban_ghi.thoi_gian_nguyen_van,
      ly_do: ban_ghi.ly_do,
      tu_luc: tu_luc ? admin.firestore.Timestamp.fromDate(tu_luc) : null,
      den_luc: den_luc ? admin.firestore.Timestamp.fromDate(den_luc) : null,
      cap_nhat_luc: admin.firestore.FieldValue.serverTimestamp(),
    }, { merge: true });

    if (!da_ton_tai) {
      console.log(`[MOI] ${ban_ghi.ten_khu_pho.join(", ")} — ${ban_ghi.thoi_gian_nguyen_van.replace(/\s+/g, " ")}`);
    }
    cac_ban_ghi_moi.push({ ...ban_ghi, bitmask, ma_tai_lieu, tu_luc, den_luc });
  }

  return cac_ban_ghi_moi;
}

async function gui_thong_bao_con_thieu(co_so_du_lieu, nhan_tin, tat_ca_ban_ghi_hien_tai) {
  const bay_gio = new Date();

  // Chi xet nhung ban ghi CHUA KET THUC — bao gom ca ban ghi dang dien ra
  // (de khong bo sot nguoi vua chuyen sang khu pho dang bi cup dung luc do)
  const cac_ban_ghi_con_hieu_luc = tat_ca_ban_ghi_hien_tai.filter(
    (bg) => !bg.den_luc || bg.den_luc >= bay_gio
  );

  if (cac_ban_ghi_con_hieu_luc.length === 0) {
    console.log("Khong co ban ghi nao con hieu luc, khong can gui thong bao.");
    return;
  }

  const chi_so_sang_ten = doc_map_chi_so_sang_ten();

  const snapshot_dang_ky = await co_so_du_lieu.collection("dang_ky_thong_bao").get();
  const bo_ma_tai_lieu_hien_co = new Set(cac_ban_ghi_con_hieu_luc.map((bg) => bg.ma_tai_lieu));

  for (const tai_lieu_dang_ky of snapshot_dang_ky.docs) {
    const du_lieu = tai_lieu_dang_ky.data();
    const token = tai_lieu_dang_ky.id;
    const bitmask_nguoi_dung = BigInt(du_lieu.bitmask || "0");
    const da_thong_bao_truoc_do = new Set(du_lieu.da_thong_bao || []);

    // Nhung ban ghi ma NGUOI NAY khop bitmask NHUNG chua tung duoc gui —
    // day la diem mau chot: xet theo tung nguoi, khong theo "ban ghi co moi voi he thong khong"
    const ban_ghi_can_gui_cho_nguoi_nay = cac_ban_ghi_con_hieu_luc.filter(
      (bg) => co_giao_nhau(bitmask_nguoi_dung, bg.bitmask) && !da_thong_bao_truoc_do.has(bg.ma_tai_lieu)
    );

    if (ban_ghi_can_gui_cho_nguoi_nay.length === 0) continue;

    const danh_sach_tin = ban_ghi_can_gui_cho_nguoi_nay.map((bg) => {
      const bitmask_giao_nhau = bitmask_nguoi_dung & bg.bitmask;
      const ten_khu_pho_rieng_cua_ho = bitmask_sang_danh_sach_chi_so(bitmask_giao_nhau)
        .map((chi_so) => chi_so_sang_ten[chi_so])
        .filter(Boolean);
      return {
        token,
        ma_tai_lieu: bg.ma_tai_lieu,
        message: {
          token,
          notification: {
            title: "Sắp cúp điện",
            body: `Khu phố ${ten_khu_pho_rieng_cua_ho.join(", ")}: ${bg.thoi_gian_nguyen_van.replace(/\s+/g, " ")}. Lý do: ${bg.ly_do}`,
          },
        },
      };
    });

    const ket_qua_gui = await nhan_tin.sendEach(danh_sach_tin.map((t) => t.message));
    console.log(
      `Da gui ${danh_sach_tin.length} tin cho 1 thiet bi (thanh cong: ${ket_qua_gui.successCount}, that bai: ${ket_qua_gui.failureCount})`
    );

    // Danh dau lai nhung ban ghi da gui thanh cong, dong thoi "don rac" —
    // chi giu trong da_thong_bao nhung ma con ton tai trong lich_cup_dien hien tai,
    // tranh mang nay phinh to vo han theo thoi gian
    const ma_da_gui_thanh_cong = danh_sach_tin
      .filter((_, chi_so) => ket_qua_gui.responses[chi_so]?.success)
      .map((t) => t.ma_tai_lieu);

    const da_thong_bao_moi = [...da_thong_bao_truoc_do, ...ma_da_gui_thanh_cong].filter((ma) =>
      bo_ma_tai_lieu_hien_co.has(ma)
    );

    await co_so_du_lieu.collection("dang_ky_thong_bao").doc(token).update({
      da_thong_bao: da_thong_bao_moi,
    }).catch(() => {}); // token co the da bi xoa giua chung neu nguoi dung go cai — bo qua loi nay

    // Don sach token khong con hop le
    ket_qua_gui.responses.forEach((phan_hoi, chi_so) => {
      if (!phan_hoi.success && phan_hoi.error?.code === "messaging/registration-token-not-registered") {
        co_so_du_lieu.collection("dang_ky_thong_bao").doc(token).delete().catch(() => {});
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

  const tat_ca_ban_ghi_hien_tai = await dong_bo_va_tra_ve_ban_ghi_moi(co_so_du_lieu, danh_sach_ban_ghi);
  await gui_thong_bao_con_thieu(co_so_du_lieu, nhan_tin, tat_ca_ban_ghi_hien_tai);
  await don_dep_ban_ghi_het_han(co_so_du_lieu);

  console.log("Hoan tat dong bo.");
}

chay().catch((loi) => {
  console.error("Loi khi dong bo:", loi);
  process.exit(1);
});
