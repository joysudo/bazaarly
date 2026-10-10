// Import the functions you need from the SDKs you need
import { initializeApp } from "firebase/app";
import { getAnalytics } from "firebase/analytics";
// TODO: Add SDKs for Firebase products that you want to use
// https://firebase.google.com/docs/web/setup#available-libraries

// Your web app's Firebase configuration
// For Firebase JS SDK v7.20.0 and later, measurementId is optional
const firebaseConfig = {
  apiKey: "AIzaSyAeknBowjqJNOvyqaYsA6APJy06kwg3MSc",
  authDomain: "bazaarly-98718.firebaseapp.com",
  projectId: "bazaarly-98718",
  storageBucket: "bazaarly-98718.firebasestorage.app",
  messagingSenderId: "995011873930",
  appId: "1:995011873930:web:7a7d6c138605b42d0d7173",
  measurementId: "G-Z84X1X4HW5"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const analytics = getAnalytics(app);