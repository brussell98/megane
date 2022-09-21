import { IPCEvent, IPCResult, IPCError, IPCEvalResults, IPCFetchResults } from '..';
import { IPCEvents, SharderEvents } from '../util/constants';
import { ShardManager } from './ShardManager';
import { Server, NodeMessage, SendOptions, BroadcastOptions } from 'veza';
import { makeError, getIdFromSocketName, transformError } from '../util/util';
import { Guild, User, Channel } from 'eris';

export interface ClusterCommandRecipient {
	clusterId?: number,
	guildId?: string,
	all?: boolean
}

export class MasterIPC {
	[key: string]: any; // Used to make code like "this['ready']" work
	private server: Server;
	private clustersCached = 0;

	constructor(public manager: ShardManager) {
		this.server = new Server('megane:master')
			.on('connect', client => this.debug('Client connected: ' + client.name))
			.on('disconnect', client => this.debug('Client disconnected: ' + client.name))
			.on('error', error => this.manager.emit(SharderEvents.ERROR, error))
			.on('message', this.handleMessage.bind(this));

		this.server.listen(manager.ipcSocket);
	}

	public static clusterRecipient(clusterId: number) {
		return 'megane:cluster:' + clusterId;
	}

	public static serviceRecipient(serviceName: string) {
		return 'megane:service:' + serviceName;
	}

	public getClusterIdForGuild(guildId: string) {
		const shard = Number((BigInt(guildId) >> BigInt(22)) % BigInt(this.manager.clusters!.get(0)?.shards.total || 0));
		for (const cluster of this.manager.clusters!.values())
			if (cluster.shards.first <= shard && cluster.shards.last >= shard)
				return cluster.id;

		return null;
	}

	public getRecipientForGuild(guildId: string) {
		const shard = Number((BigInt(guildId) >> BigInt(22)) % BigInt(this.manager.clusters!.get(0)?.shards.total || 0));
		for (const cluster of this.manager.clusters!.values())
			if (cluster.shards.first <= shard && cluster.shards.last >= shard)
				return MasterIPC.clusterRecipient(cluster.id);

		return null;
	}

	public async sendTo(recipient: string, data: IPCEvent, options: SendOptions = { }): Promise<IPCResult> {
		if (typeof data !== 'object' || data.op === undefined)
			throw new Error('Message data not an object, or no op code was specified');

		if (options.receptive === undefined)
			options.receptive = false;

		const response = await this.server.sendTo(recipient, data, options);

		return options.receptive ? response : { success: true, d: null };
	}

	public async broadcast(data: IPCEvent, options: BroadcastOptions = { }): Promise<IPCResult[]> {
		if (typeof data !== 'object' || data.op === undefined)
			throw new Error('Message data not an object, or no op code was specified');

		if (options.receptive === undefined)
			options.receptive = false;

		const response = await this.server.broadcast(data, options);

		return options.receptive ? response : [];
	}

	/** Run an eval on a specific cluster */
	public async sendClusterEval(script: string | ((...args: any[]) => any), clusterId: number, options: SendOptions = { }) {
		if (!this.manager.clusters!.has(clusterId))
			throw new Error('There is no cluster with this id');

		script = typeof script === 'function' ? `(${script})(this)` : script;

		const { success, d } = await this.sendTo(MasterIPC.clusterRecipient(clusterId), { op: IPCEvents.EVAL, d: script }, options);
		if (!success)
			throw makeError(d as IPCError);

		return d as unknown;
	}

	/** Run an eval on all clusters */
	public async broadcastClusterEval(script: string | ((...args: any[]) => any), options: BroadcastOptions = { }) {
		script = typeof script === 'function' ? `(${script})(this)` : script;

		options.filter = /^megane:cluster:/;

		const responses = await this.broadcast({ op: IPCEvents.EVAL, d: script }, options);

		return {
			results: responses.filter(res => res.success).map(res => res.d),
			errors: responses.filter(res => !res.success).map(res => makeError(res.d as IPCError))
		} as IPCEvalResults;
	}

	/** Run an eval on a specific service */
	public async sendServiceEval(script: string | ((...args: any[]) => any), serviceName: string, options: SendOptions = { }) {
		if (!this.manager.services!.has(serviceName))
			throw new Error('There is no service registered with this name');

		script = typeof script === 'function' ? `(${script})(this)` : script;

		const { success, d } = await this.sendTo(MasterIPC.serviceRecipient(serviceName), { op: IPCEvents.SERVICE_EVAL, d: script }, options);
		if (!success)
			throw makeError(d as IPCError);

		return d as unknown;
	}

	/** Run an eval on all services */
	public async broadcastServiceEval(script: string | ((...args: any[]) => any), options: BroadcastOptions = { }) {
		script = typeof script === 'function' ? `(${script})(this)` : script;

		options.filter = /^megane:service:/;

		const responses = await this.broadcast({ op: IPCEvents.SERVICE_EVAL, d: { script } }, options);

		return {
			results: responses.filter(res => res.success).map(res => res.d),
			errors: responses.filter(res => !res.success).map(res => makeError(res.d as IPCError))
		} as IPCEvalResults;
	}

	/** Send a command to a service */
	public async sendServiceCommand(serviceName: string, data: any, options: SendOptions = { }) {
		if (typeof data !== 'object')
			throw new Error('Message data not an object');

		if (!this.manager.services!.has(serviceName))
			throw new Error('There is no service registered with this name');

		const { success, d } = await this.sendTo(
			MasterIPC.serviceRecipient(serviceName),
			{ op: IPCEvents.SERVICE_COMMAND, d: data},
			options
		);
		if (!success)
			throw makeError(d);

		return d as unknown;
	}

	/** Send a command to a cluster or all clusters */
	public async sendClusterCommand(recipient: ClusterCommandRecipient, data: any, options: SendOptions = { }) {
		if (recipient.all === true) {
			const bOptions = <BroadcastOptions>{ ...options, filter: /^megane:cluster:/ };
			const responses = await this.broadcast({ op: IPCEvents.CLUSTER_COMMAND, d: data }, bOptions);

			return {
				results: responses.filter(res => res.success).map(res => res.d),
				errors: responses.filter(res => !res.success).map(res => makeError(res.d as IPCError))
			} as IPCEvalResults;
		}

		let name;
		if (typeof recipient.clusterId === 'number') {
			if (!this.manager.clusters!.has(recipient.clusterId))
				throw new Error('There is no cluster with this id');

			name = MasterIPC.clusterRecipient(recipient.clusterId);
		} else if (recipient.guildId)
			name = this.getRecipientForGuild(recipient.guildId);
		else
			throw new Error('No recipient was specified');

		if (!name)
			throw new Error('No cluster was found matching the parameters supplied');

		const { success, d } = await this.sendTo(
			name,
			{ op: IPCEvents.CLUSTER_COMMAND, d: data },
			options
		);
		if (!success)
			throw makeError(d);

		return d as unknown;
	}

	public async fetchUser(query: string, clusterId?: number | null, idOnly?: boolean) {
		if (!query || typeof query !== 'string')
			throw new Error('User query is required, and must be a string');

		return this.fetch(query, clusterId, IPCEvents.FETCH_USER, { idOnly }) as Promise<User | IPCFetchResults<User>>;
	}

	public async fetchUsers(queries: string[], clusterId?: number | null, idOnly?: boolean) {
		if (!Array.isArray(queries) || queries.some((e: any) => typeof e !== 'string'))
			throw new Error('User queries are required, and they must be strings');

		return this.fetch(queries, clusterId, IPCEvents.FETCH_USER, { idOnly }) as Promise<User[] | IPCFetchResults<User[]>>;
	}

	public async fetchChannel(query: string, clusterId?: number | null) {
		if (!query || typeof query !== 'string' || !/^[0-9]+$/.test(query))
			throw new Error('Channel query is required, and must be an id as a string');

		return this.fetch(query, clusterId, IPCEvents.FETCH_CHANNEL) as Promise<Channel | IPCFetchResults<Channel>>;
	}

	public async fetchChannels(queries: string[], clusterId?: number | null) {
		if (!Array.isArray(queries) || queries.some((e: any) => typeof e !== 'string' || !/^[0-9]+$/.test(e)))
			throw new Error('Channel queries are required, and they must be ids as strings');

		return this.fetch(queries, clusterId, IPCEvents.FETCH_CHANNEL) as Promise<Channel[] | IPCFetchResults<Channel[]>>;
	}

	public async fetchGuild(query: string, clusterId?: number | null, includeMembers?: string[] | boolean) {
		if (!query || typeof query !== 'string' || !/^[0-9]+$/.test(query))
			throw new Error('Guild query is required, and must be an id as a string');

		if (Array.isArray(includeMembers) && includeMembers.some((e: any) => typeof e !== 'string' || !/^[0-9]+$/.test(e)))
			throw new Error('includeMembers must be a boolean or an array of user ids');

		if (!clusterId)
			clusterId = this.getClusterIdForGuild(query) || undefined;

		return this.fetch(query, clusterId, IPCEvents.FETCH_GUILD, { includeMembers }) as Promise<Guild | IPCFetchResults<Guild>>;
	}

	public async fetchGuilds(queries: string[], clusterId?: number | null, includeMembers?: string[] | boolean) {
		if (!Array.isArray(queries) || queries.some((e: any) => typeof e !== 'string' || !/^[0-9]+$/.test(e)))
			throw new Error('Guild queries are required, and they must be ids as strings');

		if (Array.isArray(includeMembers) && includeMembers.some((e: any) => typeof e !== 'string' || !/^[0-9]+$/.test(e)))
			throw new Error('includeMembers must be a boolean or an array of user ids');

		return this.fetch(queries, clusterId, IPCEvents.FETCH_GUILD, { includeMembers }) as Promise<Guild[] | IPCFetchResults<Guild[]>>;
	}

	private async fetch(query: string | string[], clusterId: number | null | undefined, op: IPCEvents, options?: any) {
		if (typeof clusterId === 'number') {
			const { success, d } = await this.server.sendTo(MasterIPC.clusterRecipient(clusterId), { op, d: { query, options } }) as IPCResult;
			if (!success)
				throw makeError(d);

			return d;
		}

		const responses = await this.server.broadcast({ op, d: { query, options } }, { filter: /^megane:cluster:/ }) as IPCResult[];
		const isBatch = Array.isArray(query);
		const errors = [];
		let result = isBatch ? [] : undefined;

		for (const { success, d } of responses) {
			if (!success)
				errors.push(d);

			const data = d as any;

			if (!isBatch) {
				if (!result && data.result)
					result = data.result;
			} else if (data.result && data.result.length !== 0)
				result = result!.concat(data.result);
		}

		return { result, errors };
	}

	private handleMessage(message: NodeMessage) {
		this['_' + message.data.op](message, message.data.d);
	}

	private ['_' + IPCEvents.READY](message: NodeMessage, data: any) {
		if (message.client.name!.startsWith('megane:cluster:')) {
			const cluster = this.manager.clusters!.get(data.id);
			cluster!.emit('ready');

			this.manager.emit(SharderEvents.CLUSTER_READY, cluster);
		} else if (message.client.name!.startsWith('megane:service:')) {
			const service = this.manager.services!.get(data.name);
			service!.emit('ready');

			this.manager.emit(SharderEvents.SERVICE_READY, service);
		}
	}

	private ['_' + IPCEvents.SHARD_CONNECTED](message: NodeMessage, data: any) {
		this.manager.emit(SharderEvents.SHARD_CONNECTED, data.id, data.shardId);
	}

	private ['_' + IPCEvents.SHARD_READY](message: NodeMessage, data: any) {
		this.manager.emit(SharderEvents.SHARD_READY, data.id, data.shardId);
	}

	private ['_' + IPCEvents.SHARD_RESUMED](message: NodeMessage, data: any) {
		this.manager.emit(SharderEvents.SHARD_RESUMED, data.id, data.shardId);
	}

	private ['_' + IPCEvents.SHARD_DISCONNECTED](message: NodeMessage, data: any) {
		this.manager.emit(SharderEvents.SHARD_DISCONNECTED, data.id, data.shardId, makeError(data.error));
	}

	private ['_' + IPCEvents.ERROR](message: NodeMessage, data: any) {
		this.manager.emit(SharderEvents.ERROR, makeError(data.error), data.id, data.shardId);
	}

	private async ['_' + IPCEvents.SHUTDOWN](message: NodeMessage, data: any) {
		try {
			const clientId = getIdFromSocketName(message.client.name);
			if (typeof clientId !== 'string') {
				if (clientId === null || !this.manager.clusters!.has(clientId))
					return message.reply({ success: false, d: { name: 'Error', message: 'Unable to shut down sender because it is not a known cluster' } });

				const cluster = this.manager.clusters!.get(clientId)!;
				if (data.restart === true)
					await cluster.respawn();
				else
					await cluster.kill();

				return message.reply({ success: true, d: { workerId: cluster.worker?.id } });
			}

			if (!this.manager.services!.has(clientId))
				return message.reply({ success: false, d: {
					name: 'Error', message: 'Unable to shut down sender because it is not a known cluster'
				} });

			const service = this.manager.services!.get(clientId)!;
			if (data.restart === true)
				await service.respawn();
			else
				await service.kill();

			return message.reply({ success: true, d: { workerId: service.worker?.id } });
		} catch (error) {
			return message.reply({ success: false, d: transformError(error as Error) });
		}
	}

	private async ['_' + IPCEvents.EVAL](message: NodeMessage, data: string) {
		try {
			const result = await this.manager.eval(data);
			return message.reply({ success: true, d: result });
		} catch (error) {
			return message.reply({ success: false, d: transformError(error as Error) });
		}
	}

	private async ['_' + IPCEvents.SERVICE_EVAL](message: NodeMessage, data: any) {
		try {
			if (data.serviceName !== undefined) {
				if (!this.manager.services!.has(data.serviceName))
					return message.reply({ success: false, d: {
						name: 'Error', message: 'There is no service registered with this name'
					} });

				const result = await this.sendTo(MasterIPC.serviceRecipient(data.serviceName), { op: IPCEvents.SERVICE_EVAL, d: data.script },
					{ receptive: message.receptive });
				return message.reply(result);
			}


			const responses = await this.broadcast(
				{ op: IPCEvents.SERVICE_EVAL, d: data.script },
				{ receptive: message.receptive, filter: /^megane:service:/ }
			);

			return message.reply({ success: true, d: {
				results: responses.filter(res => res.success).map(res => res.d),
				errors: responses.filter(res => !res.success).map(res => transformError(res.d as IPCError))
			} });
		} catch (error) {
			return message.reply({ success: false, d: transformError(error as Error) });
		}
	}

	private ['_' + IPCEvents.GET](message: NodeMessage, data: any) {
		if (!data.key || typeof data.key !== 'string')
			return message.reply({ success: false, d: { name: 'Error', message: 'Key is a required string' } });

		return message.reply({ success: true, d: { found: this.manager.store.has(data.key), value: this.manager.store.get(data.key) } });
	}

	private ['_' + IPCEvents.SET](message: NodeMessage, data: any) {
		if (!data.key || typeof data.key !== 'string')
			return message.reply({ success: false, d: { name: 'Error', message: 'Key is a required string' } });
		if (!data.value)
			return message.reply({ success: false, d: { name: 'Error', message: 'Value is a required string' } });

		const replaced = this.manager.store.has(data.key);
		this.manager.store.set(data.key, data.value);

		return message.reply({ success: true, d: { replaced } });
	}

	private ['_' + IPCEvents.FETCH_USER](message: NodeMessage, data: any) {
		if (!data.query || (typeof data.query === 'string'
			? false
			: !Array.isArray(data.query) || data.query.some((e: any) => typeof e !== 'string'))
		)
			return message.reply({ success: false, d: { name: 'Error', message: 'User query is required, and must be a string or array of strings' } });

		return this.relayFetch(message, {
			query: data.query,
			options: { idOnly: data.idOnly }
		}, IPCEvents.FETCH_USER);
	}

	private ['_' + IPCEvents.FETCH_CHANNEL](message: NodeMessage, data: any) {
		if (!data.query || (typeof data.query === 'string'
			? !/^[0-9]+$/.test(data.query)
			: !Array.isArray(data.query) || data.query.some((e: any) => typeof e !== 'string' || !/^[0-9]+$/.test(e)))
		)
			return message.reply({ success: false, d: { name: 'Error', message: 'Channel query is required, and must be an id as a string or array of id strings' } });

		return this.relayFetch(message, data, IPCEvents.FETCH_CHANNEL);
	}

	private ['_' + IPCEvents.FETCH_GUILD](message: NodeMessage, data: any) {
		if (!data.query || (typeof data.query === 'string'
			? !/^[0-9]+$/.test(data.query)
			: !Array.isArray(data.query) || data.query.some((e: any) => typeof e !== 'string' || !/^[0-9]+$/.test(e)))
		)
			return message.reply({ success: false, d: { name: 'Error', message: 'Guild query is required, and must be an id as a string or array of id strings' } });

		if (Array.isArray(data.includeMembers) && data.includeMembers.some((e: any) => typeof e !== 'string' || !/^[0-9]+$/.test(e)))
			return message.reply({ success: false, d: { name: 'Error', message: 'includeMembers must be a boolean or an array of user ids' } });

		if (!data.clusterId && typeof data.query === 'string')
			data.clusterId = this.getClusterIdForGuild(data.query);

		return this.relayFetch(message, {
			query: data.query,
			options: data.includeMembers !== undefined ? { includeMembers: data.includeMembers } : undefined
		}, IPCEvents.FETCH_GUILD);
	}

	private async relayFetch(message: NodeMessage, data: any, op: IPCEvents) {
		try {
			if (typeof data.clusterId === 'number')
				return message.reply(await this.server.sendTo(MasterIPC.clusterRecipient(data.clusterId), { op, d: { query: data.query, options: data.options } }));

			const responses = await this.server.broadcast({ op, d: { query: data.query, options: data.options } }, { filter: /^megane:cluster:/ }) as IPCResult[];
			const isBatch = Array.isArray(data.query);
			const errors = [];
			let result = isBatch ? [] : undefined;

			for (const { success, d } of responses) {
				if (!success)
					errors.push(d);

				const data = d as any;

				if (!isBatch) {
					if (!result && data.result)
						result = data.result;
				} else if (data.result && data.result.length !== 0)
					result = result!.concat(data.result);
			}

			return message.reply({ success: true, d: { result, errors } });
		} catch (error) {
			return message.reply({ success: false, d: transformError(error as Error) });
		}
	}

	private async ['_' + IPCEvents.SERVICE_COMMAND](message: NodeMessage, data: any) {
		try {
			if (!data.serviceName)
				return message.reply({ success: false, d: {
					name: 'Error', message: 'A serviceName must be provided for SERVICE_COMMAND messages'
				} });

			const response = await this.sendTo(
				MasterIPC.serviceRecipient(data.serviceName),
				{ op: IPCEvents.SERVICE_COMMAND, d: data.d },
				{ receptive: message.receptive }
			);

			return message.reply(response);
		} catch (error) {
			return message.reply({ success: false, d: transformError(error as Error) });
		}
	}

	private async ['_' + IPCEvents.CLUSTER_COMMAND](message: NodeMessage, data: any) {
		try {
			if (typeof data.clusterId !== 'number' && !data.guildId && !data.all)
				return message.reply({ success: false, d: {
					name: 'Error', message: 'A clusterId, guildId, or "all" boolean must be provided for CLUSTER_COMMAND messages'
				} });

			if (data.all === true) {
				const responses = await this.broadcast(
					{ op: IPCEvents.CLUSTER_COMMAND, d: data.d },
					{ receptive: message.receptive, filter: /^megane:cluster:/ }
				);

				return message.reply({
					success: true, d: {
						results: responses.filter(res => res.success).map(res => res.d),
						errors: responses.filter(res => !res.success).map(res => transformError(res.d as IPCError))
					}
				});
			}

			let recipient;
			if (typeof data.clusterId === 'number')
				recipient = MasterIPC.clusterRecipient(data.clusterId);
			else
				recipient = this.getRecipientForGuild(data.guildId);

			if (!recipient)
				return message.reply({ success: false, d: { name: 'Error', message: 'No cluster was found matching the parameters supplied' } });

			const response = await this.sendTo(
				recipient,
				{ op: IPCEvents.CLUSTER_COMMAND, d: data.d },
				{ receptive: message.receptive }
			);

			return message.reply(response);
		} catch (error) {
			return message.reply({ success: false, d: transformError(error as Error) });
		}
	}

	private async ['_' + IPCEvents.ALL_MEMBERS_CACHED](message: NodeMessage, data: number) {
		try {
			this.clustersCached++;
			this.manager.emit(SharderEvents.ALL_MEMBERS_CACHED, data);

			if (this.clustersCached === this.manager.clusterCount) {
				this.broadcast({ op: IPCEvents.ALL_MEMBERS_CACHED });
				this.manager.emit(SharderEvents.ALL_MEMBERS_CACHED);
			}
		} catch (error) {
			this.manager.emit(SharderEvents.ERROR, error);
		}
	}

	private debug(message: string) {
		this.manager.emit(SharderEvents.DEBUG, '[IPC] ' + message);
	}
}
