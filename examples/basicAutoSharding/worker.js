const assert = require('assert').strict;
const { BaseClusterWorker, Util } = require('../../dist');

module.exports = class Worker extends BaseClusterWorker {
	async launch() {
		await this.client.connect();

		await Util.sleep(1000);
		await this.testEval();
	}

	async testEval() {
		console.log('Testing eval on master from cluster');
		const result = await this.ipc.sendMasterEval('this.clusters.size');
		console.log('> Result of eval(this.clusters.size) on master:', result);
		assert.equal(result, 1);
		return;
	}
}
