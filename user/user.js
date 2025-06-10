// user.js for TechFix User Dashboard
// Requires: Firebase Authentication and Firestore

import { initializeApp } from "https://www.gstatic.com/firebasejs/11.9.0/firebase-app.js";
import { getAuth, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/11.9.0/firebase-auth.js";
import { getFirestore, doc, setDoc, getDoc, updateDoc, arrayUnion, onSnapshot } from "https://www.gstatic.com/firebasejs/11.9.0/firebase-firestore.js";

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

// --- State ---
let currentUser = null;

// --- Auth State Check & User Data Sync ---
onAuthStateChanged(auth, async (user) => {
  if (user) {
    currentUser = user;
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
        history: []
      });
    } else {
      // Optionally update profile info every login
      await updateDoc(userDocRef, {
        displayName: user.displayName || "",
        email: user.email || "",
        photoURL: user.photoURL || ""
      });
    }
    listenToHistory();
  } else {
    // Not logged in
    window.location.href = "../login/login.html";
  }
});

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

// --- Issue Form Submission ---
issueForm?.addEventListener('submit', async function(e) {
  e.preventDefault();
  if (!currentUser) {
    window.location.href = "../login/login.html";
    return;
  }
  // Gather info
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
  // Add to Firestore history
  const entry = {
    time: new Date().toISOString(),
    device: devType,
    desc,
    details
  };
  try {
    const userDocRef = doc(db, "users", currentUser.uid);
    await updateDoc(userDocRef, {
      history: arrayUnion(entry)
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
      // Sort by most recent
      [...data.history].sort((a, b) => new Date(b.time) - new Date(a.time)).forEach(entry => {
        const li = document.createElement('li');
        li.textContent = `[${(new Date(entry.time)).toLocaleString()}] (${entry.device}) - ${entry.desc} [${entry.details}]`;
        historyList.appendChild(li);
      });
    } else {
      historyList.innerHTML = '<li>No support history yet.</li>';
    }
  });
}