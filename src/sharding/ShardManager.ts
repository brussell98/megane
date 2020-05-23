import { EventEmitter } from 'events';
import { cpus } from 'os';
import { isMaster, setupMaster } from 'cluster';
import { Cluster } from '../clusters/Cluster';
import { BaseClusterWorker } from '../clusters/BaseClusterWorker';
import { Service, ServiceOptions } from '../services/Service';
import { BaseServiceWorker } from '../services/BaseServiceWorker';
import { MasterIPC } from './MasterIPC';
import { SharderEvents, IPCEvents } from '../util/constants';
import { ClientOptions } from 'eris';
import { MeganeStats, IPCResult } from '../';
import fetch from 'node-fetch';

export interface SharderOptions {
	/** Path to the js file for clusters to run */
	path: string;
	/** Discord bot token */
	token: string;
	/** Number of guilds each shard should have (at initial sharding) (Only used if shardCount is set to 'auto') */
	guildsPerShard?: number;
	/** Number of shards to create */
	shardCount?: number | 'auto';
	/** Maximum number of clusters to create */
	clusterCount?: number;
	/** Options to pass to the Eris client constructor */
	clientOptions?: ClientOptions;
	/** How long to wait for a cluster to connect before throwing an error, multiplied by the number of shards */
	timeout?: number;
	/** An array of arguments to pass to the cluster node processes */
	nodeArgs?: string[];
	/** The socket/port for IPC to run on */
	ipcSocket?: string | number;
	/** How often to update stats (in milliseconds) */
	statsInterval?: number;
}

interface SessionObject {
	url: string;
	shards: number;
	session_start_limit: {
		total: number;
		remaining: number;
		reset_after: number;
	};
}

interface ClusterShardInfo {
	/** First 0-indexed shard for this cluster */
	first: number;
	/** Last 0-indexed shard for this cluster */
	last: number;
	/** Total number of shards across all clusters */
	total: number;
}

export class ShardManager extends EventEmitter {
	/** A map of clusters by their id */
	public clusters?: Map<number, Cluster>;
	/** A map of services by their name */
	public services?: Map<string, Service>;
	/** A generic store of data used by all workers */
	public store = new Map<string, any>();
	/** Path to the js file for clusters to run */
	public path: string;
	public token: string;
	/** The intended number of guilds that each shard should have. This is only used when shardCount is set to auto. Do not set this to a low number or you may greatly overshoot your shard count and end up with hundreds of empty shards */
	public guildsPerShard: number;
	/** Creates a specific number of shards instead of using auto-sharding */
	public shardCount: number | 'auto';
	/** The number of clusters to create. By default this is the number of CPUs */
	public clusterCount: number;
	/** Eris client constructor options */
	public clientOptions: ClientOptions;
	/** Time to wait for clusters to start */
	public timeout: number;
	public nodeArgs?: string[];
	public ipcSocket: string | number;
	public readonly ipc?: MasterIPC;
	/** Megane manager, cluster, and service stats */
	public stats?: MeganeStats;
	public statsInterval: number;

	public constructor(options: SharderOptions) {
		super();

		this.path = options.path!;
		this.token = options.token!;
		this.guildsPerShard = options.guildsPerShard || 1500;
		this.shardCount = options.shardCount || 'auto';
		this.clusterCount = options.clusterCount || cpus().length;
		this.clientOptions = options.clientOptions || { };
		this.timeout = options.timeout || 30e3;
		this.nodeArgs = options.nodeArgs;
		this.ipcSocket = options.ipcSocket || 8191;
		this.statsInterval = options.statsInterval || 60e3;

		if (isMaster) {
			this.clusters = new Map<number, Cluster>();
			this.services = new Map<string, Service>();
			this.ipc = new MasterIPC(this);
			this.stats = {
				clusters: { },
				services: { },
				manager: {
					memory: process.memoryUsage(),
					cpu: process.cpuUsage()
				}
			};

			setInterval(async () => {
				try {
					this.debug('Updating stats');
					const responses = await this.ipc!.broadcast({ op: IPCEvents.GET_STATS }, { receptive: true }) as IPCResult[];
					for (const response of responses) {
						const data = response.d as any;
						if (typeof data.source === 'number')
							this.stats!.clusters[data.source] = data.stats;
						else
							this.stats!.services[data.source] = data.stats;
					}

					this.stats!.manager = {
						memory: process.memoryUsage(),
						cpu: process.cpuUsage()
					};

					this.emit(SharderEvents.STATS_UPDATED, this.stats);
				} catch (error) {
					this.emit(SharderEvents.ERROR, error);
				}
			}, this.statsInterval);
		}
	}

	/**
	 * On master: Creates clusters and forks the process
	 *
	 * On workers: Loads the provided file implementing a worker and calls init()
	 */
	public async spawn() {
		if (isMaster) {
			if (this.shardCount === 'auto') {
				const { shards } = await this.getBotGateway();
				this.debug(`Bot gateway recommended ${shards} shards`);

				this.shardCount = Math.ceil(shards * (1000 / this.guildsPerShard));
				this.debug(`Using ${this.shardCount} shards with ${this.guildsPerShard} guilds per shard`);
			}

			if (this.shardCount < this.clusterCount)
				this.clusterCount = this.shardCount;
			this.debug(`Creating ${this.clusterCount} clusters across ${cpus().length} CPU cores`);

			const shardInfo = this.clusterShards();

			if (this.nodeArgs)
				setupMaster({ execArgv: this.nodeArgs });

			const failed: Cluster[] = [];

			for (let i = 0; i < this.clusterCount; i++) {
				this.debug(`Creating cluster ${i} with ${shardInfo[i].last - shardInfo[i].first + 1} shards (${shardInfo[i].first}-${shardInfo[i].last})`);
				const cluster = new Cluster(this, { id: i, shards: shardInfo[i] });

				this.clusters!.set(i, cluster);

				try {
					await cluster.spawn();
				} catch {
					this.emit(SharderEvents.ERROR, new Error(`Cluster ${cluster.id} failed to start`));
					failed.push(cluster);
				}
			}

			if (failed.length)
				await this.retryFailed(failed);
		} else {
			// When the process is forked, load the worker module
			let worker;
			if (process.env.SERVICE_NAME) {
				const WorkerRequire = await import(String(process.env.SERVICE_PATH));
				const Worker = WorkerRequire.default ? WorkerRequire.default : WorkerRequire;
				worker = new Worker(this) as BaseServiceWorker;
			} else {
				const WorkerRequire = await import(this.path);
				const Worker = WorkerRequire.default ? WorkerRequire.default : WorkerRequire;
				worker = new Worker(this) as BaseClusterWorker;
			}

			return worker.init();
		}
	}

	/** Restarts all clusters */
	public async restartAll() {
		if (!isMaster)
			throw new Error('This can only be called on the master process');

		this.debug('Restarting all clusters');

		for (const cluster of this.clusters!.values())
			await cluster.respawn();
	}

	/** Restarts a specific cluster */
	public async restart(clusterId: number) {
		if (!isMaster)
			throw new Error('This can only be called on the master process');

		const cluster = this.clusters!.get(clusterId);
		if (!cluster)
			throw new Error('No cluster with that id found');

		this.debug(`Restarting cluster ${clusterId}`);

		await cluster.respawn();
	}

	private async retryFailed(clusters: Cluster[]): Promise<void> {
		if (!isMaster)
			throw new Error('This can only be called on the master process');

		this.debug(`Restarting ${clusters.length} failed clusters`);
		const failed: Cluster[] = [];

		for (const cluster of clusters)
			try {
				this.debug('Restarting cluster ' + cluster.id);
				await cluster.respawn();
			} catch {
				this.debug(`Cluster ${cluster.id} failed to start again`);
				failed.push(cluster);
			}

		if (failed.length)
			return this.retryFailed(failed);
	}

	/** Register and spawn a service */
	public async registerService(path: string, options: ServiceOptions) {
		if (!isMaster)
			throw new Error('This can only be called on the master process');

		if (!path || !options || !options.name || this.services!.has(options.name))
			throw new Error('You must provide a path to the worker and a unique name when registering a service');

		const service = new Service(this, path, options);

		this.services!.set(options.name, service);

		try {
			await service.spawn();
		} catch {
			throw new Error('Service worker failed to start');
		}
	}

	public async eval(script: string) {
		// eslint-disable-next-line no-eval
		return await eval(script);
	}

	/** Get the bot gateway response from Discord */
	public async getBotGateway(): Promise<SessionObject> {
		if (!this.token)
			throw new Error('No token was provided!');

		this.debug('Getting bot gateway');

		const res = await fetch('https://discordapp.com/api/v7/gateway/bot', {
			method: 'GET',
			headers: { Authorization: `Bot ${this.token.replace(/^Bot /, '')}` }
		});

		if (res.ok)
			return res.json();

		throw new Error(res.statusText);
	}

	private clusterShards(): ClusterShardInfo[] {
		const clusters: ClusterShardInfo[] = [];
		const shardsPerCluster = Math.floor(<number>this.shardCount / this.clusterCount);
		const leftovers = <number>this.shardCount % this.clusterCount;

		let current = 0;
		for (let i = 0; i < this.clusterCount; i++) {
			clusters.push({
				first: current,
				last: current + shardsPerCluster - 1 + (leftovers > i ? 1 : 0),
				total: <number>this.shardCount
			});
			current += shardsPerCluster + (leftovers > i ? 1 : 0);
		}

		return clusters;
	}

	private debug(message: string) {
		this.emit(SharderEvents.DEBUG, message);
	}
}

export interface ShardManager {
	/** Emitted when a service spawns */
	on(event: SharderEvents.SERVICE_SPAWN, listener: (service: Service) => void): this;
	/** Emitted when a service becomes ready */
	on(event: SharderEvents.SERVICE_READY, listener: (service: Service) => void): this;
	/** Emitted when a cluster spawns */
	on(event: SharderEvents.CLUSTER_SPAWN, listener: (cluster: Cluster) => void): this;
	/** Emitted when a cluster becomes ready */
	on(event: SharderEvents.CLUSTER_READY, listener: (cluster: Cluster) => void): this;
	/** Emitted when a shard connects (before ready) */
	on(event: SharderEvents.SHARD_CONNECTED, listener: (clusterId: number, shardId: number) => void): this;
	/** Emitted the first time a shard becomes ready */
	on(event: SharderEvents.SHARD_READY, listener: (clusterId: number, shardId: number) => void): this;
	/** Emitted when a shard resumes */
	on(event: SharderEvents.SHARD_RESUMED, listener: (clusterId: number, shardId: number) => void): this;
	/** Emitted when a shard disconnects */
	on(event: SharderEvents.SHARD_DISCONNECT, listener: (clusterId: number, shardId: number, error: Error) => void): this;
	/** Emitted when the manager updates the statistics object */
	on(event: SharderEvents.STATS_UPDATED, listener: (stats: MeganeStats) => void): this;
	/** Emits debug messages */
	on(event: SharderEvents.DEBUG, listener: (message: string) => void): this;
	/** Emitted when there is an error */
	on(event: SharderEvents.ERROR, listener: (error: Error, clusterId: number | undefined, shardId: number | undefined) => void): this;
	on(event: any, listener: (...args: any[]) => void): this;

	/** Emitted when a service spawns */
	once(event: SharderEvents.SERVICE_SPAWN, listener: (service: Service) => void): this;
	/** Emitted when a service becomes ready */
	once(event: SharderEvents.SERVICE_READY, listener: (service: Service) => void): this;
	/** Emitted when a cluster spawns */
	once(event: SharderEvents.CLUSTER_SPAWN, listener: (cluster: Cluster) => void): this;
	/** Emitted when a cluster becomes ready */
	once(event: SharderEvents.CLUSTER_READY, listener: (cluster: Cluster) => void): this;
	/** Emitted when a shard connects (before ready) */
	once(event: SharderEvents.SHARD_CONNECTED, listener: (clusterId: number, shardId: number) => void): this;
	/** Emitted the first time a shard becomes ready */
	once(event: SharderEvents.SHARD_READY, listener: (clusterId: number, shardId: number) => void): this;
	/** Emitted when a shard resumes */
	once(event: SharderEvents.SHARD_RESUMED, listener: (clusterId: number, shardId: number) => void): this;
	/** Emitted when a shard disconnects */
	once(event: SharderEvents.SHARD_DISCONNECT, listener: (clusterId: number, shardId: number, error: Error) => void): this;
	/** Emitted when the manager updates the statistics object */
	once(event: SharderEvents.STATS_UPDATED, listener: (stats: MeganeStats) => void): this;
	/** Emits debug messages */
	once(event: SharderEvents.DEBUG, listener: (message: string) => void): this;
	/** Emitted when there is an error */
	once(event: SharderEvents.ERROR, listener: (error: Error, clusterId: number | undefined, shardId: number | undefined) => void): this;
	once(event: any, listener: (...args: any[]) => void): this;

	/** Emitted when a service spawns */
	off(event: SharderEvents.SERVICE_SPAWN, listener: (service: Service) => void): this;
	/** Emitted when a service becomes ready */
	off(event: SharderEvents.SERVICE_READY, listener: (service: Service) => void): this;
	/** Emitted when a cluster spawns */
	off(event: SharderEvents.CLUSTER_SPAWN, listener: (cluster: Cluster) => void): this;
	/** Emitted when a cluster becomes ready */
	off(event: SharderEvents.CLUSTER_READY, listener: (cluster: Cluster) => void): this;
	/** Emitted when a shard connects (before ready) */
	off(event: SharderEvents.SHARD_CONNECTED, listener: (clusterId: number, shardId: number) => void): this;
	/** Emitted the first time a shard becomes ready */
	off(event: SharderEvents.SHARD_READY, listener: (clusterId: number, shardId: number) => void): this;
	/** Emitted when a shard resumes */
	off(event: SharderEvents.SHARD_RESUMED, listener: (clusterId: number, shardId: number) => void): this;
	/** Emitted when a shard disconnects */
	off(event: SharderEvents.SHARD_DISCONNECT, listener: (clusterId: number, shardId: number, error: Error) => void): this;
	/** Emitted when the manager updates the statistics object */
	off(event: SharderEvents.STATS_UPDATED, listener: (stats: MeganeStats) => void): this;
	/** Emits debug messages */
	off(event: SharderEvents.DEBUG, listener: (message: string) => void): this;
	/** Emitted when there is an error */
	off(event: SharderEvents.ERROR, listener: (error: Error, clusterId: number | undefined, shardId: number | undefined) => void): this;
	off(event: any, listener: (...args: any[]) => void): this;

	/** Emitted when a service spawns */
	emit(event: SharderEvents.SERVICE_SPAWN, service: Service): this;
	/** Emitted when a service becomes ready */
	emit(event: SharderEvents.SERVICE_READY, service: Service): this;
	/** Emitted when a cluster spawns */
	emit(event: SharderEvents.CLUSTER_SPAWN, cluster: Cluster): this;
	/** Emitted when a cluster becomes ready */
	emit(event: SharderEvents.CLUSTER_READY, cluster: Cluster): this;
	/** Emitted when a shard connects (before ready) */
	emit(event: SharderEvents.SHARD_CONNECTED, clusterId: number, shardId: number): boolean;
	/** Emitted the first time a shard becomes ready */
	emit(event: SharderEvents.SHARD_READY, clusterId: number, shardId: number): boolean;
	/** Emitted when a shard resumes */
	emit(event: SharderEvents.SHARD_RESUMED, clusterId: number, shardId: number): boolean;
	/** Emitted when a shard disconnects */
	emit(event: SharderEvents.SHARD_DISCONNECT, clusterId: number, shardId: number, error: Error): boolean;
	/** Emitted when the manager updates the statistics object */
	emit(event: SharderEvents.STATS_UPDATED, stats: MeganeStats): this;
	/** Emits debug messages */
	emit(event: SharderEvents.DEBUG, message: string): boolean;
	/** Emitted when there is an error */
	emit(event: SharderEvents.ERROR, error: Error, clusterId: number | undefined, shardId: number | undefined): boolean;
	emit(event: any, ...args: any[]): boolean;
}
