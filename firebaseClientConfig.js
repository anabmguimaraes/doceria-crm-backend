// Importe as funções dos SDKs que você precisa
import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

// Sua configuração do app da web do Firebase, fornecida pelo console
const firebaseConfig = {
  apiKey: "AIzaSyCNU5ZEl60OcW5eZyL_ZoD0tFKpweQvhwU",
  authDomain: "crmdoceria-9959e.firebaseapp.com",
  projectId: "crmdoceria-9959e",
  storageBucket: "crmdoceria-9959e.firebasestorage.app",
  messagingSenderId: "389481198252",
  appId: "1:389481198252:web:429bff3cc5d4f353bea509",
  measurementId: "G-XJ7LPG0229"
};

// Inicialize o Firebase
const app = initializeApp(firebaseConfig);

// Exporte os serviços que você usará na sua aplicação
// Nós precisamos do Auth (para login) e do Firestore (para salvar as permissões)
export const auth = getAuth(app);
export const db = getFirestore(app);

