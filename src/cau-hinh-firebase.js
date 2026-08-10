// DIEN THONG TIN DU AN FIREBASE CUA BAN VAO DAY.
// Lay tai: Firebase Console > Project settings > General > Your apps > SDK setup and configuration
//
// LUU Y: cac gia tri nay (apiKey, projectId...) la thong tin CONG KHAI theo
// thiet ke cua Firebase, an toan khi commit len repo public — bao mat that
// su nam o Firestore Security Rules (xem README.md), khong nam o viec giau
// cac gia tri nay.

export const CAU_HINH_FIREBASE = {
  apiKey: "DIEN_API_KEY_CUA_BAN",
  authDomain: "TEN_DU_AN.firebaseapp.com",
  projectId: "TEN_DU_AN",
  storageBucket: "TEN_DU_AN.appspot.com",
  messagingSenderId: "SO_DIEN_THOAI_GUI_TIN",
  appId: "APP_ID_CUA_BAN",
};

// Lay tai: Firebase Console > Project settings > Cloud Messaging > Web configuration > Web Push certificates
export const VAPID_KEY_CONG_KHAI = "DIEN_VAPID_KEY_CUA_BAN";
