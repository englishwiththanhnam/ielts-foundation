// js/app/assignment.js
// File này chứa logic chính cho trang assignment.html

// --- IMPORT CÁC MODULE CẦN THIẾT ---
import { db, firestore } from '../config/firebase-config.js';
import { checkAuthState, setupUserSession } from '../modules/auth.js';

// --- LẤY CÁC PHẦN TỬ HTML (DOM ELEMENTS) ---
const loadingState = document.getElementById('loading-state');
const modulesList = document.getElementById('modules-list');
const assignmentTitleEl = document.getElementById('assignment-title');
const assignmentDeadlineEl = document.getElementById('assignment-deadline');

// --- HÀM KHỞI ĐỘNG CHÍNH ---
function main() {
    // Sử dụng module auth để kiểm tra trạng thái đăng nhập
    checkAuthState(
        (user) => { // Trường hợp đã đăng nhập
            console.log("User is logged in. Loading assignment details...");
            // Thiết lập tên người dùng và nút đăng xuất
            setupUserSession(user, 'user-display-name', 'logout-button');
            // Bắt đầu tải dữ liệu bài tập
            loadAssignmentDetails(user.uid);
        },
        () => { // Trường hợp chưa đăng nhập
            console.log("User is not logged in. Redirecting to login page.");
            // Chuyển hướng về trang đăng nhập
            window.location.href = '/login.html';
        }
    );
}

/**
 * Tải và hiển thị chi tiết bài tập từ Firestore.
 * @param {string} userId - ID của người dùng hiện tại.
 */
async function loadAssignmentDetails(userId) {
    try {
        const urlParams = new URLSearchParams(window.location.search);
        const assignmentId = urlParams.get('id');
        if (!assignmentId) {
            throw new Error("URL không hợp lệ. Vui lòng quay lại và thử lại.");
        }

        // Tải đồng thời thông tin bài tập và tiến độ của học sinh
        const [assignmentDoc, progressDoc] = await Promise.all([
            db.collection('assignments').doc(assignmentId).get(),
            db.collection('student_progress').doc(userId).collection('assignments').doc(assignmentId).get()
        ]);

        if (!assignmentDoc.exists) {
            throw new Error("Không tìm thấy bài tập này.");
        }
        
        const assignmentData = assignmentDoc.data();
        const studentProgress = progressDoc.exists ? progressDoc.data() : {};

        // Hiển thị thông tin chung của bài tập
        assignmentTitleEl.textContent = assignmentData.title;
        const deadline = assignmentData.deadline.toDate();
        assignmentDeadlineEl.textContent = `Hạn chót: ${deadline.toLocaleDateString('vi-VN', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}`;

        // Tải thông tin các học phần (modules)
        const moduleIds = assignmentData.moduleIds;
        if (!moduleIds || moduleIds.length === 0) {
            modulesList.innerHTML = '<div class="glass-panel text-center">Bài tập này không có học phần nào.</div>';
            return;
        }
        
        const modulesSnap = await db.collection('modules').where(firestore.FieldPath.documentId(), 'in', moduleIds).get();
        const modules = modulesSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));

        // Render danh sách học phần ra giao diện
        modulesList.innerHTML = '';
        modules.forEach(module => {
            const moduleProgress = studentProgress.moduleProgress?.[module.id] || {};
            const moduleElement = createModuleElement(assignmentId, module, moduleProgress);
            modulesList.appendChild(moduleElement);
        });

    } catch (error) {
        console.error("Lỗi khi tải chi tiết bài tập:", error);
        modulesList.innerHTML = `<div class="glass-panel text-center text-red-500">${error.message}</div>`;
    } finally {
        // Ẩn trạng thái "đang tải"
        loadingState.style.display = 'none';
    }
}

/**
 * Tạo một phần tử HTML cho một học phần.
 * @param {string} assignmentId - ID của bài tập.
 * @param {object} module - Dữ liệu của học phần.
 * @param {object} progress - Dữ liệu tiến độ của học phần đó.
 * @returns {HTMLElement} - Phần tử div chứa thông tin học phần.
 */
function createModuleElement(assignmentId, module, progress) {
    // Tính toán tiến độ từ vựng
    const totalWords = module.words?.length || 0;
    const learnedWords = progress.words?.filter(w => w.isLearned).length || 0;
    const vocabProgressPercent = totalWords > 0 ? Math.round((learnedWords / totalWords) * 100) : 0;

    // Tạm thời sử dụng lại logic đếm cấu trúc đơn giản.
    // Chúng ta sẽ thay thế bằng module chung ở các bước sau.
    const totalStructures = (module.words || []).reduce((acc, word) => {
        if (word.structure) {
            return acc + (word.structure.split(';').filter(Boolean).length);
        }
        return acc;
    }, 0);
    const learnedStructures = progress.structures?.filter(s => s.isLearned).length || 0;
    const structureProgressPercent = totalStructures > 0 ? Math.round((learnedStructures / totalStructures) * 100) : 0;

    // Kiểm tra trạng thái hoàn thành
    const testHistory = progress.testHistory || [];
    const lastTest = testHistory.length > 0 ? testHistory[testHistory.length - 1] : null;
    const isCompleted = vocabProgressPercent === 100 && structureProgressPercent === 100 && lastTest && lastTest.score >= 75;

    const element = document.createElement('div');
    element.className = `glass-panel`; // Sử dụng class chung cho giao diện đồng nhất

    let testHistoryHtml = '<p class="text-xs text-slate-500 mt-2">Chưa có lần test nào.</p>';
    if (testHistory.length > 0) {
        testHistoryHtml = '<ul class="text-xs text-slate-600 mt-2 space-y-1 list-disc list-inside">';
        testHistory.slice(-3).reverse().forEach(test => {
            const testDate = test.timestamp.toDate().toLocaleDateString('vi-VN');
            testHistoryHtml += `<li>Ngày ${testDate}: <span class="font-semibold ${test.score >= 75 ? 'text-green-600' : 'text-red-600'}">${test.score}%</span> (${test.correct}/${test.total} câu)</li>`;
        });
        testHistoryHtml += '</ul>';
    }

    element.innerHTML = `
        <a href="vocab_app.html?assignmentId=${assignmentId}&vocabId=${module.id}" class="flex justify-between items-center hover:opacity-80 transition-opacity">
            <div class="flex items-center">
                <i class="fas ${isCompleted ? 'fa-check-circle text-green-500' : 'fa-book-open text-violet-500'} mr-4 text-2xl"></i>
                <div>
                    <span class="font-semibold text-lg text-slate-800">${module.title}</span>
                </div>
            </div>
            <div class="flex items-center">
                <span class="text-violet-600 font-semibold mr-2">${isCompleted ? 'Đã hoàn thành' : 'Bắt đầu học'}</span>
                <i class="fas fa-arrow-right text-violet-600"></i>
            </div>
        </a>
        <div class="mt-4 pt-4 border-t border-white/30 space-y-3">
            <div>
                <div class="flex justify-between items-center text-sm mb-1">
                    <span class="font-medium text-slate-600">Tiến độ Từ vựng:</span>
                    <span class="font-bold text-violet-600">${learnedWords} / ${totalWords}</span>
                </div>
                <div class="progress-bar-container">
                    <div class="progress-bar progress-bar-vocab" style="width: ${vocabProgressPercent}%"></div>
                </div>
            </div>
            <div>
                <div class="flex justify-between items-center text-sm mb-1">
                    <span class="font-medium text-slate-600">Tiến độ Cấu trúc:</span>
                    <span class="font-bold text-blue-600">${learnedStructures} / ${totalStructures}</span>
                </div>
                <div class="progress-bar-container">
                    <div class="progress-bar progress-bar-structure" style="width: ${structureProgressPercent}%"></div>
                </div>
            </div>
            <div class="mt-2">
                <h4 class="text-sm font-medium text-slate-600">Kết quả Test gần nhất:</h4>
                ${testHistoryHtml}
            </div>
        </div>
    `;
    return element;
}


// Chạy hàm main khi toàn bộ cây DOM đã được trình duyệt xây dựng xong.
document.addEventListener('DOMContentLoaded', main);
