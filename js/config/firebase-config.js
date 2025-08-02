// js/config/firebase-config.js
// File này chỉ làm một nhiệm vụ: khởi tạo Firebase và export các đối tượng cần thiết.

// Import a CDN-hosted version of the Firebase SDK.
// Các trình duyệt hiện đại hỗ trợ import từ URL trong các module script.
import "https://www.gstatic.com/firebasejs/8.10.1/firebase-app.js";
import "https://www.gstatic.com/firebasejs/8.10.1/firebase-auth.js";
import "https://www.gstatic.com/firebasejs/8.10.1/firebase-firestore.js";

const firebaseConfig = {
    // Trong dự án thực tế, bạn nên dùng biến môi trường để bảo vệ các khóa này.
    apiKey: "AIzaSyCRaRV5JEwXlHWSPSrCYxyIIPjDWFMsV9A", 
    authDomain: "ielts-foundation-6ea9d.firebaseapp.com",
    projectId: "ielts-foundation-6ea9d",
    storageBucket: "ielts-foundation-6ea9d.appspot.com",
    messagingSenderId: "296690693780",
    appId: "1:296690693780:web:f9a54a9ded68a73dcd2681"
};

// Khởi tạo Firebase App chỉ một lần duy nhất để tránh lỗi.
if (!firebase.apps.length) {
    firebase.initializeApp(firebaseConfig);
}

// Export các service để các module khác có thể import và sử dụng.
const auth = firebase.auth();
const db = firebase.firestore();
const firestore = firebase.firestore; // Export cả namespace để dùng các tính năng như FieldValue, Timestamp

export { auth, db, firestore };
