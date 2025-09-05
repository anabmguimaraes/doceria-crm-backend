const express = require('express');
const cors = require('cors');
const { db } = require('./firebaseConfig.js');
const admin = require('firebase-admin');

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
app.get('/', (req, res) => {
  res.send('Servidor do CRM da Doceria está no ar!');
});

// --- FUNÇÕES AUXILIARES DA API ---
const getAllItems = async (collectionName, res) => {
  try {
    const snapshot = await db.collection(collectionName).get();
    const items = snapshot.docs.map(doc => {
        const docData = doc.data();
        // Converte Timestamps do Firestore para strings ISO 8601
        if (docData.createdAt && typeof docData.createdAt.toDate === 'function') {
            docData.createdAt = docData.createdAt.toDate().toISOString();
        }
        if (docData.ultimaCompra && typeof docData.ultimaCompra.toDate === 'function') {
            docData.ultimaCompra = docData.ultimaCompra.toDate().toISOString();
        }
        return { id: doc.id, ...docData };
    });
    res.status(200).json(items);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

const createItem = async (collectionName, req, res) => {
  try {
    // Remove qualquer 'createdAt' enviado pelo cliente para garantir que o servidor tenha o controle
    const { createdAt, ...itemData } = req.body;
    
    const itemWithTimestamp = {
      ...itemData,
      createdAt: admin.firestore.FieldValue.serverTimestamp() // Garante a data atual no servidor
    };

    if (collectionName === 'pedidos' && !itemWithTimestamp.origem) {
        itemWithTimestamp.origem = "Manual";
    }
    const docRef = await db.collection(collectionName).add(itemWithTimestamp);
    const newItemSnapshot = await docRef.get();
    const newItem = { id: newItemSnapshot.id, ...newItemSnapshot.data() };
    if (newItem.createdAt && typeof newItem.createdAt.toDate === 'function') {
      newItem.createdAt = newItem.createdAt.toDate().toISOString();
    }
    res.status(201).json(newItem);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

const updateItem = async (collectionName, req, res) => {
  try {
    const { id } = req.params;
    const updatedData = req.body;
    const itemRef = db.collection(collectionName).doc(id);

    // Lógica especial para quando um pedido é finalizado
    if (collectionName === 'pedidos' && updatedData.status === 'Finalizado') {
      const pedidoDoc = await itemRef.get();
      if (pedidoDoc.exists) {
        const originalPedido = pedidoDoc.data();
        // Apenas atualiza o cliente se o status ANTERIOR não era 'Finalizado'
        if (originalPedido.status !== 'Finalizado') {
          const { clienteId, total } = originalPedido;
          if (clienteId && total > 0) {
            const clienteRef = db.collection('clientes').doc(clienteId);
            // Usa FieldValue.increment para uma atualização segura e atômica
            await clienteRef.update({
              totalCompras: admin.firestore.FieldValue.increment(total),
              ultimaCompra: admin.firestore.FieldValue.serverTimestamp()
            });
          }
        }
      }
    }

    // Atualiza o item (pedido, cliente, etc.)
    await itemRef.update(updatedData);
    const updatedDocSnapshot = await itemRef.get();
    const updatedDoc = { id: updatedDocSnapshot.id, ...updatedDocSnapshot.data() };
     if (updatedDoc.createdAt && typeof updatedDoc.createdAt.toDate === 'function') {
      updatedDoc.createdAt = updatedDoc.createdAt.toDate().toISOString();
    }
     if (updatedDoc.ultimaCompra && typeof updatedDoc.ultimaCompra.toDate === 'function') {
      updatedDoc.ultimaCompra = updatedDoc.ultimaCompra.toDate().toISOString();
    }
    res.status(200).json(updatedDoc);
  } catch (error) {
    res.status(500).json({ error: `Erro ao atualizar item: ${error.message}` });
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

// ENDPOINTS
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

// ENDPOINTS PARA USUÁRIOS
app.get('/api/users', async (req, res) => {
    try {
        const listUsersResult = await admin.auth().listUsers(1000);
        const usersFromAuth = listUsersResult.users;
        const usersCollection = await db.collection('users').get();
        const userRoles = {};
        usersCollection.forEach(doc => { userRoles[doc.id] = doc.data().role; });
        const combinedUsers = usersFromAuth.map(user => ({ uid: user.uid, email: user.email, role: userRoles[user.uid] || 'visitante' }));
        res.status(200).json(combinedUsers);
    } catch (error) { res.status(500).json({ error: error.message }); }
});
app.post('/api/users', async (req, res) => {
    const { email, password, role } = req.body;
    if (!email || !password || !role) { return res.status(400).json({ error: 'Email, senha e permissão são obrigatórios.' }); }
    try {
        const userRecord = await admin.auth().createUser({ email, password });
        await db.collection('users').doc(userRecord.uid).set({ email, role });
        res.status(201).json({ uid: userRecord.uid, email: userRecord.email, role });
    } catch (error) { res.status(500).json({ error: error.code }); }
});
app.put('/api/users/:uid/role', async (req, res) => {
    const { uid } = req.params; const { role } = req.body;
    try { await db.collection('users').doc(uid).update({ role }); res.status(200).json({ message: 'Permissão atualizada.' });
    } catch (error) { res.status(500).json({ error: error.message }); }
});
app.put('/api/users/:uid/password', async (req, res) => {
    const { uid } = req.params; const { password } = req.body;
    try { await admin.auth().updateUser(uid, { password }); res.status(200).json({ message: 'Senha atualizada.' });
    } catch (error) { res.status(500).json({ error: error.message }); }
});
app.delete('/api/users/:uid', async (req, res) => {
    const { uid } = req.params;
    try { await admin.auth().deleteUser(uid); await db.collection('users').doc(uid).delete(); res.status(200).json({ message: 'Usuário deletado.' });
    } catch (error) { res.status(500).json({ error: error.message }); }
});

app.listen(port, () => {
  console.log(`Servidor rodando na porta ${port}`);
});

