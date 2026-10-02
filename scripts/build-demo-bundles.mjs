import fs from "node:fs/promises";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
require("emulators");

const emulators = globalThis.emulators;
if (!emulators) {
  throw new Error("emulators package did not initialize global.emulators");
}

const demos = [
  {
    name: "Need for Speed demo",
    source: "https://dosgames.com/files/needfspd.zip",
    output: "public/bundles/need-for-speed-demo.jsdos",
    command: "RUNSB16.BAT",
  },
  {
    name: "Grand Theft Auto demo",
    source: "https://dosgames.com/files/gta8.zip",
    output: "public/bundles/gta-demo.jsdos",
    command: "GTA.BAT",
  },
];

await fs.mkdir("public/bundles", { recursive: true });

for (const demo of demos) {
  console.log(`Building ${demo.name}...`);
  const bundle = await emulators.bundle();
  await bundle.extract(demo.source, "/");
  bundle.autoexec(demo.command);
  bundle.jsdosConf = {
    ...bundle.jsdosConf,
    version: "8",
  };
  const bytes = await bundle.toUint8Array(true);
  await fs.writeFile(demo.output, bytes);
  console.log(`Created ${demo.output} (${bytes.byteLength} bytes)`);
}
