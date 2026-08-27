// Luong RIENG BIET voi scripts/dong-bo-va-gui-thong-bao.mjs.
//
// Muc dich: gui 1 tin nhac nho cho MOI NGUOI DANG KY (tung nguoi, khong phai
// tung ban ghi) khi ho co lien quan den 1 ban ghi lich_cup_dien va ban ghi do
// con nam trong khoang "toi da 36 gio truoc gio bat dau cup dien".
//
// QUAN TRONG - TAI SAO THEO DOI "DA GUI CHO AI" THAY VI CO true/false DON
// GIAN: neu chi dung 1 co boolean da_gui_nhac cho CA ban ghi (cach lam CU),
// thi sau khi co nay chuyen sang true (da gui cho nhung nguoi dang ky co
// san LUC DO), bat ky ai dang ky MOI sau do cho DUNG khu vuc/thoi diem do se
// KHONG BAO GIO duoc nhac nua - vi script chi loc theo dieu kien "chua tung
// nhac ban ghi nay", ma khong biet nguoi moi nay chua he duoc nhac rieng.
// Day chinh la ly do 1 nguoi vua doi khu vuc de test lai khong nhan duoc
// nhac cho nhung lich SAP cup trong ngay (da bi nhac cho nguoi cu tu truoc),
// ma chi nhan duoc nhac cho lich con lau hon (chua ai duoc nhac).
//
// Vi vay o day dung da_gui_nhac_cho: [] (mang cac token FCM DA duoc gui cho
// ban ghi nay) thay vi da_gui_nhac: true/false. Moi lan chay, voi moi ban ghi
// con trong khung 36h, ta tim NHUNG NGUOI dang ky lien quan MA CHUA CO trong
// mang do de gui bo sung, roi cong don ho vao mang (arrayUnion) - khong xoa
// bot nguoi cu, chi luon "them nguoi moi chua duoc gui".
//
// Vi script nay chay theo chu ky (vd moi 15-30 phut, xem
// .github/workflows/nhac-truoc-gio-cup-dien.yml), no se KHONG canh gio chinh
// xac tuyet doi — sai so toi da bang chu ky chay.
//
// Dieu kien 1 CAP (ban ghi, nguoi dang ky) duoc nhac:
//   - token cua nguoi do CHUA co trong da_gui_nhac_cho cua ban ghi
//   - bitmask cua ho giao voi bitmask ban ghi (co lien quan)
//   - tu_luc cua ban ghi nam trong khoang (bay_gio, bay_gio + 36h]
//
// TU DONG "DI CHUYEN" DU LIEU CU: cac ban ghi con mang co boolean cu
// da_gui_nhac === true (tao boi ban code truoc khi co ban cap nhat nay) se
// duoc chuyen doi 1 lan duy nhat khi gap lai: coi TOAN BO nguoi dang ky HIEN
// TAI co lien quan la "da duoc nhac roi" (vi ho da duoc nhac boi he thong cu
// truoc do), ghi vao da_gui_nhac_cho va xoa co cu di - KHONG gui lai cho ho
// trong lan nay, chi nguoi dang ky sau thoi diem chuyen doi moi duoc nhac.
//
// Can bien moi truong FIREBASE_SERVICE_ACCOUNT_KEY_JSON (giong script kia).

import admin from "firebase-admin";

function khoi_tao_firebase_admin() {
  const chuoi_khoa = process.env.FIREBASE_SERVICE_ACCOUNT_KEY_JSON;
  if (!chuoi_khoa) {
    throw new Error("Thieu bien moi truong FIREBASE_SERVICE_ACCOUNT_KEY_JSON");
  }
  const thong_tin_dang_nhap = JSON.parse(chuoi_khoa);
  admin.initializeApp({ credential: admin.credential.cert(thong_tin_dang_nhap) });
  return { co_so_du_lieu: admin.firestore(), nhan_tin: admin.messaging() };
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

/** Tim cac ban ghi CON TRONG KHUNG NHAC: tu_luc nam trong (bay_gio, bay_gio + 36h].
 *  KHONG loc theo da_gui_nhac_cho o day (moi ban ghi co the can gui bo sung
 *  cho nguoi dang ky moi, du da tung gui cho nguoi khac roi) - viec loc "ai
 *  chua duoc gui" lam rieng cho tung nguoi dang ky ben trong vong lap chay(). */
async function tim_ban_ghi_trong_khung_nhac(co_so_du_lieu) {
  const bay_gio = admin.firestore.Timestamp.now();
  const sau_36h = admin.firestore.Timestamp.fromMillis(bay_gio.toMillis() + 36 * 60 * 60 * 1000);

  const snapshot = await co_so_du_lieu
    .collection("lich_cup_dien")
    .where("tu_luc", ">", bay_gio)
    .where("tu_luc", "<=", sau_36h)
    .get();

  return snapshot.docs.map((d) => ({ id: d.id, ref: d.ref, ...d.data() }));
}

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

function dinh_dang_gio_viet_nam(timestamp) {
  return timestamp.toDate().toLocaleString("vi-VN", {
    hour: "2-digit", minute: "2-digit", day: "2-digit", month: "2-digit",
    timeZone: "Asia/Ho_Chi_Minh",
  });
}

async function chay() {
  const { co_so_du_lieu, nhan_tin } = khoi_tao_firebase_admin();

  const cac_ban_ghi_trong_khung = await tim_ban_ghi_trong_khung_nhac(co_so_du_lieu);
  if (cac_ban_ghi_trong_khung.length === 0) {
    console.log("Khong co ban ghi nao trong khung 36h o lan chay nay.");
    return;
  }
  console.log(`Tim thay ${cac_ban_ghi_trong_khung.length} ban ghi trong khung 36h.`);

  const cache_nguoi_dang_ky_theo_phuong = new Map();

  for (const ban_ghi of cac_ban_ghi_trong_khung) {
    const bitmask_ban_ghi = BigInt(ban_ghi.bitmask || "0");
    const chi_so_bit_ban_ghi = bitmask_sang_danh_sach_chi_so(bitmask_ban_ghi);
    const gio_bat_dau = dinh_dang_gio_viet_nam(ban_ghi.tu_luc);

    if (!cache_nguoi_dang_ky_theo_phuong.has(ban_ghi.ma_phuong)) {
      const nguoi_dang_ky = await lay_nguoi_dang_ky_theo_phuong(co_so_du_lieu, ban_ghi.ma_phuong);
      cache_nguoi_dang_ky_theo_phuong.set(ban_ghi.ma_phuong, nguoi_dang_ky);
    }
    const nguoi_dang_ky = cache_nguoi_dang_ky_theo_phuong.get(ban_ghi.ma_phuong);

    const nguoi_lien_quan = nguoi_dang_ky.filter(
      (nd) => (nd.bitmask & bitmask_ban_ghi) !== 0n
    );

    // Ban ghi kieu CU (tao truoc khi co ban cap nhat nay): tu dong "di
    // chuyen" 1 lan - coi nhu tat ca nguoi lien quan HIEN TAI da duoc nhac
    // roi boi he thong cu, khong gui lai; tu lan sau tro di ban ghi nay hoat
    // dong hoan toan theo co che moi (chi gui bo sung cho nguoi dang ky moi).
    if (ban_ghi.da_gui_nhac === true && !Array.isArray(ban_ghi.da_gui_nhac_cho)) {
      await ban_ghi.ref.update({
        da_gui_nhac_cho: nguoi_lien_quan.map((nd) => nd.token),
        da_gui_nhac: admin.firestore.FieldValue.delete(),
      });
      console.log(
        `[DI CHUYEN] ${ban_ghi.ten_phuong}, bat dau ${gio_bat_dau}: gan ${nguoi_lien_quan.length} nguoi dang ky hien tai la "da nhac" theo he thong cu, khong gui lai cho ho.`
      );
      continue;
    }

    const da_gui_cho_truoc_do = new Set(ban_ghi.da_gui_nhac_cho || []);
    const nguoi_can_gui = nguoi_lien_quan.filter((nd) => !da_gui_cho_truoc_do.has(nd.token));

    if (nguoi_can_gui.length === 0) {
      continue; // moi nguoi lien quan deu da duoc nhac roi (hoac khong co ai lien quan)
    }

    const danh_sach_tin_can_gui = nguoi_can_gui.map((nd) => {
      const bitmask_giao_nhau = nd.bitmask & bitmask_ban_ghi;
      const chi_so_giao_nhau = bitmask_sang_danh_sach_chi_so(bitmask_giao_nhau);
      const ten_khu_pho_rieng_cua_ho = (ban_ghi.ten_khu_pho || []).filter((_, i) =>
        chi_so_giao_nhau.includes(chi_so_bit_ban_ghi[i])
      );
      return {
        token: nd.token,
        notification: {
          title: "Mai cúp điện rồi, chuẩn bị trước nha!",
          body: `${ban_ghi.ten_phuong} — khu phố ${ten_khu_pho_rieng_cua_ho.join(", ")}: bắt đầu lúc ${gio_bat_dau}. Lý do: ${ban_ghi.ly_do}`,
        },
      };
    });

    const ket_qua_gui = await nhan_tin.sendEach(danh_sach_tin_can_gui);
    console.log(
      `[NHAC] Da gui cho ${danh_sach_tin_can_gui.length} thiet bi moi (thanh cong: ${ket_qua_gui.successCount}, that bai: ${ket_qua_gui.failureCount}) — ${ban_ghi.ten_phuong}, bat dau ${gio_bat_dau}`
    );

    ket_qua_gui.responses.forEach((phan_hoi, chi_so) => {
      if (!phan_hoi.success && phan_hoi.error?.code === "messaging/registration-token-not-registered") {
        const token_loi = danh_sach_tin_can_gui[chi_so].token;
        co_so_du_lieu.collection("dang_ky_thong_bao").doc(token_loi).delete().catch(() => {});
      }
    });

    // Cong don (khong ghi de) danh sach nguoi vua duoc gui - du gui thanh
    // cong hay that bai deu tinh la "da thu gui", tranh gui di gui lai vo han
    // cho 1 token bi loi tam thoi (vd mat mang luc gui).
    await ban_ghi.ref.update({
      da_gui_nhac_cho: admin.firestore.FieldValue.arrayUnion(...nguoi_can_gui.map((nd) => nd.token)),
    });
  }

  console.log("Hoan tat vong nhac.");
}

chay().catch((loi) => {
  console.error("Loi khi gui nhac:", loi);
  process.exit(1);
});
