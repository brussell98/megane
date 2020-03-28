const assert = require('assert').strict;
const { BaseClusterWorker, IPCEvents, Util } = require('../../dist');

const commandList = ['test', 'avatar', 'set', 'get'];

module.exports = class Bot extends BaseClusterWorker {
	async launch() {
		await this.client.connect();

		this.client.on('messageCreate', this.handleMessage.bind(this));
	}

	handleMessage(message) {
		if (message.bot || !message.content.startsWith('!'))
			return;

		const [, command, args] = /!([a-z]+)(?: (.+))?/u.exec(message.content);
		if (commandList.includes(command))
			this[command](message, args);
	}

	test(message) {
		return message.channel.createMessage(`I am listening on cluster ${this.id}`);
	}

	avatar(message) {
		return message.channel.createMessage('Your avatar: ' + message.author.avatarURL);
	}

	async set(message, args) {
		const [key, ...value] = args.split(' ');
		if (!key || value.length === 0)
			return message.channel.createMessage('You must give a key and value');

		const { success, d } = await this.ipc.send({ op: IPCEvents.SET, d: { key, value: value.join(' ') } }, { receptive: true });
		if (!success)
			return message.channel.createMessage('Failed to set: ' + d.message);

		return message.channel.createMessage(`${d.replaced ? 'Replaced' : 'Set'} key "${key}"`);
	}

	async get(message, args) {
		if (!args || args.includes(' '))
			return message.channel.createMessage('Invalid key');

		const { success, d } = await this.ipc.send({ op: IPCEvents.GET, d: { key: args } }, { receptive: true });
		if (!success)
			return message.channel.createMessage('Failed to get: ' + d.message);

		if (!d.found)
			return message.channel.createMessage('Key not found');

		return message.channel.createMessage(`Value for key "${args}": ${d.value}`);
	}
}
