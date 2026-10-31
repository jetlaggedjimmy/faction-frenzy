const admin = require("firebase-admin");
const serviceAccount = require("./firebase-service-account.json");

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

const presets = [
  {
    id: "labubu",
    name: "Labubus",
    logo: "https://factionfrenzy.gg/img/presets/labubu/labubu.png",
    factions: [
      { name: "Soymilk", color: "#e2c8a5", imageUrl: "https://factionfrenzy.gg/img/presets/labubu/soymilk.png" },
      { name: "Green Grape", color: "#acb388", imageUrl: "https://factionfrenzy.gg/img/presets/labubu/greengrape.png" },
      { name: "Sesame Bean", color: "#aea4a0", imageUrl: "https://factionfrenzy.gg/img/presets/labubu/sesamebean.png" },
      { name: "Sea Salt Coconut", color: "#9da9b5", imageUrl: "https://factionfrenzy.gg/img/presets/labubu/seasaltcoconut.png" },
      { name: "Toffee", color: "#bd9d81", imageUrl: "https://factionfrenzy.gg/img/presets/labubu/toffee.png" },
      { name: "Lychee Berry", color: "#dc919d", imageUrl: "https://factionfrenzy.gg/img/presets/labubu/lucheeberry.png" }
    ]
  }
];

async function populatePresetsFlat() {
  for (const preset of presets) {
    const presetRef = db.collection("presets").doc(preset.id);
    await presetRef.set({
      name: preset.name,
      logo: preset.logo,
      factions: preset.factions,
      createdAt: admin.firestore.FieldValue.serverTimestamp()
    });
    console.log(`✅ Wrote preset "${preset.name}" with ${preset.factions.length} factions`);
  }
}

populatePresetsFlat()
  .then(() => {
    console.log("🎉 Done!");
    process.exit(0);
  })
  .catch(err => {
    console.error("❌ Error uploading:", err);
    process.exit(1);
  });