import { strict as assert } from 'assert';
import { NextFunction, Request, Response } from 'express';
import { catchAsync } from '../controller/catch';
import AppError from '../utils/appError';
import { configDir } from '../utils/config';
import { invokeQueue } from '../utils/invoke';

// eslint-disable-next-line @typescript-eslint/no-empty-function
const noop = () => {};

describe('AppError', function () {
	it('should set message correctly', function () {
		const err = new AppError('Not found', 404);
		assert.strictEqual(err.message, 'Not found');
	});

	it('should set statusCode correctly', function () {
		const err = new AppError('Not found', 404);
		assert.strictEqual(err.statusCode, 404);
	});

	it('should set status to "fail" for 4xx errors', function () {
		const err4xx = new AppError('Bad request', 400);
		assert.strictEqual(err4xx.status, 'fail');

		const err4xxAlt = new AppError('Unauthorized', 401);
		assert.strictEqual(err4xxAlt.status, 'fail');
	});

	it('should set status to "error" for 5xx errors', function () {
		const err5xx = new AppError('Internal error', 500);
		assert.strictEqual(err5xx.status, 'error');

		const err5xxAlt = new AppError('Bad gateway', 502);
		assert.strictEqual(err5xxAlt.status, 'error');
	});

	it('should be an instance of Error', function () {
		const err = new AppError('Bad request', 400);
		assert.ok(err instanceof Error);
	});

	it('should capture a stack trace', function () {
		const err = new AppError('Test error', 400);
		assert.ok(err.stack !== undefined);
	});
});

describe('InvokeQueue', function () {
	it('should push an invocation and return a non-empty hex string ID', function () {
		const id = invokeQueue.push({ resolve: noop, reject: noop });
		assert.strictEqual(typeof id, 'string');
		assert.ok(id.length > 0);
		assert.match(id, /^[0-9a-f]+$/);
		invokeQueue.get(id); // clean up
	});

	it('should generate unique IDs for different pushes', function () {
		const id1 = invokeQueue.push({ resolve: noop, reject: noop });
		const id2 = invokeQueue.push({ resolve: noop, reject: noop });
		assert.notStrictEqual(id1, id2);
		invokeQueue.get(id1);
		invokeQueue.get(id2); // clean up
	});

	it('should retrieve the same invocation that was pushed', function () {
		const invocation = { resolve: noop, reject: noop };
		const id = invokeQueue.push(invocation);
		const retrieved = invokeQueue.get(id);
		assert.strictEqual(retrieved, invocation);
	});

	it('should return undefined after the invocation is consumed', function () {
		const id = invokeQueue.push({ resolve: noop, reject: noop });
		invokeQueue.get(id);
		const result = invokeQueue.get(id);
		assert.strictEqual(result, undefined);
	});
});

describe('catchAsync', function () {
	it('should pass errors to next() when the handler rejects', function (done) {
		const error = new Error('async error');
		const handler = catchAsync((_req, _res, _next) =>
			Promise.reject(error)
		);

		const mockNext: NextFunction = (err?: unknown) => {
			assert.strictEqual(err, error);
			done();
		};

		handler({} as Request, {} as Response, mockNext);
	});

	it('should not call next() when the async handler resolves successfully', async function () {
		let nextCalled = false;
		const handler = catchAsync((_req, _res, _next) => Promise.resolve());

		const mockNext: NextFunction = () => {
			nextCalled = true;
		};

		handler({} as Request, {} as Response, mockNext);
		await new Promise(resolve => setTimeout(resolve, 20));
		assert.strictEqual(nextCalled, false);
	});
});

describe('configDir', function () {
	it('should return a path that contains the given name', function () {
		const result = configDir('testapp');
		assert.ok(
			result.includes('testapp'),
			'Path should include the app name'
		);
	});

	it('should prefix with a dot on Unix', function () {
		if (process.platform !== 'win32') {
			const result = configDir('testapp');
			assert.ok(
				result.includes('.testapp'),
				'Unix path should use dotted directory'
			);
		}
	});

	it('should build path from HOME on Unix', function () {
		if (process.platform !== 'win32' && process.env.HOME) {
			const result = configDir('testapp');
			assert.ok(
				result.startsWith(process.env.HOME),
				'Path should start with HOME'
			);
		}
	});

	it('should throw when HOME is missing on Unix', function () {
		if (process.platform !== 'win32') {
			const originalHome = process.env.HOME;
			delete process.env.HOME;
			try {
				assert.throws(() => configDir('testapp'), /HOME/);
			} finally {
				if (originalHome !== undefined) {
					process.env.HOME = originalHome;
				}
			}
		}
	});
});
