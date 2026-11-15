// Runs original upstream code. Only network/process boundaries are controlled.
// node --import tsx --experimental-vm-modules tools/reproduce.mjs [001..018]
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { transformSync } from 'esbuild';
import { SomniaMarkets, ORDER_TYPE } from '@somnia-chain/markets-sdk';
import * as Core from '../research/upstream/dreamdex-bot-kit/packages/perp-core/src/index.ts';
import { getMaxPerpOrderSize, previewPerpOrderMargin } from '../node_modules/@somnia-chain/markets-sdk/dist/perp/margin.js';

const ROOT = new URL('../', import.meta.url);
const BOT = new URL('../research/upstream/dreamdex-bot-kit/', import.meta.url);
const BOT_COMMIT = '4e75896896e024c03e2033d5920514f249998cd6';
const A = '0x0000000000000000000000000000000000000001';
const B = '0x0000000000000000000000000000000000000002';
const POOL = '0x0000000000000000000000000000000000000010';
const BANK = '0x0000000000000000000000000000000000000020';
const REGISTRY = '0x0000000000000000000000000000000000000030';
const ONE = 10n ** 18n;
const raw = n => BigInt(Math.round(n * 1e8)) * 10n ** 10n;
const json = x => JSON.stringify(x, (_, v) => typeof v === 'bigint' ? v.toString() : v, 2);
const sourceHashes = {};
const results = [];

function market(base='BTC') {
  const info = { marketType: 'PERP', id: POOL, chainId: 50383, poolAddress: POOL, marginBank: BANK,
    stopRegistry: REGISTRY, baseSymbol: base, quoteSymbol: 'USDso', baseDecimals: 8, quoteDecimals: 18,
    tickSize: '100000000000000000', lotSize: '1000', minQuantity: '13000',
    markPrice: String(raw(100)), indexPrice: String(raw(100)), fundingRate: '100000000000000',
    fundingWindowSec: 28800, fundingIntervalSec: 3600, initialMarginBps: 500, openInterest: '0' };
  const symbol = `${base}/USDso:USDso`;
  return { symbol, display: `${base}-PERP`, info, market: {symbol, type:'swap', active:true, info} };
}
function marginState() {
  return {unlockedCollateralBalance:1000n*ONE, lockedCollateral:0n, equity:1000n*ONE,
    withdrawable:1000n*ONE, imReq:0n, mmReq:0n, cmReq:0n, marginStatus:'Healthy', activePerpPools:[]};
}
function fixture() {
  const m = market();
  const state = {m, tick:0, loads:0, positions:[{symbol:m.symbol,side:'long',contracts:1}],
    stops:[], placements:[], arms:[], cancellations:[], shutdowns:0};
  const exchange = {
    walletAddress:A,
    loadMarkets: async () => {state.loads++; return {[m.symbol]:m.market};},
    fetchPositions:async()=>state.positions,
    fetchOrderBook:async()=>({bids:[[100,10]],asks:[[100,10]]}),
    client: {
      getMarginAccount:async()=>marginState(),
      getPerpMaxLeverage:async()=>2,
      getPerpStopOrderSomiPayment:async()=>raw(.15),
      getPerpHealthSnapshot:async()=>({priceable:true,markPrice:raw(100)}),
      getPerpState:async()=>({fundingRate:100000000000000n,fundingWindowSec:28800,fundingIntervalSec:3600}),
      getMaxPerpOrderSize:async()=>({priceable:true,placeable:true,maxQuantity:100000000n,effectiveImfBps:500n}),
      listPerpStopOrders:async()=>state.stops,
      previewPerpClosePnl:async()=>({priceable:true,closedQuantity:100000000n,placeable:true}),
    },
    trader: {
      placePerpOrder:async p=>{state.placements.push(p); return {hash:'0x'+'1'.repeat(64),orderId:BigInt(100+state.placements.length),fills:p.orderType===ORDER_TYPE.POST_ONLY?[]:[{quantityFilled:p.quantity}]};},
      placePerpStopOrder:async p=>{state.arms.push(p);state.stops=[
        {orderIdRaw:'1',intent:p.intent,status:'PENDING',isBid:p.isBid,triggerOperator:p.triggerOperator,triggerPrice:String(p.triggerPrice),siblingOrderId:'2'},
        {orderIdRaw:'2',intent:p.intent,status:'PENDING',isBid:p.pair.isBid,triggerOperator:p.pair.triggerOperator,triggerPrice:String(p.pair.triggerPrice),siblingOrderId:'1'},
      ];return {stopOrderId:1n,pairedStopOrderId:2n};},
      cancelPerpStopOrders:async p=>{state.cancellations.push({kind:'stops',...p});return {};},
      cancelOrder:async p=>{state.cancellations.push({kind:'book',...p});return {};},
    },
  };
  const ctx = {exchange,config:{dryRun:false,symbol:m.display,operatorRegistry:REGISTRY},canTrade:true};
  return {state,exchange,ctx};
}

async function runStrategy(name, f, {env={},stopAfter=1, overrides={}, onSleep=()=>{}}={}) {
  const file = new URL(`strategies/${name}/src/index.ts`,BOT);
  const source = await readFile(file,'utf8');
  sourceHashes[`strategies/${name}/src/index.ts`] = createHash('sha256').update(source).digest('hex');
  const lines=[];
  let finish;
  const done=new Promise(resolve=>finish=resolve);
  const environment={DRY_RUN:'false', ...env};
  const exports={...Core,
    loadEnv:()=>{},
    envNum:(name,fallback)=>Number(environment[name]??fallback),
    createExchange:()=>f.ctx,
    onStop:()=>()=>f.state.tick>=stopAfter,
    sleep:async()=>{f.state.tick++;await onSleep(f.state);},
    shutdown:async()=>{f.state.shutdowns++;},
    ...overrides,
  };
  const context=vm.createContext({
    console:{log:(...xs)=>lines.push(xs.join(' ')),error:(...xs)=>lines.push(xs.join(' '))},
    process:{env:environment,exit:code=>finish(code)},
    setTimeout,clearTimeout,
  });
  const module=new vm.SourceTextModule(transformSync(source,{loader:'ts',format:'esm',target:'es2022'}).code,{context,identifier:file.href});
  await module.link(spec=>{
    assert.equal(spec,'@dreamdex-bot-kit/perp-core');
    return new vm.SyntheticModule(Object.keys(exports),function(){for(const [key,value] of Object.entries(exports))this.setExport(key,value);},{context});
  });
  await module.evaluate();
  let timer;
  const exit=await Promise.race([done,new Promise((_,reject)=>timer=setTimeout(()=>reject(new Error(`harness timeout: ${name}`)),5000))]);
  clearTimeout(timer);
  return {exit,logs:lines};
}

function facade(SDK=SomniaMarkets) {
  const m=market();
  const t={symbol:m.symbol,marketSymbol:m.symbol,pool:POOL,chainId:50383,market:m.info};
  const sent=[];
  const engine={config:{chain:{id:50383}},getWatchStatus:()=> 'idle',
    createTrader:cfg=>({placePerpOrder:async p=>{
      const actor=cfg.account;
      sent.push({actor,...p});
      if(p.orderType===ORDER_TYPE.FILL_OR_KILL && p.quantity>50000000n) throw new Error('FillOrKillNotFilled');
      const fill=p.quantity<50000000n?p.quantity:50000000n;
      return {hash:'0x'+'1'.repeat(64),orderId:42n,fills:p.orderType===ORDER_TYPE.POST_ONLY?[]:[{quantityFilled:fill}]};
    }})};
  const exchange=Object.create(SDK.prototype);
  Object.assign(exchange,{signerConfig:{account:A},traders:new Map(),engines:new Map([[50383,engine]]),closeController:new AbortController()});
  // Symbol resolution and book acquisition are the only replaced facade methods.
  exchange.market=()=>t;
  exchange.fetchOrderBook=async()=>({bids:[[100,.5]],asks:[[100,.5]]});
  return {exchange,sent,m};
}

async function test001() {
  const cases=[];
  for (const [type,params] of [['limit',{timeInForce:'FOK'}],['market',{timeInForce:'FOK'}],['market',{postOnly:true}]]) {
    const f=facade(); let result,error;
    try {result=await f.exchange.createOrder(f.m.symbol,type,'buy',1,type==='limit'?100:undefined,params);} catch(e){error=String(e);}
    cases.push({type,params,sent:f.sent,result,error});
  }
  assert.match(cases[0].error,/FillOrKillNotFilled/);
  assert.equal(cases[1].sent[0].orderType,ORDER_TYPE.MARKET);
  assert.equal(cases[1].result.filled,.5);
  assert.equal(cases[2].sent[0].orderType,ORDER_TYPE.MARKET);
  return {cases,scope:'Original createOrder/crossingPrice/precision/trader binding; fake book and execution boundary. No live order.'};
}
async function test002() {
  const f=facade(); let release;
  const book=new Promise(r=>release=r);
  let bookRead;
  const entered=new Promise(r=>bookRead=r);
  f.exchange.fetchOrderBook=()=>{bookRead();return book;};
  const initiatingAccount=f.exchange.walletAddress;
  const pending=f.exchange.createOrder(f.m.symbol,'market','buy',.5,undefined,{slippage:0});
  await entered;
  f.exchange.setSigner({account:B});
  release({bids:[[100,.5]],asks:[[100,.5]]});
  const order=await pending;
  assert.equal(initiatingAccount,A);
  assert.equal(f.sent[0].actor,B);
  const control=facade(); await control.exchange.createOrder(control.m.symbol,'market','buy',.5);
  assert.equal(control.sent[0].actor,A);
  return {initiatingAccount,accountAfterSwitch:f.exchange.walletAddress,sent:f.sent,order,controlActor:control.sent[0].actor,
    scope:'Original createOrder, setSigner, traderFor and signer config resolution; book wait and trader execution are controlled. Addresses are fixture-only; no key or signature.'};
}
async function test003() {
  const m=market();
  const pc={getBlockNumber:async()=>1n,readContract:async p=>{
    switch(p.functionName){
      case 'tryGetHealthSnapshot':return [true,{oneBase:100000000n,markPrice:raw(100),effectiveIMFBps:500n}];
      case 'getReducingCapacity':return {positionSize:0n,effectiveReducingCapacity:0n};
      case 'getAccountState':return {unlockedCollateralBalance:5n*ONE};
      case 'getAccountHealth':return [5n*ONE,0n];
      case 'getMaxLeverage':return 0;
      case 'getMaxLeverageLimit':return 100;
      case 'getCreditFloor':return 0n;
      case 'getVoucherLeverageCap':return 20;
      case 'isVoucherMarketAllowed':return true;
      case 'isRestricted':return false;
      case 'isolationAllowsMarket':return true;
      case 'getPerpPoolParameters':return {maxPositionSize:100000000n,takerFeeBpsTimes1k:0n,makerFeeBpsTimes1k:0n};
      case 'getOrderBookParameters':return {lotSize:1000n,minQuantity:13000n,tickSize:raw(.1)};
      default:throw Error(`unexpected read ${p.functionName}`);
    }
  }};
  const exchange={client:{getMaxPerpOrderSize:p=>getMaxPerpOrderSize(p,pc)},trader:{placePerpOrder:async p=>({hash:'0x'+'1'.repeat(64),fills:[],orderId:1n})}};
  const sized=await Core.sizeOrder(exchange,{market:m,account:A,side:'long',price:raw(100),wanted:100000000n});
  let placement;
  exchange.trader.placePerpOrder=async p=>{placement=p;return {hash:'0x'+'1'.repeat(64),fills:[],orderId:1n};};
  await Core.placePerp({ctx:{exchange,config:{dryRun:false}},market:m,side:'long',price:raw(100),quantity:sized.quantity,orderType:ORDER_TYPE.MARKET});
  const atRead=await previewPerpOrderMargin({pool:POOL,marginBank:BANK,account:A,isBid:true,quantity:sized.quantity,price:raw(100)},pc);
  const atSend=await previewPerpOrderMargin({pool:POOL,marginBank:BANK,account:A,isBid:true,quantity:sized.quantity,price:placement.price},pc);
  assert.equal(sized.ok,true);assert.equal(atRead.sufficient,true);assert.equal(atSend.sufficient,false);
  assert.equal(placement.price,raw(100.2));
  const repaired=await Core.sizeOrder(exchange,{market:m,account:A,side:'long',price:placement.price,wanted:100000000n});
  const repairedQuote=await previewPerpOrderMargin({pool:POOL,marginBank:BANK,account:A,isBid:true,quantity:repaired.quantity,price:placement.price},pc);
  assert.equal(repairedQuote.sufficient,true);
  return {sized,placement,atRead,atSend,repaired,repairedQuote,
    scope:'Original bot sizeOrder/placePerp plus original SDK getMaxPerpOrderSize/previewPerpOrderMargin. Deterministic chain-read fixture; not a mined revert.'};
}
async function test004() {
  const outputs=[];
  for (const side of ['long','short']) {
    const f=fixture(); f.state.positions[0].side=side;
    const run=await runStrategy('perp-starter',f,{env:{PERP_SIDE:side,PERP_TAKE_PROFIT_PCT:'2',PERP_STOP_LOSS_PCT:'1'},stopAfter:0});
    assert.equal(run.exit,0);assert.equal(f.state.arms.length,1);
    outputs.push({side,takeProfit:f.state.arms[0].triggerPrice,stopLoss:f.state.arms[0].pair.triggerPrice,run});
  }
  assert.equal(outputs[0].takeProfit,raw(102));assert.equal(outputs[0].stopLoss,raw(99));
  assert.equal(outputs[1].takeProfit,raw(99));assert.equal(outputs[1].stopLoss,raw(102));
  return {mark:'100',configured:{takeProfitPct:2,stopLossPct:1},expectedShort:{takeProfit:'98',stopLoss:'101'},outputs,
    scope:'Original complete starter main and armBracket; fixture exchange records outgoing stop parameters, no chain writes.'};
}
async function test005() {
  const cases=[];
  for (const unrelated of [false,true]) {
    const f=fixture();
    if(unrelated) f.state.stops=[{orderIdRaw:'77',intent:'opening',isBid:true,status:'PENDING',quantity:'100000000',triggerOperator:0,triggerPrice:String(raw(110)),siblingOrderId:null}];
    const run=await runStrategy('perp-starter',f,{stopAfter:1});
    assert.equal(run.exit,0);
    cases.push({unrelatedOpeningStop:unrelated,bracketsCreated:f.state.arms.length,cancellations:f.state.cancellations,run});
  }
  assert.equal(cases[0].bracketsCreated,1);assert.equal(cases[1].bracketsCreated,0);
  return {cases,scope:'Original starter, pendingStops, armBracket and cancelStops; pending-stop rows are controlled SDK responses. Existing long is not protected by fixture opening stop.'};
}
async function test006() {
  const f=fixture();
  // Indexer rows as markets-sdk 0.32.1 documents them (dist/perp/stops.d.ts): the default
  // listing returns only PENDING rows; a leg that fires without filling becomes a terminal
  // TRIGGER_FAILED row with dropReason NoFill, and its partner stays PENDING and unlinked.
  const tp={orderIdRaw:'1',intent:'reduceOnly',isBid:false,triggerOperator:0,triggerPrice:String(raw(102)),status:'PENDING',siblingOrderId:null,dropReason:null};
  const slFailed={orderIdRaw:'2',intent:'reduceOnly',isBid:false,triggerOperator:1,triggerPrice:String(raw(99)),status:'TRIGGER_FAILED',siblingOrderId:null,dropReason:'NoFill',placedOrderId:null};
  const listings=[];
  f.exchange.client.listPerpStopOrders=async(opts={})=>{
    const statuses=opts.status?.length?opts.status:['PENDING'];
    listings.push({tick:f.state.tick,statuses});
    if(f.state.tick===0)return [];
    return [tp,slFailed].filter(row=>statuses.includes(row.status));
  };
  f.exchange.client.getPerpHealthSnapshot=async()=>({priceable:true,markPrice:raw(f.state.tick===0?100:98)});
  const run=await runStrategy('perp-starter',f,{stopAfter:2});
  assert.equal(run.exit,0);assert.equal(f.state.arms.length,1);assert.equal(f.state.placements.length,0);
  assert.equal(f.state.arms[0].pair.triggerPrice,raw(99));
  // The strategy never asks for history, so it never sees the failed leg.
  assert.ok(listings.every(l=>l.statuses.length===1&&l.statuses[0]==='PENDING'));
  assert.equal(Core.isRealStopFailure(slFailed.dropReason),true);
  const monitorLines=run.logs.filter(l=>/stop\(s\) armed/.test(l));
  assert.ok(monitorLines.length>=1 && monitorLines.every(l=>/1 stop\(s\) armed \| mark 98\.00/.test(l)));
  return {fixtureTransition:'SL #2 becomes terminal TRIGGER_FAILED/NoFill after tick 0; TP #1 stays pending and unlinked; long 1 BTC remains and mark is 98, below the original SL 99.',
    originalStopLoss:f.state.arms[0].pair.triggerPrice,terminalRow:slFailed,survivingRow:tp,listingCalls:listings,
    perpCoreClassifiesAsRealFailure:Core.isRealStopFailure(slFailed.dropReason),
    bracketsCreated:f.state.arms.length,rearmAttempts:f.state.arms.length-1,emergencyCloseOrders:f.state.placements.length,
    positionStillOpen:f.state.positions,monitorLines,run,
    scope:'Original starter monitoring loop. Terminal stop and no-fill outcome are injected as SDK-documented indexer rows, not observed on chain; this tests recovery once that documented state is returned.'};
}
async function test007() {
  const cases=[];
  for(const fail of [false,true]) {
    const f=fixture();f.state.positions=[];
    const original=f.exchange.loadMarkets;
    f.exchange.loadMarkets=async(...args)=>{if(fail && f.state.loads>=2) throw new Error('fixture transient market-refresh RPC outage');return original(...args);};
    const run=await runStrategy('perp-maker',f,{stopAfter:2});
    cases.push({fail,ordersPlaced:f.state.placements.length,cancels:f.state.cancellations,shutdowns:f.state.shutdowns,run});
  }
  assert.equal(cases[0].ordersPlaced,2);assert.equal(cases[0].cancels.length,2);
  assert.equal(cases[1].ordersPlaced,2);assert.equal(cases[1].cancels.length,0);assert.equal(cases[1].run.exit,1);
  return {cases,scope:'Original maker main, requireMarket, order placement and cancellation helpers; only the third registry read fails. Successful quote receipts are fixture responses, not live resting orders.'};
}
async function test008() {
  const cases=[];
  for(const fail of [false,true]) {
    const f=fixture();const other=market('ETH');other.info.poolAddress='0x0000000000000000000000000000000000000011';
    f.ctx.config.symbol='';
    f.state.positions.push({symbol:other.symbol,side:'long',contracts:1});
    f.exchange.loadMarkets=async()=>({[f.state.m.symbol]:f.state.m.market,[other.symbol]:other.market});
    let reads=0;
    f.exchange.client.getMarginAccount=async()=>{reads++;if(fail&&reads===1)throw new Error('fixture one-shot health read timeout');return {...marginState(),equity:110n*ONE,imReq:200n*ONE,mmReq:100n*ONE,marginStatus:'MarginCall'};};
    const run=await runStrategy('perp-guard',f,{stopAfter:1});
    cases.push({fail,healthReads:reads,reductionOrders:f.state.placements.length,shutdowns:f.state.shutdowns,run});
  }
  assert.equal(cases[0].healthReads,2);assert.equal(cases[0].reductionOrders,2);
  assert.equal(cases[1].healthReads,1);assert.equal(cases[1].reductionOrders,0);assert.equal(cases[1].run.exit,1);
  return {cases,scope:'Original guard main/watchList, marginSnapshot, positionIn, closePosition and placePerp. One transient health-read failure injected before the per-market try/catch.'};
}
async function test009() {
  const cases=[];
  for(const fail of [false,true]) {
    const f=fixture();f.state.positions=[];
    const place=f.exchange.trader.placePerpOrder;
    f.exchange.trader.placePerpOrder=async p=>{const result=await place(p);f.state.positions=[{symbol:f.state.m.symbol,side:p.isBid?'long':'short',contracts:.5}];return result;};
    f.exchange.client.getPerpState=async()=>{if(fail)throw new Error('fixture fresh funding RPC read fails');return {fundingRate:-100000000000000n,fundingWindowSec:28800,fundingIntervalSec:3600};};
    const view=await Core.liveFunding(f.exchange,f.state.m);
    const run=await runStrategy('perp-funding',f,{stopAfter:1});
    cases.push({freshReadFailed:fail,view,orders:f.state.placements,run});
  }
  assert.equal(cases[0].view.paidSide,'long');assert.equal(cases[1].view.paidSide,'short');
  assert.equal(cases[1].view.known,true);
  assert.equal(cases[0].orders[0].isBid,true);assert.equal(cases[1].orders[0].isBid,false);
  return {cases,scope:'Original liveFunding/fundingApr and complete funding strategy. Indexed positive rate and newer negative rate are controlled fixtures; failure returns old indexed rate with known:true and allows an entry.'};
}

async function test010() {
  const f=facade(); const requests=[];
  f.exchange.engines.get(50383).listFundingRateHistory=async(pool,opts)=>{
    requests.push({pool,...opts});
    return [1,2].filter(timestamp=>timestamp>=opts.from).map(timestamp=>({timestamp,
      indexPrice:String(raw(100)),markPrice:String(raw(100)),fundingRate:'100000000000000',fundingWindowSec:28800}));
  };
  const since=1500;
  const rows=await f.exchange.fetchFundingRateHistory(f.m.symbol,since,100);
  assert.equal(requests[0].from,1); assert.equal(rows[0].timestamp,1000);
  const control=await f.exchange.fetchFundingRateHistory(f.m.symbol,2000,100);
  assert.ok(control.every(r=>r.timestamp>=2000));
  return {since,requests,rows,control,scope:'Original SDK funding history method and mapping; controlled indexer rows. Trade-history analogue reviewed in source only.'};
}
async function test011() {
  const cases=[];
  for(const priceable of [true,false]) {
    const f=fixture();
    f.exchange.client.previewPerpClosePnl=async()=>priceable?{priceable:true,closedQuantity:100000000n}:{priceable:false};
    const result=await Core.closePosition(f.ctx,f.state.m,A);
    cases.push({priceable,result,orders:f.state.placements});
  }
  assert.equal(cases[0].orders.length,1);assert.equal(cases[1].orders.length,0);
  return {cases,scope:'Original closePosition/placePerp; position and book remain available. No venue acceptance or oracle outage was simulated on chain.'};
}
async function test012() {
  const f=fixture(); let currentPosition=100000000n;
  f.exchange.fetchOrderBook=async()=>{currentPosition=0n;return {bids:[[100,10]],asks:[[100,10]]};};
  const result=await Core.closePosition(f.ctx,f.state.m,A);
  assert.equal(currentPosition,0n);assert.equal(f.state.placements.length,1);
  assert.equal(f.state.placements[0].isBid,false);assert.equal(f.state.placements[0].quantity,100000000n);
  assert.equal(f.state.placements[0].reduceOnly,undefined);
  return {currentPositionAtWrite:currentPosition,result,orders:f.state.placements,
    scope:'Original close helper and order construction; controlled external flatten during book read. Proves outgoing ordinary sell; no live reversal or fill is claimed.'};
}
async function test013() {
  const f=fixture();const remaining=new Set(['2']);const requests=[];
  f.exchange.trader.cancelPerpStopOrders=async p=>{
    requests.push(p);
    if(p.orderIds.some(id=>!remaining.has(String(id))))throw new Error('fixture stale ID: batch reverts atomically');
    p.orderIds.forEach(id=>remaining.delete(String(id)));return {};
  };
  await assert.rejects(Core.cancelStops(f.ctx,f.state.m,['1','2']),/stale ID/);
  const afterFailedBatch=[...remaining];assert.deepEqual(afterFailedBatch,['2']);
  await Core.cancelStops(f.ctx,f.state.m,['2']);assert.equal(remaining.size,0);
  return {requests,afterFailedBatch,afterLiveOnlyControl:[...remaining],
    scope:'Original cleanup helper; registry all-or-nothing behavior modeled from SDK source contract. No deployed registry execution.'};
}
async function test014() {
  const f=fixture();f.state.m.market.active=false;
  const run=await runStrategy('perp-starter',f,{stopAfter:0});
  assert.equal(run.exit,1);assert.equal(f.state.placements.length,0);
  const resolved=await Core.requireMarket(f.exchange,f.state.m.display,{includeHalted:true});
  assert.equal(resolved.symbol,f.state.m.symbol);
  return {run,existingPositions:f.state.positions,controlSymbol:resolved.symbol,
    scope:'Original starter and market resolver; registry response active:false. Does not assert every close-only market maps to inactive.'};
}
async function test015() {
  const cases=[];
  for(const fail of [false,true]) {
    const f=fixture();
    f.exchange.client.getPerpHealthSnapshot=async()=>{if(fail)throw new Error('fixture RPC timeout');return {priceable:true,markPrice:raw(120)};};
    const run=await runStrategy('perp-starter',f,{stopAfter:0});
    assert.equal(run.exit,0);assert.equal(f.state.arms.length,1);
    cases.push({liveReadFailed:fail,rowMark:100,knownFixtureFreshMark:120,arms:f.state.arms,run});
  }
  assert.equal(cases[0].arms[0].triggerPrice,raw(122.4));assert.equal(cases[1].arms[0].triggerPrice,raw(102));
  return {cases,scope:'Original starter/liveMark/armBracket; read timeout and stale row controlled. Stop payload construction proven; registry acceptance not tested.'};
}
async function test016() {
  const saved={...process.env};
  try {
    process.env.NETWORK='hideki';process.env.CHAIN_ID='50312';
    for(const key of ['RPC_URL','WS_RPC_URL','INDEXER_URL','OWNER_ADDRESS','PRIVATE_KEY'])delete process.env[key];
    const config=Core.loadConfig();const chain=Core.makeChain(config);
    assert.equal(config.network,'hideki');assert.equal(chain.id,50312);assert.match(config.rpcUrl,/hideki/);
    delete process.env.CHAIN_ID;
    const control=Core.loadConfig();assert.equal(control.chainId,50383);
    return {config,chainId:chain.id,control,scope:'Original loadConfig/makeChain; environment controlled; no network or signer.'};
  } finally { for(const key of Object.keys(process.env))if(!(key in saved))delete process.env[key];Object.assign(process.env,saved); }
}
async function test017() {
  const cases=[];
  for(const side of ['short','shrt']) {
    const f=fixture();f.state.positions=[];f.ctx.config.dryRun=true;
    const run=await runStrategy('perp-starter',f,{env:{PERP_SIDE:side,DRY_RUN:'true'},stopAfter:0});
    assert.equal(run.exit,0);cases.push({suppliedSide:side,run});
  }
  assert.ok(cases[0].run.logs.some(l=>l.includes('| short 50 USDso')));
  assert.ok(cases[1].run.logs.some(l=>l.includes('| long 50 USDso')));
  return {cases,scope:'Original complete starter in dry-run with actual side parser; no order sent.'};
}
async function test018() {
  const inputs={PERP_LEVERAGE:'0',PERP_TAKE_PROFIT_PCT:'-5',PERP_TICK_MS:'-1'};
  const saved={...process.env};const accepted={};
  try {for(const [key,value] of Object.entries(inputs)){process.env[key]=value;accepted[key]=Core.envNum(key,2);}}
  finally {for(const key of Object.keys(process.env))if(!(key in saved))delete process.env[key];Object.assign(process.env,saved);}
  assert.deepEqual(accepted,{PERP_LEVERAGE:0,PERP_TAKE_PROFIT_PCT:-5,PERP_TICK_MS:-1});
  let eventLoopTurn=false; const pendingTurn=new Promise(resolve=>setTimeout(()=>{eventLoopTurn=true;resolve();},0));
  await Core.sleep(-1);const yieldedDuringNegativeSleep=eventLoopTurn;await pendingTurn;
  assert.equal(yieldedDuringNegativeSleep,false);
  return {inputs,accepted,yieldedDuringNegativeSleep,scope:'Original envNum and sleep; proves invalid input acceptance and no timer yield for negative sleep. No protocol validation or sustained hot-loop test.'};
}

async function hashFile(rel, base) {
  const text=await readFile(new URL(rel,base));
  return createHash('sha256').update(text).digest('hex');
}
for (const f of ['config.ts','exchange.ts','funding.ts','index.ts','margin.ts','markets.ts','operator.ts','orders.ts','stops.ts'])
  sourceHashes[`packages/perp-core/src/${f}`]=await hashFile(`packages/perp-core/src/${f}`,BOT);
const SDK=new URL('../node_modules/@somnia-chain/markets-sdk/',import.meta.url);
const sdkPkg=JSON.parse(await readFile(new URL('package.json',SDK),'utf8'));
assert.equal(sdkPkg.version,'0.32.1');
for (const f of ['dist/unified/exchange.js','src/unified/exchange.ts','dist/perp/margin.js','dist/perp/stops.d.ts'])
  sourceHashes[`@somnia-chain/markets-sdk@${sdkPkg.version}/${f}`]=await hashFile(f,SDK);
const tests={ '001':test001,'002':test002,'003':test003,'004':test004,'005':test005,'006':test006,'007':test007,'008':test008,'009':test009,
  '010':test010,'011':test011,'012':test012,'013':test013,'014':test014,'015':test015,'016':test016,'017':test017,'018':test018 };
await mkdir(new URL('../research/evidence/reproductions/',import.meta.url),{recursive:true});
for(const [id,test] of Object.entries(tests)) {
  if(process.argv[2]&&process.argv[2]!==id)continue;
  const record={id,runAt:new Date().toISOString(),node:process.version,sourceCommit:BOT_COMMIT,sdkVersion:sdkPkg.version,mode:'offline controlled reproduction of original upstream code'};
  try {record.evidence=await test();record.reproduced=true;}catch(error){record.reproduced=false;record.error=error.stack;process.exitCode=1;}
  await writeFile(new URL(`../research/evidence/reproductions/${id}.json`,import.meta.url),json(record)+'\n');
  console.log(`${id}: ${record.reproduced?'REPRODUCED':'FAILED'}${record.error?' '+record.error:''}`);
  results.push({id,reproduced:record.reproduced});
}
if(!process.argv[2])await writeFile(new URL('../research/evidence/reproduction-summary.json',import.meta.url),json({runAt:new Date().toISOString(),sourceCommit:BOT_COMMIT,sdkVersion:sdkPkg.version,node:process.version,results,sourceHashes})+'\n');
