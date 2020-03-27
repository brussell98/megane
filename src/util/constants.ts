export enum IPCEvents {
	EVAL = 'eval',
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
	FETCH_CHANNEL = 'fetchChannel'
}

export enum SharderEvents {
	SPAWN = 'spawn',
	READY = 'ready',
	SHARD_CONNECTED = 'shardConnected',
	SHARD_READY = 'shardReady',
	SHARD_RESUMED = 'shardResumed',
	SHARD_DISCONNECT = 'shardDisconnect',
	DEBUG = 'debug',
	ERROR = 'error'
}
