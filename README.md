# @steam0/sdk

Programmatic Steam balance top-up via cryptocurrency. Official Node.js / TypeScript client for [steam0.shop](https://steam0.shop) — 0% markup, USDT / BTC / TON / ETH / LTC.

```bash
npm install @steam0/sdk
```

## Why

You're a bot, an LLM agent, or a side-project that needs to top up a Steam account programmatically. Three lines:

```ts
import { Steam0Client } from '@steam0/sdk';

const s0 = new Steam0Client({ apiKey: process.env.STEAM0_API_KEY! });
const order = await s0.createOrder({ steamLogin: 'iliyafominator', amountUsd: 25 });
console.log('Pay here:', order.payUrl);
```

User pays the crypto (Heleket payment page), Steam balance is topped up automatically within minutes.

## Getting an API key

DM [@steam0shop](https://t.me/steam0shop) on Telegram with what you're building and you'll get a key.

## Library usage

### Create an order, redirect user to pay

```ts
const order = await s0.createOrder({
  steamLogin: 'gamer123',
  amountUsd: 50,
  source: 'my-tg-bot', // optional — appears in operator dashboard
});

// order.payUrl points to Heleket where the user picks BTC/USDT/etc and pays
console.log(order.id, order.payUrl, order.status);
```

### Wait for fulfillment

```ts
const final = await s0.waitForOrder(order.id, {
  intervalMs: 3000,
  onUpdate: (o) => console.log(o.status, o.batches?.completed, '/', o.batches?.total),
});
console.log(final.status); // 'completed' | 'failed' | 'cancelled' | 'expired' | 'refund'
```

### Just check status

```ts
const o = await s0.getOrder(orderId);
```

### Public crypto rates (no api key needed)

```ts
const { prices } = await s0.getRates();
// { BTC: 67200, ETH: 3450, USDT: 1, TON: 5.4, LTC: 80, SOL: 175 }
```

## CLI

The package ships a `steam0` binary. No JS needed in your stack — shell out from any language.

```bash
# install globally or use via npx
npm install -g @steam0/sdk

export STEAM0_API_KEY=sk-...

steam0 create --login iliyafominator --amount 25
# → JSON with id and payUrl

steam0 watch <order-id>
# → live status updates until terminal state

steam0 status <order-id>
steam0 rates  # public, no key
```

### Without install

```bash
STEAM0_API_KEY=sk-... npx @steam0/sdk create -l iliyafominator -a 25
```

## API reference

### `new Steam0Client(opts)`

| option       | type     | required | default                    |
| ------------ | -------- | -------- | -------------------------- |
| `apiKey`     | string   | yes      | —                          |
| `baseUrl`    | string   | no       | `https://steam0.shop`      |
| `timeoutMs`  | number   | no       | `30000`                    |
| `source`     | string   | no       | tag attached to all orders |
| `fetch`      | function | no       | `globalThis.fetch`         |

### `createOrder({ steamLogin, amountUsd, source? }) → Order`

Validates: `steamLogin` is `[a-zA-Z0-9_]{1,64}`, `amountUsd` is `1 ≤ x ≤ 500_000`. Server enforces too — you'll get `Steam0ApiError` on rejection.

### `getOrder(id) → Order`

Returns the latest known state. `Order.batches` is present for orders that exceeded the per-batch cap (~$1000) — gives you live `completed/total` progress.

### `waitForOrder(id, opts) → Order`

Polls until the order reaches a terminal status (`completed`/`cancelled`/`failed`/`expired`/`refund`). Callback `onUpdate` fires on every poll — wire it to a progress bar.

### `getRates() → { prices: Record<string, number> }`

Latest USD prices for supported cryptos. No auth required.

### `ping() → boolean`

Health check. No auth.

## Errors

All API failures throw `Steam0ApiError`:

```ts
import { Steam0ApiError } from '@steam0/sdk';

try {
  await s0.createOrder({ steamLogin: 'bad login!', amountUsd: 0.5 });
} catch (e) {
  if (e instanceof Steam0ApiError) {
    console.log(e.status, e.message); // 400, "amount must be between $1 and $500,000"
  }
}
```

Network timeouts surface as `AbortError` (configurable via `timeoutMs`).

## Order lifecycle

```
pending      ← user opened pay page, hasn't paid yet (Heleket invoice TTL = 1h)
  │
  ▼
paid         ← Heleket confirmed crypto received
  │
  ▼
fulfilling   ← we're sending top-up requests to Giftery
  │           (large orders are split into batches; watch order.batches)
  │
  ├─→ completed  ← Steam balance updated, done
  ├─→ failed     ← provider refused (e.g. unsupported region)
  ├─→ unknown    ← provider call timed out, may have succeeded
  ├─→ refund     ← needs manual refund (op handles via Heleket support)
  ├─→ cancelled  ← user cancelled before payment cleared
  └─→ expired    ← pending > 2h, never paid
```

## Self-hosting / staging

Override `baseUrl`:

```ts
const s0 = new Steam0Client({
  apiKey: '...',
  baseUrl: 'https://staging.steam0.shop',
});
```

## License

MIT
