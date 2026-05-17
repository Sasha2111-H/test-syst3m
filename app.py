from flask import Flask, render_template, request, jsonify
import sqlite3
import bcrypt
import jwt
import datetime
import random
import string
import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from functools import wraps
from datetime import datetime, timedelta
import os
import re
from werkzeug.utils import secure_filename

app = Flask(__name__)
app.secret_key = 'mysecretkey1234567890'

UPLOAD_FOLDER = 'static/uploads'
os.makedirs(UPLOAD_FOLDER, exist_ok=True)
app.config['UPLOAD_FOLDER'] = UPLOAD_FOLDER

EMAIL_ADDRESS = "tests1st3ma@gmail.com"
EMAIL_PASSWORD = "gmjpqudbjakwsuup"
SMTP_SERVER = "smtp.gmail.com"
SMTP_PORT = 465

def send_email(to_email, code):
    try:
        html = f"""
        <!DOCTYPE html>
        <html>
        <head><meta charset="UTF-8"></head>
        <body style="font-family: Arial; text-align: center; padding: 40px;">
            <h2>📚 Тест-Система</h2>
            <p>Ваш код подтверждения:</p>
            <h1 style="font-size: 48px; color: #667eea;">{code}</h1>
            <p>Введите этот код на сайте</p>
        </body>
        </html>
        """
        msg = MIMEMultipart()
        msg['From'] = EMAIL_ADDRESS
        msg['To'] = to_email
        msg['Subject'] = 'Код подтверждения'
        msg.attach(MIMEText(html, 'html'))
        server = smtplib.SMTP_SSL(SMTP_SERVER, SMTP_PORT)
        server.login(EMAIL_ADDRESS, EMAIL_PASSWORD)
        server.send_message(msg)
        server.quit()
        return True
    except Exception as e:
        print(f"Ошибка отправки email: {e}")
        return False

@app.after_request
def add_cors(response):
    response.headers.add('Access-Control-Allow-Origin', '*')
    response.headers.add('Access-Control-Allow-Headers', 'Content-Type,Authorization')
    response.headers.add('Access-Control-Allow-Methods', 'GET,PUT,POST,DELETE')
    return response

SECRET_KEY = 'jwt_secret_key_1234567890'
DATABASE = 'database.db'

def get_db():
    conn = sqlite3.connect(DATABASE)
    conn.row_factory = sqlite3.Row
    return conn

def init_db():
    with get_db() as conn:
        conn.execute('''CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT UNIQUE,
            email TEXT UNIQUE NOT NULL,
            password TEXT,
            full_name TEXT,
            role TEXT DEFAULT 'student',
            status TEXT DEFAULT 'pending',
            verification_code TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )''')
        conn.execute('''CREATE TABLE IF NOT EXISTS groups (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            description TEXT,
            teacher_id INTEGER NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )''')
        conn.execute('''CREATE TABLE IF NOT EXISTS group_members (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            group_id INTEGER NOT NULL,
            user_id INTEGER NOT NULL,
            role TEXT DEFAULT 'student',
            joined_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(group_id, user_id)
        )''')
        conn.execute('''CREATE TABLE IF NOT EXISTS join_requests (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            group_id INTEGER NOT NULL,
            user_id INTEGER NOT NULL,
            status TEXT DEFAULT 'pending',
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(group_id, user_id)
        )''')
        conn.execute('''CREATE TABLE IF NOT EXISTS tests (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            title TEXT NOT NULL,
            description TEXT,
            group_id INTEGER NOT NULL,
            teacher_id INTEGER NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )''')
        conn.execute('''CREATE TABLE IF NOT EXISTS questions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            test_id INTEGER NOT NULL,
            question_text TEXT NOT NULL,
            question_type TEXT DEFAULT 'choice',
            option_a TEXT,
            option_b TEXT,
            option_c TEXT,
            option_d TEXT,
            correct_answer TEXT,
            correct_answer_text TEXT,
            table_data TEXT,
            table_cols INTEGER DEFAULT 4,
            image_url TEXT,
            points INTEGER DEFAULT 1
        )''')
        try:
            conn.execute('ALTER TABLE questions ADD COLUMN table_cols INTEGER DEFAULT 4')
        except:
            pass
        conn.execute('''CREATE TABLE IF NOT EXISTS results (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            student_id INTEGER NOT NULL,
            test_id INTEGER NOT NULL,
            score REAL NOT NULL,
            total REAL NOT NULL,
            completed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(student_id, test_id)
        )''')
        conn.commit()
        print('База данных готова')

def token_required(f):
    @wraps(f)
    def decorated(*args, **kwargs):
        token = request.headers.get('Authorization')
        if not token:
            return jsonify({'error': 'Токен отсутствует'}), 401
        try:
            token = token.split(' ')[1]
            data = jwt.decode(token, SECRET_KEY, algorithms=['HS256'])
            request.user_id = data['user_id']
            request.user_role = data['role']
        except:
            return jsonify({'error': 'Неверный токен'}), 401
        return f(*args, **kwargs)
    return decorated

def teacher_only(f):
    @wraps(f)
    def decorated(*args, **kwargs):
        if request.user_role != 'teacher':
            return jsonify({'error': 'Доступ только для учителя'}), 403
        return f(*args, **kwargs)
    return decorated

def student_only(f):
    @wraps(f)
    def decorated(*args, **kwargs):
        if request.user_role != 'student':
            return jsonify({'error': 'Доступ только для учеников'}), 403
        return f(*args, **kwargs)
    return decorated

@app.route('/')
def home():
    return render_template('index.html')

@app.route('/api/upload-image', methods=['POST'])
@token_required
@teacher_only
def upload_image():
    if 'image' not in request.files:
        return jsonify({'error': 'Файл не найден'}), 400
    file = request.files['image']
    if file.filename == '':
        return jsonify({'error': 'Файл не выбран'}), 400
    if file:
        filename = str(random.randint(100000, 999999)) + '_' + secure_filename(file.filename)
        filepath = os.path.join(app.config['UPLOAD_FOLDER'], filename)
        file.save(filepath)
        return jsonify({'success': True, 'url': '/static/uploads/' + filename})

@app.route('/api/send-code', methods=['POST'])
def send_code():
    data = request.json
    email = data.get('email')
    if not email:
        return jsonify({'error': 'Email обязателен'}), 400
    if not re.match(r'^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$', email):
        return jsonify({'error': 'Неверный формат email'}), 400
    with get_db() as conn:
        existing = conn.execute('SELECT * FROM users WHERE email = ?', (email,)).fetchone()
        if existing and existing['status'] == 'approved':
            return jsonify({'error': 'Email уже зарегистрирован'}), 400
        code = ''.join(random.choices(string.digits, k=6))
        print(f'\nКОД ДЛЯ {email}: {code}\n')
        if existing:
            conn.execute('UPDATE users SET verification_code = ?, status = "pending", password = NULL WHERE email = ?', (code, email))
        else:
            conn.execute('INSERT INTO users (email, verification_code, status) VALUES (?, ?, ?)', (email, code, 'pending'))
        conn.commit()
        send_email(email, code)
        return jsonify({'success': True, 'message': 'Код отправлен'})

@app.route('/api/verify-code', methods=['POST'])
def verify_code():
    data = request.json
    email = data.get('email')
    code = data.get('code')
    full_name = data.get('full_name')
    username = data.get('username')
    password = data.get('password')
    role = data.get('role', 'student')
    
    print(f"Регистрация: email={email}, username={username}, role={role}")
    
    if not all([email, code, full_name, username, password]):
        return jsonify({'error': 'Заполните все поля'}), 400
    
    if len(password) < 6:
        return jsonify({'error': 'Пароль должен быть не менее 6 символов'}), 400
    
    with get_db() as conn:
        user = conn.execute('SELECT * FROM users WHERE email = ? AND verification_code = ? AND status = "pending"', (email, code)).fetchone()
        if not user:
            return jsonify({'error': 'Неверный код подтверждения'}), 400
        
        existing_username = conn.execute('SELECT * FROM users WHERE username = ? AND id != ?', (username, user['id'])).fetchone()
        if existing_username:
            return jsonify({'error': 'Этот логин уже занят'}), 400
        
        hashed_password = bcrypt.hashpw(password.encode('utf-8'), bcrypt.gensalt())
        print(f"Хеш пароля: {hashed_password}")
        
        conn.execute('''
            UPDATE users 
            SET full_name = ?, 
                username = ?, 
                password = ?, 
                role = ?, 
                status = 'approved', 
                verification_code = NULL 
            WHERE email = ?
        ''', (full_name, username, hashed_password, role, email))
        
        conn.commit()
        
        user_data = conn.execute('SELECT id, username, role, full_name FROM users WHERE email = ?', (email,)).fetchone()
        
        token = jwt.encode({
            'user_id': user_data['id'], 
            'role': user_data['role'], 
            'exp': datetime.now() + timedelta(days=1)
        }, SECRET_KEY, algorithm='HS256')
        
        return jsonify({
            'success': True, 
            'token': token, 
            'user': {
                'id': user_data['id'], 
                'username': user_data['username'], 
                'role': user_data['role'], 
                'full_name': full_name
            }
        })

@app.route('/api/login', methods=['POST'])
def login():
    data = request.json
    email = data.get('email')
    password = data.get('password')
    
    with get_db() as conn:
        user = conn.execute('SELECT * FROM users WHERE email = ?', (email,)).fetchone()
        if not user:
            return jsonify({'error': 'Пользователь не найден'}), 404
        
        if user['status'] != 'approved':
            return jsonify({'error': 'Аккаунт не подтверждён'}), 403
        
        if user['password'] is None:
            return jsonify({'error': 'Ошибка: пароль не установлен'}), 401
        
        try:
            password_valid = bcrypt.checkpw(password.encode('utf-8'), user['password'])
            if not password_valid:
                return jsonify({'error': 'Неверный пароль'}), 401
        except Exception as e:
            print(f"Ошибка при проверке пароля: {e}")
            return jsonify({'error': 'Ошибка проверки пароля'}), 500
        
        token = jwt.encode({
            'user_id': user['id'], 
            'role': user['role'], 
            'exp': datetime.now() + timedelta(days=1)
        }, SECRET_KEY, algorithm='HS256')
        
        return jsonify({
            'success': True, 
            'token': token, 
            'user': {
                'id': user['id'], 
                'username': user['username'], 
                'role': user['role'], 
                'full_name': user['full_name']
            }
        })

@app.route('/api/groups', methods=['POST'])
@token_required
@teacher_only
def create_group():
    data = request.json
    name = data.get('name')
    description = data.get('description')
    if not name:
        return jsonify({'error': 'Название обязательно'}), 400
    with get_db() as conn:
        cursor = conn.execute('INSERT INTO groups (name, description, teacher_id) VALUES (?, ?, ?)', (name, description, request.user_id))
        group_id = cursor.lastrowid
        conn.execute('INSERT INTO group_members (group_id, user_id, role) VALUES (?, ?, ?)', (group_id, request.user_id, 'teacher'))
        conn.commit()
        return jsonify({'success': True, 'group_id': group_id})

@app.route('/api/my-groups', methods=['GET'])
@token_required
def get_my_groups():
    with get_db() as conn:
        if request.user_role == 'teacher':
            groups = conn.execute('SELECT id, name, description, created_at FROM groups WHERE teacher_id = ? ORDER BY created_at DESC', (request.user_id,)).fetchall()
        else:
            groups = conn.execute('SELECT g.id, g.name, g.description, g.created_at FROM groups g JOIN group_members gm ON g.id = gm.group_id WHERE gm.user_id = ? AND gm.role = "student" ORDER BY g.created_at DESC', (request.user_id,)).fetchall()
        return jsonify([dict(g) for g in groups])

@app.route('/api/available-groups', methods=['GET'])
@token_required
@student_only
def available_groups():
    with get_db() as conn:
        groups = conn.execute('SELECT g.id, g.name, g.description, u.full_name as teacher_name FROM groups g JOIN users u ON g.teacher_id = u.id WHERE g.id NOT IN (SELECT group_id FROM group_members WHERE user_id = ? UNION SELECT group_id FROM join_requests WHERE user_id = ? AND status = "pending")', (request.user_id, request.user_id)).fetchall()
        return jsonify([dict(g) for g in groups])

@app.route('/api/join-request', methods=['POST'])
@token_required
@student_only
def request_join():
    data = request.json
    group_id = data.get('group_id')
    if not group_id:
        return jsonify({'error': 'Группа не указана'}), 400
    with get_db() as conn:
        existing = conn.execute('SELECT * FROM group_members WHERE group_id = ? AND user_id = ?', (group_id, request.user_id)).fetchone()
        if existing:
            return jsonify({'error': 'Вы уже в этой группе'}), 400
        pending = conn.execute('SELECT * FROM join_requests WHERE group_id = ? AND user_id = ? AND status = "pending"', (group_id, request.user_id)).fetchone()
        if pending:
            return jsonify({'error': 'Заявка уже отправлена'}), 400
        conn.execute('INSERT INTO join_requests (group_id, user_id, status) VALUES (?, ?, ?)', (group_id, request.user_id, 'pending'))
        conn.commit()
        return jsonify({'success': True, 'message': 'Заявка отправлена'})

@app.route('/api/group-requests/<int:group_id>', methods=['GET'])
@token_required
@teacher_only
def group_requests(group_id):
    with get_db() as conn:
        group = conn.execute('SELECT * FROM groups WHERE id = ? AND teacher_id = ?', (group_id, request.user_id)).fetchone()
        if not group:
            return jsonify({'error': 'Доступ запрещён'}), 403
        requests = conn.execute('SELECT jr.id, jr.user_id, u.full_name, u.username, u.email, jr.created_at FROM join_requests jr JOIN users u ON jr.user_id = u.id WHERE jr.group_id = ? AND jr.status = "pending" ORDER BY jr.created_at ASC', (group_id,)).fetchall()
        return jsonify([dict(r) for r in requests])

@app.route('/api/handle-request', methods=['POST'])
@token_required
@teacher_only
def handle_request():
    data = request.json
    request_id = data.get('request_id')
    action = data.get('action')
    if not request_id or action not in ['approve', 'reject']:
        return jsonify({'error': 'Некорректные данные'}), 400
    with get_db() as conn:
        req = conn.execute('SELECT * FROM join_requests WHERE id = ?', (request_id,)).fetchone()
        if not req:
            return jsonify({'error': 'Заявка не найдена'}), 404
        group = conn.execute('SELECT * FROM groups WHERE id = ? AND teacher_id = ?', (req['group_id'], request.user_id)).fetchone()
        if not group:
            return jsonify({'error': 'Доступ запрещён'}), 403
        if action == 'approve':
            conn.execute('INSERT INTO group_members (group_id, user_id, role) VALUES (?, ?, ?)', (req['group_id'], req['user_id'], 'student'))
        conn.execute('DELETE FROM join_requests WHERE id = ?', (request_id,))
        conn.commit()
        return jsonify({'success': True})

@app.route('/api/group-members/<int:group_id>', methods=['GET'])
@token_required
@teacher_only
def group_members(group_id):
    with get_db() as conn:
        group = conn.execute('SELECT * FROM groups WHERE id = ? AND teacher_id = ?', (group_id, request.user_id)).fetchone()
        if not group:
            return jsonify({'error': 'Доступ запрещён'}), 403
        members = conn.execute('SELECT u.id, u.full_name, u.username, u.email FROM group_members gm JOIN users u ON gm.user_id = u.id WHERE gm.group_id = ? AND gm.role = "student" ORDER BY u.full_name', (group_id,)).fetchall()
        return jsonify([dict(m) for m in members])

@app.route('/api/kick-member', methods=['POST'])
@token_required
@teacher_only
def kick_member():
    data = request.json
    group_id = data.get('group_id')
    user_id = data.get('user_id')
    if not group_id or not user_id:
        return jsonify({'error': 'Недостаточно данных'}), 400
    with get_db() as conn:
        group = conn.execute('SELECT * FROM groups WHERE id = ? AND teacher_id = ?', (group_id, request.user_id)).fetchone()
        if not group:
            return jsonify({'error': 'Доступ запрещён'}), 403
        conn.execute('DELETE FROM group_members WHERE group_id = ? AND user_id = ?', (group_id, user_id))
        conn.commit()
        return jsonify({'success': True})

@app.route('/api/tests', methods=['GET'])
@token_required
def get_tests():
    with get_db() as conn:
        if request.user_role == 'student':
            groups = conn.execute('SELECT group_id FROM group_members WHERE user_id = ?', (request.user_id,)).fetchall()
            group_ids = [g['group_id'] for g in groups]
            if not group_ids:
                return jsonify([])
            placeholders = ','.join('?' for _ in group_ids)
            tests = conn.execute(f'SELECT t.*, g.name as group_name, u.full_name as teacher_name FROM tests t JOIN groups g ON t.group_id = g.id JOIN users u ON t.teacher_id = u.id WHERE t.group_id IN ({placeholders}) ORDER BY t.created_at DESC', tuple(group_ids)).fetchall()
        else:
            tests = conn.execute('SELECT t.*, g.name as group_name FROM tests t JOIN groups g ON t.group_id = g.id WHERE t.teacher_id = ? ORDER BY t.created_at DESC', (request.user_id,)).fetchall()
        return jsonify([dict(t) for t in tests])

@app.route('/api/tests/<int:test_id>', methods=['GET'])
@token_required
def get_test(test_id):
    with get_db() as conn:
        test = conn.execute('SELECT * FROM tests WHERE id = ?', (test_id,)).fetchone()
        if not test:
            return jsonify({'error': 'Тест не найден'}), 404
        if request.user_role == 'student':
            member = conn.execute('SELECT * FROM group_members WHERE group_id = ? AND user_id = ?', (test['group_id'], request.user_id)).fetchone()
            if not member:
                return jsonify({'error': 'Доступ запрещён'}), 403
        questions = conn.execute('SELECT * FROM questions WHERE test_id = ?', (test_id,)).fetchall()
        if request.user_role == 'student':
            q_list = []
            for q in questions:
                q_dict = {'id': q['id'], 'question_text': q['question_text'], 'question_type': q['question_type'], 'points': q['points'], 'image_url': q['image_url']}
                if q['question_type'] == 'choice':
                    q_dict.update({'option_a': q['option_a'], 'option_b': q['option_b'], 'option_c': q['option_c'], 'option_d': q['option_d']})
                elif q['question_type'] == 'table':
                    q_dict['table_cols'] = q['table_cols']
                q_list.append(q_dict)
        else:
            q_list = [dict(q) for q in questions]
        return jsonify({'test': dict(test), 'questions': q_list})

@app.route('/api/tests/<int:test_id>/check', methods=['GET'])
@token_required
@student_only
def check_attempt(test_id):
    with get_db() as conn:
        result = conn.execute('SELECT * FROM results WHERE student_id = ? AND test_id = ?', (request.user_id, test_id)).fetchone()
        if result:
            return jsonify({'hasAttempted': True, 'score': result['score'], 'total': result['total'], 'percentage': round(result['score']/result['total']*100, 1)})
        return jsonify({'hasAttempted': False})

@app.route('/api/tests', methods=['POST'])
@token_required
@teacher_only
def create_test():
    data = request.json
    title = data.get('title')
    description = data.get('description')
    group_id = data.get('group_id')
    questions = data.get('questions', [])
    if not title or not group_id:
        return jsonify({'error': 'Название и группа обязательны'}), 400
    with get_db() as conn:
        group = conn.execute('SELECT * FROM groups WHERE id = ? AND teacher_id = ?', (group_id, request.user_id)).fetchone()
        if not group:
            return jsonify({'error': 'Группа не найдена'}), 403
        cursor = conn.execute('INSERT INTO tests (title, description, group_id, teacher_id) VALUES (?, ?, ?, ?)', (title, description, group_id, request.user_id))
        test_id = cursor.lastrowid
        for q in questions:
            q_type = q.get('type', 'choice')
            table_cols = q.get('table_cols', 4)
            conn.execute('INSERT INTO questions (test_id, question_text, question_type, option_a, option_b, option_c, option_d, correct_answer, correct_answer_text, table_data, table_cols, image_url, points) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
                (test_id, q['text'], q_type, q.get('a'), q.get('b'), q.get('c'), q.get('d'), q.get('correct'), q.get('correct_text'), q.get('table_data'), table_cols, q.get('image_url'), q.get('points', 1)))
        conn.commit()
        return jsonify({'success': True, 'test_id': test_id})

@app.route('/api/tests/<int:test_id>', methods=['PUT'])
@token_required
@teacher_only
def update_test(test_id):
    data = request.json
    title = data.get('title')
    description = data.get('description')
    group_id = data.get('group_id')
    questions = data.get('questions', [])
    with get_db() as conn:
        test = conn.execute('SELECT * FROM tests WHERE id = ? AND teacher_id = ?', (test_id, request.user_id)).fetchone()
        if not test:
            return jsonify({'error': 'Тест не найден'}), 404
        group = conn.execute('SELECT * FROM groups WHERE id = ? AND teacher_id = ?', (group_id, request.user_id)).fetchone()
        if not group:
            return jsonify({'error': 'Группа не найдена'}), 403
        conn.execute('UPDATE tests SET title = ?, description = ?, group_id = ? WHERE id = ?', (title, description, group_id, test_id))
        conn.execute('DELETE FROM questions WHERE test_id = ?', (test_id,))
        for q in questions:
            q_type = q.get('type', 'choice')
            table_cols = q.get('table_cols', 4)
            conn.execute('INSERT INTO questions (test_id, question_text, question_type, option_a, option_b, option_c, option_d, correct_answer, correct_answer_text, table_data, table_cols, image_url, points) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
                (test_id, q['text'], q_type, q.get('a'), q.get('b'), q.get('c'), q.get('d'), q.get('correct'), q.get('correct_text'), q.get('table_data'), table_cols, q.get('image_url'), q.get('points', 1)))
        conn.commit()
        return jsonify({'success': True})

@app.route('/api/tests/<int:test_id>', methods=['DELETE'])
@token_required
@teacher_only
def delete_test(test_id):
    with get_db() as conn:
        test = conn.execute('SELECT * FROM tests WHERE id = ? AND teacher_id = ?', (test_id, request.user_id)).fetchone()
        if not test:
            return jsonify({'error': 'Тест не найден'}), 404
        conn.execute('DELETE FROM questions WHERE test_id = ?', (test_id,))
        conn.execute('DELETE FROM results WHERE test_id = ?', (test_id,))
        conn.execute('DELETE FROM tests WHERE id = ?', (test_id,))
        conn.commit()
        return jsonify({'success': True})

@app.route('/api/tests/<int:test_id>/submit', methods=['POST'])
@token_required
@student_only
def submit_test(test_id):
    with get_db() as conn:
        existing = conn.execute('SELECT * FROM results WHERE student_id = ? AND test_id = ?', (request.user_id, test_id)).fetchone()
        if existing:
            return jsonify({'error': 'Вы уже проходили этот тест'}), 403
    answers = request.json.get('answers', {})
    with get_db() as conn:
        questions = conn.execute('SELECT id, question_type, correct_answer, correct_answer_text, points FROM questions WHERE test_id = ?', (test_id,)).fetchall()
        score = 0
        total = 0
        for q in questions:
            total += q['points'] or 1
            if q['question_type'] == 'choice':
                if answers.get(str(q['id'])) == q['correct_answer']:
                    score += q['points'] or 1
            elif q['question_type'] == 'text':
                if answers.get(str(q['id']), '').strip().lower() == (q['correct_answer_text'] or '').strip().lower():
                    score += q['points'] or 1
            elif q['question_type'] == 'table':
                correct = (q['correct_answer'] or '').strip().lower()
                user_ans = answers.get(str(q['id']), '').strip().lower()
                correct_normalized = ','.join([x.strip() for x in correct.split(',')])
                user_normalized = ','.join([x.strip() for x in user_ans.split(',')])
                if correct_normalized == user_normalized:
                    score += q['points'] or 1
        conn.execute('INSERT INTO results (student_id, test_id, score, total) VALUES (?, ?, ?, ?)', (request.user_id, test_id, score, total))
        conn.commit()
        percentage = round((score / total) * 100, 1)
        return jsonify({'score': score, 'total': total, 'percentage': percentage})

@app.route('/api/my-results', methods=['GET'])
@token_required
@student_only
def my_results():
    with get_db() as conn:
        results = conn.execute('SELECT r.*, t.title, g.name as group_name, round(CAST(r.score AS FLOAT) / r.total * 100, 1) as percentage FROM results r JOIN tests t ON r.test_id = t.id JOIN groups g ON t.group_id = g.id WHERE r.student_id = ? ORDER BY r.completed_at DESC', (request.user_id,)).fetchall()
        return jsonify([dict(r) for r in results])

@app.route('/api/group-tests/<int:group_id>', methods=['GET'])
@token_required
@teacher_only
def group_tests(group_id):
    with get_db() as conn:
        group = conn.execute('SELECT * FROM groups WHERE id = ? AND teacher_id = ?', (group_id, request.user_id)).fetchone()
        if not group:
            return jsonify({'error': 'Доступ запрещён'}), 403
        tests = conn.execute('SELECT * FROM tests WHERE group_id = ? ORDER BY created_at DESC', (group_id,)).fetchall()
        return jsonify([dict(t) for t in tests])

@app.route('/api/teacher-stats', methods=['GET'])
@token_required
@teacher_only
def teacher_stats():
    with get_db() as conn:
        groups_count = conn.execute('SELECT COUNT(*) as count FROM groups WHERE teacher_id = ?', (request.user_id,)).fetchone()['count']
        tests_count = conn.execute('SELECT COUNT(*) as count FROM tests WHERE teacher_id = ?', (request.user_id,)).fetchone()['count']
        avg_score = conn.execute('SELECT ROUND(AVG(CAST(r.score AS FLOAT) / r.total * 100), 1) as avg_percentage FROM results r JOIN tests t ON r.test_id = t.id WHERE t.teacher_id = ?', (request.user_id,)).fetchone()['avg_percentage']
        students_count = conn.execute('SELECT COUNT(DISTINCT gm.user_id) as count FROM group_members gm JOIN groups g ON gm.group_id = g.id WHERE g.teacher_id = ? AND gm.role = "student"', (request.user_id,)).fetchone()['count']
        completed_tests = conn.execute('SELECT COUNT(*) as count FROM results r JOIN tests t ON r.test_id = t.id WHERE t.teacher_id = ?', (request.user_id,)).fetchone()['count']
        return jsonify({'groups_count': groups_count, 'tests_count': tests_count, 'avg_score': avg_score or 0, 'students_count': students_count, 'completed_tests': completed_tests})

# ========== НОВЫЙ МАРШРУТ ДЛЯ УЧЕНИКА: ПОЛУЧЕНИЕ ТЕСТОВ ГРУППЫ ==========
@app.route('/api/student/group/<int:group_id>/tests', methods=['GET'])
@token_required
@student_only
def student_group_tests(group_id):
    with get_db() as conn:
        membership = conn.execute('SELECT * FROM group_members WHERE group_id = ? AND user_id = ? AND role = "student"', (group_id, request.user_id)).fetchone()
        if not membership:
            return jsonify({'error': 'Доступ запрещён'}), 403
        
        tests = conn.execute('''
            SELECT t.*, 
                   (SELECT COUNT(*) FROM results WHERE test_id = t.id AND student_id = ?) as has_attempted,
                   (SELECT score FROM results WHERE test_id = t.id AND student_id = ?) as score,
                   (SELECT total FROM results WHERE test_id = t.id AND student_id = ?) as total
            FROM tests t
            WHERE t.group_id = ?
            ORDER BY t.created_at DESC
        ''', (request.user_id, request.user_id, request.user_id, group_id)).fetchall()
        
        group = conn.execute('SELECT name FROM groups WHERE id = ?', (group_id,)).fetchone()
        
        result = []
        for t in tests:
            attempted = t['has_attempted'] > 0
            score_val = t['score'] if t['score'] is not None else 0
            total_val = t['total'] if t['total'] is not None else 0
            percentage = round((score_val / total_val) * 100, 1) if attempted and total_val > 0 else 0
            result.append({
                'id': t['id'],
                'title': t['title'],
                'description': t['description'],
                'has_attempted': attempted,
                'score': score_val,
                'total': total_val,
                'percentage': percentage
            })
        
        return jsonify({'group_name': group['name'], 'tests': result})

# ========== МАРШРУТЫ ДЛЯ РЕЗУЛЬТАТОВ (учитель) ==========
@app.route('/api/test-results/<int:test_id>', methods=['GET'])
@token_required
@teacher_only
def get_test_results(test_id):
    with get_db() as conn:
        test = conn.execute('SELECT * FROM tests WHERE id = ? AND teacher_id = ?', (test_id, request.user_id)).fetchone()
        if not test:
            return jsonify({'error': 'Тест не найден'}), 404
        
        students = conn.execute('''
            SELECT DISTINCT u.id, u.full_name, u.username, u.email
            FROM group_members gm
            JOIN users u ON gm.user_id = u.id
            WHERE gm.group_id = ? AND gm.role = 'student'
            ORDER BY u.full_name
        ''', (test['group_id'],)).fetchall()
        
        results = conn.execute('''
            SELECT r.student_id, r.score, r.total, r.completed_at,
                   ROUND(CAST(r.score AS FLOAT) / r.total * 100, 1) as percentage
            FROM results r
            WHERE r.test_id = ?
        ''', (test_id,)).fetchall()
        
        results_dict = {r['student_id']: r for r in results}
        
        students_results = []
        for student in students:
            result = results_dict.get(student['id'])
            students_results.append({
                'id': student['id'],
                'full_name': student['full_name'],
                'username': student['username'],
                'email': student['email'],
                'has_completed': result is not None,
                'score': result['score'] if result else 0,
                'total': result['total'] if result else 0,
                'percentage': result['percentage'] if result else 0,
                'completed_at': result['completed_at'] if result else None
            })
        
        test_info = {
            'id': test['id'],
            'title': test['title'],
            'description': test['description'],
            'group_id': test['group_id']
        }
        
        group = conn.execute('SELECT name FROM groups WHERE id = ?', (test['group_id'],)).fetchone()
        
        return jsonify({
            'test': test_info,
            'group_name': group['name'],
            'students': students_results,
            'total_students': len(students),
            'completed_count': len(results)
        })

if __name__ == '__main__':
    init_db()
    print('\n' + '='*50)
    print('СЕРВЕР ЗАПУЩЕН: http://localhost:3000')
    print('='*50 + '\n')
    app.run( host='0.0.0.0', port=3000)
