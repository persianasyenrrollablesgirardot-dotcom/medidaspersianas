import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyAyQfHSfPKDbBGfKuSzPXA3wXXfsAS5jbk",
  authDomain: "gestor-de-campo.firebaseapp.com",
  projectId: "gestor-de-campo",
  storageBucket: "gestor-de-campo.firebasestorage.app",
  messagingSenderId: "272743486881",
  appId: "1:272743486881:web:ceb457bac6f85de5e167e0",
  measurementId: "G-33EPF0PRD4"
};

export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const dbFirestore = getFirestore(app);

// Create a secondary app instance for creating users without logging out the admin
export const secondaryApp = initializeApp(firebaseConfig, "SecondaryApp");
export const secondaryAuth = getAuth(secondaryApp);
