const express = require('express');
const cors = require('cors');
const { db } = require('./firebaseConfig.js');

const app = express();
const port = process.env.PORT || 5000;

// --- Middlewares ---

// Configuração de CORS mais permissiva para debug
const allowedOrigins = [
  'http://localhost:3000',
  'https://www.anaguimaraesdoceria.com.br',
  'https://anaguimaraesdoceria.com.br', // Adicione esta linha (sem www)
  'https://doceria-crm-frontend-nceem34t8-ana-beatrizs-projects-1a0a8d4e.vercel.app/'
];

app.use(cors({
  origin: function (origin, callback) {
    console.log('Origin da requisição:', origin); // Log para debug
    
    // Permite requisições sem 'origin' (ex: Postman)
    if (!origin) {
      return callback(null, true);
    }
    
    // Verifica se a origem está na lista permitida
    if (allowedOrigins.indexOf(origin) !== -1) {
      callback(null, true);
    } else {
      console.error('Origin bloqueada pelo CORS:', origin);
      callback(new Error(`Acesso negado pela política de CORS para: ${origin}`));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use(express.json());

// Middleware de log para debug
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.path}`);
  next();
});

// --- Rotas e Lógica da API ---

// Rota de Teste
app.get('/', (req, res) => {
  res.json({ 
    message: 'Servidor do CRM da Doceria está no ar!',
    timestamp: new Date().toISOString(),
    status: 'online'
  });
});

// Health check
app.get('/health', (req, res) => {
  res.json({ 
    status: 'healthy',
    timestamp: new Date().toISOString(),
    firebase: 'connected'
  });
});

// FUNÇÕES AUXILIARES DA API
const getAllItems = async (collectionName, res) => {
  try {
    console.log(`Buscando todos os itens de: ${collectionName}`);
    const snapshot = await db.collection(collectionName).get();
    const items = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    console.log(`Encontrados ${items.length} itens em ${collectionName}`);
    res.status(200).json(items);
  } catch (error) {
    console.error(`Erro ao buscar ${collectionName}:`, error);
    res.status(500).json({ error: error.message });
  }
};

const createItem = async (collectionName, req, res) => {
  try {
    console.log(`Criando item em ${collectionName}:`, req.body);
    const docRef = await db.collection(collectionName).add(req.body);
    const newItem = await docRef.get();
    const result = { id: newItem.id, ...newItem.data() };
    console.log(`Item criado com sucesso:`, result);
    res.status(201).json(result);
  } catch (error) {
    console.error(`Erro ao criar ${collectionName}:`, error);
    res.status(500).json({ error: error.message });
  }
};

const updateItem = async (collectionName, req, res) => {
  try {
    const { id } = req.params;
    console.log(`Atualizando ${collectionName} ID ${id}:`, req.body);
    await db.collection(collectionName).doc(id).update(req.body);
    const updatedDoc = await db.collection(collectionName).doc(id).get();
    const result = { id: updatedDoc.id, ...updatedDoc.data() };
    console.log(`Item atualizado:`, result);
    res.status(200).json(result);
  } catch (error) {
    console.error(`Erro ao atualizar ${collectionName}:`, error);
    res.status(500).json({ error: error.message });
  }
};

const deleteItem = async (collectionName, req, res) => {
  try {
    const { id } = req.params;
    console.log(`Deletando ${collectionName} ID: ${id}`);
    await db.collection(collectionName).doc(id).delete();
    console.log(`Item deletado com sucesso`);
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

// Middleware de tratamento de erros
app.use((err, req, res, next) => {
  console.error('Erro não tratado:', err);
  res.status(500).json({ error: 'Erro interno do servidor' });
});

// Rota 404
app.use('*', (req, res) => {
  console.log(`Rota não encontrada: ${req.method} ${req.originalUrl}`);
  res.status(404).json({ error: 'Rota não encontrada' });
});

app.listen(port, () => {
  console.log(`Servidor rodando na porta ${port}`);
  console.log(`Origens CORS permitidas:`, allowedOrigins);
});


