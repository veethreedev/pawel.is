// Ports of CalculatorTest.kt and HistoryTest.kt, plus BigDecimal edge cases.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  evaluate, display, parseDecimal, randomAverage, divide, isWhole,
  recentHistory, confirmedEntry, HISTORY_RETENTION_MS,
} from '../calculator.js';

const show = (expression) => { const v = evaluate(expression); return v && display(v); };

// Small deterministic generator standing in for kotlin.random.Random(seed).
const seeded = (seed) => () => {
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

test('arithmetic and precedence', () => {
  assert.equal(show('2+3×4'), '14');
  assert.equal(show('-8+10÷2'), '-3');
  assert.equal(show('0.1+0.2'), '0.3');
  assert.equal(show('10÷4'), '2.5');
  assert.equal(show('8-3'), '5');
  for (const bad of ['', '1÷0', '2+', '.', '1.2.3']) assert.equal(evaluate(bad), null, bad);
});

test('BigDecimal-compatible edge cases', () => {
  assert.equal(show('1÷3'), '0.333333333333');
  assert.equal(show('2÷3'), '0.666666666667');
  assert.equal(show('-2÷3'), '-0.666666666667');
  assert.equal(show('5.'), '5');
  assert.equal(show('007'), '7');
  assert.equal(show('5--3'), '8');
  assert.equal(show('5×-3'), '-15');
  assert.equal(show('0.5-0.5'), '0');
  assert.equal(show('1.50×2'), '3');
  assert.equal(show('100×100'), '10000');
  assert.equal(show('0.000001×0.000001'), '0.000000000001');
  assert.equal(show('999999999999999999999+1'), '1000000000000000000000');
  assert.equal(evaluate('-'), null);
  assert.equal(evaluate('5+×3'), null);
});

test('fractional totals cannot be split into whole numbers', () => {
  assert.throws(() => randomAverage(parseDecimal('10.5'), 3));
  assert.ok(isWhole(parseDecimal('10.000')));
});

test('random shares always preserve sum and bounds', () => {
  for (const input of ['100', '0', '-80', '1', '101', '-1', '999999999999999999999']) {
    const total = input.startsWith('-') ? evaluate(input) : parseDecimal(input);
    for (const count of [1, 2, 3, 7, 1000]) {
      for (const range of [1, 2, 20, 50, 100]) {
        for (let seed = 0; seed < 20; seed++) {
          const values = randomAverage(total, count, seeded(seed), range);
          assert.equal(values.length, count);
          assert.equal(values.reduce((a, b) => a + b, 0n), total.u);
          const mean = divide(total, parseDecimal(String(count)), 20);
          for (const v of values) {
            // |v - mean| <= range, compared at scale 20.
            const diff = v * 10n ** 20n - mean.u;
            assert.ok((diff < 0n ? -diff : diff) <= BigInt(range) * 10n ** 20n, `${input}/${count}/${range}: ${v}`);
          }
        }
      }
    }
  }
});

test('retention uses selected period', () => {
  const day = 24 * 60 * 60 * 1000;
  const now = 400 * day;
  const today = { equation: '1', result: '1', timestamp: now };
  const monthOld = { ...today, timestamp: now - 30 * day };
  const yearOld = { ...today, timestamp: now - 365 * day };
  const entries = [yearOld, monthOld, today];
  assert.deepEqual(recentHistory(entries, now, day), [today]);
  assert.deepEqual(recentHistory(entries, now, 30 * day), [today, monthOld]);
  assert.deepEqual(recentHistory(entries, now, 365 * day), [today, monthOld, yearOld]);
  assert.deepEqual(recentHistory(entries, now + 1, 30 * day), [today]);
});

test('confirmation preserves equation and timestamp', () => {
  assert.deepEqual(confirmedEntry('2+3×4', 1234), { equation: '2+3×4', result: '14', timestamp: 1234 });
  assert.equal(confirmedEntry('1÷0', 1234), null);
  assert.equal(confirmedEntry('2+', 1234), null);
  assert.equal(confirmedEntry('', 1234), null);
});

test('retention keeps exactly one week and sorts newest first', () => {
  const now = HISTORY_RETENTION_MS * 2;
  const boundary = { equation: '1', result: '1', timestamp: now - HISTORY_RETENTION_MS };
  const expired = { ...boundary, timestamp: boundary.timestamp - 1 };
  const newest = { ...boundary, timestamp: now };
  assert.deepEqual(recentHistory([expired, boundary, newest], now), [newest, boundary]);
  assert.deepEqual(recentHistory([boundary, newest], now + 1), [newest]);
});
