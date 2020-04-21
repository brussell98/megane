export enum IPCEvents {
	EVAL = 'eval',
	SERVICE_EVAL = 'serviceEval',
	READY = 'ready',
	SHARD_READY = 'shardReady',
	SHARD_CONNECTED = 'shardConnected',
	SHARD_RESUMED = 'shardResumed',
	SHARD_DISCONNECTED = 'shardDisconnected',
	ERROR = 'error',
	RESTART = 'restart',
	GET = 'get',
	SET = 'set',
	FETCH_USER = 'fetchUser',
	FETCH_GUILD = 'fetchGuild',
	FETCH_CHANNEL = 'fetchChannel',
	SERVICE_COMMAND = 'serviceCommand'
}

export enum SharderEvents {
	SERVICE_SPAWN = 'serviceSpawn',
	SERVICE_READY = 'serviceReady',
	CLUSTER_SPAWN = 'clusterSpawn',
	CLUSTER_READY = 'clusterReady',
	SHARD_CONNECTED = 'shardConnected',
	SHARD_READY = 'shardReady',
	SHARD_RESUMED = 'shardResumed',
	SHARD_DISCONNECT = 'shardDisconnect',
	DEBUG = 'debug',
	ERROR = 'error'
}
