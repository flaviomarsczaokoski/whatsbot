// Bot moderador de links para WhatsApp (whatsapp-web.js atualizado)
// Autor: Flávio + ChatGPT

const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');

// Regex para detectar links
const LINK_REGEX =
  /\b((https?:\/\/|www\.)[^\s<>()]+|[^\s<>()]+\.(com|net|org|io|gov|edu|app|br)(\/[^\s<>()]*)?)\b/i;

// Lista de domínios permitidos (vazia = todos bloqueados)
const WHITELIST_DOMAINS = [
  // 'meusite.com',
];

// Mensagem de aviso
const WARNING_TEXT =
  '⚠️ *É contra as regras do grupo enviar links.* A mensagem foi removida.';

// Se true, permite admins enviarem links
const ALLOW_ADMINS_TO_POST = true;

const client = new Client({
  authStrategy: new LocalAuth({ clientId: 'moderador-links' }),
  puppeteer: {
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  },
});

// Mostra QR Code no terminal
client.on('qr', (qr) => {
  console.clear();
  console.log('📱 Escaneie este QR no WhatsApp para conectar:');
  qrcode.generate(qr, { small: true });
});

client.on('ready', () => {
  console.log('✅ Bot conectado e pronto para moderar!');
});

client.on('message_create', async (msg) => {
  try {
    // Só atua em grupos
    if (!msg.from.endsWith('@g.us')) return;

    const chat = await msg.getChat();
    if (!chat.isGroup) return;

    const contact = await msg.getContact();
    const meId = client.info.wid._serialized;

    // Verifica se o BOT é admin
    const meAsParticipant = chat.participants.find(
      (p) => p.id._serialized === meId
    );
    const botIsAdmin =
      !!meAsParticipant?.isAdmin || !!meAsParticipant?.isSuperAdmin;
    if (!botIsAdmin) return;

    const text = (msg.body || '').trim();

    // Ignora mensagens do próprio bot
    if (msg.fromMe) return;

    // Verifica se a mensagem contém link proibido
    if (!containsBlockedLink(text)) return;

    // Se for admin e permitido postar, não faz nada
    const senderAsParticipant = chat.participants.find(
      (p) => p.id.user === contact.id.user
    );
    const senderIsAdmin =
      !!senderAsParticipant?.isAdmin || !!senderAsParticipant?.isSuperAdmin;

    if (senderIsAdmin && ALLOW_ADMINS_TO_POST) return;

    // Tenta apagar "para todos"
    try {
      await msg.delete(true);
    } catch (err) {
      try {
        await msg.delete(); // apaga só para o bot
      } catch {}
      console.warn(
        '⚠️ Falha ao apagar para todos (mensagem antiga ou permissão insuficiente):',
        err?.message
      );
    }

    // Envia aviso mencionando o autor (formato atualizado)
    await chat.sendMessage(WARNING_TEXT, { mentions: [contact.id._serialized] });
  } catch (error) {
    console.error('❌ Erro ao processar mensagem:', error);
  }
});

client.initialize();

/** Função auxiliar para verificar se o link é bloqueado **/
function containsBlockedLink(text) {
  if (!text) return false;
  const match = text.match(LINK_REGEX);
  if (!match) return false;

  if (WHITELIST_DOMAINS.length > 0) {
    const lower = text.toLowerCase();
    const isWhitelisted = WHITELIST_DOMAINS.some((d) =>
      lower.includes(d.toLowerCase())
    );
    return !isWhitelisted;
  }

  return true;
}
