import { deepStrictEqual } from "assert";
import { createTestServerHost } from "./test-server-host.js";

describe("compiler: server: main file", () => {
  it("finds the main file", async () => {
    const host = await createTestServerHost();
    host.addCadlFile("./main.cadl", 'import "./common.cadl"; import "./subdir/subfile.cadl";');
    host.addCadlFile("./common.cadl", "model Base {}");
    host.addCadlFile("./subdir/empty.cadl", ""); // to force virtual file system to create directory
    const document = host.addOrUpdateDocument("./subdir/subfile.cadl", "model Sub extends Base {}");

    await host.server.checkChange({ document });
    deepStrictEqual(host.getDiagnostics("./subdir/subfile.cadl"), [], "No diagnostics expected");
  });
});
