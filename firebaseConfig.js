const admin = require("firebase-admin");

// Esta variável de ambiente será configurada no serviço de hospedagem (Render).
const serviceAccountString = process.env.FIREBASE_SERVICE_ACCOUNT;

let serviceAccount;

if (serviceAccountString) {
  try {
    // Em produção (no Render), parseamos a string da variável de ambiente.
    serviceAccount = JSON.parse(serviceAccountString);
  } catch (e) {
    console.error('Erro ao fazer parse da credencial do Firebase a partir da variável de ambiente:', e);
    process.exit(1); // Encerra o processo se a credencial for inválida
  }
} else {
  // Em desenvolvimento (local), carregamos o ficheiro JSON.
  // Certifique-se de que este ficheiro está no seu .gitignore!
  console.log("Carregando credenciais do ficheiro local serviceAccountKey.json...");
  serviceAccount = require("./serviceAccountKey.json");
}

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

module.exports = { db };

