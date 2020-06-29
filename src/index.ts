
export { Cluster, ClusterOptions } from './clusters/Cluster';
export { BaseClusterWorker } from './clusters/BaseClusterWorker';
export { ClusterWorkerIPC } from './clusters/ClusterWorkerIPC';
export { Service, ServiceOptions } from './services/Service';
export { BaseServiceWorker } from './services/BaseServiceWorker';
export { ServiceWorkerIPC } from './services/ServiceWorkerIPC';
export { MasterIPC } from './sharding/MasterIPC';
export { ShardManager, SharderOptions } from './sharding/ShardManager';
import { IPCEvents, SharderEvents } from './util/constants';
export { IPCEvents, SharderEvents };
export * as Util from './util/util';

export interface IPCEvent {
	op: IPCEvents;
	d?: any;
}

export interface IPCResult {
	success: boolean;
	d: unknown;
}

export interface IPCError {
	name: string;
	message: string;
	stack?: string;
}

export interface IPCEvalResults {
	results: unknown[];
	errors: IPCError[];
}

export interface IPCFetchResults<T> {
	/** Found documents in JSON format. For access to Eris getters and methods you must pass the data to the relevant Eris constructor */
	result: T;
	/** If a clusterId was not specified, and not getting a single guild, this contains any errors that occurred */
	errors?: IPCError[];
}

export interface ProcessStats {
	/** https://nodejs.org/api/process.html#process_process_memoryusage */
	memory: NodeJS.MemoryUsage;
	/** https://nodejs.org/api/process.html#process_process_cpuusage_previousvalue */
	cpu: NodeJS.CpuUsage;
	discord?: {
		guilds: number;
		/** The current latency between the shard and Discord, in milliseconds */
		latencies: number[];
		/** How long in milliseconds the bot has been up for */
		uptime: number;
	};
	[key: string]: any;
}

export interface MeganeStats {
	clusters: Record<number, ProcessStats>;
	services: Record<string, ProcessStats>;
	manager: ProcessStats;
	[key: string]: any;
}
