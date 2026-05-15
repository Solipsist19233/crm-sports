let allHistoryRecords = [];
let allStudents = [];
let allTrainers = [];
let allPrices = [];

document.addEventListener('DOMContentLoaded', async () => {
    try {
        requireAuth();
        loadUserInfo();
        setupMobileMenu();

        const user = getUser();
        if (user && user.role !== 'admin' && user.role !== 'trainer') {
            window.location.href = 'dashboard.html'; // Redirect if not admin or trainer
            return;
        }

        await loadInitialData();
        await loadHistoryRecords();

        document.getElementById('applyFiltersBtn').addEventListener('click', loadHistoryRecords);
        document.getElementById('resetFiltersBtn').addEventListener('click', resetFilters);
        document.getElementById('cleanupHistoryBtn').addEventListener('click', cleanupOldHistory);

        window.openEditHistoryModal = openEditHistoryModal;
        window.closeEditHistoryModal = closeEditHistoryModal;
        window.deleteHistoryEntry = deleteHistoryEntry;
    } catch (err) {
        console.error('Помилка ініціалізації сторінки історії відвідувань:', err);
        showNotification('Помилка завантаження сторінки історії', 'error');
    }
});

async function loadInitialData() {
    const results = await Promise.allSettled([
        studentsAPI.getAll({ is_active: true }),
        trainersAPI.getAll(),
        pricesAPI.getAll()
    ]);

    allStudents = results[0].status === 'fulfilled' ? results[0].value : [];
    allTrainers = results[1].status === 'fulfilled' ? results[1].value : [];
    allPrices = results[2].status === 'fulfilled' ? results[2].value : [];

    // Populate trainer filter
    const trainerFilter = document.getElementById('trainerFilter');
    trainerFilter.innerHTML = '<option value="">Всі тренери</option>' +
        allTrainers.map(t => `<option value="${t.id}">${t.first_name} ${t.last_name}</option>`).join('');

    // Populate students datalist for search
    const studentsDatalist = document.getElementById('studentsDatalist');
    studentsDatalist.innerHTML = allStudents.map(s =>
        `<option value="${s.first_name} ${s.last_name} (ID: ${s.id})">`
    ).join('');
}

async function loadHistoryRecords() {
    const tbody = document.getElementById('historyTableBody');
    tbody.innerHTML = '<tr><td colspan="7" class="text-center">Завантаження історії...</td></tr>';

    const dateFrom = document.getElementById('dateFromFilter').value;
    const dateTo = document.getElementById('dateToFilter').value;
    const studentSearchValue = document.getElementById('studentSearchInput').value;
    const trainerId = document.getElementById('trainerFilter').value;
    const isPaid = document.getElementById('paymentFilter').value;

    let studentId = null;
    if (studentSearchValue) {
        const idMatch = studentSearchValue.match(/\(ID: (\d+)\)$/);
        if (idMatch) studentId = parseInt(idMatch[1]);
    }

    const params = {};
    if (dateFrom) params.date_from = dateFrom;
    if (dateTo) params.date_to = dateTo;
    if (studentId) params.student_id = studentId;
    if (trainerId) params.trainer_id = trainerId;
    if (isPaid !== "") params.is_paid = isPaid === "true";

    try {
        allHistoryRecords = await attendanceAPI.getHistory(params) || [];
        renderHistoryTable(allHistoryRecords);
    } catch (error) {
        console.error('Помилка завантаження історії відвідувань:', error);
        showNotification('Помилка завантаження історії: ' + (error.message || 'Невідома помилка'), 'error');
        tbody.innerHTML = '<tr><td colspan="7" class="text-center" style="color: var(--danger-color);">Помилка завантаження історії.</td></tr>';
    }
}

function renderHistoryTable(records) {
    const tbody = document.getElementById('historyTableBody');
    if (!records || records.length === 0) {
        tbody.innerHTML = '<tr><td colspan="7" class="text-center">Історія відвідувань відсутня.</td></tr>';
        return;
    }

    tbody.innerHTML = records.map(r => {
        // Отримуємо дані учня для запасного варіанту
        const student = allStudents.find(s => s.id === r.student_id);
        
        const studentName = r.student_first_name && r.student_last_name ? `${r.student_first_name} ${r.student_last_name}` : `ID: ${r.student_id}`;
        
        // Пріоритет: дані з запису історії -> дані з поточних налаштувань учня -> "Невідомо"
        const trainerName = r.assignment_trainer_first_name && r.assignment_trainer_last_name 
            ? `${r.assignment_trainer_first_name} ${r.assignment_trainer_last_name}` 
            : (student?.trainer ? `${student.trainer.first_name} ${student.trainer.last_name}` : 'Невідомий');
            
        const groupName = r.assignment_group_name || student?.group?.name || 'Невідома група';
        
        const paymentText = allPrices.find(p => String(p.id) === String(r.payment_choice))?.name || 'Абонемент';
        const paidClass = r.is_paid ? 'badge-success' : 'badge-danger';

        return `
            <tr>
                <td>${formatDate(r.date)}</td>
                <td>${groupName}</td>
                <td>${trainerName}</td>
                <td>${studentName}</td>
                <td>
                    <span class="badge ${r.status === 'present' ? 'badge-success' : 'badge-danger'}">
                        ${r.status === 'present' ? 'Присутній' : r.status === 'absent' ? 'Відсутній' : 'Хворий'}
                    </span>
                </td>
                <td>
                    <span class="badge ${paidClass}">
                        ${paymentText} (${r.is_paid ? 'Оплачено' : 'Не оплачено'})
                    </span>
                </td>
                <td>
                    <button class="btn-icon" onclick="openEditHistoryModal(${r.id})" title="Редагувати">
                        <i class="fas fa-edit"></i>
                    </button>
                    <button class="btn-icon btn-danger" onclick="deleteHistoryEntry(${r.id})" title="Видалити">
                        <i class="fas fa-trash"></i>
                    </button>
                </td>
            </tr>
        `;
    }).join('');
}

function resetFilters() {
    document.getElementById('dateFromFilter').value = '';
    document.getElementById('dateToFilter').value = '';
    document.getElementById('studentSearchInput').value = '';
    document.getElementById('trainerFilter').value = '';
    document.getElementById('paymentFilter').value = '';
    loadHistoryRecords();
}

function openEditHistoryModal(id) {
    const record = allHistoryRecords.find(r => r.id === id);
    if (!record) return;

    document.getElementById('editHistoryId').value = record.id;
    document.getElementById('editStatus').value = record.status;
    document.getElementById('editIsPaid').checked = record.is_paid;

    document.getElementById('editHistoryModal').classList.add('show');
}

function closeEditHistoryModal() {
    document.getElementById('editHistoryModal').classList.remove('show');
}

document.getElementById('editHistoryForm').addEventListener('submit', async (e) => {
    e.preventDefault();

    const id = parseInt(document.getElementById('editHistoryId').value);
    const status = document.getElementById('editStatus').value;
    const isPaid = document.getElementById('editIsPaid').checked;

    const data = {
        status: status,
        is_paid: isPaid
    };

    try {
        await attendanceAPI.updateHistoryEntry(id, data);
        showNotification('Запис історії оновлено', 'success');
        closeEditHistoryModal();
        loadHistoryRecords();
    } catch (error) {
        console.error('Помилка оновлення запису історії:', error);
        showNotification('Помилка оновлення запису історії: ' + (error.message || 'Невідома помилка'), 'error');
    }
});

async function deleteHistoryEntry(id) {
    if (!confirm('Ви впевнені, що хочете видалити цей запис з історії?')) return;

    try {
        await attendanceAPI.delete(id);
        showNotification('Запис успішно видалено', 'success');
        await loadHistoryRecords();
    } catch (error) {
        console.error('Помилка видалення запису історії:', error);
        showNotification('Помилка видалення: ' + (error.message || 'Невідома помилка'), 'error');
    }
}

async function cleanupOldHistory() {
    const threeMonthsAgo = new Date();
    threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);
    const cleanupDate = threeMonthsAgo.toISOString().split('T')[0];

    if (confirm(`Видалити всі записи історії відвідувань, що старші за ${formatDate(cleanupDate)}? Цю дію неможливо скасувати!`)) {
        try {
            setBtnLoading('cleanupHistoryBtn', true);
            await attendanceAPI.cleanupHistory(cleanupDate);
            showNotification('Стара історія відвідувань успішно видалена', 'success');
            loadHistoryRecords();
        } catch (error) {
            console.error('Помилка очищення історії:', error);
            showNotification('Помилка очищення історії: ' + (error.message || 'Невідома помилка'), 'error');
        } finally {
            setBtnLoading('cleanupHistoryBtn', false, '<i class="fas fa-broom"></i> Очистити стару історію');
        }
    }
}