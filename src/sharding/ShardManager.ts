import { EventEmitter } from 'events';
import { cpus } from 'os';
import { isMaster, setupMaster } from 'cluster';
import { Cluster } from '../clusters/Cluster';
import { BaseClusterWorker } from '../clusters/BaseClusterWorker';
import { MasterIPC } from './MasterIPC';
import { SharderEvents } from '../util/constants';
import { ClientOptions } from 'eris';
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
	/** How long to wait for a cluster to connect before throwing an error, multiplied by the number of thousands of guilds */
	timeout?: number;
	/** An array of arguments to pass to the cluster node processes */
	nodeArgs?: string[];
	/** The socket/port for IPC to run on */
	ipcSocket?: string | number;
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
	first: number;
	last: number;
	total: number;
}

export class ShardManager extends EventEmitter {
	public clusters = new Map<number, Cluster>();
	public store = new Map<string, any>();
	public path: string;
	public token: string;
	public guildsPerShard: number;
	public shardCount: number | 'auto';
	public clusterCount: number;
	public clientOptions: ClientOptions;
	public timeout: number;
	public nodeArgs?: string[];
	public ipcSocket: string | number;
	public readonly ipc?: MasterIPC;

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

		if (isMaster)
			this.ipc = new MasterIPC(this);
	}

	/**
	 * On master: Creates clusters and forks the process
	 *
	 * On workers: Loads the provided file implementing a BaseClusterWorker and calls init()
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
				this.debug(`Creating cluster ${i} with ${shardInfo[i].total} shards (${shardInfo[i].first}-${shardInfo[i].last})`);
				const cluster = new Cluster(this, { id: i, shards: shardInfo[i] });

				this.clusters.set(i, cluster);

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
			// When a cluster is forked, load the worker module
			const ClusterWorkerRequire = await import(this.path);
			const ClusterWorker = ClusterWorkerRequire.default ? ClusterWorkerRequire.default : ClusterWorkerRequire;
			const worker = new ClusterWorker(this) as BaseClusterWorker;
			return worker.init();
		}
	}

	public async restartAll() {
		this.debug('Restarting all clusters');

		for (const cluster of this.clusters.values())
			await cluster.respawn();
	}

	public async restart(clusterId: number) {
		const cluster = this.clusters.get(clusterId);
		if (!cluster)
			throw new Error('No cluster with that id found');

		this.debug(`Restarting cluster ${clusterId}`);

		await cluster.respawn();
	}

	private async retryFailed(clusters: Cluster[]): Promise<void> {
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

	public async eval(script: string) {
		// eslint-disable-next-line no-eval
		return await eval(script);
	}

	private async getBotGateway(): Promise<SessionObject> {
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
		const clusters = [];
		const shardsPerCluster = Math.floor(<number>this.shardCount / this.clusterCount);
		const leftovers = <number>this.shardCount % this.clusterCount;

		let current = 0;
		for (let i = 0; i < this.clusterCount; i++) {
			clusters.push({
				first: current,
				last: current + shardsPerCluster - 1 + (leftovers > i ? 1 : 0),
				total: shardsPerCluster + (leftovers > i ? 1 : 0)
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
	/** Emitted when a cluster spawns */
	on(event: SharderEvents.SPAWN, listener: (cluster: Cluster) => void): this;
	/** Emitted when a cluster becomes ready */
	on(event: SharderEvents.READY, listener: (cluster: Cluster) => void): this;
	/** Emitted when a shard connects (before ready) */
	on(event: SharderEvents.SHARD_CONNECTED, listener: (clusterId: number, shardId: number) => void): this;
	/** Emitted the first time a shard becomes ready */
	on(event: SharderEvents.SHARD_READY, listener: (clusterId: number, shardId: number) => void): this;
	/** Emitted when a shard resumes */
	on(event: SharderEvents.SHARD_RESUMED, listener: (clusterId: number, shardId: number) => void): this;
	/** Emitted when a shard disconnects */
	on(event: SharderEvents.SHARD_DISCONNECT, listener: (clusterId: number, shardId: number, error: Error) => void): this;
	/** Emits debug messages */
	on(event: SharderEvents.DEBUG, listener: (message: string) => void): this;
	/** Emitted when there is an error */
	on(event: SharderEvents.ERROR, listener: (error: Error, clusterId: number | undefined, shardId: number | undefined) => void): this;
	on(event: any, listener: (...args: any[]) => void): this;

	/** Emitted when a cluster spawns */
	once(event: SharderEvents.SPAWN, listener: (cluster: Cluster) => void): this;
	/** Emitted when a cluster becomes ready */
	once(event: SharderEvents.READY, listener: (cluster: Cluster) => void): this;
	/** Emitted when a shard connects (before ready) */
	once(event: SharderEvents.SHARD_CONNECTED, listener: (clusterId: number, shardId: number) => void): this;
	/** Emitted the first time a shard becomes ready */
	once(event: SharderEvents.SHARD_READY, listener: (clusterId: number, shardId: number) => void): this;
	/** Emitted when a shard resumes */
	once(event: SharderEvents.SHARD_RESUMED, listener: (clusterId: number, shardId: number) => void): this;
	/** Emitted when a shard disconnects */
	once(event: SharderEvents.SHARD_DISCONNECT, listener: (clusterId: number, shardId: number, error: Error) => void): this;
	/** Emits debug messages */
	once(event: SharderEvents.DEBUG, listener: (message: string) => void): this;
	/** Emitted when there is an error */
	once(event: SharderEvents.ERROR, listener: (error: Error, clusterId: number | undefined, shardId: number | undefined) => void): this;
	once(event: any, listener: (...args: any[]) => void): this;

	/** Emitted when a cluster spawns */
	off(event: SharderEvents.SPAWN, listener: (cluster: Cluster) => void): this;
	/** Emitted when a cluster becomes ready */
	off(event: SharderEvents.READY, listener: (cluster: Cluster) => void): this;
	/** Emitted when a shard connects (before ready) */
	off(event: SharderEvents.SHARD_CONNECTED, listener: (clusterId: number, shardId: number) => void): this;
	/** Emitted the first time a shard becomes ready */
	off(event: SharderEvents.SHARD_READY, listener: (clusterId: number, shardId: number) => void): this;
	/** Emitted when a shard resumes */
	off(event: SharderEvents.SHARD_RESUMED, listener: (clusterId: number, shardId: number) => void): this;
	/** Emitted when a shard disconnects */
	off(event: SharderEvents.SHARD_DISCONNECT, listener: (clusterId: number, shardId: number, error: Error) => void): this;
	/** Emits debug messages */
	off(event: SharderEvents.DEBUG, listener: (message: string) => void): this;
	/** Emitted when there is an error */
	off(event: SharderEvents.ERROR, listener: (error: Error, clusterId: number | undefined, shardId: number | undefined) => void): this;
	off(event: any, listener: (...args: any[]) => void): this;

	/** Emitted when a cluster spawns */
	emit(event: SharderEvents.SPAWN, cluster: Cluster): boolean;
	/** Emitted when a cluster becomes ready */
	emit(event: SharderEvents.READY, cluster: Cluster): boolean;
	/** Emitted when a shard connects (before ready) */
	emit(event: SharderEvents.SHARD_CONNECTED, clusterId: number, shardId: number): boolean;
	/** Emitted the first time a shard becomes ready */
	emit(event: SharderEvents.SHARD_READY, clusterId: number, shardId: number): boolean;
	/** Emitted when a shard resumes */
	emit(event: SharderEvents.SHARD_RESUMED, clusterId: number, shardId: number): boolean;
	/** Emitted when a shard disconnects */
	emit(event: SharderEvents.SHARD_DISCONNECT, clusterId: number, shardId: number, error: Error): boolean;
	/** Emits debug messages */
	emit(event: SharderEvents.DEBUG, message: string): boolean;
	/** Emitted when there is an error */
	emit(event: SharderEvents.ERROR, error: Error, clusterId: number | undefined, shardId: number | undefined): boolean;
	emit(event: any, ...args: any[]): boolean;
}
