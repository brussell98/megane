const { BaseServiceWorker, IPCEvents, Util } = require('../../dist');
const fetch = require('node-fetch');
const { inspect } = require('util');

module.exports = class JsonAPI extends BaseServiceWorker {
	async launch() {
		await this.getInitialData();
		await this.sendReady();

		setTimeout(async () => {
			try {
				console.log('[Service] Testing cluster commands');
				const guilds = await this.ipc.sendClusterCommand({ all: true }, { op: 'GET_USER_GUILDS', userId: '95286900801146880' }, { receptive: true });
				console.log('all:', guilds);

				const guilds2 = await this.ipc.sendClusterCommand({ clusterId: 0 }, { op: 'GET_USER_GUILDS', userId: '95286900801146880' }, { receptive: true });
				console.log('Cluster 0:', guilds2);

				const guilds3 = await this.ipc.sendClusterCommand({ guildId: '360620343729061908' }, { op: 'GET_USER_GUILDS', userId: '95286900801146880' }, { receptive: true });
				console.log('Guild id:', guilds3);

				const fetchedUser = await this.ipc.fetchUser('95286900801146880');
				console.log('Fetched user:', fetchedUser);

				const fetchedUsers = await this.ipc.fetchUsers(['95286900801146880', '191489507680452609']);
				console.log('Fetched users:', fetchedUsers);

				const fetchedGuilds = await this.ipc.fetchGuilds(['360620343729061908', '95288189362634752']);
				console.log('Fetched guilds:', inspect(fetchedGuilds, null, 100));
			} catch (error) {
				console.error(error);
			}
		}, 5e3);
	}

	async handleCommand(data, receptive) {
		if (data.op === 'GET_POST')
			return await this.getPostData(data.postId);

		if (receptive)
			return this.asError(new Error('Unknown command'));
	}

	async shutdown() {
		console.log('[Service] Shutting down...');
		await Util.sleep(2000);
		console.log('[Service] Ready to shut down');
	}

	allClustersReady() {
		console.log('[JsonAPI] All clusters ready');
	}

	async getInitialData() {
		const response = await fetch('https://jsonplaceholder.typicode.com/posts/1');

		if (await this.set('post.1', await response.json()) === true)
			console.log('[JsonAPI] Initial data fetched and stored');
	}

	async set(key, value) {
		const { success, d } = await this.ipc.send({ op: IPCEvents.SET, d: { key: 'json-api.' + key, value } }, { receptive: true });
		if (!success)
			console.error(`[JsonAPI] Failed to store data for key "${key}": ${Util.makeError(d)}`);

		return success;
	}

	async getPostData(postId) {
		try {
			const response = await fetch('https://jsonplaceholder.typicode.com/posts/' + postId);

			return this.asResponse(await response.json());
		} catch (error) {
			return this.asError(error);
		}
	}
}
