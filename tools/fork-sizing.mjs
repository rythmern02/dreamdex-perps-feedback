// LOCAL ANVIL FORK ONLY. Never submits anything to Hideki. No real keys or wallets.
//
// Report 003 fork evidence: the official bot kit's sizeOrder() sizes at the
// unpadded price, placePerp() then adds 20 bps of taker slippage without
// resizing. This script runs those original functions against the deployed
// BTC pool / MarginBank bytecode on a local fork of Somnia Hideki and asks the
// deployed pool itself whether it accepts the order the bot would send.
//
// Usage: anvil --fork-url https://api.hideki2.infra.testnet.somnia.network \
//          --fork-block-number 49980933 --chain-id 50383 --port 8547
//        node --import tsx tools/fork-sizing.mjs
import { readFile, writeFile } from 'node:fs/promises';
import {
  createPublicClient, createWalletClient, http, parseAbi, keccak256, stringToHex,
  encodeAbiParameters, encodeFunctionData, decodeFunctionData, toHex, maxUint256, BaseError, ContractFunctionRevertedError,
} from 'viem';
import { contractErrorsAbi } from '@somnia-chain/markets-sdk';
import { getMaxPerpOrderSize, previewPerpOrderMargin } from '../node_modules/@somnia-chain/markets-sdk/dist/perp/margin.js';
import { perpPoolReadAbi } from '../node_modules/@somnia-chain/markets-sdk/dist/readsAbi.js';
import { perpPoolWriteAbi } from '../node_modules/@somnia-chain/markets-sdk/dist/tradeAbi.js';
import { farFutureNs, ZERO_ADDRESS } from '../node_modules/@somnia-chain/markets-sdk/dist/writer.js';
import * as Core from '../research/upstream/dreamdex-bot-kit/packages/perp-core/src/index.ts';

const url = process.env.FORK_RPC ?? 'http://127.0.0.1:8547';
const FORK_SOURCE = 'https://api.hideki2.infra.testnet.somnia.network';
const FORK_BLOCK = 49980933;
const CHAIN_ID = 50383;
const local = new URL(url);
if (!['127.0.0.1', 'localhost', '[::1]'].includes(local.hostname)) throw Error(`refusing non-local RPC ${url}`);

const pc = createPublicClient({ transport: http(url, { timeout: 240_000, retryCount: 0 }), cacheTime: 0 });
const A = '0x0000000000000000000000000000000000000001'; // fixture address, no key exists for it
const wallet = createWalletClient({ transport: http(url), account: A });
const TOKEN = '0xed7993A74dAe1e6656B704A424DcD8711aAf4F72';
const json = x => JSON.stringify(x, (_, v) => typeof v === 'bigint' ? v.toString() : v, 2);
const evidence = { runAt: new Date().toISOString(), localRpc: url, forkSource: FORK_SOURCE, forkBlock: FORK_BLOCK, publicChainWrites: 0, fixtureAccount: A };
const erc20 = parseAbi(['function balanceOf(address) view returns(uint256)', 'function approve(address,uint256) returns(bool)']);
const bankAbi = parseAbi(['function deposit(uint256)']);
const orderAbi = [...perpPoolWriteAbi, ...contractErrorsAbi];
const MARGIN_ERROR = /^(InsufficientMargin\w*|InsufficientCollateral|InsufficientBalance|InsufficientLocked|CloseOutMarginExceedsBalance)$/;

/** Every field viem exposes, so a JS-side failure can never pass as a contract rejection. */
function describe(error) {
  const out = { name: error?.name, message: error?.message?.split('\n')[0], shortMessage: error?.shortMessage, details: error?.details };
  if (error instanceof BaseError) {
    const revert = error.walk(e => e instanceof ContractFunctionRevertedError);
    if (revert) {
      out.contractRevert = true;
      out.errorName = revert.data?.errorName;
      out.errorArgs = revert.data?.args;
      out.signature = revert.signature;
      out.raw = revert.raw;
      out.reason = revert.reason;
    }
    out.causeChain = [];
    error.walk(e => { out.causeChain.push({ name: e?.name, shortMessage: e?.shortMessage, details: e?.details }); return false; });
  }
  out.contractRevert ??= false;
  return out;
}

/** Same argument order and defaults as markets-sdk 0.32.1 perpOrderCall (dist/orders.js:1610). */
function orderArgs(p) {
  return [p.isBid, 0n, p.price, p.quantity, farFutureNs(), p.orderType, 0, ZERO_ADDRESS, 0n];
}

async function simulate(label, p) {
  try {
    const { result } = await pc.simulateContract({ account: A, address: p.pool, abi: orderAbi, functionName: 'placeOrder', args: orderArgs(p), gas: 10_000_000n });
    return { label, accepted: true, result };
  } catch (error) {
    return { label, accepted: false, error: describe(error) };
  }
}

try {
  // Clean, deterministic state on every run: reset the LOCAL fork to the pinned block.
  await pc.request({ method: 'anvil_reset', params: [{ forking: { jsonRpcUrl: FORK_SOURCE, blockNumber: FORK_BLOCK } }] });
  const info = await pc.request({ method: 'anvil_nodeInfo' });
  evidence.nodeInfo = info;
  if (!String(info.forkConfig?.forkUrl ?? '').includes('hideki2')) throw Error('unexpected fork origin');
  if (Number(info.forkConfig?.forkBlockNumber) !== FORK_BLOCK) throw Error('unexpected fork block');
  if (await pc.getChainId() !== CHAIN_ID) throw Error('unexpected fork chain id');

  const baseline = JSON.parse(await readFile(new URL('../research/evidence/live-baseline.json', import.meta.url)));
  const btc = baseline.btc;
  if (!btc) throw Error('missing BTC baseline');
  const m = { symbol: 'BTC/USDso:USDso', display: 'BTC-PERP', info: btc };
  evidence.market = { pool: btc.poolAddress, marginBank: btc.marginBank, tickSize: btc.tickSize, lotSize: btc.lotSize, minQuantity: btc.minQuantity };

  // Local-only collateral fixture: impersonate the fixture address, give it 1000 USDso by storage write.
  await pc.request({ method: 'anvil_impersonateAccount', params: [A] });
  await pc.request({ method: 'anvil_setBalance', params: [A, toHex(10n ** 22n)] });
  const namespace = BigInt(keccak256(encodeAbiParameters([{ type: 'uint256' }], [BigInt(keccak256(stringToHex('openzeppelin.storage.ERC20'))) - 1n]))) & ~255n;
  const balance = 1000n * 10n ** 18n;
  const trace = await pc.request({ method: 'debug_traceCall', params: [{ to: TOKEN, data: encodeFunctionData({ abi: erc20, functionName: 'balanceOf', args: [A] }) }, 'latest', {}] });
  const tracedKeys = [...new Set(trace.structLogs.filter(s => s.op === 'SLOAD').map(s => '0x' + s.stack.at(-1).replace(/^0x/, '').padStart(64, '0')))];
  const candidates = [...tracedKeys, ...[namespace, ...Array.from({ length: 16 }, (_, i) => BigInt(i))].map(slot => keccak256(encodeAbiParameters([{ type: 'address' }, { type: 'uint256' }], [A, slot])))];
  for (const key of candidates) {
    const snapshot = await pc.request({ method: 'evm_snapshot' });
    await pc.request({ method: 'anvil_setStorageAt', params: [TOKEN, key, toHex(balance, { size: 32 })] });
    try { if (await pc.readContract({ address: TOKEN, abi: erc20, functionName: 'balanceOf', args: [A] }) === balance) { evidence.localBalanceKey = key; break; } } catch {}
    await pc.request({ method: 'evm_revert', params: [snapshot] });
  }
  if (!evidence.localBalanceKey) throw Error('could not provision local-only collateral fixture');

  let timestamp = (await pc.getBlock()).timestamp;
  async function send(p, { expectSuccess = true } = {}) {
    timestamp += 1n;
    await pc.request({ method: 'evm_setNextBlockTimestamp', params: [Number(timestamp)] });
    const hash = await wallet.writeContract({ ...p, gas: 10_000_000n, chain: null });
    const receipt = await pc.waitForTransactionReceipt({ hash, pollingInterval: 10 });
    if (expectSuccess && receipt.status !== 'success') throw Error(`local setup reverted ${hash}`);
    return { hash, status: receipt.status, block: receipt.blockNumber, gasUsed: receipt.gasUsed, localForkOnly: true };
  }
  evidence.approval = await send({ address: TOKEN, abi: erc20, functionName: 'approve', args: [btc.marginBank, maxUint256] });
  evidence.deposit = await send({ address: btc.marginBank, abi: bankAbi, functionName: 'deposit', args: [5n * 10n ** 18n] });
  // Empty the wallet so only the 5 USDso in the bank can cover the order.
  await pc.request({ method: 'anvil_setStorageAt', params: [TOKEN, evidence.localBalanceKey, toHex(0n, { size: 32 })] });
  evidence.walletBalanceAfterDeposit = await pc.readContract({ address: TOKEN, abi: erc20, functionName: 'balanceOf', args: [A] });

  const health = await pc.readContract({ address: btc.poolAddress, abi: perpPoolReadAbi, functionName: 'tryGetHealthSnapshot' });
  evidence.health = health;
  if (!health[0]) throw Error('fork oracle not priceable');
  const price = Core.alignPrice(health[1].markPrice, btc);
  evidence.readPrice = price;

  // ORIGINAL bot-kit code path: sizeOrder at the read price, then placePerp(MARKET).
  const exchange = { client: { getMaxPerpOrderSize: p => getMaxPerpOrderSize(p, pc) }, trader: { placePerpOrder: async p => { evidence.placement = p; return { hash: '0x' + '0'.repeat(64), fills: [], orderId: 0n }; } } };
  const sized = await Core.sizeOrder(exchange, { market: m, account: A, side: 'long', price, wanted: 10n ** 12n });
  evidence.sized = sized;
  if (!sized.ok) throw Error('local sizing fixture not placeable');
  await Core.placePerp({ ctx: { exchange, config: { dryRun: false } }, market: m, side: 'long', price, quantity: sized.quantity, orderType: Core.ORDER_TYPE.MARKET });
  evidence.paddingBps = Number((evidence.placement.price - price) * 1_000_000n / price) / 100; // after tick alignment

  // SDK margin previews of the same quantity at both prices.
  const common = { pool: btc.poolAddress, marginBank: btc.marginBank, account: A, isBid: true, quantity: sized.quantity };
  evidence.readQuote = await previewPerpOrderMargin({ ...common, price }, pc);
  evidence.sendQuote = await previewPerpOrderMargin({ ...common, price: evidence.placement.price }, pc);

  // Control: re-size at the price that is actually sent.
  const repaired = await Core.sizeOrder(exchange, { market: m, account: A, side: 'long', price: evidence.placement.price, wanted: 10n ** 12n });
  evidence.repaired = repaired;
  evidence.repairedQuote = await previewPerpOrderMargin({ ...common, quantity: repaired.quantity, price: evidence.placement.price }, pc);

  // The deployed pool's own answer (eth_call against forked bytecode).
  evidence.poolSimulation = await simulate('bot order: unpadded size at padded price', evidence.placement);
  evidence.controlSimulation = await simulate('control: size recomputed at padded price', { ...evidence.placement, quantity: repaired.quantity });

  // Mined local-fork transactions, so the rejection has a transaction hash. LOCAL ONLY.
  evidence.localRevertTx = await send({ address: btc.poolAddress, abi: orderAbi, functionName: 'placeOrder', args: orderArgs(evidence.placement) }, { expectSuccess: false });
  evidence.localControlTx = await send({ address: btc.poolAddress, abi: orderAbi, functionName: 'placeOrder', args: orderArgs({ ...evidence.placement, quantity: repaired.quantity }) }, { expectSuccess: false });

  // Where exactly did the deployed code fail? Trace the mined local revert and find the
  // collateral pull the MarginBank attempted from the (empty) fixture wallet.
  const tx = await pc.request({ method: 'debug_traceTransaction', params: [evidence.localRevertTx.hash, { tracer: 'callTracer' }] });
  const transferFrom = parseAbi(['function transferFrom(address from,address to,uint256 amount)']);
  const pulls = [];
  (function walk(call, path) {
    if (call.to?.toLowerCase() === TOKEN.toLowerCase() && call.input?.startsWith('0x23b872dd')) {
      const { args } = decodeFunctionData({ abi: transferFrom, data: call.input });
      pulls.push({ callPath: [...path, call.to], caller: call.from, from: args[0], to: args[1], amount: args[2], error: call.error, revertReason: call.revertReason });
    }
    for (const c of call.calls ?? []) walk(c, [...path, call.to]);
  })(tx, []);
  evidence.localRevertTrace = { topLevelError: tx.error, collateralPulls: pulls };
  const shortfall = evidence.sendQuote.lockAmount - evidence.sendQuote.unlockedCollateral;
  evidence.paddedShortfall = shortfall;
  const failedPull = pulls.find(p => p.from.toLowerCase() === A.toLowerCase() && p.to.toLowerCase() === btc.marginBank.toLowerCase() && p.error);

  const rejection = evidence.poolSimulation.error;
  evidence.criteria = {
    unpaddedQuoteSufficient: evidence.readQuote.sufficient === true,
    paddedQuoteInsufficient: evidence.sendQuote.sufficient === false,
    deployedPoolRejectedBotOrder: evidence.poolSimulation.accepted === false && rejection?.contractRevert === true,
    // Either a named margin error, or the bank's wallet top-up for exactly the padded shortfall failing.
    rejectionIsCollateralShortfall: MARGIN_ERROR.test(rejection?.errorName ?? '') ||
      (/transfer amount exceeds balance/.test(rejection?.reason ?? '') && failedPull?.amount === shortfall && shortfall > 0n),
    rejectionIsNotJavaScriptError: !['TypeError', 'ReferenceError', 'SyntaxError', 'RangeError'].includes(rejection?.name),
    controlNotMarginRejected: evidence.controlSimulation.accepted === true || !MARGIN_ERROR.test(evidence.controlSimulation.error?.errorName ?? ''),
    localRevertMinedAsReverted: evidence.localRevertTx.status === 'reverted',
  };
  evidence.reproduced = Object.values(evidence.criteria).every(Boolean);
} catch (error) {
  evidence.error = describe(error);
  evidence.reproduced = false;
}
await writeFile(new URL('../research/evidence/fork-sizing.json', import.meta.url), json(evidence) + '\n');
console.log(json({ reproduced: evidence.reproduced, criteria: evidence.criteria, paddedShortfall: evidence.paddedShortfall, localRevertTrace: evidence.localRevertTrace, poolSimulation: evidence.poolSimulation, controlSimulation: evidence.controlSimulation, localRevertTx: evidence.localRevertTx, localControlTx: evidence.localControlTx, error: evidence.error }));
if (!evidence.reproduced) process.exitCode = 1;
