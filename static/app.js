let currentUser = null;
let allIssues = [];
let isOfficialView = false;

document.addEventListener('DOMContentLoaded', () => {
    checkAuth();
    fetchIssues();

    // Issue Form Submit
    const form = document.getElementById('issue-form');
    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        if(!currentUser) return;

        const title = document.getElementById('title').value;
        const description = document.getElementById('description').value;
        const btn = form.querySelector('button');
        const msg = document.getElementById('form-message');
        
        btn.textContent = 'Analyzing...';
        btn.disabled = true;

        try {
            const res = await fetch('/api/issues', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ title, description })
            });
            
            if(res.ok) {
                form.reset();
                msg.textContent = 'Issue reported successfully! AI has categorized it.';
                msg.className = 'success-msg';
                setTimeout(() => msg.classList.add('hidden'), 4000);
                fetchIssues();
            } else {
                throw new Error("Failed");
            }
        } catch(err) {
            console.error(err);
            msg.textContent = 'Failed to submit.';
            msg.className = '';
            msg.style.color = 'var(--negative)';
        } finally {
            btn.textContent = 'Submit to Analyze';
            btn.disabled = false;
        }
    });

    // Filtering
    const filterBtns = document.querySelectorAll('.filter-btn');
    filterBtns.forEach(btn => {
        btn.addEventListener('click', (e) => {
            filterBtns.forEach(b => b.classList.remove('active'));
            e.target.classList.add('active');
            const filter = e.target.getAttribute('data-filter');
            filterIssues(filter);
        });
    });

    // Auth Modals & Toggles
    const authModal = document.getElementById('auth-modal');
    document.getElementById('btn-show-login').addEventListener('click', () => {
        setAuthMode('login');
        authModal.classList.remove('hidden');
    });
    document.getElementById('close-modal').addEventListener('click', () => {
        authModal.classList.add('hidden');
    });
    
    let authMode = 'login'; // 'login' or 'register'
    document.getElementById('toggle-auth').addEventListener('click', (e) => {
        e.preventDefault();
        authMode = authMode === 'login' ? 'register' : 'login';
        setAuthMode(authMode);
    });

    function setAuthMode(mode) {
        authMode = mode;
        const title = document.getElementById('modal-title');
        const btn = document.getElementById('auth-submit-btn');
        const toggleText = document.getElementById('auth-toggle-text');
        const roleGroup = document.getElementById('role-group');
        const errorMsg = document.getElementById('auth-error');
        
        errorMsg.classList.add('hidden');

        if(mode === 'login') {
            title.textContent = 'Login';
            btn.textContent = 'Login';
            roleGroup.classList.add('hidden');
            toggleText.innerHTML = `Don't have an account? <a href="#" id="toggle-auth" style="color:var(--accent);">Register</a>`;
        } else {
            title.textContent = 'Register';
            btn.textContent = 'Register';
            roleGroup.classList.remove('hidden');
            toggleText.innerHTML = `Already have an account? <a href="#" id="toggle-auth" style="color:var(--accent);">Login</a>`;
        }
        
        // rebind toggle
        document.getElementById('toggle-auth').addEventListener('click', (e) => {
            e.preventDefault();
            setAuthMode(authMode === 'login' ? 'register' : 'login');
        });
    }

    // Auth Submit
    document.getElementById('auth-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const username = document.getElementById('username').value;
        const password = document.getElementById('password').value;
        const role = document.getElementById('role').value;
        const errorMsg = document.getElementById('auth-error');
        
        const endpoint = authMode === 'login' ? '/api/login' : '/api/register';
        const body = authMode === 'login' ? {username, password} : {username, password, role};
        
        try {
            const res = await fetch(endpoint, {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify(body)
            });
            const data = await res.json();
            
            if(res.ok) {
                authModal.classList.add('hidden');
                document.getElementById('auth-form').reset();
                currentUser = data.user;
                updateUIForUser();
            } else {
                errorMsg.textContent = data.error;
                errorMsg.classList.remove('hidden');
            }
        } catch(err) {
            errorMsg.textContent = "Network error";
            errorMsg.classList.remove('hidden');
        }
    });

    // Logout
    document.getElementById('btn-logout').addEventListener('click', async () => {
        await fetch('/api/logout', { method: 'POST' });
        currentUser = null;
        isOfficialView = false;
        updateUIForUser();
        fetchIssues(); // re-render issues to hide official controls if any
    });

    // Official Dashboard Toggles
    const btnPublicFeed = document.getElementById('btn-public-feed');
    const btnOfficialDash = document.getElementById('btn-official-dash');
    
    btnPublicFeed.addEventListener('click', () => {
        isOfficialView = false;
        btnPublicFeed.classList.add('active-view');
        btnOfficialDash.classList.remove('active-view');
        renderIssues(allIssues);
    });

    btnOfficialDash.addEventListener('click', () => {
        isOfficialView = true;
        btnOfficialDash.classList.add('active-view');
        btnPublicFeed.classList.remove('active-view');
        renderIssues(allIssues);
    });
});

async function checkAuth() {
    try {
        const res = await fetch('/api/me');
        if(res.ok) {
            currentUser = await res.json();
        }
    } catch(err) {}
    updateUIForUser();
}

function updateUIForUser() {
    const authOverlay = document.getElementById('auth-overlay');
    const btnShowLogin = document.getElementById('btn-show-login');
    const userInfo = document.getElementById('user-info');
    const welcomeMsg = document.getElementById('welcome-msg');
    const btnOfficialDash = document.getElementById('btn-official-dash');
    const btnPublicFeed = document.getElementById('btn-public-feed');

    if(currentUser) {
        authOverlay.classList.add('hidden');
        btnShowLogin.classList.add('hidden');
        userInfo.classList.remove('hidden');
        welcomeMsg.textContent = `Hello, ${currentUser.username} (${currentUser.role})`;
        
        if(currentUser.role === 'Official') {
            btnOfficialDash.classList.remove('hidden');
            btnPublicFeed.classList.remove('hidden');
        } else {
            btnOfficialDash.classList.add('hidden');
            btnPublicFeed.classList.add('hidden');
            isOfficialView = false;
        }
    } else {
        authOverlay.classList.remove('hidden');
        btnShowLogin.classList.remove('hidden');
        userInfo.classList.add('hidden');
        btnOfficialDash.classList.add('hidden');
        btnPublicFeed.classList.add('hidden');
    }
}

async function fetchIssues() {
    try {
        const res = await fetch('/api/issues');
        allIssues = await res.json();
        const activeFilter = document.querySelector('.filter-btn.active').getAttribute('data-filter');
        filterIssues(activeFilter);
    } catch(err) {
        console.error("Failed to fetch issues", err);
    }
}

function filterIssues(category) {
    if(category === 'all') {
        renderIssues(allIssues);
    } else {
        const filtered = allIssues.filter(i => i.category === category);
        renderIssues(filtered);
    }
}

function renderIssues(issues) {
    const container = document.getElementById('issues-container');
    container.innerHTML = '';
    
    if(issues.length === 0) {
        container.innerHTML = '<p style="color: var(--text-secondary); text-align: center;">No issues found.</p>';
        return;
    }

    issues.forEach((issue, index) => {
        const priorityClass = issue.priority_score > 50 ? 'high' : '';
        const el = document.createElement('div');
        el.className = 'issue-item issue-anim';
        el.style.animationDelay = `${index * 0.1}s`;
        
        const date = new Date(issue.timestamp).toLocaleDateString();
        const reporter = issue.reporter_name ? `Reported by ${escapeHTML(issue.reporter_name)}` : 'Anonymous';
        
        let statusHtml = `<span class="badge badge-status ${issue.status}">${issue.status}</span>`;
        
        // If official dashboard view, show a dropdown to change status
        if(isOfficialView && currentUser && currentUser.role === 'Official') {
            statusHtml = `
                <select class="status-select" onchange="updateStatus(${issue.id}, this.value)">
                    <option value="Open" ${issue.status === 'Open' ? 'selected' : ''}>Open</option>
                    <option value="InProgress" ${issue.status === 'InProgress' ? 'selected' : ''}>In Progress</option>
                    <option value="Resolved" ${issue.status === 'Resolved' ? 'selected' : ''}>Resolved</option>
                </select>
            `;
        }

        el.innerHTML = `
            <div class="issue-header">
                <div class="issue-title">
                    <span class="sentiment-dot sentiment-${issue.sentiment_label}" title="Sentiment: ${issue.sentiment_label}"></span>
                    ${escapeHTML(issue.title)}
                </div>
                <div style="display: flex; gap: 0.5rem; align-items: center;">
                    ${statusHtml}
                    <span class="badge badge-priority ${priorityClass}">Priority: ${Math.round(issue.priority_score)}</span>
                </div>
            </div>
            <div class="issue-desc">${escapeHTML(issue.description)}</div>
            <div class="issue-footer">
                <div>
                    <span class="badge badge-category">${issue.category}</span>
                    <span style="margin-left: 10px; font-size: 0.8rem;">${date} • ${reporter}</span>
                </div>
                <button class="upvote-btn" onclick="upvote(${issue.id})">
                    <svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24" style="margin-right:4px;"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 15l7-7 7 7"></path></svg>
                    ${issue.upvotes}
                </button>
            </div>
        `;
        container.appendChild(el);
    });
}

async function upvote(id) {
    if(!currentUser) {
        alert("You must be logged in to upvote.");
        return;
    }
    try {
        await fetch(`/api/issues/${id}/upvote`, { method: 'POST' });
        fetchIssues(); 
    } catch(err) {
        console.error('Error upvoting', err);
    }
}

async function updateStatus(id, newStatus) {
    try {
        const res = await fetch(`/api/issues/${id}/status`, {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({status: newStatus})
        });
        if(res.ok) {
            fetchIssues(); // refresh to ensure synced
        }
    } catch(err) {
        console.error('Error updating status', err);
    }
}

function escapeHTML(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}
