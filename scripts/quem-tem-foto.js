async function main() {
  const { MongoClient } = await import("mongodb");
  const uri = process.env.MONGODB_URI;

  if (!uri) {
    throw new Error("MONGODB_URI não está definida.");
  }

  const client = new MongoClient(uri);

  try {
    await client.connect();

    const patients = await client
      .db()
      .collection("patients")
      .find(
        { photoPublicId: { $type: "string" } },
        {
          projection: {
            _id: 0,
            processNumber: 1,
            name: 1,
          },
        }
      )
      .sort({ processNumber: -1 })
      .limit(5)
      .toArray();

    console.table(patients);
  } finally {
    await client.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
