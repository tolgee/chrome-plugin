import { distDir, env, log } from './env';
import { ensureExtensionBuilt } from './extensionBuild';
import { manifestExtensionId } from './extensionId';
import { isPortInUse, waitForHttp } from './http';
import { probeOAuthServer } from './oauthProbe';
import { startPlatform } from './platform';
import { seed } from './seed';
import { type RunState, type TestApp, writeState } from './state';
import { teardown } from './teardown';
import { prepareTolgeeJs, startTestapp } from './tolgeeJs';

const PROJECT_COUNT = 2;

export default async function globalSetup() {
  const state: Partial<RunState> = {};
  try {
    state.extensionId = manifestExtensionId();
    state.distDir = distDir;
    log(`extension id ${state.extensionId} (from the manifest key)`);
    ensureExtensionBuilt();

    const ports = Array.from(
      { length: PROJECT_COUNT },
      (_, i) => env.testappPort + i
    );
    for (const port of ports) {
      if (await isPortInUse(port)) {
        throw new Error(
          `port ${port} is already in use; set TESTAPP_PORT to a free range of ${PROJECT_COUNT} ports`
        );
      }
    }

    const platform = await startPlatform(state.extensionId);
    state.tolgeeUrl = platform.url;
    state.docker = platform.docker;
    state.oauth = await probeOAuthServer(platform.url, state.extensionId);
    if (state.oauth.redirectUriRejected && platform.docker) {
      throw new Error(
        `docker-compose.yml registers the wrong redirect URI: ${state.oauth.reason}`
      );
    }

    const seeded = await seed(platform.url, PROJECT_COUNT);
    state.seed = seeded.cleanup;
    state.user = seeded.user;
    state.apiKey = seeded.apiKey;

    const tolgeeJsDir = prepareTolgeeJs();
    state.tolgeeJsDir = tolgeeJsDir;
    const apps: TestApp[] = [];
    const children = seeded.projects.map((project, i) => {
      const port = ports[i];
      apps.push({
        url: `http://localhost:${port}`,
        projectId: project.id,
        projectName: project.name,
      });
      return startTestapp(tolgeeJsDir, port, platform.url, project.id);
    });
    state.apps = apps;
    state.testappPids = children.map((child) => child.pid!);
    await Promise.all(
      apps.map((app, i) =>
        waitForHttp(
          app.url,
          `testapp on ${app.url}`,
          120_000,
          () => children[i].exitCode === null
        )
      )
    );

    writeState(state);
    log(
      `ready: extension ${state.extensionId}, Tolgee ${
        platform.url
      }, testapps ${apps.map((a) => a.url).join(' ')}${
        state.oauth.available
          ? ''
          : ` (OAuth specs skipped: ${state.oauth.reason})`
      }`
    );
  } catch (e) {
    await teardown(state);
    throw e;
  }
}
