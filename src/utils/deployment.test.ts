import assert from 'node:assert/strict';
import test from 'node:test';

process.env.NODE_ENV = 'test';

test('exports the tested Express app as the Vercel handler', async () => {
  const serverModule = await import('../../server');
  assert.equal(serverModule.default, serverModule.app);
});

test('resolves the Vercel entrypoint through a Node-compatible ESM import', async () => {
  const [serverModule, vercelModule] = await Promise.all([
    import('../../server.js'),
    import('../../api/[...path].js'),
  ]);

  assert.equal(vercelModule.default, serverModule.app);
});

test('never opens a standalone listener inside Vercel', async () => {
  const serverModule = await import('../../server');
  assert.equal(typeof serverModule.shouldStartStandaloneServer, 'function');

  const shouldStart = serverModule.shouldStartStandaloneServer as (
    environment: NodeJS.ProcessEnv
  ) => boolean;

  assert.equal(shouldStart({ NODE_ENV: 'production', VERCEL: '1' }), false);
  assert.equal(shouldStart({ NODE_ENV: 'test' }), false);
  assert.equal(shouldStart({ NODE_ENV: 'production' }), true);
  assert.equal(shouldStart({ NODE_ENV: 'development' }), true);
});
