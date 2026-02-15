import supertest from 'supertest';
import { strict as assert } from 'assert';
import { execSync } from 'child_process';

const BASE_URL = process.env.FAAS_URL || 'http://localhost:9000';
const MAX_RETRIES = 30;
const IS_STARTUP_DEPLOY = process.env.TEST_FAAS_STARTUP_DEPLOY === 'true';

const request = supertest(BASE_URL);

function getPrefix(suffix: string): string {
	const output = execSync('metacall-deploy --dev --inspect Raw', {
		encoding: 'utf-8'
	});
	const deployments = JSON.parse(output) as Array<{
		suffix: string;
		prefix: string;
	}>;
	const match = deployments.find(d => d.suffix === suffix);
	return match ? match.prefix : '';
}

function deploy(appDir: string): void {
	if (!IS_STARTUP_DEPLOY) {
		execSync('metacall-deploy --dev', {
			cwd: appDir,
			encoding: 'utf-8'
		});
	}
}

async function waitForReadiness(): Promise<void> {
	for (let i = 0; i < MAX_RETRIES; i++) {
		try {
			const res = await request.get('/api/readiness');
			if (res.status === 200) return;
		} catch {
			// Server not ready yet
		}
		await new Promise(resolve => setTimeout(resolve, 1000));
	}
	throw new Error(`Readiness check failed after ${MAX_RETRIES} retries.`);
}

describe('FaaS Integration Tests', function () {
	this.timeout(120_000);

	const deployedApps: Array<{ app: string; prefix: string }> = [];

	before(async function () {
		await waitForReadiness();
	});

	describe('Readiness', function () {
		it('should return 200 on /api/readiness', async function () {
			await request.get('/api/readiness').expect(200);
		});
	});

	describe('Package Deployment Tests', function () {
		describe('nodejs-base-app', function () {
			let prefix: string;
			let callUrl: string;

			before(function () {
				deploy('data/nodejs-base-app');
				prefix = getPrefix('nodejs-base-app');
				callUrl = `/${prefix}/nodejs-base-app/v1/call`;
				if (IS_STARTUP_DEPLOY) {
					deployedApps.push({
						app: 'nodejs-base-app',
						prefix
					});
				}
			});

			it('should return true for palindrome "madam"', async function () {
				const res = await request
					.post(`${callUrl}/isPalindrome`)
					.send({ params: ['madam'] })
					.set('Content-Type', 'application/json');
				assert.strictEqual(res.body, true);
			});

			it('should return false for non-palindrome "world"', async function () {
				const res = await request
					.post(`${callUrl}/isPalindrome`)
					.send({ params: ['world'] })
					.set('Content-Type', 'application/json');
				assert.strictEqual(res.body, false);
			});

			it('should include prefix in inspect response', async function () {
				const res = await request.get('/api/inspect').expect(200);
				const body = JSON.stringify(res.body);
				assert.ok(
					body.includes(prefix),
					'Inspect response should contain prefix'
				);
				assert.ok(
					body.includes('packages'),
					'Inspect response should contain packages'
				);
			});
		});

		describe('python-base-app', function () {
			let prefix: string;
			let callUrl: string;

			before(function () {
				deploy('data/python-base-app');
				prefix = getPrefix('python-base-app');
				callUrl = `/${prefix}/python-base-app/v1/call`;
				if (IS_STARTUP_DEPLOY) {
					deployedApps.push({
						app: 'python-base-app',
						prefix
					});
				}
			});

			it('should return 100 from number endpoint', async function () {
				const res = await request.get(`${callUrl}/number`);
				assert.strictEqual(res.body, 100);
			});

			it('should return "asd" from text endpoint', async function () {
				const res = await request.get(`${callUrl}/text`);
				assert.strictEqual(res.body, 'asd');
			});

			it('should include prefix in inspect response', async function () {
				const res = await request.get('/api/inspect').expect(200);
				const body = JSON.stringify(res.body);
				assert.ok(
					body.includes(prefix),
					'Inspect response should contain prefix'
				);
				assert.ok(
					body.includes('packages'),
					'Inspect response should contain packages'
				);
			});
		});

		describe('python-dependency-app', function () {
			let prefix: string;
			let callUrl: string;

			before(function () {
				deploy('data/python-dependency-app');
				prefix = getPrefix('python-dependency-app');
				callUrl = `/${prefix}/python-dependency-app/v1/call`;
				if (IS_STARTUP_DEPLOY) {
					deployedApps.push({
						app: 'python-dependency-app',
						prefix
					});
				}
			});

			it('should return a joke with setup and punchline from fetchJoke', async function () {
				const res = await request.get(`${callUrl}/fetchJoke`);
				const body = JSON.stringify(res.body);
				assert.ok(
					body.includes('setup'),
					'Response should contain setup'
				);
				assert.ok(
					body.includes('punchline'),
					'Response should contain punchline'
				);
			});

			it('should include prefix in inspect response', async function () {
				const res = await request.get('/api/inspect').expect(200);
				const body = JSON.stringify(res.body);
				assert.ok(
					body.includes(prefix),
					'Inspect response should contain prefix'
				);
				assert.ok(
					body.includes('packages'),
					'Inspect response should contain packages'
				);
			});
		});

		describe('nodejs-dependency-app', function () {
			let prefix: string;
			let callUrl: string;

			before(function () {
				deploy('data/nodejs-dependency-app');
				prefix = getPrefix('nodejs-dependency-app');
				callUrl = `/${prefix}/nodejs-dependency-app/v1/call`;
				if (IS_STARTUP_DEPLOY) {
					deployedApps.push({
						app: 'nodejs-dependency-app',
						prefix
					});
				}
			});

			it('should sign in and return a token', async function () {
				const res = await request
					.post(`${callUrl}/signin`)
					.send({ user: 'viferga', password: '123' })
					.set('Content-Type', 'application/json');
				assert.strictEqual(typeof res.body, 'string');
				assert.ok(
					(res.body as string).length > 0,
					'Token should not be empty'
				);
			});

			it('should reverse a string with middleware auth', async function () {
				const signinRes = await request
					.post(`${callUrl}/signin`)
					.send({ user: 'viferga', password: '123' })
					.set('Content-Type', 'application/json');
				const token = signinRes.body as string;

				const res = await request
					.post(`${callUrl}/reverse`)
					.send({ token, args: { str: 'hello' } })
					.set('Content-Type', 'application/json');
				assert.strictEqual(res.body, 'olleh');
			});

			it('should sum two numbers with middleware auth', async function () {
				const signinRes = await request
					.post(`${callUrl}/signin`)
					.send({ user: 'viferga', password: '123' })
					.set('Content-Type', 'application/json');
				const token = signinRes.body as string;

				const res = await request
					.post(`${callUrl}/sum`)
					.send({ token, args: { a: 5, b: 3 } })
					.set('Content-Type', 'application/json');
				assert.strictEqual(res.body, 8);
			});

			it('should include prefix in inspect response', async function () {
				const res = await request.get('/api/inspect').expect(200);
				const body = JSON.stringify(res.body);
				assert.ok(
					body.includes(prefix),
					'Inspect response should contain prefix'
				);
				assert.ok(
					body.includes('packages'),
					'Inspect response should contain packages'
				);
			});
		});

		describe('nodejs-env-app', function () {
			let prefix: string;
			let callUrl: string;

			before(function () {
				deploy('data/nodejs-env-app');
				prefix = getPrefix('nodejs-env-app');
				callUrl = `/${prefix}/nodejs-env-app/v1/call`;
				if (IS_STARTUP_DEPLOY) {
					deployedApps.push({
						app: 'nodejs-env-app',
						prefix
					});
				}
			});

			it('should return "hello" from env endpoint', async function () {
				const res = await request.get(`${callUrl}/env`);
				assert.strictEqual(res.body, 'hello');
			});

			it('should include prefix in inspect response', async function () {
				const res = await request.get('/api/inspect').expect(200);
				const body = JSON.stringify(res.body);
				assert.ok(
					body.includes(prefix),
					'Inspect response should contain prefix'
				);
				assert.ok(
					body.includes('packages'),
					'Inspect response should contain packages'
				);
			});
		});
	});

	describe('Repository Deployment Tests', function () {
		function deployFromRepo(repoUrl: string): void {
			execSync(
				`expect -c '
				spawn metacall-deploy --addrepo ${repoUrl} --dev
				expect "Select a container to get logs"
				send "Deploy\\r"
				expect eof
			'`,
				{ encoding: 'utf-8', timeout: 60_000 }
			);
		}

		function waitForPrefix(appName: string, maxRetries = 10): string {
			for (let i = 0; i < maxRetries; i++) {
				const prefix = getPrefix(appName);
				if (prefix) return prefix;
				execSync('sleep 2');
			}
			throw new Error(
				`Failed to get prefix for ${appName} after retries.`
			);
		}

		describe('nodejs-parameter-example (no dependencies)', function () {
			let callUrl: string;
			let prefix: string;

			before(function () {
				deployFromRepo(
					'https://github.com/HeeManSu/nodejs-parameter-example'
				);
				prefix = waitForPrefix('heemansu-nodejs-parameter-example');
				callUrl = `/${prefix}/heemansu-nodejs-parameter-example/v1/call`;
			});

			it('should return true for palindrome "madam"', async function () {
				const res = await request
					.post(`${callUrl}/isPalindrome`)
					.send({ params: ['madam'] })
					.set('Content-Type', 'application/json');
				assert.strictEqual(res.body, true);
			});

			it('should return false for non-palindrome "world"', async function () {
				const res = await request
					.post(`${callUrl}/isPalindrome`)
					.send({ params: ['world'] })
					.set('Content-Type', 'application/json');
				assert.strictEqual(res.body, false);
			});

			it('should appear in inspect response', async function () {
				const res = await request.get('/api/inspect').expect(200);
				const body = JSON.stringify(res.body);
				assert.ok(
					body.includes(prefix),
					'Inspect response should contain prefix'
				);
			});
		});

		describe('metacall-python-example (no dependencies)', function () {
			let callUrl: string;

			before(function () {
				deployFromRepo(
					'https://github.com/HeeManSu/metacall-python-example'
				);
				const prefix = waitForPrefix(
					'heemansu-metacall-python-example'
				);
				callUrl = `/${prefix}/heemansu-metacall-python-example/v1/call`;
			});

			it('should return HTML from index endpoint', async function () {
				const res = await request.get(`${callUrl}/index`);
				const body =
					typeof res.body === 'string'
						? res.body
						: JSON.stringify(res.body);
				assert.ok(
					body.includes('<html'),
					'Response should contain <html'
				);
				assert.ok(
					body.includes('Python Time App'),
					'Response should contain Python Time App'
				);
			});

			it('should return a valid timestamp from time endpoint', async function () {
				const res = await request.get(`${callUrl}/time`);
				const body =
					typeof res.body === 'string' ? res.body : String(res.body);
				assert.match(body, /\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}/);
			});
		});

		describe('python-dependency-metacall (with dependencies)', function () {
			let callUrl: string;

			before(function () {
				deployFromRepo(
					'https://github.com/HeeManSu/python-dependency-metacall'
				);
				const prefix = waitForPrefix(
					'heemansu-python-dependency-metacall'
				);
				callUrl = `/${prefix}/heemansu-python-dependency-metacall/v1/call`;
			});

			it('should return a joke or error from fetch_joke', async function () {
				const res = await request.get(`${callUrl}/fetch_joke`);
				const body = JSON.stringify(res.body);
				const hasJoke =
					body.includes('setup') && body.includes('punchline');
				const hasError = body.includes('Error fetching joke');
				assert.ok(
					hasJoke || hasError,
					'Response should contain joke data or error message'
				);
			});
		});

		describe('auth-middleware-metacall (with dependencies)', function () {
			let callUrl: string;

			before(function () {
				deployFromRepo(
					'https://github.com/HeeManSu/auth-middleware-metacall'
				);
				const prefix = waitForPrefix(
					'heemansu-auth-middleware-metacall'
				);
				callUrl = `/${prefix}/heemansu-auth-middleware-metacall/v1/call`;
			});

			it('should sign in and return a token', async function () {
				const res = await request
					.post(`${callUrl}/signin`)
					.send({ user: 'viferga', password: '123' })
					.set('Content-Type', 'application/json');
				assert.strictEqual(typeof res.body, 'string');
				assert.ok(
					(res.body as string).length > 0,
					'Token should not be empty'
				);
			});

			it('should reverse a string with middleware auth', async function () {
				const signinRes = await request
					.post(`${callUrl}/signin`)
					.send({ user: 'viferga', password: '123' })
					.set('Content-Type', 'application/json');
				const token = signinRes.body as string;

				const res = await request
					.post(`${callUrl}/reverse`)
					.send({ token, args: { str: 'hello' } })
					.set('Content-Type', 'application/json');
				assert.strictEqual(res.body, 'olleh');
			});

			it('should sum two numbers with middleware auth', async function () {
				const signinRes = await request
					.post(`${callUrl}/signin`)
					.send({ user: 'viferga', password: '123' })
					.set('Content-Type', 'application/json');
				const token = signinRes.body as string;

				const res = await request
					.post(`${callUrl}/sum`)
					.send({ token, args: { a: 5, b: 3 } })
					.set('Content-Type', 'application/json');
				assert.strictEqual(res.body, 8);
			});
		});
	});

	describe('Simultaneous Deployment Tests', function () {
		before(function () {
			if (!IS_STARTUP_DEPLOY) {
				this.skip();
			}
		});

		it('should handle simultaneous deployments', async function () {
			const apps = [
				{
					app: 'nodejs-base-app',
					test: async (callUrl: string) => {
						const res = await request
							.post(`${callUrl}/isPalindrome`)
							.send({ params: ['madam'] })
							.set('Content-Type', 'application/json');
						assert.strictEqual(res.body, true);
					}
				},
				{
					app: 'python-base-app',
					test: async (callUrl: string) => {
						const res = await request.get(`${callUrl}/number`);
						assert.strictEqual(res.body, 100);
					}
				},
				{
					app: 'python-dependency-app',
					test: async (callUrl: string) => {
						const res = await request.get(`${callUrl}/fetchJoke`);
						const body = JSON.stringify(res.body);
						assert.ok(
							body.includes('setup'),
							'Response should contain setup'
						);
						assert.ok(
							body.includes('punchline'),
							'Response should contain punchline'
						);
					}
				},
				{
					app: 'nodejs-dependency-app',
					test: async (callUrl: string) => {
						const res = await request
							.post(`${callUrl}/signin`)
							.send({ user: 'viferga', password: '123' })
							.set('Content-Type', 'application/json');
						assert.strictEqual(typeof res.body, 'string');
						assert.ok(
							(res.body as string).length > 0,
							'Token should not be empty'
						);
					}
				}
			];

			await Promise.all(
				apps.map(async ({ app, test }) => {
					deploy(`data/${app}`);
					const prefix = getPrefix(app);
					const callUrl = `/${prefix}/${app}/v1/call`;
					await test(callUrl);
				})
			);
		});
	});

	describe('Delete Functionality Tests', function () {
		before(function () {
			if (!IS_STARTUP_DEPLOY) {
				this.skip();
			}
		});

		const endpointMap: Record<string, string> = {
			'python-dependency-app': 'fetchJoke',
			'python-base-app': 'number',
			'nodejs-base-app': 'isPalindrome',
			'nodejs-dependency-app': 'signin',
			'nodejs-env-app': 'env'
		};

		it('should delete all deployed apps and return 404 on call', async function () {
			for (const { app, prefix } of deployedApps) {
				await request
					.post('/api/deploy/delete')
					.send({ suffix: app, prefix, version: 'v1' })
					.set('Content-Type', 'application/json')
					.expect(200);

				const endpoint = endpointMap[app];
				if (endpoint) {
					await request
						.get(`/${prefix}/${app}/v1/call/${endpoint}`)
						.expect(404);
				}
			}
		});
	});
});
