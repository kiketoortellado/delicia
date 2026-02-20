import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import {
  getDatabase, ref, set, get,
  onValue, runTransaction, onDisconnect, serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-database.js";

const firebaseConfig = {
  apiKey:            "AIzaSyCdKSf2g1cIyXrD6k_u1aR9TMln9HaPJro",
  authDomain:        "delicia-restaurante.firebaseapp.com",
  databaseURL:       "https://delicia-restaurante-default-rtdb.firebaseio.com",
  projectId:         "delicia-restaurante",
  storageBucket:     "delicia-restaurante.firebasestorage.app",
  messagingSenderId: "653903447900",
  appId:             "1:653903447900:web:85cffda9d703e464af6399"
};

const fbApp = initializeApp(firebaseConfig);
const db    = getDatabase(fbApp);

export {
  db, ref, set, get,
  onValue, runTransaction, onDisconnect, serverTimestamp
};
