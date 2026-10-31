// One-off generator: builds src/web/public/presets.json from the preset image
// folders in src/web/public/img/presets. Faction colors are computed from the
// average color of each image unless a curated color is provided below.
//
// Usage: npm run generate-presets

import { readdir, writeFile } from "node:fs/promises";
import { join, extname, basename } from "node:path";
import sharp from "sharp";

const PRESET_DIR = new URL("../src/web/public/img/presets/", import.meta.url).pathname
  .replace(/^\/([A-Za-z]:)/, "$1"); // strip leading slash on Windows
const OUT_FILE = new URL("../src/web/public/presets.json", import.meta.url).pathname
  .replace(/^\/([A-Za-z]:)/, "$1");

// Curated metadata. logo: file name of the theme logo (falls back to the first
// faction image). factions: map of file base name -> { name, color? }.
// Files not listed under factions and not the logo are excluded.
const THEMES = {
  classichorror: {
    name: "Classic Horror",
    factions: {
      chucky: { name: "Chucky" },
      freddie: { name: "Freddy" },
      ghostface: { name: "Ghostface" },
      it: { name: "Pennywise" },
      jason: { name: "Jason" },
      mikemyers: { name: "Michael Myers" }
    }
  },
  cuteanimals: {
    name: "Cute Animals",
    factions: {
      bear: { name: "Bear" }, bunny: { name: "Bunny" }, fox: { name: "Fox" },
      kitty: { name: "Kitty" }, panda: { name: "Panda" }, penguin: { name: "Penguin" },
      puppy: { name: "Puppy" }, turtle: { name: "Turtle" }, unicorn: { name: "Unicorn" }
    }
  },
  dessertdelights: {
    name: "Dessert Delights",
    logo: "dessertdelights.png",
    factions: {
      brownie: { name: "Brownie" }, cupcake: { name: "Cupcake" },
      icecream: { name: "Ice Cream" }, tiramasu: { name: "Tiramisu" }
    }
  },
  dragonballz: {
    name: "Dragon Ball Z",
    logo: "dragonball.ico",
    factions: {
      gohan: { name: "Gohan" }, goku: { name: "Goku" },
      piccolo: { name: "Piccolo" }, vegeta: { name: "Vegeta" }
    }
  },
  elements: {
    name: "Elements",
    logo: "elements.png",
    factions: {
      air: { name: "Air" }, earth: { name: "Earth" },
      fire: { name: "Fire" }, water: { name: "Water" }
    }
  },
  f1: {
    name: "Formula 1",
    logo: "f1.png",
    factions: {
      alpine: { name: "Alpine" }, astonmartin: { name: "Aston Martin" },
      ferrari: { name: "Ferrari" }, haas: { name: "Haas" },
      kicksauber: { name: "Kick Sauber" }, mclaren: { name: "McLaren" },
      mercedes: { name: "Mercedes" }, racingbulls: { name: "Racing Bulls" },
      redbullracing: { name: "Red Bull Racing" }, williams: { name: "Williams" }
    }
  },
  fortnite: {
    name: "Fortnite",
    logo: "fortnite.png",
    factions: {
      aura: { name: "Aura" }, cuddle: { name: "Cuddle Team" },
      fishstick: { name: "Fishstick" }, surfwitch: { name: "Surf Witch" }
    }
  },
  hogwarts: {
    name: "Hogwarts Houses",
    logo: "hogwarts.png",
    factions: {
      gryffindor: { name: "Gryffindor", color: "#740001" },
      hufflepuff: { name: "Hufflepuff", color: "#ecb939" },
      ravenclaw: { name: "Ravenclaw", color: "#0e1a40" },
      slytherin: { name: "Slytherin", color: "#1a472a" }
    }
  },
  insideout: {
    name: "Inside Out",
    logo: "insideout.webp",
    factions: {
      anger: { name: "Anger" }, disgust: { name: "Disgust" }, fear: { name: "Fear" },
      joy: { name: "Joy" }, sadness: { name: "Sadness" }
    }
  },
  kawaii: {
    name: "Kawaii",
    logo: "kawaii.png",
    factions: {
      cupcake: { name: "Cupcake" }, icecream: { name: "Ice Cream" },
      popsicle: { name: "Popsicle" }, rainbow: { name: "Rainbow" }, star: { name: "Star" }
    }
  },
  labubu: {
    name: "Labubus",
    logo: "labubu.png",
    factions: {
      soymilk: { name: "Soymilk", color: "#e2c8a5" },
      greengrape: { name: "Green Grape", color: "#acb388" },
      sesamebean: { name: "Sesame Bean", color: "#aea4a0" },
      seasaltcoconut: { name: "Sea Salt Coconut", color: "#9da9b5" },
      toffee: { name: "Toffee", color: "#bd9d81" },
      lycheeberry: { name: "Lychee Berry", color: "#dc919d" }
    }
  },
  minecraftmobs: {
    name: "Minecraft Mobs",
    factions: {
      creeper: { name: "Creeper" }, enderman: { name: "Enderman" },
      skeleton: { name: "Skeleton" }, slime: { name: "Slime" },
      spider: { name: "Spider" }, witch: { name: "Witch" },
      wither: { name: "Wither" }, zombie: { name: "Zombie" }
    }
  },
  overwatch: {
    name: "Overwatch Roles",
    logo: "overwatch.png",
    factions: {
      damage: { name: "Damage" }, support: { name: "Support" }, tank: { name: "Tank" }
    }
  },
  pokemonStarters: {
    name: "Pokémon Starters",
    logo: "pokemon.png",
    factions: {
      bulbasaur: { name: "Bulbasaur", color: "#78c850" },
      charmander: { name: "Charmander", color: "#f08030" },
      pikachu: { name: "Pikachu", color: "#f8d030" },
      squirtle: { name: "Squirtle", color: "#6890f0" }
    }
  },
  pokemonTypes: {
    name: "Pokémon Types",
    logo: "pokemon.png",
    factions: {
      bug: { name: "Bug", color: "#a8b820" }, dark: { name: "Dark", color: "#705848" },
      dragon: { name: "Dragon", color: "#7038f8" }, electric: { name: "Electric", color: "#f8d030" },
      fairy: { name: "Fairy", color: "#ee99ac" }, fighting: { name: "Fighting", color: "#c03028" },
      fire: { name: "Fire", color: "#f08030" }, flying: { name: "Flying", color: "#a890f0" },
      ghost: { name: "Ghost", color: "#705898" }, grass: { name: "Grass", color: "#78c850" },
      ground: { name: "Ground", color: "#e0c068" }, ice: { name: "Ice", color: "#98d8d8" },
      normal: { name: "Normal", color: "#a8a878" }, poison: { name: "Poison", color: "#a040a0" },
      psychic: { name: "Psychic", color: "#f85888" }, rock: { name: "Rock", color: "#b8a038" },
      steel: { name: "Steel", color: "#b8b8d0" }, water: { name: "Water", color: "#6890f0" }
    }
  },
  redvsblue: {
    name: "Red vs Blue",
    logo: "RvB.webp",
    factions: {
      red: { name: "Red Team", color: "#d62828" },
      blue: { name: "Blue Team", color: "#1d6fd6" }
    }
  },
  seasons: {
    name: "Seasons",
    logo: "seasons.png",
    factions: {
      seasons_autumn: { name: "Autumn" }, seasons_spring: { name: "Spring" },
      seasons_summer: { name: "Summer" }, seasons_winter: { name: "Winter" }
    }
  },
  sharks: {
    name: "Sharks",
    logo: "sharks.png",
    factions: {
      greatwhite: { name: "Great White" }, hammerhead: { name: "Hammerhead" },
      tiger: { name: "Tiger Shark" }, whale: { name: "Whale Shark" }
    }
  },
  snackattack: {
    name: "Snack Attack",
    logo: "snackattack.png",
    factions: {
      burger: { name: "Burger" }, donut: { name: "Donut" }, fries: { name: "Fries" },
      hotdog: { name: "Hot Dog" }, pizza: { name: "Pizza" }
    }
  },
  stardew: {
    name: "Stardew Valley",
    logo: "stardew.png",
    factions: {
      abigail: { name: "Abigail" }, alex: { name: "Alex" }, elliott: { name: "Elliott" },
      emily: { name: "Emily" }, haley: { name: "Haley" }, harvey: { name: "Harvey" },
      leah: { name: "Leah" }, maru: { name: "Maru" }, penny: { name: "Penny" },
      sam: { name: "Sam" }, sebastian: { name: "Sebastian" }, shane: { name: "Shane" }
    }
  },
  starwars: {
    name: "Star Wars",
    logo: "starwars.png",
    factions: {
      alliance: { name: "Rebel Alliance", color: "#c8102e" },
      empire: { name: "Galactic Empire", color: "#4a4f55" },
      Jedi: { name: "Jedi", color: "#2e67f8" },
      Sith: { name: "Sith", color: "#b1060f" }
    }
  },
  valorant: {
    name: "Valorant Roles",
    logo: "valorant.webp",
    factions: {
      controller: { name: "Controller" }, duelist: { name: "Duelist" },
      initiator: { name: "Initiator" }, sentinel: { name: "Sentinel" }
    }
  },
  wowfactions: {
    name: "WoW Factions",
    logo: "wow.png",
    factions: {
      alliance: { name: "Alliance", color: "#0078ff" },
      horde: { name: "Horde", color: "#b30000" },
      scourge: { name: "Scourge", color: "#64e08c" }
    }
  }
};

/** Average color of the non-transparent pixels of an image. */
async function averageColor(file) {
  try {
    const { data, info } = await sharp(file)
      .resize(32, 32, { fit: "inside" })
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    let r = 0, g = 0, b = 0, n = 0;
    for (let i = 0; i < data.length; i += info.channels) {
      if (data[i + 3] < 128) continue;
      r += data[i]; g += data[i + 1]; b += data[i + 2]; n++;
    }
    if (!n) return "#888888";
    const hex = (v) => Math.round(v / n).toString(16).padStart(2, "0");
    return `#${hex(r)}${hex(g)}${hex(b)}`;
  } catch (err) {
    console.warn(`  ⚠ could not read color from ${file}: ${err.message}`);
    return "#888888";
  }
}

const folders = (await readdir(PRESET_DIR, { withFileTypes: true }))
  .filter((d) => d.isDirectory())
  .map((d) => d.name);

const presets = [];
for (const folder of folders) {
  const meta = THEMES[folder];
  if (!meta) {
    console.warn(`⚠ Skipping ${folder}: no curated metadata`);
    continue;
  }
  const files = await readdir(join(PRESET_DIR, folder));
  const byBase = Object.fromEntries(files.map((f) => [basename(f, extname(f)), f]));

  const factions = [];
  for (const [base, def] of Object.entries(meta.factions)) {
    const file = byBase[base];
    if (!file) {
      console.warn(`⚠ ${folder}: missing image for faction '${base}'`);
      continue;
    }
    const color = def.color ?? (await averageColor(join(PRESET_DIR, folder, file)));
    factions.push({ name: def.name, color, imageUrl: `/img/presets/${folder}/${file}` });
  }

  const logo = meta.logo && byBase[basename(meta.logo, extname(meta.logo))]
    ? `/img/presets/${folder}/${meta.logo}`
    : factions[0]?.imageUrl ?? "/img/default.png";

  presets.push({ id: folder, name: meta.name, logo, factions });
  console.log(`✔ ${meta.name} (${factions.length} factions)`);
}

presets.sort((a, b) => a.name.localeCompare(b.name));
await writeFile(OUT_FILE, JSON.stringify(presets, null, 2));
console.log(`\nWrote ${presets.length} presets to ${OUT_FILE}`);
