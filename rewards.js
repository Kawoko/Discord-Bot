// rewards.js
require('dotenv').config();
const fs = require('node:fs');
const path = require('node:path');

const STORE_PATH = path.join(__dirname, 'rewards.store.json');

// Luck roles
const LUCK_30_ROLE = '1438542856238141502'; // +30% luck
const LUCK_20_ROLE = '1144540049220845668'; // +20% luck

// Per-message PROBABILITIES (not weights). Small numbers; do not need to sum to 1.
const DEFAULT_STORE = {
  baseProbabilities: {
    '2x': 1 / 50,     // 0.02
    '3x': 1 / 100,    // 0.01
    '4x': 1 / 200,    // 0.005
    '5x': 1 / 400,    // 0.0025
    'SPECIAL': 1 / 800, // 0.00125 → then split among 10x / GAMEPASS / P2W
  },
  // split inside SPECIAL (relative weights)
  specialSplit: { '10x': 1, 'GAMEPASS': 1, 'P2W': 1 },
  // bonus tiers (relative weights) for GAMEPASS / P2W
  bonusTierWeights: { I: 60, II: 30, III: 10 },
};

// ---- luck helper ----
function applyLuckBuff(rawChance, member) {
  let chance = Number(rawChance) || 0;

  if (!member) return chance;

  // 30% luck takes priority over 20% if user somehow has both
  if (member.roles?.cache?.has(LUCK_30_ROLE)) {
    chance *= 1.30;
  } else if (member.roles?.cache?.has(LUCK_20_ROLE)) {
    chance *= 1.20;
  }

  // hard cap so we never exceed 100%
  return Math.min(chance, 1);
}

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
  if (total <= 0) return entries[0]?.[0];

  let r = Math.random() * total;
  for (const [id, w] of entries) {
    r -= Number(w);
    if (r <= 0) return id;
  }
  return entries[entries.length - 1][0];
}

/**
 * One roll per message:
 * - Returns { type: '2x'|'3x'|'4x'|'5x'|'10x'|'GAMEPASS'|'P2W', tier?, meta } or null (no hit)
 * - Takes message so we can apply per-member luck buffs.
 */
function rollOnce(message) {
  const store = loadStore();
  const base = store.baseProbabilities;
  const member = message?.member || null;

  // Apply luck to each base probability for THIS user
  const p2x      = applyLuckBuff(base['2x'],      member);
  const p3x      = applyLuckBuff(base['3x'],      member);
  const p4x      = applyLuckBuff(base['4x'],      member);
  const p5x      = applyLuckBuff(base['5x'],      member);
  const pSpecial = applyLuckBuff(base['SPECIAL'], member);

  // cumulative thresholds preserving *individual* probabilities for this user
  const tiers = [
    { key: '2x',      p: p2x },
    { key: '3x',      p: p3x },
    { key: '4x',      p: p4x },
    { key: '5x',      p: p5x },
    { key: 'SPECIAL', p: pSpecial },
  ];

  let cum = 0;
  const thresholds = tiers.map(({ key, p }) => {
    const hi = cum + (p || 0);
    const row = { tier: key, lo: cum, hi };
    cum = hi;
    return row;
  });

  const u = Math.random();
  if (u >= cum) return null; // no reward most of the time

  const hitRow = thresholds.find(r => u >= r.lo && u < r.hi);
  if (!hitRow) return null;
  const hit = hitRow.tier;

  if (hit !== 'SPECIAL') {
    return { type: hit, meta: { source: 'base', boosted: member ? true : false } };
  }

  // SPECIAL path: 10x vs GAMEPASS vs P2W
  const kind = pickWeighted(store.specialSplit);
  if (kind === '10x') {
    return { type: '10x', meta: { source: 'special', boosted: member ? true : false } };
  }

  const tier = pickWeighted(store.bonusTierWeights);
  return { type: kind, tier, meta: { source: 'special', boosted: member ? true : false } }; // GAMEPASS or P2W
}

module.exports = { loadStore, saveStore, rollOnce };
