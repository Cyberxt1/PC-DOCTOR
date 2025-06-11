// TechFix User Dashboard - User can send complaints AND live chat with admin if admin initiates chat

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
  collection
} from "https://www.gstatic.com/firebasejs/11.9.0/firebase-firestore.js";

// --- Firebase Setup ---
const firebaseConfig = {
  apiKey: "AIzaSyB9aIZfqZvtfOSNUHGRSDXMyWDxWWS5NNs",
  authDomain: "techfix-ef115.firebaseapp.com",
  projectId: "techfix-ef115",
  storageBucket: "techfix-ef115.appspot.com",
  messagingSenderId: "798114675752",
  appId: "1:798114675752:web:33450b57585b4a643b891d",
  measurementId: "G-69MKL5ETH7"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

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

let currentUser = null;
let lastUnresolvedIssue = null;
let chatUnsub = null;

// --- Auth ---
onAuthStateChanged(auth, async user => {
  try {
    if (!user) {
      if (loading) loading.style.display = "none";
      if (dashboard) dashboard.classList.add("hidden");
      window.location.href = "../login/login.html";
      return;
    }
    currentUser = user;
    await syncUserProfile(user);
    if (loading) loading.style.display = "none";
    if (dashboard) dashboard.classList.remove("hidden");
    if (userDisplay) userDisplay.textContent = user.displayName || user.email || "User";
    listenToHistory();
    listenForActiveChat();
    window.addEventListener("beforeunload", updateLastOnline);
    setInterval(updateLastOnline, 60000);
  } catch (err) {
    if (loading) loading.textContent = "Error: " + err.message;
    if (dashboard) dashboard.classList.add("hidden");
    alert("Dashboard error: " + err.message);
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
    try {
      await updateDoc(doc(db, "users", currentUser.uid), {
        lastOnline: new Date().toISOString()
      });
    } catch (e) { /* ignore */ }
  }
}

// --- Logout ---
logoutBtn?.addEventListener("click", () =>
  signOut(auth).then(() => window.location.href = "../login/login.html")
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
  if (!currentUser) return window.location.href = "../login/login.html";
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
  if (!desc) return showMsg("Please describe your issue.");
  if (lastUnresolvedIssue && !lastUnresolvedIssue.resolved) {
    if (
      lastUnresolvedIssue.desc.trim().toLowerCase() === desc.toLowerCase() &&
      lastUnresolvedIssue.device === devType
    ) {
      return showMsg("You already have an unresolved issue with the same description and device.");
    }
  }
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
  if (!formMsg) return;
  formMsg.textContent = msg;
  formMsg.style.color = color;
  setTimeout(() => { if (formMsg) formMsg.textContent = ""; }, 4000);
}

// --- History Updates ---
function listenToHistory() {
  if (!currentUser) return;
  const ref = doc(db, "users", currentUser.uid);
  onSnapshot(ref, snap => {
    const data = snap.exists() ? snap.data() : { history: [] };
    const history = Array.isArray(data.history) ? data.history : [];
    lastUnresolvedIssue = history
      .filter(h => !h.resolved)
      .sort((a, b) => new Date(b.time) - new Date(a.time))[0] || null;
    historyList.innerHTML = history.length ? '' : '<li>No history yet.</li>';
    [...history]
      .sort((a, b) => new Date(b.time) - new Date(a.time))
      .forEach(h => {
        const status = h.resolved
          ? `<span style="color:#23a13a;font-weight:bold;vertical-align:middle;">
              <svg width="18" height="18" viewBox="0 0 20 20" fill="none" style="vertical-align:middle;"><circle cx="10" cy="10" r="10" fill="#23a13a"/><path d="M6.5 10.5L9 13L13.5 8.5" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
              Resolved</span>`
          : `<span style="color:#fa4d56;font-weight:bold;">Unresolved</span>`;
        const li = document.createElement("li");
        li.innerHTML = `[${new Date(h.time).toLocaleString()}] (${h.device}) - ${h.desc} [${h.details}] ${status}`;
        historyList.appendChild(li);
      });
  }, err => {
    historyList.innerHTML = `<li style="color:red">Error loading history</li>`;
  });
}

// --- Live Chat (User Side): Listen for messages on ANY unresolved issue ---
function listenForActiveChat() {
  if (!currentUser) return;
  // Find their latest unresolved issue
  const ref = doc(db, "users", currentUser.uid);
  onSnapshot(ref, async (snap) => {
    const userData = snap.exists() ? snap.data() : {};
    const history = Array.isArray(userData.history) ? userData.history : [];
    const unresolved = history.filter(h => !h.resolved).sort((a, b) => new Date(b.time) - new Date(a.time));
    if (!unresolved.length) {
      hideChatBox();
      return;
    }
    // Now, see if there are any admin messages for any unresolved issue
    const currentIssue = unresolved[0];
    showChatBox(currentIssue);
  });
}

function showChatBox(issue) {
  if (!chatSection) return;
  chatSection.style.display = "block";
  if (chatUnsub) chatUnsub();
  const ref = collection(db, "chats", currentUser.uid, "messages");
  chatUnsub = onSnapshot(ref, snap => {
    chatMessages.innerHTML = '';
    snap.docs
      .filter(d => d.data().issueTime === issue.time)
      .sort((a, b) => a.data().timestamp - b.data().timestamp)
      .forEach(d => {
        const m = d.data();
        const div = document.createElement("div");
        div.className = m.from === "user" ? "wa-chat-row wa-user" : "wa-chat-row wa-admin";
        div.innerHTML = `<span class="wa-bubble ${m.from === "user" ? "user" : "admin"}">${m.text}</span>`;
        chatMessages.appendChild(div);
      });
    chatMessages.scrollTop = chatMessages.scrollHeight;
  });

  // Enable chat input
  chatForm.style.display = "";
  chatInput.disabled = false;

  chatForm.onsubmit = async (e) => {
    e.preventDefault();
    if (!currentUser) return;
    const text = chatInput.value.trim();
    if (!text) return;
    await addDoc(collection(db, "chats", currentUser.uid, "messages"), {
      text,
      from: "user",
      timestamp: Date.now(),
      issueTime: issue.time
    });
    chatInput.value = "";
  };
}

function hideChatBox() {
  if (!chatSection) return;
  chatSection.style.display = "none";
  if (chatUnsub) chatUnsub();
  chatForm.style.display = "none";
}