#!/usr/bin/env node
/**
 * Command-line front end for the allocation engine.
 *
 *   npm run plan -- --amount 100000 --risk conservative --horizon 10 --age 40
 *   npm run plan -- --amount 250000 --no-emergency-fund --expenses 5000 --near-term 20000 --income --gold
 *   npm run plan -- --amount 50000 --signals recession-risk,volatility-spike --json
 */
import { allocate, DEMO_SIGNALS, formatPlanText, RISK_PROFILES } from './engine';
import type { AccountType, AllocationInput, MarketSignal, RiskTolerance } from './engine';

type Flags = Record<string, string | boolean>;

function parseArgs(argv: string[]): Flags {
  const flags: Flags = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith('--')) continue;
    const key = a.slice(2);
    if (key.startsWith('no-')) {
      flags[key.slice(3)] = false;
      continue;
    }
    const next = argv[i + 1];
    if (next !== undefined && !next.startsWith('--')) {
      flags[key] = next;
      i++;
    } else {
      flags[key] = true;
    }
  }
  return flags;
}

function num(flags: Flags, key: string): number | undefined {
  const v = flags[key];
  if (v === undefined || typeof v === 'boolean') return undefined;
  const n = Number(v.replace(/[$,_]/g, ''));
  if (Number.isNaN(n)) throw new Error(`--${key} expects a number, got "${v}"`);
  return n;
}

function bool(flags: Flags, key: string): boolean | undefined {
  const v = flags[key];
  if (v === undefined) return undefined;
  if (typeof v === 'boolean') return v;
  return !['false', '0', 'no', 'off'].includes(v.toLowerCase());
}

const USAGE = `Usage: npm run plan -- --amount <dollars> [options]

Options
  --amount <n>            Total to allocate (required)
  --risk <profile>        ${Object.keys(RISK_PROFILES).join(' | ')}  (default: conservative)
  --horizon <years>       Years until the money is needed (default: 10)
  --age <years>           Caps equity at (100 - age)%
  --expenses <n>          Monthly expenses, used to size the emergency fund
  --no-emergency-fund     You do not already hold an emergency fund
  --near-term <n>         Dollars needed within ~2 years (parked in T-bills)
  --income                Tilt toward income
  --no-inflation          Leave out TIPS
  --no-intl               U.S.-only equity
  --reit                  Add a REIT slice
  --gold                  Add a gold slice (max 5%)
  --esg                   Show ESG-screened example funds
  --account <type>        taxable | tax_deferred | tax_free  (default: taxable)
  --signals <ids>         Comma-separated demo signals: ${Object.keys(DEMO_SIGNALS).join(', ')}
  --as-of <date>          ISO date used for signal expiry (default: today)
  --json                  Print the full plan as JSON
  --help                  Show this help
`;

function main(): void {
  const flags = parseArgs(process.argv.slice(2));
  if (flags.help || flags.amount === undefined) {
    process.stdout.write(USAGE);
    process.exit(flags.help ? 0 : 1);
  }

  const signalIds = typeof flags.signals === 'string' ? flags.signals.split(',').map((s) => s.trim()).filter(Boolean) : [];
  const signals: MarketSignal[] = signalIds.map((id) => {
    const s = DEMO_SIGNALS[id];
    if (!s) throw new Error(`unknown signal "${id}". Known: ${Object.keys(DEMO_SIGNALS).join(', ')}`);
    return s;
  });

  const input: AllocationInput = {
    amount: num(flags, 'amount')!,
    riskTolerance: flags.risk as RiskTolerance | undefined,
    horizonYears: num(flags, 'horizon'),
    age: num(flags, 'age'),
    monthlyExpenses: num(flags, 'expenses'),
    hasEmergencyFund: bool(flags, 'emergency-fund'),
    nearTermNeed: num(flags, 'near-term'),
    needsIncome: bool(flags, 'income'),
    inflationProtection: bool(flags, 'inflation'),
    includeInternational: bool(flags, 'intl'),
    includeRealEstate: bool(flags, 'reit'),
    includeGold: bool(flags, 'gold'),
    esg: bool(flags, 'esg'),
    accountType: flags.account as AccountType | undefined,
    signals,
    asOf: typeof flags['as-of'] === 'string' ? flags['as-of'] : undefined,
  };

  const plan = allocate(input);
  process.stdout.write(flags.json ? JSON.stringify(plan, null, 2) : formatPlanText(plan));
  process.stdout.write('\n');
}

try {
  main();
} catch (err) {
  process.stderr.write(`error: ${(err as Error).message}\n`);
  process.exit(1);
}
