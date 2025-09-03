const express = require('express');
const cors = require('cors'); // IMPORTANTE: Adicionar esta linha
const { db } = require('./firebaseConfig.js');

const app = express();
const port = process.env.PORT || 5000; // Boa prática para o Render

// --- Middlewares ---

// ✅ Configuração de CORS correta usando a biblioteca
const allowedOrigins = [
  'http://localhost:3000',
  'https://www.anaguimaraesdoceria.com.br',
  'https://doceria-crm-frontend-nceem34t8-ana-beatrizs-projects-1a0a8d4e.vercel.app'
];

app.use(cors({
  origin: function (origin, callback) {
    // Permite requisições sem 'origin' (ex: Postman) ou se a origem estiver na lista
    if (!origin || allowedOrigins.indexOf(origin) !== -1) {
      callback(null, true);
    } else {
      callback(new Error('Acesso negado pela política de CORS'));
    }
  }
}));

app.use(express.json());


// --- Rotas e Lógica da API (sem alterações) ---

// Rota de Teste
app.get('/', (req, res) => {
  res.send('Servidor do CRM da Doceria está no ar!');
});

// FUNÇÕES AUXILIARES DA API
const getAllItems = async (collectionName, res) => {
  try {
    const snapshot = await db.collection(collectionName).get();
    const items = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    res.status(200).json(items);
  } catch (error) {
    console.error(`Erro ao buscar ${collectionName}:`, error);
    res.status(500).json({ error: error.message });
  }
};

const createItem = async (collectionName, req, res) => {
  try {
    const docRef = await db.collection(collectionName).add(req.body);
    const newItem = await docRef.get();
    res.status(201).json({ id: newItem.id, ...newItem.data() });
  } catch (error) {
    console.error(`Erro ao criar ${collectionName}:`, error);
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
    console.error(`Erro ao atualizar ${collectionName}:`, error);
    res.status(500).json({ error: error.message });
  }
};

const deleteItem = async (collectionName, req, res) => {
  try {
    const { id } = req.params;
    await db.collection(collectionName).doc(id).delete();
    res.status(200).json({ message: `${collectionName} com id ${id} deletado com sucesso.` });
  } catch (error) {
    console.error(`Erro ao deletar ${collectionName}:`, error);
    res.status(500).json({ error: error.message });
  }
};

// ENDPOINTS DA API
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


app.listen(port, () => {
  console.log(`Servidor rodando na porta ${port}`);
});
