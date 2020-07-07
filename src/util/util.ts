import { promisify } from 'util';
import { IPCError } from '..';

export const sleep = promisify(setTimeout);

export function makeError(data: any) {
	if (!data)
		return data;

	const error = new Error(data.message);
	error.name = data.name;
	error.stack = data.stack;

	return error;
}

export function transformError(error: Error): IPCError {
	if (!error)
		return error;

	return {
		name: error.name,
		message: error.message,
		stack: error.stack
	};
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
