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
	CLUSTER_COMMAND = 'clusterCommand',
	GET_STATS = 'getStats',
	ALL_MEMBERS_CACHED = 'allMembersCached'
}

export enum SharderEvents {
	SERVICE_SPAWN = 'serviceSpawn',
	SERVICE_READY = 'serviceReady',
	CLUSTER_SPAWN = 'clusterSpawn',
	CLUSTER_READY = 'clusterReady',
	ALL_CLUSTERS_READY = 'allClustersReady',
	SHARD_CONNECTED = 'shardConnected',
	SHARD_READY = 'shardReady',
	SHARD_RESUMED = 'shardResumed',
	SHARD_DISCONNECT = 'shardDisconnected',
	SHARD_DISCONNECTED = 'shardDisconnected',
	STATS_UPDATED = 'statsUpdated',
	ALL_MEMBERS_CACHED = 'allMembersCached',
	DEBUG = 'debug',
	ERROR = 'error'
}
