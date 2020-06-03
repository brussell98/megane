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

	public send(data: IPCEvent, options: SendOptions = { }) {
		if (typeof data !== 'object' || data.op === undefined)
			throw new Error('Message data not an object, or no op code was specified');

		if (options.receptive === undefined)
			options.receptive = false;

		return this.server.send(data, options);
	}

	/** Run an eval on the master process sharding manager */
	public async sendMasterEval(script: string | ((...args: any[]) => any), options: SendOptions = { }) {
		script = typeof script === 'function' ? `(${script})(this)` : script;

		if (options.receptive === undefined)
			options.receptive = false;

		const { success, d } = await this.server.send({ op: IPCEvents.EVAL, d: script }, options) as IPCResult;
		if (!success)
			throw makeError(d as IPCError);

		return d as unknown[];
	}

	/** Run an eval on a specific service */
	public async sendServiceEval(script: string | ((...args: any[]) => any), serviceName: string, options: SendOptions = { }) {
		script = typeof script === 'function' ? `(${script})(this)` : script;

		if (options.receptive === undefined)
			options.receptive = false;

		const { success, d } = await this.server.send({ op: IPCEvents.SERVICE_EVAL, d: { serviceName, script } }, options) as IPCResult;
		if (!success)
			throw makeError(d as IPCError);

		return d as any;
	}

	/** Run an eval on all services */
	public async broadcastServiceEval(script: string | ((...args: any[]) => any), options: SendOptions = { }) {
		script = typeof script === 'function' ? `(${script})(this)` : script;

		if (options.receptive === undefined)
			options.receptive = false;

		const { success, d } = await this.server.send({ op: IPCEvents.SERVICE_EVAL, d: { script } }, options) as IPCResult;
		if (!success)
			throw makeError(d as IPCError);

		(d as any).errors = (d as any).errors.map((error: Error) => makeError(error));
		return d as IPCEvalResults;
	}

	/** Send a command to a service */
	public async sendServiceCommand(serviceName: string, data: any, options: SendOptions = { }) {
		if (typeof data !== 'object')
			throw new Error('Message data not an object');

		if (options.receptive === undefined)
			options.receptive = false;

		const { success, d } = await this.server.send({ op: IPCEvents.SERVICE_COMMAND, d: { serviceName, d: data } }, options) as IPCResult;
		if (!options.receptive)
			return;

		if (!success)
			throw makeError(d);

		return d as unknown[];
	}

	/** Send a command to a cluster or all clusters */
	public async sendClusterCommand(recipient: ClusterCommandRecipient, data: any, options: SendOptions = { }) {
		if (typeof data !== 'object')
			throw new Error('Message data not an object');

		if (options.receptive === undefined)
			options.receptive = false;

		const { success, d } = await this.server.send({
			op: IPCEvents.CLUSTER_COMMAND,
			d: Object.assign({ d: data }, recipient)
		}, options) as IPCResult;

		if (!options.receptive)
			return;

		if (!success)
			throw makeError(d);

		return d as unknown[];
	}

	public async fetchUser(query: string, clusterId?: number) {
		const { success, d } = await this.server.send({ op: IPCEvents.FETCH_USER, d: { query, clusterId } }) as IPCResult;

		if (!success)
			throw makeError(d as IPCError);

		return d as User | IPCFetchResults<User>;
	}

	public async fetchChannel(id: string, clusterId?: number) {
		const { success, d } = await this.server.send({ op: IPCEvents.FETCH_CHANNEL, d: { id, clusterId } }) as IPCResult;

		if (!success)
			throw makeError(d as IPCError);

		return d as Channel | IPCFetchResults<Channel>;
	}

	public async fetchGuild(id: string, clusterId?: number) {
		const { success, d } = await this.server.send({ op: IPCEvents.FETCH_GUILD, d: { id, clusterId } }) as IPCResult;

		if (!success)
			throw makeError(d as IPCError);

		return d as Guild | IPCFetchResults<Guild>;
	}

	private handleMessage(message: NodeMessage) {
		this['_' + message.data.op](message, message.data.d);
	}

	private async ['_' + IPCEvents.EVAL](message: NodeMessage, data: string) {
		try {
			const result = await this.worker.eval(data);
			return message.receptive && message.reply({ success: true, d: result });
		} catch (error) {
			return message.receptive && message.reply({ success: false, d: transformError(error) });
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
		const result = this.sanitizeErisObject(this.worker.getUser(data.query)?.toJSON() || null);
		return message.reply({ success: true, d: { found: result !== null, result } });
	}

	private ['_' + IPCEvents.FETCH_CHANNEL](message: NodeMessage, data: any) {
		const result = this.sanitizeErisObject(this.worker.getChannel(data.query)?.toJSON() || null);
		return message.reply({ success: true, d: { found: result !== null, result } });
	}

	private ['_' + IPCEvents.FETCH_GUILD](message: NodeMessage, data: any) {
		const result = this.sanitizeErisObject(this.worker.getGuild(data.query)?.toJSON() || null);
		return message.reply({ success: true, d: { found: result !== null, result } });
	}

	private async ['_' + IPCEvents.CLUSTER_COMMAND](message: NodeMessage, data: string) {
		try {
			if (!message.receptive)
				this.worker.handleCommand(data, false);

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
