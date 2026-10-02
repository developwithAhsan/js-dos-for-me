/* eslint-disable */
export type GameAvailability = "playable" | "bring-your-own";

export type Game = {
  slug: string;
  title: string;
  year: number;
  developer: string;
  genres: string[];
  platform: "MS-DOS" | "Windows 9x" | "Browser";
  description: string;
  controls: string;
  bundleUrl?: string;
  demoZipUrl?: string;
  command?: string;
  externalUrl?: string;
  engine?: "jsdos" | "external";
  categories?: string[];
  tags?: string[];
  image?: string;
  availability: GameAvailability;
  badge?: string;
  sourceLabel?: string;
};

export const games: Game[] = [
  {
    slug: "doom",
    title: "DOOM",
    year: 1993,
    developer: "id Software",
    genres: ["FPS", "Action"],
    platform: "MS-DOS",
    image: "https://dosgames.com/screens/doom.gif",
    description: "The classic first-person shooter. This entry uses the js-dos demo bundle and supports browser play, fullscreen, local saves and mobile controls.",
    controls: "Arrow keys / mouse to move and aim, Ctrl to fire, Space to use, number keys to switch weapons.",
    bundleUrl: "https://v8.js-dos.com/bundles/doom.jsdos",
    availability: "playable",
    badge: "Playable now",
    sourceLabel: "js-dos demo bundle"
  },
  {
    slug: "digger",
    title: "Digger",
    year: 1983,
    developer: "Windmill Software",
    genres: ["Arcade"],
    platform: "MS-DOS",
    image: "https://dosgames.com/screens/digger.png",
    description: "A compact DOS classic used by js-dos in its official browser examples. Ideal for validating the complete install and emulator pipeline.",
    controls: "Arrow keys to move; use the configured action key to fire.",
    bundleUrl: "https://v8.js-dos.com/bundles/digger.jsdos",
    availability: "playable",
    badge: "Playable now",
    sourceLabel: "Official js-dos example"
  },
  {
    slug: "grand-theft-auto",
    title: "Grand Theft Auto",
    year: 1997,
    developer: "DMA Design",
    genres: ["Action", "Racing"],
    platform: "MS-DOS",
    image: "https://dosgames.com/screens/gta.gif",
    description: "The original top-down Grand Theft Auto playable DOS demo, packaged automatically for js-dos so it starts directly in the browser.",
    controls: "Keyboard controls are provided by the original DOS demo. Mobile virtual controls can be layered through js-dos.",
    demoZipUrl: "/demos/gta.zip",
    command: "GTA.BAT",
    availability: "playable",
    badge: "Playable demo",
    sourceLabel: "Original DOS playable demo"
  },
  {
    slug: "the-need-for-speed",
    title: "The Need for Speed",
    year: 1995,
    developer: "EA Canada",
    genres: ["Racing"],
    platform: "MS-DOS",
    image: "https://dosgames.com/screens/needfspd.gif",
    description: "The original Need for Speed playable DOS demo, automatically packaged as a js-dos bundle for one-click browser play.",
    controls: "Arrow keys steer and accelerate; the demo uses its original DOS keyboard controls.",
    demoZipUrl: "/demos/nfs.zip",
    command: "RUNSB16.BAT",
    availability: "playable",
    badge: "Playable demo",
    sourceLabel: "Original EA DOS playable demo"
  },
  {
    slug: "duke-nukem-3d",
    title: "Duke Nukem 3D",
    year: 1996,
    developer: "3D Realms",
    genres: ["FPS", "Action"],
    platform: "MS-DOS",
    image: "https://dosgames.com/screens/duke3d.gif",
    description: "A Build-engine DOS shooter. The site can run an authorized .jsdos build and persist local changes in the browser.",
    controls: "Keyboard and mouse; custom mobile layers can be supplied per bundle.",
    availability: "bring-your-own",
    badge: "Bundle required"
  },
  {
    slug: "simcity",
    title: "SimCity",
    year: 1989,
    developer: "Maxis",
    genres: ["Simulation", "Strategy"],
    platform: "MS-DOS",
    image: "https://dosgames.com/screens/simcity.gif",
    description: "Classic city-building simulation. Ready for a compatible user-owned bundle.",
    controls: "Mouse-focused controls with keyboard shortcuts.",
    availability: "bring-your-own",
    badge: "Bundle required"
  },
  {
    slug: "prince-of-persia",
    title: "Prince of Persia",
    year: 1989,
    developer: "Brøderbund",
    genres: ["Platformer", "Action"],
    platform: "MS-DOS",
    image: "https://dosgames.com/screens/pop.gif",
    description: "The original cinematic platformer. Player configuration can be tuned for keyboard and touch input.",
    controls: "Arrow keys plus action modifier keys.",
    availability: "bring-your-own",
    badge: "Bundle required"
  },
  {
    slug: "tyrian-2000",
    title: "Tyrian 2000",
    year: 1999,
    developer: "Eclipse Productions",
    genres: ["Shoot 'em up", "Arcade"],
    platform: "MS-DOS",
    image: "https://www.dosgames.com/screens/tyrian.gif",
    description: "A fast vertical shooter with freeware data files, well suited to browser emulation and mobile virtual controls.",
    controls: "Arrow keys to move; Space to fire; Enter toggles rear weapon mode; Ctrl/Alt fire sidekicks.",
    bundleUrl: "https://cdn.dos.zone/custom/dos/tyrian-2000.jsdos",
    availability: "playable",
    badge: "Playable now",
    sourceLabel: "Tyrian 2000 freeware bundle"
  },
  {
    slug: "gta-iii-browser",
    title: "GTA III Browser",
    year: 2001,
    developer: "Browser port",
    genres: ["Open World", "Action", "3D"],
    platform: "Browser",
    description: "Explore a browser-native open-world 3D experience through the dedicated GTA III web port. The game runs in a separate browser build with keyboard, mouse and mobile touch controls.",
    controls: "Keyboard, mouse and the touch controls provided by the browser port.",
    externalUrl: "https://gta3browser.vercel.app/",
    image: "https://raw.githubusercontent.com/developwithAhsan/gta3-online/main/web/images/about-008.jpg",
    engine: "external",
    categories: ["Browser-Native Games", "Open-World 3D Classics"],
    tags: ["3D", "Open World", "Browser-Native"],
    availability: "playable",
    badge: "Browser-native"
  },
  {
    slug: "gta-vice-city-browser",
    title: "GTA Vice City Browser",
    year: 2002,
    developer: "Browser port",
    genres: ["Open World", "Action", "3D"],
    platform: "Browser",
    description: "Play a browser-native Vice City 3D experience through the dedicated web port, with an open-world interface, keyboard and mouse support, and mobile touch controls.",
    controls: "Keyboard, mouse and the touch controls provided by the browser port.",
    externalUrl: "https://vicecityonline.vercel.app/",
    image: "https://raw.githubusercontent.com/developwithAhsan/vc-online/main/d5b37447d1ef23deaa62f117359ac5a5.jpg",
    engine: "external",
    categories: ["Browser-Native Games", "Open-World 3D Classics"],
    tags: ["3D", "Open World", "Browser-Native"],
    availability: "playable",
    badge: "Browser-native"
  }
];

export const genres = Array.from(new Set(games.flatMap((game) => game.genres))).sort();

export function getGame(slug: string | null | undefined) {
  return games.find((game) => game.slug === slug);
}
