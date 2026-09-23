// Port of Calculator.kt and the pure parts of History.kt.
// Decimals are { u: BigInt unscaled value, s: scale } so results match java.math.BigDecimal exactly.

const TEN = 10n;
const pow10 = (n) => TEN ** BigInt(n);

export const decimal = (u, s = 0) => ({ u: BigInt(u), s });

export function parseDecimal(text) {
  if (!/^(\d+\.?\d*|\.\d+)$/.test(text)) throw new Error(`Invalid number: ${text}`);
  const dot = text.indexOf('.');
  if (dot < 0) return decimal(BigInt(text), 0);
  const digits = text.slice(0, dot) + text.slice(dot + 1);
  return decimal(BigInt(digits || '0'), text.length - dot - 1);
}

const align = (a, b) => {
  const s = Math.max(a.s, b.s);
  return [a.u * pow10(s - a.s), b.u * pow10(s - b.s), s];
};

export const add = (a, b) => { const [x, y, s] = align(a, b); return decimal(x + y, s); };
export const subtract = (a, b) => { const [x, y, s] = align(a, b); return decimal(x - y, s); };
export const multiply = (a, b) => decimal(a.u * b.u, a.s + b.s);
export const negate = (a) => decimal(-a.u, a.s);
export const compare = (a, b) => { const [x, y] = align(a, b); return x < y ? -1 : x > y ? 1 : 0; };

/** BigDecimal.divide(divisor, scale, RoundingMode.HALF_UP). */
export function divide(a, b, scale = 12) {
  if (b.u === 0n) throw new Error('Division by zero');
  let num = a.u * pow10(scale + b.s);
  let den = b.u * pow10(a.s);
  const negative = (num < 0n) !== (den < 0n);
  if (num < 0n) num = -num;
  if (den < 0n) den = -den;
  let q = num / den;
  if ((num % den) * 2n >= den) q += 1n;
  return decimal(negative ? -q : q, scale);
}

export function stripTrailingZeros(a) {
  let { u, s } = a;
  if (u === 0n) return decimal(0n, 0);
  while (s > 0 && u % TEN === 0n) { u /= TEN; s--; }
  return decimal(u, s);
}

export const isWhole = (a) => stripTrailingZeros(a).s === 0;

/** stripTrailingZeros().toPlainString() */
export function display(a) {
  const { u, s } = stripTrailingZeros(a);
  const negative = u < 0n;
  const digits = (negative ? -u : u).toString().padStart(s + 1, '0');
  const whole = digits.slice(0, digits.length - s);
  const fraction = s > 0 ? '.' + digits.slice(digits.length - s) : '';
  return (negative ? '-' : '') + whole + fraction;
}

const isDigit = (c) => c >= '0' && c <= '9';

/** Recursive descent keeps normal multiplication/division precedence. Returns null when invalid. */
export function evaluate(expression) {
  try {
    let position = 0;
    const number = () => {
      let negative = false;
      if (position < expression.length && expression[position] === '-') {
        negative = true;
        position++;
      }
      const start = position;
      while (position < expression.length && (isDigit(expression[position]) || expression[position] === '.')) position++;
      if (position <= start) throw new Error('Expected number');
      const value = parseDecimal(expression.substring(start, position));
      return negative ? negate(value) : value;
    };
    const term = () => {
      let value = number();
      while (position < expression.length && '×÷'.includes(expression[position])) {
        const operator = expression[position++];
        const next = number();
        value = operator === '×' ? multiply(value, next) : divide(value, next, 12);
      }
      return value;
    };
    let value = term();
    while (position < expression.length && '+-'.includes(expression[position])) {
      const operator = expression[position++];
      const next = term();
      value = operator === '+' ? add(value, next) : subtract(value, next);
    }
    if (position !== expression.length) throw new Error('Trailing input');
    return value;
  } catch {
    return null;
  }
}

/** Equivalent of kotlin.random.Random.nextInt(from, until). */
const nextInt = (random, from, until) => from + Math.floor(random() * (until - from));

/**
 * Whole shares and balanced integer offsets preserve the exact total.
 * Returns BigInt shares; `random` returns a float in [0, 1).
 */
export function randomAverage(total, count, random = Math.random, offsetRange = 20) {
  if (!(Number.isInteger(count) && count >= 1 && count <= 1000)) throw new RangeError('count must be in 1..1000');
  if (!(Number.isInteger(offsetRange) && offsetRange >= 1 && offsetRange <= 100)) throw new RangeError('offsetRange must be in 1..100');
  if (!isWhole(total)) throw new RangeError('Enter a whole-number total');
  const whole = stripTrailingZeros(total).u;
  const n = BigInt(count);
  let base = whole / n;
  if (whole % n !== 0n && whole < 0n) base -= 1n; // floor, not truncation
  const extra = Number(whole - base * n);
  const values = Array.from({ length: count }, (_, i) => base + (i < extra ? 1n : 0n));
  for (let index = 0; index < count - 1; index += 2) {
    // Leave one unit of rounding headroom to guarantee the configured bound.
    const offset = BigInt(nextInt(random, 1 - offsetRange, offsetRange));
    values[index] += offset;
    values[index + 1] -= offset;
  }
  for (let i = values.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [values[i], values[j]] = [values[j], values[i]];
  }
  return values;
}

export const DAY_MS = 24 * 60 * 60 * 1000;
export const HISTORY_RETENTION_MS = 7 * DAY_MS;

export const recentHistory = (entries, now, retentionMs = HISTORY_RETENTION_MS) =>
  entries.filter((e) => e.timestamp >= now - retentionMs).sort((a, b) => b.timestamp - a.timestamp);

export function confirmedEntry(equation, now) {
  const value = evaluate(equation);
  return value ? { equation, result: display(value), timestamp: now } : null;
}
