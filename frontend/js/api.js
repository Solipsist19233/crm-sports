// API Helper Functions

// Перевірка доступності localStorage (для Safari Private Mode)
function isLocalStorageAvailable() {
    try {
        const test = '__storage_test__';
        localStorage.setItem(test, test);
        localStorage.removeItem(test);
        return true;
    } catch (e) {
        return false;
    }
}

// Get token from localStorage
function getToken() {
    return localStorage.getItem(TOKEN_KEY);
}

// Set token to localStorage
function setTokens(accessToken, refreshToken) {
    localStorage.setItem(TOKEN_KEY, accessToken);
    localStorage.setItem(REFRESH_TOKEN_KEY, refreshToken);
}

// Remove token from localStorage
function removeToken() {
    try {
        localStorage.removeItem(TOKEN_KEY);
        localStorage.removeItem(REFRESH_TOKEN_KEY);
        localStorage.removeItem(USER_KEY);
    } catch (e) {
        console.error('Error clearing localStorage:', e);
    }
}

// Get user from localStorage
function getUser() {
    const user = localStorage.getItem(USER_KEY);
    return user ? JSON.parse(user) : null;
}

// Set user to localStorage
function setUser(user) {
    localStorage.setItem(USER_KEY, JSON.stringify(user));
}

// Check if user is authenticated
function isAuthenticated() {
    return !!getToken();
}

// Redirect to login if not authenticated
function requireAuth() {
    if (!isAuthenticated()) {
        window.location.href = 'login.html';
    }
}

// Оновлення токена доступу
async function refreshAccessToken() {
    const refreshToken = localStorage.getItem(REFRESH_TOKEN_KEY);
    if (!refreshToken) throw new Error('Відсутній токен оновлення');

    try {
        if (!isLocalStorageAvailable()) {
            throw new Error('LocalStorage недоступний (можливо, приватний режим Safari)');
        }

        const baseUrl = API_BASE_URL || window.location.origin;
        let url = `${baseUrl.replace(/\/+$/, '')}/api/auth/refresh`;
        if (!url.includes('localhost') && !url.includes('127.0.0.1')) {
            url = url.replace('http://', 'https://');
        }

        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ refresh_token: refreshToken })
        });

        if (!response.ok) throw new Error('Не вдалося оновити токен');

        const data = await response.json();
        setTokens(data.access_token, data.refresh_token);
        console.log('Токен успішно оновлено');
        return data.access_token;
    } catch (error) {
        console.error('Помилка оновлення сесії:', error);
        showNotification('Сесія закінчилася. Будь ласка, увійдіть знову.', 'error');
        removeToken();
        window.location.href = 'login.html';
        throw error;
    }
}

// API Request wrapper
async function apiRequest(endpoint, options = {}) {
    const token = getToken();

    const headers = {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-cache',
        'Pragma': 'no-cache',
        ...options.headers
    };

    if (token) {
        if (!isLocalStorageAvailable()) {
            showNotification('LocalStorage недоступний. Будь ласка, вимкніть приватний режим.', 'error');
            throw new Error('LocalStorage недоступний');
        }
        headers['Authorization'] = `Bearer ${token}`;
    }

    // Формуємо фінальний абсолютний URL
    const baseUrl = (API_BASE_URL || window.location.origin).replace(/\/+$/, '');
    // НЕ видаляємо слеш автоматично, Safari потребує точного збігу
    let url = endpoint.startsWith('http') ? endpoint : `${baseUrl}/${endpoint.replace(/^\/+/, '')}`;

    // Примусово використовуємо HTTPS для продуктиву (Safari 307 fix)
    if (!url.includes('localhost') && !url.includes('127.0.0.1')) {
        url = url.replace('http://', 'https://');
    }

    try {
        console.log(`API Request: ${options.method || 'GET'} ${url} (Endpoint: ${endpoint})`);
        const response = await fetch(url, {
            ...options,
            headers
        });

        // Якщо 401 і це НЕ запит на авторизацію/оновлення
        if (response.status === 401 && !options._retry && !endpoint.includes('/auth')) {
            options._retry = true;
            try {
                const newAccessToken = await refreshAccessToken();
                const retryHeaders = {
                    ...headers,
                    'Authorization': `Bearer ${newAccessToken}`
                };
                return await apiRequest(endpoint, { ...options, headers: retryHeaders });
            } catch (refreshError) {
                return;
            }
        }

        // Якщо 204 No Content - не парсимо JSON
        if (response.status === 204) {
            return null;
        }

        // Безпечний парсинг JSON
        let data;
        const contentType = response.headers.get("content-type");
        try {
            if (contentType && contentType.includes("application/json")) {
                data = await response.json();
            } else {
                data = { detail: await response.text() || response.statusText };
            }
        } catch (e) { data = { detail: "Помилка обробки відповіді сервера" }; }

        if (!response.ok) {
            console.error(`Деталі помилки API (${response.status}):`, data);
            const errorMsg = typeof data.detail === 'object' ? JSON.stringify(data.detail) : data.detail;
            const error = new Error(errorMsg || 'Запит відхилено сервером');
            error.status = response.status;
            throw error;
        }

        return data;
    } catch (error) {
        console.error('API Error:', error);
        throw error;
    }
}

// Auth API
const authAPI = {
    async login(username, password) {
        const data = await apiRequest('/api/auth/login', {
            method: 'POST',
            body: JSON.stringify({ username, password })
        });
        setTokens(data.access_token, data.refresh_token);
        return data;
    },

    async getMe() {
        const user = await apiRequest('/api/auth/me');
        setUser(user);
        return user;
    },

    logout() {
        removeToken();
        window.location.href = 'login.html';
    }
};

// Students API
const studentsAPI = {
    async getAll(params = {}) {
        const searchParams = new URLSearchParams(params).toString();
        const endpoint = searchParams ? `/api/students?${searchParams}` : '/api/students';
        return await apiRequest(endpoint);
    },

    async getById(id) {
        return await apiRequest(`/api/students/${id}`);
    },

    async create(student) {
        return await apiRequest('/api/students', {
            method: 'POST',
            body: JSON.stringify(student)
        });
    },

    async update(id, student) {
        return await apiRequest(`/api/students/${id}`, {
            method: 'PUT',
            body: JSON.stringify(student)
        });
    },

    async delete(id) {
        return await apiRequest(`/api/students/${id}`, {
            method: 'DELETE'
        });
    }
};

// Attendance API
const attendanceAPI = {
    async getAll(params = {}) {
        const searchParams = new URLSearchParams(params).toString();
        // Backend (attendance.py) uses @router.get("/") -> needs trailing slash
        const endpoint = searchParams ? `/api/attendance/?${searchParams}` : '/api/attendance/';
        return await apiRequest(endpoint);
    },

    async getByDate(date) {
        return await apiRequest(`/api/attendance/date/${date}`);
    },

    async getByStudent(studentId) {
        return await apiRequest(`/api/attendance/student/${studentId}`);
    },

    async mark(attendance) {
        // Backend (attendance.py) uses @router.post("/") -> needs trailing slash
        return await apiRequest('/api/attendance/', {
            method: 'POST',
            body: JSON.stringify(attendance)
        });
    },

    async update(id, attendance) {
        return await apiRequest(`/api/attendance/${id}`, {
            method: 'PUT',
            body: JSON.stringify(attendance)
        });
    },

    async delete(id) {
        return await apiRequest(`/api/attendance/${id}`, {
            method: 'DELETE'
        });
    },
    async finalize(data) {
        return await apiRequest('/api/attendance/finalize', {
            method: 'POST',
            body: JSON.stringify(data)
        });
    },
    async getHistory(params = {}) {
        const searchParams = new URLSearchParams(params).toString();
        const endpoint = searchParams ? `/api/attendance/history?${searchParams}` : '/api/attendance/history';
        return await apiRequest(endpoint);
    },
    async updateHistoryEntry(id, data) {
        return await apiRequest(`/api/attendance/history/${id}`, {
            method: 'PUT',
            body: JSON.stringify(data)
        });
    },
    async cleanupHistory(dateBefore) {
        return await apiRequest(`/api/attendance/history/cleanup?before=${dateBefore}`, {
            method: 'DELETE'
        });
    }
};

// Price List API (Крок 2: Каталог послуг)
const pricesAPI = {
    async getAll() {
        return await apiRequest('/api/prices');
    },
    async create(priceData) {
        return await apiRequest('/api/prices', {
            method: 'POST',
            body: JSON.stringify(priceData)
        });
    },
    async update(id, priceData) {
        return await apiRequest(`/api/prices/${id}`, { // Already correct
            method: 'PUT',
            body: JSON.stringify(priceData)
        });
    },
    async delete(id) {
        return await apiRequest(`/api/prices/${id}`, { // Already correct
            method: 'DELETE'
        });
    }
};

// Payments API
const paymentsAPI = {
    async getAll(params = {}) {
        const searchParams = new URLSearchParams(params).toString();
        const endpoint = searchParams ? `/api/payments?${searchParams}` : '/api/payments';
        return await apiRequest(endpoint);
    },

    async getOverdue() {
        return await apiRequest('/api/payments/overdue');
    },

    async getByStudent(studentId) {
        return await apiRequest(`/api/payments/student/${studentId}`);
    },

    async create(payment) {
        return await apiRequest('/api/payments', {
            method: 'POST',
            body: JSON.stringify(payment)
        });
    },

    async update(id, payment) {
        return await apiRequest(`/api/payments/${id}`, {
            method: 'PUT',
            body: JSON.stringify(payment)
        });
    },

    async delete(id) {
        return await apiRequest(`/api/payments/${id}`, {
            method: 'DELETE'
        });
    }
};

// Assignments API (Крок 4: Конструктор призначень)
const assignmentsAPI = {
    async getAll(params = {}) {
        const searchParams = new URLSearchParams(params).toString();
        return await apiRequest(searchParams ? `/api/assignments?${searchParams}` : '/api/assignments');
    },
    async getByTrainer(trainerId) {
        return await apiRequest(`/api/assignments/trainer/${trainerId}`);
    },
    async create(data) {
        return await apiRequest('/api/assignments', {
            method: 'POST',
            body: JSON.stringify(data)
        });
    },
    async update(id, data) {
        return await apiRequest(`/api/assignments/${id}`, {
            method: 'PUT',
            body: JSON.stringify(data)
        });
    },
    async delete(id) {
        return await apiRequest(`/api/assignments/${id}`, {
            method: 'DELETE'
        });
    },
    async cleanup(dateBefore) {
        return await apiRequest(`/api/assignments?before=${dateBefore}`, {
            method: 'DELETE'
        });
    }
};

// Subscriptions API (Крок 6: Абонементи)
const subscriptionsAPI = {
    async getByStudent(studentId) {
        return await apiRequest(`/api/subscriptions/student/${studentId}`);
    },
    async buy(data) {
        return await apiRequest('/api/subscriptions', {
            method: 'POST',
            body: JSON.stringify(data)
        });
    }
};

// Stats API
const statsAPI = {
    async getDashboard() {
        return await apiRequest('/api/stats/dashboard');
    },

    async getAttendance(limit = 50) {
        return await apiRequest(`/api/stats/attendance?limit=${limit}`);
    }
};

// Groups API
const groupsAPI = {
    async getAll(params = {}) {
        const searchParams = new URLSearchParams(params).toString();
        const endpoint = searchParams ? `/api/groups?${searchParams}` : '/api/groups';
        return await apiRequest(endpoint);
    },

    async getById(id) {
        return await apiRequest(`/api/groups/${id}`);
    },

    async create(group) {
        return await apiRequest('/api/groups', {
            method: 'POST',
            body: JSON.stringify(group)
        });
    },

    async update(id, group) {
        return await apiRequest(`/api/groups/${id}`, {
            method: 'PUT',
            body: JSON.stringify(group)
        });
    },

    async delete(id) {
        return await apiRequest(`/api/groups/${id}`, {
            method: 'DELETE'
        });
    }
};

// Trainers API
const trainersAPI = {
    async getAll(params = {}) {
        const searchParams = new URLSearchParams(params).toString();
        const endpoint = searchParams ? `/api/trainers/?${searchParams}` : '/api/trainers/';
        return await apiRequest(endpoint);
    },

    async getById(id) {
        return await apiRequest(`/api/trainers/${id}`);
    }
};

// Utility Functions
// Show users menu for admin
function showAdminMenu() {
    const user = getUser();
    if (!user) return;

    // Історія має бути видима ВСІМ (і адмінам, і тренерам)
    const historyLink = document.getElementById('historyLink');
    if (historyLink) historyLink.style.display = 'flex';

    // Список ID посилань, які мають бачити тільки адміни
    const adminLinks = ['usersLink', 'assignmentsLink', 'pricesLink'];
    
    if (user.role !== 'admin') return;

    adminLinks.forEach(id => {
        const link = document.getElementById(id);
        if (link) {
            link.style.setProperty('display', 'flex', 'important');
        }
    });
}

// Call this on page load
document.addEventListener('DOMContentLoaded', function() {
    showAdminMenu();
    // Додаткова перевірка через 100мс для гарантії відображення на всіх сторінках
    setTimeout(showAdminMenu, 100);
});
