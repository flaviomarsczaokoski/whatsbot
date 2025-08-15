import express from 'express';
import qrcode from 'qrcode';
import fs from 'fs';
import { Client, LocalAuth } from 'whatsapp-web.js';

const app = express();
let qrCodeDataUrl = '';
const PORT = process.env.PORT || 3000;

const infractionsFile = './infractions.json';

function loadInfractions() {
  if (!fs.existsSync(infractionsFile)) fs.writeFileSync(infractionsFile, '{}');
  return JSON.parse(fs.readFileSync(infractionsFile));
}

function saveInfractions(data) {
  fs.writeFileSync(infractionsFile, JSON.stringify(data));
}

const client = new Client({
  authStrategy: new LocalAuth(),
  puppeteer: { args: ['--no-sandbox'] }
});

client.on('qr', async qr => {
  console.log('QR recebido. Acesse /qr para visualizar.');
  qrCodeDataUrl = await qrcode.toDataURL(qr);
});

client.on('ready', () => {
  console.log('✅ Bot pronto!');
});

client.on('message', async msg => {
  const chat = await msg.getChat();
  if (!chat.isGroup) return;

  const linkRegex = /(https?:\/\/[^\s]+)/g;
  if (linkRegex.test(msg.body)) {
    const sender = await msg.getContact();
    const senderId = sender.id._serialized;
    const senderName = sender.pushname || sender.number;

    let infractions = loadInfractions();
    infractions[senderId] = (infractions[senderId] || 0) + 1;
    saveInfractions(infractions);

    await msg.delete(true);
    await chat.sendMessage(`🚫 @${sender.number}, enviar links é contra as regras do grupo. Infração ${infractions[senderId]}/2.`, {
      mentions: [sender]
    });

    if (infractions[senderId] >= 2) {
      await chat.removeParticipants([senderId]);
      delete infractions[senderId];
      saveInfractions(infractions);
      console.log(`Usuário ${senderName} removido por excesso de infrações.`);
    }
  }
});

app.get('/qr', (req, res) => {
  if (!qrCodeDataUrl) return res.send('QR ainda não gerado, aguarde...');
  res.send(`<img src="${qrCodeDataUrl}" />`);
});

client.initialize();

app.listen(PORT, () => {
  console.log(`🌐 Servidor HTTP rodando na porta ${PORT}`);
});
