document.addEventListener('DOMContentLoaded', async () => {
    requireAuth();
    loadUserInfo();
    setupMobileMenu();
    await loadSubscriptions();

    const addBtn = document.getElementById('addSubscriptionBtn');
    if (addBtn) addBtn.addEventListener('click', openAddSubscriptionModal);
    
    const form = document.getElementById('subscriptionForm');
    if (form) form.addEventListener('submit', handleSubscriptionFormSubmit);
    
    const searchInput = document.getElementById('searchSubscriptions');
    if (searchInput) searchInput.addEventListener('input', filterSubscriptions);

    // Перевірка ролі
    const user = getUser();
    if (user && user.role !== 'admin') {
        if (addBtn) addBtn.style.display = 'none';
    }
});

let allSubscriptions = [];
let allStudents = [];
let allPricelistItems = [];

async function loadSubscriptions() {
    try {
        const subscriptions = await apiRequest('/api/subscriptions');
        allSubscriptions = subscriptions;
        displaySubscriptions(allSubscriptions);
    } catch (error) {
        console.error('Error loading subscriptions:', error);
        showNotification('Помилка завантаження абонементів.', 'error');
    }
}

function displaySubscriptions(subscriptions) {
    const tbody = document.getElementById('subscriptionsTableBody');
    if (!tbody) return;
    tbody.innerHTML = '';

    if (subscriptions.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" class="text-center">Абонементів не знайдено.</td></tr>';
        return;
    }

    const user = getUser();

    subscriptions.forEach(sub => {
        const row = tbody.insertRow();
        row.insertCell().textContent = sub.student_name;
        row.insertCell().textContent = sub.pricelist_item_name;

        const classesCell = row.insertCell();
        classesCell.textContent = sub.classes_remaining;
        if (sub.classes_remaining === 0) {
            classesCell.classList.add('text-danger');
        }
        row.insertCell().textContent = sub.is_active ? 'Активний' : 'Неактивний';

        const actionsCell = row.insertCell();
        actionsCell.classList.add('text-right');

        if (user && user.role === 'admin') {
            actionsCell.innerHTML = `
                <button class="btn btn-sm btn-secondary mr-2" onclick="openEditSubscriptionModal(${sub.id})" title="Редагувати">
                    <i class="fas fa-edit"></i>
                </button>
                <button class="btn btn-sm btn-danger" onclick="deleteSubscription(${sub.id})" title="Видалити">
                    <i class="fas fa-trash"></i>
                </button>
            `;
        } else {
            actionsCell.textContent = '—';
        }
    });
}

async function openAddSubscriptionModal() {
    document.getElementById('subscriptionForm').reset();
    document.getElementById('subscriptionId').value = '';
    document.getElementById('subscriptionModalTitle').textContent = 'Додати абонемент';
    
    await populateStudentAndPricelistDropdowns();
    document.getElementById('subscriptionModal').classList.add('show');
}

async function openEditSubscriptionModal(subscriptionId) {
    try {
        const sub = await apiRequest(`/api/subscriptions/${subscriptionId}`);
        await populateStudentAndPricelistDropdowns();

        document.getElementById('subscriptionId').value = sub.id;
        document.getElementById('studentSelect').value = sub.student_id;
        document.getElementById('pricelistItemSelect').value = sub.pricelist_item_id;
        document.getElementById('classesRemaining').value = sub.classes_remaining;
        
        document.getElementById('subscriptionModalTitle').textContent = 'Редагувати абонемент';
        document.getElementById('subscriptionModal').classList.add('show');
    } catch (error) {
        showNotification('Не вдалося завантажити дані абонемента', 'error');
    }
}

window.closeSubscriptionModal = function() {
    document.getElementById('subscriptionModal').classList.remove('show');
}

async function populateStudentAndPricelistDropdowns() {
    try {
        if (allStudents.length === 0) {
            allStudents = await apiRequest('/api/subscriptions/students_for_dropdown');
        }
        if (allPricelistItems.length === 0) {
            allPricelistItems = await apiRequest('/api/subscriptions/pricelist_subscriptions');
        }
    } catch (error) {
        console.error('Error populating dropdowns:', error);
    }

    const studentSelect = document.getElementById('studentSelect');
    studentSelect.innerHTML = '<option value=\"\">Оберіть учня...</option>' + 
        allStudents.map(s => `<option value=\"${s.id}\">${s.first_name} ${s.last_name}</option>`).join('');

    const priceSelect = document.getElementById('pricelistItemSelect');
    priceSelect.innerHTML = '<option value=\"\">Оберіть вид абонемента...</option>' + 
        allPricelistItems.map(p => `<option value=\"${p.id}\">${p.name}</option>`).join('');
}

async function handleSubscriptionFormSubmit(event) {
    event.preventDefault();
    const id = document.getElementById('subscriptionId').value;
    const data = {
        student_id: parseInt(document.getElementById('studentSelect').value),
        pricelist_item_id: parseInt(document.getElementById('pricelistItemSelect').value),
        classes_remaining: parseInt(document.getElementById('classesRemaining').value)
    };

    try {
        if (id) {
            await apiRequest(`/api/subscriptions/${id}`, {
                method: 'PUT',
                body: JSON.stringify(data)
            });
        } else {
            await apiRequest('/api/subscriptions', {
                method: 'POST',
                body: JSON.stringify(data)
            });
        }
        
        showNotification(id ? 'Оновлено' : 'Додано', 'success');
        closeSubscriptionModal();
        await loadSubscriptions();
    } catch (error) {
        showNotification('Помилка збереження', 'error');
    }
}

async function deleteSubscription(id) {
    if (!confirm('Видалити цей абонемент?')) return;
    try {
        await apiRequest(`/api/subscriptions/${id}`, { method: 'DELETE' });
        showNotification('Абонемент видалено', 'success');
        await loadSubscriptions();
    } catch (error) {
        showNotification('Помилка при видаленні', 'error');
    }
}

function filterSubscriptions() {
    const searchTerm = document.getElementById('searchSubscriptions').value.toLowerCase().trim();
    if (!searchTerm) {
        displaySubscriptions(allSubscriptions);
        return;
    }
    const filtered = allSubscriptions.filter(sub => 
        sub.student_name.toLowerCase().includes(searchTerm) ||
        sub.pricelist_item_name.toLowerCase().includes(searchTerm)
    );
    displaySubscriptions(filtered);
}