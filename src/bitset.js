// Module dung chung: xu ly bitmask bang BigInt.
// Vi sao dung BigInt thay vi number thuong:
//   - number cua JS chi an toan chinh xac toi 2^53, khong du cho
//     hang chuc nghin khu pho khi mo rong toan quoc trong tuong lai.
//   - BigInt khong gioi han kich thuoc, moi khu pho them vao chi la
//     "them 1 bit", khong can doi cau truc du lieu.
//
// Dung chung cho ca trinh duyet (app.js) va Node.js (scripts/*.mjs).

/**
 * Tao bitmask tu danh sach chi_so_bit.
 * @param {number[]} danh_sach_chi_so
 * @returns {bigint}
 */
export function tao_bitmask_tu_danh_sach_chi_so(danh_sach_chi_so) {
  let ket_qua = 0n;
  for (const chi_so of danh_sach_chi_so) {
    ket_qua |= (1n << BigInt(chi_so));
  }
  return ket_qua;
}

/** Chuyen bitmask (BigInt) sang chuoi de luu vao Firestore (Firestore khong ho tro BigInt). */
export function bitmask_sang_chuoi(bitmask) {
  return bitmask.toString();
}

/** Chuyen chuoi luu trong Firestore nguoc lai thanh bitmask (BigInt). */
export function chuoi_sang_bitmask(chuoi) {
  if (!chuoi) return 0n;
  return BigInt(chuoi);
}

/** Kiem tra 2 bitmask co bit nao trung nhau khong (vd: nguoi dang ky co nam trong khu vuc bi cup dien khong). */
export function co_giao_nhau(bitmask_a, bitmask_b) {
  return (bitmask_a & bitmask_b) !== 0n;
}

/** Them 1 bit vao bitmask, tra ve bitmask moi (khong sua bitmask cu, vi BigInt la immutable). */
export function them_bit(bitmask, chi_so) {
  return bitmask | (1n << BigInt(chi_so));
}

/** Xoa 1 bit khoi bitmask. */
export function xoa_bit(bitmask, chi_so) {
  return bitmask & ~(1n << BigInt(chi_so));
}

/** Kiem tra 1 chi_so_bit cu the co dang bat trong bitmask khong. */
export function co_bit(bitmask, chi_so) {
  return (bitmask & (1n << BigInt(chi_so))) !== 0n;
}

/** Tach bitmask thanh danh sach cac chi_so_bit dang bat (dung khi can hien thi lai cho nguoi dung). */
export function bitmask_sang_danh_sach_chi_so(bitmask) {
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
