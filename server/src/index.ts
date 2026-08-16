import cors from 'cors';
import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { config, ROOT } from './config.js';
import { resolveLlm } from './providers/llm/index.js';
import { chatRouter } from './routes/chat.js';
import { healthRouter } from './routes/health.js';
import { memoryRouter } from './routes/memory.js';
import { log } from './util/log.js';

const app = express();

app.use(cors());
app.use(express.json({ limit: '1mb' }));
app.use('/api', healthRouter);
app.use('/api', chatRouter);
app.use('/api', memoryRouter);

// Uretimde arayuz de buradan servis edilir. Boylece masaustu kabugu file://
// yerine http:// yukler: varlik yollari ve localStorage sorunsuz calisir.
const webDist = path.join(ROOT, 'web', 'dist');
if (fs.existsSync(webDist)) {
  app.use(express.static(webDist));
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api/')) return next();
    res.sendFile(path.join(webDist, 'index.html'));
  });
}

const server = app.listen(config.port, async () => {
  log.info(`${config.characterName} sunucusu :${config.port} portunda`);
  const provider = await resolveLlm();
  if (provider.id === 'local') {
    log.warn('GEMINI_API_KEY yok — karakter yerel yedek motorla calisiyor.');
    log.warn('Zeka icin .env dosyasina GEMINI_API_KEY ekleyin.');
  }
});

server.on('error', (err: NodeJS.ErrnoException) => {
  // Masaustu kabugu sunucuyu kendi baslatiyor; zaten calisiyorsa bu normal.
  if (err.code === 'EADDRINUSE') {
    log.warn(`:${config.port} portu dolu — baska bir ${config.characterName} ornegi calisiyor olabilir.`);
    process.exit(0);
  }
  log.error('sunucu baslatilamadi', err);
  process.exit(1);
});
