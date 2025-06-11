// TechFix Admin Dashboard - dynamic, Firebase-powered (UPDATED)
import { initializeApp } from "https://www.gstatic.com/firebasejs/11.9.0/firebase-app.js";
import {
  getAuth, onAuthStateChanged, signOut
} from "https://www.gstatic.com/firebasejs/11.9.0/firebase-auth.js";
import {
  getFirestore,
  collection,
  query,
  where,
  onSnapshot,
  doc,
  getDoc,
  updateDoc
} from "https://www.gstatic.com/firebasejs/11.9.0/firebase-firestore.js";

// Firebase config
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
  "oluokundavid4@gmail.com"
];

// DOM selectors
const loadingEl = document.getElementById("loading");
const appContainer = document.querySelector(".app-container");

// Stats selectors (update if you change stat card order)
const statTotalUsers = document.querySelectorAll('.stat-value')[0];
const statActiveSessions = document.querySelectorAll('.stat-value')[1];
const statFlagged = document.querySelectorAll('.stat-value')[2];
const statAdmins = document.querySelectorAll('.stat-value')[3];

const deviceStatusTbody = document.getElementById('device-status-tbody');
const logsTbody = document.getElementById('logs-tbody');
const alertList = document.querySelector('.alert-list');
const chatWindow = document.querySelector('.chat-window');
const chatInput = document.getElementById('input-chat-msg');

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// --- Auth: Only allow admins ---
onAuthStateChanged(auth, user => {
  if (!user || !ADMIN_EMAILS.includes(user.email)) {
    if (appContainer) appContainer.style.display = "none";
    if (loadingEl) loadingEl.style.display = "block";
    setTimeout(() => {
      window.location.href = "../login/login.html";
    }, 100);
    return;
  }
  if (loadingEl) loadingEl.style.display = "none";
  if (appContainer) appContainer.style.display = "block";
  liveLoadUsers();
  listenAlerts();
});

// --- Live load all users and their data ---
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

// --- Update Stats ---
function updateStats(users) {
  statTotalUsers.textContent = users.length;
  statAdmins.textContent = users.filter(u => ADMIN_EMAILS.includes(u.email)).length;
  statActiveSessions.textContent = Math.floor(users.length * 0.25) + 1;
  statFlagged.textContent = users.filter(u => u.flagged).length;
}

// --- Device Table (latest issue per user) ---
function updateDeviceTable(users) {
  deviceStatusTbody.innerHTML = "";
  users.forEach(user => {
    if (Array.isArray(user.history) && user.history.length > 0) {
      const latest = [...user.history].sort((a, b) => new Date(b.time) - new Date(a.time))[0];
      const tr = document.createElement('tr');
      let deviceLabel = latest.device === 'laptop'
        ? (latest.details.match(/Processor: (.*?),/) ? latest.details.match(/Processor: (.*?),/)[1] : "Laptop")
        : (latest.device === 'phone'
          ? (latest.details.match(/Model: (.*)/) ? latest.details.match(/Model: (.*)/)[1] : "Phone")
          : "Other");
      const status = latest.resolved ? "Fixed" : "Pending";
      const badgeClass = latest.resolved ? "healthy" : "issues";
      tr.innerHTML = `
        <td>${deviceLabel}</td>
        <td><span class="badge ${badgeClass}">${status}</span></td>
        <td>${formatDate(latest.time)}</td>
        <td>${user.email}</td>
      `;
      deviceStatusTbody.appendChild(tr);
    }
  });
}

// --- Logs Table (all issues from all users) ---
function updateLogsTable(users) {
  logsTbody.innerHTML = "";
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
    logsTbody.appendChild(tr);
  });
  logsTbody.querySelectorAll('.resolve-btn').forEach(btn => {
    btn.addEventListener('click', async function() {
      await markIssueResolved(btn.getAttribute('data-uid'), btn.getAttribute('data-time'));
    });
  });
}

// --- Mark an issue as resolved (admin action) ---
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

// --- Utility: Format date ---
function formatDate(isoString) {
  if (!isoString) return "";
  const d = new Date(isoString);
  return d.toLocaleString();
}

// --- Alert Center: Listen and Interact ---
let currentLiveAlert = null;
let chatUnsub = null;

function listenAlerts() {
  onSnapshot(
    query(collection(db, "alerts"), where("status", "in", ["new", "in-progress"])),
    snapshot => {
      alertList.innerHTML = '';
      snapshot.forEach(docSnap => {
        const alert = docSnap.data();
        const li = document.createElement('li');
        li.innerHTML = `
          <strong>${alert.email}</strong>: ${alert.desc}<br>
          <span style="font-size:0.9em;color:#888;">[${alert.device}] ${alert.details || ""}</span><br>
          <b>Status:</b> ${alert.status}
          ${alert.status === "new"
            ? `<button data-id="${docSnap.id}" class="resolve-alert-btn">Start Resolving</button>`
            : `<button data-id="${docSnap.id}" class="chat-alert-btn">Open Chat</button>
               ${alert.status === "in-progress" ? `<button data-id="${docSnap.id}" class="finish-alert-btn">Mark as Resolved</button>` : ""}`
          }
        `;
        alertList.appendChild(li);
      });
      // Wire up resolve buttons
      alertList.querySelectorAll('.resolve-alert-btn').forEach(btn => {
        btn.onclick = () => handleStartResolve(btn.getAttribute('data-id'));
      });
      alertList.querySelectorAll('.chat-alert-btn').forEach(btn => {
        btn.onclick = () => openAdminChat(btn.getAttribute('data-id'));
      });
      alertList.querySelectorAll('.finish-alert-btn').forEach(btn => {
        btn.onclick = () => markAlertResolved(btn.getAttribute('data-id'));
      });
    }
  );
}

async function handleStartResolve(alertId) {
  const alertRef = doc(db, "alerts", alertId);
  const alertSnap = await getDoc(alertRef);
  const alert = alertSnap.data();
  // Check if user is online (lastOnline within 2 mins)
  const userSnap = await getDoc(doc(db, "users", alert.uid));
  const lastOnline = userSnap.data()?.lastOnline;
  let userIsOnline = false;
  if (lastOnline) {
    const diff = Date.now() - new Date(lastOnline).getTime();
    userIsOnline = diff < 2 * 60 * 1000;
  }
  await updateDoc(alertRef, {
    status: "in-progress",
    admin: auth.currentUser.email
  });
  if (!userIsOnline) {
    // Placehold: send email (in reality, trigger via backend/Cloud Function)
    alert("User is offline. An email should be sent to notify them.");
  }
  openAdminChat(alertId);
}

async function markAlertResolved(alertId) {
  const alertRef = doc(db, "alerts", alertId);
  await updateDoc(alertRef, { status: "resolved" });
  // Optionally send a chat message to user
  const alertSnapshot = await getDoc(alertRef);
  const alert = alertSnapshot.data();
  await addAdminChatMsg(alert.uid, "Your issue has been marked as resolved. If you're satisfied, please mark as resolved in your chat.");
}

function openAdminChat(alertId) {
  // Load alert and open chat interface
  currentLiveAlert = alertId;
  // Get alert info
  getDoc(doc(db, "alerts", alertId)).then(alertSnap => {
    const alert = alertSnap.data();
    chatWindow.innerHTML = `<b>Chat with ${alert.email} about: ${alert.desc}</b><hr><div id="admin-chat-messages" style="height:200px;overflow-y:auto;background:#f6f6f6;padding:10px;border-radius:5px;margin-bottom:7px;"></div>`;
    loadAdminChat(alert.uid);
    chatInput.disabled = false;
    chatInput.placeholder = "Type message to user...";
    chatInput.onkeydown = (e) => {
      if (e.key === "Enter") e.preventDefault();
    };
    chatInput.onkeyup = async (e) => {
      if (e.key === "Enter" && chatInput.value.trim()) {
        await addAdminChatMsg(alert.uid, chatInput.value.trim());
        chatInput.value = "";
      }
    };
  });
}

function loadAdminChat(uid) {
  if (chatUnsub) chatUnsub();
  const adminChatMessages = document.getElementById("admin-chat-messages");
  chatUnsub = onSnapshot(
    collection(db, "chats", uid, "messages"),
    (snapshot) => {
      if (!adminChatMessages) return;
      adminChatMessages.innerHTML = '';
      snapshot.docs
        .sort((a, b) => a.data().timestamp - b.data().timestamp)
        .forEach(docSnap => {
          const msg = docSnap.data();
          const msgDiv = document.createElement('div');
          msgDiv.style.display = 'flex';
          msgDiv.style.justifyContent = msg.from === "admin" ? "flex-end" : "flex-start";
          msgDiv.style.margin = "4px 0";
          msgDiv.innerHTML = `
            <span style="
              display: inline-block;
              padding: 7px 12px;
              border-radius: 16px;
              background: ${msg.from === "admin" ? "#ceffce" : "#dddddd"};
              color: #222;
              font-size: 0.94em;
              max-width: 70%;
              word-break: break-word;
              box-shadow: 0 1px 2px rgba(0,0,0,0.06);
            ">
              ${msg.text}
            </span>
          `;
          adminChatMessages.appendChild(msgDiv);
        });
      adminChatMessages.scrollTop = adminChatMessages.scrollHeight;
    }
  );
}

async function addAdminChatMsg(uid, text) {
  await addDoc(collection(db, "chats", uid, "messages"), {
    text,
    from: "admin",
    timestamp: Date.now()
  });
}

// Logout
const logoutLink = document.getElementById('logout-link');
if (logoutLink) {
  logoutLink.addEventListener('click', function (e) {
    e.preventDefault();
    signOut(auth).then(() => window.location.href = "../login/login.html?logout=1");
  });
}