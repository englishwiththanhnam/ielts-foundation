// js/app/dashboard.js
import { db } from '../config/firebase-config.js';
import { checkAuthState, setupUserSession } from '../modules/auth.js';

// --- DOM ELEMENTS ---
const loadingState = document.getElementById('loading-state');
const assignmentsListEl = document.getElementById('assignments-list');
const welcomeTitleEl = document.getElementById('welcome-title');

// --- MAIN LOGIC ---
function main() {
    checkAuthState(
        (user) => {
            setupUserSession(user, 'user-display-name', 'logout-button');
            welcomeTitleEl.textContent = `Chào bạn, ${user.displayName || 'học viên'}!`;
            loadAssignments(user.uid);
        },
        () => {
            window.location.href = '/index.html';
        }
    );
}

// --- FUNCTIONS ---
/**
 * Tải và hiển thị danh sách các bài tập được giao cho người dùng.
 * @param {string} userId - ID của người dùng hiện tại.
 */
async function loadAssignments(userId) {
    try {
        // Truy vấn các bài tập mà có userId trong mảng 'assignedTo'
        const snapshot = await db.collection('assignments')
            .where('assignedTo', 'array-contains', userId)
            .get();

        if (snapshot.empty) {
            assignmentsListEl.innerHTML = '<div class="glass-panel text-center"><p>Bạn chưa có bài tập nào được giao.</p></div>';
            return;
        }

        assignmentsListEl.innerHTML = ''; // Xóa nội dung cũ
        snapshot.forEach(doc => {
            const assignment = { id: doc.id, ...doc.data() };
            const assignmentCard = createAssignmentCard(assignment);
            assignmentsListEl.appendChild(assignmentCard);
        });

    } catch (error) {
        console.error("Error fetching assignments:", error);
        assignmentsListEl.innerHTML = '<div class="glass-panel text-center text-red-500"><p>Không thể tải danh sách bài tập. Vui lòng thử lại.</p></div>';
    } finally {
        loadingState.style.display = 'none';
    }
}

/**
 * Tạo một thẻ HTML cho bài tập.
 * @param {object} assignment - Dữ liệu của một bài tập.
 * @returns {HTMLElement} - Phần tử div chứa thông tin bài tập.
 */
function createAssignmentCard(assignment) {
    const card = document.createElement('div');
    card.className = 'glass-panel';

    const deadline = assignment.deadline.toDate();
    const isOverdue = new Date() > deadline;

    card.innerHTML = `
        <div class="flex justify-between items-start">
            <div>
                <h2 class="text-xl font-bold text-slate-800">${assignment.title}</h2>
                <p class="text-sm font-semibold ${isOverdue ? 'text-red-500' : 'text-slate-500'}">
                    Hạn chót: ${deadline.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' })}
                </p>
            </div>
            <a href="assignment.html?id=${assignment.id}" class="btn btn-main-action">
                <span>Vào làm</span>
                <i class="fas fa-arrow-right ml-2"></i>
            </a>
        </div>
    `;
    return card;
}

// --- RUN ---
document.addEventListener('DOMContentLoaded', main);
