// Students Page Logic

let allStudents = [];

document.addEventListener('DOMContentLoaded', async () => {
    try {
        requireAuth();
        loadUserInfo();
        
        // Ініціалізуємо меню негайно, не чекаючи завантаження даних
        if (typeof setupMobileMenu === 'function') {
            setupMobileMenu();
        }
        
        // Показуємо індикатор завантаження
        const tbody = document.getElementById('studentsTable');
        if (tbody) {
            tbody.innerHTML = '<tr><td colspan="6" class="text-center">Завантаження...</td></tr>';
        }
        
        // Завантажуємо дані паралельно з обробкою кожного результату окремо
        const results = await Promise.allSettled([
            loadStudents()
        ]);
        
        // Відображаємо учнів
        const studentsResult = results[0];
        if (studentsResult.status === 'fulfilled') {
            renderStudents(allStudents);
        } else {
            if (tbody) {
                tbody.innerHTML = '<tr><td colspan="6" class="text-center">Помилка завантаження учнів.</td></tr>';
            }
        }
        
        setupFilters();
        
    } catch (err) {
        console.error('Критична помилка ініціалізації:', err);
    }
});

async function loadStudents() {
    try {
        allStudents = await studentsAPI.getAll();
        console.log('Завантажено учнів:', allStudents.length);
        renderStudents(allStudents);
        return allStudents;
    } catch (error) {
        console.error('Error loading students:', error);
        allStudents = [];
        throw error;
    }
}

function renderStudents(students) {
    const tbody = document.getElementById('studentsTable');
    const user = getUser(); // Отримуємо роль користувача
    const isAdmin = user && user.role === 'admin';

    if (students.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" class="text-center">Немає учнів</td></tr>';
        return;
    }

    tbody.innerHTML = students.map(student => {
        
        return `
        <tr>
            <td>${student.first_name} ${student.last_name}</td>
            <td>${formatDate(student.birth_date)}</td>
            <td>${student.phone_parent || '-'}</td>
            <td>
                <div class="student-docs-info">
                    <div class="${student.medical_certificate ? 'status-success' : 'status-danger'}" title="Медична довідка">
                        <i class="fas ${student.medical_certificate ? 'fa-check-circle' : 'fa-times-circle'}"></i>
                        <small>Довідка: ${student.medical_certificate ? 'Є' : 'Немає'}</small>
                    </div>
                    <div class="${student.has_contract ? 'status-success' : 'status-danger'}" title="Договір">
                        <i class="fas ${student.has_contract ? 'fa-file-contract' : 'fa-file-signature'}"></i>
                        <small>Договір: ${student.has_contract ? 'Є' : 'Немає'}</small>
                    </div>
                    ${(function() {
                        const ins = getInsuranceStatus(student.insurance_end);
                        return `
                            <div class="${ins.class}" title="Страховка">
                                <i class="fas ${ins.icon}"></i>
                                <small>Страх. до: ${student.insurance_end ? formatDate(student.insurance_end) : 'Немає'}</small>
                            </div>
                        `;
                    })()}
                </div>
            </td>
            <td>
                <span class="badge ${student.is_active ? 'badge-success' : 'badge-danger'}">
                    ${student.is_active ? 'Активний' : 'Неактивний'}
                </span>
            </td>
            <td>
                <button class="btn-icon" onclick="editStudent(${student.id})" title="Редагувати">
                    <i class="fas fa-edit"></i>
                </button>
                ${isAdmin ? `
                    <button class="btn-icon btn-danger" onclick="deleteStudent(${student.id})" title="Видалити">
                        <i class="fas fa-trash"></i>
                    </button>
                ` : ''}
            </td>
        </tr>
    `}).join('');
}

function setupFilters() {
    const searchInput = document.getElementById('searchInput');
    const insuranceFilter = document.getElementById('insuranceFilter');

    if (searchInput) searchInput.addEventListener('input', filterStudents);
    if (insuranceFilter) insuranceFilter.addEventListener('change', filterStudents);
}

function filterStudents() {
    const searchInput = document.getElementById('searchInput');
    const insuranceFilter = document.getElementById('insuranceFilter');
    
    const searchTerm = searchInput ? searchInput.value.toLowerCase().trim() : '';
    const insuranceExpiring = insuranceFilter ? insuranceFilter.checked : false;

    let filtered = allStudents;

    // Пошук за ім'ям та прізвищем (ідентично як був)
    if (searchTerm) {
        filtered = filtered.filter(s =>
            s.first_name.toLowerCase().includes(searchTerm) ||
            s.last_name.toLowerCase().includes(searchTerm)
        );
    }

    // Фільтр страховки: 30 днів + ті, у кого її немає зовсім
    if (insuranceExpiring) {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const monthLater = new Date(today);
        monthLater.setDate(today.getDate() + 30);

        filtered = filtered.filter(s => {
            // Якщо страховки немає зовсім (null або порожній рядок) - обов'язково показуємо
            if (!s.insurance_end || s.insurance_end === "") return true;
            
            // Якщо дата є, перевіряємо чи вона прострочена або закінчується протягом 30 днів
            try {
                const dateValue = s.insurance_end.toString();
                const dateStr = dateValue.includes('T') ? dateValue : `${dateValue}T00:00:00`;
                const sDate = new Date(dateStr);
                sDate.setHours(0, 0, 0, 0);
                
                return sDate <= monthLater;
            } catch (e) {
                return true; // Якщо дата некоректна, теж вважаємо її проблемною
            }
        });
    }

    renderStudents(filtered);
}

function openAddStudentModal() {
    document.getElementById('modalTitle').textContent = 'Додати учня';
    document.getElementById('studentForm').reset();
    document.getElementById('studentId').value = '';
    // Явно скидаємо нові поля
    if (document.getElementById('insuranceStart')) document.getElementById('insuranceStart').value = '';
    if (document.getElementById('insuranceEnd')) document.getElementById('insuranceEnd').value = '';
    if (document.getElementById('medicalCertificate')) document.getElementById('medicalCertificate').checked = false;
    if (document.getElementById('hasContract')) document.getElementById('hasContract').checked = false;
    document.getElementById('studentModal').classList.add('show');
}

function closeStudentModal() {
    document.getElementById('studentModal').classList.remove('show');
}

async function editStudent(id) {
    try {
        const student = await studentsAPI.getById(id);

        document.getElementById('modalTitle').textContent = 'Редагувати учня';
        document.getElementById('studentId').value = student.id;
        document.getElementById('firstName').value = student.first_name;
        document.getElementById('lastName').value = student.last_name;
        document.getElementById('birthDate').value = student.birth_date;
        document.getElementById('phoneParent').value = student.phone_parent;
        document.getElementById('telegramParent').value = student.telegram_parent || '';
        document.getElementById('insuranceStart').value = student.insurance_start || '';
        document.getElementById('insuranceEnd').value = student.insurance_end || '';
        document.getElementById('medicalCertificate').checked = student.medical_certificate || false;
        document.getElementById('hasContract').checked = student.has_contract || false;
        document.getElementById('notes').value = student.notes || '';

        document.getElementById('studentModal').classList.add('show');
    } catch (error) {
        console.error('Error loading student:', error);
        showNotification('Помилка завантаження даних учня', 'error');
    }
}

async function deleteStudent(id) {
    if (!confirm('Ви впевнені, що хочете видалити цього учня?')) {
        return;
    }

    try {
        await studentsAPI.delete(id);
        await loadStudents();
        showNotification('Учня видалено', 'success');
    } catch (error) {
        console.error('Error deleting student:', error);
        showNotification('Помилка видалення учня', 'error');
    }
}

function validateStudentForm(data) {
    if (!data.first_name.trim() || !data.last_name.trim()) return "Ім'я та прізвище обов'язкові";
    if (!data.birth_date) return "Дата народження обов'язкова";
    if (!data.phone_parent.trim()) return "Телефон батьків обов'язковий";
    
    // Проста перевірка формату телефону (мінімум 10 цифр)
    const phoneDigits = data.phone_parent.replace(/\D/g, '');
    if (phoneDigits.length < 10) return "Введіть коректний номер телефону (мінімум 10 цифр)";
    
    return null;
}

document.getElementById('studentForm').addEventListener('submit', async (e) => {
    e.preventDefault();

    const studentId = document.getElementById('studentId').value;
    const studentData = {
        first_name: document.getElementById('firstName').value,
        last_name: document.getElementById('lastName').value,
        birth_date: document.getElementById('birthDate').value,
        phone_parent: document.getElementById('phoneParent').value,
        telegram_parent: document.getElementById('telegramParent').value || null,
        insurance_start: document.getElementById('insuranceStart').value || null,
        insurance_end: document.getElementById('insuranceEnd').value || null,
        medical_certificate: document.getElementById('medicalCertificate').checked,
        has_contract: document.getElementById('hasContract').checked,
        notes: document.getElementById('notes').value || null
    };

    const validationError = validateStudentForm(studentData);
    if (validationError) {
        showNotification(validationError, 'error');
        return;
    }

    try {
        if (studentId) {
            await studentsAPI.update(studentId, studentData);
            showNotification('Учня оновлено', 'success');
        } else {
            await studentsAPI.create(studentData);
            showNotification('Учня додано', 'success');
        }

        closeStudentModal();
        const updatedStudents = await loadStudents();
        renderStudents(updatedStudents);
    } catch (error) {
        console.error('Error saving student:', error);
        showNotification('Помилка збереження даних: ' + error.message, 'error');
    }
});
