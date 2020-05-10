import { IPCEvent, IPCResult, IPCError, IPCEvalResults } from '..';
import { IPCEvents, SharderEvents } from '../util/constants';
import { ShardManager } from './ShardManager';
import { Server, NodeMessage, SendOptions } from 'veza';
import { makeError, getIdFromSocketName } from '../util/util';

export class MasterIPC {
	[key: string]: any; // Used to make code like "this['ready']" work
	private server: Server;

	constructor(public manager: ShardManager) {
		process.on('message', message => this.handleMessage(message));
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

	public sendTo(recipient: string, data: IPCEvent, options: SendOptions = { }) {
		if (typeof data !== 'object' || data.op === undefined)
			throw new Error('Message data not an object, or no op code was specified');

		if (options.receptive === undefined)
			options.receptive = false;

		return this.server.sendTo('megane:' + recipient, data, options);
	}

	public broadcast(data: IPCEvent, options: SendOptions = { }) {
		if (typeof data !== 'object' || data.op === undefined)
			throw new Error('Message data not an object, or no op code was specified');

		if (options.receptive === undefined)
			options.receptive = false;

		return this.server.broadcast(data, options);
	}

	/** Run an eval on a specific cluster */
	public async sendEval(script: string | Function, clusterId: number) {
		if (!this.manager.clusters!.has(clusterId))
			throw new Error('There is no cluster with this id');

		script = typeof script === 'function' ? `(${script})(this)` : script;

		const { success, d } = await this.server.sendTo(MasterIPC.clusterRecipient(clusterId), { op: IPCEvents.EVAL, d: script }) as IPCResult;
		if (!success)
			throw makeError(d as IPCError);

		return d as unknown[];
	}

	/** Run an eval on all clusters */
	public async broadcastEval(script: string | Function) {
		script = typeof script === 'function' ? `(${script})(this)` : script;

		const responses = await this.server.broadcast({ op: IPCEvents.EVAL, d: script }) as IPCResult[];

		return {
			results: responses.filter(res => res.success).map(res => res.d),
			errors: responses.filter(res => res.success).map(res => makeError(res.d as IPCError))
		} as IPCEvalResults;
	}

	/** Run an eval on a specific service */
	public async sendServiceEval(script: string | Function, serviceName: string) {
		if (!this.manager.services!.has(serviceName))
			throw new Error('There is no service registered with this name');

		script = typeof script === 'function' ? `(${script})(this)` : script;

		const { success, d } = await this.server.sendTo(MasterIPC.serviceRecipient(serviceName), { op: IPCEvents.SERVICE_EVAL, d: script }) as IPCResult;
		if (!success)
			throw makeError(d as IPCError);

		return d as any;
	}

	/** Run an eval on all services */
	public async broadcastServiceEval(script: string | Function) {
		script = typeof script === 'function' ? `(${script})(this)` : script;

		const responses = await this.server.broadcast({ op: IPCEvents.SERVICE_EVAL, d: { script } }) as IPCResult[];

		return {
			results: responses.filter(res => res.success).map(res => res.d),
			errors: responses.filter(res => res.success).map(res => makeError(res.d as IPCError))
		} as IPCEvalResults;
	}

	/** Send a command to a service */
	public async sendCommand(serviceName: string, data: any, options: SendOptions = { }) {
		if (typeof data !== 'object')
			throw new Error('Message data not an object');

		if (!this.manager.services!.has(serviceName))
			throw new Error('There is no service registered with this name');

		if (options.receptive === undefined)
			options.receptive = false;

		const { success, d } = await this.server.sendTo(
			MasterIPC.serviceRecipient(serviceName),
			{ op: IPCEvents.SERVICE_COMMAND, d: data},
			options
		) as IPCResult;
		if (!success)
			throw makeError(d);

		return d as unknown[];
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
		this.manager.emit(SharderEvents.SHARD_DISCONNECT, data.id, data.shardId, data.error);
	}

	private ['_' + IPCEvents.ERROR](message: NodeMessage, data: any) {
		this.manager.emit(SharderEvents.ERROR, data.error, data.id, data.shardId);
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

				return message.receptive && message.reply({ success: true, d: { workerId: cluster.worker?.id } });
			}

			if (!this.manager.services!.has(clientId))
				return message.reply({ success: false, d: { name: 'Error', message: 'Unable to shut down sender because it is not a known cluster' } });

			const service = this.manager.services!.get(clientId)!;
			if (data.restart === true)
				await service.respawn();
			else
				await service.kill();

			return message.receptive && message.reply({ success: true, d: { workerId: service.worker?.id } });
		} catch (error) {
			return message.receptive && message.reply({ success: false, d: { name: error.name, message: error.message, stack: error.stack } });
		}
	}

	private async ['_' + IPCEvents.EVAL](message: NodeMessage, data: string) {
		try {
			const result = await this.manager.eval(data);
			return message.reply({ success: true, d: result });
		} catch (error) {
			return message.reply({ success: false, d: { name: error.name, message: error.message, stack: error.stack } });
		}
	}

	private async ['_' + IPCEvents.SERVICE_EVAL](message: NodeMessage, data: any) {
		try {
			if (data.serviceName !== undefined) {
				if (!this.manager.services!.has(data.serviceName))
					return message.reply({ success: false, d: { name: 'Error', message: 'There is no service registered with this name' } });

				return message.reply(await this.server.sendTo(MasterIPC.serviceRecipient(data.serviceName), { op: IPCEvents.SERVICE_EVAL, d: data.script }));
			}

			const responses = await this.server.broadcast({ op: IPCEvents.SERVICE_EVAL, d: data.script }) as IPCResult[];

			const failed = responses.filter(res => !res.success);
			if (failed.length)
				throw makeError(failed[0].d as IPCError);

			return message.reply({ success: true, d: {
				results: responses.filter(res => res.success).map(res => res.d),
				errors: responses.filter(res => res.success).map(res => makeError(res.d as IPCError))
			} });
		} catch (error) {
			return message.reply({ success: false, d: { name: error.name, message: error.message, stack: error.stack } });
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

		if (message.receptive)
			message.reply({ success: true, d: { replaced } });
	}

	private async ['_' + IPCEvents.FETCH_USER](message: NodeMessage, data: any) {
		if (!data.query || typeof data.query !== 'string')
			return message.reply({ success: false, d: { name: 'Error', message: 'User query is required, and must be a string' } });

		return this.fetch(message, data, IPCEvents.FETCH_USER);
	}

	private ['_' + IPCEvents.FETCH_CHANNEL](message: NodeMessage, data: any) {
		if (!data.query || typeof data.query !== 'string' || !/^[0-9]$/.test(data.query))
			return message.reply({ success: false, d: { name: 'Error', message: 'Channel query is required, and must be an id as a string' } });

		return this.fetch(message, data, IPCEvents.FETCH_CHANNEL);
	}

	private ['_' + IPCEvents.FETCH_GUILD](message: NodeMessage, data: any) {
		if (!data.query || typeof data.query !== 'string' || !/^[0-9]$/.test(data.query))
			return message.reply({ success: false, d: { name: 'Error', message: 'Guild query is required, and must be an id as a string' } });

		return this.fetch(message, data, IPCEvents.FETCH_GUILD);
	}

	private async fetch(message: NodeMessage, data: any, op: IPCEvents) {
		try {
			if (data.clusterId) {
				const { success, d } = await this.server.sendTo(MasterIPC.clusterRecipient(data.clusterId), { op, d: { query: data.query } }) as IPCResult;
				if (!success)
					return message.reply({ success: false, d });

				return message.reply({ success: true, d });
			}

			const responses = await this.server.broadcast({ op, d: { query: data.query } }) as IPCResult[];
			const errors = [];
			let result;

			for (const { success, d } of responses) {
				if (!success)
					errors.push(d);

				if (!result && (d as any).found === true)
					result = (d as any).result;
			}

			return message.reply({ success: true, d: { found: result !== undefined, result, errors } });
		} catch (error) {
			this.debug('Error in fetch handler: ' + error);
			return message.reply({ success: false, d: { name: error.name, message: error.message, stack: error.stack } });
		}
	}

	private async ['_' + IPCEvents.SERVICE_COMMAND](message: NodeMessage, data: any) {
		try {
			if (!data.serviceName) {
				if (message.receptive)
					message.reply({ success: false, d: { name: 'Error', message: 'A serviceName must be provided for SERVICE_COMMAND messages' } });

				return;
			}

			const response = await this.server.sendTo(
				MasterIPC.serviceRecipient(data.serviceName),
				{ op: IPCEvents.SERVICE_COMMAND, d: data },
				{ receptive: message.receptive }
			) as IPCResult;

			if (message.receptive)
				return message.reply(response);
		} catch (error) {
			this.debug('Error in SERVICE_COMMAND handler: ' + error);
			return message.reply({ success: false, d: { name: error.name, message: error.message, stack: error.stack } });
		}
	}

	private debug(message: string) {
		this.manager.emit(SharderEvents.DEBUG, '[IPC] ' + message);
	}
}
