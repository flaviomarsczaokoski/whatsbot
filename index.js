const fs = require('fs');
const { Client } = require('whatsapp-web.js');
const qrcode = require('qrcode');

// Configurações
const LINK_REGEX =
  /\b((https?:\/\/|www\.)[^\s<>()]+|[^\s<>()]+\.(com|net|org|io|gov|edu|app|br)(\/[^\s<>()]*)?)\b/i;
const WHITELIST_DOMAINS = [];
const WARNING_TEXT =
  '⚠️ *É contra as regras do grupo enviar links.* A mensagem foi removida.';
const ALLOW_ADMINS_TO_POST = true;
const MAX_STRIKES = 2;

// Arquivos de sessão e infrações
const SESSION_FILE_PATH = './session.json';
const STRIKES_FILE_PATH = './strikes.json';
let sessionData;
let strikes = {};

// Tenta carregar sessão existente
try {
    if (fs.existsSync(SESSION_FILE_PATH)) {
        const fileContent = fs.readFileSync(SESSION_FILE_PATH, 'utf8');
        if (fileContent) sessionData = JSON.parse(fileContent);
    }
} catch (err) {
    console.log('⚠️ Falha ao ler session.json. Será gerada uma nova sessão.');
    sessionData = null;
}

// Carrega strikes
if (fs.existsSync(STRIKES_FILE_PATH)) {
    try {
        const data = fs.readFileSync(STRIKES_FILE_PATH, 'utf8');
        if (data) strikes = JSON.parse(data);
    } catch {}
}

// Inicializa cliente
const client = new Client({
  session: sessionData,
  puppeteer: { headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox'] }
});

// QR Code
client.on('qr', async (qr) => {
  console.log('📱 QR Code gerado! Escaneie no WhatsApp.');
  await qrcode.toFile('qr.png', qr);
});

// Sessão autenticada
client.on('authenticated', (session) => {
  sessionData = session;
  fs.writeFileSync(SESSION_FILE_PATH, JSON.stringify(session));
  console.log('💾 Sessão salva com sucesso!');
});

client.on('auth_failure', () => {
  console.log('❌ Falha na autenticação. Apague session.json e tente novamente.');
});

client.on('ready', () => {
  console.log('✅ Bot pronto e conectado!');
});

// Mensagens
client.on('message_create', async (msg) => {
  try {
    if (!msg.from.endsWith('@g.us')) return;
    const chat = await msg.getChat();
    if (!chat.isGroup) return;

    const contact = await msg.getContact();
    const meId = client.info.wid._serialized;

    // Verifica se bot é admin
    const meAsParticipant = chat.participants.find(p => p.id._serialized === meId);
    const botIsAdmin = !!meAsParticipant?.isAdmin || !!meAsParticipant?.isSuperAdmin;
    if (!botIsAdmin) return;

    const text = (msg.body || '').trim();
    if (!text || msg.fromMe) return;

    // Verifica link proibido
    if (!containsBlockedLink(text)) return;

    // Se admin e permitido postar, ignora
    const senderAsParticipant = chat.participants.find(p => p.id.user === contact.id.user);
    const senderIsAdmin = !!senderAsParticipant?.isAdmin || !!senderAsParticipant?.isSuperAdmin;
    if (senderIsAdmin && ALLOW_ADMINS_TO_POST) return;

    // Apaga mensagem
    try {
      await msg.delete(true);
    } catch (err) {
      try { await msg.delete(); } catch {}
      console.warn('⚠️ Falha ao apagar para todos:', err?.message);
    }

    // Atualiza strikes
    const userId = contact.id._serialized;
    strikes[userId] = (strikes[userId] || 0) + 1;
    fs.writeFileSync(STRIKES_FILE_PATH, JSON.stringify(strikes, null, 2));

    // Mensagem de aviso
    await chat.sendMessage(`${WARNING_TEXT}\n📌 Infrações: ${strikes[userId]}/${MAX_STRIKES}`, { mentions: [userId] });

    // Remove usuário se exceder limite
    if (strikes[userId] >= MAX_STRIKES) {
      try {
        await chat.removeParticipants([userId]);
        console.log(`🛑 Usuário removido por excesso de infrações: ${contact.pushname || userId}`);
        delete strikes[userId];
        fs.writeFileSync(STRIKES_FILE_PATH, JSON.stringify(strikes, null, 2));
      } catch (err) {
        console.error('❌ Falha ao remover usuário:', err);
      }
    }

  } catch (err) {
    console.error('❌ Erro ao processar mensagem:', err);
  }
});

// Função auxiliar
function containsBlockedLink(text) {
  const match = text.match(LINK_REGEX);
  if (!match) return false;

  if (WHITELIST_DOMAINS.length > 0) {
    const lower = text.toLowerCase();
    const isWhitelisted = WHITELIST_DOMAINS.some(d => lower.includes(d.toLowerCase()));
    return !isWhitelisted;
  }
  return true;
}

// Inicializa bot
client.initialize();
