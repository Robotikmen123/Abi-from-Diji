import fs from 'node:fs/promises';
import path from 'node:path';
import { config } from '../../config.js';
import type { MemoryFact, MemoryProvider } from '../types.js';

/** Uzun sureli hafiza: bagimliliksiz JSON dosyasi. */
export class FileMemoryProvider implements MemoryProvider {
  readonly id = 'file';
  private cache: MemoryFact[] | null = null;
  private writing: Promise<void> = Promise.resolve();

  async list(): Promise<MemoryFact[]> {
    if (this.cache) return this.cache;
    try {
      const raw = await fs.readFile(config.memory.file, 'utf8');
      const parsed = JSON.parse(raw) as { facts?: MemoryFact[] };
      this.cache = Array.isArray(parsed.facts) ? parsed.facts : [];
    } catch {
      this.cache = [];
    }
    return this.cache;
  }

  async remember(text: string): Promise<MemoryFact | null> {
    const clean = text.trim().replace(/\s+/g, ' ');
    if (clean.length < 3 || clean.length > 240) return null;

    const facts = await this.list();
    const normalized = clean.toLocaleLowerCase('tr');
    const existing = facts.find((f) => f.text.toLocaleLowerCase('tr') === normalized);
    if (existing) {
      existing.hits += 1;
      await this.persist();
      return existing;
    }

    const fact: MemoryFact = {
      id: `m_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`,
      text: clean,
      createdAt: Date.now(),
      hits: 1,
    };
    facts.push(fact);
    // Sinir asilirsa en az kullanilan ve en eski kayitlar dusurulur.
    if (facts.length > config.memory.maxFacts) {
      facts.sort((a, b) => b.hits - a.hits || b.createdAt - a.createdAt);
      facts.length = config.memory.maxFacts;
    }
    await this.persist();
    return fact;
  }

  async forget(id: string): Promise<void> {
    const facts = await this.list();
    const index = facts.findIndex((f) => f.id === id);
    if (index >= 0) {
      facts.splice(index, 1);
      await this.persist();
    }
  }

  async clear(): Promise<void> {
    this.cache = [];
    await this.persist();
  }

  private async persist(): Promise<void> {
    const snapshot = { version: 1, facts: this.cache ?? [] };
    // Yazmalari siraya al: es zamanli istekler dosyayi bozmasin.
    this.writing = this.writing.then(async () => {
      await fs.mkdir(path.dirname(config.memory.file), { recursive: true });
      await fs.writeFile(config.memory.file, JSON.stringify(snapshot, null, 2), 'utf8');
    });
    await this.writing;
  }
}

export const memory = new FileMemoryProvider();
