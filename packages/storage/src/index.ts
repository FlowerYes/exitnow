import type {MongoClient,ClientSession,Collection} from 'mongodb';

type StateDocument<T>={_id:string;revision:number;state:T};
function label(error:unknown,name:string){return typeof error==='object'&&error!==null&&'hasErrorLabel' in error&&typeof error.hasErrorLabel==='function'&&error.hasErrorLabel(name)}
async function abort(session:ClientSession){if(session.inTransaction())await session.abortTransaction().catch(()=>{})}

/** One authoritative state document per collection. Requires a replica set or sharded deployment. */
export class MongoStateRepository<T> {
 private collection:Collection<StateDocument<T>>;
 constructor(private client:MongoClient,dbName:string,collection:string,private initial:T){this.collection=client.db(dbName).collection<StateDocument<T>>(collection)}
 async initialize(){await this.collection.updateOne({_id:'state'},{$setOnInsert:{revision:0,state:structuredClone(this.initial)}},{upsert:true,writeConcern:{w:'majority'}})}
 async transact<R>(fn:(state:T)=>Promise<R>):Promise<R>{
  for(let attempt=0;attempt<3;attempt++){
   const session=this.client.startSession();let callbackStarted=false;
   try{
    session.startTransaction({readConcern:{level:'snapshot'},writeConcern:{w:'majority'},readPreference:'primary',maxCommitTimeMS:10000});
    // Acquire the write lock before invoking application code, including any external side effect.
    const doc=await this.collection.findOneAndUpdate({_id:'state'},{$inc:{revision:1}},{session,returnDocument:'after',includeResultMetadata:false,maxTimeMS:10000});
    if(!doc)throw Error('Mongo state repository is not initialized');
    callbackStarted=true;
    const state=structuredClone(doc.state);
    const result=await fn(state);
    const saved=await this.collection.updateOne({_id:'state',revision:doc.revision},{$set:{state}},{session,maxTimeMS:10000});
    if(saved.matchedCount!==1)throw Error('Mongo state revision conflict');
    // Never replay fn: an unknown commit only retries the same commit command.
    for(let commitAttempt=0;;commitAttempt++){
     try{await session.commitTransaction();break}catch(error){if(!label(error,'UnknownTransactionCommitResult')||commitAttempt>=2)throw error}
    }
    return structuredClone(result);
   }catch(error){
    await abort(session);
    if(!callbackStarted&&label(error,'TransientTransactionError')&&attempt<2)continue;
    throw error;
   }finally{await session.endSession()}
  }
  throw Error('Mongo transaction retry exhausted');
 }
}
