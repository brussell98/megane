# Changelog

## Upcoming

Eris is no-longer a maintained library. Meanwhile discord.js has high adoption, active maintainers, and better usability.
Megane will be migrating to it in the future.

## 0.13.0

* **[Breaking]** Changed the `shardDisconnect` event to `shardDisconnected` for consistency. It should have been this originally but it was missed.
* TypeScript updates
* Updated eris `toJSON` overrides

## 0.12.0

* **[Breaking]** IPC fetch changes
	* Added a third argument to fetchUser(s) to only get by id for optimization
		* `ClusterWorker#getUser()` now has a second argument `isId` which specifies whether to only match ids
	* Rearranged the arguments for fetchGuild(s) to be consistent. It is now `id, clusterId, includeMembers`
	* `clusterId` now accepts `null` when leaving it unspecified
	* Expect these third named arguments to have a breaking change in the future making them options objects allowing better custom getX methods

* Removed the examples folder from the npm distribution

## 0.11.0

* Added support for `max_concurrency` allowing multiple shards to connect at once
* Added support for Large Bot Sharding by setting `shardCount = 'auto-lbs'`
* Added a default `Cluster.launch()` method that simply connects the client
* Changed the API version used for the bot gateway request to v8
* Fixed TypeScript Promise type errors
