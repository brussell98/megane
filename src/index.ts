
export { Cluster, ClusterOptions } from './clusters/Cluster';
export { BaseClusterWorker } from './clusters/BaseClusterWorker';
export { ClusterWorkerIPC } from './clusters/ClusterWorkerIPC';
export { Service, ServiceOptions } from './services/Service';
export { BaseServiceWorker } from './services/BaseServiceWorker';
export { ServiceWorkerIPC } from './services/ServiceWorkerIPC';
export { MasterIPC } from './sharding/MasterIPC';
export { ShardManager, SharderOptions } from './sharding/ShardManager';
export { IPCEvents, SharderEvents } from './util/constants';
export * as Util from './util/util';

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
	results: any[];
	errors: IPCError[];
}
