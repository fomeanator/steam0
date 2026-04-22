#!/usr/bin/env node
/**
 * CLI for @steam0/sdk. Usage:
 *   STEAM0_API_KEY=... npx steam0 create --login iliyafominator --amount 25
 *   STEAM0_API_KEY=... npx steam0 status <order-id>
 *   STEAM0_API_KEY=... npx steam0 watch <order-id>
 *   npx steam0 rates              # public, no key needed
 *
 * Designed to be self-contained — zero npm runtime deps. AI agents can shell
 * out to it from any language without bringing JS into their stack.
 */

import { Order, Steam0ApiError, Steam0Client } from './index.js';

main().catch((err) => {
  if (err instanceof Steam0ApiError) {
    process.stderr.write(`✖ ${err.message}\n`);
    if (process.env.DEBUG) process.stderr.write(err.body + '\n');
  } else {
    process.stderr.write(`✖ ${err?.message ?? err}\n`);
  }
  process.exit(1);
});

async function main() {
  const argv = process.argv.slice(2);
  const cmd = argv[0] ?? 'help';
  const args = argv.slice(1);

  switch (cmd) {
    case 'help':
    case '-h':
    case '--help':
      return printHelp();
    case 'version':
    case '-v':
    case '--version':
      return printVersion();
    case 'rates':
      return runRates();
    case 'create':
      return runCreate(args);
    case 'status':
      return runStatus(args);
    case 'watch':
      return runWatch(args);
    default:
      process.stderr.write(`Unknown command: ${cmd}\n\n`);
      printHelp();
      process.exit(2);
  }
}

function newClient(): Steam0Client {
  const apiKey = process.env.STEAM0_API_KEY;
  if (!apiKey) {
    throw new Error('STEAM0_API_KEY env var is required (get one from steam0.shop/agents)');
  }
  return new Steam0Client({
    apiKey,
    baseUrl: process.env.STEAM0_BASE_URL,
    source: process.env.STEAM0_SOURCE,
  });
}

async function runCreate(args: string[]) {
  const opts = parseFlags(args);
  const login = opts.login ?? opts.l;
  const amount = Number(opts.amount ?? opts.a);
  const source = opts.source ?? opts.s;
  if (!login || !Number.isFinite(amount)) {
    throw new Error('usage: steam0 create --login <steamLogin> --amount <usd> [--source <tag>]');
  }
  const order = await newClient().createOrder({ steamLogin: login, amountUsd: amount, source });
  printOrder(order);
}

async function runStatus(args: string[]) {
  const id = args[0];
  if (!id) throw new Error('usage: steam0 status <order-id>');
  const order = await newClient().getOrder(id);
  printOrder(order);
}

async function runWatch(args: string[]) {
  const id = args[0];
  if (!id) throw new Error('usage: steam0 watch <order-id>');
  const client = newClient();
  process.stdout.write(`Watching ${id}…\n`);
  const final = await client.waitForOrder(id, {
    intervalMs: 3000,
    onUpdate: (o) => {
      let line = `  [${ts()}] ${o.status}`;
      if (o.batches) line += ` · ${o.batches.completed}/${o.batches.total}`;
      process.stdout.write(line + '\n');
    },
  });
  process.stdout.write('\n');
  printOrder(final);
}

async function runRates() {
  const client = new Steam0Client({ apiKey: 'public-noop' });
  const rates = await client.getRates();
  process.stdout.write(JSON.stringify(rates, null, 2) + '\n');
}

function printOrder(o: Order) {
  process.stdout.write(JSON.stringify(o, null, 2) + '\n');
}

function printVersion() {
  // package.json copied at build time — fall back to "unknown" if not bundled.
  process.stdout.write('@steam0/sdk\n');
}

function printHelp() {
  process.stdout.write(`steam0 — programmatic Steam top-up via crypto

Usage:
  steam0 create --login <steam> --amount <usd> [--source <tag>]
  steam0 status <order-id>
  steam0 watch <order-id>
  steam0 rates

Env:
  STEAM0_API_KEY     required for create/status/watch (issued at steam0.shop)
  STEAM0_BASE_URL    optional (defaults to https://steam0.shop)
  STEAM0_SOURCE      optional default source tag for create

Examples:
  STEAM0_API_KEY=... steam0 create -l iliyafominator -a 25
  STEAM0_API_KEY=... steam0 watch 8c3d1861-48dc-42ee-aeed-90f3f654333a

Library usage (Node ≥18):
  import { Steam0Client } from '@steam0/sdk';
  const s0 = new Steam0Client({ apiKey: process.env.STEAM0_API_KEY! });
  const order = await s0.createOrder({ steamLogin: 'iliyafominator', amountUsd: 25 });
  console.log(order.payUrl);
`);
}

function parseFlags(args: string[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (!a.startsWith('-')) continue;
    const key = a.replace(/^-+/, '');
    const next = args[i + 1];
    if (!next || next.startsWith('-')) {
      out[key] = 'true';
    } else {
      out[key] = next;
      i++;
    }
  }
  return out;
}

function ts(): string {
  return new Date().toISOString().slice(11, 19);
}
