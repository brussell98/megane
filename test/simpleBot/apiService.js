const { BaseServiceWorker, IPCEvents, Util } = require('../../dist');
const fetch = require('node-fetch');

module.exports = class JsonAPI extends BaseServiceWorker {
	async launch() {
		await this.getInitialData();
		await this.sendReady();
	}

	async handleCommand(data, receptive) {
		if (data.op === 'GET_POST')
			return await this.getPostData(data.postId);

		if (receptive)
			return this.asError(new Error('Unknown command'));
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
