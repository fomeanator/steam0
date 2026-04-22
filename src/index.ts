/**
 * @steam0/sdk — programmatic Steam top-up via crypto.
 *
 * Designed so an LLM agent or a Node.js bot can create top-up orders in
 * three lines:
 *
 *   import { Steam0Client } from '@steam0/sdk';
 *   const s0 = new Steam0Client({ apiKey: process.env.STEAM0_API_KEY! });
 *   const order = await s0.createOrder({ steamLogin: 'iliyafominator', amountUsd: 25 });
 *   console.log('Pay here:', order.payUrl);
 */

export const DEFAULT_BASE_URL = 'https://steam0.shop';

export interface Steam0ClientOptions {
  /** Override the API host. Useful for self-hosted or staging deployments. */
  baseUrl?: string;
  /** Per-request timeout in milliseconds. Defaults to 30 000. */
  timeoutMs?: number;
  /**
   * Tag your traffic so the operator sees the source in the Telegram bubble
   * instead of the generic "agent". E.g. "telegram-bot:my-app".
   */
  source?: string;
  /** Override fetch (for tests / Node < 18). Defaults to globalThis.fetch. */
  fetch?: typeof fetch;
}

export interface CreateOrderInput {
  steamLogin: string;
  amountUsd: number;
  /** Optional per-request source override (takes precedence over client-level). */
  source?: string;
}

/** Mirrors the OrderResponse JSON returned by the API (camelCased here). */
export interface Order {
  id: string;
  steamLogin: string;
  amountUsd: number;
  status: OrderStatus;
  payUrl?: string;
  hasCode: boolean;
  error?: string;
  createdAt: string;
  paidAt?: string;
  batches?: BatchProgress;
}

export type OrderStatus =
  | 'pending'
  | 'paid'
  | 'fulfilling'
  | 'completed'
  | 'failed'
  | 'cancelled'
  | 'expired'
  | 'refund'
  | 'unknown';

export interface BatchProgress {
  total: number;
  completed: number;
  fulfilling: number;
  pending: number;
  failed: number;
  amountTotal: number;
  amountCompleted: number;
}

export interface RatesResponse {
  /** Currency ticker → USD price. */
  prices: Record<string, number>;
  updatedAt?: string;
}

export class Steam0ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly body: string,
    message: string,
  ) {
    super(message);
    this.name = 'Steam0ApiError';
  }
}

export class Steam0Client {
  private readonly baseUrl: string;
  private readonly timeoutMs: number;
  private readonly source?: string;
  private readonly fetchImpl: typeof fetch;

  constructor(opts: Steam0ClientOptions = {}) {
    this.baseUrl = (opts.baseUrl ?? DEFAULT_BASE_URL).replace(/\/$/, '');
    this.timeoutMs = opts.timeoutMs ?? 30_000;
    this.source = opts.source;
    this.fetchImpl = opts.fetch ?? globalThis.fetch;
    if (!this.fetchImpl) {
      throw new Error('Steam0Client: no global fetch — pass opts.fetch or upgrade Node ≥18');
    }
  }

  /** Create a new top-up order. Returns immediately with pay_url where the user pays crypto. */
  async createOrder(input: CreateOrderInput): Promise<Order> {
    const body = {
      steam_login: input.steamLogin,
      amount_usd: input.amountUsd,
      source: input.source ?? this.source,
    };
    const json = await this.request<Record<string, unknown>>('POST', '/api/agent/orders', body);
    return mapOrder(json);
  }

  /** Fetch current state of an order. */
  async getOrder(orderId: string): Promise<Order> {
    const json = await this.request<Record<string, unknown>>('GET', `/api/agent/orders/${encodeURIComponent(orderId)}`, undefined);
    return mapOrder(json);
  }

  /**
   * Poll the order until it reaches a terminal state (completed / failed /
   * cancelled / expired / refund). Resolves with the final order. Use this
   * inside agent flows where you want to wait for fulfillment.
   *
   * @param orderId — the order to watch
   * @param opts.intervalMs — poll interval (default 3 000)
   * @param opts.timeoutMs — give up after this long (default 30 минут)
   * @param opts.onUpdate — callback fired on every poll (use for progress UI)
   */
  async waitForOrder(
    orderId: string,
    opts: { intervalMs?: number; timeoutMs?: number; onUpdate?: (o: Order) => void } = {},
  ): Promise<Order> {
    const interval = opts.intervalMs ?? 3000;
    const deadline = Date.now() + (opts.timeoutMs ?? 30 * 60 * 1000);
    const terminal: OrderStatus[] = ['completed', 'cancelled', 'failed', 'expired', 'refund'];
    while (true) {
      const o = await this.getOrder(orderId);
      opts.onUpdate?.(o);
      if (terminal.includes(o.status)) return o;
      if (Date.now() > deadline) throw new Error(`waitForOrder: timeout (status=${o.status})`);
      await sleep(interval);
    }
  }

  /** Public crypto rates. */
  async getRates(): Promise<RatesResponse> {
    return this.request<RatesResponse>('GET', '/api/rates', undefined);
  }

  /** Public health check. */
  async ping(): Promise<boolean> {
    try {
      const res = await this.request<{ status: string }>('GET', '/api/health', undefined);
      return res?.status === 'ok';
    } catch {
      return false;
    }
  }

  // ---------- low-level ----------

  private async request<T>(method: string, path: string, body: unknown): Promise<T> {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };

    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), this.timeoutMs);
    let res: Response;
    try {
      res = await this.fetchImpl(this.baseUrl + path, {
        method,
        headers,
        body: body !== undefined ? JSON.stringify(body) : undefined,
        signal: ctrl.signal,
      });
    } finally {
      clearTimeout(timer);
    }

    const text = await res.text();
    if (!res.ok) {
      let message = `${method} ${path} → ${res.status}`;
      try {
        const parsed = JSON.parse(text) as { error?: string };
        if (parsed.error) message = `${parsed.error} (${res.status})`;
      } catch {
        /* body wasn't JSON, keep default */
      }
      throw new Steam0ApiError(res.status, text, message);
    }
    if (!text) return undefined as T;
    return JSON.parse(text) as T;
  }
}

function mapOrder(j: Record<string, unknown>): Order {
  return {
    id: String(j.id),
    steamLogin: String(j.steam_login),
    amountUsd: Number(j.amount_usd),
    status: j.status as OrderStatus,
    payUrl: j.pay_url ? String(j.pay_url) : undefined,
    hasCode: Boolean(j.has_code),
    error: j.error ? String(j.error) : undefined,
    createdAt: String(j.created_at),
    paidAt: j.paid_at ? String(j.paid_at) : undefined,
    batches: j.batches as BatchProgress | undefined,
  };
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
