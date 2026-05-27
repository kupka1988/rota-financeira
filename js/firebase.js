import { initializeApp } from "https://www.gstatic.com/firebasejs/12.1.0/firebase-app.js";
import { getFirestore, collection, addDoc, getDocs, doc, updateDoc, deleteDoc, query, where, writeBatch, serverTimestamp } from "https://www.gstatic.com/firebasejs/12.1.0/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyCgl40mgzun6Ut08wo30_KqJ-z62KHVxdw",
  authDomain: "rota-financeira-1475a.firebaseapp.com",
  projectId: "rota-financeira-1475a",
  storageBucket: "rota-financeira-1475a.firebasestorage.app",
  messagingSenderId: "196415753061",
  appId: "1:196415753061:web:999bb5ce542ce8b3baef8c",
  measurementId: "G-46FT3P8V2H"
};

const firebaseApp = initializeApp(firebaseConfig);
export const db = getFirestore(firebaseApp);
export { collection, addDoc, getDocs, doc, updateDoc, deleteDoc, query, where, writeBatch, serverTimestamp };
