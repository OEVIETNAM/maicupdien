// Luong RIENG BIET voi scripts/dong-bo-va-gui-thong-bao.mjs.
//
// Muc dich: gui 1 tin nhac nho DUY NHAT cho moi ban ghi lich_cup_dien, vao
// thoi diem gan voi "truoc gio bat dau cup dien toi da 36 gio" nhat co the.
// Truoc day nguong nay la 24h, nhung thuc te co truong hop lich cup dien
// bat dau luc 7h-8h SANG hom sau: script cap-nhat chi chay 2 lan/ngay (6h va
// 18h gio VN), nen neu lich moi duoc phat hien vao lan chay 18h thi khoang
// cach den 7h sang hom sau CHI CON ~13h - van trong nguong, khong sao. Nhung
// neu lich duoc phat hien SOM hon (vd 6h sang) va bat dau luc 15h CHIEU hom
// SAU (tuc gan 33h sau), voi nguong 24h thi ban ghi nay se bi BO LO hoan
// toan trong lan quet 6h sang hom do (vi 33h > 24h), va phai doi den lan
// quet KE TIEP (6h sang hom sau) moi vao nguong - nhung luc do co the DA
// CUP ROI (7h) hoac chi con vai tieng truoc gio cup (15h), qua tre de
// "chuan bi truoc nha" nhu ten thong bao. Nang nguong len 36h giup bat duoc
// ca 2 truong hop nay tu lan quet dau tien, khong can doi lan quet ke tiep.
//
// Vi script nay chay theo chu ky (vd moi 15-30 phut, xem
// .github/workflows/nhac-truoc-gio-cup-dien.yml), no se KHONG canh gio chinh
// xac tuyet doi — sai so toi da bang chu ky chay. Neu 1 ban ghi duoc PHAT
// HIEN lan dau (boi dong-bo-va-gui-thong-bao.mjs) khi da con CHUA DEN 36h
// nua la den gio cup, script nay se gui nhac NGAY LAP TUC trong lan chay gan
// nhat, thay vi bo qua — "tre con hon khong".
//
// Dieu kien 1 ban ghi duoc nhac:
//   - da_gui_nhac == false (chua tung nhac)
//   - tu_luc nam trong khoang (bay_gio, bay_gio + 36h]  — tuc con toi da 36h,
//     va CHUA bat dau (khac voi thong bao "phat hien lich moi" o luong kia)
//
// Sau khi gui xong cho 1 ban ghi, danh dau da_gui_nhac = true de lan chay sau
// khong gui lai.
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

/** Tim cac ban ghi can nhac: chua nhac, va tu_luc nam trong (bay_gio, bay_gio + 36h]. */
async function tim_ban_ghi_can_nhac(co_so_du_lieu) {
  const bay_gio = admin.firestore.Timestamp.now();
  const sau_36h = admin.firestore.Timestamp.fromMillis(bay_gio.toMillis() + 36 * 60 * 60 * 1000);

  const snapshot = await co_so_du_lieu
    .collection("lich_cup_dien")
    .where("da_gui_nhac", "==", false)
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

  const cac_ban_ghi_can_nhac = await tim_ban_ghi_can_nhac(co_so_du_lieu);
  if (cac_ban_ghi_can_nhac.length === 0) {
    console.log("Khong co ban ghi nao can nhac trong lan chay nay.");
    return;
  }
  console.log(`Tim thay ${cac_ban_ghi_can_nhac.length} ban ghi can nhac.`);

  const cache_nguoi_dang_ky_theo_phuong = new Map();

  for (const ban_ghi of cac_ban_ghi_can_nhac) {
    const bitmask_ban_ghi = BigInt(ban_ghi.bitmask || "0");
    const chi_so_bit_ban_ghi = bitmask_sang_danh_sach_chi_so(bitmask_ban_ghi);

    if (!cache_nguoi_dang_ky_theo_phuong.has(ban_ghi.ma_phuong)) {
      const nguoi_dang_ky = await lay_nguoi_dang_ky_theo_phuong(co_so_du_lieu, ban_ghi.ma_phuong);
      cache_nguoi_dang_ky_theo_phuong.set(ban_ghi.ma_phuong, nguoi_dang_ky);
    }
    const nguoi_dang_ky = cache_nguoi_dang_ky_theo_phuong.get(ban_ghi.ma_phuong);

    const gio_bat_dau = dinh_dang_gio_viet_nam(ban_ghi.tu_luc);
    const danh_sach_tin_can_gui = [];

    for (const nd of nguoi_dang_ky) {
      const bitmask_giao_nhau = nd.bitmask & bitmask_ban_ghi;
      if (bitmask_giao_nhau === 0n) continue;

      const chi_so_giao_nhau = bitmask_sang_danh_sach_chi_so(bitmask_giao_nhau);
      const ten_khu_pho_rieng_cua_ho = (ban_ghi.ten_khu_pho || []).filter((_, i) =>
        chi_so_giao_nhau.includes(chi_so_bit_ban_ghi[i])
      );

      danh_sach_tin_can_gui.push({
        token: nd.token,
        notification: {
          title: "Mai cúp điện rồi, chuẩn bị trước nha!",
          body: `${ban_ghi.ten_phuong} — khu phố ${ten_khu_pho_rieng_cua_ho.join(", ")}: bắt đầu lúc ${gio_bat_dau}. Lý do: ${ban_ghi.ly_do}`,
        },
      });
    }

    if (danh_sach_tin_can_gui.length > 0) {
      const ket_qua_gui = await nhan_tin.sendEach(danh_sach_tin_can_gui);
      console.log(
        `[NHAC] Da gui cho ${danh_sach_tin_can_gui.length} thiet bi (thanh cong: ${ket_qua_gui.successCount}, that bai: ${ket_qua_gui.failureCount}) — ${ban_ghi.ten_phuong}, bat dau ${gio_bat_dau}`
      );

      ket_qua_gui.responses.forEach((phan_hoi, chi_so) => {
        if (!phan_hoi.success && phan_hoi.error?.code === "messaging/registration-token-not-registered") {
          const token_loi = danh_sach_tin_can_gui[chi_so].token;
          co_so_du_lieu.collection("dang_ky_thong_bao").doc(token_loi).delete().catch(() => {});
        }
      });
    } else {
      console.log(`[NHAC] Khong co ai lien quan — ${ban_ghi.ten_phuong}, bat dau ${gio_bat_dau}`);
    }

    // Danh dau da nhac DU co gui duoc tin nao hay khong (vd 0 nguoi lien
    // quan), de khong lap lai kiem tra ban ghi nay o cac lan chay sau.
    await ban_ghi.ref.update({ da_gui_nhac: true });
  }

  console.log("Hoan tat vong nhac.");
}

chay().catch((loi) => {
  console.error("Loi khi gui nhac:", loi);
  process.exit(1);
});
