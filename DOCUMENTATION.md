## Startup

### All Clusters Ready

You can wait to execute code until all clusters have emitted their first "ready" event. For the master process, the sharder emits a `allClustersReady` event. For workers, there is an `allClustersReady()` method that will be called. This is useful if you want your services to not start doing things until they have access to all data.

### All Members Cached

Megane has custom caching logic you can enable with the `cacheAllMembers` option. This will *not* fetch guild members before ready, but instead after. When all shards on a cluster have their guild members cached then `allMembersCached(false)` will be called, if implemented.

Once this is completed on all clusters then `allMembersCached(true)` will be called on all clusters, and `allMembersCached()` on services, if implemented.

The `ShardManager` will also emit the `SharderEvents.ALL_MEMBERS_CACHED` event in each of these situations. When only one cluster has finished then the cluster id will be provided. Remember not to simply do `!cluserId`, as that will evaluate to true for cluster 0.

Due to the functionality of this, the final call will always happen after `allClustersReady` is called.

## Restart and Shutdown

### Clusters

You can restart a cluster or all clusters with the manager's `restart(id)` and `restartAll()` methods.

You can also call the the methods on a cluster directly. A cluster can be accessed with `manager.clusters.get(id)`. You can then call `kill(timeout?)`, `respawn()`, or `spawn()`.

### Services

Services do not have restart methods on the manager, but you can respawn or kill their workers directly just like with clusters. Use `manager.services.get(name)`.

### Graceful Shutdown

Each cluster and service worker has a method called `shutdown()` which is called and awaited when a worker is killed. By default on clusters it disconnects the Eris client. If you have other things you need to wait on you can override it, but for clusters make sure you await `super.shutdown()` or disconnect the client yourself.

When directly calling `kill()` you can specify a timeout in milliseconds. After this amount of time passes the process will be killed whether it has completed it's tasks or not.

## IPC

Work in progress...

### Fetch Guilds, Channels, and Users

Work in progress...

### Commands

Megane provides an easy way to execute code on other clusters or on services.

#### Sending Commands

```js
const data = {
	// The data you are sending
};

const options = {
	receptive: true, // If you expect a response
	timeout: 10e3 // Optional maximum time to wait for a response
};

// Send a command to a service
this.ipc.sendServiceCommand('service-name', { ...data }, { ...options });
// Send a command to all clusters, response is an IPCEvalResults: { results: [], errors: [] }
this.ipc.sendClusterCommand({ all: true }, { ...data }, { ...options });
// Send a command to a cluster
this.ipc.sendClusterCommand({ clusterId: 0 }, { ...data }, { ...options });
// Send a command to a cluster handling a certain guild
this.ipc.sendClusterCommand({ guildId: '446425626988249089' }, { ...data }, { ...options });
```

#### Handling Commands

```ts
async handleCommand(data: any, receptive: boolean): Promise<IPCResult | void> {
	// Handle the command however you want

	// Receptive commands MUST have a return value
	// To send a response:
	return this.asResponse(response: any);
	// To send an error
	return this.asError(new Error('An error'));
}
```

## Stats

By default the `ShardManager` will collect stats every minute from all of the processes. Every time these stats are updated, the `SharderEvents.STATS_UPDATED` is emitted. You can also access the stats at any time through `shardManager.stats`. The stats object has this schema as seen in [index.ts](./src/index.ts):

```ts
interface ProcessStats {
	/** https://nodejs.org/api/process.html#process_process_memoryusage */
	memory: NodeJS.MemoryUsage;
	/** https://nodejs.org/api/process.html#process_process_cpuusage_previousvalue */
	cpu: NodeJS.CpuUsage;
	discord?: {
		guilds: number;
		/** How long in milliseconds the bot has been up for */
		uptime: number;
		/** The current latency between the shard and Discord, in milliseconds */
		shardLatency: Record<string, number>;
		/** The shard's connection status */
		shardStatus: Record<string, 'disconnected' | 'connecting' | 'handshaking' | 'ready' | 'resuming'>;
	};
}

interface MeganeStats {
	clusters: Record<string, ProcessStats>;
	services: Record<string, ProcessStats>;
	manager: ProcessStats;
}
```

Additionally, you can extend these as needed. Both cluster and service workers allow a `getStats()` method which must return an object to be merged with the existing stats. This method may be synchronous or asynchronous.
