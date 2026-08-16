import { Router } from 'express';
import { config } from '../config.js';
import { activeLlmId, activeLlmLabel, resolveLlm } from '../providers/llm/index.js';
import { resolveTts } from '../providers/tts/index.js';

export const healthRouter: Router = Router();

healthRouter.get('/health', async (_req, res) => {
  await resolveLlm();
  const tts = resolveTts();
  res.json({
    ok: true,
    character: config.characterName,
    llm: { id: activeLlmId(), label: activeLlmLabel() },
    tts: { id: tts.id, label: tts.label, clientSide: tts.clientSide },
  });
});
