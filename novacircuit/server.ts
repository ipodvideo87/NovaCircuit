/**
 * NovaCircuit Express Server
 *
 * Serves:
 *  - Vite-built static frontend (production)
 *  - AI Copilot proxy → Google Gemini API
 */

import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { GoogleGenAI } from '@google/genai';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(express.json({ limit: '512kb' }));

// ─── AI Copilot Endpoint ──────────────────────────────────────────────────────

app.post('/api/chat', async (req, res) => {
  const { message, context } = req.body as {
    message: string;
    context?: {
      componentCount?: number;
      traceCount?: number;
      nets?: string[];
    };
  };

  if (!message?.trim()) {
    return res.status(400).json({ error: 'message is required' });
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return res.status(503).json({
      reply: 'AI Copilot is not configured. Set GEMINI_API_KEY in your .env file.',
    });
  }

  try {
    const ai = new GoogleGenAI({ apiKey });

    const systemContext = context
      ? `The user is working on a PCB with ${context.componentCount ?? 0} components, ` +
        `${context.traceCount ?? 0} traces, and nets: ${(context.nets ?? []).join(', ')}.`
      : 'The user is working on a PCB layout.';

    const prompt = `You are NovaCircuit AI Copilot — an expert PCB design assistant specialising in ` +
      `signal integrity, power distribution, impedance matching, and IPC standards. ` +
      `${systemContext}\n\nUser: ${message}\n\nProvide a concise, technical answer.`;

    const response = await ai.models.generateContent({
      model: 'gemini-2.0-flash',
      contents: prompt,
    });

    const reply = response.text ?? 'No response generated.';
    return res.json({ reply });
  } catch (err) {
    console.error('[AI Copilot] Error:', err);
    return res.status(500).json({
      reply: 'AI Copilot encountered an error. Please try again.',
    });
  }
});

// ─── Static Frontend ──────────────────────────────────────────────────────────

const distPath = path.join(__dirname, 'dist');

// Serve static assets
app.use(express.static(distPath));

// SPA fallback
app.get('*', (_req, res) => {
  res.sendFile(path.join(distPath, 'index.html'), err => {
    if (err) {
      res.status(404).send('Not found — run `npm run build` first for production mode.');
    }
  });
});

// ─── Start ────────────────────────────────────────────────────────────────────

const PORT = parseInt(process.env.PORT ?? '3000', 10);
app.listen(PORT, () => {
  console.log(`NovaCircuit server running on http://localhost:${PORT}`);
  if (!process.env.GEMINI_API_KEY) {
    console.warn('⚠  GEMINI_API_KEY not set — AI Copilot will be disabled.');
  }
});
