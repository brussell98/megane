import { IPCResult, IPCError } from '..';
import { IPCEvents } from '../util/constants';
import { BaseServiceWorker } from './BaseServiceWorker';
import { Client, NodeMessage, SendOptions, ClientSocket } from 'veza';
import { EventEmitter } from 'events';
import { makeError } from '../util/util';

export class ServiceWorkerIPC extends EventEmitter {
	[key: string]: any; // Used to make code like "this['ready']" work
	private clientSocket?: ClientSocket;
	private client: Client;

	constructor(public worker: BaseServiceWorker, public ipcSocket: string | number) {
		super();

		this.client = new Client('megane:service:' + this.worker.name)
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

	public send(data: any, options: SendOptions = {}) {
		if (typeof data !== 'object' || data.op === undefined)
			throw new Error('Message data not an object, or no op code was specified');

		if (options.receptive === undefined)
			options.receptive = false;

		return this.server.send(data, options);
	}

	public async sendMasterEval(script: string | Function) {
		script = typeof script === 'function' ? `(${script})(this)` : script;

		const { success, d } = await this.server.send({ op: IPCEvents.EVAL, d: script }) as IPCResult;
		if (!success)
			throw makeError(d as IPCError);

		return d as unknown[];
	}

	public async fetchUser(query: string, clusterId?: number) {
		const result = await this.server.send({ op: IPCEvents.FETCH_USER, d: { query, clusterId } }) as IPCResult;

		if (!result.success)
			throw makeError(result.d as IPCError);

		return result.d;
	}

	public async fetchChannel(id: string, clusterId?: number) {
		const result = await this.server.send({ op: IPCEvents.FETCH_CHANNEL, d: { id, clusterId } }) as IPCResult;

		if (!result.success)
			throw makeError(result.d as IPCError);

		return result.d;
	}

	public async fetchGuild(id: string, clusterId?: number) {
		const result = await this.server.send({ op: IPCEvents.FETCH_GUILD, d: { id, clusterId } }) as IPCResult;

		if (!result.success)
			throw makeError(result.d as IPCError);

		return result.d;
	}

	private handleMessage(message: NodeMessage) {
		this['_' + message.data.op](message, message.data.d);
	}

	private async ['_' + IPCEvents.SERVICE_EVAL](message: NodeMessage, data: string) {
		try {
			const result = await this.worker.eval(data);
			return message.reply({ success: true, d: result });
		} catch (error) {
			return message.reply({ success: false, d: { name: error.name, message: error.message, stack: error.stack } });
		}
	}

	private async ['_' + IPCEvents.SERVICE_COMMAND](message: NodeMessage, data: string) {
		try {
			if (!message.receptive)
				this.worker.handleCommand(data, false);

			const result = await this.worker.handleCommand(data, true);
			return message.reply(result);
		} catch (error) {
			return message.reply({ success: false, d: { name: error.name, message: error.message, stack: error.stack } });
		}
	}
}
