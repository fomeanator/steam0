# steam0-sdk

[![npm](https://img.shields.io/npm/v/steam0-sdk.svg)](https://www.npmjs.com/package/steam0-sdk)
[![downloads](https://img.shields.io/npm/dm/steam0-sdk.svg)](https://www.npmjs.com/package/steam0-sdk)
[![license](https://img.shields.io/npm/l/steam0-sdk.svg)](LICENSE)

**Top up a Steam balance with cryptocurrency from code or CLI. No auth, no API key, no KYC.** Official client for [steam0.shop](https://steam0.shop) — 0% markup. Pay in USDT (TRC-20 / ERC-20), Bitcoin (Lightning / Mainnet), TON, ETH, or LTC.

```bash
npm install steam0-sdk
```

```ts
import { Steam0Client } from 'steam0-sdk';

const order = await new Steam0Client().createOrder({
  steamLogin: 'iliyafominator',
  amountUsd: 25,
});
console.log('User pays here:', order.payUrl);
```

That's it. The user opens `payUrl`, pays whatever crypto they want, Steam balance is topped up automatically within 1–5 minutes.

---

## 🤖 For AI agents (Claude, GPT, Cursor, Cline, etc.)

This package is intentionally designed for autonomous use by LLM agents. **No auth required**, simple JSON contract, JSDoc on every method, deterministic order lifecycle.

**Recipe — top up a Steam account from an agent in 3 steps:**

```ts
// 1. Create the order. Returns immediately.
const order = await new Steam0Client().createOrder({
  steamLogin: 'username_from_user',
  amountUsd: 25,
});

// 2. Send order.payUrl to the user — they pay whatever crypto they have.
console.log(`Tell the user to pay here: ${order.payUrl}`);

// 3. (Optional) wait for fulfillment — useful for chatbots that need to confirm.
const final = await new Steam0Client().waitForOrder(order.id, {
  onUpdate: (o) => console.log(`status: ${o.status}`),
});
console.log(final.status === 'completed' ? 'Done!' : `Issue: ${final.status}`);
```

**Exhaustive `OrderStatus` values:** `pending` | `paid` | `fulfilling` | `completed` | `failed` | `cancelled` | `expired` | `refund` | `unknown` (terminal: completed/failed/cancelled/expired/refund).

**Validation rules** (server enforces, throws `Steam0ApiError`):
- `steamLogin` matches `/^[a-zA-Z0-9_]{1,64}$/`
- `1 ≤ amountUsd ≤ 500_000`

**Need it from a non-Node language?** Use the CLI (`npx steam0-sdk create`) or call the HTTP API directly — see «Without this SDK» below.

---

## Library usage

### Create an order, redirect user to pay

```ts
const order = await s0.createOrder({
  steamLogin: 'gamer123',
  amountUsd: 50,
  source: 'my-tg-bot', // optional — appears in the operator dashboard
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

### Public crypto rates

```ts
const rates = await s0.getRates();
```

---

## CLI

The package ships a `steam0` (and `steam0-sdk`) binary. No JS needed in your stack — shell out from any language.

```bash
# install globally
npm install -g steam0-sdk

steam0 create --login iliyafominator --amount 25
steam0 watch <order-id>
steam0 status <order-id>
steam0 rates
```

### Without install

```bash
npx steam0-sdk create -l iliyafominator -a 25
```

---

## Without this SDK (raw HTTP)

For Python, Go, Rust, shell scripts, etc — just hit the JSON API directly. No auth.

### curl

```bash
# Create order
curl -X POST https://steam0.shop/api/agent/orders \
  -H 'Content-Type: application/json' \
  -d '{"steam_login":"iliyafominator","amount_usd":25}'

# Check status
curl https://steam0.shop/api/agent/orders/<ORDER_ID>
```

### Python

```python
import requests, time

order = requests.post(
    'https://steam0.shop/api/agent/orders',
    json={'steam_login': 'iliyafominator', 'amount_usd': 25},
).json()
print('Pay here:', order['pay_url'])

# poll until terminal
terminal = {'completed', 'cancelled', 'failed', 'expired', 'refund'}
while True:
    o = requests.get(f"https://steam0.shop/api/agent/orders/{order['id']}").json()
    print(o['status'])
    if o['status'] in terminal:
        break
    time.sleep(3)
```

### Go

```go
resp, _ := http.Post(
    "https://steam0.shop/api/agent/orders",
    "application/json",
    strings.NewReader(`{"steam_login":"iliyafominator","amount_usd":25}`),
)
var order map[string]any
json.NewDecoder(resp.Body).Decode(&order)
fmt.Println("Pay here:", order["pay_url"])
```

---

## API reference

### `new Steam0Client(opts?)`

| option       | type     | required | default                    |
| ------------ | -------- | -------- | -------------------------- |
| `baseUrl`    | string   | no       | `https://steam0.shop`      |
| `timeoutMs`  | number   | no       | `30000`                    |
| `source`     | string   | no       | tag attached to all orders |
| `fetch`      | function | no       | `globalThis.fetch`         |

### `createOrder({ steamLogin, amountUsd, source? }) → Order`

Creates a new top-up order. Returns immediately with `payUrl`. Throws `Steam0ApiError` on validation failure.

### `getOrder(id) → Order`

Returns the latest known state. `Order.batches` is present for orders that exceeded the per-batch cap (~$1000) — gives you live `completed/total` progress.

### `waitForOrder(id, opts) → Order`

Polls until the order reaches a terminal status. Callback `onUpdate` fires on every poll — wire it to a progress bar.

### `getRates() → RatesResponse`

Latest USD prices for supported cryptos.

### `ping() → boolean`

Health check.

## Errors

```ts
import { Steam0ApiError } from 'steam0-sdk';

try {
  await s0.createOrder({ steamLogin: 'bad login!', amountUsd: 0.5 });
} catch (e) {
  if (e instanceof Steam0ApiError) {
    console.log(e.status, e.message); // 400, "amount must be between $1 and $500,000"
  }
}
```

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

```ts
const s0 = new Steam0Client({
  baseUrl: 'https://staging.steam0.shop',
});
```

## License

MIT
