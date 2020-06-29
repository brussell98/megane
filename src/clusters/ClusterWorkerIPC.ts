import { IPCEvent, IPCResult, IPCError, IPCEvalResults, IPCFetchResults } from '..';
import { IPCEvents } from '../util/constants';
import { BaseClusterWorker } from './BaseClusterWorker';
import { Client, NodeMessage, SendOptions, ClientSocket } from 'veza';
import { EventEmitter } from 'events';
import { makeError, transformError } from '../util/util';
import { ClusterCommandRecipient } from '../sharding/MasterIPC';
import { User, Channel, Guild } from 'eris';

export class ClusterWorkerIPC extends EventEmitter {
	[key: string]: any; // Used to make code like "this['ready']" work
	private clientSocket?: ClientSocket;
	private client: Client;

	constructor(public worker: BaseClusterWorker, public ipcSocket: string | number) {
		super();

		this.client = new Client('megane:cluster:' + this.worker.id)
			.on('error', error => this.emit('error', error))
			.on('disconnect', client => this.emit('warn', 'Disconnected from ' + client.name))
			.on('ready', client => this.emit('debug', 'Connected to ' + client.name))
			.on('message', this.handleMessage.bind(this));
	}

	public async init() {
		this.clientSocket = await this.client.connectTo(String(this.ipcSocket));
	}

	public disconnect() {
		return this.server.disconnect();
	}

	public get server() {
		return this.clientSocket!;
	}

	public async send(data: IPCEvent, options: SendOptions = { }): Promise<IPCResult> {
		if (typeof data !== 'object' || data.op === undefined)
			throw new Error('Message data not an object, or no op code was specified');

		if (options.receptive === undefined)
			options.receptive = false;

		const response = await this.server.send(data, options) as IPCResult;

		return options.receptive ? response : { success: true, d: null };
	}

	/** Run an eval on the master process sharding manager */
	public async sendMasterEval(script: string | ((...args: any[]) => any), options: SendOptions = { }) {
		script = typeof script === 'function' ? `(${script})(this)` : script;

		const { success, d } = await this.send({ op: IPCEvents.EVAL, d: script }, options);
		if (!success)
			throw makeError(d as IPCError);

		return d as unknown;
	}

	/** Run an eval on a specific service */
	public async sendServiceEval(script: string | ((...args: any[]) => any), serviceName: string, options: SendOptions = { }) {
		script = typeof script === 'function' ? `(${script})(this)` : script;

		const { success, d } = await this.send({ op: IPCEvents.SERVICE_EVAL, d: { serviceName, script } }, options);
		if (!success)
			throw makeError(d as IPCError);

		return d as unknown;
	}

	/** Run an eval on all services */
	public async broadcastServiceEval(script: string | ((...args: any[]) => any), options: SendOptions = { }) {
		script = typeof script === 'function' ? `(${script})(this)` : script;

		const { success, d } = await this.send({ op: IPCEvents.SERVICE_EVAL, d: { script } }, options);
		if (!success)
			throw makeError(d as IPCError);

		if (!options.receptive)
			return null;

		(d as any).errors = (d as any).errors.map((error: Error) => makeError(error));
		return d as IPCEvalResults;
	}

	/** Send a command to a service */
	public async sendServiceCommand(serviceName: string, data: any, options: SendOptions = { }) {
		if (typeof data !== 'object')
			throw new Error('Message data not an object');

		const { success, d } = await this.send({ op: IPCEvents.SERVICE_COMMAND, d: { serviceName, d: data } }, options);

		if (!success)
			throw makeError(d);

		return d as unknown;
	}

	/** Send a command to a cluster or all clusters */
	public async sendClusterCommand(recipient: ClusterCommandRecipient, data: any, options: SendOptions = { }) {
		if (typeof data !== 'object')
			throw new Error('Message data not an object');

		const { success, d } = await this.send({
			op: IPCEvents.CLUSTER_COMMAND,
			d: Object.assign({ d: data }, recipient)
		}, options);

		if (!options.receptive)
			return null;

		if (!success)
			throw makeError(d);

		if (recipient.all) {
			(d as any).errors = (d as any).errors.map((error: Error) => makeError(error));

			return d as IPCEvalResults;
		}

		return d as unknown;
	}

	public async fetchUser(query: string, clusterId?: number) {
		const result = await this.server.send({ op: IPCEvents.FETCH_USER, d: { query, clusterId } }) as IPCResult;

		if (!result.success)
			throw makeError(result.d as IPCError);

		return result.d as IPCFetchResults<User>;
	}

	public async fetchUsers(queries: string[], clusterId?: number) {
		const result = await this.server.send({ op: IPCEvents.FETCH_USER, d: { query: queries, clusterId } }) as IPCResult;

		if (!result.success)
			throw makeError(result.d as IPCError);

		return result.d as IPCFetchResults<User[]>;
	}

	public async fetchChannel(id: string, clusterId?: number) {
		const result = await this.server.send({ op: IPCEvents.FETCH_CHANNEL, d: { query: id, clusterId } }) as IPCResult;

		if (!result.success)
			throw makeError(result.d as IPCError);

		return result.d as IPCFetchResults<Channel>;
	}

	public async fetchChannels(ids: string[], clusterId?: number) {
		const result = await this.server.send({ op: IPCEvents.FETCH_CHANNEL, d: { query: ids, clusterId } }) as IPCResult;

		if (!result.success)
			throw makeError(result.d as IPCError);

		return result.d as IPCFetchResults<Channel[]>;
	}

	public async fetchGuild(id: string, clusterId?: number) {
		const result = await this.server.send({ op: IPCEvents.FETCH_GUILD, d: { query: id, clusterId } }) as IPCResult;

		if (!result.success)
			throw makeError(result.d as IPCError);

		return result.d as IPCFetchResults<Guild>;
	}

	public async fetchGuilds(ids: string[], clusterId?: number) {
		const result = await this.server.send({ op: IPCEvents.FETCH_GUILD, d: { query: ids, clusterId } }) as IPCResult;

		if (!result.success)
			throw makeError(result.d as IPCError);

		return result.d as IPCFetchResults<Guild[]>;
	}

	private handleMessage(message: NodeMessage) {
		this['_' + message.data.op](message, message.data.d);
	}

	private async ['_' + IPCEvents.READY]() {
		if (this.worker.allClustersReady)
			this.worker.allClustersReady();
	}

	private async ['_' + IPCEvents.EVAL](message: NodeMessage, data: string) {
		try {
			const result = await this.worker.eval(data);
			return message.reply({ success: true, d: result });
		} catch (error) {
			return message.reply({ success: false, d: transformError(error) });
		}
	}

	private async ['_' + IPCEvents.SHUTDOWN]() {
		await this.worker.shutdown();
		await this.disconnect();

		process.exit(0);
	}

	public sanitizeErisObject(obj: any, depth = 0, maxDepth = 3) {
		if (!obj)
			return obj;

		if (depth >= maxDepth)
			return obj.toString();

		for (const key of Object.keys(obj)) {
			if (!obj[key])
				continue;

			if (obj[key].toJSON)
				obj[key] = this.sanitizeErisObject(obj[key].toJSON(), depth + 1, maxDepth);
			else if (obj[key].constructor.name === 'Object')
				obj[key] = this.sanitizeErisObject(obj[key], depth + 1, maxDepth);
			else if (Array.isArray(obj[key]))
				obj[key] = obj[key].map((v: any) => this.sanitizeErisObject(v, depth + 1, maxDepth));
		}

		return obj;
	}

	private ['_' + IPCEvents.FETCH_USER](message: NodeMessage, data: any) {
		try {
			if (Array.isArray(data.query)) {
				const result = data.query.map((q: string) => this.sanitizeErisObject(this.worker.getUser(q)?.toJSON() || null)).filter((e: any) => !!e);
				return message.reply({ success: true, d: { result } });
			}

			const result = this.sanitizeErisObject(this.worker.getUser(data.query)?.toJSON() || null);
			return message.reply({ success: true, d: { result } });
		} catch (error) {
			return message.reply({ success: false, d: transformError(error) });
		}
	}

	private ['_' + IPCEvents.FETCH_CHANNEL](message: NodeMessage, data: any) {
		try {
			if (Array.isArray(data.query)) {
				const result = data.query.map((q: string) => this.sanitizeErisObject(this.worker.getChannel(q)?.toJSON() || null)).filter((e: any) => !!e);
				return message.reply({ success: true, d: { result } });
			}

			const result = this.sanitizeErisObject(this.worker.getChannel(data.query)?.toJSON() || null);
			return message.reply({ success: true, d: { result } });
		} catch (error) {
			return message.reply({ success: false, d: transformError(error) });
		}
	}

	private ['_' + IPCEvents.FETCH_GUILD](message: NodeMessage, data: any) {
		try {
			if (Array.isArray(data.query)) {
				const result = data.query.map((q: string) => this.sanitizeErisObject(this.worker.getGuild(q)?.toJSON() || null)).filter((e: any) => !!e);
				return message.reply({ success: true, d: { result } });
			}

			const result = this.sanitizeErisObject(this.worker.getGuild(data.query)?.toJSON() || null);
			return message.reply({ success: true, d: { result } });
		} catch (error) {
			return message.reply({ success: false, d: transformError(error) });
		}
	}

	private async ['_' + IPCEvents.CLUSTER_COMMAND](message: NodeMessage, data: string) {
		try {
			if (!message.receptive)
				return this.worker.handleCommand(data, false);

			const result = await this.worker.handleCommand(data, true);
			return message.reply(result);
		} catch (error) {
			return message.reply({ success: false, d: transformError(error) });
		}
	}

	private ['_' + IPCEvents.GET_STATS](message: NodeMessage) {
		return message.reply({ success: true, d: {
			source: this.worker.id,
			stats: {
				memory: process.memoryUsage(),
				cpu: process.cpuUsage(),
				discord: {
					guilds: this.worker.client.guilds.size,
					latencies: this.worker.client.shards.map(shard => shard.latency),
					uptime: this.worker.client.uptime
				}
			}
		} });
	}
}
