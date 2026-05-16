let currentUser = null;
let editingTestId = null;
let currentGroupId = null;
let currentModalGroupId = null;
let darkMode = false;

document.addEventListener('DOMContentLoaded', () => {
    checkAuth();
    loadTests();
    document.getElementById('sendCodeBtn')?.addEventListener('click', sendCode);
    document.getElementById('verifyBtn')?.addEventListener('click', verifyCode);
    document.getElementById('loginForm')?.addEventListener('click', login);
    document.getElementById('createGroupBtn')?.addEventListener('click', showCreateGroupForm);
    addThemeToggle();
    const savedTheme = localStorage.getItem('theme');
    if (savedTheme === 'dark') {
        toggleTheme();
    }
});

function addThemeToggle() {
    const navMenu = document.querySelector('.nav-menu');
    const toggleBtn = document.createElement('a');
    toggleBtn.href = '#';
    toggleBtn.innerHTML = '🌓 Тема';
    toggleBtn.onclick = (e) => {
        e.preventDefault();
        toggleTheme();
    };
    navMenu.appendChild(toggleBtn);
}

function toggleTheme() {
    darkMode = !darkMode;
    if (darkMode) {
        document.body.classList.add('dark-theme');
        localStorage.setItem('theme', 'dark');
    } else {
        document.body.classList.remove('dark-theme');
        localStorage.setItem('theme', 'light');
    }
}

async function checkAuth() {
    const token = localStorage.getItem('token');
    if (token) {
        try {
            const payload = JSON.parse(atob(token.split('.')[1]));
            currentUser = { id: payload.user_id, role: payload.role, full_name: 'Пользователь' };
        } catch(e) { 
            localStorage.removeItem('token'); 
        }
    }
    updateUI();
}

function updateUI() {
    const guestLinks = document.getElementById('guestLinks');
    const userLinks = document.getElementById('userLinks');
    const userName = document.getElementById('userName');
    const teacherLink = document.getElementById('teacherLink');
    const myTestsLink = document.getElementById('myTestsLink');
    
    if (currentUser) {
        if (guestLinks) guestLinks.style.display = 'none';
        if (userLinks) userLinks.style.display = 'flex';
        if (userName) userName.innerHTML = '👤 ' + (currentUser.full_name || 'Пользователь');
        if (teacherLink) teacherLink.style.display = currentUser.role === 'teacher' ? 'inline' : 'none';
        if (myTestsLink) myTestsLink.style.display = currentUser.role === 'teacher' ? 'inline' : 'none';
        if (currentUser.role === 'teacher') checkPendingRequests();
    } else {
        if (guestLinks) guestLinks.style.display = 'flex';
        if (userLinks) userLinks.style.display = 'none';
    }
}

async function checkPendingRequests() {
    const token = localStorage.getItem('token');
    const res = await fetch('/api/my-groups', { headers: { 'Authorization': 'Bearer ' + token } });
    const groups = await res.json();
    
    let totalPending = 0;
    for (let g of groups) {
        const reqRes = await fetch(`/api/group-requests/${g.id}`, { headers: { 'Authorization': 'Bearer ' + token } });
        const reqs = await reqRes.json();
        totalPending += reqs.length;
    }
    
    const groupsLink = document.getElementById('groupsLink');
    if (groupsLink) {
        if (totalPending > 0) {
            groupsLink.innerHTML = `👥 Мои группы <span style="background:#f56565;color:white;border-radius:50%;padding:2px 8px;font-size:12px;margin-left:5px;font-weight:700;">${totalPending}</span>`;
        } else {
            groupsLink.innerHTML = '👥 Мои группы';
        }
    }
}

function showPage(pageName) {
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    const page = document.getElementById(pageName + 'Page');
    if (page) page.classList.add('active');
    
    if (pageName === 'home') loadTests();
    if (pageName === 'groups') loadGroupsPage();
    if (pageName === 'myTests' && currentUser?.role === 'teacher') loadMyTests();
    if (pageName === 'teacher' && currentUser?.role === 'teacher') loadTeacherStats();
    
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

function showAlert(message, type) {
    const alertDiv = document.createElement('div');
    alertDiv.className = `alert alert-${type}`;
    alertDiv.textContent = message;
    document.body.appendChild(alertDiv);
    setTimeout(() => alertDiv.remove(), 3500);
}

function logout() {
    if (confirm('Вы уверены, что хотите выйти?')) {
        localStorage.removeItem('token');
        currentUser = null;
        updateUI();
        showPage('home');
        showAlert('Вы вышли из системы', 'info');
    }
}

async function sendCode() {
    const email = document.getElementById('regEmail').value.trim();
    if (!email) return showAlert('Введите email', 'error');
    
    const res = await fetch('/api/send-code', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email })
    });
    const data = await res.json();
    
    if (data.success) {
        showAlert('Код отправлен на почту!', 'success');
        document.getElementById('step1').style.display = 'none';
        document.getElementById('step2').style.display = 'block';
    } else {
        showAlert(data.error, 'error');
    }
}

async function verifyCode() {
    const email = document.getElementById('regEmail').value.trim();
    const code = document.getElementById('regCode').value.trim();
    const full_name = document.getElementById('regFullName').value.trim();
    const username = document.getElementById('regUsername').value.trim();
    const password = document.getElementById('regPassword').value;
    const role = document.getElementById('regRole').value;
    
    if (!code || !full_name || !username || !password) {
        showAlert('Заполните все поля', 'error');
        return;
    }
    
    const res = await fetch('/api/verify-code', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, code, full_name, username, password, role })
    });
    const data = await res.json();
    
    if (data.success) {
        localStorage.setItem('token', data.token);
        currentUser = data.user;
        updateUI();
        showAlert('Регистрация успешна! Добро пожаловать!', 'success');
        document.getElementById('step1').style.display = 'block';
        document.getElementById('step2').style.display = 'none';
        showPage('home');
        loadTests();
    } else {
        showAlert(data.error, 'error');
    }
}

async function login(e) {
    e.preventDefault();
    const email = document.getElementById('loginEmail').value.trim();
    const password = document.getElementById('loginPassword').value;
    
    const res = await fetch('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password })
    });
    const data = await res.json();
    
    if (data.success) {
        localStorage.setItem('token', data.token);
        currentUser = data.user;
        updateUI();
        showAlert('Добро пожаловать, ' + data.user.full_name + '!', 'success');
        showPage('home');
        loadTests();
    } else {
        showAlert(data.error, 'error');
    }
}

async function loadGroupsPage() {
    if (currentUser?.role === 'student') {
        document.getElementById('studentGroupsView').style.display = 'block';
        document.getElementById('teacherGroupsView').style.display = 'none';
        await loadMyGroups();
        await loadAvailableGroupsWithPending();
    } else if (currentUser?.role === 'teacher') {
        document.getElementById('studentGroupsView').style.display = 'none';
        document.getElementById('teacherGroupsView').style.display = 'block';
        document.getElementById('teacherGroupsHeader').style.display = 'block';
        document.getElementById('groupDetailsContainer').style.display = 'none';
        await loadTeacherGroups();
    }
}

async function loadMyGroups() {
    const token = localStorage.getItem('token');
    const res = await fetch('/api/my-groups', { 
        headers: { 'Authorization': 'Bearer ' + token } 
    });
    const groups = await res.json();
    const container = document.getElementById('myGroupsList');
    
    if (groups.length === 0) {
        container.innerHTML = '<p style="text-align:center; color:#888; padding:40px;">Вы не состоите ни в одной группе</p>';
    } else {
        container.innerHTML = groups.map(g => `
            <div class="group-card">
                <h3>${escapeHtml(g.name)}</h3>
                <p>${escapeHtml(g.description || 'Нет описания')}</p>
            </div>
        `).join('');
    }
}

let pendingRequests = [];

async function requestJoinGroup(groupId) {
    const token = localStorage.getItem('token');
    const res = await fetch('/api/join-request', {
        method: 'POST',
        headers: { 
            'Content-Type': 'application/json', 
            'Authorization': 'Bearer ' + token 
        },
        body: JSON.stringify({ group_id: groupId })
    });
    const data = await res.json();
    
    if (data.success) {
        showAlert('Заявка отправлена! Ожидайте подтверждения.', 'success');
        if (!pendingRequests.includes(groupId)) {
            pendingRequests.push(groupId);
        }
        loadAvailableGroupsWithPending();
    } else {
        showAlert(data.error, 'error');
    }
}

async function loadAvailableGroupsWithPending() {
    const token = localStorage.getItem('token');
    const res = await fetch('/api/available-groups', { 
        headers: { 'Authorization': 'Bearer ' + token } 
    });
    const groups = await res.json();
    const container = document.getElementById('availableGroupsList');
    
    let html = '';
    
    groups.forEach(g => {
        if (pendingRequests.includes(g.id)) {
            html += `
                <div class="group-card" style="opacity:0.75; border:2px solid #48bb78;">
                    <h3>${escapeHtml(g.name)}</h3>
                    <p>${escapeHtml(g.description || 'Нет описания')}</p>
                    <p><small>👨‍🏫 Учитель: ${escapeHtml(g.teacher_name)}</small></p>
                    <p style="color:#48bb78; font-weight:600;">✅ Заявка подана</p>
                </div>
            `;
        } else {
            html += `
                <div class="group-card">
                    <h3>${escapeHtml(g.name)}</h3>
                    <p>${escapeHtml(g.description || 'Нет описания')}</p>
                    <p><small>👨‍🏫 Учитель: ${escapeHtml(g.teacher_name)}</small></p>
                    <button onclick="requestJoinGroup(${g.id})" class="btn-primary" style="width:auto;">📝 Подать заявку</button>
                </div>
            `;
        }
    });
    
    if (groups.length === 0 && pendingRequests.length === 0) {
        html = '<p style="text-align:center; color:#888; padding:40px;">Нет доступных групп</p>';
    }
    
    container.innerHTML = html;
}

function showCreateGroupForm() {
    const form = document.getElementById('createGroupForm');
    form.style.display = form.style.display === 'none' ? 'block' : 'none';
    document.getElementById('newGroupName').value = '';
    document.getElementById('newGroupDesc').value = '';
}

function hideCreateGroupForm() {
    document.getElementById('createGroupForm').style.display = 'none';
}

async function createGroup() {
    const name = document.getElementById('newGroupName').value.trim();
    const description = document.getElementById('newGroupDesc').value.trim();
    
    if (!name) {
        showAlert('Введите название группы', 'error');
        return;
    }
    
    const token = localStorage.getItem('token');
    const res = await fetch('/api/groups', {
        method: 'POST',
        headers: { 
            'Content-Type': 'application/json', 
            'Authorization': 'Bearer ' + token 
        },
        body: JSON.stringify({ name, description })
    });
    const data = await res.json();
    
    if (data.success) {
        showAlert('Группа успешно создана!', 'success');
        hideCreateGroupForm();
        await loadTeacherGroups();
        await loadMyTests();
    } else {
        showAlert(data.error, 'error');
    }
}

async function loadTeacherGroups() {
    const token = localStorage.getItem('token');
    const res = await fetch('/api/my-groups', { 
        headers: { 'Authorization': 'Bearer ' + token } 
    });
    const groups = await res.json();
    
    const container = document.getElementById('teacherGroupsList');
    
    if (!container) return;
    
    document.getElementById('createGroupForm').style.display = 'none';
    
    if (groups.length === 0) {
        container.innerHTML = '<p style="text-align:center; color:#888; padding:40px;">У вас пока нет групп. Создайте первую!</p>';
    } else {
        container.innerHTML = groups.map(g => `
            <div class="group-card">
                <h3>${escapeHtml(g.name)}</h3>
                <p>${escapeHtml(g.description || 'Нет описания')}</p>
                <small>📅 Создана: ${new Date(g.created_at).toLocaleDateString('ru-RU')}</small>
                <button style="margin-top:12px;" onclick="event.stopPropagation(); showGroupDetails(${g.id})" class="btn-primary" style="width:auto;">⚙️ Управлять</button>
            </div>
        `).join('');
    }
}

async function showGroupDetails(groupId) {
    currentGroupId = groupId;
    const token = localStorage.getItem('token');
    
    try {
        const [groupInfoRes, requestsRes, membersRes, testsRes] = await Promise.all([
            fetch('/api/my-groups', { headers: { 'Authorization': 'Bearer ' + token } }),
            fetch(`/api/group-requests/${groupId}`, { headers: { 'Authorization': 'Bearer ' + token } }),
            fetch(`/api/group-members/${groupId}`, { headers: { 'Authorization': 'Bearer ' + token } }),
            fetch(`/api/group-tests/${groupId}`, { headers: { 'Authorization': 'Bearer ' + token } })
        ]);
        
        const groups = await groupInfoRes.json();
        const group = groups.find(g => g.id === groupId);
        const requests = await requestsRes.json();
        const members = await membersRes.json();
        const tests = await testsRes.json();
        
        if (!group) {
            showAlert('Группа не найдена', 'error');
            return;
        }
        
        document.getElementById('teacherGroupsHeader').style.display = 'none';
        document.getElementById('groupDetailsContainer').style.display = 'block';
        
        const detailsContent = document.getElementById('groupDetailsContent');
        detailsContent.innerHTML = `
            <div style="display:flex; gap:10px; margin-bottom:25px; flex-wrap:wrap;">
                <button onclick="backToGroupsList()" class="btn-outline">← Назад к группам</button>
                <button onclick="openTestModal(${groupId})" class="btn-primary" style="width:auto;">➕ Создать тест</button>
            </div>
            <div class="form-card" style="margin-bottom:20px;">
                <h3>📁 ${escapeHtml(group.name)}</h3>
                <p>${escapeHtml(group.description || 'Нет описания')}</p>
            </div>
            <div class="form-card" style="margin-bottom:20px;">
                <h4>📋 Заявки на вступление (${requests.length})</h4>
                ${requests.length === 0 ? '<p style="color:#888;">Нет новых заявок</p>' : requests.map(r => `
                    <div class="member-list">
                        <div><strong>${escapeHtml(r.full_name)}</strong><br><small>${escapeHtml(r.email)}</small></div>
                        <div style="display:flex; gap:10px;">
                            <button onclick="handleRequest(${r.id}, 'approve')" style="background:#48bb78; color:white; padding:8px 16px; border:none; border-radius:8px; cursor:pointer;">✅ Принять</button>
                            <button onclick="handleRequest(${r.id}, 'reject')" class="btn-danger">❌ Отклонить</button>
                        </div>
                    </div>
                `).join('')}
            </div>
            <div class="form-card" style="margin-bottom:20px;">
                <h4>👥 Участники (${members.length})</h4>
                ${members.length === 0 ? '<p style="color:#888;">Нет участников</p>' : members.map(m => `
                    <div class="member-list">
                        <div><strong>${escapeHtml(m.full_name)}</strong><br><small>${escapeHtml(m.email)} | @${escapeHtml(m.username)}</small></div>
                        <button onclick="kickMember(${groupId}, ${m.id})" class="btn-danger">🚫 Исключить</button>
                    </div>
                `).join('')}
            </div>
            <div class="form-card">
                <h4>📝 Тесты группы (${tests.length})</h4>
                ${tests.length === 0 ? '<p style="color:#888;">Нет созданных тестов</p>' : `
                    <div class="tests-grid">
                        ${tests.map(t => `
                            <div class="test-card">
                                <h3>${escapeHtml(t.title)}</h3>
                                <p>${escapeHtml(t.description || '')}</p>
                                <div style="display: flex; gap: 8px; flex-wrap: wrap; margin-top: 12px;">
                                    <button onclick="openTestModalForEdit(${groupId}, ${t.id})" class="btn-secondary" style="width:auto;">✏️ Редактировать</button>
                                    <button onclick="showTestResults(${t.id}, '${escapeHtml(t.title).replace(/'/g, "\\'")}')" class="btn-primary" style="width:auto; background:#48bb78;">📊 Результаты</button>
                                    <button onclick="deleteTest(${t.id})" class="btn-danger" style="width:auto;">🗑️ Удалить</button>
                                </div>
                            </div>
                        `).join('')}
                    </div>
                `}
            </div>
        `;
    } catch (err) {
        showAlert('Ошибка загрузки данных группы', 'error');
    }
}

function backToGroupsList() {
    document.getElementById('teacherGroupsHeader').style.display = 'block';
    document.getElementById('groupDetailsContainer').style.display = 'none';
    loadTeacherGroups();
}

async function handleRequest(requestId, action) {
    const token = localStorage.getItem('token');
    const res = await fetch('/api/handle-request', {
        method: 'POST',
        headers: { 
            'Content-Type': 'application/json', 
            'Authorization': 'Bearer ' + token 
        },
        body: JSON.stringify({ request_id: requestId, action })
    });
    const data = await res.json();
    
    if (data.success) {
        showAlert(action === 'approve' ? 'Заявка одобрена!' : 'Заявка отклонена', 'success');
        showGroupDetails(currentGroupId);
        checkPendingRequests();
    } else {
        showAlert(data.error, 'error');
    }
}

async function kickMember(groupId, userId) {
    if (!confirm('Вы действительно хотите исключить этого ученика из группы?')) return;
    
    const token = localStorage.getItem('token');
    const res = await fetch('/api/kick-member', {
        method: 'POST',
        headers: { 
            'Content-Type': 'application/json', 
            'Authorization': 'Bearer ' + token 
        },
        body: JSON.stringify({ group_id: groupId, user_id: userId })
    });
    const data = await res.json();
    
    if (data.success) {
        showAlert('Ученик исключён из группы', 'success');
        showGroupDetails(groupId);
    } else {
        showAlert(data.error, 'error');
    }
}

async function showTestResults(testId, testTitle) {
    const token = localStorage.getItem('token');
    const res = await fetch(`/api/test-results/${testId}`, {
        headers: { 'Authorization': 'Bearer ' + token }
    });
    const data = await res.json();
    
    if (!res.ok) {
        showAlert(data.error || 'Ошибка загрузки результатов', 'error');
        return;
    }
    
    const modal = document.createElement('div');
    modal.className = 'modal-overlay';
    modal.innerHTML = `
        <div class="modal-content" style="max-width: 900px;">
            <span class="close-modal" onclick="this.closest('.modal-overlay').remove()">&times;</span>
            <h3>📊 Результаты теста: ${escapeHtml(testTitle)}</h3>
            <p style="margin-bottom: 20px; color: #666;">Группа: ${escapeHtml(data.group_name)}</p>
            <p><strong>✅ Выполнили: ${data.completed_count} из ${data.total_students} учеников</strong></p>
            <div style="margin-top: 20px; max-height: 500px; overflow-y: auto;">
                <table style="width: 100%; border-collapse: collapse;">
                    <thead>
                        <tr style="background: #f0f0f0;">
                            <th style="padding: 12px; text-align: left;">Ученик</th>
                            <th style="padding: 12px; text-align: center;">Статус</th>
                            <th style="padding: 12px; text-align: center;">Результат</th>
                            <th style="padding: 12px; text-align: center;">Проценты</th>
                            <th style="padding: 12px; text-align: center;">Дата</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${data.students.map(s => `
                            <tr style="border-bottom: 1px solid #eee;">
                                <td style="padding: 12px;">
                                    <strong>${escapeHtml(s.full_name)}</strong><br>
                                    <small style="color: #888;">@${escapeHtml(s.username)}</small>
                                 </td>
                                <td style="padding: 12px; text-align: center;">
                                    ${s.has_completed ? 
                                        '<span style="color: #48bb78;">✅ Выполнено</span>' : 
                                        '<span style="color: #f56565;">❌ Не выполнено</span>'
                                    }
                                 </td>
                                <td style="padding: 12px; text-align: center; font-weight: 600;">
                                    ${s.has_completed ? `${s.score} / ${s.total} баллов` : '-'}
                                 </td>
                                <td style="padding: 12px; text-align: center;">
                                    ${s.has_completed ? `
                                        <span style="background: ${s.percentage >= 70 ? '#48bb78' : (s.percentage >= 50 ? '#f6ad55' : '#f56565')}; 
                                               color: white; padding: 4px 12px; border-radius: 20px; font-weight: 600;">
                                            ${s.percentage}%
                                        </span>
                                    ` : '-'}
                                 </td>
                                <td style="padding: 12px; text-align: center; font-size: 12px;">
                                    ${s.completed_at ? new Date(s.completed_at).toLocaleString('ru-RU') : '-'}
                                 </td>
                             </tr>
                        `).join('')}
                    </tbody>
                 </table>
            </div>
            <div style="margin-top: 20px; display: flex; gap: 10px; justify-content: flex-end;">
                <button onclick="this.closest('.modal-overlay').remove()" class="btn-primary">Закрыть</button>
            </div>
        </div>
    `;
    document.body.appendChild(modal);
}

function openTestModal(groupId) {
    currentModalGroupId = groupId;
    editingTestId = null;
    document.getElementById('modalTestTitle').textContent = '📝 Новый тест';
    document.getElementById('modalTestTitleInput').value = '';
    document.getElementById('modalTestDesc').value = '';
    document.getElementById('modalQuestionsList').innerHTML = '';
    modalAddQuestion('choice');
    document.getElementById('testModal').style.display = 'block';
}

async function openTestModalForEdit(groupId, testId) {
    currentModalGroupId = groupId;
    editingTestId = testId;
    const token = localStorage.getItem('token');
    
    const res = await fetch('/api/tests/' + testId, { 
        headers: { 'Authorization': 'Bearer ' + token } 
    });
    const data = await res.json();
    
    document.getElementById('modalTestTitle').textContent = '✏️ Редактировать тест';
    document.getElementById('modalTestTitleInput').value = data.test.title;
    document.getElementById('modalTestDesc').value = data.test.description || '';
    document.getElementById('modalQuestionsList').innerHTML = '';
    
    data.questions.forEach((q, i) => {
        addQuestionCard(i + 1, q);
    });
    
    document.getElementById('testModal').style.display = 'block';
}

function closeTestModal() {
    document.getElementById('testModal').style.display = 'none';
}

function addQuestionCard(num, q = null) {
    const container = document.getElementById('modalQuestionsList');
    const qType = q ? q.question_type : 'choice';
    const div = document.createElement('div');
    div.className = 'question-card';
    div.setAttribute('data-type', qType);
    
    let typeSelector = `
        <select class="q-type-select" onchange="changeQuestionType(this)" style="margin-bottom:10px; padding:8px; border:2px solid #e8ecf1; border-radius:8px;">
            <option value="choice" ${qType === 'choice' ? 'selected' : ''}>📝 Выбор ответа</option>
            <option value="text" ${qType === 'text' ? 'selected' : ''}>✍️ Ввод текста</option>
            <option value="table" ${qType === 'table' ? 'selected' : ''}>📊 Заполнение таблицы</option>
        </select>
    `;
    
    let imageHtml = `
        <div class="image-upload-area" onclick="uploadImageForQuestion(this)">
            ${q && q.image_url ? `<img src="${q.image_url}" style="max-width:100%; max-height:200px; border-radius:10px;"><br>` : ''}
            📷 Нажмите, чтобы добавить изображение
            <input type="file" accept="image/*" style="display:none;" onchange="handleImageUpload(this, event)">
            <input type="hidden" class="q-image" value="${q ? q.image_url || '' : ''}">
        </div>
    `;
    
    let contentHtml = '';
    if (qType === 'choice') {
        contentHtml = `
            <div class="choice-fields">
                <input type="text" class="opt-a modal-input" placeholder="Вариант А" value="${q ? escapeHtml(q.option_a) : ''}">
                <input type="text" class="opt-b modal-input" placeholder="Вариант Б" value="${q ? escapeHtml(q.option_b) : ''}">
                <input type="text" class="opt-c modal-input" placeholder="Вариант В" value="${q ? escapeHtml(q.option_c) : ''}">
                <input type="text" class="opt-d modal-input" placeholder="Вариант Г" value="${q ? escapeHtml(q.option_d) : ''}">
                <select class="correct" style="margin:10px 0; padding:10px; border:2px solid #e8ecf1; border-radius:8px; width:100%;">
                    <option value="A" ${q && q.correct_answer === 'A' ? 'selected' : ''}>Правильный ответ: А</option>
                    <option value="B" ${q && q.correct_answer === 'B' ? 'selected' : ''}>Правильный ответ: Б</option>
                    <option value="C" ${q && q.correct_answer === 'C' ? 'selected' : ''}>Правильный ответ: В</option>
                    <option value="D" ${q && q.correct_answer === 'D' ? 'selected' : ''}>Правильный ответ: Г</option>
                </select>
            </div>
        `;
    } else if (qType === 'text') {
        contentHtml = `
            <div class="text-fields">
                <input type="text" class="correct-text modal-input" placeholder="Правильный ответ (текст)" value="${q ? escapeHtml(q.correct_answer_text || '') : ''}">
            </div>
        `;
    } else if (qType === 'table') {
        const cols = q ? (q.table_cols || 4) : 4;
        const colOptions = [2,3,4,5,6].map(c => `<option value="${c}" ${c == cols ? 'selected' : ''}>${c} столбца</option>`).join('');
        contentHtml = `
            <div class="table-fields">
                <div style="margin-bottom:10px;">
                    <label>Количество столбцов:</label>
                    <select class="table-cols" onchange="updateTableFields(this)" style="padding:8px; border:2px solid #e8ecf1; border-radius:8px;">
                        ${colOptions}
                    </select>
                </div>
                <div class="table-answers">
                    ${generateTableAnswerInputs(cols, q ? (q.correct_answer || '') : '')}
                </div>
            </div>
        `;
    }
    
    div.innerHTML = `
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:15px;">
            <h4>Вопрос ${num}</h4>
            <button onclick="this.closest('.question-card').remove()" class="btn-danger" style="padding:6px 12px;">🗑️</button>
        </div>
        ${typeSelector}
        <input type="text" class="q-text modal-input" placeholder="Текст вопроса" value="${q ? escapeHtml(q.question_text) : ''}">
        ${imageHtml}
        <div class="q-content">
            ${contentHtml}
        </div>
        <div style="margin-top:10px;">
            <label style="font-size:13px; color:#888;">Баллы: </label>
            <input type="number" class="q-points" value="${q ? q.points || 1 : 1}" min="1" max="100" style="width:70px; padding:6px; border:2px solid #e8ecf1; border-radius:6px;">
        </div>
    `;
    container.appendChild(div);
}

function generateTableAnswerInputs(cols, answerStr) {
    const answers = answerStr ? answerStr.split(',').map(s => s.trim()) : [];
    let inputs = '';
    const labels = ['А', 'Б', 'В', 'Г', 'Д', 'Е'];
    for (let i = 0; i < cols; i++) {
        inputs += `
            <div style="display:flex; align-items:center; gap:5px; margin:5px 0;">
                <span style="font-weight:600;">${labels[i]}=</span>
                <input type="text" class="table-answer modal-input" value="${answers[i] || ''}" style="width:100px;">
            </div>
        `;
    }
    return inputs;
}

function updateTableFields(selectEl) {
    const cols = parseInt(selectEl.value);
    const container = selectEl.closest('.table-fields').querySelector('.table-answers');
    container.innerHTML = generateTableAnswerInputs(cols, '');
}

function changeQuestionType(select) {
    const card = select.closest('.question-card');
    const type = select.value;
    const contentDiv = card.querySelector('.q-content');
    
    let html = '';
    if (type === 'choice') {
        html = `
            <div class="choice-fields">
                <input type="text" class="opt-a modal-input" placeholder="Вариант А">
                <input type="text" class="opt-b modal-input" placeholder="Вариант Б">
                <input type="text" class="opt-c modal-input" placeholder="Вариант В">
                <input type="text" class="opt-d modal-input" placeholder="Вариант Г">
                <select class="correct" style="margin:10px 0; padding:10px; border:2px solid #e8ecf1; border-radius:8px; width:100%;">
                    <option value="A">Правильный ответ: А</option>
                    <option value="B">Правильный ответ: Б</option>
                    <option value="C">Правильный ответ: В</option>
                    <option value="D">Правильный ответ: Г</option>
                </select>
            </div>
        `;
    } else if (type === 'text') {
        html = `
            <div class="text-fields">
                <input type="text" class="correct-text modal-input" placeholder="Правильный ответ (текст)">
            </div>
        `;
    } else if (type === 'table') {
        html = `
            <div class="table-fields">
                <div style="margin-bottom:10px;">
                    <label>Количество столбцов:</label>
                    <select class="table-cols" onchange="updateTableFields(this)" style="padding:8px; border:2px solid #e8ecf1; border-radius:8px;">
                        <option value="2">2 столбца</option>
                        <option value="3">3 столбца</option>
                        <option value="4" selected>4 столбца</option>
                        <option value="5">5 столбцов</option>
                        <option value="6">6 столбцов</option>
                    </select>
                </div>
                <div class="table-answers">
                    ${generateTableAnswerInputs(4, '')}
                </div>
            </div>
        `;
    }
    contentDiv.innerHTML = html;
    card.setAttribute('data-type', type);
}

function uploadImageForQuestion(area) {
    const input = area.querySelector('input[type="file"]');
    input.click();
}

async function handleImageUpload(input, event) {
    event.stopPropagation();
    const file = input.files[0];
    if (!file) return;
    
    const token = localStorage.getItem('token');
    const formData = new FormData();
    formData.append('image', file);
    
    const res = await fetch('/api/upload-image', {
        method: 'POST',
        headers: { 'Authorization': 'Bearer ' + token },
        body: formData
    });
    const data = await res.json();
    
    if (data.success) {
        const area = input.closest('.image-upload-area');
        const hiddenInput = area.querySelector('.q-image');
        hiddenInput.value = data.url;
        area.innerHTML = `
            <img src="${data.url}" style="max-width:100%; max-height:200px; border-radius:10px;"><br>
            📷 Нажмите, чтобы изменить изображение
            <input type="file" accept="image/*" style="display:none;" onchange="handleImageUpload(this, event)">
            <input type="hidden" class="q-image" value="${data.url}">
        `;
        area.onclick = function() { uploadImageForQuestion(this); };
    }
}

function modalAddQuestion(type = 'choice') {
    const container = document.getElementById('modalQuestionsList');
    const num = container.children.length + 1;
    
    const div = document.createElement('div');
    div.className = 'question-card';
    div.setAttribute('data-type', type);
    
    let contentHtml = '';
    if (type === 'choice') {
        contentHtml = `
            <div class="choice-fields">
                <input type="text" class="opt-a modal-input" placeholder="Вариант А">
                <input type="text" class="opt-b modal-input" placeholder="Вариант Б">
                <input type="text" class="opt-c modal-input" placeholder="Вариант В">
                <input type="text" class="opt-d modal-input" placeholder="Вариант Г">
                <select class="correct" style="margin:10px 0; padding:10px; border:2px solid #e8ecf1; border-radius:8px; width:100%;">
                    <option value="A">Правильный ответ: А</option>
                    <option value="B">Правильный ответ: Б</option>
                    <option value="C">Правильный ответ: В</option>
                    <option value="D">Правильный ответ: Г</option>
                </select>
            </div>
        `;
    } else if (type === 'text') {
        contentHtml = `
            <div class="text-fields">
                <input type="text" class="correct-text modal-input" placeholder="Правильный ответ (текст)">
            </div>
        `;
    } else if (type === 'table') {
        contentHtml = `
            <div class="table-fields">
                <div style="margin-bottom:10px;">
                    <label>Количество столбцов:</label>
                    <select class="table-cols" onchange="updateTableFields(this)" style="padding:8px; border:2px solid #e8ecf1; border-radius:8px;">
                        <option value="2">2 столбца</option>
                        <option value="3">3 столбца</option>
                        <option value="4" selected>4 столбца</option>
                        <option value="5">5 столбцов</option>
                        <option value="6">6 столбцов</option>
                    </select>
                </div>
                <div class="table-answers">
                    ${generateTableAnswerInputs(4, '')}
                </div>
            </div>
        `;
    }
    
    div.innerHTML = `
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:15px;">
            <h4>Вопрос ${num}</h4>
            <button onclick="this.closest('.question-card').remove()" class="btn-danger" style="padding:6px 12px;">🗑️</button>
        </div>
        <select class="q-type-select" onchange="changeQuestionType(this)" style="margin-bottom:10px; padding:8px; border:2px solid #e8ecf1; border-radius:8px;">
            <option value="choice" ${type === 'choice' ? 'selected' : ''}>📝 Выбор ответа</option>
            <option value="text" ${type === 'text' ? 'selected' : ''}>✍️ Ввод текста</option>
            <option value="table" ${type === 'table' ? 'selected' : ''}>📊 Заполнение таблицы</option>
        </select>
        <input type="text" class="q-text modal-input" placeholder="Текст вопроса">
        <div class="image-upload-area" onclick="uploadImageForQuestion(this)">
            📷 Нажмите, чтобы добавить изображение
            <input type="file" accept="image/*" style="display:none;" onchange="handleImageUpload(this, event)">
            <input type="hidden" class="q-image" value="">
        </div>
        <div class="q-content">
            ${contentHtml}
        </div>
        <div style="margin-top:10px;">
            <label style="font-size:13px; color:#888;">Баллы: </label>
            <input type="number" class="q-points" value="1" min="1" max="100" style="width:70px; padding:6px; border:2px solid #e8ecf1; border-radius:6px;">
        </div>
    `;
    container.appendChild(div);
    container.lastElementChild.scrollIntoView({ behavior: 'smooth' });
}

async function saveTestFromModal() {
    const title = document.getElementById('modalTestTitleInput').value.trim();
    const description = document.getElementById('modalTestDesc').value.trim();
    
    if (!title) {
        showAlert('Введите название теста', 'error');
        return;
    }
    
    const questions = [];
    const cards = document.querySelectorAll('#modalQuestionsList .question-card');
    
    for (let card of cards) {
        const type = card.getAttribute('data-type') || 'choice';
        const text = card.querySelector('.q-text').value.trim();
        const points = parseInt(card.querySelector('.q-points').value) || 1;
        const image_url = card.querySelector('.q-image').value;
        
        if (!text) {
            showAlert('Заполните текст всех вопросов', 'error');
            return;
        }
        
        let qData = { type, text, points, image_url };
        
        if (type === 'choice') {
            const a = card.querySelector('.opt-a').value.trim();
            const b = card.querySelector('.opt-b').value.trim();
            const c = card.querySelector('.opt-c').value.trim();
            const d = card.querySelector('.opt-d').value.trim();
            const correct = card.querySelector('.correct').value;
            if (!a || !b || !c || !d) {
                showAlert('Заполните все варианты ответов', 'error');
                return;
            }
            qData = { ...qData, a, b, c, d, correct };
        } else if (type === 'text') {
            const correct_text = card.querySelector('.correct-text').value.trim();
            if (!correct_text) {
                showAlert('Укажите правильный ответ для текстового вопроса', 'error');
                return;
            }
            qData = { ...qData, correct_text };
        } else if (type === 'table') {
            const colsSelect = card.querySelector('.table-cols');
            const table_cols = colsSelect ? parseInt(colsSelect.value) : 4;
            const answerInputs = card.querySelectorAll('.table-answer');
            const answers = Array.from(answerInputs).map(inp => inp.value.trim());
            if (answers.some(a => !a)) {
                showAlert('Заполните все правильные значения таблицы', 'error');
                return;
            }
            qData = { ...qData, table_cols, correct: answers.join(',') };
        }
        
        questions.push(qData);
    }
    
    if (questions.length === 0) {
        showAlert('Добавьте хотя бы один вопрос', 'error');
        return;
    }
    
    const token = localStorage.getItem('token');
    const url = editingTestId ? '/api/tests/' + editingTestId : '/api/tests';
    const method = editingTestId ? 'PUT' : 'POST';
    
    const res = await fetch(url, {
        method: method,
        headers: { 
            'Content-Type': 'application/json', 
            'Authorization': 'Bearer ' + token 
        },
        body: JSON.stringify({ 
            title, 
            description, 
            group_id: currentModalGroupId, 
            questions 
        })
    });
    
    const result = await res.json();
    
    if (result.success) {
        showAlert(editingTestId ? 'Тест обновлён!' : 'Тест создан!', 'success');
        closeTestModal();
        await showGroupDetails(currentModalGroupId);
        await loadMyTests();
    } else {
        showAlert(result.error, 'error');
    }
}

async function loadMyTests() {
    const token = localStorage.getItem('token');
    const res = await fetch('/api/tests', { 
        headers: { 'Authorization': 'Bearer ' + token } 
    });
    const tests = await res.json();
    const container = document.getElementById('myTestsList');
    
    if (tests.length === 0) {
        container.innerHTML = '<p style="text-align:center; color:#888; padding:40px;">У вас пока нет созданных тестов</p>';
    } else {
        container.innerHTML = '<div class="tests-grid">' + tests.map(t => `
            <div class="test-card">
                <h3>${escapeHtml(t.title)}</h3>
                <p>${escapeHtml(t.description || '')}</p>
                <p><small>📁 Группа: ${escapeHtml(t.group_name || '')}</small></p>
                <button onclick="openTestModalForEdit(${t.group_id}, ${t.id})" class="btn-secondary">✏️ Редактировать</button>
                <button onclick="deleteTest(${t.id})" class="btn-danger">🗑️ Удалить</button>
            </div>
        `).join('') + '</div>';
    }
}

async function deleteTest(testId) {
    if (!confirm('Вы уверены, что хотите удалить этот тест? Все результаты также будут удалены.')) return;
    
    const token = localStorage.getItem('token');
    const res = await fetch('/api/tests/' + testId, { 
        method: 'DELETE', 
        headers: { 'Authorization': 'Bearer ' + token } 
    });
    
    if (res.ok) {
        showAlert('Тест удалён', 'success');
        if (currentModalGroupId) {
            await showGroupDetails(currentModalGroupId);
        }
        await loadMyTests();
    }
}

async function loadTests() {
    const token = localStorage.getItem('token');
    const container = document.getElementById('testsList');
    
    if (!token) { 
        container.innerHTML = '<p style="text-align:center; color:#888; padding:40px;">🔐 Войдите в систему, чтобы увидеть доступные тесты</p>'; 
        return; 
    }
    
    if (currentUser?.role === 'teacher') { 
        container.innerHTML = '<p style="text-align:center; color:#888; padding:40px;">👨‍🏫 Вы учитель. Перейдите в раздел "Мои тесты" для управления.</p>'; 
        return; 
    }
    
    const res = await fetch('/api/tests', { 
        headers: { 'Authorization': 'Bearer ' + token } 
    });
    const tests = await res.json();
    
    if (tests.length === 0) {
        container.innerHTML = '<p style="text-align:center; color:#888; padding:40px;">📭 Нет доступных тестов. Вступите в группу, чтобы получить тесты.</p>';
    } else {
        container.innerHTML = tests.map(t => `
            <div class="test-card" onclick="startTest(${t.id})">
                <h3>📝 ${escapeHtml(t.title)}</h3>
                <p>${escapeHtml(t.description || 'Нет описания')}</p>
                <small>👨‍🏫 ${escapeHtml(t.teacher_name || 'Учитель')} | 📁 ${escapeHtml(t.group_name)}</small>
            </div>
        `).join('');
    }
}

async function startTest(testId) {
    if (currentUser?.role !== 'student') { 
        showAlert('Только ученики могут проходить тесты', 'error'); 
        return; 
    }
    
    const token = localStorage.getItem('token');
    
    const checkRes = await fetch(`/api/tests/${testId}/check`, { 
        headers: { 'Authorization': 'Bearer ' + token } 
    });
    const check = await checkRes.json();
    
    if (check.hasAttempted) {
        showAlert(`Вы уже проходили этот тест! Результат: ${check.score}/${check.total} (${check.percentage}%)`, 'info');
        return;
    }
    
    const res = await fetch(`/api/tests/${testId}`, { 
        headers: { 'Authorization': 'Bearer ' + token } 
    });
    const data = await res.json();
    
    const container = document.getElementById('testContent');
    let questionsHtml = '';
    
    data.questions.forEach((q, i) => {
        let answerHtml = '';
        
        if (q.question_type === 'choice') {
            answerHtml = `
                <div class="options">
                    <label><input type="radio" name="q${q.id}" value="A"> А) ${escapeHtml(q.option_a)}</label>
                    <label><input type="radio" name="q${q.id}" value="B"> Б) ${escapeHtml(q.option_b)}</label>
                    <label><input type="radio" name="q${q.id}" value="C"> В) ${escapeHtml(q.option_c)}</label>
                    <label><input type="radio" name="q${q.id}" value="D"> Г) ${escapeHtml(q.option_d)}</label>
                </div>
            `;
        } else if (q.question_type === 'text') {
            answerHtml = `
                <input type="text" class="table-input" name="q${q.id}" placeholder="Введите ваш ответ" style="max-width:400px;">
            `;
        } else if (q.question_type === 'table') {
            const cols = q.table_cols || 4;
            const labels = ['А', 'Б', 'В', 'Г', 'Д', 'Е'];
            let tableInputs = '<div style="display:grid; grid-template-columns: repeat(' + cols + ', 1fr); gap:10px; margin-top:10px;">';
            for (let j = 0; j < cols; j++) {
                tableInputs += `<div><strong>${labels[j]}</strong><input type="text" class="table-input table-cell" data-qid="${q.id}" data-col="${j}" placeholder="${labels[j]}" style="width:100%;"></div>`;
            }
            tableInputs += '</div>';
            answerHtml = tableInputs + '<p style="font-size:12px; color:#888; margin-top:5px;">Введите значения в каждую ячейку</p>';
        }
        
        questionsHtml += `
            <div class="question-card">
                <h4>${i+1}. ${escapeHtml(q.question_text)} ${q.points > 1 ? `<span style="color:#667eea;">(${q.points} баллов)</span>` : ''}</h4>
                ${q.image_url ? `<img src="${q.image_url}" style="max-width:100%; max-height:300px; border-radius:10px; margin:10px 0;">` : ''}
                ${answerHtml}
            </div>
        `;
    });
    
    container.innerHTML = `
        <h2>📝 ${escapeHtml(data.test.title)}</h2>
        <p style="color:#888;">${escapeHtml(data.test.description || '')}</p>
        <p style="color:#888; margin-bottom:25px;">📋 Количество вопросов: ${data.questions.length}</p>
        <div id="testForm">
            ${questionsHtml}
            <button id="submitTestBtn" style="width:100%; padding:18px; font-size:18px; font-weight:600; margin-top:20px;" class="btn-primary">📤 Отправить ответы</button>
        </div>
    `;
    
    document.getElementById('submitTestBtn').onclick = async () => {
        const answers = {};
        let allAnswered = true;
        
        data.questions.forEach(q => {
            if (q.question_type === 'choice') {
                const selected = document.querySelector(`input[name="q${q.id}"]:checked`);
                if (selected) {
                    answers[q.id] = selected.value;
                } else {
                    allAnswered = false;
                }
            } else if (q.question_type === 'table') {
                const cols = q.table_cols || 4;
                const inputs = document.querySelectorAll(`.table-cell[data-qid="${q.id}"]`);
                let values = [];
                inputs.forEach(inp => {
                    values.push(inp.value.trim());
                    if (!inp.value.trim()) allAnswered = false;
                });
                answers[q.id] = values.join(',');
            } else {
                const input = document.querySelector(`input[name="q${q.id}"]`);
                if (input && input.value.trim()) {
                    answers[q.id] = input.value.trim();
                } else {
                    allAnswered = false;
                }
            }
        });
        
        if (!allAnswered) { 
            showAlert('Пожалуйста, ответьте на все вопросы!', 'error'); 
            return; 
        }
        
        document.getElementById('submitTestBtn').disabled = true;
        document.getElementById('submitTestBtn').textContent = '⏳ Проверка...';
        
        const submitRes = await fetch(`/api/tests/${testId}/submit`, {
            method: 'POST',
            headers: { 
                'Content-Type': 'application/json', 
                'Authorization': 'Bearer ' + token 
            },
            body: JSON.stringify({ answers })
        });
        
        const result = await submitRes.json();
        showResultModal(result.score, result.total, result.percentage);
    };
    
    showPage('test');
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

function showResultModal(score, total, percentage) {
    const old = document.querySelector('.modal-overlay');
    if (old) old.remove();
    
    let colorClass, message, stars, emoji;
    if (percentage >= 90) { colorClass = 'result-excellent'; message = 'Великолепный результат!'; stars = '🌟🌟🌟🌟🌟'; emoji = '🏆'; }
    else if (percentage >= 70) { colorClass = 'result-excellent'; message = 'Хорошая работа!'; stars = '🌟🌟🌟🌟'; emoji = '👏'; }
    else if (percentage >= 50) { colorClass = 'result-good'; message = 'Неплохо, но можно лучше!'; stars = '🌟🌟🌟'; emoji = '📚'; }
    else if (percentage >= 30) { colorClass = 'result-bad'; message = 'Стоит повторить материал'; stars = '🌟🌟'; emoji = '💪'; }
    else { colorClass = 'result-bad'; message = 'Нужно больше практики!'; stars = '🌟'; emoji = '📖'; }
    
    const modal = document.createElement('div');
    modal.className = 'modal-overlay';
    modal.innerHTML = `
        <div class="modal-result ${colorClass}">
            <div style="font-size:60px">${emoji}</div>
            <div style="font-size:40px; margin:10px 0;">${stars}</div>
            <div class="result-score">${score} / ${total}</div>
            <div class="result-percentage">${percentage}%</div>
            <div style="margin:20px 0; font-size:22px; font-weight:600;">${message}</div>
            <button onclick="this.closest('.modal-overlay').remove(); loadTests(); showPage('home');" style="background:white; color:#333; padding:14px 35px; border:none; border-radius:12px; font-size:16px; font-weight:600; cursor:pointer;">🏠 Вернуться на главную</button>
        </div>
    `;
    document.body.appendChild(modal);
    
    if (percentage >= 70 && typeof confetti === 'function') {
        confetti({
            particleCount: 150,
            spread: 80,
            origin: { y: 0.6 }
        });
    }
}

async function loadTeacherStats() {
    const token = localStorage.getItem('token');
    const res = await fetch('/api/teacher-stats', { headers: { 'Authorization': 'Bearer ' + token } });
    const stats = await res.json();

    document.getElementById('statGroups').textContent = stats.groups_count || 0;
    document.getElementById('statTests').textContent = stats.tests_count || 0;
    document.getElementById('statStudents').textContent = stats.students_count || 0;
    document.getElementById('statCompleted').textContent = stats.completed_tests || 0;
    
    const avgScore = (stats.avg_score && typeof stats.avg_score === 'number') ? stats.avg_score : 0;
    document.getElementById('statAvg').textContent = avgScore + '%';
}

function escapeHtml(str) {
    if (!str) return '';
    return str.replace(/[&<>]/g, function(m) {
        if (m === '&') return '&amp;';
        if (m === '<') return '&lt;';
        if (m === '>') return '&gt;';
        return m;
    });
}
