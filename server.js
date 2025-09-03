const express = require('express');
const cors = require('cors');
const { db } = require('./firebaseConfig.js');

const app = express();
const port = 5000;

// Middlewares
const allowedOrigins = [
  "https://www.anaguimaraesdoceria.com.br", // seu frontend no Vercel
  "http://localhost:3000" // útil para desenvolvimento local
];

const corsOptions = {
  origin: [
    "https://www.anaguimaraesdoceria.com.br", // produção
    "http://localhost:3000" // dev local
  ],
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
  credentials: true
};

app.use(cors(corsOptions));

// 🔥 importante: isso garante que o preflight OPTIONS sempre responde corretamente
app.options("*", cors(corsOptions));

app.use(express.json());
// Rota de Teste
app.get('/', (req, res) => {
  res.send('Servidor do CRM da Doceria está no ar!');
});

// --- FUNÇÕES AUXILIARES DA API ---

// GET todos
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

// POST
const createItem = async (collectionName, req, res) => {
  try {
    const docRef = await db.collection(collectionName).add(req.body);
    res.status(201).json({ id: docRef.id, ...req.body });
  } catch (error) {
    console.error(`Erro ao criar ${collectionName}:`, error);
    res.status(500).json({ error: error.message });
  }
};

// PUT
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

// DELETE
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

// --- ENDPOINTS DA API ---

// Endpoints para PRODUTOS
app.get('/api/produtos', (req, res) => getAllItems('produtos', res));
app.post('/api/produtos', (req, res) => createItem('produtos', req, res));
app.put('/api/produtos/:id', (req, res) => updateItem('produtos', req, res));
app.delete('/api/produtos/:id', (req, res) => deleteItem('produtos', req, res));

// Endpoints para CLIENTES
app.get('/api/clientes', (req, res) => getAllItems('clientes', res));
app.post('/api/clientes', (req, res) => createItem('clientes', req, res));
app.put('/api/clientes/:id', (req, res) => updateItem('clientes', req, res));
app.delete('/api/clientes/:id', (req, res) => deleteItem('clientes', req, res));

// Endpoints para PEDIDOS
app.get('/api/pedidos', (req, res) => getAllItems('pedidos', res));
app.post('/api/pedidos', (req, res) => createItem('pedidos', req, res));
app.put('/api/pedidos/:id', (req, res) => updateItem('pedidos', req, res));
app.delete('/api/pedidos/:id', (req, res) => deleteItem('pedidos', req, res));

// Endpoints para DESPESAS
app.get('/api/despesas', (req, res) => getAllItems('despesas', res));
app.post('/api/despesas', (req, res) => createItem('despesas', req, res));
app.put('/api/despesas/:id', (req, res) => updateItem('despesas', req, res));
app.delete('/api/despesas/:id', (req, res) => deleteItem('despesas', req, res));


app.listen(port, () => {
  console.log(`Servidor rodando em http://localhost:${port}`);
});






