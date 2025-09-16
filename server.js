const express = require('express');
const cors = require('cors');
const { db } = require('./firebaseConfig.js');
const admin = require('firebase-admin');

const app = express();
const port = process.env.PORT || 5000;

// --- Middlewares ---
const allowedOrigins = [
  'http://localhost:3000',
  'http://localhost:3001', // Adicionado para desenvolvimento local do cardapio
  'https://www.anaguimaraesdoceria.com.br',
  'https://anaguimaraesdoceria.com.br',
  'https://doceria-crm-frontend-nceem34t8-ana-beatrizs-projects-1a0a8d4e.vercel.app/'
];
app.use(cors({
  origin: function (origin, callback) {
    // Permitir requisições sem 'origin' (ex: Postman, apps mobile)
    if (!origin) return callback(null, true);
    if (allowedOrigins.indexOf(origin) !== -1 || origin.endsWith('vercel.app')) {
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
const createLog = async (action, details, userEmail = 'Sistema') => {
    try {
        await db.collection('logs').add({
            action,
            details,
            userEmail,
            timestamp: admin.firestore.FieldValue.serverTimestamp()
        });
    } catch (error) {
        console.error("Erro ao criar log:", error);
    }
};

const getAllItems = async (collectionName, res) => {
  try {
    const snapshot = await db.collection(collectionName).get();
    const items = snapshot.docs.map(doc => {
        const docData = doc.data();
        // Converte timestamps para ISO strings para consistência
        Object.keys(docData).forEach(key => {
            if (docData[key] && typeof docData[key].toDate === 'function') {
                docData[key] = docData[key].toDate().toISOString();
            }
        });
        return { id: doc.id, ...docData };
    });
    res.status(200).json(items);
  } catch (error) {
    res.status(500).json({ error: `Erro ao buscar itens de ${collectionName}: ${error.message}` });
  }
};

const createItem = async (collectionName, req, res) => {
  try {
    const { createdAt, ...itemData } = req.body;
    
    // Lógica específica para Pedidos: Decrementar estoque
    if (collectionName === 'pedidos') {
      const { itens } = req.body;
      if (!itens || !Array.isArray(itens) || itens.length === 0) {
        return res.status(400).json({ error: 'O pedido deve conter um array de itens.' });
      }
      const batch = db.batch();
      for (const item of itens) {
        if (item.id && item.quantity > 0) {
          const productRef = db.collection('produtos').doc(item.id);
          batch.update(productRef, { estoque: admin.firestore.FieldValue.increment(-item.quantity) });
        }
      }
      // Se tiver cupom, incrementa o uso
      if (itemData.cupom && itemData.cupom.codigo) {
        const cupomRef = db.collection('cupons').doc(itemData.cupom.codigo);
        batch.update(cupomRef, { usos: admin.firestore.FieldValue.increment(1) });
      }

      await batch.commit();
    }

    // Lógica específica para Cupons: Usar o código como ID do documento
    if (collectionName === 'cupons') {
        if (!itemData.codigo || itemData.codigo.trim() === '') {
            return res.status(400).json({ error: 'O código do cupom é obrigatório.' });
        }
        const cupomId = itemData.codigo.toUpperCase();
        const docRef = db.collection('cupons').doc(cupomId);
        const docSnap = await docRef.get();
        if (docSnap.exists) {
            return res.status(409).json({ error: 'Um cupom com este código já existe.' });
        }

        const itemWithTimestamp = {
          ...itemData,
          codigo: cupomId, // Garante que o código salvo está em maiúsculas
          createdAt: admin.firestore.FieldValue.serverTimestamp()
        };
        
        await docRef.set(itemWithTimestamp);
        
        const newItemSnapshot = await docRef.get();
        const newItem = { id: newItemSnapshot.id, ...newItemSnapshot.data() };
        if (newItem.createdAt && typeof newItem.createdAt.toDate === 'function') {
          newItem.createdAt = newItem.createdAt.toDate().toISOString();
        }
        await createLog(`Criação em ${collectionName}`, `Item criado com ID: ${newItemSnapshot.id}`);
        // Retorna para evitar a execução do código genérico abaixo
        return res.status(201).json(newItem);
    }


    const itemWithTimestamp = {
      ...itemData,
      createdAt: admin.firestore.FieldValue.serverTimestamp()
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
    await createLog(`Criação em ${collectionName}`, `Item criado com ID: ${docRef.id}`);
    res.status(201).json(newItem);
  } catch (error) {
    res.status(500).json({ error: `Erro ao criar item em ${collectionName}: ${error.message}` });
  }
};

const updateItem = async (collectionName, req, res) => {
  try {
    const { id } = req.params;
    const updatedData = req.body;
    const itemRef = db.collection(collectionName).doc(id);
    const docBefore = await itemRef.get();
    if (!docBefore.exists) {
        return res.status(404).json({ error: `Item com ID ${id} não encontrado em ${collectionName}.`});
    }
    const originalData = docBefore.data();

    // Lógica específica para Clientes: Adicionar novo endereço
    if (collectionName === 'clientes' && updatedData.newAddress) {
        await itemRef.update({
            enderecos: admin.firestore.FieldValue.arrayUnion(updatedData.newAddress)
        });
        // Remove a propriedade para não ser atualizada novamente
        delete updatedData.newAddress; 
    }
    
    // Lógica específica para Pedidos: Cancelamento e Finalização
    if (collectionName === 'pedidos') {
        const novoStatus = updatedData.status;
        // Se o pedido for cancelado, retorna o estoque
        if (novoStatus === 'Cancelado' && originalData.status !== 'Cancelado' && Array.isArray(originalData.itens)) {
            const batch = db.batch();
            for (const item of originalData.itens) {
              if (item.id && item.quantity > 0) {
                const productRef = db.collection('produtos').doc(item.id);
                batch.update(productRef, { estoque: admin.firestore.FieldValue.increment(item.quantity) });
              }
            }
             // Se tinha cupom, decrementa o uso
            if (originalData.cupom && originalData.cupom.codigo) {
                const cupomRef = db.collection('cupons').doc(originalData.cupom.codigo);
                batch.update(cupomRef, { usos: admin.firestore.FieldValue.increment(-1) });
            }
            await batch.commit();
        }
        // Se o pedido for finalizado, atualiza o total de compras do cliente
        if (novoStatus === 'Finalizado' && originalData.status !== 'Finalizado' && originalData.clienteId && originalData.total > 0) {
            const clienteRef = db.collection('clientes').doc(originalData.clienteId);
            await clienteRef.update({
              totalCompras: admin.firestore.FieldValue.increment(originalData.total),
              ultimaCompra: admin.firestore.FieldValue.serverTimestamp()
            });
        }
    }

    // Lógica específica para Pedidos de Compra: Recebimento de insumos
    if (collectionName === 'pedidosCompra' && updatedData.status === 'Recebido' && originalData.status !== 'Recebido') {
        const { itens } = updatedData;
        if (Array.isArray(itens)) {
            const batch = db.batch();
            for (const item of itens) {
                if (item.id && item.quantidade > 0) {
                    const estoqueRef = db.collection('estoque').doc(item.id);
                    batch.update(estoqueRef, { quantidade: admin.firestore.FieldValue.increment(item.quantidade) });
                }
            }
            await batch.commit();
        }
    }

    // Garante que só atualizamos se houver dados (além do newAddress já tratado)
    if (Object.keys(updatedData).length > 0) {
        await itemRef.update(updatedData);
    }
    
    const updatedDocSnapshot = await itemRef.get();
    const updatedDoc = { id: updatedDocSnapshot.id, ...updatedDocSnapshot.data() };
    Object.keys(updatedDoc).forEach(key => {
        if (updatedDoc[key] && typeof updatedDoc[key].toDate === 'function') {
            updatedDoc[key] = updatedDoc[key].toDate().toISOString();
        }
    });
    
    await createLog(`Atualização em ${collectionName}`, `Item ID ${id} atualizado.`);
    res.status(200).json(updatedDoc);
  } catch (error) {
    res.status(500).json({ error: `Erro ao atualizar item em ${collectionName}: ${error.message}` });
  }
};

const deleteItem = async (collectionName, req, res) => {
  try {
    const { id } = req.params;
    await db.collection(collectionName).doc(id).delete();
    await createLog(`Deleção em ${collectionName}`, `Item ID ${id} deletado.`);
    res.status(200).json({ message: `${collectionName} com id ${id} deletado com sucesso.` });
  } catch (error) {
    res.status(500).json({ error: `Erro ao deletar item em ${collectionName}: ${error.message}` });
  }
};

// --- ENDPOINTS GENÉRICOS ---
const collections = ['produtos', 'clientes', 'pedidos', 'contas_a_pagar', 'contas_a_receber', 'fornecedores', 'pedidosCompra', 'estoque', 'logs', 'cupons'];
collections.forEach(collection => {
    app.get(`/api/${collection}`, (req, res) => getAllItems(collection, res));
    app.post(`/api/${collection}`, (req, res) => createItem(collection, req, res));
    app.put(`/api/${collection}/:id`, (req, res) => updateItem(collection, req, res));
    app.delete(`/api/${collection}/:id`, (req, res) => deleteItem(collection, req, res));
});


// --- ENDPOINT ESPECÍFICO PARA VERIFICAR CUPOM ---
app.post('/api/cupons/verificar', async (req, res) => {
    const { codigo, valorCarrinho } = req.body;

    if (!codigo || typeof valorCarrinho !== 'number') {
        return res.status(400).json({ valido: false, mensagem: 'Código do cupom e valor do carrinho são obrigatórios.' });
    }

    try {
        const cupomRef = db.collection('cupons').doc(codigo.toUpperCase());
        const cupomDoc = await cupomRef.get();

        if (!cupomDoc.exists) {
            return res.status(404).json({ valido: false, mensagem: 'Cupom inválido.' });
        }

        const cupom = cupomDoc.data();

        if (cupom.status !== 'Ativo') {
            return res.json({ valido: false, mensagem: 'Este cupom não está ativo.' });
        }

        if (cupom.usos >= cupom.limiteUso) {
            return res.json({ valido: false, mensagem: 'Este cupom já atingiu o limite de usos.' });
        }

        if (valorCarrinho < cupom.valorMinimo) {
            return res.json({ valido: false, mensagem: `O valor mínimo para este cupom é de R$ ${cupom.valorMinimo.toFixed(2)}.` });
        }

        // Calcula o desconto
        let valorDesconto = 0;
        if (cupom.tipoDesconto === 'percentual') {
            valorDesconto = (valorCarrinho * cupom.valor) / 100;
        } else { // Fixo
            valorDesconto = cupom.valor;
        }

        res.status(200).json({
            valido: true,
            mensagem: 'Cupom aplicado com sucesso!',
            cupom: {
                codigo: cupom.codigo,
                tipoDesconto: cupom.tipoDesconto,
                valor: cupom.valor,
                valorDesconto: valorDesconto
            }
        });

    } catch (error) {
        console.error("Erro ao verificar cupom:", error);
        res.status(500).json({ valido: false, mensagem: 'Ocorreu um erro interno. Tente novamente.' });
    }
});


// --- ENDPOINTS PARA GERENCIAMENTO DE USUÁRIOS (Firebase Auth) ---
app.get('/api/users', async (req, res) => {
    try {
        const listUsersResult = await admin.auth().listUsers(1000);
        const usersFromAuth = listUsersResult.users;
        const usersCollection = await db.collection('users').get();
        const userRoles = {};
        usersCollection.forEach(doc => { userRoles[doc.id] = doc.data().role; });
        const combinedUsers = usersFromAuth.map(user => ({ uid: user.uid, email: user.email, role: userRoles[user.uid] || 'Atendente' }));
        res.status(200).json(combinedUsers);
    } catch (error) { res.status(500).json({ error: error.message }); }
});
app.post('/api/users', async (req, res) => {
    const { email, password, role } = req.body;
    if (!email || !password || !role) { return res.status(400).json({ error: 'Email, senha e permissão são obrigatórios.' }); }
    try {
        const userRecord = await admin.auth().createUser({ email, password });
        await db.collection('users').doc(userRecord.uid).set({ email, role });
        await createLog('Criação de Usuário', `Usuário ${email} criado com permissão ${role}.`);
        res.status(201).json({ uid: userRecord.uid, email: userRecord.email, role });
    } catch (error) { res.status(500).json({ error: error.code }); }
});
app.put('/api/users/:uid/role', async (req, res) => {
    const { uid } = req.params; const { role } = req.body;
    try { 
        await db.collection('users').doc(uid).update({ role }); 
        await createLog('Atualização de Permissão', `Permissão do usuário UID ${uid} alterada para ${role}.`);
        res.status(200).json({ message: 'Permissão atualizada.' });
    } catch (error) { res.status(500).json({ error: error.message }); }
});
app.put('/api/users/:uid/password', async (req, res) => {
    const { uid } = req.params; const { password } = req.body;
    try { 
        await admin.auth().updateUser(uid, { password }); 
        await createLog('Atualização de Senha', `Senha do usuário UID ${uid} foi alterada.`);
        res.status(200).json({ message: 'Senha atualizada.' });
    } catch (error) { res.status(500).json({ error: error.message }); }
});
app.delete('/api/users/:uid', async (req, res) => {
    const { uid } = req.params;
    try { 
        await admin.auth().deleteUser(uid); 
        await db.collection('users').doc(uid).delete(); 
        await createLog('Deleção de Usuário', `Usuário UID ${uid} foi deletado.`);
        res.status(200).json({ message: 'Usuário deletado.' });
    } catch (error) { res.status(500).json({ error: error.message }); }
});

app.listen(port, () => {
  console.log(`Servidor rodando na porta ${port}`);
});

