import { Worker, fork } from 'cluster';
import { ShardManager } from '../sharding/ShardManager';
import { EventEmitter } from 'events';
import { SharderEvents, IPCEvents } from '../util/constants';
import * as Util from '../util/util';
import { SendOptions } from 'veza';

interface ShardOptions {
	first: number;
	last: number;
	total: number;
}

export interface ClusterOptions {
	id: number;
	shards: ShardOptions;
}

export class Cluster extends EventEmitter {
	/** Indicates if the worker's client is ready */
	public ready = false;
	public id: number;
	public shards: ShardOptions;
	public worker?: Worker;

	private readonly exitListenerFunction: (...args: any[]) => void;

	public constructor(public manager: ShardManager, options: ClusterOptions) {
		super();

		this.id = options.id;
		this.shards = options.shards;

		this.exitListenerFunction = this.exitListener.bind(this);
	}

	public send(data: any, options: SendOptions = { }) {
		return this.manager.ipc!.sendTo('cluster:' + this.id, data, options);
	}

	/**
	 * Shut down the worker, waiting for it to gracefully exit
	 * @param {Number} [timeout=-1] Time in ms to wait for the worker to shut down before forcefully exiting.
	 */
	public kill(timeout = -1) {
		return new Promise(resolve => {
			this.ready = false;

			if (this.worker) {
				this.debug(`Killing cluster ${this.id}`);

				this.worker.removeListener('exit', this.exitListenerFunction);

				let timeoutRef: NodeJS.Timeout;
				const exitListener = () => { // If the process exits itself
					timeoutRef && clearTimeout(timeoutRef); // Clear timeout
					return resolve(); // Done
				};
				this.worker.once('exit', exitListener);

				// Send command to shut down
				this.manager.ipc!.sendTo('cluster:' + this.id, { op: IPCEvents.SHUTDOWN });

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
		if (this.worker && !this.worker.isDead())
			throw new Error('This cluster already has a spawned worker');

		this.worker = fork({
			NODE_ENV: process.env.NODE_ENV,
			FIRST_SHARD: this.shards.first.toString(),
			LAST_SHARD: this.shards.last.toString(),
			TOTAL_SHARDS: this.shards.total.toString(),
			CLUSTER_ID: this.id.toString()
		});

		this.worker.once('exit', this.exitListenerFunction);

		this.debug(`Worker spawned with id ${this.worker.id}`);
		this.manager.emit(SharderEvents.CLUSTER_SPAWN, this);

		await this.waitForReady();
	}

	private waitForReady() {
		return new Promise((resolve, reject) => {
			this.once('ready', () => {
				this.ready = true;
				return resolve();
			});

			setTimeout(() => reject(new Error(`Cluster ${this.id} took too long to get ready`)),
				this.manager.timeout * this.shards.total);
		});
	}

	private exitListener(code: number, signal: string) {
		this.ready = false;
		this.worker = undefined;

		this.debug(`Worker exited with code ${code} and signal ${signal}`);

		this.respawn();
	}

	private debug(message: string) {
		this.manager.emit(SharderEvents.DEBUG, '[Cluster] ' + message);
	}
}
