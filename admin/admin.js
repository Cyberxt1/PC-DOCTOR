// TechFix Admin Dashboard
// Place in your admin folder, load with <script type="module" src="./admin.js"></script>

import { initializeApp } from "https://www.gstatic.com/firebasejs/11.9.0/firebase-app.js";
import { getAuth, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/11.9.0/firebase-auth.js";
import { getFirestore, collection, onSnapshot, doc, getDoc, updateDoc } from "https://www.gstatic.com/firebasejs/11.9.0/firebase-firestore.js";

// --- Firebase config ---
const firebaseConfig = {
  apiKey: "AIzaSyB9aIZfqZvtfOSNUHGRSDXMyWDxWWS5NNs",
  authDomain: "techfix-ef115.firebaseapp.com",
  projectId: "techfix-ef115",
  storageBucket: "techfix-ef115.firebasestorage.app",
  messagingSenderId: "798114675752",
  appId: "1:798114675752:web:33450b57585b4a643b891d",
  measurementId: "G-69MKL5ETH7"
};

const ADMIN_EMAILS = [
  "oluokundavid4@gmail.com",  // replace with your real admins
  "admin2@email.com"
];

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// --- DOM Elements (add these IDs/classes to your HTML if missing) ---
const statsTotalUsers = document.querySelector('.stat-value'); // 1st .stat-value for total users
const statsActiveSessions = document.querySelectorAll('.stat-value')[1];
const statsFlagged = document.querySelectorAll('.stat-value')[2];
const statsAdmins = document.querySelectorAll('.stat-value')[3];
const deviceTableBody = document.querySelector('.device-status tbody');
const logsTableBody = document.querySelector('.troubleshooting-logs tbody');

// --- Auth: Only Allow Admins ---
onAuthStateChanged(auth, user => {
  if (!user || !ADMIN_EMAILS.includes(user.email)) {
    alert("You are not authorized to access this dashboard.");
    window.location.href = "../login/login.html";
    return;
  }
  // Load users live
  liveLoadUsers();
});

// --- Live Load All Users and Their Data ---
function liveLoadUsers() {
  const usersCol = collection(db, "users");
  onSnapshot(usersCol, (snapshot) => {
    const users = [];
    snapshot.forEach(docSnap => {
      users.push({ ...docSnap.data(), id: docSnap.id });
    });
    updateStats(users);
    updateDeviceTable(users);
    updateLogsTable(users);
  });
}

// --- Update User Stats ---
function updateStats(users) {
  statsTotalUsers.textContent = users.length;
  statsAdmins.textContent = users.filter(u => ADMIN_EMAILS.includes(u.email)).length;
  statsActiveSessions.textContent = Math.floor(users.length * 0.2 + 1); // fake value; replace with real if you track sessions
  statsFlagged.textContent = users.filter(u => u.flagged).length;
}

// --- Device Table: Show Most Recent Device Issue Per User ---
function updateDeviceTable(users) {
  deviceTableBody.innerHTML = "";
  const latestIssues = [];
  users.forEach(user => {
    if (Array.isArray(user.history) && user.history.length > 0) {
      const latest = [...user.history].sort((a, b) => new Date(b.time) - new Date(a.time))[0];
      latestIssues.push({ ...latest, owner: user.email, uid: user.id });
    }
  });

  latestIssues.forEach(entry => {
    const tr = document.createElement('tr');
    let deviceLabel = entry.device === 'laptop'
      ? (entry.details.match(/Processor: (.*?),/) ? entry.details.match(/Processor: (.*?),/)[1] : "Laptop")
      : (entry.device === 'phone'
          ? (entry.details.match(/Model: (.*)/) ? entry.details.match(/Model: (.*)/)[1] : "Phone")
          : "Other");

    const status = entry.resolved ? "Fixed" : "Pending";
    const badgeClass = entry.resolved ? "healthy" : "issues";

    tr.innerHTML = `
      <td>${deviceLabel}</td>
      <td><span class="badge ${badgeClass}">${status}</span></td>
      <td>${formatDate(entry.time)}</td>
      <td>${entry.owner}</td>
    `;
    deviceTableBody.appendChild(tr);
  });
}

// --- Logs Table: Show All Issues from All Users ---
function updateLogsTable(users) {
  logsTableBody.innerHTML = "";
  const allIssues = [];
  users.forEach(user => {
    if (Array.isArray(user.history)) {
      user.history.forEach(entry => {
        allIssues.push({ ...entry, owner: user.email, uid: user.id });
      });
    }
  });
  allIssues.sort((a, b) => new Date(b.time) - new Date(a.time));
  allIssues.forEach(entry => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${formatDate(entry.time)}</td>
      <td>${entry.owner}</td>
      <td>${entry.device || "—"}</td>
      <td>${entry.desc || "—"}</td>
      <td>
        ${entry.resolved ? "Resolved" : `<button class="resolve-btn" data-uid="${entry.uid}" data-time="${entry.time}">Mark Resolved</button>`}
      </td>
    `;
    logsTableBody.appendChild(tr);
  });

  // Wire up "Mark Resolved" buttons
  logsTableBody.querySelectorAll('.resolve-btn').forEach(btn => {
    btn.addEventListener('click', async function() {
      await markIssueResolved(btn.getAttribute('data-uid'), btn.getAttribute('data-time'));
    });
  });
}

// --- Mark Issue as Resolved ---
async function markIssueResolved(userId, entryTime) {
  const userDocRef = doc(db, "users", userId);
  const userDoc = await getDoc(userDocRef);
  const userData = userDoc.data();
  let history = Array.isArray(userData.history) ? userData.history : [];
  const idx = history.findIndex(e => e.time === entryTime);
  if (idx > -1) {
    history[idx].resolved = true;
    await updateDoc(userDocRef, { history });
  }
}

// --- Format Date ---
function formatDate(isoString) {
  if (!isoString) return "";
  const d = new Date(isoString);
  return d.toLocaleString();
}

// --- (Optional) Logout Admin ---
window.adminLogout = function() {
  signOut(auth).then(() => window.location.href = "../login/login.html");
}