import cors from 'cors';
import express from 'express';
import { config } from './config.js';
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

app.listen(config.port, async () => {
  log.info(`${config.characterName} sunucusu :${config.port} portunda`);
  const provider = await resolveLlm();
  if (provider.id === 'local') {
    log.warn('GEMINI_API_KEY yok — karakter yerel yedek motorla calisiyor.');
    log.warn('Zeka icin .env dosyasina GEMINI_API_KEY ekleyin.');
  }
});
