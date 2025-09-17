const express = require('express');
const cors = require('cors');
const { db } = require('./firebaseConfig'); // Garanta que firebaseConfig.js está na mesma pasta

// Inicialização do Express
const app = express();
const PORT = process.env.PORT || 3001;

// --- Middlewares Essenciais ---
app.use(cors()); // Habilita o CORS para permitir requisições do seu frontend
app.use(express.json()); // <<< CORREÇÃO PRINCIPAL: Habilita o servidor a ler e interpretar JSON no corpo das requisições. A falta desta linha era a causa provável do erro.

// --- API Routes ---

/**
 * Rota para verificar a validade de um cupom de desconto.
 */
app.post('/api/cupons/verificar', async (req, res) => {
    // A linha `app.use(express.json());` garante que `req.body` tenha os dados enviados
    const { codigo, totalCarrinho } = req.body;

    // Validação de entrada
    if (!codigo || totalCarrinho === undefined) {
        // Retorna o erro que você estava vendo se os dados não chegarem
        return res.status(400).json({ valido: false, mensagem: "Código do cupom e valor do carrinho são obrigatórios." });
    }

    try {
        const cuponsRef = db.collection('cupons');
        const snapshot = await cuponsRef.where('codigo', '==', codigo.toUpperCase()).limit(1).get();

        if (snapshot.empty) {
            return res.status(404).json({ valido: false, mensagem: "Cupom não encontrado." });
        }

        const cupomDoc = snapshot.docs[0];
        const cupom = { id: cupomDoc.id, ...cupomDoc.data() };

        // Realiza as validações do cupom
        if (cupom.status !== 'Ativo') {
            return res.json({ valido: false, mensagem: "Este cupom não está mais ativo." });
        }
        if (cupom.usos >= cupom.limiteUso) {
            return res.json({ valido: false, mensagem: "Este cupom já atingiu o limite de usos." });
        }
        if (totalCarrinho < cupom.valorMinimo) {
            return res.json({ valido: false, mensagem: `O valor mínimo para este cupom é de R$ ${cupom.valorMinimo.toFixed(2)}.` });
        }
        
        // Calcula o valor do desconto
        let valorDesconto = 0;
        if (cupom.tipoDesconto === 'percentual') {
            valorDesconto = (totalCarrinho * cupom.valor) / 100;
        } else if (cupom.tipoDesconto === 'fixo') {
            valorDesconto = cupom.valor;
        }

        // Garante que o desconto não seja maior que o total do carrinho
        valorDesconto = Math.min(valorDesconto, totalCarrinho);

        const cupomAplicado = {
            ...cupom,
            valorDesconto: parseFloat(valorDesconto.toFixed(2))
        };

        return res.json({ valido: true, mensagem: "Cupom aplicado com sucesso!", cupom: cupomAplicado });

    } catch (error) {
        console.error("Erro ao verificar cupom:", error);
        res.status(500).json({ valido: false, mensagem: "Erro interno ao verificar o cupom." });
    }
});

/**
 * Função genérica para criar rotas de CRUD (Create, Read, Update, Delete) para uma coleção.
 * @param {string} collectionName - O nome da coleção no Firestore.
 */
const createCrudEndpoints = (collectionName) => {
    // GET (Listar todos)
    app.get(`/api/${collectionName}`, async (req, res) => {
        try {
            const snapshot = await db.collection(collectionName).get();
            const items = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            res.json(items);
        } catch (error) {
            console.error(`Erro ao buscar ${collectionName}:`, error);
            res.status(500).send(error.message);
        }
    });

    // POST (Criar novo)
    app.post(`/api/${collectionName}`, async (req, res) => {
        try {
            const newItem = { ...req.body, createdAt: new Date().toISOString() };
            const docRef = await db.collection(collectionName).add(newItem);
            res.status(201).json({ id: docRef.id, ...newItem });
        } catch (error) {
            console.error(`Erro ao criar em ${collectionName}:`, error);
            res.status(500).send(error.message);
        }
    });

    // PUT (Atualizar)
    app.put(`/api/${collectionName}/:id`, async (req, res) => {
        try {
            const { id } = req.params;
            await db.collection(collectionName).doc(id).set(req.body, { merge: true });
            res.status(200).json({ id, ...req.body });
        } catch (error) {
            console.error(`Erro ao atualizar em ${collectionName}:`, error);
            res.status(500).send(error.message);
        }
    });

    // DELETE (Deletar)
    app.delete(`/api/${collectionName}/:id`, async (req, res) => {
        try {
            const { id } = req.params;
            await db.collection(collectionName).doc(id).delete();
            res.status(204).send();
        } catch (error) {
            console.error(`Erro ao deletar em ${collectionName}:`, error);
            res.status(500).send(error.message);
        }
    });
};

// Cria as rotas de CRUD para todas as coleções usadas no seu frontend
['clientes', 'pedidos', 'produtos', 'contas_a_pagar', 'contas_a_receber', 'fornecedores', 'pedidosCompra', 'estoque', 'cupons', 'logs'].forEach(collection => {
    createCrudEndpoints(collection);
});


// --- Inicialização do Servidor ---
app.listen(PORT, () => {
    console.log(`Servidor da Doceria CRM rodando na porta ${PORT}`);
});
