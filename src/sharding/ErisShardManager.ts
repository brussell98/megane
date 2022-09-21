import type { Client } from 'eris';
import { Base, Collection, Shard } from 'eris';

export default class ErisShardManager extends Collection<Shard> {
	public buckets: Map<number, number> = new Map(); // Required because of types
	public connectQueue: Shard[];
	public connecting: number;
	public lastConnect: number;
	public connectTimeout: NodeJS.Timeout | null;

	constructor(public client: Client, public maxConcurrency: number = 1) {
		super(Shard);

		this.connectQueue = [];
		this.connecting = 0;
		this.lastConnect = 0;
		this.connectTimeout = null;
	}

	public connect(shard: Shard) {
		if ((shard as any).sessionID) {
			shard.connect();

			this.lastConnect = Date.now() + 7.5e3;
			this.connecting++;
		} else {
			this.connectQueue.push(shard);
			this.tryConnect();
		}
	}

	public spawn(id: number) {
		let shard = this.get(id);
		if (!shard) {
			shard = this.add(new Shard(id, this.client));
			shard.on('ready', () => {
				/**
				* Fired when a shard turns ready
				* @event Client#shardReady
				* @prop {Number} id The ID of the shard
				*/
				this.client.emit('shardReady', shard!.id);
				if ((this.client as any).ready)
					return;

				for (const other of this.values())
					if (!other.ready)
						return;

				(this.client as any).ready = true;
				this.client.startTime = Date.now();
				/**
				* Fired when all shards turn ready
				* @event Client#ready
				*/
				this.client.emit('ready');
			}).on('resume', () => {
				/**
				* Fired when a shard resumes
				* @event Client#shardResume
				* @prop {Number} id The ID of the shard
				*/
				this.client.emit('shardResume', shard!.id);
				if ((this.client as any).ready)
					return;

				for (const other of this.values())
					if (!other.ready)
						return;

				(this.client as any).ready = true;
				this.client.startTime = Date.now();
				this.client.emit('ready');
			}).on('disconnect', error => {
				/**
				* Fired when a shard disconnects
				* @event Client#shardDisconnect
				* @prop {Error?} error The error, if any
				* @prop {Number} id The ID of the shard
				*/
				this.client.emit('shardDisconnect', error, shard!.id);
				for (const other of this.values())
					if (other.ready)
						return;

				(this.client as any).ready = false;
				this.client.startTime = 0;
				/**
				* Fired when all shards disconnect
				* @event Client#disconnect
				*/
				this.client.emit('disconnect');
			});
		}

		if (shard.status === 'disconnected')
			this.connect(shard);
	}

	public tryConnect() {
		if (this.connectQueue.length === 0)
			return;

		if (this.lastConnect <= Date.now() - 5e3 || this.connecting < this.maxConcurrency) {
			if (this.lastConnect <= Date.now() - 5e3) // Rate-limit expired, next set of shards begins
				this.connecting = 0;

			let i = this.maxConcurrency - this.connecting;
			let shard: Shard;
			while (i-- > 0 && (shard = this.connectQueue.shift()!)) {
				this.connecting++;
				shard.connect();
			}

			this.lastConnect = Date.now() + 7.5e3;

		} else if (!this.connectTimeout)
			this.connectTimeout = setTimeout(() => {
				this.connectTimeout = null;
				this.tryConnect();
			}, 1e3);
	}

	public _readyPacketCB() {
		// NOTE: This will fail to enforce the rate-limit if shards start connecting late in the same pool, and more queue up after
		this.lastConnect = Date.now();
		this.tryConnect();
	}

	public toString() {
		return `[ShardManager ${this.size}]`;
	}

	public toJSON(props = []) {
		return Base.prototype.toJSON.call(this, [
			'connectQueue',
			'connecting',
			'lastConnect',
			'connectionTimeout',
			...props
		]);
	}
}
