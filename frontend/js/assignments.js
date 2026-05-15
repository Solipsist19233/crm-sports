let allAssignments = [];
let allGroups = [];
let allTrainers = [];
let allStudents = [];
let allPrices = [];
let selectedStudentsForLesson = []; // {id, name, payment_type}
let editingAssignmentId = null;

document.addEventListener('DOMContentLoaded', async () => {
    try {
        requireAuth();
        loadUserInfo();
        setupMobileMenu();

        const user = getUser();
        if (user && user.role !== 'admin') {
            window.location.href = 'dashboard.html';
            return;
        }

        const today = new Date().toISOString().split('T')[0];
        document.getElementById('lessonDate').value = today;

        await loadAllData();
        setupStudentSearch();

        // Явно робимо функції доступними глобально для HTML атрибутів (onchange/onclick)
        window.updateStudentPayment = updateStudentPayment;
        window.removeStudentFromLesson = removeStudentFromLesson;
        window.addStudentToLesson = addStudentToLesson;
        window.deleteAssignment = deleteAssignment;
        window.deleteOldAssignments = deleteOldAssignments;
        window.openEditAssignmentModal = openEditAssignmentModal;
        window.viewJournal = viewJournal;
        window.openAddAssignmentModal = openAddAssignmentModal;
        window.closeAssignmentModal = closeAssignmentModal;
    } catch (err) {
        console.error('Помилка ініціалізації:', err);
    }
});

async function loadAllData() {
    const results = await Promise.allSettled([
        assignmentsAPI.getAll(),
        groupsAPI.getAll({ is_active: true }),
        trainersAPI.getAll(),
        studentsAPI.getAll({ is_active: true }),
        pricesAPI.getAll()
    ]);

    allAssignments = results[0].status === 'fulfilled' ? results[0].value : [];
    allGroups = results[1].status === 'fulfilled' ? results[1].value : [];
    allTrainers = results[2].status === 'fulfilled' ? results[2].value : [];
    allStudents = results[3].status === 'fulfilled' ? results[3].value : [];
    allPrices = results[4].status === 'fulfilled' ? results[4].value : [];

    renderAssignmentsCards(allAssignments);
    populateSelects();
}

function populateSelects() {
    document.getElementById('groupId').innerHTML = '<option value="">Оберіть групу...</option>' + 
        allGroups.map(g => `<option value="${g.id}">${g.name}</option>`).join('');

    document.getElementById('trainerId').innerHTML = '<option value="">Оберіть тренера...</option>' + 
        allTrainers.map(t => `<option value="${t.id}">${t.first_name} ${t.last_name}</option>`).join('');
}

document.getElementById('groupId').addEventListener('change', function() {
    const groupId = parseInt(this.value);
    const group = allGroups.find(g => g.id === groupId);
    const timeDisplay = document.getElementById('groupScheduleDisplay');
    if (timeDisplay) {
        timeDisplay.textContent = group?.schedule ? `⏰ ${group.schedule}` : '';
    }
});

function setupStudentSearch() {
    const input = document.getElementById('studentSearch');
    const suggestions = document.getElementById('searchSuggestions');

    input.addEventListener('input', (e) => {
        const query = e.target.value.toLowerCase().trim();
        if (query.length < 2) { suggestions.innerHTML = ''; return; }

        const matches = allStudents.filter(s => 
            `${s.first_name} ${s.last_name}`.toLowerCase().includes(query) &&
            !selectedStudentsForLesson.find(sel => sel.id === s.id)
        );

        suggestions.innerHTML = matches.map(s => `
            <div class="suggestion-item" onclick="addStudentToLesson(${s.id}, '${s.first_name} ${s.last_name}')">
                <i class="fas fa-user-plus" style="margin-right: 10px; color: var(--secondary-color)"></i>
                <span>${s.first_name} ${s.last_name}</span>
            </div>
        `).join('');
    });

    // Закриття підказок при кліку поза ними
    document.addEventListener('click', (e) => {
        if (!input.contains(e.target) && !suggestions.contains(e.target)) {
            suggestions.innerHTML = '';
        }
    });
}

function addStudentToLesson(id, name) {
    // Знаходимо першу доступну послугу з прайсу як значення за замовчуванням
    const defaultPriceId = allPrices.length > 0 ? allPrices[0].id : '';
    
    selectedStudentsForLesson.push({ 
        id: id, 
        name: name, 
        payment_choice: String(defaultPriceId) 
    });
    
    document.getElementById('studentSearch').value = '';
    document.getElementById('searchSuggestions').innerHTML = '';
    renderSelectedStudents();
}

function removeStudentFromLesson(id) {
    selectedStudentsForLesson = selectedStudentsForLesson.filter(s => s.id !== id);
    renderSelectedStudents();
}

function renderSelectedStudents() {
    const container = document.getElementById('selectedStudentsList');
    if (selectedStudentsForLesson.length === 0) {
        container.innerHTML = '<p class="text-center" style="color: var(--text-secondary); padding: 10px;">Нікого не обрано</p>';
        return;
    }

    container.innerHTML = selectedStudentsForLesson.map(s => `
        <div class="schedule-row" style="align-items: center; justify-content: space-between;">
            <span><strong>${s.name}</strong></span>
            <div style="display: flex; gap: 10px; align-items: center;">
                <select onchange="window.updateStudentPayment('${s.id}', this.value)" style="width: 200px; padding: 5px; border-radius: 4px; border: 1px solid #ddd;">
                    ${allPrices.map(p => {
                        const isSelected = String(s.payment_choice) === String(p.id);
                        return `<option value="${p.id}" ${isSelected ? 'selected' : ''}>${p.name}</option>`;
                    }).join('')}
                </select>
                <button type="button" class="btn-icon btn-danger" onclick="removeStudentFromLesson(${s.id})">
                    <i class="fas fa-times"></i>
                </button>
            </div>
        </div>
    `).join('');
}

function updateStudentPayment(studentId, value) {
    const student = selectedStudentsForLesson.find(s => String(s.id) === String(studentId));
    if (student) student.payment_choice = value;
}

function renderAssignmentsCards(assignments) {
    const grid = document.getElementById('assignmentsGrid');
    if (!assignments || assignments.length === 0) {
        grid.innerHTML = '<div style="grid-column: 1/-1; text-align: center; padding: 40px;">Журнал порожній. Створіть призначення!</div>';
        return;
    }

    grid.innerHTML = assignments.map(a => {
        const scheduleTime = a.group?.schedule ? `<div class="info-item"><i class="fas fa-clock"></i><span>${a.group.schedule}</span></div>` : '';
        return `
        <div class="group-card">
            <div class="group-header">
                <h3>${a.group?.name || 'Без назви'}</h3>
                <span class="badge badge-info">${formatDate(a.lesson_date)}</span>
            </div>
            <div class="group-info">
                ${scheduleTime}
                <div class="info-item"><i class="fas fa-user-tie"></i><span>Тренер: ${a.trainer?.first_name} ${a.trainer?.last_name}</span></div>
                <div class="info-item"><i class="fas fa-users"></i><span>Учнів: ${a.students?.length || 0}</span></div>
            </div>
            <div class="group-actions">
                <button class="btn btn-secondary btn-sm" onclick="viewJournal(${a.id})"><i class="fas fa-book"></i> Журнал</button>
                <button class="btn-icon" onclick="openEditAssignmentModal(${a.id})" title="Редагувати">
                    <i class="fas fa-edit"></i>
                </button>
                <button class="btn-icon btn-danger" onclick="deleteAssignment(${a.id})">
                    <i class="fas fa-trash"></i>
                </button>
            </div>
        </div>
    `}).join('');
}

function viewJournal(id) {
    const assignment = allAssignments.find(a => a.id === id);
    if (!assignment) return;

    // Перенаправляємо на сторінку відвідуваності з параметрами дати та групи
    const url = `attendance.html?date=${assignment.lesson_date}&group_id=${assignment.group_id}`;
    window.location.href = url;
}

async function openEditAssignmentModal(id) {
    const a = allAssignments.find(item => item.id === id);
    if (!a) return;

    editingAssignmentId = id;
    document.getElementById('modalTitle').textContent = 'Редагувати призначення';
    
    // 1. Очищуємо форму
    const form = document.getElementById('assignmentForm');
    if (form) form.reset();

    // 2. Гарантуємо, що селекти заповнені опціями
    populateSelects();

    // 3. Встановлюємо значення основних полів (враховуємо можливу вкладеність)
    const gId = a.group_id || (a.group && a.group.id);
    const tId = a.trainer_id || (a.trainer && a.trainer.id);

    if (gId) {
        document.getElementById('groupId').value = String(gId);
        document.getElementById('groupId').dispatchEvent(new Event('change'));
    }
    if (tId) document.getElementById('trainerId').value = String(tId);
    if (a.lesson_date) document.getElementById('lessonDate').value = a.lesson_date;

    // 4. Відновлюємо список обраних учнів з коректним payment_choice
    selectedStudentsForLesson = (Array.isArray(a.students) ? a.students : []).map(studentInAssignment => {
        // Пріоритет вибору послуги: з деталей призначення або перша з прайсу
        let choice = '';
        
        if (studentInAssignment.payment_choice) choice = studentInAssignment.payment_choice;
        else if (studentInAssignment.pivot && studentInAssignment.pivot.payment_choice) choice = studentInAssignment.pivot.payment_choice;
        else if (studentInAssignment.assignment_details && studentInAssignment.assignment_details.payment_choice) choice = studentInAssignment.assignment_details.payment_choice;
        
        if (!choice && allPrices.length > 0) choice = allPrices[0].id;

        return {
            id: studentInAssignment.student_id || studentInAssignment.id,
            name: `${studentInAssignment.first_name} ${studentInAssignment.last_name}`,
            payment_choice: String(choice)
        };
    });
    
    renderSelectedStudents();
    document.getElementById('assignmentModal').classList.add('show');
}

function openAddAssignmentModal() {
    editingAssignmentId = null;
    document.getElementById('modalTitle').textContent = 'Створити призначення';
    selectedStudentsForLesson = []; // Скидаємо обраних учнів
    renderSelectedStudents();
    document.getElementById('assignmentForm').reset();
    document.getElementById('assignmentModal').classList.add('show');
}

function closeAssignmentModal() {
    document.getElementById('assignmentModal').classList.remove('show');
}

document.getElementById('assignmentForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const groupId = document.getElementById('groupId').value;
    const trainerId = document.getElementById('trainerId').value;

    if (!groupId || !trainerId) {
        showNotification('Оберіть групу та тренера', 'warning');
        return;
    }

    if (selectedStudentsForLesson.length === 0) {
        showNotification('Будь ласка, виберіть хоча б одного учня', 'warning');
        return;
    }

    // Формуємо дані: список об'єктів {student_id, payment_choice}
    const studentAssignments = selectedStudentsForLesson.map(s => ({
        student_id: s.id,
        payment_choice: s.payment_choice // 'subscription' або ID з прайсу
    }));

    const data = {
        group_id: parseInt(groupId),
        trainer_id: parseInt(trainerId),
        students_data: studentAssignments, // Відправляємо розширені дані
        lesson_date: document.getElementById('lessonDate').value
    };

    try {
        if (editingAssignmentId) {
            await assignmentsAPI.update(editingAssignmentId, data);
            showNotification('Призначення оновлено', 'success');
        } else {
            await assignmentsAPI.create(data);
            showNotification('Призначення створено', 'success');
        }
        closeAssignmentModal();
        loadAllData();
    } catch (err) {
        showNotification('Помилка: ' + err.message, 'error');
    }
});

async function deleteAssignment(id) {
    if (confirm('Видалити це призначення?')) {
        try {
            console.log('Спроба видалення призначення ID:', id);
            await assignmentsAPI.delete(id);
            showNotification('Призначення видалено', 'success');
            loadAllData();
        } catch (err) { 
            console.error('Помилка при видаленні призначення:', err);
            showNotification('Помилка видалення: ' + (err.message || 'Невідома помилка'), 'error'); 
        }
    }
}

async function deleteOldAssignments() {
    // Беремо сьогоднішню дату. Все, що < сьогодні = до вчора включно.
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1); // Встановлюємо дату на вчора
    const yesterdayStr = yesterday.toISOString().split('T')[0];
    
    if (confirm(`Видалити ВСІ призначення до вчора (${formatDate(yesterdayStr)})? Цю дію неможливо скасувати!`)) {
        try {
            setBtnLoading('deleteOldBtn', true); 
            await assignmentsAPI.cleanup(yesterdayStr);
            showNotification('Старі призначення успішно видалено', 'success');
            loadAllData();
        } catch (err) {
            console.error('Помилка очищення:', err);
            showNotification('Помилка: ' + (err.message || 'Не вдалося видалити'), 'error');
        } finally {
            setBtnLoading('deleteOldBtn', false, '<i class="fas fa-broom"></i> Видалити старі');
        }
    }
}