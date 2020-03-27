import { Worker, fork } from 'cluster';
import { ShardManager } from '../sharding/ShardManager';
import { EventEmitter } from 'events';
import { SharderEvents } from '../util/constants';
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

	public kill() {
		this.ready = false;

		if (this.worker) {
			this.debug(`Killing cluster ${this.id}`);

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
			throw new Error('This cluster already has a spawned worker');

		this.worker = fork({
			FIRST_SHARD: this.shards.first.toString(),
			LAST_SHARD: this.shards.last.toString(),
			SHARD_COUNT: this.shards.total.toString(),
			CLUSTER_ID: this.id.toString()
		});

		this.worker.once('exit', this.exitListenerFunction);

		this.debug(`Worker spawned with id ${this.worker.id}`);
		this.manager.emit(SharderEvents.SPAWN, this);

		await this.waitForReady();
	}

	private waitForReady() {
		return new Promise((resolve, reject) => {
			this.once('ready', () => {
				this.ready = true;
				return resolve();
			});

			setTimeout(() => reject(new Error(`Cluster ${this.id} took too long to get ready`)),
				this.manager.timeout * this.shards.total * (this.manager.guildsPerShard / 1000));
		});
	}

	private exitListener(code: number, signal: string) {
		this.ready = false;
		this.worker = undefined;

		this.debug(`Worker exited with code ${code} and signal ${signal}`);

		this.respawn();
	}

	private debug(message: string) {
		this.manager.emit(SharderEvents.DEBUG, message);
	}
}
