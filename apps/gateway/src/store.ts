import type {MongoClient} from 'mongodb';
import {MongoStateRepository} from '../../../packages/storage/src/index.ts';
import {readFile,writeFile,rename,mkdir} from 'node:fs/promises';
import {dirname} from 'node:path';
import {emptyState,type State} from './state.ts';
export interface Store {transaction<T>(fn:(s:State)=>Promise<T>|T):Promise<T>}
export class MongoStore implements Store {
 readonly repository:MongoStateRepository<State>;
 constructor(client:MongoClient,dbName='exitnow'){this.repository=new MongoStateRepository(client,dbName,'gateway_state',emptyState());}
 initialize(){return this.repository.initialize();}
 transaction<T>(fn:(s:State)=>Promise<T>|T):Promise<T>{return this.repository.transact(async s=>fn(s));}
}
// Explicitly replay-only: never selected as a fallback when MongoDB fails.
export class ReplayStore implements Store {state=emptyState();private tail:Promise<unknown>=Promise.resolve();transaction<T>(fn:(s:State)=>Promise<T>|T):Promise<T>{const task=this.tail.then(async()=>{const draft=structuredClone(this.state);const value=await fn(draft);this.state=draft;return value;});this.tail=task.catch(()=>{});return task;}}

// Single-process replay persistence. Live concurrency belongs to MongoStore.
export class FileReplayStore extends ReplayStore {
 constructor(readonly path:string){super();}
 async load(){try{this.state=JSON.parse(await readFile(this.path,'utf8')) as State;}catch(e){if((e as NodeJS.ErrnoException).code!=='ENOENT')throw e;}}
 override transaction<T>(fn:(s:State)=>Promise<T>|T):Promise<T>{return super.transaction(async s=>{const value=await fn(s);await mkdir(dirname(this.path),{recursive:true});const temporary=`${this.path}.tmp`;await writeFile(temporary,JSON.stringify(s),{mode:0o600});await rename(temporary,this.path);return value;});}
}
