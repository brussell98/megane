# Changelog

## 0.11.0

* Added support for `max_concurrency` allowing multiple shards to connect at once
* Added support for Large Bot Sharding by setting `shardCount = 'auto-lbs'`
* Added a default `Cluster.launch()` method that simply connects the client
* Changed the API version used for the bot gateway request to v8
* Fixed TypeScript Promise type errors
