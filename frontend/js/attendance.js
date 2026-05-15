// Attendance Page Logic

let currentUser = null;
let allAssignments = []; // Assignments for the selected date and trainer
let allStudents = [];    // All active students (for adding new students to a lesson)
let allPrices = [];      // All price list items (for payment choice)

let currentLessonStudents = []; // Students for the currently open attendance modal
let currentAssignmentId = null; // ID of the assignment currently being marked

document.addEventListener('DOMContentLoaded', async () => {
    try {
        requireAuth();
        loadUserInfo();

        const urlParams = new URLSearchParams(window.location.search);
        const paramDate = urlParams.get('date');
        const today = paramDate || new Date().toISOString().split('T')[0];

        currentUser = getUser();
        setupMobileMenu();

        // Переконуємось, що пункти меню «Прайс-лист» та «Призначення» видимі для тренера
        const navItems = document.querySelectorAll('.nav-item');
        navItems.forEach(item => {
            const href = item.getAttribute('href') || '';
            if (href.includes('prices.html') || href.includes('assignments.html')) {
                // Навіть якщо якийсь інший скрипт їх приховав, ми їх показуємо
                item.style.display = 'flex';
            }
        });

        // Безпечне встановлення дати
        const dateFilter = document.getElementById('attendanceDateFilter');
        if (dateFilter) {
            dateFilter.value = today;
            dateFilter.addEventListener('change', (e) => {
                loadAssignmentsForDate(e.target.value);
            });
        }

        // Load initial data
        await loadAllInitialData();
        
        // Load assignments for today
        await loadAssignmentsForDate(today);

        // Переносимо слухач кнопки сюди для безпеки
        const confirmBtn = document.getElementById('confirmAttendanceBtn');
        if (confirmBtn) {
            confirmBtn.addEventListener('click', handleConfirmAttendance);
        }

        // Make global functions available for HTML attributes
        window.openMarkAttendanceModal = openMarkAttendanceModal;
        window.updateStudentAttendanceStatus = updateStudentAttendanceStatus;
        window.updateStudentPaymentChoice = updateStudentPaymentChoice;
        window.removeStudentFromCurrentLesson = removeStudentFromCurrentLesson;
        window.addStudentToCurrentLesson = addStudentToCurrentLesson;
        window.changeDate = changeDate;
        window.loadWeek = loadWeek;
        window.setupStudentSearchForModal = setupStudentSearchForModal; // For the modal's search // For the modal's search
    } catch (err) {
        console.error('Помилка ініціалізації сторінки відвідуваності:', err);
        showNotification('Помилка завантаження сторінки', 'error');
    }
});

function changeDate(daysOffset) {
    const dateInput = document.getElementById('attendanceDateFilter');
    const d = new Date();
    d.setDate(d.getDate() + daysOffset);
    const dateStr = d.toISOString().split('T')[0];
    dateInput.value = dateStr;
    // Тригеримо завантаження занять
    loadAssignmentsForDate(dateStr);
}

function loadWeek() {
    const today = new Date();
    const nextWeek = new Date();
    nextWeek.setDate(today.getDate() + 7);
    
    const dateFrom = today.toISOString().split('T')[0];
    const dateTo = nextWeek.toISOString().split('T')[0];
    
    loadAssignmentsForDate(null, dateFrom, dateTo);
}

async function loadAllInitialData() {
    const results = await Promise.allSettled([
        studentsAPI.getAll({ is_active: true }),
        pricesAPI.getAll()
    ]);

    allStudents = results[0].status === 'fulfilled' ? results[0].value : [];
    allPrices = results[1].status === 'fulfilled' ? results[1].value : [];
}

async function loadAssignmentsForDate(selectedDate, dateFrom = null, dateTo = null) {
    try {
        const assignmentsGrid = document.getElementById('assignmentsGrid');
        assignmentsGrid.innerHTML = '<div style="grid-column: 1/-1; text-align: center; padding: 20px;">Завантаження призначень...</div>';

        let params = {};
        if (selectedDate) params.lesson_date = selectedDate;
        if (dateFrom) params.date_from = dateFrom;
        if (dateTo) params.date_to = dateTo;

        // Trainer role filtering is handled by the backend `assignmentsAPI.getAll` based on `current_user`
        
        const [assignments, attendanceRecords] = await Promise.all([
            assignmentsAPI.getAll(params),
            selectedDate 
                ? attendanceAPI.getByDate(selectedDate) 
                : (dateFrom || dateTo ? attendanceAPI.getAll({ date_from: dateFrom, date_to: dateTo, limit: 500 }) : [])
        ]);

        console.log('Завантаження для параметрів:', params);
        console.log('Знайдено призначень:', assignments);
        console.log('Знайдено відміток у БД:', attendanceRecords);

        // Зшиваємо дані про призначення з реальними відмітками, щоб лічильник 0/1 оновився
        allAssignments = assignments.map(assignment => {
            if (assignment.students) {
                // Приводимо дату заняття до формату YYYY-MM-DD для точного порівняння
                const lessonDateStr = String(assignment.lesson_date).split('T')[0];

                assignment.students = assignment.students.map(student => {
                    const studentId = student.student_id || student.id;
                    const targetGroupId = assignment.group_id || assignment.group?.id;
                    // Шукаємо відмітку саме для цього учня, дати І групи
                    const record = attendanceRecords.find(r => 
                        r.student_id === studentId && 
                        String(r.date).split('T')[0] === lessonDateStr &&
                        r.group_id === targetGroupId
                    );

                    if (record) {
                        return { ...student, attendance_id: record.id, is_present: record.status === 'present', is_paid: record.is_paid };
                    }
                    return student;
                });
            }
            return assignment;
        });

        renderAssignmentsCards(allAssignments);
    } catch (error) {
        console.error('Error loading assignments:', error);
        showNotification('Помилка завантаження призначень: ' + (error.message || 'Невідома помилка'), 'error');
        document.getElementById('assignmentsGrid').innerHTML = '<div style="grid-column: 1/-1; text-align: center; padding: 20px; color: var(--danger-color);">Помилка завантаження призначень.</div>';
    }
}

function renderAssignmentsCards(assignments) {
    const grid = document.getElementById('assignmentsGrid');
    if (!grid) return;

    if (!assignments || assignments.length === 0) {
        grid.innerHTML = '<div style="grid-column: 1/-1; text-align: center; padding: 40px;">На цей день призначень немає.</div>';
        return;
    }

    grid.innerHTML = assignments.map(a => {
        const scheduleTime = a.group?.schedule ? `<div class="info-item"><i class="fas fa-clock"></i><span>${a.group.schedule}</span></div>` : '';
        
        // Рахуємо скільки учнів з цього призначення вже мають відмітку
        const totalStudents = a.students?.length || 0;
        const markedStudents = a.students?.filter(s => s.attendance_id).length || 0;
        const isCompleted = totalStudents > 0 && markedStudents >= totalStudents;

        return `
            <div class="group-card ${isCompleted ? 'status-completed' : ''}" style="${isCompleted ? 'border-left: 5px solid #10b981; background-color: #f0fdf4;' : ''}">
                <div class="group-header">
                    <h3>${a.group?.name || 'Без назви'}</h3>
                    <span class="badge ${isCompleted ? 'badge-success' : 'badge-info'}">
                        ${isCompleted ? '<i class="fas fa-check-circle"></i> Відмічено' : formatDate(a.lesson_date)}
                    </span>
                </div>
                <div class="group-info">
                    ${scheduleTime}
                    <div class="info-item"><i class="fas fa-user-tie"></i><span>Тренер: ${a.trainer?.first_name} ${a.trainer?.last_name}</span></div>
                    <div class="info-item"><i class="fas fa-users"></i><span>Учнів: ${totalStudents} (${markedStudents}/${totalStudents})</span></div>
                </div>
                <div class="group-actions">
                    <button class="btn ${isCompleted ? 'btn-secondary' : 'btn-primary'} btn-sm" onclick="openMarkAttendanceModal(${a.id})">
                        <i class="fas ${isCompleted ? 'fa-edit' : 'fa-clipboard-check'}"></i> 
                        ${isCompleted ? 'Редагувати' : 'Підтвердити'}
                    </button>
                </div>
            </div>
        `;
    }).join('');
}

async function openMarkAttendanceModal(assignmentId) {
    const assignment = allAssignments.find(a => a.id === assignmentId);
    if (!assignment) {
        showNotification('Призначення не знайдено', 'error');
        return;
    }

    currentAssignmentId = assignmentId;
    document.getElementById('attendanceModalTitle').textContent = `Відмітка відвідування: ${assignment.group?.name} (${formatDate(assignment.lesson_date)})`;
    document.getElementById('attendanceModal').classList.add('show');

    // Populate currentLessonStudents with data from the assignment
    currentLessonStudents = (assignment.students || []).map(s => {
        let choice = s.payment_choice || s.payment_type;
        if (!choice && s.pivot) choice = s.pivot.payment_choice;
        if (!choice && s.assignment_details) choice = s.assignment_details.payment_choice;
        
        if (!choice) choice = 'subscription';

        // Новий запис ніколи не може бути оплаченим або присутнім автоматично
        const isPaid = (s.attendance_id && s.is_paid === true) ? true : false;
        const isPresent = (s.attendance_id && s.is_present === true) ? true : false;

        return {
            id: s.student_id || s.id, 
            name: `${s.first_name} ${s.last_name}`,
            payment_choice: String(choice),
            is_present: isPresent, 
            is_paid: isPaid,
            attendance_id: s.attendance_id
        };
    });

    renderStudentsForAttendanceModal();
    setupStudentSearchForModal();
}

function closeAttendanceModal() {
    document.getElementById('attendanceModal').classList.remove('show');
    currentAssignmentId = null;
    currentLessonStudents = [];
}

function renderStudentsForAttendanceModal() {
    const container = document.getElementById('studentsForAttendanceList');
    const confirmBtn = document.getElementById('confirmAttendanceBtn');
    
    if (currentLessonStudents.length === 0) {
        container.innerHTML = '<p class="text-center" style="color: var(--text-secondary); padding: 10px;">Учнів немає</p>';
        confirmBtn.disabled = true;
        return;
    }

    container.innerHTML = `
        <div class="attendance-header-actions">
            <button class="btn btn-secondary btn-sm" onclick="markAllPresent()">
                <i class="fas fa-check-double"></i> Відмітити всіх присутніми
            </button>
        </div>
        <div class="attendance-cards-container">
            ${currentLessonStudents.map(s => {
                const selectedPrice = allPrices.find(p => String(p.id) === String(s.payment_choice));
                const priceDisplay = (selectedPrice && (selectedPrice.category === 'single' || selectedPrice.category === 'individual'))
                    ? `<span class="price-tag">${selectedPrice.price} грн</span>` : '';

                // Попередження, якщо не оплачено (тепер незалежно від присутності)
                const warningClass = !s.is_paid ? 'is-unpaid-warning' : '';

                return `
                    <div class="student-attendance-card ${s.is_present ? 'is-present' : ''} ${s.is_paid ? 'is-paid' : ''} ${warningClass}">
                        <div class="card-main-info">
                            <span class="student-name">${s.name}</span>
                            ${priceDisplay}
                            <button type="button" class="btn-remove-student" onclick="removeStudentFromCurrentLesson(${s.id})" title="Видалити">
                                <i class="fas fa-times"></i>
                            </button>
                        </div>
                        <div class="card-controls">
                            <label class="attendance-toggle">
                                <input type="checkbox" ${s.is_present ? 'checked' : ''} onchange="updateStudentAttendanceStatus(${s.id}, 'is_present', this.checked)">
                                <span class="toggle-btn"><i class="fas fa-user-check"></i> Присутній</span>
                            </label>
                            <label class="attendance-toggle">
                                <input type="checkbox" ${s.is_paid ? 'checked' : ''} onchange="updateStudentAttendanceStatus(${s.id}, 'is_paid', this.checked)">
                                <span class="toggle-btn"><i class="fas fa-money-bill-wave"></i> Оплачено</span>
                            </label>
                            <div class="payment-choice-wrapper">
                                <select onchange="updateStudentPaymentChoice(${s.id}, this.value)" class="card-select">
                                    <option value="subscription" ${s.payment_choice === 'subscription' ? 'selected' : ''}>Абонемент</option>
                                    ${allPrices.map(p => {
                                        const isSelected = String(s.payment_choice) === String(p.id);
                                        return `<option value="${p.id}" ${isSelected ? 'selected' : ''}>${p.name}</option>`;
                                    }).join('')}
                                </select>
                            </div>
                        </div>
                    </div>
                `;
            }).join('')}
        </div>
    `;

    updateConfirmButtonState();
}

function markAllPresent() {
    currentLessonStudents.forEach(s => s.is_present = true);
    renderStudentsForAttendanceModal();
    updateConfirmButtonState();
}

window.markAllPresent = markAllPresent;
function updateStudentAttendanceStatus(studentId, field, value) {
    const student = currentLessonStudents.find(s => String(s.id) === String(studentId));
    if (student) {
        student[field] = value;
        renderStudentsForAttendanceModal(); // Це автоматично оновить і стан кнопки
    }
}

function updateStudentPaymentChoice(studentId, value) {
    const student = currentLessonStudents.find(s => String(s.id) === String(studentId));
    if (student) {
        student.payment_choice = String(value); // Завжди зберігаємо як рядок
        
        // Якщо це абонемент — зазвичай він вже оплачений, але ми даємо тренеру вибір.
        // Можна залишити false, щоб тренер підтвердив списання.
        renderStudentsForAttendanceModal();
    }
}

function updateConfirmButtonState() {
    const confirmBtn = document.getElementById('confirmAttendanceBtn');
    const messageEl = document.getElementById('attendanceValidationMsg');
    if (!confirmBtn || !messageEl) return;

    const unpaidCount = currentLessonStudents.filter(s => !s.is_paid).length;
    const hasStudents = currentLessonStudents.length > 0;
    
    // Дозволяємо зберігати завжди, якщо є хоча б один учень в списку
    confirmBtn.disabled = !hasStudents;
    confirmBtn.classList.toggle('btn-success', hasStudents);
    
    if (hasStudents && unpaidCount > 0) {
        messageEl.innerHTML = `<i class="fas fa-exclamation-circle"></i> Є боржники (${unpaidCount})`;
    } else {
        messageEl.innerHTML = '';
    }
}

// --- Add Student to Current Lesson (within modal) ---
function setupStudentSearchForModal() {
    const input = document.getElementById('addStudentToLessonSearch');
    const suggestions = document.getElementById('addStudentSuggestions');
    if (!input || !suggestions) return;

    input.addEventListener('input', (e) => {
        const query = e.target.value.toLowerCase().trim();
        if (query.length < 2) { suggestions.innerHTML = ''; return; }

        const matches = allStudents.filter(s => 
            `${s.first_name} ${s.last_name}`.toLowerCase().includes(query) &&
            !currentLessonStudents.some(sel => String(sel.id) === String(s.id))
        );

        suggestions.innerHTML = matches.map(s => `
            <div class="suggestion-item" onclick="addStudentToCurrentLesson(${s.id}, '${s.first_name} ${s.last_name}')">
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

function addStudentToCurrentLesson(id, name) {
    // Default payment choice to the first price item
    const defaultPaymentChoice = allPrices.length > 0 ? String(allPrices[0].id) : '';

    currentLessonStudents.push({
        id: id,
        name: name,
        payment_choice: defaultPaymentChoice,
        is_present: false, // За замовчуванням — відсутній
        is_paid: false,
        attendance_id: null // No existing attendance record yet
    });

    document.getElementById('addStudentToLessonSearch').value = '';
    document.getElementById('addStudentSuggestions').innerHTML = '';
    renderStudentsForAttendanceModal();
}

function removeStudentFromCurrentLesson(studentId) {
    currentLessonStudents = currentLessonStudents.filter(s => String(s.id) !== String(studentId));
    renderStudentsForAttendanceModal();
}

async function handleConfirmAttendance() {
    setBtnLoading('confirmAttendanceBtn', true);
    try {
        const assignment = allAssignments.find(a => a.id === currentAssignmentId);
        if (!assignment) {
            showNotification('Помилка: Призначення не знайдено.', 'error');
            return;
        }

        // Отримуємо дату у форматі YYYY-MM-DD один раз для всіх запитів
        const lessonDate = (assignment.lesson_date instanceof Date) 
            ? assignment.lesson_date.toISOString().split('T')[0] 
            : String(assignment.lesson_date).split('T')[0];

        for (const student of currentLessonStudents) {
            const sId = parseInt(student.id);
            if (isNaN(sId)) {
                console.warn('Пропущено учня через некоректний ID:', student);
                continue;
            }

            // Ми створюємо запис для ВСІХ учнів, які були в списку на момент натискання "Підтвердити",
            // щоб картка заняття стала зеленою (1/1)

            // Формуємо статус: якщо не присутній, то absent
            let status = 'absent';
            if (student.is_present) status = 'present';

            // Перевірка для розробки: логуємо що відправляємо
            console.log(`Sending attendance for ${student.name}:`, {
                student_id: sId,
                status: status,
                payment: student.payment_choice,
                is_paid: student.is_paid
            });

            const attendanceData = {
                student_id: sId,
                date: lessonDate,
                status: status, 
                notes: "", 
                group_id: assignment.group_id || assignment.group?.id,
                trainer_id: assignment.trainer_id || assignment.trainer?.id,
                payment_choice: String(student.payment_choice),
                is_paid: Boolean(student.is_paid)
            };

            // Оскільки оплата тепер обов'язкова для всіх у списку, 
            // ми створюємо або оновлюємо запис для кожного в поточній таблиці Attendance
            if (student.attendance_id) {
                // Update existing attendance record
                await attendanceAPI.update(student.attendance_id, attendanceData);
            } else {
                // Create new attendance record
                await attendanceAPI.mark(attendanceData);
            }
        }

        // Після успішного збереження поточних відміток, "фіналізуємо" їх в історію
        // Це відповідає логіці "записать іде в історію"
        const historyEntries = currentLessonStudents.map(student => {
            const sId = parseInt(student.id);
            let status = 'absent';
            if (student.is_present) status = 'present';

            return {
                assignment_id: currentAssignmentId,
                student_id: sId,
                date: lessonDate,
                status: status,
                payment_choice: String(student.payment_choice),
                is_paid: Boolean(student.is_paid),
                notes: "" // Можна додати нотатки, якщо є
            };
        });

        if (historyEntries.length > 0) {
            try {
                await attendanceAPI.finalize(historyEntries);
                showNotification('Відмітки успішно записано в історію!', 'success');
            } catch (historyError) {
                console.error('Помилка запису в історію:', historyError);
                showNotification('Помилка запису відвідування в історію: ' + (historyError.message || 'Невідома помилка'), 'error');
                // Можливо, тут варто вирішити, чи вважати це критичною помилкою, якщо поточні відмітки збереглись, а в історію - ні.
                // Для початку, просто покажемо повідомлення.
            }
        }

        showNotification('Відвідування успішно оновлено!', 'success');
        closeAttendanceModal();
        await loadAssignmentsForDate(lessonDate); // Reload assignments to reflect changes
    } catch (error) {
    } finally {
        setBtnLoading('confirmAttendanceBtn', false, '<i class="fas fa-save"></i> Зберегти та підтвердити');
    }
}
