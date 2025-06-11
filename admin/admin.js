// TechFix Admin Dashboard - with working Resolve & Chat and admin send message
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

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

let usersState = [];
let activeChat = null;
let chatUnsub = null;

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
});

// --------- USER DATA ---------
function liveLoadUsers() {
  const usersCol = collection(db, "users");
  onSnapshot(usersCol, (snapshot) => {
    const users = [];
    snapshot.forEach(docSnap => {
      const data = docSnap.data();
      users.push({ ...data, id: docSnap.id });
    });
    usersState = users;
    updateStats(users);
    updateDeviceTable(users);
    updateLogsTable(users);
    updateAlerts(users);
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
    if (Array.isArray(user.history)) {
      user.history
        .filter(issue => !issue.resolved)
        .forEach(issue => {
          const tr = document.createElement('tr');
          let deviceLabel = issue.device === 'laptop'
            ? (issue.details.match(/Processor: (.*?),/) ? issue.details.match(/Processor: (.*?),/)[1] : "Laptop")
            : (issue.device === 'phone'
              ? (issue.details.match(/Model: (.*)/) ? issue.details.match(/Model: (.*)/)[1] : "Phone")
              : "Other");
          tr.innerHTML = `
            <td>${deviceLabel}</td>
            <td><span class="badge issues">Pending</span></td>
            <td>${formatDate(issue.time)}</td>
            <td>${user.email}</td>
          `;
          deviceStatusTbody.appendChild(tr);
        });
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
        ${entry.resolved
          ? `<span class="badge healthy" style="padding:6px 12px;">Resolved</span>`
          : `<button class="resolve-btn" data-uid="${entry.uid}" data-time="${entry.time}"
              style="background:#fa4d56;color:#fff;font-weight:600;border:none;border-radius:6px;padding:6px 14px;cursor:pointer;box-shadow:0 1px 3px #0001;">
              Mark as Resolved
            </button>`
        }
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
  // Mark user's issue as resolved
  const userDocRef = doc(db, "users", userId);
  const userDoc = await getDoc(userDocRef);
  const userData = userDoc.data();
  let history = Array.isArray(userData.history) ? userData.history : [];
  const idx = history.findIndex(e => e.time === entryTime);
  if (idx > -1) {
    history[idx].resolved = true;
    await updateDoc(userDocRef, { history });
  }
  // Close chat if necessary
  if (activeChat && activeChat.uid === userId && activeChat.time === entryTime) {
    closeChat();
  }
}

function formatDate(isoString) {
  if (!isoString) return "";
  const d = new Date(isoString);
  return d.toLocaleString();
}

// --------- ALERT CENTER ---------
function updateAlerts(users) {
  // Show ALL unresolved issues in alert center
  alertList.innerHTML = "";
  let unresolved = [];
  users.forEach(user => {
    if (Array.isArray(user.history)) {
      user.history
        .filter(issue => !issue.resolved)
        .forEach(issue => unresolved.push({
          ...issue,
          uid: user.id,
          email: user.email,
          displayName: user.displayName || user.email
        }));
    }
  });
  unresolved.sort((a, b) => new Date(b.time) - new Date(a.time));
  unresolved.forEach(issue => renderUnresolved(issue));
}

// Ensure user's complaint is first admin message for this issue
async function ensureComplaintIsFirstMessage(issue) {
  const chatColRef = collection(db, "chats", issue.uid, "messages");
  const chatSnap = await getDocs(chatColRef);
  const hasMsg = chatSnap.docs.some(doc =>
    doc.data().from === "admin" && doc.data().issueTime === issue.time
  );
  if (!hasMsg) {
    await addDoc(chatColRef, {
      text: `User complaint: ${issue.desc} (${issue.details})`,
      from: "admin",
      timestamp: Date.now(),
      issueTime: issue.time
    });
  }
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
        background:#2da654;color:#fff;
        border:none;border-radius:6px;
        font-weight:600;padding:6px 16px;
        margin-top:6px;cursor:pointer;
        font-size:.98em;
        box-shadow:0 1px 3px #0001;
        transition:background .2s;">
        Resolve & Chat
      </button>
    </div>
  `;
  alertList.appendChild(li);
  li.querySelector('.resolve-alert-btn').onclick = async () => {
    try {
      await ensureComplaintIsFirstMessage(issue);
      openAdminChat(issue);
    } catch (err) {
      alert("Error starting chat: " + err.message);
      console.error(err);
    }
  };
}

// --------- CHAT ---------
function openAdminChat(issue) {
  activeChat = issue;
  chatWindow.innerHTML = `
    <div class="chatbox" style="background:#f9f9fa;border-radius:15px;box-shadow:0 2px 18px #0002;padding:0 0 10px 0;margin:8px 0 0 0;max-width:520px;">
      <div style="border-bottom:1px solid #e8e8e8;padding:12px 18px 10px 18px;font-weight:500;background:#fff;border-top-left-radius:15px;border-top-right-radius:15px;">
        <span>&#128172; Chat with <span style="color:#16b978;font-weight:600;">${issue.displayName}</span></span>
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
  loadAdminChat(issue.uid, issue.time);

  // Attach chat form handler after rendering
  const chatForm = document.getElementById('admin-chat-form');
  const chatInput = document.getElementById('input-chat-msg');
  chatForm.onsubmit = async (e) => {
    e.preventDefault();
    if (chatInput.value.trim()) {
      await addDoc(collection(db, "chats", issue.uid, "messages"), {
        text: chatInput.value.trim(),
        from: "admin",
        timestamp: Date.now(),
        issueTime: issue.time
      });
      chatInput.value = "";
    }
  };
  document.getElementById('resolve-in-chat-btn').onclick = async () => {
    await markIssueResolved(issue.uid, issue.time);
    closeChat();
  };
  document.getElementById('close-chat-btn').onclick = closeChat;
}
function loadAdminChat(uid, issueTime) {
  if (chatUnsub) chatUnsub();
  const adminChatMessages = document.getElementById("admin-chat-messages");
  chatUnsub = onSnapshot(
    collection(db, "chats", uid, "messages"),
    (snapshot) => {
      adminChatMessages.innerHTML = '';
      snapshot.docs
        .filter(docSnap => docSnap.data().issueTime === issueTime)
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
function closeChat() {
  activeChat = null;
  chatWindow.innerHTML = "";
  if (chatUnsub) chatUnsub();
}

// Logout
const logoutLink = document.getElementById('logout-link');
if (logoutLink) {
  logoutLink.addEventListener('click', function (e) {
    e.preventDefault();
    signOut(auth).then(() => window.location.href = "../login/login.html?logout=1");
  });
}


// Export Logs as CSV
document.getElementById('export-logs-btn').onclick = function() {
  // Gather logs (allIssues from updateLogsTable, or fetch again here)
  let rows = [["User Email","Device","Description","Details","Time","Resolved"]];
  usersState.forEach(user => {
    (user.history||[]).forEach(h => {
      rows.push([
        user.email,
        h.device||"",
        h.desc||"",
        h.details||"",
        h.time||"",
        h.resolved ? "Yes" : "No"
      ]);
    });
  });
  const csv = rows.map(r=>r.map(x=>`"${(x||'').replace(/"/g,'""')}"`).join(",")).join("\n");
  const blob = new Blob([csv], {type: 'text/csv'});
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = "techfix_logs.csv";
  link.click();
};

// Clear All Logs
document.getElementById('clear-logs-btn').onclick = async function() {
  if (!confirm("Are you sure you want to clear ALL logs for all users? This cannot be undone!")) return;
  for (let user of usersState) {
    if (user.id) {
      await updateDoc(doc(db, "users", user.id), { history: [] });
    }
  }
  alert("All logs cleared.");
};