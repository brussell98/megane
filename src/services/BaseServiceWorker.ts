import { ServiceWorkerIPC } from './ServiceWorkerIPC';
import { ShardManager } from '../sharding/ShardManager';
import { IPCEvents } from '../util/constants';
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
		return this.ipc.server.send({ op: IPCEvents.READY, d: { name: this.name } });
	}

	/** Can be implemented to allow for graceful shutdown of the service */
	public abstract shutdown(): Promise<void> | void;

	/**
	 * Is called after the worker is initialized with an IPC client. This method must be implemented.
	 * @abstract
	 */
	protected abstract launch(): Promise<void> | void;

	public async eval(script: string) {
		// eslint-disable-next-line no-eval
		return await eval(script);
	}

	/**
	 * Is called when a SERVICE_COMMAND event is received.
	 * If the event is receptive then an IPCResult must be returned.
	 * @abstract
	 */
	public abstract async handleCommand(data: any, receptive: boolean): Promise<IPCResult | void>;

	/** Formats data as a response to an IPC event or command */
	public asResponse(data: any) {
		return { success: true, d: data };
	}

	/** Formats an error as a response to an IPC event or command */
	public asError(error: Error) {
		return { success: false, d: { name: error.name, message: error.message, stack: error.stack } };
	}
}
