import { getAuth, onAuthStateChanged, signInWithPopup, GoogleAuthProvider } from "https://www.gstatic.com/firebasejs/11.9.0/firebase-auth.js";
const auth = getAuth();
const provider = new GoogleAuthProvider();

const ADMIN_EMAILS = [
  "oluokundavid4@gmail.com"
];

document.getElementById('login-btn').onclick = () => {
  signInWithPopup(auth, provider)
    .then((result) => {
      if (ADMIN_EMAILS.includes(result.user.email)) {
        window.location.href = "../admin/admin.html";
      } else {
        // Optionally, show a message: "You are not an admin"
      }
    });
};

onAuthStateChanged(auth, user => {
  // Don't auto-redirect! Just show login if not signed in.
});

