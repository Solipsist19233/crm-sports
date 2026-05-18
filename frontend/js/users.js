// Перевірка ролі користувача
function checkUserRole() {
    const user = getUser(); // Використовуємо функцію з api.js
    console.log('Поточний користувач:', user);

    if (!user || user.role !== 'admin') {
        console.warn('Доступ заборонено: ви не адмін. Редирект на дашборд...');
        window.location.href = 'dashboard.html';
    }
}

let allUsers = []; // Зберігаємо список для швидкого доступу при редагуванні

// Завантаження користувачів
async function loadUsers() {
    try {
        console.log('Fetching users...');
        const response = await apiRequest('/api/users');
        
        // Підтримка обох форматів: {users: [...]} або просто [...]
        allUsers = Array.isArray(response) ? response : (response.users || []);

        const tbody = document.getElementById('usersTable');
        if (!tbody) return;

        if (!allUsers || allUsers.length === 0) {
            tbody.innerHTML = '<tr><td colspan="6" class="text-center">Користувачів не знайдено</td></tr>';
            return;
        }

        tbody.innerHTML = allUsers.map(user => `
            <tr>
                <td>${user.username}</td>
                <td>${user.full_name}</td>
                <td>
                    <span class="badge ${user.role === 'admin' ? 'badge-success' : 'badge-info'}">
                        ${user.role === 'admin' ? 'Адміністратор' : 'Тренер'}
                    </span>
                </td>
                <td>
                    <span class="badge ${user.is_active ? 'badge-success' : 'badge-danger'}">
                        ${user.is_active ? 'Активний' : 'Неактивний'}
                    </span>
                </td>
                <td>${new Date(user.created_at).toLocaleDateString('uk-UA')}</td>
                <td>
                    <button class="btn-icon" onclick="openEditUserModal(${user.id})" title="Редагувати">
                        <i class="fas fa-edit"></i>
                    </button>
                    <button class="btn-icon btn-danger" onclick="deleteUser(${user.id}, '${user.username}')" title="Видалити">
                        <i class="fas fa-trash"></i>
                    </button>
                </td>
            </tr>
        `).join('');
    } catch (error) {
        console.error('Error loading users:', error);
        let errorMsg = 'Помилка завантаження користувачів';
        if (error.message.includes('404')) {
            errorMsg = 'Помилка 404: Ендпоінт /api/users не знайдено на сервері';
        } else if (error.message.includes('500')) {
            errorMsg = 'Помилка 500: Проблема з базою даних на сервері';
        }
        showNotification(errorMsg, 'error');
    }
}

// Відкрити модальне вікно додавання користувача
function openAddUserModal() {
    console.log('openAddUserModal called');
    const modal = document.getElementById('userModal');
    if (!modal) {
        console.error('Modal element #userModal not found');
        return;
    }

    const modalTitle = document.getElementById('modalTitle');
    const userForm = document.getElementById('userForm');
    const userIdField = document.getElementById('userId');
    const passwordField = document.getElementById('password');
    const userRoleField = document.getElementById('userRole');
    const trainerFieldsGroup = document.getElementById('trainerFieldsGroup');
    const usernameField = document.getElementById('username');

    if (modalTitle) modalTitle.textContent = 'Додати користувача';
    if (userForm) userForm.reset();
    if (userIdField) userIdField.value = '';
    if (usernameField) usernameField.disabled = false;
    if (passwordField) {
        passwordField.required = true;
        passwordField.placeholder = 'Мінімум 6 символів';
    }

    // За замовчуванням роль тренер і показуємо поля тренера
    if (userRoleField) userRoleField.value = 'trainer';
    if (trainerFieldsGroup) trainerFieldsGroup.style.display = 'block';

    modal.style.display = 'flex';
    console.log('Modal should be visible now');
}

// Відкрити модальне вікно для редагування
function openEditUserModal(userId) {
    const user = allUsers.find(u => u.id === userId);
    if (!user) {
        showNotification('Користувача не знайдено', 'error');
        return;
    }

    openAddUserModal(); // Скидаємо стан через базову функцію

    document.getElementById('modalTitle').textContent = 'Редагувати користувача';
    document.getElementById('userId').value = user.id;
    document.getElementById('username').value = user.username;
    document.getElementById('username').disabled = true; // Логін міняти не можна
    document.getElementById('fullName').value = user.full_name;
    document.getElementById('userRole').value = user.role;
    
    const passwordField = document.getElementById('password');
    passwordField.required = false;
    passwordField.placeholder = 'Залиште порожнім, щоб не змінювати';

    if (user.role === 'trainer' && user.trainer_data) {
        document.getElementById('trainerFieldsGroup').style.display = 'block';
        document.getElementById('trainerFirstName').value = user.trainer_data.first_name || '';
        document.getElementById('trainerLastName').value = user.trainer_data.last_name || '';
        document.getElementById('trainerPhone').value = user.trainer_data.phone || '';
        document.getElementById('trainerSpecialization').value = user.trainer_data.specialization || '';
    } else {
        document.getElementById('trainerFieldsGroup').style.display = 'none';
    }
}

// Закрити модальне вікно
function closeUserModal() {
    document.getElementById('userModal').style.display = 'none';
}

// Видалення користувача
async function deleteUser(userId, username) {
    if (!confirm(`Ви впевнені, що хочете видалити користувача "${username}"?`)) {
        return;
    }

    try {
        await apiRequest(`/api/users/${userId}`, {
            method: 'DELETE'
        });

        showNotification('Користувача успішно видалено', 'success');
        loadUsers();
    } catch (error) {
        console.error('Error deleting user:', error);
        showNotification(error.message || 'Помилка видалення користувача', 'error');
    }
}

// Ініціалізація
document.addEventListener('DOMContentLoaded', function() {
    checkUserRole();
    loadUsers();
    loadUserInfo();
    // setupMobileMenu() is called here, but it's defined below. This will be fixed by moving setupMobileMenu to utils.js
    setupMobileMenu();

    // Обробка зміни ролі
    const userRoleSelect = document.getElementById('userRole');
    if (userRoleSelect) {
        userRoleSelect.addEventListener('change', function() {
            const trainerFields = document.getElementById('trainerFieldsGroup');
            if (trainerFields) {
                trainerFields.style.display = this.value === 'trainer' ? 'block' : 'none';
            }
        });
    }

    // Обробка форми користувача
    const userForm = document.getElementById('userForm');
    if (userForm) {
        userForm.addEventListener('submit', async function(e) {
        e.preventDefault();

        const userId = document.getElementById('userId').value;
        const username = document.getElementById('username').value.trim();
        const fullName = document.getElementById('fullName').value.trim();
        const role = document.getElementById('userRole').value;
        const password = document.getElementById('password').value;

        // Пароль обов'язковий тільки для нових користувачів
        if (!userId && password.length < 6) {
            showNotification('Пароль повинен містити мінімум 6 символів', 'error');
            return;
        }

        const userData = {
            full_name: fullName,
            role,
            is_active: true
        };

        if (password) userData.password = password;
        if (!userId) userData.username = username;

        // Якщо роль тренер, додаємо дані тренера
        if (role === 'trainer') {
            const trainerFirstName = document.getElementById('trainerFirstName').value.trim();
            const trainerLastName = document.getElementById('trainerLastName').value.trim();
            const trainerPhone = document.getElementById('trainerPhone').value.trim();
            const trainerSpecialization = document.getElementById('trainerSpecialization').value.trim();

            userData.trainer_data = {
                first_name: trainerFirstName || '',
                last_name: trainerLastName || '',
                phone: trainerPhone || '',
                specialization: trainerSpecialization || ''
            };
        }

        try {
            const method = userId ? 'PUT' : 'POST';
            const url = userId ? `/api/users/${userId}` : '/api/users';

            await apiRequest(url, {
                method: method,
                body: JSON.stringify(userData)
            });

            showNotification(userId ? 'Користувача оновлено' : 'Користувача створено', 'success');
            closeUserModal();
            loadUsers();
        } catch (error) {
            console.error('Error creating user:', error);
            showNotification(error.message || 'Помилка створення користувача', 'error');
        }
    });
    }

    // Закриття модального вікна при кліку поза ним
    window.onclick = function(event) {
        const modal = document.getElementById('userModal');
        if (event.target === modal) {
            closeUserModal();
        }
    };
});
