document.addEventListener('DOMContentLoaded', async () => {
    try {
        requireAuth();
        loadUserInfo();
        setupMobileMenu();

        await loadDashboardData();
        await loadAttendanceStats();
    } catch (err) {
        console.error('Помилка завантаження дашборду:', err);
    }
});

async function loadDashboardData() {
    try {
        // Отримуємо загальну статистику з бекенду
        const stats = await statsAPI.getDashboard();
        
        // Заповнюємо картки
        document.getElementById('totalStudents').textContent = stats.total_students || 0;
        document.getElementById('activeStudents').textContent = stats.active_students || 0;
        document.getElementById('todayAttendance').textContent = stats.today_attendance || 0;

        // ВИКЛИК АПІ ДЛЯ БОРГІВ: Отримуємо кількість неоплачених занять з історії
        const debts = await attendanceAPI.getHistory({ is_paid: false });
        const debtCount = Array.isArray(debts) ? debts.length : 0;
        
        const debtsEl = document.getElementById('totalDebts');
        if (debtsEl) {
            debtsEl.textContent = debtCount;
            // Якщо є борги — робимо цифру червоною
            if (debtCount > 0) debtsEl.style.color = 'var(--danger-color)';
        }

        // Сповіщення про абонементи та страховки
        if (stats.expiring_subscriptions > 0) {
            document.getElementById('expiringSubscriptions').style.display = 'flex';
            document.getElementById('expiringSubs').textContent = stats.expiring_subscriptions;
        }
        if (stats.expiring_insurance > 0) {
            document.getElementById('expiringInsurance').style.display = 'flex';
            document.getElementById('expiringIns').textContent = stats.expiring_insurance;
        }
    } catch (error) {
        console.error('Помилка статистики:', error);
    }
}

async function loadAttendanceStats() {
    const tbody = document.getElementById('attendanceStatsTable');
    try {
        const stats = await statsAPI.getAttendance(10);
        if (!stats || stats.length === 0) {
            tbody.innerHTML = '<tr><td colspan="6" class="text-center">Немає даних для статистики</td></tr>';
            return;
        }

        tbody.innerHTML = stats.map(s => `
            <tr>
                <td><strong>${s.first_name} ${s.last_name}</strong></td>
                <td class="text-success">${s.total_present}</td>
                <td class="text-danger">${s.total_absent}</td>
                <td class="text-warning">${s.total_sick}</td>
                <td>${s.total_classes}</td>
                <td><div class="badge badge-info">${s.attendance_rate}%</div></td>
            </tr>
        `).join('');
    } catch (error) {
        console.error('Помилка завантаження статистики:', error);
        tbody.innerHTML = '<tr><td colspan="6" class="text-center text-danger">Помилка завантаження</td></tr>';
    }
}