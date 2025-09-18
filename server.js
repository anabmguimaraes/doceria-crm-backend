const express = require('express');
const cors = require('cors');
const admin = require("firebase-admin");
const { db } = require('./firebaseConfig');

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

app.post('/api/cupons/verificar', async (req, res) => {
    const { codigo, totalCarrinho, telefone } = req.body;

    if (!codigo || totalCarrinho === undefined || !telefone) {
        return res.status(400).json({ valido: false, mensagem: "Código, total do carrinho e telefone são obrigatórios." });
    }

    const telefoneLimpo = telefone.replace(/\D/g, '');

    try {
        const cuponsRef = db.collection('cupons');
        const snapshot = await cuponsRef.where('codigo', '==', codigo.toUpperCase()).limit(1).get();

        if (snapshot.empty) {
            return res.status(404).json({ valido: false, mensagem: "Cupom não encontrado." });
        }

        const cupomDoc = snapshot.docs[0];
        const cupom = { id: cupomDoc.id, ...cupomDoc.data() };

        if (cupom.status !== 'Ativo') {
            return res.json({ valido: false, mensagem: "Este cupom não está mais ativo." });
        }
        // ALTERAÇÃO: Mensagem atualizada para "Cupom expirado" quando o limite global é atingido.
        if (cupom.usos >= cupom.limiteUso) {
            return res.json({ valido: false, mensagem: "Cupom expirado." });
        }
        if (totalCarrinho < cupom.valorMinimo) {
            return res.json({ valido: false, mensagem: `O valor mínimo para este cupom é de R$ ${cupom.valorMinimo.toFixed(2)}.` });
        }
        
        const cupomUsosRef = db.collection('cupomUsos');
        const usoSnapshot = await cupomUsosRef.where('cupomId', '==', cupom.id).where('telefone', '==', telefoneLimpo).limit(1).get();

        // ALTERAÇÃO: Mensagem atualizada para uso único por pessoa.
        if (!usoSnapshot.empty) {
            return res.json({ valido: false, mensagem: "Este cupom só pode ser utilizado uma vez por pessoa." });
        }

        let valorDesconto = (cupom.tipoDesconto === 'percentual')
            ? (totalCarrinho * cupom.valor) / 100
            : cupom.valor;
        
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

const createCrudEndpoints = (collectionName) => {
    app.get(`/api/${collectionName}`, async (req, res) => {
        try {
            const snapshot = await db.collection(collectionName).get();
            const items = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            res.json(items);
        } catch (error) {
            res.status(500).send(error.message);
        }
    });

    if (collectionName !== 'pedidos') {
        app.post(`/api/${collectionName}`, async (req, res) => {
            try {
                const newItem = { ...req.body, createdAt: new Date().toISOString() };
                const docRef = await db.collection(collectionName).add(newItem);
                res.status(201).json({ id: docRef.id, ...newItem });
            } catch (error) {
                res.status(500).send(error.message);
            }
        });
    }

    app.put(`/api/${collectionName}/:id`, async (req, res) => {
        try {
            await db.collection(collectionName).doc(req.params.id).set(req.body, { merge: true });
            res.status(200).json({ id: req.params.id, ...req.body });
        } catch (error) {
            res.status(500).send(error.message);
        }
    });

    app.delete(`/api/${collectionName}/:id`, async (req, res) => {
        try {
            await db.collection(collectionName).doc(req.params.id).delete();
            res.status(204).send();
        } catch (error) {
            res.status(500).send(error.message);
        }
    });
};

app.post(`/api/pedidos`, async (req, res) => {
    try {
        const orderData = req.body;
        
        if (orderData.cupom && orderData.telefone) {
            const { cupom, telefone, subtotal } = orderData;
            const telefoneLimpo = telefone.replace(/\D/g, '');

            const cupomDoc = await db.collection('cupons').doc(cupom.id).get();
            if (!cupomDoc.exists) return res.status(400).json({ message: 'Cupom inválido.' });
            
            const cupomAtual = cupomDoc.data();
            // Validação dupla no backend
            if (cupomAtual.status !== 'Ativo' || cupomAtual.usos >= cupomAtual.limiteUso || subtotal < cupomAtual.valorMinimo) {
                 return res.status(400).json({ message: 'Cupom não é mais válido.' });
            }

            const usoSnapshot = await db.collection('cupomUsos').where('cupomId', '==', cupom.id).where('telefone', '==', telefoneLimpo).limit(1).get();
            if (!usoSnapshot.empty) {
                return res.status(400).json({ message: 'Este cupom já foi utilizado por você.' });
            }
        }

        const newItem = { ...orderData, createdAt: new Date().toISOString() };
        const docRef = await db.collection('pedidos').add(newItem);
        
        if (orderData.cupom && orderData.telefone) {
             const { cupom, telefone, clienteId } = orderData;
             const telefoneLimpo = telefone.replace(/\D/g, '');

             await db.collection('cupomUsos').add({
                cupomId: cupom.id,
                codigo: cupom.codigo,
                clienteId: clienteId,
                telefone: telefoneLimpo,
                pedidoId: docRef.id,
                dataUso: new Date().toISOString()
            });

            const cupomDocRef = db.collection('cupons').doc(cupom.id);
            await cupomDocRef.update({ usos: admin.firestore.FieldValue.increment(1) });
        }
        
        res.status(201).json({ id: docRef.id, ...newItem });
    } catch (error) {
        console.error(`Erro ao criar em pedidos:`, error);
        res.status(500).send(error.message);
    }
});

['clientes', 'produtos', 'contas_a_pagar', 'contas_a_receber', 'fornecedores', 'pedidosCompra', 'estoque', 'cupons', 'logs', 'cupomUsos'].forEach(collection => {
    createCrudEndpoints(collection);
});

app.listen(PORT, () => {
    console.log(`Servidor da Doceria CRM rodando na porta ${PORT}`);
});

