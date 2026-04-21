import "dotenv/config";

import { loadSeedContent } from "../src/features/content/load-seed-content";
import { seedContent } from "../src/features/content/seed-content";
import { db } from "../src/lib/db";

async function main() {
  const seedData = await loadSeedContent();

  await seedContent(db, seedData);
}

main()
  .then(async () => {
    await db.$disconnect();
  })
  .catch(async (error) => {
    console.error(error);
    await db.$disconnect();
    process.exitCode = 1;
  });
