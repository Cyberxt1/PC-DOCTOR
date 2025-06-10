// TechFix Admin Dashboard - styled new alerts, styled chat, real-time reply, remove resolved from alerts
import { initializeApp } from "https://www.gstatic.com/firebasejs/11.9.0/firebase-app.js";
import {
  getAuth, onAuthStateChanged, signOut
} from "https://www.gstatic.com/firebasejs/11.9.0/firebase-auth.js";
import {
  getFirestore,
  collection,
  onSnapshot,
  doc,
  getDoc,
  updateDoc,
  addDoc
} from "https://www.gstatic.com/firebasejs/11.9.0/firebase-firestore.js";
import { getDocs } from "https://www.gstatic.com/firebasejs/11.9.0/firebase-firestore.js";

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
let currentChatUid = null;
let currentIssue = null;

// --------- AUTH ---------
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
  listenAllUnresolvedIssues();
});

// --------- USER DATA ---------
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

// --------- ALERT CENTER ---------
function listenAllUnresolvedIssues() {
  onSnapshot(collection(db, "users"), snapshot => {
    let unresolved = [];
    snapshot.forEach(docSnap => {
      const user = docSnap.data();
      if (Array.isArray(user.history)) {
        user.history.forEach(issue => {
          if (!issue.resolved) {
            unresolved.push({
              ...issue,
              uid: user.uid,
              email: user.email,
              displayName: user.displayName || user.email,
            });
          }
        });
      }
    });
    unresolved.sort((a, b) => new Date(b.time) - new Date(a.time));
    alertList.innerHTML = '';
    if (currentIssue) {
      renderActiveIssue(currentIssue);
    } else {
      unresolved.forEach(issue => renderUnresolved(issue));
    }
  });
}

function renderUnresolved(issue) {
  const li = document.createElement('li');
  li.innerHTML = `
    <div class="alert-card" style="
      background:#fff; 
      border-radius:12px; 
      box-shadow:0 2px 12px #0001; 
      margin:18px 0 10px 0; 
      padding:18px 18px 10px 18px; 
      border-left:5px solid #fa4d56; 
      position:relative;">
      <div style="font-weight:600;font-size:1.13em;color:#24292f;">
        <span style="color:#fa4d56;">&#9888;</span> ${issue.displayName}
      </div>
      <div style="margin:6px 0 0 0;">${issue.desc}</div>
      <div style="color:#888;font-size:.98em;margin-bottom:6px;">[${issue.device}] ${issue.details || ""}</div>
      <button class="resolve-alert-btn" style="
        background:#fa4d56;color:#fff;
        border:none;border-radius:6px;
        font-weight:600;padding:6px 16px;
        margin-top:6px;cursor:pointer;
        font-size:.98em;
        box-shadow:0 1px 3px #0001;
        transition:background .2s;">
        Resolve
      </button>
    </div>
  `;
  alertList.appendChild(li);
  li.querySelector('.resolve-alert-btn').onclick = async () => {
    currentIssue = issue;
    renderActiveIssue(issue);
    await ensureComplaintIsFirstMessage(issue);
    openAdminChat(issue.uid, issue);
  };
}

function renderActiveIssue(issue) {
  alertList.innerHTML = '';
  const li = document.createElement('li');
  li.innerHTML = `
    <div class="alert-card" style="
      background:#e8ffe6;
      border-radius:12px; 
      box-shadow:0 2px 12px #0001;
      margin:18px 0 10px 0;
      padding:18px 18px 10px 18px;
      border-left:5px solid #16b978; 
      position:relative;">
      <div style="font-weight:600;font-size:1.13em;color:#24292f;">
        <span style="color:#16b978;">&#128172;</span> ${issue.displayName}
      </div>
      <div style="margin:6px 0 0 0;">${issue.desc}</div>
      <div style="color:#888;font-size:.98em;margin-bottom:6px;">[${issue.device}] ${issue.details || ""}</div>
      <div style="margin:8px 0 2px 0;">
        <button class="chat-alert-btn" style="background:#16b978;color:#fff;font-weight:600;border:none;border-radius:6px;padding:6px 16px;cursor:pointer;margin-right:8px;">Open Chat</button>
        <button class="finish-alert-btn" style="background:#333;color:#fff;font-weight:600;border:none;border-radius:6px;padding:6px 16px;cursor:pointer;">Mark as Resolved</button>
      </div>
    </div>
  `;
  alertList.appendChild(li);
  li.querySelector('.chat-alert-btn').onclick = () => openAdminChat(issue.uid, issue);
  li.querySelector('.finish-alert-btn').onclick = async () => {
    await markIssueResolved(issue.uid, issue.time);
    currentIssue = null;
    chatWindow.innerHTML = '';
  };
}

// --------- CHAT ---------
async function ensureComplaintIsFirstMessage(issue) {
  const chatColRef = collection(db, "chats", issue.uid, "messages");
  const chatSnap = await getDocs(chatColRef);
  if (chatSnap.empty) {
    await addAdminChatMsg(issue.uid, `User complaint: ${issue.desc} (${issue.details})`);
  }
}

function openAdminChat(uid, issue) {
  chatWindow.innerHTML = `
    <div class="chatbox" style="background:#f9f9fa;border-radius:15px;box-shadow:0 2px 18px #0002;padding:0 0 10px 0;margin:8px 0 0 0;max-width:520px;">
      <div style="border-bottom:1px solid #e8e8e8;padding:12px 18px 10px 18px;font-weight:500;background:#fff;border-top-left-radius:15px;border-top-right-radius:15px;">
        <span>&#128172; Chat with <span style="color:#16b978;font-weight:600;">${issue ? issue.displayName : ''}</span></span>
      </div>
      <div id="admin-chat-messages" style="height:220px;overflow-y:auto;padding:15px 18px 5px 18px;background:#f9f9fa;"></div>
      <form id="admin-chat-form" style="display:flex;gap:8px;padding:0 14px 0 14px;margin-top:8px;">
        <input type="text" id="input-chat-msg" style="flex:1;padding:10px;border-radius:7px;border:1px solid #cacaca;font-size:1em;" placeholder="Type your message..." autocomplete="off" required />
        <button type="submit" style="background:#16b978;color:#fff;font-weight:600;border:none;border-radius:7px;padding:8px 19px;cursor:pointer;">Send</button>
      </form>
    </div>
  `;
  chatInput = document.getElementById('input-chat-msg');
  loadAdminChat(uid);
  const chatForm = document.getElementById('admin-chat-form');
  chatForm.onsubmit = async (e) => {
    e.preventDefault();
    if (chatInput.value.trim()) {
      await addAdminChatMsg(uid, chatInput.value.trim());
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
          const isAdmin = msg.from === "admin";
          const msgDiv = document.createElement('div');
          msgDiv.style.display = 'flex';
          msgDiv.style.justifyContent = isAdmin ? "flex-end" : "flex-start";
          msgDiv.style.margin = "5px 0";
          msgDiv.innerHTML = `
            <span style="
              display:inline-block;
              padding:9px 14px;
              border-radius:20px;
              background:${isAdmin ? "#16b978" : "#e2e2e2"};
              color:${isAdmin ? "#fff" : "#222"};
              font-size:1.01em;
              max-width:78%;
              word-break:break-word;
              box-shadow:0 1px 2px #0001;">
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