// Luu tam (o thiet bi, khong dong bo len server) toi da 3 thong bao GAN
// NHAT ma thiet bi nay tung nhan duoc - de nguoi dung bam vao bieu tuong
// chuong xem lai, phong khi bam vao thong bao he thong xong khong con thay
// lai noi dung o dau nua (thong bao he thong tu bien mat sau khi bam).
//
// Dung IndexedDB (khong phai localStorage) vi Service Worker - noi nhan
// push LUC APP DANG DONG (xem firebase-messaging-sw.js) - CHI truy cap duoc
// IndexedDB, khong truy cap duoc localStorage/window.
//
// LUU Y KHI SUA FILE NAY: firebase-messaging-sw.js la mot "classic script"
// (dung importScripts, khong ho tro cau lenh `import` cua ES module) nen
// KHONG THE import truc tiep file nay. No co 1 BAN SAO thu gon cua cac ham
// duoi day ngay trong no - sua ten CSDL/kho hay logic o day thi nho sua ca
// ben do cho khop nhau.

export const TEN_CSDL_THONG_BAO = "mai-cup-dien-thong-bao";
export const TEN_KHO_THONG_BAO = "thong_bao";
export const SO_LUONG_THONG_BAO_TOI_DA = 3;

export function mo_csdl_thong_bao() {
  return new Promise((giai_quyet, tu_choi) => {
    const yeu_cau_mo = indexedDB.open(TEN_CSDL_THONG_BAO, 1);
    yeu_cau_mo.onupgradeneeded = () => {
      const csdl = yeu_cau_mo.result;
      if (!csdl.objectStoreNames.contains(TEN_KHO_THONG_BAO)) {
        csdl.createObjectStore(TEN_KHO_THONG_BAO, { keyPath: "id", autoIncrement: true });
      }
    };
    yeu_cau_mo.onsuccess = () => giai_quyet(yeu_cau_mo.result);
    yeu_cau_mo.onerror = () => tu_choi(yeu_cau_mo.error);
  });
}

function lay_tat_ca_thong_bao_tho(csdl) {
  return new Promise((giai_quyet, tu_choi) => {
    const kho = csdl.transaction(TEN_KHO_THONG_BAO, "readonly").objectStore(TEN_KHO_THONG_BAO);
    const yeu_cau = kho.getAll();
    yeu_cau.onsuccess = () => giai_quyet(yeu_cau.result);
    yeu_cau.onerror = () => tu_choi(yeu_cau.error);
  });
}

/** Luu 1 thong bao vua nhan duoc, roi tu dong xoa bot ban ghi CU NHAT neu
 *  vuot qua SO_LUONG_THONG_BAO_TOI_DA (chi giu lai cac ban gan day nhat). */
export async function luu_thong_bao_moi(tieu_de, noi_dung) {
  const csdl = await mo_csdl_thong_bao();

  await new Promise((giai_quyet, tu_choi) => {
    const giao_dich = csdl.transaction(TEN_KHO_THONG_BAO, "readwrite");
    giao_dich.objectStore(TEN_KHO_THONG_BAO).add({
      tieu_de,
      noi_dung,
      thoi_gian: Date.now(),
      da_xem: false,
    });
    giao_dich.oncomplete = () => giai_quyet();
    giao_dich.onerror = () => tu_choi(giao_dich.error);
  });

  const tat_ca = await lay_tat_ca_thong_bao_tho(csdl);
  if (tat_ca.length > SO_LUONG_THONG_BAO_TOI_DA) {
    const can_xoa = tat_ca
      .sort((a, b) => a.thoi_gian - b.thoi_gian)
      .slice(0, tat_ca.length - SO_LUONG_THONG_BAO_TOI_DA);
    await new Promise((giai_quyet, tu_choi) => {
      const giao_dich = csdl.transaction(TEN_KHO_THONG_BAO, "readwrite");
      const kho = giao_dich.objectStore(TEN_KHO_THONG_BAO);
      can_xoa.forEach((bg) => kho.delete(bg.id));
      giao_dich.oncomplete = () => giai_quyet();
      giao_dich.onerror = () => tu_choi(giao_dich.error);
    });
  }

  csdl.close();
}

/** Toi da SO_LUONG_THONG_BAO_TOI_DA thong bao, moi nhat dung dau tien. */
export async function lay_danh_sach_thong_bao() {
  const csdl = await mo_csdl_thong_bao();
  const tat_ca = await lay_tat_ca_thong_bao_tho(csdl);
  csdl.close();
  return tat_ca.sort((a, b) => b.thoi_gian - a.thoi_gian);
}

export async function dem_so_thong_bao_chua_xem() {
  const danh_sach = await lay_danh_sach_thong_bao();
  return danh_sach.filter((bg) => !bg.da_xem).length;
}

/** Danh dau TAT CA thong bao dang luu la da xem - goi khi nguoi dung mo
 *  popup xem lai thong bao (bam vao bieu tuong chuong). */
export async function danh_dau_tat_ca_da_xem() {
  const csdl = await mo_csdl_thong_bao();
  const tat_ca = await lay_tat_ca_thong_bao_tho(csdl);

  await new Promise((giai_quyet, tu_choi) => {
    const giao_dich = csdl.transaction(TEN_KHO_THONG_BAO, "readwrite");
    const kho = giao_dich.objectStore(TEN_KHO_THONG_BAO);
    tat_ca.forEach((bg) => {
      if (!bg.da_xem) kho.put({ ...bg, da_xem: true });
    });
    giao_dich.oncomplete = () => giai_quyet();
    giao_dich.onerror = () => tu_choi(giao_dich.error);
  });

  csdl.close();
}
