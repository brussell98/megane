import { Worker, fork } from 'cluster';
import { ShardManager } from '../sharding/ShardManager';
import { EventEmitter } from 'events';
import { SharderEvents } from '../util/constants';
import * as Util from '../util/util';
import { SendOptions } from 'veza';

export interface ServiceOptions {
	name: string;
	/** How many milliseconds to wait for the service worker to be ready */
	timeout?: number;
}

export class Service extends EventEmitter {
	/** Indicates if the worker is ready */
	public ready = false;
	public name: string;
	public worker?: Worker;
	public timeout: number;

	private readonly exitListenerFunction: (...args: any[]) => void;

	public constructor(public manager: ShardManager, public path: string, options: ServiceOptions) {
		super();

		this.name = options.name;
		this.timeout = options.timeout || 30e3;

		this.exitListenerFunction = this.exitListener.bind(this);
	}

	public send(data: any, options: SendOptions = { }) {
		return this.manager.ipc!.sendTo('service:' + this.name, data, options);
	}

	public kill() {
		this.ready = false;

		if (this.worker) {
			this.debug(`Killing service ${this.name}`);

			this.worker.removeListener('exit', this.exitListenerFunction);
			this.worker.process.disconnect();
		}
	}

	public async respawn(delay = 500) {
		this.kill();
		if (delay)
			await Util.sleep(delay);

		await this.spawn();
	}

	public async spawn() {
		if (this.worker && !this.worker.isDead)
			throw new Error('This service already has a spawned worker');

		this.worker = fork({
			SERVICE_NAME: this.name,
			SERVICE_PATH: this.path
		});

		this.worker.once('exit', this.exitListenerFunction);

		this.debug(`Worker spawned with id ${this.worker.id}`);
		this.manager.emit(SharderEvents.SERVICE_SPAWN, this);

		await this.waitForReady();
	}

	private waitForReady() {
		return new Promise((resolve, reject) => {
			this.once('ready', () => {
				this.ready = true;
				return resolve();
			});

			setTimeout(() => reject(new Error(`Service ${this.name} took too long to get ready`)), this.timeout);
		});
	}

	private exitListener(code: number, signal: string) {
		this.ready = false;
		this.worker = undefined;

		this.debug(`Worker exited with code ${code} and signal ${signal}`);

		this.respawn();
	}

	private debug(message: string) {
		this.manager.emit(SharderEvents.DEBUG, '[Service] ' + message);
	}
}
