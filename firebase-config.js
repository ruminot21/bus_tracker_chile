const firebaseConfig = {
  apiKey: "AIzaSyANbiVrbSst4-iMwlALkBrlEs5JYpIii_0",
  authDomain: "bus-tracker-chile.firebaseapp.com",
  databaseURL: "https://bus-tracker-chile-default-rtdb.firebaseio.com",
  projectId: "bus-tracker-chile",
  storageBucket: "bus-tracker-chile.firebasestorage.app",
  messagingSenderId: "128440721323",
  appId: "1:128440721323:web:275bd0086e125c3b6a7cee"
};

firebase.initializeApp(firebaseConfig);

const auth = firebase.auth();
const db = firebase.firestore();
const rtdb = firebase.database();
