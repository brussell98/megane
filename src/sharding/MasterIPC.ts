import { IPCResult, IPCError } from '..';
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

	public sendTo(recipient: string, data: any, options: SendOptions = { }) {
		if (typeof data !== 'object' || data.op === undefined)
			throw new Error('Message data not an object, or no op code was specified');

		if (options.receptive === undefined)
			options.receptive = false;

		return this.server.sendTo('megane:' + recipient, data, options);
	}

	public broadcast(data: any, options: SendOptions = { }) {
		if (typeof data !== 'object' || data.op === undefined)
			throw new Error('Message data not an object, or no op code was specified');

		if (options.receptive === undefined)
			options.receptive = false;

		return this.server.broadcast(data, options);
	}

	public async sendEval(script: string | Function, clusterId?: number) {
		script = typeof script === 'function' ? `(${script})(this)` : script;

		if (clusterId !== undefined) {
			const { success, d } = await this.server.sendTo('megane:cluster:' + clusterId, { op: IPCEvents.EVAL, d: script }) as IPCResult;
			if (!success)
				throw makeError(d as IPCError);

			return d as unknown[];
		}

		const data = await this.server.broadcast({ op: IPCEvents.EVAL, d: script }) as IPCResult[];

		const failed = data.filter(res => !res.success);
		if (failed.length)
			throw makeError(failed[0].d as IPCError);

		return data.map(res => res.d) as unknown[];
	}

	private handleMessage(message: NodeMessage) {
		this['_' + message.data.op](message, message.data.d);
	}

	private ['_' + IPCEvents.READY](message: NodeMessage, data: any) {
		const cluster = this.manager.clusters.get(data.id);
		cluster!.emit('ready');

		this.manager.emit(SharderEvents.READY, cluster);
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

	private async ['_' + IPCEvents.RESTART](message: NodeMessage) {
		try {
			const clusterId = getIdFromSocketName(message.client.name);
			if (clusterId === null || !this.manager.clusters.has(clusterId))
				return message.reply({ success: false, d: { name: 'Error', message: 'Unable to restart sender because it is not a known cluster' } });

			const cluster = this.manager.clusters.get(clusterId)!;
			await cluster.respawn();
			return message.reply({ success: true, d: { workerId: cluster.worker!.id } });
		} catch (error) {
			return message.reply({ success: false, d: { name: error.name, message: error.message, stack: error.stack } });
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
				const { success, d } = await this.server.sendTo('megane:cluster:' + data.clusterId, { op, d: { query: data.query } }) as IPCResult;
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
			return message.reply({ success: false, d: { name: error.name, message: error.message, stack: error.stack } });
		}
	}

	private debug(message: string) {
		this.manager.emit(SharderEvents.DEBUG, '[IPC] ' + message);
	}
}
