# FinAdvAIsor

A rules-based portfolio allocation engine that works the way a conservative
financial planner does: **reserves first, caps before tilts, and no position the
plan cannot explain.** Enter an amount, toggle a few settings, and get a
dollar-by-dollar allocation with the reasoning behind it.

> Educational tool. It produces model allocations from rules of thumb and stated
> assumptions. It is not personalised investment advice, and the example funds are
> illustrations of each category, not recommendations.

## Quick start

```bash
npm install
npm run dev        # web UI at http://localhost:5173
npm run server     # assistant API on :8791 (needs ANTHROPIC_API_KEY, see below)
npm run dev:full   # both of the above together
npm test           # engine test suite
npm run plan -- --amount 100000 --risk conservative --horizon 10 --age 40
```

More CLI examples:

```bash
# No emergency fund yet, some money needed soon, wants income and a gold hedge
npm run plan -- --amount 250000 --no-emergency-fund --expenses 5000 --near-term 20000 --income --gold

# Apply demo market signals and dump the full plan as JSON
npm run plan -- --amount 50000 --risk moderate --signals recession-risk,volatility-spike --json

npm run plan -- --help
```

## The flow

The web UI gathers input the way an intake meeting would, one step at a time:

1. **Basics**: amount, years until the money is needed, and optionally age.
2. **Safety net**: whether an emergency fund exists (and monthly expenses if not),
   and whether any of the money is needed within two years.
3. **Risk profile**: a five-question questionnaire, one question per screen.
   Choosing an answer moves on automatically; numbered dots, a "Previous answer"
   recap with a Change link, and the Back button all let you revisit any question.
   The answers are scored into a profile
   ([`src/engine/questionnaire.ts`](src/engine/questionnaire.ts)) and revealed with
   a short animation: the score counts up along a band meter, the profile appears,
   and any behavioural cap is explained (saying you would sell everything in a 20%
   fall, or that this is most of your savings, both cap the profile at conservative).
4. **Preferences**: income focus, TIPS, international, REITs, gold, ESG examples,
   account type.
5. **Building your plan**: a narrated sequence shows each engine step with the real
   numbers as it happens (reserves set aside, profile read, guardrails applied,
   signals checked, sleeves filled, dollars reconciled). Skippable.
6. **Your plan**, in six tabs.
   - *Allocation*: headline figures, an interactive donut (hover to read a slice,
     click to pin it and highlight it in the table, switch between asset-class and
     bucket views), and the line-by-line table with source links and copy buttons.
   - *Why this mix*: how the plan was built, the notes and caps that applied,
     rebalancing policy and the rough outlook, each with its sources.
   - *Market signals*: the demo of the news layer. Toggling a signal updates the
     plan and shows exactly what it changed.
   - *Research*: validated market data (Treasury yields, TIPS real yield, fed funds,
     inflation, unemployment, S&P 500, VIX, high-yield spread) served by
     `/api/research` ([`src/research/`](src/research/)). Each figure is parsed,
     range-tested, checked for age and implausible jumps, and compared with a second
     publisher for the same date (Treasury, NY Fed, BLS, Cboe) wherever a free feed
     exists. Cards are labelled Verified, Single source, Stale or Withheld; a figure
     that fails is withheld, never estimated. Informational only: it does not change
     the plan. Needs `npm run server` running; results are cached for 30 minutes.
   - *Sources*: every rule the allocator applies, how it is used here, and links to
     the reading behind it ([`src/engine/sources.ts`](src/engine/sources.ts)). Only
     official or long-standing publishers are linked (SEC, FINRA, CFPB, FDIC,
     TreasuryDirect, IRS, Vanguard, J.P. Morgan, NYU Stern) and each URL was
     checked to resolve when added.
   - *Your answers*: everything entered, with an Edit button per section and an
     optional profile override for comparison.

Completed steps in the progress bar are clickable, so any answer can be revisited
without starting over. Progress is saved in the browser.

## Graphics

- **Header art** and per-step icons in the progress bar.
- **Basics**: a glide-path chart of the stock ceiling by horizon that follows the slider.
- **Safety net**: a jar that fills as the emergency reserve is sized.
- **Risk profile**: an animated score count-up along the band meter, with confetti.
- **Outlook tab**: a fan chart of the range of outcomes over the horizon (median with
  the 10th to 90th percentile band from a lognormal model of the plan's own return
  and volatility assumptions) and a risk-versus-return map of the four profiles with
  this plan highlighted. Both are labelled as assumption-driven, not forecasts.
- **Allocation tab**: the interactive donut with hover, pin, and asset-class / bucket views.

All charts are plain SVG, theme-aware, and respect reduced-motion settings.

## The assistant

A floating "Ask about your plan" panel answers questions grounded in the user's own
plan, the allocator's rules, and the verified sources. It runs on **Claude Sonnet 5**
(`claude-sonnet-5`, the cheap and fast tier) at low effort, with the static part of
the system prompt (rules, sources, asset catalogue, questionnaire) marked for prompt
caching so repeat questions cost a fraction of the first.

Setup:

```bash
cp .env.example .env      # then set ANTHROPIC_API_KEY
npm run dev:full          # Vite on :5173 proxies /api to the assistant server on :8791
```

- The API key lives only on the server ([`server/index.ts`](server/index.ts)); the
  browser never sees it. The server also rate-limits per IP and caps request size.
- `ASSISTANT_MOCK=1` streams canned replies without a key, for UI work.
- `ASSISTANT_WEB_SEARCH=1` lets the model use Anthropic's web search tool for extra
  references (up to three searches per answer; costs more).
- `ASSISTANT_MODEL` overrides the model id.
- Production: `npm run build && npm start` serves `dist/` and the API from one process.

The prompt ([`src/assistant/prompt.ts`](src/assistant/prompt.ts)) tells the model it
is not a licensed adviser, to avoid trade or timing recommendations, to treat the
outlook figures as assumption-driven, and to cite the tool's sources. The browser
sends the current plan and answers with every request so the model can quote exact
numbers.

## How the engine thinks

`src/engine/allocate.ts` runs these steps in order:

1. **Reserves come first.** If there is no emergency fund and monthly expenses are
   known, six months of expenses are set aside in cash. Money needed within about
   two years is parked in Treasury bills. Neither is ever invested.
2. **Top-level split.** The risk profile sets a starting equity share
   (very conservative 20%, conservative 35%, moderate 50%, growth 65%). It is then
   **capped** by the horizon (10% under two years, up to 70% past twelve), by a
   100-minus-age rule, and by a tool-wide 70% ceiling. Caps only ever lower equity;
   the single bonus (+5 points for 20+ year horizons) is itself subject to every cap.
3. **Signals.** Market or news signals nudge one dimension each by a bounded amount
   (at most 5 points of equity, 3 of cash, 10 inside the bond sleeve). Risk-off
   signals are honoured in full; **risk-on signals count at half strength**, and
   nothing can push equity through its cap.
4. **Alternatives.** Optional REITs take a tenth of the equity sleeve; optional gold
   is capped at 5% and funded pro rata from stocks and bonds.
5. **Sub-mixes.** Equity: U.S. large/total market, a small small-cap slice,
   developed international and a small emerging-markets slice (omitted for the
   most conservative profile). Bonds: short Treasuries, core aggregate and TIPS,
   tilted shorter when the horizon is under four years; income seekers get
   investment-grade corporates and dividend equity.
6. **Housekeeping.** Positions under 2% are folded back into the sleeve that funded
   them, weights are rounded to whole percents, and dollars reconcile to the cent.

Every rule and threshold lives in [`src/engine/profiles.ts`](src/engine/profiles.ts)
so the "conservatism" of the tool can be reviewed and tuned in one file.

The plan also reports a rough expected return, volatility and "bad year" figure
from simple long-run capital-market assumptions
([`src/engine/catalog.ts`](src/engine/catalog.ts)) and a group-level
correlation model ([`src/engine/risk.ts`](src/engine/risk.ts)). These describe
the shape of the risk being taken; they are not forecasts.

## Inputs

| Setting | Effect |
|---|---|
| Amount | Total to allocate |
| Risk tolerance | Starting equity share (there is deliberately no "aggressive"); derived from the questionnaire in the UI, passed directly on the CLI |
| Horizon | Caps equity; shortens the bond sleeve under four years |
| Age | Caps equity at 100 − age |
| Emergency fund / monthly expenses | Reserves six months of expenses first |
| Near-term need | Parked in T-bills |
| Income focus | −5 points equity; dividend stocks and IG corporates |
| Inflation protection | TIPS in the bond sleeve (on by default) |
| International | Developed + emerging markets in the equity sleeve |
| Real estate / gold | Small alternative sleeves |
| ESG | Swaps example funds for screened equivalents |
| Account type | Tax-location notes |
| Signals | Bounded tilts; see below |

## The news hook

The engine already consumes `MarketSignal` objects
([`src/engine/types.ts`](src/engine/types.ts)):

```ts
{
  id: 'recession-risk', source: 'news:reuters', asOf: '2026-09-01',
  dimension: 'equity',   // equity | duration | inflation | international | cash
  direction: -1,         // -1 reduce, +1 increase
  strength: 0.6,         // 0..1
  confidence: 0.6,       // 0..1
  rationale: 'Leading indicators point to slowing growth.',
  expiresAt: '2026-12-01',
}
```

Signals are netted per dimension (`direction × strength × confidence`, clamped to
±1) and converted into bounded shifts. Expired or malformed signals are ignored
with a reason that appears in the plan. A `SignalProvider` interface in
[`src/engine/signals.ts`](src/engine/signals.ts) is the seam for the future
news-ingestion layer: implement `fetch(): Promise<MarketSignal[]>`, feed the result
into `allocate({ ..., signals })`, and the UI already shows what each signal did.

Suggested next steps for that layer:

1. A fetcher that pulls headlines from a news API on a schedule.
2. A classifier (an LLM prompt works well) that maps headlines to signals with
   calibrated `strength` and `confidence`, and always sets `expiresAt`.
3. A small store so signals decay and the plan can show *why* it changed since
   last time.

## Project layout

```
src/engine/      pure allocation engine (no DOM, no I/O)
  types.ts       input/output/signal types
  profiles.ts    every rule of thumb and threshold
  catalog.ts     asset classes, example funds, return assumptions
  signals.ts     signal netting, provider interface, demo signals
  questionnaire.ts scored risk questionnaire with behavioural caps
  sources.ts     verified source links for every rule and asset class
  risk.ts        rough return/volatility summary
  allocate.ts    the allocator
  format.ts      plain-text rendering
  __tests__/     vitest suite
src/cli.ts       command-line front end
src/assistant/   system prompt builder shared by the server and tests
server/index.ts  assistant API (streams Claude replies) + static server for dist/
src/ui/          Vite + React front end
  charts/        glide path, fan chart, risk-return map
  art/           header art, step icons, reserve jar, confetti
```

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Web UI with hot reload |
| `npm run build` | Typecheck and production build to `dist/` |
| `npm test` | Run the engine tests |
| `npm run plan -- …` | CLI plan |
| `npm run server` | Assistant API on :8791 |
| `npm run dev:full` | Vite + assistant API together |
| `npm start` | Serve `dist/` and the API from one process |
