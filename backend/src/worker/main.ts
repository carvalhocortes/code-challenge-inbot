import { readRuntimeConfig } from "../config.js";
import {
  checkRuntimeDependencies,
  closeRuntimeDependencies,
  createRuntimeDependencies,
} from "../infrastructure/runtime-dependencies.js";

const dependencies = createRuntimeDependencies(readRuntimeConfig());

await checkRuntimeDependencies(dependencies);

process.stdout.write(
  "Worker foundation is ready; queue processing starts in E4.\n",
);

await new Promise<void>((resolve) => {
  process.once("SIGINT", resolve);
  process.once("SIGTERM", resolve);
});

await closeRuntimeDependencies(dependencies);
