## Restart and Shutdown

### Clusters

You can restart a cluster or all clusters with the manager's `restart(id)` and `restartAll()` methods.

You can also call the the methods on a cluster directly. A cluster can be accessed with `manager.clusters.get(id)`. You can then call `kill(timeout?)`, `respawn()`, or `spawn()`.

### Services

Services do not have restart methods on the manager, but you can respawn or kill their workers directly just like with clusters. Use `manager.services.get(name)`.

### Graceful Shutdown

Each cluster and service worker has a method called `shutdown()` which is called and awaited when a worker is killed. By default on clusters it disconnects the Eris client. If you have other things you need to wait on you can override it, but for clusters make sure you await `super.shutdown()` or disconnect the client yourself.

When directly calling `kill()` you can specify a timeout in milliseconds. After this amount of time passes the process will be killed whether it has completed it's tasks or not.

## Statistics

The master process (the manager) automatically collects stats about all of it's workers. These can be accessed through `manager.stats` and are updated every minute. This interval can be changed with the `statsInterval` option. To see the structure of the stats object see the `MeganeStats` interface in [index.ts](./src/index.ts)

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