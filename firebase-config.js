import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import { getStorage } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-storage.js";

const firebaseConfig = {
  apiKey: "AIzaSyBzUELxbbaL6Wb_M1uNhjwlZHVTorN9XJs",
  authDomain: "my-whatsapp-2c1af.firebaseapp.com",
  databaseURL: "https://my-whatsapp-2c1af-default-rtdb.firebaseio.com",
  projectId: "my-whatsapp-2c1af",
  storageBucket: "my-whatsapp-2c1af.firebasestorage.app",
  messagingSenderId: "1089455460888",
  appId: "1:1089455460888:web:15bd0820546c813febe96d"
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
export const storage = getStorage(app);
export default app;
