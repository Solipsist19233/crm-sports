let allPrices = [];

document.addEventListener('DOMContentLoaded', async () => {
    try {
        requireAuth();
        loadUserInfo();
        setupMobileMenu();
        
        const user = getUser();
        if (user && user.role !== 'admin') {
            document.getElementById('addPriceBtn')?.remove();
        }

        await loadPrices();
    } catch (err) {
        console.error('Помилка ініціалізації:', err);
    }
});

async function loadPrices() {
    try {
        console.log('Prices: Завантаження прайс-листа...');
        const tbody = document.getElementById('pricesTable');
        allPrices = await pricesAPI.getAll();
        renderPrices(allPrices);
    } catch (error) {
        console.error('Error loading prices:', error);
        document.getElementById('pricesTable').innerHTML = '<tr><td colspan="4" class="text-center">Помилка завантаження</td></tr>';
    }
}

function renderPrices(prices) {
    const tbody = document.getElementById('pricesTable');
    const isAdmin = getUser()?.role === 'admin';

    if (!prices || prices.length === 0) {
        tbody.innerHTML = '<tr><td colspan="4" class="text-center">Прайс-лист порожній</td></tr>';
        return;
    }

    tbody.innerHTML = prices.map(p => `
        <tr>
            <td><strong>${p.name}</strong><br><small>${p.description || ''}</small></td>
            <td>${p.price} грн</td>
            <td><span class="badge badge-info">${translateType(p.category)}</span></td>
            <td>
                ${isAdmin ? `
                    <button class="btn-icon" onclick="editPrice(${p.id})"><i class="fas fa-edit"></i></button>
                    <button class="btn-icon btn-danger" onclick="deletePrice(${p.id})"><i class="fas fa-trash"></i></button>
                ` : '-'}
            </td>
        </tr>
    `).join('');
}

function translateType(type) {
    const types = {
        'subscription': 'Абонемент',
        'single': 'Разове',
        'individual': 'Індивідуальне',
        'other': 'Інше'
    };
    return types[type] || type;
}

function openAddPriceModal() {
    document.getElementById('modalTitle').textContent = 'Додати послугу';
    document.getElementById('priceForm').reset();
    document.getElementById('priceId').value = '';
    document.getElementById('priceModal').classList.add('show');
}

function closePriceModal() {
    document.getElementById('priceModal').classList.remove('show');
}

async function editPrice(id) {
    const price = allPrices.find(p => p.id === id);
    if (!price) return;

    document.getElementById('modalTitle').textContent = 'Редагувати послугу';
    document.getElementById('priceId').value = price.id;
    document.getElementById('priceName').value = price.name;
    document.getElementById('priceValue').value = price.price;
    document.getElementById('priceType').value = price.category || 'subscription';
    document.getElementById('priceDescription').value = price.description || '';

    document.getElementById('priceModal').classList.add('show');
}

document.getElementById('priceForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const id = document.getElementById('priceId').value;
    const data = {
        name: document.getElementById('priceName').value,
        price: parseFloat(document.getElementById('priceValue').value),
        category: document.getElementById('priceType').value,
        description: document.getElementById('priceDescription').value
    };

    try {
        if (id) await pricesAPI.update(id, data);
        else await pricesAPI.create(data);
        
        closePriceModal();
        await loadPrices();
        showNotification('Дані збережено', 'success');
    } catch (error) {
        console.error('Error saving price:', error);
        showNotification('Помилка збереження: ' + (error.message || ''), 'error');
    }
});

async function deletePrice(id) {
    if (!confirm('Видалити цю послугу з каталогу?')) return;
    try {
        await pricesAPI.delete(id);
        await loadPrices();
        showNotification('Послугу видалено', 'success');
    } catch (error) { 
        console.error('Error deleting price:', error);
        showNotification('Помилка видалення', 'error'); 
    }
}