// TechFix User Dashboard - Optimized
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
  where,
  getDocs
} from "https://www.gstatic.com/firebasejs/11.9.0/firebase-firestore.js";

// --- Firebase Setup ---
const firebaseConfig = { /* your config */ };
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// --- DOM Elements ---
const $ = id => document.getElementById(id);
const loading = $("loading");
const dashboard = $("dashboard");
const userDisplay = $("user-display");
const logoutBtn = $("logout-btn");
const tabBtns = document.querySelectorAll(".tab-btn");
const tabContents = document.querySelectorAll(".tab-content");
const deviceType = $("device-type");
const deviceDetails = $("device-details");
const issueForm = $("issue-form");
const formMsg = $("form-msg");
const historyList = $("history-list");
const chatSection = $("chat");
const chatMessages = $("chat-messages");
const chatForm = $("chat-form");
const chatInput = $("chat-input");

// --- State ---
let currentUser = null;
let currentAlertId = null;
let chatUnsub = null;
let alertUnsub = null;

// --- Authentication Listener ---
onAuthStateChanged(auth, async user => {
  if (!user) return location.href = "../login/login.html";
  currentUser = user;
  try {
    await syncUserProfile(user);
    loading.style.display = "none";
    dashboard.classList.remove("hidden");
    userDisplay.textContent = user.displayName || user.email;

    listenToHistory();
    listenToAlerts();
    window.addEventListener("beforeunload", updateLastOnline);
    setInterval(updateLastOnline, 60000);
  } catch (err) {
    alert("Dashboard error: " + err.message);
    loading.textContent = "Error: " + err.message;
  }
});

async function syncUserProfile(user) {
  const ref = doc(db, "users", user.uid);
  const snap = await getDoc(ref);
  const data = {
    uid: user.uid,
    displayName: user.displayName || "",
    email: user.email || "",
    photoURL: user.photoURL || "",
    lastOnline: new Date().toISOString()
  };
  if (!snap.exists()) {
    await setDoc(ref, { ...data, history: [] });
  } else {
    await updateDoc(ref, data);
  }
}

async function updateLastOnline() {
  if (currentUser) {
    await updateDoc(doc(db, "users", currentUser.uid), {
      lastOnline: new Date().toISOString()
    }).catch(() => {});
  }
}

// --- Logout ---
logoutBtn?.addEventListener("click", () =>
  signOut(auth).then(() => location.href = "../login/login.html")
);

// --- Tabs Navigation ---
tabBtns.forEach(btn => {
  btn.onclick = () => {
    tabBtns.forEach(b => b.classList.remove("active"));
    tabContents.forEach(tc => tc.classList.remove("active"));
    btn.classList.add("active");
    $(btn.dataset.tab).classList.add("active");
  };
});

// --- Device Details ---
deviceType?.addEventListener("change", () => {
  const type = deviceType.value;
  deviceDetails.innerHTML = {
    phone: `
      <label for="phone-model">Phone Model</label>
      <select id="phone-model" required>
        <option value="">Select model</option>
        <option>Samsung Galaxy S23</option>
        <option>iPhone 14</option>
        <option>Infinix Hot 40</option>
        <option>Other</option>
      </select>`,
    laptop: `
      <label for="laptop-processor">Processor Info</label>
      <input id="laptop-processor" type="text" required>
      <label for="laptop-os">Operating System</label>
      <input id="laptop-os" type="text" required>`
  }[type] || '';
});

// --- Submit Issue Form ---
issueForm?.addEventListener("submit", async e => {
  e.preventDefault();
  if (!currentUser) return location.href = "../login/login.html";

  const desc = $("issue-desc").value.trim();
  const devType = deviceType.value;
  let details = '';

  if (devType === "phone") {
    const model = $("phone-model")?.value;
    if (!model) return showMsg("Select your phone model.");
    details = `Phone Model: ${model}`;
  } else if (devType === "laptop") {
    const proc = $("laptop-processor")?.value;
    const os = $("laptop-os")?.value;
    if (!proc || !os) return showMsg("Fill in all laptop details.");
    details = `Processor: ${proc}, OS: ${os}`;
  } else return showMsg("Choose a device type.");

  const time = new Date().toISOString();
  const entry = { time, device: devType, desc, details, resolved: false };

  try {
    const ref = doc(db, "users", currentUser.uid);
    await updateDoc(ref, { history: arrayUnion(entry) });
    await addDoc(collection(db, "alerts"), {
      uid: currentUser.uid,
      email: currentUser.email,
      desc, details, device: devType, time,
      status: "new", userConfirmed: false
    });
    showMsg("Issue submitted! We'll review it shortly.", "#3a5f3a");
    issueForm.reset(); deviceDetails.innerHTML = '';
  } catch (err) {
    showMsg("Error: " + err.message);
  }
});

function showMsg(msg, color = "#f44") {
  formMsg.textContent = msg;
  formMsg.style.color = color;
  setTimeout(() => formMsg.textContent = "", 4000);
}

// --- History Updates ---
function listenToHistory() {
  const ref = doc(db, "users", currentUser.uid);
  onSnapshot(ref, snap => {
    const history = snap.data()?.history || [];
    historyList.innerHTML = history.length ? '' : '<li>No history yet.</li>';
    [...history].sort((a, b) => new Date(b.time) - new Date(a.time)).forEach(h => {
      const status = h.resolved
        ? `<span style="color:#23a13a;font-weight:bold;"><svg ...></svg> Resolved</span>`
        : `<span style="color:#fa4d56;font-weight:bold;">Unresolved</span>`;
      const li = document.createElement("li");
      li.innerHTML = `[${new Date(h.time).toLocaleString()}] (${h.device}) - ${h.desc} [${h.details}] ${status}`;
      historyList.appendChild(li);
    });
  });
}

// --- Live Alerts & Chat ---
function listenToAlerts() {
  if (alertUnsub) alertUnsub();
  const q = query(collection(db, "alerts"),
    where("uid", "==", currentUser.uid),
    where("status", "in", ["in-progress", "resolved"])
  );
  alertUnsub = onSnapshot(q, snap => {
    let active = false;
    snap.forEach(docSnap => {
      const alert = docSnap.data();
      if (!active) {
        currentAlertId = docSnap.id;
        showChatBox(alert.status === "resolved", alert.userConfirmed);
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
  const ref = collection(db, "chats", currentUser.uid, "messages");
  chatUnsub = onSnapshot(ref, snap => {
    chatMessages.innerHTML = '';
    snap.docs.sort((a, b) => a.data().timestamp - b.data().timestamp).forEach(d => {
      const m = d.data();
      const div = document.createElement("div");
      div.style.cssText = `display:flex; justify-content:${m.from === "user" ? "flex-end" : "flex-start"}; margin:5px 0`;
      div.innerHTML = `<span class="chat-message ${m.from}">${m.text}</span>`;
      chatMessages.appendChild(div);
    });
    chatMessages.scrollTop = chatMessages.scrollHeight;
  });

  const resolveBtn = $("user-resolve-btn");
  if (isResolved && !userConfirmed && !resolveBtn) {
    const btn = document.createElement("button");
    btn.id = "user-resolve-btn";
    btn.textContent = "Mark as Resolved";
    Object.assign(btn.style, {
      display: "block", margin: "15px auto", padding: "8px 18px",
      background: "#2da654", color: "#fff", border: "none",
      borderRadius: "7px", cursor: "pointer"
    });
    btn.onclick = () => {
      updateDoc(doc(db, "alerts", currentAlertId), { userConfirmed: true });
      btn.remove();
    };
    chatSection.appendChild(btn);
  } else if (resolveBtn) resolveBtn.remove();
}

function hideChatBox() {
  chatSection.style.display = "none";
  if (chatUnsub) chatUnsub();
  $("user-resolve-btn")?.remove();
}

// --- Send Chat Message ---
chatForm?.addEventListener("submit", async e => {
  e.preventDefault();
  if (!currentUser || !currentAlertId) return;
  const text = chatInput.value.trim();
  if (!text) return;

  const ref = collection(db, "chats", currentUser.uid, "messages");

  const q = query(ref, where("from", "==", "user"));
  const snap = await getDocs(q);
  const messages = snap.docs.map(d => d.data()).sort((a, b) => b.timestamp - a.timestamp);
  if (messages[0]?.text === text) {
    alert("You already sent this message.");
    return;
  }

  await addDoc(ref, {
    text,
    from: "user",
    timestamp: Date.now()
  });
  chatInput.value = "";
});
