import cluster, { Worker } from 'cluster';
import { ShardManager } from '../sharding/ShardManager';
import { EventEmitter } from 'events';
import { SharderEvents, IPCEvents } from '../util/constants';
import * as Util from '../util/util';
import { SendOptions } from 'veza';
import { MasterIPC } from '../sharding/MasterIPC';

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
		return this.manager.ipc!.sendTo(MasterIPC.serviceRecipient(this.name), data, options);
	}

	/**
	 * Shut down the worker, waiting for it to gracefully exit
	 * @param {Number} [timeout=-1] Time in ms to wait for the worker to shut down before forcefully exiting.
	 */
	public kill(timeout = -1) {
		return new Promise<void>(resolve => {
			this.ready = false;

			if (this.worker) {
				this.debug(`Killing service ${this.name}`);

				this.worker.removeListener('exit', this.exitListenerFunction);

				let timeoutRef: NodeJS.Timeout;
				const exitListener = () => { // If the process exits itself
					timeoutRef && clearTimeout(timeoutRef); // Clear timeout
					return resolve(); // Done
				};
				this.worker.once('exit', exitListener);

				// Send command to shut down
				this.send({ op: IPCEvents.SHUTDOWN });

				if (timeout > 0)
					timeoutRef = setTimeout(() => {
						if (!this.worker || this.worker!.isDead())
							return; // If the worker is already dead, but the timeout is not cleared, ignore

						// Remove exit listener and force kill
						this.worker!.removeListener('exit', exitListener);
						this.worker.kill();

						return resolve();
					}, timeout);
			} else
				return resolve();
		});
	}

	public async respawn() {
		await this.kill();
		await Util.sleep(500);
		await this.spawn();
	}

	/** Spawn the worker process */
	public async spawn() {
		if (this.worker && !this.worker.isDead)
			throw new Error('This service already has a spawned worker');

		this.worker = cluster.fork({
			NODE_ENV: process.env.NODE_ENV,
			SERVICE_NAME: this.name,
			SERVICE_PATH: this.path
		});

		this.worker.once('exit', this.exitListenerFunction);

		this.debug(`Worker spawned with id ${this.worker.id}`);
		this.manager.emit(SharderEvents.SERVICE_SPAWN, this);

		await this.waitForReady();
	}

	private waitForReady() {
		return new Promise<void>((resolve, reject) => {
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
