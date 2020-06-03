import { ClusterWorkerIPC } from './ClusterWorkerIPC';
import { ShardManager } from '../sharding/ShardManager';
import { Client, ClientOptions, Guild, AnyChannel, User } from 'eris';
import { IPCEvents } from '../util/constants';
import { transformError } from '../util/util';
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

		this.client.once('ready', () => this.ipc.send({ op: IPCEvents.READY, d: { id: this.id } }));
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

		await this.launch();
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

		if (/^[0-9]{16,19}$/.test(query)) { // If query looks like an ID try to get by ID
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
