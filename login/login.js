// Import necessary Firebase modules (if using ES Modules, else load from CDN)
import { initializeApp } from "https://www.gstatic.com/firebasejs/11.9.0/firebase-app.js";
import { getAuth, GoogleAuthProvider, signInWithPopup } from "https://www.gstatic.com/firebasejs/11.9.0/firebase-auth.js";

// Your Firebase config
const firebaseConfig = {
  apiKey: "AIzaSyB9aIZfqZvtfOSNUHGRSDXMyWDxWWS5NNs",
  authDomain: "techfix-ef115.firebaseapp.com",
  projectId: "techfix-ef115",
  storageBucket: "techfix-ef115.firebasestorage.app",
  messagingSenderId: "798114675752",
  appId: "1:798114675752:web:33450b57585b4a643b891d",
  measurementId: "G-69MKL5ETH7"
};

// Initialize Firebase app and auth
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const provider = new GoogleAuthProvider();

document.getElementById('google-login-btn').addEventListener('click', () => {
  signInWithPopup(auth, provider)
    .then((result) => {
      // User signed in successfully
      const user = result.user;
      console.log("User Info:", user);

      // Redirect user or update UI here after login
      window.location.href = "../user/user.html"; // or wherever you want
    })
    .catch((error) => {
      // Handle Errors here
      console.error("Login Failed:", error.message);
      alert("Login failed: " + error.message);
    });
});
