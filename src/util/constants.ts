export enum IPCEvents {
	EVAL = 'eval',
	SERVICE_EVAL = 'serviceEval',
	READY = 'ready',
	SHARD_READY = 'shardReady',
	SHARD_CONNECTED = 'shardConnected',
	SHARD_RESUMED = 'shardResumed',
	SHARD_DISCONNECTED = 'shardDisconnected',
	ERROR = 'error',
	SHUTDOWN = 'shutdown',
	GET = 'get',
	SET = 'set',
	FETCH_USER = 'fetchUser',
	FETCH_GUILD = 'fetchGuild',
	FETCH_CHANNEL = 'fetchChannel',
	SERVICE_COMMAND = 'serviceCommand',
	GET_STATS = 'getStats'
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
	STATS_UPDATED = 'statsUpdated',
	DEBUG = 'debug',
	ERROR = 'error'
}
