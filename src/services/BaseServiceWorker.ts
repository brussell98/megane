import { ServiceWorkerIPC } from './ServiceWorkerIPC';
import { ShardManager } from '../sharding/ShardManager';
import { IPCEvents } from '../util/constants';
import { transformError } from '../util/util';
import { IPCResult } from '../';

export abstract class BaseServiceWorker {
	/** The worker's service name */
	public readonly name: string;
	/** The worker's IPC client */
	public readonly ipc: ServiceWorkerIPC;

	public constructor(public manager: ShardManager) {
		this.name = String(process.env.SERVICE_NAME);
		this.ipc = new ServiceWorkerIPC(this, this.manager.ipcSocket);

		process.on('exit', () => {
			this.ipc.disconnect();
			process.exit(0);
		});
	}

	public async init() {
		await this.ipc.init();

		await this.launch();
	}

	/** Notify the master process that this service is ready (required) */
	protected sendReady() {
		return this.ipc.send({ op: IPCEvents.READY, d: { name: this.name } });
	}

	/** Can be implemented to allow for graceful shutdown of the service */
	public abstract shutdown(): Promise<void> | void;

	/**
	 * Is called after the worker is initialized with an IPC client. This method must be implemented.
	 * @abstract
	 */
	protected abstract launch(): Promise<void> | void;

	/**
	 * Is called only once, when all clusters have emitted a ready event on startup
	 * @abstract
	 */
	public abstract allClustersReady(): Promise<void> | void;

	/**
	 * Allows returning an object containing additional stats to return during stats collection
	 * @abstract
	 */
	public abstract getStats(): Promise<Record<string, any>> | Record<string, any>;

	public async eval(script: string) {
		// eslint-disable-next-line no-eval
		return await eval(script);
	}

	/**
	 * Is called when a SERVICE_COMMAND event is received.
	 * If the event is receptive then an IPCResult must be returned.
	 */
	public async handleCommand(data: any, receptive: boolean): Promise<IPCResult | void> {
		if (receptive)
			return this.asError(new Error('This service is not set up to handle commands'));
	}

	/** Formats data as a response to an IPC event or command */
	public asResponse(data: any) {
		return { success: true, d: data };
	}

	/** Formats an error as a response to an IPC event or command */
	public asError(error: Error) {
		return { success: false, d: transformError(error) };
	}
}
