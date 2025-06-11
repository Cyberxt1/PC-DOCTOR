// TechFix Admin Dashboard -- ALL unresolved alerts visible, click to chat, resolve inside chat
import { initializeApp } from "https://www.gstatic.com/firebasejs/11.9.0/firebase-app.js";
import {
  getAuth, onAuthStateChanged, signOut
} from "https://www.gstatic.com/firebasejs/11.9.0/firebase-auth.js";
import {
  getFirestore,
  collection,
  query,
  onSnapshot,
  doc,
  getDoc,
  updateDoc,
  addDoc,
  orderBy
} from "https://www.gstatic.com/firebasejs/11.9.0/firebase-firestore.js";

// ---- CONFIG ----
const firebaseConfig = {
  apiKey: "AIzaSyB9aIZfqZvtfOSNUHGRSDXMyWDxWWS5NNs",
  authDomain: "techfix-ef115.firebaseapp.com",
  projectId: "techfix-ef115",
  storageBucket: "techfix-ef115.appspot.com",
  messagingSenderId: "798114675752",
  appId: "1:798114675752:web:33450b57585b4a643b891d",
  measurementId: "G-69MKL5ETH7"
};

const ADMIN_EMAILS = [
  "oluokundavid4@gmail.com"
];

// ---- DOM ----
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

// ---- FIREBASE ----
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

let activeChat = null; // active alert object
let chatUnsub = null;

// ---- AUTH ----
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
  loadAlerts();
});

// ---- USER DATA (stats/tables) ----
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

// ---- ALERTS & CHAT ----
function loadAlerts() {
  const alertsRef = collection(db, "alerts");
  const q = query(alertsRef, orderBy("time", "desc"));
  onSnapshot(q, (snapshot) => {
    alertList.innerHTML = "";
    const unresolvedAlerts = [];
    snapshot.forEach(docSnap => {
      const alert = docSnap.data();
      alert.id = docSnap.id;
      // ALL alerts except "resolved" show up
      if (alert.status !== "resolved") {
        unresolvedAlerts.push(alert);
      }
    });
    // Remove chat if alert was resolved elsewhere
    if (activeChat && !unresolvedAlerts.some(a => a.id === activeChat.id)) {
      closeChat();
    }
    unresolvedAlerts.forEach(alert => renderAlert(alert));
  });
}

function renderAlert(alert) {
  // Show status badge for clarity
  const statusColor = alert.status === "new"
    ? "#fa4d56" : alert.status === "pending"
    ? "#f1c21b" : "#16b978";
  const statusLabel = alert.status.charAt(0).toUpperCase() + alert.status.slice(1);

  const li = document.createElement('li');
  li.className = "alert-card";
  li.style = "background:#fff; border-radius:12px; margin:10px 0; padding:16px; border-left:5px solid #fa4d56;";
  li.innerHTML = `
    <div>
      <b>${alert.email}</b>
      <span style="color:#888;">(${alert.device})</span>
      <span style="margin-left:14px;padding:2px 13px 2px 13px;border-radius:8px;font-size:.98em;background:${statusColor};color:#fff;">
        ${statusLabel}
      </span>
    </div>
    <div style="margin:6px 0;">${alert.desc}</div>
    <div style="color:#888;font-size:.98em;">${alert.details || ""}</div>
    <button class="open-chat-btn" style="margin-top:10px;padding:6px 16px;border-radius:6px;background:${activeChat&&activeChat.id===alert.id?"#16b978":"#fa4d56"};color:#fff;border:none;">
      ${activeChat && activeChat.id === alert.id ? "Chatting..." : "Chat & Resolve"}
    </button>
  `;
  alertList.appendChild(li);

  li.querySelector('.open-chat-btn').onclick = () => {
    openChat(alert);
  };
}

function openChat(alert) {
  if (activeChat && activeChat.id === alert.id) return; // already open
  activeChat = alert;
  renderChatWindow(alert);
}

function renderChatWindow(alert) {
  chatWindow.innerHTML = `
    <div style="background:#f9f9fa;border-radius:12px;padding:0 0 10px 0;max-width:500px;">
      <div style="border-bottom:1px solid #e8e8e8;padding:12px 18px 10px 18px;font-weight:500;background:#fff;">
        <span>Chat with <span style="color:#16b978;font-weight:600;">${alert.email}</span></span>
      </div>
      <div id="admin-chat-messages" style="height:220px;overflow-y:auto;padding:15px 18px 5px 18px;background:#f9f9fa;"></div>
      <form id="admin-chat-form" style="display:flex;gap:8px;padding:0 14px 0 14px;margin-top:8px;">
        <input type="text" id="input-chat-msg" style="flex:1;padding:10px;border-radius:7px;border:1px solid #cacaca;font-size:1em;" placeholder="Type your message..." autocomplete="off" required />
        <button type="submit" style="background:#16b978;color:#fff;font-weight:600;border:none;border-radius:7px;padding:8px 19px;cursor:pointer;">Send</button>
        <button type="button" id="resolve-in-chat-btn" style="background:#fa4d56;color:#fff;font-weight:600;border:none;border-radius:7px;padding:8px 19px;cursor:pointer;margin-left:6px;">Mark as Resolved</button>
      </form>
      <button id="close-chat-btn" style="background:#777;color:#fff;font-weight:600;border:none;border-radius:7px;padding:8px 19px;cursor:pointer;margin:16px 0 0 16px;">Close Chat</button>
    </div>
  `;
  loadChat(alert.uid);

  // Send message
  document.getElementById('admin-chat-form').onsubmit = async (e) => {
    e.preventDefault();
    const chatInput = document.getElementById('input-chat-msg');
    if (!chatInput.value.trim()) return;
    await addDoc(collection(db, "chats", alert.uid, "messages"), {
      text: chatInput.value.trim(),
      from: "admin",
      timestamp: Date.now()
    });
    chatInput.value = "";
  };
  // Mark as resolved in chat
  document.getElementById('resolve-in-chat-btn').onclick = async () => {
    await resolveAlert(alert);
    closeChat();
  };
  // Just close the chat window, don't resolve
  document.getElementById('close-chat-btn').onclick = closeChat;
}

function loadChat(uid) {
  if (chatUnsub) chatUnsub();
  const adminChatMessages = document.getElementById("admin-chat-messages");
  chatUnsub = onSnapshot(
    collection(db, "chats", uid, "messages"),
    (snapshot) => {
      adminChatMessages.innerHTML = '';
      snapshot.docs
        .sort((a, b) => a.data().timestamp - b.data().timestamp)
        .forEach(docSnap => {
          const msg = docSnap.data();
          const isAdmin = msg.from === "admin";
          const msgDiv = document.createElement('div');
          msgDiv.className = isAdmin ? "wa-chat-row wa-admin" : "wa-chat-row wa-user";
          msgDiv.innerHTML = `<span class="wa-bubble ${isAdmin ? "admin" : "user"}">${msg.text}</span>`;
          adminChatMessages.appendChild(msgDiv);
        });
      adminChatMessages.scrollTop = adminChatMessages.scrollHeight;
    }
  );
}

async function resolveAlert(alert) {
  // 1. Mark alert as resolved
  await updateDoc(doc(db, "alerts", alert.id), { status: "resolved" });
  // 2. Mark user's matching history entry as resolved (if any)
  if (alert.uid && alert.time) {
    const userDocRef = doc(db, "users", alert.uid);
    const userDoc = await getDoc(userDocRef);
    if (userDoc.exists()) {
      const userData = userDoc.data();
      if (Array.isArray(userData.history)) {
        const idx = userData.history.findIndex(e => e.time === alert.time);
        if (idx > -1) {
          userData.history[idx].resolved = true;
          await updateDoc(userDocRef, { history: userData.history });
        }
      }
    }
  }
}

function closeChat() {
  activeChat = null;
  chatWindow.innerHTML = "";
  if (chatUnsub) chatUnsub();
}

// ---- LOGOUT ----
const logoutLink = document.getElementById('logout-link');
if (logoutLink) {
  logoutLink.addEventListener('click', function (e) {
    e.preventDefault();
    signOut(auth).then(() => window.location.href = "../login/login.html?logout=1");
  });
}