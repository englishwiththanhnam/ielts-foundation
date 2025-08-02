// js/app/assignment.js
// File này chứa logic chính cho trang assignment.html

import { db, firestore } from '../config/firebase-config.js';
import { checkAuthState, setupUserSession } from '../modules/auth.js';
import { countTotalStructures } from '../modules/vocab-logic.js';

const loadingState = document.getElementById('loading-state');
const modulesList = document.getElementById('modules-list');
const assignmentTitleEl = document.getElementById('assignment-title');
const assignmentDeadlineEl = document.getElementById('assignment-deadline');

function main() {
    checkAuthState(
        (user) => {
            setupUserSession(user, 'user-display-name', 'logout-button');
            loadAssignmentDetails(user.uid);
        },
        () => {
            window.location.href = '/login.html';
        }
    );
}

async function loadAssignmentDetails(userId) {
    try {
        const urlParams = new URLSearchParams(window.location.search);
        const assignmentId = urlParams.get('id');
        if (!assignmentId) {
            throw new Error("URL không hợp lệ. Vui lòng quay lại và thử lại.");
        }

        const [assignmentDoc, progressDoc] = await Promise.all([
            db.collection('assignments').doc(assignmentId).get(),
            db.collection('student_progress').doc(userId).collection('assignments').doc(assignmentId).get()
        ]);

        if (!assignmentDoc.exists) {
            throw new Error("Không tìm thấy bài tập này.");
        }
        
        const assignmentData = assignmentDoc.data();
        const studentProgress = progressDoc.exists ? progressDoc.data() : {};

        assignmentTitleEl.textContent = assignmentData.title;
        const deadline = assignmentData.deadline.toDate();
        assignmentDeadlineEl.textContent = `Hạn chót: ${deadline.toLocaleDateString('vi-VN', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}`;

        const moduleIds = assignmentData.moduleIds;
        if (!moduleIds || moduleIds.length === 0) {
            modulesList.innerHTML = '<div class="glass-panel text-center">Bài tập này không có học phần nào.</div>';
            return;
        }
        
        const modulesSnap = await db.collection('modules').where(firestore.FieldPath.documentId(), 'in', moduleIds).get();
        const modules = modulesSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));

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
        loadingState.style.display = 'none';
    }
}

function createModuleElement(assignmentId, module, progress) {
    const totalWords = module.words?.length || 0;
    const learnedWords = progress.words?.filter(w => w.isLearned).length || 0;
    const vocabProgressPercent = totalWords > 0 ? Math.round((learnedWords / totalWords) * 100) : 0;

    // SỬ DỤNG HÀM TÍNH TOÁN ĐÃ ĐƯỢC THỐNG NHẤT
    const totalStructures = countTotalStructures(module.words);
    const learnedStructures = progress.structures?.filter(s => s.isLearned).length || 0;
    const structureProgressPercent = totalStructures > 0 ? Math.round((learnedStructures / totalStructures) * 100) : 0;

    const testHistory = progress.testHistory || [];
    const lastTest = testHistory.length > 0 ? testHistory[testHistory.length - 1] : null;
    const isCompleted = vocabProgressPercent === 100 && structureProgressPercent === 100 && lastTest && lastTest.score >= 75;

    const element = document.createElement('div');
    element.className = `glass-panel`;

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

document.addEventListener('DOMContentLoaded', main);
