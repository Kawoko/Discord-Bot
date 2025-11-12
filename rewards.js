// rewards.js
require('dotenv').config();
const fs = require('node:fs');
const path = require('node:path');

const STORE_PATH = path.join(__dirname, 'rewards.store.json');

// Per-message PROBABILITIES (not weights). Small numbers; do not need to sum to 1.
const DEFAULT_STORE = {
  baseProbabilities: {
    '2x': 1/50,     // 0.02
    '3x': 1/100,    // 0.01
    '4x': 1/200,    // 0.005
    '5x': 1/400,    // 0.0025
    'SPECIAL': 1/800, // 0.00125 → then split among 10x / GAMEPASS / P2W
  },
  // split inside SPECIAL (relative weights)
  specialSplit: { '10x': 1, 'GAMEPASS': 1, 'P2W': 1 },
  // bonus tiers (relative weights) for GAMEPASS / P2W
  bonusTierWeights: { I: 60, II: 30, III: 10 },
};

function loadStore() {
  let store;
  try {
    store = JSON.parse(fs.readFileSync(STORE_PATH, 'utf8'));
  } catch {
    store = JSON.parse(JSON.stringify(DEFAULT_STORE));
    fs.writeFileSync(STORE_PATH, JSON.stringify(store, null, 2));
    return store;
  }

  // --- MIGRATION: baseWeights -> baseProbabilities ---
  if (!store.baseProbabilities && store.baseWeights) {
    store.baseProbabilities = store.baseWeights;
    delete store.baseWeights;
  }

  // --- Merge defaults (ensure keys exist) ---
  store.baseProbabilities = { ...DEFAULT_STORE.baseProbabilities, ...(store.baseProbabilities || {}) };
  store.specialSplit      = { ...DEFAULT_STORE.specialSplit,      ...(store.specialSplit || {}) };
  store.bonusTierWeights  = { ...DEFAULT_STORE.bonusTierWeights,  ...(store.bonusTierWeights || {}) };

  return store;
}

function saveStore(store) {
  fs.writeFileSync(STORE_PATH, JSON.stringify(store, null, 2));
}

// pick from a weight map (used within SPECIAL and bonus tiers)
function pickWeighted(weightsMap) {
  const entries = Object.entries(weightsMap);
  const total = entries.reduce((s, [, w]) => s + Number(w), 0);
  let r = Math.random() * total;
  for (const [id, w] of entries) {
    r -= Number(w);
    if (r <= 0) return id;
  }
  return entries[entries.length - 1][0];
}

/**
 * One roll per message:
 * - Returns { type: '2x'|'3x'|'4x'|'5x'|'10x'|'GAMEPASS'|'P2W', tier? } or null (no hit)
 */
function rollOnce(/* message */) {
  const store = loadStore();
  const p = store.baseProbabilities;

  // cumulative thresholds preserving *individual* probabilities
  const tiers = ['2x', '3x', '4x', '5x', 'SPECIAL'];
  let cum = 0;
  const thresholds = tiers.map(t => {
    const hi = cum + (Number(p[t]) || 0);
    const row = { tier: t, lo: cum, hi };
    cum = hi;
    return row;
  });

  const u = Math.random();
  if (u >= cum) return null; // no reward most of the time

  const hit = thresholds.find(r => u >= r.lo && u < r.hi).tier;

  if (hit !== 'SPECIAL') return { type: hit, meta: { source: 'base' } };

  // SPECIAL path
  const kind = pickWeighted(store.specialSplit);
  if (kind === '10x') return { type: '10x', meta: { source: 'special' } };

  const tier = pickWeighted(store.bonusTierWeights);
  return { type: kind, tier, meta: { source: 'special' } }; // GAMEPASS or P2W
}

module.exports = { loadStore, saveStore, rollOnce };
