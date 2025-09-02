const admin = require("firebase-admin");

// Tenta carregar as credenciais da variável de ambiente primeiro
let serviceAccount;
if (process.env.FIREBASE_SERVICE_ACCOUNT) {
  try {
    serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
  } catch (e) {
    console.error('Erro ao analisar FIREBASE_SERVICE_ACCOUNT:', e);
    throw new Error('A variável de ambiente FIREBASE_SERVICE_ACCOUNT não é um JSON válido.');
  }
} else {
  // Se não encontrar, carrega do arquivo local (para desenvolvimento)
  try {
    serviceAccount = require("./serviceAccountKey.json");
  } catch (e) {
    console.error('serviceAccountKey.json não encontrado.', e);
    throw new Error('Necessário para desenvolvimento local. Crie a variável de ambiente para produção.');
  }
}

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

module.exports = { db };
