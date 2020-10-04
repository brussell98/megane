import { ClusterWorkerIPC } from './ClusterWorkerIPC';
import { ShardManager } from '../sharding/ShardManager';
import { Client, ClientOptions, Guild, AnyChannel, User, Shard } from 'eris';
import { IPCEvents } from '../util/constants';
import { sleep, transformError } from '../util/util';
import { IPCResult } from '../';

export abstract class BaseClusterWorker {
	/** The worker's Eris client */
	public readonly client: Client;
	/** The worker's cluster id */
	public readonly id: number;
	/** The worker's IPC client */
	public readonly ipc: ClusterWorkerIPC;

	public constructor(public manager: ShardManager) {
		const clientConfig: ClientOptions = Object.assign({ }, manager.clientOptions, {
			firstShardID: Number(process.env.FIRST_SHARD),
			lastShardID: Number(process.env.LAST_SHARD),
			maxShards: Number(process.env.TOTAL_SHARDS)
		});

		this.client = new Client(manager.token, clientConfig);
		this.id = Number(process.env.CLUSTER_ID);
		this.ipc = new ClusterWorkerIPC(this, this.manager.ipcSocket);
	}

	public async init() {
		await this.ipc.init();

		this.client.once('ready', async () => {
			this.ipc.send({ op: IPCEvents.READY, d: { id: this.id } });

			if (!this.manager.cacheAllMembers || this.client.guilds.size === 0)
				return;

			await Promise.all(this.client.shards.map(shard => this.cacheShardMembers(shard)));

			this.ipc.send({ op: IPCEvents.ALL_MEMBERS_CACHED, d: this.id });
			if (this.allMembersCached)
				this.allMembersCached(false);
		});

		this.client.on('connect', shardId => this.ipc.send({ op: IPCEvents.SHARD_CONNECTED, d: { id: this.id, shardId } }));
		this.client.on('shardReady', shardId => this.ipc.send({ op: IPCEvents.SHARD_READY, d: { id: this.id, shardId } }));
		this.client.on('shardResume', shardId => this.ipc.send({ op: IPCEvents.SHARD_RESUMED, d: { id: this.id, shardId } }));
		this.client.on('shardDisconnect', (error, id) => this.ipc.send({
			op: IPCEvents.SHARD_DISCONNECTED,
			d: { id: this.id, shardId: id, error: transformError(error) }
		}));
		this.client.on('error', (error, shardId) => this.ipc.send({
			op: IPCEvents.ERROR,
			d: { id: this.id, shardId, error: transformError(error) }
		}));

		if (this.manager.cacheAllMembers)
			this.client.on('guildCreate', guild => guild.fetchAllMembers(2 * 60e3));

		await this.launch();
	}

	private async cacheShardMembers(shard: Shard) {
		const guilds = this.client.guilds.filter(guild => guild.shard.id === shard.id);
		if (guilds.length === 0)
			return;

		const chunkedGuilds = guilds.reduce((chunked: Guild[][], guild) => {
			if (chunked[chunked.length - 1].length > 110) // Gateway limit is 120 per minute. eris reserves 5 for presence, reserve another 5 for other events
				chunked.push([guild]);
			else
				chunked[chunked.length - 1].push(guild);

			return chunked;
		}, [[]]);

		for (let i = 0; i < chunkedGuilds.length; i++) {
			chunkedGuilds[i].forEach(guild => {
				guild.fetchAllMembers(20 * 60e3).catch(error => this.ipc.send({
					op: IPCEvents.ERROR,
					d: { id: this.id, error: transformError(error) }
				}));
			});

			if (i < chunkedGuilds.length - 1)
				await sleep(60_100); // Wait 60.1 seconds to send the next batch
		}

		return;
	}

	/**
	 * Called for graceful shutdown of the worker. Disconnects the Eris client.
	 *
	 * You must call this method if you overwrite it using `super.shutdown()`.
	 */
	public shutdown(): Promise<void> | void {
		this.client.disconnect({ reconnect: false });
	}

	/**
	 * Is called after the worker is initialized with an IPC client. This method must be implemented.
	 * This is where you should usually connect the Eris client.
	 * @abstract
	 */
	protected abstract launch(): Promise<void> | void;

	/**
	 * Is called only once, when all clusters have emitted a ready event on startup
	 * @abstract
	 */
	public abstract allClustersReady(): Promise<void> | void;

	/**
	 * Is called when all shards on this cluster have their guild members cached, and when this completes for all clusters.
	 * @abstract
	 */
	public abstract allMembersCached(allClusters: boolean): Promise<void> | void;

	/**
	 * Allows returning an object containing additional stats to return during stats collection
	 * @abstract
	 */
	public abstract getStats(): Promise<Record<string, any>> | Record<string, any>;

	/**
	 * Is called when a CLUSTER_COMMAND event is received.
	 * If the event is receptive then an IPCResult must be returned.
	 */
	public async handleCommand(data: any, receptive: boolean): Promise<IPCResult | void> {
		if (receptive)
			return this.asError(new Error('Clusters are not set up to handle commands'));
	}

	public async eval(script: string) {
		// eslint-disable-next-line no-eval
		return await eval(script);
	}

	public getUser(query: string): User | null {
		query = query.toLowerCase().trim();

		if (/^[0-9]{16,19}$/.test(query)) { // If query looks like an id try to get by id
			const user = this.client.users.get(query);
			if (user)
				return user;
		}

		return this.client.users.find(user => user.username.toLowerCase() === query)
			|| this.client.users.find(user => user.username.toLowerCase().includes(query))
			|| null;
	}

	public getChannel(id: string): AnyChannel | null {
		const guildId = this.client.channelGuildMap[id];
		if (!guildId)
			return null;

		return this.client.guilds.get(guildId)?.channels.get(id) || null;
	}

	public getGuild(id: string): Guild | null {
		return this.client.guilds.get(id) || null;
	}

	/** Formats data as a response to an IPC event or command */
	public asResponse(data: any) {
		return { success: true, d: data };
	}

	/** Formats an error as a response to an IPC event or command */
	public asError(error: Error) {
		return { success: false, d: transformError(error) };
	}
}
