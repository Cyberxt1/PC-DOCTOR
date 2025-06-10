// TechFix User Dashboard (REWRITTEN)
// Requires: Firebase Authentication and Firestore

import { initializeApp } from "https://www.gstatic.com/firebasejs/11.9.0/firebase-app.js";
import {
  getAuth, onAuthStateChanged, signOut
} from "https://www.gstatic.com/firebasejs/11.9.0/firebase-auth.js";
import {
  getFirestore,
  doc,
  setDoc,
  getDoc,
  updateDoc,
  arrayUnion,
  onSnapshot,
  addDoc,
  collection,
  query,
  where
} from "https://www.gstatic.com/firebasejs/11.9.0/firebase-firestore.js";

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

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// --- DOM Elements ---
const loading = document.getElementById("loading");
const dashboard = document.getElementById("dashboard");
const userDisplay = document.getElementById("user-display");
const logoutBtn = document.getElementById("logout-btn");
const tabBtns = document.querySelectorAll(".tab-btn");
const tabContents = document.querySelectorAll(".tab-content");
const deviceType = document.getElementById("device-type");
const deviceDetails = document.getElementById("device-details");
const issueForm = document.getElementById("issue-form");
const formMsg = document.getElementById("form-msg");
const historyList = document.getElementById("history-list");

// Chat
const chatSection = document.getElementById("chat");
const chatMessages = document.getElementById("chat-messages");
const chatForm = document.getElementById("chat-form");
const chatInput = document.getElementById("chat-input");

// --- State ---
let currentUser = null;
let currentAlertId = null;
let chatUnsub = null;
let alertUnsub = null;

// --- Auth State Check & User Data Sync ---
onAuthStateChanged(auth, async (user) => {
  if (user) {
    currentUser = user;
    try {
      await updateLastOnline();
      if (loading) loading.style.display = "none";
      if (dashboard) dashboard.classList.remove("hidden");
      userDisplay.textContent = user.displayName || user.email || "User";
      // Save/update user profile to Firestore
      const userDocRef = doc(db, "users", user.uid);
      const userSnapshot = await getDoc(userDocRef);
      if (!userSnapshot.exists()) {
        await setDoc(userDocRef, {
          uid: user.uid,
          displayName: user.displayName || "",
          email: user.email || "",
          photoURL: user.photoURL || "",
          history: [],
          lastOnline: new Date().toISOString()
        });
      } else {
        await updateDoc(userDocRef, {
          displayName: user.displayName || "",
          email: user.email || "",
          photoURL: user.photoURL || "",
          lastOnline: new Date().toISOString()
        });
      }
      listenToHistory();
      listenToAlerts();
      window.addEventListener("beforeunload", updateLastOnline);
      setInterval(updateLastOnline, 60000);
    } catch (err) {
      alert("Error loading dashboard: " + err.message);
      if (loading) loading.textContent = "Error: " + err.message;
    }
  } else {
    window.location.href = "../login/login.html";
  }
});

async function updateLastOnline() {
  if (!currentUser) return;
  try {
    await updateDoc(doc(db, "users", currentUser.uid), {
      lastOnline: new Date().toISOString()
    });
  } catch (err) {
    // ignore
  }
}

// --- Logout ---
logoutBtn?.addEventListener("click", () => {
  signOut(auth)
    .then(() => window.location.href = "../login/login.html")
    .catch((err) => alert("Sign out failed: " + err.message));
});

// --- Tabs Logic ---
tabBtns.forEach(btn => {
  btn.onclick = function() {
    tabBtns.forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    const tab = btn.getAttribute('data-tab');
    tabContents.forEach(cont => cont.classList.remove('active'));
    document.getElementById(tab).classList.add('active');
  };
});

// --- Dynamic Device Fields ---
deviceType?.addEventListener('change', function() {
  const v = deviceType.value;
  let html = '';
  if (v === 'phone') {
    html = `
      <label for="phone-model">Phone Model</label>
      <select id="phone-model" required>
        <option value="">Select model</option>
        <option>Samsung Galaxy S23</option>
        <option>iPhone 14</option>
        <option>Infinix Hot 40</option>
        <option>Other</option>
      </select>
    `;
  } else if (v === 'laptop') {
    html = `
      <label for="laptop-processor">Processor Info</label>
      <input id="laptop-processor" type="text" placeholder="e.g. Intel i5 11th Gen" required>
      <label for="laptop-os">Operating System Version</label>
      <input id="laptop-os" type="text" placeholder="e.g. Windows 11 Pro" required>
    `;
  }
  deviceDetails.innerHTML = html;
});

// --- Issue Form Submission (+ Creates Alert) ---
issueForm?.addEventListener('submit', async function(e) {
  e.preventDefault();
  if (!currentUser) {
    window.location.href = "../login/login.html";
    return;
  }
  const desc = document.getElementById('issue-desc').value.trim();
  const devType = deviceType.value;
  let details = '';
  if (devType === 'phone') {
    const model = document.getElementById('phone-model')?.value || '';
    if (!model) {
      formMsg.textContent = 'Please select your phone model.';
      formMsg.style.color = '#f44';
      return;
    }
    details = `Phone Model: ${model}`;
  } else if (devType === 'laptop') {
    const proc = document.getElementById('laptop-processor')?.value || '';
    const os = document.getElementById('laptop-os')?.value || '';
    if (!proc || !os) {
      formMsg.textContent = 'Please fill in all laptop details.';
      formMsg.style.color = '#f44';
      return;
    }
    details = `Processor: ${proc}, OS: ${os}`;
  }
  if (!desc || !devType) {
    formMsg.textContent = 'Please fill in all required fields.';
    formMsg.style.color = '#f44';
    return;
  }
  const entry = {
    time: new Date().toISOString(),
    device: devType,
    desc,
    details,
    resolved: false
  };
  try {
    const userDocRef = doc(db, "users", currentUser.uid);
    await updateDoc(userDocRef, {
      history: arrayUnion(entry)
    });
    // Add alert for admin
    await addDoc(collection(db, "alerts"), {
      uid: currentUser.uid,
      email: currentUser.email,
      desc,
      details,
      device: devType,
      time: entry.time,
      status: "new",
      userConfirmed: false
    });
    formMsg.textContent = 'Issue submitted! Our admin will review it shortly.';
    formMsg.style.color = '#3a5f3a';
    issueForm.reset();
    deviceDetails.innerHTML = '';
    setTimeout(() => formMsg.textContent = '', 3500);
  } catch (err) {
    formMsg.textContent = 'Error submitting issue: ' + err.message;
    formMsg.style.color = '#f44';
  }
});

// --- History List from Firestore ---
function listenToHistory() {
  if (!currentUser) return;
  const userDocRef = doc(db, "users", currentUser.uid);
  onSnapshot(userDocRef, (docSnap) => {
    const data = docSnap.data();
    historyList.innerHTML = '';
    if (data && data.history && data.history.length) {
      [...data.history].sort((a, b) => new Date(b.time) - new Date(a.time)).forEach(entry => {
        const li = document.createElement('li');
        let resolvedHTML = '';
        if (entry.resolved) {
          resolvedHTML = `<span style="color:#23a13a;font-weight:bold;margin-left:0.6em;"><svg width="18" height="18" style="vertical-align:middle;" viewBox="0 0 20 20" fill="none"><circle cx="10" cy="10" r="10" fill="#23a13a"/><path d="M6.5 10.5L9 13L13.5 8.5" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg> Resolved</span>`;
        } else {
          resolvedHTML = `<span style="color:#fa4d56;font-weight:bold;margin-left:0.6em;">Unresolved</span>`;
        }
        li.innerHTML = `[${(new Date(entry.time)).toLocaleString()}] (${entry.device}) - ${entry.desc} [${entry.details}] ${resolvedHTML}`;
        historyList.appendChild(li);
      });
    } else {
      historyList.innerHTML = '<li>No support history yet.</li>';
    }
  });
}

// --- Live Alerts: Show Chat if In-Progress, Handle Resolved State ---
function listenToAlerts() {
  if (!currentUser) return;
  if (alertUnsub) alertUnsub();
  const alertsQuery = query(
    collection(db, "alerts"),
    where("uid", "==", currentUser.uid),
    where("status", "in", ["in-progress", "resolved"])
  );
  alertUnsub = onSnapshot(alertsQuery, snapshot => {
    let active = false;
    let resolvedAlert = null;
    snapshot.forEach(docSnap => {
      const alert = docSnap.data();
      if (alert.status === "in-progress" && !active) {
        currentAlertId = docSnap.id;
        showChatBox();
        active = true;
      } else if (alert.status === "resolved" && !active) {
        currentAlertId = docSnap.id;
        showChatBox(true, alert.userConfirmed);
        resolvedAlert = alert;
        active = true;
      }
    });
    if (!active) {
      hideChatBox();
      currentAlertId = null;
    }
  });
}

function showChatBox(isResolved = false, userConfirmed = false) {
  chatSection.style.display = "block";
  if (chatUnsub) chatUnsub();
  const messagesCol = collection(db, "chats", currentUser.uid, "messages");
  chatUnsub = onSnapshot(messagesCol, (snapshot) => {
    chatMessages.innerHTML = '';
    snapshot.docs
      .sort((a, b) => a.data().timestamp - b.data().timestamp)
      .forEach(docSnap => {
        const msg = docSnap.data();
        const isUser = msg.from === "user";
        const msgDiv = document.createElement('div');
        msgDiv.style.display = 'flex';
        msgDiv.style.justifyContent = isUser ? "flex-end" : "flex-start";
        msgDiv.style.margin = "5px 0";
        msgDiv.innerHTML = `
          <span class="chat-message ${isUser ? "user" : "admin"}">
            ${msg.text}
          </span>
        `;
        chatMessages.appendChild(msgDiv);
      });
    chatMessages.scrollTop = chatMessages.scrollHeight;
  });
  // Show mark as resolved button if admin resolved and not yet confirmed
  let btn = document.getElementById("user-resolve-btn");
  if (isResolved && !userConfirmed) {
    if (!btn) {
      btn = document.createElement('button');
      btn.id = "user-resolve-btn";
      btn.textContent = "Mark as Resolved";
      btn.style.display = "block";
      btn.style.margin = "15px auto";
      btn.style.padding = "8px 18px";
      btn.style.background = "#2da654";
      btn.style.color = "#fff";
      btn.style.border = "none";
      btn.style.borderRadius = "7px";
      btn.style.cursor = "pointer";
      btn.onclick = async () => {
        if (!currentAlertId) return;
        await updateDoc(doc(db, "alerts", currentAlertId), { userConfirmed: true });
        btn.remove();
      };
      chatSection.appendChild(btn);
    }
  } else if (btn) {
    btn.remove();
  }
}

function hideChatBox() {
  chatSection.style.display = "none";
  if (chatUnsub) chatUnsub();
  let btn = document.getElementById("user-resolve-btn");
  if (btn) btn.remove();
}

// --- Chat Send ---
chatForm?.addEventListener('submit', async function(e) {
  e.preventDefault();
  if (!currentUser || !currentAlertId) return;
  const text = chatInput.value.trim();
  if (!text) return;
  const msg = {
    text,
    from: "user",
    timestamp: Date.now()
  };
  await addDoc(collection(db, "chats", currentUser.uid, "messages"), msg);
  chatInput.value = "";
});
