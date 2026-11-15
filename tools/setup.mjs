import { spawnSync } from 'node:child_process';
import { mkdirSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
const root=fileURLToPath(new URL('../',import.meta.url));
const upstream=fileURLToPath(new URL('../research/upstream/dreamdex-bot-kit',import.meta.url));
const commit='4e75896896e024c03e2033d5920514f249998cd6';
function git(args,cwd=root){const r=spawnSync('git',args,{cwd,encoding:'utf8'});if(r.status!==0)throw Error(r.stderr||r.stdout||'git failed');return r.stdout.trim();}
mkdirSync(fileURLToPath(new URL('../research/upstream/',import.meta.url)),{recursive:true});
if(!existsSync(upstream)){
  git(['clone','--no-checkout','https://github.com/somnia-chain/dreamdex-bot-kit.git',upstream]);
  git(['checkout','--detach',commit],upstream);
}
const actual=git(['rev-parse','HEAD'],upstream);
if(actual!==commit)throw Error(`Expected upstream ${commit}, found ${actual}. Use a separate clean upstream checkout.`);
const dirty=git(['status','--porcelain','--untracked-files=no'],upstream);
if(dirty)throw Error('The upstream checkout is modified. Reproductions require unmodified source.');
console.log(`Pinned official bot kit verified at ${actual}. No upstream dependency scripts or trading strategies were run.`);
