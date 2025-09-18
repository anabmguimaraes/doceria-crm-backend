const express = require('express');
const cors = require('cors');
const admin = require("firebase-admin");
const axios = require('axios'); // Importe o axios
const { db } = require('./firebaseConfig');

const app = express();
const PORT = process.env.PORT || 3001;

// ATENÇÃO: Substitua pela sua chave da API do Google Maps
const GOOGLE_MAPS_API_KEY = 'SUA_CHAVE_API_GOOGLE_MAPS';

app.use(cors());
app.use(express.json());

// --- ROTAS DE CONFIGURAÇÃO DE FRETE ---

// Rota para buscar as configurações de frete salvas
app.get('/api/configuracoes/frete', async (req, res) => {
    try {
        const doc = await db.collection('configuracoes').doc('frete').get();
        if (!doc.exists) {
            return res.status(404).json({ message: 'Configurações de frete não encontradas.' });
        }
        res.json(doc.data());
    } catch (error) {
        console.error("Erro ao buscar configurações de frete:", error);
        res.status(500).send(error.message);
    }
});

// Rota para salvar ou atualizar as configurações de frete
app.post('/api/configuracoes/frete', async (req, res) => {
    try {
        const freteConfig = req.body;
        await db.collection('configuracoes').doc('frete').set(freteConfig, { merge: true });
        res.status(200).json({ message: 'Configurações de frete salvas com sucesso!', ...freteConfig });
    } catch (error) {
        console.error("Erro ao salvar configurações de frete:", error);
        res.status(500).send(error.message);
    }
});

// --- ROTA DE CÁLCULO DE FRETE ---

app.post('/api/frete/calcular', async (req, res) => {
    const { clienteLat, clienteLng } = req.body;

    if (!clienteLat || !clienteLng) {
        return res.status(400).json({ message: 'Coordenadas do cliente são obrigatórias.' });
    }

    try {
        // 1. Buscar configurações da loja no Firestore
        const freteConfigDoc = await db.collection('configuracoes').doc('frete').get();
        if (!freteConfigDoc.exists || !freteConfigDoc.data().lat || !freteConfigDoc.data().lng || !freteConfigDoc.data().valorPorKm) {
            return res.status(500).json({ message: 'Configurações de frete da loja estão incompletas.' });
        }
        const { lat: lojaLat, lng: lojaLng, valorPorKm } = freteConfigDoc.data();

        // 2. Chamar a API do Google Maps para obter a distância
        const url = `https://maps.googleapis.com/maps/api/directions/json?origin=${lojaLat},${lojaLng}&destination=${clienteLat},${clienteLng}&key=${GOOGLE_MAPS_API_KEY}`;
        const response = await axios.get(url);

        if (response.data.status !== 'OK' || !response.data.routes[0]?.legs[0]?.distance?.value) {
            console.warn('Google Maps API response not OK:', response.data);
            return res.status(500).json({ message: 'Não foi possível calcular a rota para este endereço.' });
        }

        const distanciaEmMetros = response.data.routes[0].legs[0].distance.value;
        const distanciaKm = distanciaEmMetros / 1000;

        // 3. Calcular o valor do frete
        const valorFrete = distanciaKm * valorPorKm;

        res.json({
            distanciaKm: parseFloat(distanciaKm.toFixed(2)),
            valorFrete: parseFloat(valorFrete.toFixed(2))
        });

    } catch (error) {
        console.error('Erro ao calcular frete:', error.response ? error.response.data : error.message);
        res.status(500).json({ message: 'Erro interno ao calcular o frete.' });
    }
});

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
        if (cupom.usos >= cupom.limiteUso) {
            return res.json({ valido: false, mensagem: "Cupom expirado." });
        }
        if (totalCarrinho < cupom.valorMinimo) {
            return res.json({ valido: false, mensagem: `O valor mínimo para este cupom é de R$ ${cupom.valorMinimo.toFixed(2)}.` });
        }
        
        const cupomUsosRef = db.collection('cupomUsos');
        const usoSnapshot = await cupomUsosRef.where('cupomId', '==', cupom.id).where('telefone', '==', telefoneLimpo).limit(1).get();

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

    if (collectionName !== 'pedidos' && collectionName !== 'clientes') {
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

    if (collectionName === 'clientes') {
        app.put(`/api/clientes/:id`, async (req, res) => {
            try {
                const clienteId = req.params.id;
                const updateData = req.body;
                
                if (updateData.newAddress) {
                    await db.collection('clientes').doc(clienteId).update({
                        enderecos: admin.firestore.FieldValue.arrayUnion(updateData.newAddress)
                    });
                } else {
                    await db.collection('clientes').doc(clienteId).set(updateData, { merge: true });
                }
                
                const updatedDoc = await db.collection('clientes').doc(clienteId).get();
                res.status(200).json({ id: updatedDoc.id, ...updatedDoc.data() });
            } catch (error) {
                res.status(500).send(error.message);
            }
        });
    } else {
        app.put(`/api/${collectionName}/:id`, async (req, res) => {
            try {
                await db.collection(collectionName).doc(req.params.id).set(req.body, { merge: true });
                res.status(200).json({ id: req.params.id, ...req.body });
            } catch (error) {
                res.status(500).send(error.message);
            }
        });
    }

    app.delete(`/api/${collectionName}/:id`, async (req, res) => {
        try {
            await db.collection(collectionName).doc(req.params.id).delete();
            res.status(204).send();
        } catch (error) {
            res.status(500).send(error.message);
        }
    });
};

app.post(`/api/clientes`, async (req, res) => {
    try {
        const newItem = { ...req.body, createdAt: new Date().toISOString() };
        if (newItem.enderecos && !Array.isArray(newItem.enderecos)) {
            newItem.enderecos = [newItem.enderecos];
        }
        const docRef = await db.collection('clientes').add(newItem);
        res.status(201).json({ id: docRef.id, ...newItem });
    } catch (error) {
        res.status(500).send(error.message);
    }
});

app.post(`/api/pedidos`, async (req, res) => {
    try {
        const orderData = req.body;
        
        if (orderData.cupom && orderData.telefone) {
            const { cupom, telefone, subtotal } = orderData;
            const telefoneLimpo = telefone.replace(/\D/g, '');

            const cupomDoc = await db.collection('cupons').doc(cupom.id).get();
            if (!cupomDoc.exists) return res.status(400).json({ message: 'Cupom inválido.' });
            
            const cupomAtual = cupomDoc.data();
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

