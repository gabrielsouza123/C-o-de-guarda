const express = require('express');
const path = require('path');
const bodyParser = require('body-parser');
const fs = require('fs');

const app = express();

// Configura a pasta "comprovantes" para servir arquivos estáticos (ex: imagens geradas)
app.use('/comprovantes', express.static(path.join(__dirname, 'comprovantes')));

// Configura a pasta "extratos" para servir arquivos estáticos (ex: imagens geradas)
app.use('/extratos', express.static(path.join(__dirname, 'extratos')));

// Configura a pasta de arquivos estáticos (imagens, CSS, JS)
app.use('/assets', express.static('assets'));

// Middleware para processar JSON no body das requisições
app.use(bodyParser.json());

// Configurações do EJS (views e template engine)
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Rota da API para gerar o comprovante
app.use('/api/gerar-comprovante', require('./api/gerar-comprovante'));

// Rota da API para gerar o extrato
app.use('/api/gerar-extrato', require('./api/gerar-extrato'));

// Inicia o servidor na porta definida pelo ambiente ou 3000 por padrão
const port = process.env.PORT || 3000;
app.listen(port, () => {
    console.log(`Servidor rodando na porta ${port}`);
});
