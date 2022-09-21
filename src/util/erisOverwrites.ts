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
		'activity',
		'application',
		'attachments',
		'author',
		'content',
		'editedTimestamp',
		'embeds',
		'flags',
		'guildID',
		'hit',
		'member',
		'mentionEveryone',
		'mentions',
		'messageReference',
		'pinned',
		'reactions',
		'referencedMessage',
		'roleMentions',
		'stickers',
		'stickerItems',
		'timestamp',
		'tts',
		'type',
		'webhookID',

		'cleanContent',
		'channelMentions',
		...props
	]);
};

Member.prototype.toJSON = function(props: string[] = []) {
	return Base.prototype.toJSON.call(this, [
		'activities',
		'communicationDisabledUntil',
		'joinedAt',
		'nick',
		'pending',
		'premiumSince',
		'roles',
		'status',
		'user',
		'voiceState',

		'createdAt',
		'clientStatus',
		'permissions',
		'avatarURL',
		...props
	]);
};

User.prototype.toJSON = function(props: string[] = []) {
	return Base.prototype.toJSON.call(this, [
		'accentColor',
		'avatar',
		'banner',
		'bot',
		'discriminator',
		'publicFlags',
		'system',
		'username',

		'createdAt',
		'defaultAvatarURL',
		'staticAvatarURL',
		'avatarURL',
		...props
	]);
};
