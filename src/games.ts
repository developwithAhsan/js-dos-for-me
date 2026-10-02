/* eslint-disable indent, max-len */
export type GameAvailability = "playable" | "bring-your-own";

export type Game = {
  slug: string;
  title: string;
  year: number;
  developer: string;
  genres: string[];
  platform: "MS-DOS" | "Windows 9x";
  description: string;
  controls: string;
  bundleUrl?: string;
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
    description: "The original top-down Grand Theft Auto. The portal and player profile are ready; a lawfully distributable .jsdos bundle can be attached without changing the UI.",
    controls: "Keyboard controls vary by bundle. A game-specific touch layout can be attached through jsdos.json.",
    availability: "bring-your-own",
    badge: "Bundle required"
  },
  {
    slug: "the-need-for-speed",
    title: "The Need for Speed",
    year: 1995,
    developer: "EA Canada",
    genres: ["Racing"],
    platform: "MS-DOS",
    description: "The original Need for Speed DOS release. The page, metadata, caching and player integration are prepared for a licensed/user-owned bundle.",
    controls: "Arrow keys to steer and accelerate; game-specific keys are configurable.",
    availability: "bring-your-own",
    badge: "Bundle required"
  },
  {
    slug: "duke-nukem-3d",
    title: "Duke Nukem 3D",
    year: 1996,
    developer: "3D Realms",
    genres: ["FPS", "Action"],
    platform: "MS-DOS",
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
    description: "A fast vertical shooter well suited to browser emulation and mobile virtual controls.",
    controls: "Arrow keys to move; configured fire/select keys for weapons and menus.",
    availability: "bring-your-own",
    badge: "Bundle required"
  }
];

export const genres = Array.from(new Set(games.flatMap((game) => game.genres))).sort();

export function getGame(slug: string | null | undefined) {
  return games.find((game) => game.slug === slug);
}
