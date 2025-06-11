// TechFix User Dashboard - History, Troubleshoot, Ask AI, and always-on Chat with Admin/AI
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

// Firebase Setup
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
const livechatSection = $("livechat");
const livechatMessages = $("livechat-messages");
const livechatForm = $("livechat-form");
const livechatInput = $("livechat-input");

let currentUser = null;
let lastUnresolvedIssue = null;
let livechatUnsub = null;

// --- Auth ---
onAuthStateChanged(auth, async user => {
  try {
    if (!user) {
      loading.style.display = "none";
      dashboard.classList.add("hidden");
      window.location.href = "../login/login.html";
      return;
    }
    currentUser = user;
    await syncUserProfile(user);
    loading.style.display = "none";
    dashboard.classList.remove("hidden");
    userDisplay.textContent = user.displayName || user.email || "User";
    listenToHistory();
    window.addEventListener("beforeunload", updateLastOnline);
    setInterval(updateLastOnline, 60000);
  } catch (err) {
    loading.textContent = "Error: " + err.message;
    dashboard.classList.add("hidden");
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
    if (btn.dataset.tab === "livechat") {
      loadLiveChat();
    } else {
      if (livechatUnsub) livechatUnsub();
    }
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
  } else if (devType === "other") {
    details = "Other device";
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
          ? `<span class="resolved-tick">&#10003; Resolved</span>`
          : `<span class="unresolved-tag">Unresolved</span>`;
        const li = document.createElement("li");
        li.innerHTML = `[${new Date(h.time).toLocaleString()}] (${h.device}) - ${h.desc} [${h.details}] ${status}`;
        historyList.appendChild(li);
      });
  }, err => {
    historyList.innerHTML = `<li style="color:red">Error loading history</li>`;
  });
}

// --- Live Chat Tab: Always available, AI fallback until admin replies ---
async function loadLiveChat() {
  if (!currentUser) return;
  // Find latest unresolved issue for this user
  const ref = doc(db, "users", currentUser.uid);
  const snap = await getDoc(ref);
  const userData = snap.exists() ? snap.data() : {};
  const history = Array.isArray(userData.history) ? userData.history : [];
  const unresolved = history.filter(h => !h.resolved).sort((a, b) => new Date(b.time) - new Date(a.time));
  if (!unresolved.length) {
    livechatMessages.innerHTML = "<div style='color:#888'>No open issues to chat about.</div>";
    livechatForm.style.display = "none";
    return;
  }
  const issue = unresolved[0];
  livechatForm.style.display = "";
  livechatInput.disabled = false;

  // Listen to the chat for this issue
  if (livechatUnsub) livechatUnsub();
  livechatUnsub = onSnapshot(
    collection(db, "chats", currentUser.uid, "messages"),
    snap => {
      livechatMessages.innerHTML = '';
      let hasAdmin = false;
      snap.docs
        .filter(d => d.data().issueTime === issue.time)
        .sort((a, b) => a.data().timestamp - b.data().timestamp)
        .forEach(d => {
          const m = d.data();
          if (m.from === "admin") hasAdmin = true;
          // WhatsApp style bubbles
          const div = document.createElement("div");
          div.className = m.from === "user" ? "wa-chat-row wa-user" : "wa-chat-row wa-admin";
          div.innerHTML = `<span class="wa-bubble ${m.from === "user" ? "user" : "admin"}">${m.text}</span>`;
          livechatMessages.appendChild(div);
        });
      livechatMessages.scrollTop = livechatMessages.scrollHeight;
      livechatForm.dataset.hasAdmin = hasAdmin ? "1" : "";
    }
  );

  // Handle sending a message: AI replies if no admin, else normal
  livechatForm.onsubmit = async (e) => {
    e.preventDefault();
    const text = livechatInput.value.trim();
    if (!text) return;
    await addDoc(collection(db, "chats", currentUser.uid, "messages"), {
      text,
      from: "user",
      timestamp: Date.now(),
      issueTime: issue.time
    });
    livechatInput.value = "";

    // If admin hasn't replied yet, bot auto-replies
    if (!livechatForm.dataset.hasAdmin) {
      setTimeout(async () => {
        await addDoc(collection(db, "chats", currentUser.uid, "messages"), {
          text: "AI: Thank you for your message! Our virtual assistant is here to help. If you need live support, an admin will join soon.",
          from: "admin",
          timestamp: Date.now(),
          issueTime: issue.time
        });
      }, 700);
    }
  };
}


// Export User History as CSV
document.getElementById('export-history-btn').onclick = function() {
  if (!currentUser) return;
  let rows = [["Device","Description","Details","Time","Resolved"]];
  if (Array.isArray(currentUser.history)) {
    currentUser.history.forEach(h => {
      rows.push([
        h.device||"",
        h.desc||"",
        h.details||"",
        h.time||"",
        h.resolved ? "Yes" : "No"
      ]);
    });
  }
  const csv = rows.map(r=>r.map(x=>`"${(x||'').replace(/"/g,'""')}"`).join(",")).join("\n");
  const blob = new Blob([csv], {type: 'text/csv'});
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = "techfix_history.csv";
  link.click();
};

// Clear User History
document.getElementById('clear-history-btn').onclick = async function() {
  if (!confirm("Are you sure you want to clear ALL your history? This cannot be undone!")) return;
  await updateDoc(doc(db, "users", currentUser.uid), { history: [] });
  alert("Your history has been cleared.");
};