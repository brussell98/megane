import { promisify } from 'util';

export const sleep = promisify(setTimeout);

export function makeError(data: any) {
	const error = new Error(data.message);
	error.name = data.name;
	error.stack = data.stack;

	return error;
}

export function getIdFromSocketName(name: string | null): string | number | null {
	if (!name)
		return null;

	if (name.startsWith('megane:service:'))
		return name.substr(15);

	const nameRegex = /\d+$/.exec(name);
	if (!nameRegex)
		return null;

	return parseInt(nameRegex[0], 10);
}

