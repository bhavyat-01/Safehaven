// Import the functions you need from the SDKs you need
import { initializeApp, getApps, getApp } from "firebase/app";
import { getAnalytics } from "firebase/analytics";
import { getAuth, GoogleAuthProvider } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
// TODO: Add SDKs for Firebase products that you want to use
// https://firebase.google.com/docs/web/setup#available-libraries

// Your web app's Firebase configuration
// For Firebase JS SDK v7.20.0 and later, measurementId is optional
const firebaseConfig = {
  apiKey: "AIzaSyDqq_tPbME3EfSyV5aIjUrCpWfY0RRSiWI",
  authDomain: "safehaven-ca0bc.firebaseapp.com",
  projectId: "safehaven-ca0bc",
  storageBucket: "safehaven-ca0bc.firebasestorage.app",
  messagingSenderId: "900360437182",
  appId: "1:900360437182:web:24cff435494b129ee00def",
  measurementId: "G-ZX8BVJ0XL3",
};

const app = !getApps().length ? initializeApp(firebaseConfig) : getApp();
const auth = getAuth(app);
const googleProvider = new GoogleAuthProvider();
const db = getFirestore(app);

export { auth, googleProvider, db };
