const express = require('express');
const cors = require('cors');

// Inicialização do Firebase com tratamento de erro
let db;
try {
  const firebaseConfig = require('./firebaseConfig.js');
  db = firebaseConfig.db;
  console.log('✅ Firebase conectado com sucesso');
} catch (error) {
  console.error('❌ Erro ao conectar Firebase:', error.message);
  process.exit(1); // Para o servidor se não conseguir conectar ao Firebase
}

const app = express();
const port = process.env.PORT || 5000;

// --- Middlewares ---
console.log('🚀 Iniciando servidor...');

// CORS configuração
const allowedOrigins = [
  'http://localhost:3000',
  'https://www.anaguimaraesdoceria.com.br',
  'https://anaguimaraesdoceria.com.br',
  'https://doceria-crm-frontend-nceem34t8-ana-beatrizs-projects-1a0a8d4e.vercel.app'
];

app.use(cors({
  origin: function (origin, callback) {
    console.log('🌐 Origin da requisição:', origin);
    
    if (!origin) {
      return callback(null, true);
    }
    
    if (allowedOrigins.some(allowed => origin.includes(allowed.replace('https://', '').replace('http://', '')))) {
      callback(null, true);
    } else {
      console.error('🚫 Origin bloqueada:', origin);
      callback(new Error(`CORS: Acesso negado para ${origin}`));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use(express.json());

// Middleware de log
app.use((req, res, next) => {
  console.log(`📝 ${new Date().toISOString()} - ${req.method} ${req.path}`);
  next();
});

// --- Rotas ---

// Rota principal
app.get('/', (req, res) => {
  console.log('📍 Rota raiz acessada');
  res.json({ 
    message: 'Servidor do CRM da Doceria está no ar!',
    timestamp: new Date().toISOString(),
    status: 'online',
    endpoints: ['/api/clientes', '/api/produtos', '/api/pedidos', '/api/despesas']
  });
});

// Health check
app.get('/health', async (req, res) => {
  try {
    // Testa conexão com Firebase
    await db.collection('test').limit(1).get();
    res.json({ 
      status: 'healthy',
      timestamp: new Date().toISOString(),
      firebase: 'connected'
    });
  } catch (error) {
    res.status(500).json({ 
      status: 'unhealthy',
      error: error.message,
      firebase: 'disconnected'
    });
  }
});

// FUNÇÕES AUXILIARES
const getAllItems = async (collectionName, res) => {
  try {
    console.log(`🔍 Buscando itens de: ${collectionName}`);
    const snapshot = await db.collection(collectionName).get();
    const items = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    console.log(`✅ Encontrados ${items.length} itens em ${collectionName}`);
    res.status(200).json(items);
  } catch (error) {
    console.error(`❌ Erro ao buscar ${collectionName}:`, error);
    res.status(500).json({ error: `Erro ao buscar ${collectionName}: ${error.message}` });
  }
};

const createItem = async (collectionName, req, res) => {
  try {
    console.log(`➕ Criando item em ${collectionName}:`, req.body);
    
    if (!req.body || Object.keys(req.body).length === 0) {
      return res.status(400).json({ error: 'Dados do item são obrigatórios' });
    }
    
    const docRef = await db.collection(collectionName).add({
      ...req.body,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    });
    
    const newItem = await docRef.get();
    const result = { id: newItem.id, ...newItem.data() };
    console.log(`✅ Item criado com ID: ${result.id}`);
    res.status(201).json(result);
  } catch (error) {
    console.error(`❌ Erro ao criar ${collectionName}:`, error);
    res.status(500).json({ error: `Erro ao criar ${collectionName}: ${error.message}` });
  }
};

const updateItem = async (collectionName, req, res) => {
  try {
    const { id } = req.params;
    console.log(`📝 Atualizando ${collectionName} ID ${id}`);
    
    if (!id) {
      return res.status(400).json({ error: 'ID é obrigatório' });
    }
    
    const updateData = {
      ...req.body,
      updatedAt: new Date().toISOString()
    };
    
    await db.collection(collectionName).doc(id).update(updateData);
    const updatedDoc = await db.collection(collectionName).doc(id).get();
    
    if (!updatedDoc.exists) {
      return res.status(404).json({ error: 'Item não encontrado' });
    }
    
    const result = { id: updatedDoc.id, ...updatedDoc.data() };
    console.log(`✅ Item atualizado: ${id}`);
    res.status(200).json(result);
  } catch (error) {
    console.error(`❌ Erro ao atualizar ${collectionName}:`, error);
    res.status(500).json({ error: `Erro ao atualizar ${collectionName}: ${error.message}` });
  }
};

const deleteItem = async (collectionName, req, res) => {
  try {
    const { id } = req.params;
    console.log(`🗑️ Deletando ${collectionName} ID: ${id}`);
    
    if (!id) {
      return res.status(400).json({ error: 'ID é obrigatório' });
    }
    
    const docRef = db.collection(collectionName).doc(id);
    const doc = await docRef.get();
    
    if (!doc.exists) {
      return res.status(404).json({ error: 'Item não encontrado' });
    }
    
    await docRef.delete();
    console.log(`✅ Item deletado: ${id}`);
    res.status(200).json({ message: `${collectionName} deletado com sucesso`, id });
  } catch (error) {
    console.error(`❌ Erro ao deletar ${collectionName}:`, error);
    res.status(500).json({ error: `Erro ao deletar ${collectionName}: ${error.message}` });
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
  console.error('💥 Erro não tratado:', err);
  res.status(500).json({ error: 'Erro interno do servidor' });
});

// Rota 404 para debug
app.use('*', (req, res) => {
  console.log(`❓ Rota não encontrada: ${req.method} ${req.originalUrl}`);
  res.status(404).json({ 
    error: 'Rota não encontrada',
    path: req.originalUrl,
    availableRoutes: ['/', '/health', '/api/clientes', '/api/produtos', '/api/pedidos', '/api/despesas']
  });
});

// Inicialização do servidor
app.listen(port, () => {
  console.log(`🚀 Servidor rodando na porta ${port}`);
  console.log(`🌐 CORS permitido para:`, allowedOrigins);
  console.log(`📅 Iniciado em: ${new Date().toISOString()}`);
});
