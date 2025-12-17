'use strict';

import Parser from 'rss-parser';

const QUERY_PREFIX =
  'Represent this sentence for searching relevant passages: ';
const ARXIV_QUERY_URL = 'https://export.arxiv.org/api/query';
const PAGE_SIZE = 10;
const MAX_TEXT_LENGTH = 512; // Chunk abstracts for optimal embedding quality
const MAX_CACHE_SIZE = 100;
const LLM_TIMEOUT_MS = 5000; // 5 second timeout for query expansion
const KEYWORD_WEIGHT = 0.3;
const EMBEDDING_WEIGHT = 0.7;
const MIN_QUERY_LENGTH = 3;

import { getOptions } from './helper';

import { Options } from '../types';

// In-memory embedding cache to avoid redundant API calls
const embeddingCache = new Map<string, number[]>();

function getCacheKey(model: string, text: string): string {
  // Use model + first 100 chars as cache key
  return `${model}:${text.slice(0, 100)}`;
}

function trimCache(): void {
  // Simple LRU-ish: remove oldest entries when cache exceeds max size
  if (embeddingCache.size > MAX_CACHE_SIZE) {
    const keysToDelete = Array.from(embeddingCache.keys()).slice(0, embeddingCache.size - MAX_CACHE_SIZE);
    keysToDelete.forEach(key => embeddingCache.delete(key));
  }
}

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

// LLM-based query expansion: extract academic keywords for better arXiv search
// FALLBACK: Returns original text if LLM call fails, times out, or returns invalid response
// LLM-based query expansion: extract academic keywords for better arXiv search
// FALLBACK: Returns original text if LLM call fails, times out, or returns invalid response
async function expandQuery(
  text: string,
  apiKey: string,
  apiBaseUrl: string,
  model: string
): Promise<string> {
  // Always have original text as fallback
  const fallback = text;

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), LLM_TIMEOUT_MS);
    const baseUrl = apiBaseUrl.replace(/\/+$/, '') || 'https://api.openai.com/v1';

    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model,
        max_tokens: 100,
        messages: [{
          role: 'user',
          content: `Extract 5-7 academic search keywords from this text. Return only keywords separated by spaces, no explanation:\n\n${text.slice(0, 500)}`
        }]
      }),
      signal: controller.signal
    });

    clearTimeout(timeoutId);

    if (!response.ok) return fallback;

    const data = await response.json();
    const expandedKeywords = data.choices?.[0]?.message?.content?.trim();

    // Validate the response: must have content and at least 2 words
    if (!expandedKeywords || expandedKeywords.length < 3) {
      return fallback; // FALLBACK: Empty or too short response
    }

    // Check if the response looks like keywords (not an error message or explanation)
    const wordCount = expandedKeywords.split(/\s+/).length;
    if (wordCount < 2 || wordCount > 20) {
      return fallback; // FALLBACK: Unusual word count suggests bad response
    }

    return expandedKeywords;
  } catch (e) {
    // FALLBACK: On any error (timeout, network, API error), use original text
    return fallback;
  }
}

// Get embedding with caching
async function getEmbedding(
  text: string,
  model: string,
  apiKey: string,
  apiBaseUrl: string
): Promise<number[] | null> {
  const cacheKey = getCacheKey(model, text);

  if (embeddingCache.has(cacheKey)) {
    return embeddingCache.get(cacheKey)!;
  }

  try {
    const baseUrl = apiBaseUrl.replace(/\/+$/, '') || 'https://api.openai.com/v1';

    const response = await fetch(`${baseUrl}/embeddings`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model,
        input: text.slice(0, MAX_TEXT_LENGTH), // Chunk for optimal quality
      })
    });

    if (!response.ok) return null;

    const data = await response.json();
    const embedding = data.data?.[0]?.embedding;

    if (embedding) {
      embeddingCache.set(cacheKey, embedding);
      trimCache();
      return embedding;
    }
    return null;
  } catch (e) {
    return null;
  }
}

export async function search(query: string, page: number) {
  const options = await getOptions();
  if (!options.apiKey) {
    return [];
  }

  // Guard against empty or too short queries
  const trimmedQuery = query.trim();
  if (trimmedQuery.length < MIN_QUERY_LENGTH) {
    return [];
  }

  // Initialize OpenAI client (needed for query expansion and embeddings)
  // const openai = new OpenAI({ ... }); // REMOVED

  // 1. LLM Query Expansion (if model available)
  // FALLBACK: If expansion fails or no model, uses original query
  let searchTerms = trimmedQuery;
  const apiBaseUrl = options.apiBaseUrl || 'https://api.openai.com/v1';

  if (options.model) {
    try {
      searchTerms = await expandQuery(trimmedQuery, options.apiKey, apiBaseUrl, options.model);
      // Double-check we got something useful, otherwise use original
      if (!searchTerms || searchTerms.length < MIN_QUERY_LENGTH) {
        searchTerms = trimmedQuery; // FALLBACK: Expansion returned nothing useful
      }
    } catch (e) {
      searchTerms = trimmedQuery; // FALLBACK: Expansion threw unexpected error
    }
  }

  // 2. Search arXiv for candidates (Keyword search)
  // Clean query to avoid breaking arXiv API (simple sanitization)
  const cleanQuery = searchTerms.replace(/[^a-zA-Z0-9\s]/g, '').slice(0, 300);
  const start = page * PAGE_SIZE;

  let arxivText: string;
  try {
    const arxivResponse = await fetch(
      `${ARXIV_QUERY_URL}?search_query=all:${encodeURIComponent(cleanQuery)}&start=${start}&max_results=${PAGE_SIZE * 2}`
    ); // Fetch double for re-ranking

    if (!arxivResponse.ok) {
      return [];
    }

    arxivText = await arxivResponse.text();
  } catch (e) {
    // Network error or other fetch failure
    return [];
  }

  // Parse IDs and summaries/abstracts from XML
  const parser = new DOMParser();
  const xmlDoc = parser.parseFromString(arxivText, "text/xml");
  const entries = Array.from(xmlDoc.getElementsByTagName("entry"));

  const candidates = entries.map((entry, index) => {
    const idUrl = entry.getElementsByTagName("id")[0]?.textContent || "";
    // Extract arXiv ID from URL, handling both new (YYMM.XXXXX) and old (category/YYMMXXX) formats
    // Old format example: http://arxiv.org/abs/hep-th/0207003 -> hep-th/0207003
    // New format example: http://arxiv.org/abs/2407.02421v1 -> 2407.02421v1
    const urlParts = idUrl.replace('http://arxiv.org/abs/', '').replace('https://arxiv.org/abs/', '');
    const id = urlParts || "";
    const summary = entry.getElementsByTagName("summary")[0]?.textContent || "";
    const title = entry.getElementsByTagName("title")[0]?.textContent || "";
    return {
      id,
      text: title + "\n" + summary,
      summary,
      keywordRank: index // Preserve arXiv's keyword-based ordering
    };
  });

  if (candidates.length === 0) return [];

  // 3. Re-rank with Embeddings (if enabled)
  let rankedCandidates: typeof candidates & { score: number }[] = [];

  if (options.embeddingModel) {
    try {
      // Embed query with retrieval prefix for better performance
      const queryVec = await getEmbedding(
        QUERY_PREFIX + trimmedQuery,
        options.embeddingModel,
        options.apiKey,
        apiBaseUrl
      );

      if (queryVec) {
        // Embed candidates (with chunking and caching)
        const candidateVecs = await Promise.all(
          candidates.map(c => getEmbedding(c.text, options.embeddingModel!, options.apiKey!, apiBaseUrl))
        );

        // Calculate hybrid scores
        const scored = candidates.map((c, i) => {
          const vec = candidateVecs[i];
          let embeddingScore = 0;

          if (vec) {
            embeddingScore = cosineSimilarity(queryVec, vec);
          }

          // Hybrid scoring: combine keyword rank with embedding similarity
          // Normalize keyword rank: first result = 1.0, last = 0.0
          const normalizedKeywordScore = 1 - (c.keywordRank / candidates.length);
          const hybridScore = KEYWORD_WEIGHT * normalizedKeywordScore + EMBEDDING_WEIGHT * embeddingScore;

          return { ...c, score: hybridScore };
        });

        // Sort descending by hybrid score
        scored.sort((a, b) => b.score - a.score);
        rankedCandidates = scored;
      } else {
        // Query embedding failed, fall back to keyword order
        rankedCandidates = candidates.map(c => ({ ...c, score: 0 }));
      }
    } catch (e) {
      // Fallback to original order on any embedding error
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
  if (ids.length === 0) return [];

  try {
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
        authors: (entry['authors'] as { name: string }[])?.map((e) => e.name) || [],
      });
    }

    return metadata;
  } catch (e) {
    // Return empty array on fetch or parse error
    return [];
  }
}
