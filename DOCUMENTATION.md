***NOT UPDATED SINCE v0.2.0***

### Using ShardManager

Constructor options:
|Option|Required|Type|Default|Description|
|---|---|---|---|---|
|path|Yes|string||Path to the file for clusters to run|
|token|Yes|string||Discord bot token|
|guildsPerShard|No|number|1500|Number of guilds each shard should have (at initial sharding) (Only used if shardCount is set to 'auto')|
|shardCount|No|number \| 'auto'|'auto'|Number of shards to create|
|clusterCount|No|number|cpus().length|Maximum number of clusters to create|
|clientOptions|No|Eris.ClientOptions|{ }|Options to pass to the Eris client constructor|
|timeout|No|number|30e3|How long to wait for a cluster to connect before throwing an error, multiplied by the number of thousands of guilds|
|nodeArgs|No|string[]||An array of arguments to pass to the cluster node processes|
|ipcSocket|No|string \| number|8191|The socket/port for IPC to run on|

Events:
|Event|Parameters|Description|
|---|---|---|
|spawn|cluster|Emitted when a cluster spawns|
|ready|cluster|Emitted when a cluster becomes ready|
|shardConnected|clusterId, shardId|Emitted when a shard connects (before ready)|
|shardReady|clusterId, shardId|Emitted the first time a shard becomes ready|
|shardResumed|clusterId, shardId|Emitted when a shard resumes|
|shardDisconnect|clusterId, shardId, error|Emitted when a shard disconnects|
|debug|message|Debug messages|
|error|error, clusterId?, shardId?|Emitted when there is an error|

*The easiest way to reference event names is to use the SharderEvents enum*

Properties:
- `clusters`: A `Map<number, Cluster>` of clusters by their (zero-indexed) id
- `store`: A `Map<string, any>` serving as the central data store for clusters
- `ipc`: A `MasterIPC` controller allowing direct communication with cluster workers

Methods:
- `restartAll()`: Restart all clusters
- `restart(clusterId: number)`: Restart a specific cluster

### Using BaseClusterWorker

The constructor must accept one parameter: The ShardManager. This must be passed to super() before anything else is done.

Properties:
- `manager`: The `ShardManager`
- `client`: The Eris client, created with the supplied token and options
- `id`: The worker's cluster id
- `ipc`: A `ClusterWorkerIPC` controller allowing direct communication with the master process

Methods:
- `launch()`: A method that must be implemented, which is called at the end of starting the worker. It's a good idea to connect the client here
- `getUser(query: string)`: Returns a `User` or null. This is used for the GET_USER IPC event and may be overridden.
	- `query`: An id, name, or partial name
- `getChannel(id: string)`: Returns an `AnyChannel` or null. This is used for the GET_CHANNEL IPC event and may be overridden.
- `getGuild(id: string)`: Returns a `Guild` or null. This is used for the GET_GUILD IPC event and may be overridden.

### Using Cluster

Properties:
- `manager`: The `ShardManager`
- `ready`: A boolean indicating whether the worker's client is ready
- `id`: The cluster's id
- `shards`: An object containing the cluster's shard information (Should generally not be used)

Methods:
- `send(data: object, options?: SendOptions)`: A shortcut for `MasterIPC.sendTo()`
- `kill()`: Kill the worker
- `respawn(delay?: number)`: Respawn the worker. Delay can be used to change how long to wait between killing the worker and spawning a new one
- `spawn()`: Spawns the worker (Should generally not be used)

### Using MasterIPC

Properties:
- `manager`: The `ShardManager`

Methods:
- `sendTo(recipient: string, data: object, options?: SendOptions = { })`: Send a message
	- `recipient`: Should be in the format "cluster:0"
	- `data`: An object formatted like so: `{ op: IPCEvents.X, d: { ... } }`
	- `options`: A veza `SendOptions` object, specifying if the message is receptive and the timeout
- `broadcast(data: object, options?: SendOptions = { })`: Same as above, but sends a message to all clients
- `sendEval(script: string | Function, clusterId?: number)`: Runs `eval(script)` on the cluster(s) `ClusterWorker`. Returns an array of the results, or just the result if `clusterId` is specified

### Using ClusterWorkerIPC

Properties:
- `manager`: The `ShardManager`

Methods:
- `send(data: object, options?: SendOptions = { })`: Send a message
	- `data`: An object formatted like so: `{ op: IPCEvents.X, d: { ... } }`
	- `options`: A veza `SendOptions` object, specifying if the message is receptive and the timeout
- `sendEval(script: string | Function)`: Runs `eval(script)` on the master `ShardManager`. Returns the result
- `fetchUser(query: string, clusterId?: number)`: Fetches a user from other clusters
	- `query`: An id, name, or partial name
- `fetchChannel(id: string, clusterId?: number)`: Fetches a channel from other clusters
- `fetchGuild(id: string, clusterId?: number)`: Fetches a guild from other clusters
