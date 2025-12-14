'use strict';

import Parser from 'rss-parser';

const QUERY_PREFIX =
  'Represent this sentence for searching relevant passages: ';
const ARXIV_QUERY_URL = 'https://export.arxiv.org/api/query';
const PAGE_SIZE = 10;

import { getOptions } from './helper';
import OpenAI from 'openai';
import { Options } from '../types';



// Helper to calculate cosine similarity
function cosineSimilarity(vecA: number[], vecB: number[]) {
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < vecA.length; i++) {
    dot += vecA[i] * vecB[i];
    normA += vecA[i] * vecA[i];
    normB += vecB[i] * vecB[i];
  }
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

export async function search(query: string, page: number) {
  const options = await getOptions();
  if (!options.apiKey) {
    console.warn("No API Key set");
    return [];
  }

  // 1. Search arXiv for candidates (Keyword search)
  // Clean query to avoid breaking arXiv API (simple sanitization)
  const cleanQuery = query.replace(/[^a-zA-Z0-9\s]/g, '').slice(0, 300);
  const start = page * PAGE_SIZE;

  const arxivResponse = await fetch(`${ARXIV_QUERY_URL}?search_query=all:${encodeURIComponent(cleanQuery)}&start=${start}&max_results=${PAGE_SIZE * 2}`); // Fetch double for re-ranking
  const arxivText = await arxivResponse.text();

  // Parse IDs and summaries/abstracts from XML
  const parser = new DOMParser();
  const xmlDoc = parser.parseFromString(arxivText, "text/xml");
  const entries = Array.from(xmlDoc.getElementsByTagName("entry"));

  const candidates = entries.map(entry => {
    const idUrl = entry.getElementsByTagName("id")[0]?.textContent || "";
    const id = idUrl.split('/').pop() || ""; // extract ID from URL
    const summary = entry.getElementsByTagName("summary")[0]?.textContent || "";
    const title = entry.getElementsByTagName("title")[0]?.textContent || "";
    return { id, text: title + "\n" + summary, summary };
  });

  if (candidates.length === 0) return [];

  // 2. Re-rank with Embeddings (if enabled)
  let rankedCandidates = candidates;

  if (options.embeddingModel) {
    try {
      const openai = new OpenAI({
        apiKey: options.apiKey,
        baseURL: options.apiBaseUrl,
        dangerouslyAllowBrowser: true
      });

      // Embed query
      const queryEmbeddingRes = await openai.embeddings.create({
        model: options.embeddingModel,
        input: query,
      });
      const queryVec = queryEmbeddingRes.data[0].embedding;

      // Embed candidates (batch? default limit is usually good for 20)
      const inputs = candidates.map(c => c.text);
      const candidatesEmbeddingRes = await openai.embeddings.create({
        model: options.embeddingModel,
        input: inputs,
      });

      const scored = candidates.map((c, i) => {
        const vec = candidatesEmbeddingRes.data[i].embedding;
        const score = cosineSimilarity(queryVec, vec);
        return { ...c, score };
      });

      // Sort descending
      scored.sort((a, b) => b.score - a.score);
      rankedCandidates = scored;
    } catch (e) {
      console.error("Embedding generation failed, falling back to keyword order", e);
      // Fallback to original order, score 0?
      rankedCandidates = candidates.map(c => ({ ...c, score: 0 }));
    }
  } else {
    rankedCandidates = candidates.map(c => ({ ...c, score: 0 }));
  }

  // Slice to page size and format
  const final = rankedCandidates.slice(0, PAGE_SIZE);

  return final.map(c => ({
    id: c.id,
    data: [{
      text: c.summary.slice(0, 200) + "...", // Show snippet of abstract
      score: (c as any).score || 0
    }]
  }));
}

export async function fetchMetadata(ids: string[]) {
  const response = await (
    await fetch(
      ARXIV_QUERY_URL + `?id_list=${ids.join(',')}&max_results=${ids.length}`,
      { method: 'GET' }
    )
  ).text();
  const parser = new Parser({
    customFields: {
      item: [
        'id',
        'title',
        'pubDate',
        ['author', 'authors', { keepArray: true }],
      ],
    },
  });

  const xml = await parser.parseString(response);
  const metadata: {
    link: string;
    title: string;
    published: string;
    authors: string[];
  }[] = [];
  for (const entry of xml.items) {
    metadata.push({
      link: entry['id'] ?? '',
      title: entry['title'] ?? '',
      published: (entry['pubDate'] ?? '').split('T')[0],
      authors: (entry['authors'] as { name: string }[]).map((e) => e.name),
    });
  }

  return metadata;
}
