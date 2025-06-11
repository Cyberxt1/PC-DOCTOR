// TechFix Admin Dashboard - Only ONE active issue at a time, resolve flow, auto-log update, first complaint as admin message
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
  updateDoc,
  addDoc
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
const statTotalUsers = document.querySelectorAll('.stat-value')[0];
const statActiveSessions = document.querySelectorAll('.stat-value')[1];
const statFlagged = document.querySelectorAll('.stat-value')[2];
const statAdmins = document.querySelectorAll('.stat-value')[3];
const deviceStatusTbody = document.getElementById('device-status-tbody');
const logsTbody = document.getElementById('logs-tbody');
const alertList = document.querySelector('.alert-list');
const chatWindow = document.querySelector('.chat-window');
let chatInput = document.getElementById('input-chat-msg');

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

let chatUnsub = null;
let currentActiveAlertId = null;
let currentChatUid = null;

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

function updateStats(users) {
  statTotalUsers.textContent = users.length;
  statAdmins.textContent = users.filter(u => ADMIN_EMAILS.includes(u.email)).length;
  statActiveSessions.textContent = Math.floor(users.length * 0.25) + 1;
  statFlagged.textContent = users.filter(u => u.flagged).length;
}

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

function formatDate(isoString) {
  if (!isoString) return "";
  const d = new Date(isoString);
  return d.toLocaleString();
}

// --- Alert Center: Only show unresolved, only one can be active! ---
function listenAlerts() {
  // Listen for unresolved alerts, but only allow one 'in-progress' at a time
  onSnapshot(
    query(collection(db, "alerts"), where("status", "in", ["new", "in-progress"])),
    async snapshot => {
      alertList.innerHTML = '';
      let inProgressDoc = null;
      let unresolvedDocs = [];
      snapshot.forEach(docSnap => {
        const alert = docSnap.data();
        if (alert.status === "in-progress") {
          inProgressDoc = { id: docSnap.id, ...alert };
        } else if (alert.status === "new") {
          unresolvedDocs.push({ id: docSnap.id, ...alert });
        }
      });

      // Only allow one in-progress at a time
      if (inProgressDoc) {
        // Show only the in-progress alert with chat/finish
        renderAlertInProgress(inProgressDoc);
      } else {
        // Show all unresolved/new alerts with resolve button
        unresolvedDocs.forEach(alert => renderAlertToResolve(alert));
      }
    }
  );
}

function renderAlertToResolve(alert) {
  const li = document.createElement('li');
  li.innerHTML = `
    <strong>${alert.email}</strong>: ${alert.desc}<br>
    <span style="font-size:0.9em;color:#888;">[${alert.device}] ${alert.details || ""}</span><br>
    <button data-id="${alert.id}" class="resolve-alert-btn">Resolve</button>
  `;
  alertList.appendChild(li);

  li.querySelector('.resolve-alert-btn').onclick = async () => {
    // Set all other alerts to 'new' if any are in-progress (shouldn't be, but for safety)
    await setOnlyOneInProgress(alert.id);
    await openAdminChat(alert.id, true);
  };
}

function renderAlertInProgress(alert) {
  const li = document.createElement('li');
  li.innerHTML = `
    <strong>${alert.email}</strong>: ${alert.desc}<br>
    <span style="font-size:0.9em;color:#888;">[${alert.device}] ${alert.details || ""}</span><br>
    <b>Status:</b> In Progress<br>
    <button data-id="${alert.id}" class="chat-alert-btn">Open Chat</button>
    <button data-id="${alert.id}" class="finish-alert-btn">Mark as Resolved</button>
  `;
  alertList.appendChild(li);

  li.querySelector('.chat-alert-btn').onclick = () => openAdminChat(alert.id, false);
  li.querySelector('.finish-alert-btn').onclick = async () => {
    await markAlertResolved(alert.id, alert.uid, alert.time);
  };
}

// Ensure only the given alert is in-progress. Others revert to 'new'.
async function setOnlyOneInProgress(alertId) {
  // Get all alerts with 'in-progress'
  const q = query(collection(db, "alerts"), where("status", "==", "in-progress"));
  const snapshot = await getDocs(q);
  for (const docSnap of snapshot.docs) {
    if (docSnap.id !== alertId) {
      await updateDoc(doc(db, "alerts", docSnap.id), { status: "new", admin: null });
    }
  }
  // Set this alert to in-progress
  await updateDoc(doc(db, "alerts", alertId), { status: "in-progress", admin: auth.currentUser.email });
}

// --- Open chat and send user's complaint as admin's first message if starting to resolve ---
async function openAdminChat(alertId, sendFirstComplaint = false) {
  const alertSnap = await getDoc(doc(db, "alerts", alertId));
  const alert = alertSnap.data();
  currentActiveAlertId = alertId;
  currentChatUid = alert.uid;
  chatWindow.innerHTML = `
    <b>Chat with ${alert.email} about: ${alert.desc}</b>
    <hr>
    <div id="admin-chat-messages" style="height:200px;overflow-y:auto;background:#f6f6f6;padding:10px;border-radius:5px;margin-bottom:7px;"></div>
    <input type="text" id="input-chat-msg" placeholder="Type your message..." />
  `;
  chatInput = document.getElementById('input-chat-msg');
  loadAdminChat(alert.uid);

  // If admin is starting to resolve, send first message as user's complaint
  if (sendFirstComplaint) {
    // Check if chat already has messages
    const chatColRef = collection(db, "chats", alert.uid, "messages");
    const chatSnap = await getDocs(chatColRef);
    if (chatSnap.empty) {
      // Send user's complaint as first message from admin
      await addAdminChatMsg(alert.uid, `User complaint: ${alert.desc} (${alert.details})`);
    }
  }

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

// --- Mark alert as resolved, auto-update logs ---
async function markAlertResolved(alertId, uid, time) {
  // Set alert resolved
  await updateDoc(doc(db, "alerts", alertId), { status: "resolved" });

  // Update the user's history as resolved (in logs)
  const userDocRef = doc(db, "users", uid);
  const userDoc = await getDoc(userDocRef);
  const userData = userDoc.data();
  if (userData && Array.isArray(userData.history)) {
    const idx = userData.history.findIndex(e => e.time === time);
    if (idx > -1) {
      userData.history[idx].resolved = true;
      await updateDoc(userDocRef, { history: userData.history });
    }
  }

  // Optionally, notify user in chat
  await addAdminChatMsg(uid, "Your issue has been marked as resolved. If you're satisfied, please mark as resolved in your chat.");
}

// Logout
const logoutLink = document.getElementById('logout-link');
if (logoutLink) {
  logoutLink.addEventListener('click', function (e) {
    e.preventDefault();
    signOut(auth).then(() => window.location.href = "../login/login.html?logout=1");
  });
}

// Needed for getDocs
import { getDocs } from "https://www.gstatic.com/firebasejs/11.9.0/firebase-firestore.js";