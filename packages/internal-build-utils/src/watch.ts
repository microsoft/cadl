import { statSync } from "fs";
import { dirname, resolve } from "path";
import watch from "watch";
import { clearScreen, logWithTime } from "./common.js";

export function runWatch(dir: string, build: any, options: any) {
  let lastBuildTime: Date;
  dir = resolve(dir);

  // We need to wait for directory to be created before watching it. This deals
  // with races between watchers where one watcher must create a directory
  // before another can watch it.
  //
  // For example, we can't watch for tmlanguage.js changes if the source watcher
  // hasn't even created the directory in which tmlanguage.js will be written.
  try {
    statSync(dir);
  } catch (err: any) {
    if (err.code === "ENOENT") {
      waitForDirectoryCreation();
      return;
    }
    throw err;
  }

  // Directory already exists: we can start watching right away.
  start();

  function waitForDirectoryCreation() {
    let dirCreated = false;
    const parentDir = dirname(dir);
    logWithTime(`Waiting for ${dir} to be created.`);

    watch.createMonitor(parentDir, "created" as any, (monitor) => {
      monitor.on("created", (file) => {
        if (!dirCreated && file === dir) {
          dirCreated = true; // defend against duplicate events.
          monitor.stop();
          start();
        }
      });
    });
  }

  function start() {
    // build once up-front
    runBuild();

    // then build again on any change
    watch.createMonitor(dir, { interval: 0.2, ...options }, (monitor) => {
      monitor.on("created", (file) => runBuild(`${file} created`));
      monitor.on("removed", (file) => runBuild(`${file} removed`));
      monitor.on("changed", (file) => runBuild(`${file} changed`, monitor.files[file]?.mtime));
    });
  }

  function runBuild(changeDescription?: string, changeTime?: Date) {
    runBuildAsync(changeDescription, changeTime).catch((err) => {
      // eslint-disable-next-line no-console
      console.error(err.stack);
      process.exit(1);
    });
  }

  async function runBuildAsync(changeDescription?: string, changeTime?: Date) {
    if (changeTime && lastBuildTime && changeTime < lastBuildTime) {
      // Don't rebuild if a change happened before the last build kicked off.
      // Defends against duplicate events and building more than once when a
      // bunch of files are changed at the same time.
      return;
    }

    lastBuildTime = new Date();
    if (changeDescription) {
      clearScreen();
      logWithTime(`File change detected: ${changeDescription}. Running build.`);
    } else {
      logWithTime("Starting build in watch mode.");
    }

    try {
      await build();
      logWithTime("Build succeeded. Waiting for file changes.");
    } catch (err: any) {
      // eslint-disable-next-line no-console
      console.error(err.stack);
      logWithTime(`Build failed. Waiting for file changes.`);
    }
  }
}
