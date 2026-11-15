import type { Lane, ServerDatabase } from '../storage/index.js';

export interface RetentionWorkerOptions {
    database: ServerDatabase;
    deviceIds: string[];
    intervalMs?: number;
    minAgeSeconds?: number;
    keepLast?: number;
    batchSize?: number;
    lanesPerTick?: number;
    onSweep?: (summary: { lanes: number; compacted: number; bytes: number; busy: number; blocked: number; blockedReasons: Record<string,number>; blockedSequences: number[]; durationMs: number }) => void;
    onError?: (error: unknown) => void;
}

/** Opt-in bounded sweeps. Lane locks are shared across server processes. */
export class RetentionWorker {
    readonly #interval: number;
    readonly #minAge: number;
    readonly #keep: number;
    readonly #batch: number;
    readonly #budget: number;
    #timer?: ReturnType<typeof setInterval>;
    #running?: Promise<void>;
    #cursor: [string, string] = ['', ''];
    #stopped = false;
    constructor(readonly options: RetentionWorkerOptions) {
        this.#interval=options.intervalMs ?? 60_000; this.#minAge=options.minAgeSeconds ?? 86_400;
        this.#keep=options.keepLast ?? 128; this.#batch=options.batchSize ?? 100; this.#budget=options.lanesPerTick ?? 8;
        if (![this.#interval,this.#minAge,this.#keep,this.#batch,this.#budget].every(Number.isSafeInteger) || this.#interval<100 || this.#minAge<0 || this.#keep<0 || this.#batch<1 || this.#batch>1000 || this.#budget<1 || this.#budget>1000 || options.deviceIds.some(id=>!id || id.length>2048)) throw new RangeError('Invalid retention worker configuration');
    }
    start():void {
        if (this.#timer || this.#stopped) throw new Error('Retention worker already started or stopped');
        this.#timer=setInterval(()=>{ void this.tick().catch(error=>this.options.onError?.(error)); },this.#interval);
        this.#timer.unref();
    }
    tick():Promise<void> {
        if (this.#stopped) return Promise.resolve();
        if (this.#running) return this.#running;
        const run=this.#sweep(); this.#running=run;
        void run.finally(()=>{if(this.#running===run)this.#running=undefined;}).catch(()=>{});
        return run;
    }
    async #sweep():Promise<void> {
        if (!this.options.deviceIds.length) return;
        const rows=await this.options.database.pool.query<{device_id:string;lane:Lane}>("SELECT device_id,lane FROM lane_counters WHERE device_id=ANY($1::text[]) ORDER BY ((device_id,lane)<=($2,$3)),device_id,lane LIMIT $4",[this.options.deviceIds,this.#cursor[0],this.#cursor[1],this.#budget]);
        const started=Date.now(); const summary:{lanes:number;compacted:number;bytes:number;busy:number;blocked:number;blockedReasons:Record<string,number>;blockedSequences:number[];durationMs:number}={lanes:0,compacted:0,bytes:0,busy:0,blocked:0,blockedReasons:{},blockedSequences:[],durationMs:0};
        for(const row of rows.rows) {
            if(this.#stopped) break;
            const result=await this.options.database.compactCommandLane({deviceId:row.device_id,lane:row.lane,minAgeSeconds:this.#minAge,keepLast:this.#keep,batchSize:this.#batch,includeMetrics:true});
            this.#cursor=[row.device_id,row.lane];summary.lanes++;summary.compacted+=result.compacted;if(result.busy)summary.busy++;if(result.blocked){summary.blocked++;summary.blockedReasons[result.blocked]=(summary.blockedReasons[result.blocked]??0)+1;}if(result.metrics){summary.bytes+=result.metrics.bytes;if(result.metrics.blockedSequence!==undefined)summary.blockedSequences.push(result.metrics.blockedSequence);}
        }
        summary.durationMs=Date.now()-started; this.options.onSweep?.(summary);
    }
    async stop():Promise<void> { this.#stopped=true; if(this.#timer)clearInterval(this.#timer); this.#timer=undefined; await this.#running; }
}
