import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
export async function posterOwner(output) {
  for (const dir of await readdir(output).catch(() => [])) {
    const delivery = join(output, dir);
    for (const name of await readdir(delivery))
      if (name.startsWith(".posters-")) {
        const owner = await readFile(join(delivery, name, "browser-owner.json"), "utf8")
          .then(JSON.parse)
          .catch(() => null);
        if (owner) return { ...owner, delivery };
      }
  }
}
