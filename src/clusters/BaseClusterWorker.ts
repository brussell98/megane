import { ClusterWorkerIPC } from './ClusterWorkerIPC';
import { ShardManager } from '../sharding/ShardManager';
import { Client, ClientOptions, Guild, AnyChannel, User } from 'eris';
import { IPCEvents } from '../util/constants';

export abstract class BaseClusterWorker {
	public readonly client: Client;
	public readonly id: number;
	public readonly ipc: ClusterWorkerIPC;

	public constructor(public manager: ShardManager) {
		const clientConfig: ClientOptions = Object.assign({ }, manager.clientOptions, {
			firstShardID: Number(process.env.FIRST_SHARD),
			lastShardID: Number(process.env.LAST_SHARD),
			maxShards: Number(process.env.SHARD_COUNT)
		});

		this.client = new Client(manager.token, clientConfig);
		this.id = Number(process.env.CLUSTER_ID);
		this.ipc = new ClusterWorkerIPC(this, this.manager.ipcSocket);

		process.on('exit', () => {
			this.ipc.disconnect();
			this.client.disconnect({ reconnect: false });
			process.exit(0);
		});
	}

	public async init() {
		await this.ipc.init();

		this.client.once('ready', () => this.ipc.send({ op: IPCEvents.READY, d: { id: this.id } }));
		this.client.on('connect', shardId => this.ipc.send({ op: IPCEvents.SHARD_CONNECTED, d: { id: this.id, shardId } }));
		this.client.on('shardReady', shardId => this.ipc.send({ op: IPCEvents.SHARD_READY, d: { id: this.id, shardId } }));
		this.client.on('shardResume', shardId => this.ipc.send({ op: IPCEvents.SHARD_RESUMED, d: { id: this.id, shardId } }));
		this.client.on('shardDisconnect', (error, id) => this.ipc.send({ op: IPCEvents.SHARD_DISCONNECTED, d: { id: this.id, shardId: id, error } }));
		this.client.on('error', (error, shardId) => this.ipc.send({ op: IPCEvents.ERROR, d: { id: this.id, shardId, error } }));

		await this.launch();
	}

	protected abstract launch(): Promise<void> | void;

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
}
