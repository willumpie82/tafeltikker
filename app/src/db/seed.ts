import { db } from "./index.js";
import { parents, children, parentChild } from "./schema.js";
import { hashSecret } from "../auth/password.js";

const DEMO_CHILDREN = [
  { name: "Sam", avatarId: "fox", pin: "1234" },
  { name: "Robin", avatarId: "owl", pin: "4321" },
];

async function main() {
  const existing = await db.select().from(parents);
  if (existing.length > 0) {
    console.log("Database already has parents, skipping seed. Delete the DB file to reseed.");
    return;
  }

  const parentUsername = process.env.SEED_PARENT_USERNAME ?? "ouder";
  const parentPassword = process.env.SEED_PARENT_PASSWORD ?? "wachtwoord123";

  const [parent] = await db
    .insert(parents)
    .values({ username: parentUsername, passwordHash: await hashSecret(parentPassword) })
    .returning();

  console.log(`Seeded parent "${parentUsername}" / password "${parentPassword}" (change this!).`);

  for (const demoChild of DEMO_CHILDREN) {
    const [child] = await db
      .insert(children)
      .values({
        name: demoChild.name,
        avatarId: demoChild.avatarId,
        pinHash: await hashSecret(demoChild.pin),
      })
      .returning();

    await db.insert(parentChild).values({ parentId: parent.id, childId: child.id });
    console.log(`Seeded child "${demoChild.name}" / PIN "${demoChild.pin}".`);
  }
}

main();
