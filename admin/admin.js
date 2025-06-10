import { auth, db } from '../firebase-config/shared-firebase.js';
import {
  onAuthStateChanged,
  signOut
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
  collection,
  getDocs,
  doc,
  updateDoc,
  query,
  where,
  orderBy,
  onSnapshot
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

// Routing for admin sidebar
const navItems = document.querySelectorAll('.nav-item');
const sections = document.querySelectorAll('.admin-section');
navItems.forEach(item => {
  item.addEventListener('click', () => {
    navItems.forEach(i => i.classList.remove('active'));
    item.classList.add('active');
    sections.forEach(sec => sec.classList.remove('active'));
    document.getElementById(item.dataset.page).classList.add('active');
  });
});

// Toast message
function showToast(msg) {
  const toast = document.getElementById('admin-toast');
  toast.textContent = msg;
  toast.classList.add('active');
  setTimeout(() => toast.classList.remove('active'), 2500);
}

// Auth state: only allow admins
onAuthStateChanged(auth, async (user) => {
  if (!user) {
    window.location.href = "/admin-login.html"; // Redirect to admin login if not logged in
    return;
  }
  // Optionally check for admin in Firestore or custom claims here
  document.getElementById('admin-user-info').textContent = user.email;

  // Load dashboard data
  loadDashboard();
  loadUsers();
  loadIssues();
  loadDevices();
  loadLogs();
  loadAlerts();
});

// Logout
document.getElementById('logout-btn').onclick = async () => {
  await signOut(auth);
  window.location.href = "/admin-login.html";
};

// Dashboard Widgets
async function loadDashboard() {
  // User count
  const usersSnap = await getDocs(collection(db, "users"));
  document.querySelector("#total-users span").textContent = usersSnap.size;

  // Issues count
  const issuesSnap = await getDocs(query(collection(db, "issues"), where("status", "!=", "resolved")));
  document.querySelector("#open-issues span").textContent = issuesSnap.size;

  // Devices count
  const devicesSnap = await getDocs(collection(db, "devices"));
  document.querySelector("#total-devices span").textContent = devicesSnap.size;
}

// Users Table
function loadUsers() {
  onSnapshot(collection(db, "users"), (snapshot) => {
    const tbody = document.getElementById('users-table');
    tbody.innerHTML = "";
    snapshot.forEach(doc => {
      const user = doc.data();
      const tr = document.createElement('tr');
      tr.innerHTML = `<td>${user.name || ''}</td>
                      <td>${user.email || ''}</td>
                      <td>${user.role || 'user'}</td>`;
      tbody.appendChild(tr);
    });
  });
}

// Issues Table
function loadIssues() {
  onSnapshot(query(collection(db, "issues"), orderBy("createdAt", "desc")), (snapshot) => {
    const tbody = document.getElementById('issues-table');
    tbody.innerHTML = "";
    snapshot.forEach(docSnap => {
      const issue = docSnap.data();
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>${issue.username || ''}</td>
        <td>${issue.deviceType || ''}</td>
        <td>${issue.description || ''}</td>
        <td>${issue.status || 'open'}</td>
        <td>
          <button class="issue-action" data-id="${docSnap.id}" data-status="${issue.status}">
            ${issue.status === 'resolved' ? 'Reopen' : 'Resolve'}
          </button>
        </td>
      `;
      tbody.appendChild(tr);
    });
    // Add actions
    tbody.querySelectorAll('.issue-action').forEach(btn => {
      btn.onclick = async () => {
        const id = btn.dataset.id;
        const status = btn.dataset.status;
        const newStatus = status === 'resolved' ? 'open' : 'resolved';
        await updateDoc(doc(db, "issues", id), { status: newStatus });
        showToast("Issue status updated");
      };
    });
  });
}

// Devices Table
function loadDevices() {
  onSnapshot(collection(db, "devices"), (snapshot) => {
    const tbody = document.getElementById('devices-table');
    tbody.innerHTML = "";
    snapshot.forEach(doc => {
      const dev = doc.data();
      const tr = document.createElement('tr');
      tr.innerHTML = `<td>${dev.username || ''}</td>
                      <td>${dev.type || ''}</td>
                      <td>${dev.model || dev.info || ''}</td>`;
      tbody.appendChild(tr);
    });
  });
}

// Logs Table
function loadLogs() {
  onSnapshot(query(collection(db, "logs"), orderBy("createdAt", "desc")), (snapshot) => {
    const tbody = document.getElementById('logs-table');
    tbody.innerHTML = "";
    snapshot.forEach(doc => {
      const log = doc.data();
      const tr = document.createElement('tr');
      tr.innerHTML = `<td>${log.createdAt ? new Date(log.createdAt.seconds*1000).toLocaleString() : ''}</td>
                      <td>${log.username || ''}</td>
                      <td>${log.event || ''}</td>`;
      tbody.appendChild(tr);
    });
  });
}

// Alerts List
function loadAlerts() {
  onSnapshot(query(collection(db, "alerts"), orderBy("createdAt", "desc")), (snapshot) => {
    const ul = document.getElementById('alerts-list');
    ul.innerHTML = '';
    snapshot.forEach(doc => {
      const alert = doc.data();
      const li = document.createElement('li');
      li.textContent = `${alert.message}`;
      ul.appendChild(li);
    });
  });
}