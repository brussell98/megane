# Megane

A sharding manager for Discord bots. Megane distributes your shards across (logical) CPU cores. Megane uses [Eris](https://github.com/abalabahaha/eris) to interface with the Discord API. Based on [Kurasuta](https://github.com/DevYukine/Kurasuta).

## Features

- Automatic clustering and sharding of your bot across CPU cores
- Central data store that all clusters can access and modify
- Simple and extensible way to get users, channels, and guilds from other clusters
- Run eval over IPC
- Restart individual clusters instead of the whole bot at once
- Create worker processes to interact with APIs or do other expensive or central tasks
- Automatic collection of statistics

Features to add before 1.0:

- (IPC) Optional messages in text channels

Features to be added after 1.0:

- Rolling restart helper
- Re-sharding
- Improve IPC usability (need suggestions)
- A way to easily extend the stats returned by workers

## Considerations

Splitting your bot into multiple processes should not be done unless needed. Megane has some downsides compared to how a normal bot works. Make sure you consider these first:

- Developing will be more complicated due to the need to use ipc and lack of a complete local cache
- Fetching users, channels, guilds, or other structures from other processes will remove the ability to use methods without manually recreating them. Certain properties may also be missing after converting to plain objects

## Using

Package name: `@brussell98/megane`

*You can see working examples by browsing the `examples` folder*

### Getting Started

You will have at least two main files:
1. A file for your "master" process, which creates a new `ShardManager`. We will call this file "index.js"
2. A file for your "cluster" process (the worker), which extends `BaseClusterWorker`. We will call this file "bot.js"

In your `index.js` file you should have some code similar to this:
```js
const { isMaster } = require('cluster');
const { ShardManager } = require('@brussell98/megane');

const manager = new ShardManager({
	path: __dirname + '/bot.js',
	token: 'Your bot token'
});

manager.spawn(); // You should await this

if (isMaster) {
	// Master process code here
	manager.on('error', error => console.error(error)); // Not handling these errors will kill everything when any error is emitted
	manager.on('debug', message => console.log(message));
	manager.on('clusterReady', cluster => console.log(`Cluster ${cluster.id} ready`));
	manager.once('allClustersReady', () => console.log('All clusters ready'));
}
```
This will create a new `ShardManager` which will run `bot.js` on separate processes. The worker file (`bot.js`) **must** implement a `BaseClusterWorker`. This will be demonstrated next.

Note the `isMaster` block. Your index.js file will be run each time a worker is created. Any code you only want to run on the master process must check if it's running on the master process.

Next, your `bot.js` file should implement a ClusterWorker, like so:
```js
const { BaseClusterWorker } = require('@brussell98/megane');

module.exports = class BotWorker extends BaseClusterWorker {
	constructor(manager) {
		super(manager);
	}

	async launch() {
		// Anything you want to run when the worker starts
		// This is run after the IPC is initialized
		await this.client.connect(); // Connect eris to Discord
	}
}
```

### Services

In many cases you will have tasks that are used by all clusters. One example is updating Twitch API data. You can create a service to handle this and it will run in its own process, accessible by all clusters. Add the following code to your `index.js` file:
```js
if (isMaster) {
	// ...
	manager.on('serviceReady', service => console.log(`Service ${service.name} ready`));

	manager.registerService(__dirname + '/service.js', { name: 'example-service', timeout: 60e3 });
}
```
This will register a service named "example-service" and spawn a worker. The service worker is implemented similarly to a cluster worker.

Here is an example of what your `service.js` file should look like:
```js
const { BaseServiceWorker } = require('@brussell98/megane');

module.exports = class ServiceWorker extends BaseServiceWorker {
	constructor(manager) {
		super(manager);
	}

	async launch() {
		// Anything you want to run when the worker starts
		// This is run after the IPC is initialized
		await this.sendReady(); // Required to be sent before `timeout`
	}

	// Handles SERVICE_COMMAND events
	handleCommand(data, receptive) {
		if (data.op === 'PING')
			return receptive && this.asResponse('PONG');

		if (receptive)
			return this.asError(new Error('Unknown command'));
	}
}
```
Your bot can then send commands like this:
```js
const reply = await this.ipc.sendCommand('example-service', { op: 'PING' }, { receptive: true });
console.log(reply); // PONG
```

### Diagram

```
Master:
index.js -> ShardManager -> Clusters
						 -> Services
						 -> MasterIPC

ClusterWorker:
index.js -> ShardManager -> bot.js -> ClusterWorkerIPC

ServiceWorker:
index.js -> ShardManager -> service.js -> ServiceWorkerIPC
```

### Documentation

Refer to [DOCUMENTATION.md](DOCUMENTATION.md)

### Changelog

Refer to [CHANGELOG.md](CHANGELOG.md)

## Naming

This was created to be used for [Mirai Bot for Discord](https://mirai.brussell.me). The bot is named after the anime character [Mirai Kuriyama (栗山 未来)](https://myanimelist.net/character/81751/Mirai_Kuriyama), who notably wears red glasses [[Megane (めがね)](https://jisho.org/word/眼鏡)].
