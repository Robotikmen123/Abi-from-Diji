import { Router } from 'express';
import { memory } from '../providers/memory/fileMemory.js';

export const memoryRouter: Router = Router();

memoryRouter.get('/memory', async (_req, res) => {
  res.json({ facts: await memory.list() });
});

memoryRouter.post('/memory', async (req, res) => {
  const text = String((req.body as { text?: string }).text ?? '');
  const fact = await memory.remember(text);
  if (!fact) {
    res.status(400).json({ error: 'gecersiz bilgi' });
    return;
  }
  res.json({ fact });
});

memoryRouter.delete('/memory/:id', async (req, res) => {
  await memory.forget(String(req.params.id));
  res.json({ ok: true });
});

memoryRouter.delete('/memory', async (_req, res) => {
  await memory.clear();
  res.json({ ok: true });
});
