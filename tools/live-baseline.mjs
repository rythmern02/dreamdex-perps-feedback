import { writeFile } from 'node:fs/promises';
import { createPublicClient, http } from 'viem';
import { perpPoolReadAbi } from '../node_modules/@somnia-chain/markets-sdk/dist/readsAbi.js';

const rpc = 'https://api.hideki2.infra.testnet.somnia.network';
const indexer = 'https://hideki-dev.smk.somnia.host/v1/graphql';
const pc = createPublicClient({ transport: http(rpc, { timeout: 20_000, retryCount: 0 }) });
const evidence = { capturedAt: new Date().toISOString(), rpc, indexer, readsOnly: true };
try {
  evidence.chainId = await pc.getChainId();
  evidence.block = await pc.getBlockNumber({ cacheTime: 0 });
  const response = await fetch(indexer, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({query: '{ Market(where: {marketType: {_eq: "PERP"}, baseSymbol: {_in: ["BTC", "ETH", "SOL"]}}, limit: 10) { id poolAddress baseSymbol quoteSymbol baseDecimals quoteDecimals tickSize lotSize minQuantity marginBank stopRegistry markPrice fundingRate fundingWindowSec fundingIntervalSec } }'}),
    signal: AbortSignal.timeout(20_000),
  });
  evidence.indexerStatus = response.status;
  evidence.marketsResponse = await response.json();
  const btc = evidence.marketsResponse.data?.Market.find(m => m.baseSymbol === 'BTC');
  if (btc) {
    evidence.btc = btc;
    evidence.bookParameters = await pc.readContract({ address: btc.poolAddress, abi: perpPoolReadAbi, functionName: 'getOrderBookParameters', blockNumber: evidence.block });
    evidence.health = await pc.readContract({ address: btc.poolAddress, abi: perpPoolReadAbi, functionName: 'tryGetHealthSnapshot', blockNumber: evidence.block });
  }
} catch (error) { evidence.error = String(error); }
const out = JSON.stringify(evidence, (_, v) => typeof v === 'bigint' ? v.toString() : v, 2);
await writeFile(new URL('../research/evidence/live-baseline.json', import.meta.url), out + '\n');
console.log(out);
