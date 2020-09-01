import { Base, Channel, Member, Message, User } from 'eris';

Channel.prototype.toJSON = function(props: string[] = []) {
	return Base.prototype.toJSON.call(this, [
		'type',

		'createdAt',
		...props
	]);
};

Message.prototype.toJSON = function(props: string[] = []) {
	return Base.prototype.toJSON.call(this, [
		'attachments',
		'author',
		'content',
		'editedTimestamp',
		'embeds',
		'hit',
		'mentionEveryone',
		'mentions',
		'pinned',
		'reactions',
		'roleMentions',
		'timestamp',
		'tts',
		'type',

		'webhookID',
		'messageReference',
		'flags',
		'activity',
		'application',
		'cleanContent',
		'channelMentions',
		...props
	]);
};

Member.prototype.toJSON = function(props: string[] = []) {
	return Base.prototype.toJSON.call(this, [
		'game',
		'joinedAt',
		'nick',
		'roles',
		'status',
		'user',
		'voiceState',
		'premiumSince',

		'createdAt',
		'clientStatus',
		'activities',
		'voiceState',
		'permission',
		'avatarURL',
		...props
	]);
};

User.prototype.toJSON = function(props: string[] = []) {
	return Base.prototype.toJSON.call(this, [
		'avatar',
		'bot',
		'discriminator',
		'username',

		'createdAt',
		'publicFlags',
		'defaultAvatarURL',
		'staticAvatarURL',
		'avatarURL',
		...props
	]);
};
