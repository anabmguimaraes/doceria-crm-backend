const express = require('express');
const cors = require('cors');
const { db } = require('./firebaseConfig.js');
const admin = require('firebase-admin'); // Importa o admin do Firebase

const app = express();
const port = process.env.PORT || 5000;

// --- Middlewares ---

const allowedOrigins = [
  'http://localhost:3000',
  'https://www.anaguimaraesdoceria.com.br',
  'https://anaguimaraesdoceria.com.br',
  'https://doceria-crm-frontend-nceem34t8-ana-beatrizs-projects-1a0a8d4e.vercel.app/'
];

app.use(cors({
  origin: function (origin, callback) {
    if (!origin || allowedOrigins.indexOf(origin) !== -1) {
      callback(null, true);
    } else {
      callback(new Error('Acesso negado pela política de CORS'));
    }
  }
}));

app.use(express.json());

// --- Rotas e Lógica da API ---

// Rota de Teste
app.get('/', (req, res) => {
  res.send('Servidor do CRM da Doceria está no ar!');
});

// FUNÇÕES AUXILIARES DA API (Produtos, Clientes, etc.)
const getAllItems = async (collectionName, res) => {
  try {
    const snapshot = await db.collection(collectionName).get();
    const items = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    res.status(200).json(items);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

const createItem = async (collectionName, req, res) => {
  try {
    const docRef = await db.collection(collectionName).add(req.body);
    const newItem = await docRef.get();
    res.status(201).json({ id: newItem.id, ...newItem.data() });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

const updateItem = async (collectionName, req, res) => {
  try {
    const { id } = req.params;
    await db.collection(collectionName).doc(id).update(req.body);
    const updatedDoc = await db.collection(collectionName).doc(id).get();
    res.status(200).json({ id: updatedDoc.id, ...updatedDoc.data() });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

const deleteItem = async (collectionName, req, res) => {
  try {
    const { id } = req.params;
    await db.collection(collectionName).doc(id).delete();
    res.status(200).json({ message: `${collectionName} com id ${id} deletado com sucesso.` });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// ENDPOINTS DA API (Produtos, Clientes, etc.)
app.get('/api/produtos', (req, res) => getAllItems('produtos', res));
app.post('/api/produtos', (req, res) => createItem('produtos', req, res));
app.put('/api/produtos/:id', (req, res) => updateItem('produtos', req, res));
app.delete('/api/produtos/:id', (req, res) => deleteItem('produtos', req, res));

app.get('/api/clientes', (req, res) => getAllItems('clientes', res));
app.post('/api/clientes', (req, res) => createItem('clientes', req, res));
app.put('/api/clientes/:id', (req, res) => updateItem('clientes', req, res));
app.delete('/api/clientes/:id', (req, res) => deleteItem('clientes', req, res));

app.get('/api/pedidos', (req, res) => getAllItems('pedidos', res));
app.post('/api/pedidos', (req, res) => createItem('pedidos', req, res));
app.put('/api/pedidos/:id', (req, res) => updateItem('pedidos', req, res));
app.delete('/api/pedidos/:id', (req, res) => deleteItem('pedidos', req, res));

app.get('/api/despesas', (req, res) => getAllItems('despesas', res));
app.post('/api/despesas', (req, res) => createItem('despesas', req, res));
app.put('/api/despesas/:id', (req, res) => updateItem('despesas', req, res));
app.delete('/api/despesas/:id', (req, res) => deleteItem('despesas', req, res));


// --- NOVOS ENDPOINTS PARA GESTÃO DE USUÁRIOS ---

// Listar todos os usuários (combinando Auth e Firestore)
app.get('/api/users', async (req, res) => {
    try {
        const listUsersResult = await admin.auth().listUsers(1000);
        const usersFromAuth = listUsersResult.users;

        const usersCollection = await db.collection('users').get();
        const userRoles = {};
        usersCollection.forEach(doc => {
            userRoles[doc.id] = doc.data().role;
        });

        const combinedUsers = usersFromAuth.map(user => ({
            uid: user.uid,
            email: user.email,
            role: userRoles[user.uid] || 'visitante' // Garante uma role padrão
        }));

        res.status(200).json(combinedUsers);
    } catch (error) {
        console.error(`Erro ao buscar usuários:`, error);
        res.status(500).json({ error: error.message });
    }
});

// Criar um novo usuário
app.post('/api/users', async (req, res) => {
    const { email, password, role } = req.body;
    if (!email || !password || !role) {
        return res.status(400).json({ error: 'Email, senha e permissão são obrigatórios.' });
    }
    try {
        const userRecord = await admin.auth().createUser({ email, password });
        await db.collection('users').doc(userRecord.uid).set({ email, role });
        res.status(201).json({ uid: userRecord.uid, email: userRecord.email, role });
    } catch (error) {
        console.error(`Erro ao criar usuário:`, error);
        res.status(500).json({ error: error.code }); // Retorna o código de erro do Firebase
    }
});

// Atualizar a permissão de um usuário
app.put('/api/users/:uid/role', async (req, res) => {
    const { uid } = req.params;
    const { role } = req.body;
    try {
        await db.collection('users').doc(uid).update({ role });
        res.status(200).json({ message: 'Permissão atualizada com sucesso.' });
    } catch (error) {
        console.error(`Erro ao atualizar permissão:`, error);
        res.status(500).json({ error: error.message });
    }
});

// Atualizar a senha de um usuário
app.put('/api/users/:uid/password', async (req, res) => {
    const { uid } = req.params;
    const { password } = req.body;
    try {
        await admin.auth().updateUser(uid, { password });
        res.status(200).json({ message: 'Senha atualizada com sucesso.' });
    } catch (error) {
        console.error(`Erro ao atualizar senha:`, error);
        res.status(500).json({ error: error.message });
    }
});

// Deletar um usuário
app.delete('/api/users/:uid', async (req, res) => {
    const { uid } = req.params;
    try {
        await admin.auth().deleteUser(uid); // Deleta do Authentication
        await db.collection('users').doc(uid).delete(); // Deleta do Firestore
        res.status(200).json({ message: 'Usuário deletado com sucesso.' });
    } catch (error) {
        console.error(`Erro ao deletar usuário:`, error);
        res.status(500).json({ error: error.message });
    }
});

app.listen(port, () => {
  console.log(`Servidor rodando na porta ${port}`);
});

