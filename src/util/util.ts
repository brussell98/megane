import { promisify } from 'util';

export const sleep = promisify(setTimeout);

export function makeError(data: any) {
	const error = new Error(data.message);
	error.name = data.name;
	error.stack = data.stack;

	return error;
}

export function getIdFromSocketName(name: string | null): number | null {
	if (!name)
		return null;

	const nameRegex = /\d+$/.exec(name);
	if (!nameRegex)
		return null;

	return parseInt(nameRegex[0], 10);
}

