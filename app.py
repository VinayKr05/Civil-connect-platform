import sqlite3
from flask import Flask, request, jsonify, render_template, session
from textblob import TextBlob
from datetime import datetime
import hashlib

app = Flask(__name__)
app.secret_key = 'super_secret_civic_key_123'

def init_db():
    conn = sqlite3.connect('civic.db')
    c = conn.cursor()
    c.execute('''CREATE TABLE IF NOT EXISTS users
                 (id INTEGER PRIMARY KEY AUTOINCREMENT,
                  username TEXT UNIQUE,
                  password_hash TEXT,
                  role TEXT)''')
    
    c.execute('''CREATE TABLE IF NOT EXISTS issues
                 (id INTEGER PRIMARY KEY AUTOINCREMENT,
                  title TEXT,
                  description TEXT,
                  category TEXT,
                  sentiment_score REAL,
                  sentiment_label TEXT,
                  priority_score REAL,
                  upvotes INTEGER,
                  timestamp DATETIME,
                  user_id INTEGER,
                  status TEXT,
                  FOREIGN KEY(user_id) REFERENCES users(id))''')
    conn.commit()
    conn.close()

init_db()

def hash_password(password):
    return hashlib.sha256(password.encode()).hexdigest()

def get_category(text):
    text = text.lower()
    if any(word in text for word in ['road', 'pothole', 'street', 'bridge', 'traffic']):
        return 'Infrastructure'
    elif any(word in text for word in ['police', 'crime', 'safe', 'lighting']):
        return 'Safety'
    elif any(word in text for word in ['health', 'hospital', 'clinic']):
        return 'Health'
    elif any(word in text for word in ['education', 'school', 'teacher', 'student', 'college', 'university']):
        return 'Education'
    elif any(word in text for word in ['park', 'tree', 'trash', 'water', 'pollution', 'sanitation', 'garbage', 'waste', 'toilet', 'clean']):
        return 'Sanitation'
    else:
        return 'General'

def analyze_sentiment_and_priority(description):
    blob = TextBlob(description)
    sentiment_score = blob.sentiment.polarity
    
    if sentiment_score > 0.2:
        sentiment_label = 'Positive'
    elif sentiment_score < -0.2:
        sentiment_label = 'Negative'
    else:
        sentiment_label = 'Neutral'
        
    priority = 0
    urgency_words = ['urgent', 'emergency', 'danger', 'hazard', 'severe', 'immediate', 'critical']
    if any(word in description.lower() for word in urgency_words):
        priority += 30
        
    if sentiment_score < -0.5:
        priority += 20
    elif sentiment_score < 0:
        priority += 10
        
    return sentiment_score, sentiment_label, min(priority, 100)

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/api/register', methods=['POST'])
def register():
    data = request.json
    username = data.get('username')
    password = data.get('password')
    role = data.get('role', 'Citizen') 
    
    if not username or not password:
        return jsonify({"error": "Missing credentials"}), 400
        
    conn = sqlite3.connect('civic.db')
    c = conn.cursor()
    try:
        c.execute("INSERT INTO users (username, password_hash, role) VALUES (?, ?, ?)", 
                  (username, hash_password(password), role))
        conn.commit()
    except sqlite3.IntegrityError:
        conn.close()
        return jsonify({"error": "Username already exists"}), 400
    
    user_id = c.lastrowid
    conn.close()
    
    session['user_id'] = user_id
    session['username'] = username
    session['role'] = role
    
    return jsonify({"status": "success", "user": {"id": user_id, "username": username, "role": role}})

@app.route('/api/login', methods=['POST'])
def login():
    data = request.json
    username = data.get('username')
    password = data.get('password')
    
    conn = sqlite3.connect('civic.db')
    conn.row_factory = sqlite3.Row
    c = conn.cursor()
    c.execute("SELECT * FROM users WHERE username = ? AND password_hash = ?", (username, hash_password(password)))
    user = c.fetchone()
    conn.close()
    
    if user:
        session['user_id'] = user['id']
        session['username'] = user['username']
        session['role'] = user['role']
        return jsonify({"status": "success", "user": {"id": user['id'], "username": user['username'], "role": user['role']}})
    else:
        return jsonify({"error": "Invalid credentials"}), 401

@app.route('/api/logout', methods=['POST'])
def logout():
    session.clear()
    return jsonify({"status": "success"})

@app.route('/api/me', methods=['GET'])
def me():
    if 'user_id' in session:
        return jsonify({"id": session['user_id'], "username": session['username'], "role": session['role']})
    return jsonify({"error": "Not logged in"}), 401

@app.route('/api/issues', methods=['GET'])
def get_issues():
    conn = sqlite3.connect('civic.db')
    conn.row_factory = sqlite3.Row
    c = conn.cursor()
    query = '''SELECT issues.*, users.username as reporter_name 
               FROM issues 
               LEFT JOIN users ON issues.user_id = users.id 
               ORDER BY issues.priority_score DESC, issues.timestamp DESC'''
    c.execute(query)
    issues = [dict(row) for row in c.fetchall()]
    conn.close()
    return jsonify(issues)

@app.route('/api/issues', methods=['POST'])
def add_issue():
    if 'user_id' not in session:
        return jsonify({"error": "Must be logged in to report an issue"}), 401
        
    data = request.json
    title = data.get('title')
    description = data.get('description')
    
    category = get_category(title + " " + description)
    sentiment_score, sentiment_label, base_priority = analyze_sentiment_and_priority(description)
    
    timestamp = datetime.now()
    status = "Open"
    
    conn = sqlite3.connect('civic.db')
    c = conn.cursor()
    c.execute('''INSERT INTO issues (title, description, category, sentiment_score, sentiment_label, priority_score, upvotes, timestamp, user_id, status)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)''',
              (title, description, category, sentiment_score, sentiment_label, base_priority, 0, timestamp, session['user_id'], status))
    conn.commit()
    conn.close()
    return jsonify({"status": "success"}), 201

@app.route('/api/issues/<int:issue_id>/upvote', methods=['POST'])
def upvote_issue(issue_id):
    if 'user_id' not in session:
        return jsonify({"error": "Must be logged in to upvote"}), 401
        
    conn = sqlite3.connect('civic.db')
    c = conn.cursor()
    c.execute("UPDATE issues SET upvotes = upvotes + 1, priority_score = priority_score + 2 WHERE id = ?", (issue_id,))
    conn.commit()
    conn.close()
    return jsonify({"status": "success"})

@app.route('/api/issues/<int:issue_id>/status', methods=['POST'])
def update_status(issue_id):
    if 'user_id' not in session or session.get('role') != 'Official':
        return jsonify({"error": "Unauthorized"}), 403
        
    data = request.json
    new_status = data.get('status')
    
    conn = sqlite3.connect('civic.db')
    c = conn.cursor()
    c.execute("UPDATE issues SET status = ? WHERE id = ?", (new_status, issue_id))
    conn.commit()
    conn.close()
    return jsonify({"status": "success"})

if __name__ == '__main__':
    app.run(debug=True, port=5000)
