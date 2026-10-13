/**
 * Hungarian UI strings (CP08 T6, PD3). Same keys as `en.ts`; the product name is not
 * translated.
 */
import type { MessageKey } from './en.js';

export const hu: Record<MessageKey, string> = {
  'app.name': 'Offered Grade Maze',
  'goal.name': 'Megajánlott jegy',

  'title.tagline': 'Találd meg a Megajánlott jegyet egy házban, amely nem áll össze.',
  'title.newGame': 'Új játék',
  'title.controls': 'WASD: mozgás · Egér: körülnézés · Esc: egér elengedése',
  'lang.label': 'Nyelv',

  'newGame.title': 'Új játék',
  'newGame.tab.random': 'Véletlen ház',
  'newGame.tab.seed': 'Seed megadása',
  'newGame.start': 'Indítás',
  'newGame.back': 'Vissza',
  'newGame.difficulty': 'Nehézség',

  'difficulty.easy': 'Könnyű',
  'difficulty.medium': 'Közepes',
  'difficulty.hard': 'Nehéz',
  'difficulty.easy.desc': 'Az ajtók többnyire oda vezetnek, ahová várod.',
  'difficulty.medium.desc': 'Néhány ajtó máshová vezet, és van, amelyik nem vezet vissza.',
  'difficulty.hard.desc': 'A ház önmagába hajlik. Semmiben ne bízz.',

  'seed.label': 'Seed kód',
  'seed.placeholder': 'pl. M1-7K2Q-X9MP',
  'seed.decoded': '{difficulty} ház, generátorverzió: {version}',
  'seed.error.empty': 'Írj be egy seed kódot.',
  'seed.error.length': 'A seed kód 10 betűből és számjegyből áll, például M1-7K2Q-X9MP.',
  'seed.error.difficulty': 'Az első betű E, M vagy H lehet.',
  'seed.error.version': 'A második karakter 1 és 9 közötti számjegy.',
  'seed.error.unsupported_version': 'Ezt a seedet a játék egy újabb változata készítette.',
  'seed.error.character': 'A seed olyan karaktert tartalmaz, amely seed kódban nem fordulhat elő.',
  'seed.copy': 'Másolás',
  'seed.copied': 'Másolva',
  'seed.copyFailed': 'Jelöld ki a kódot, és másold ki.',
  'seed.caption': 'Seed',

  'loading.title': 'A ház épül…',
  'ready.click': 'Kattints a kezdéshez',

  'hud.timer': 'Idő',
  'hud.reconnecting': 'Újracsatlakozás…',

  'pause.title': 'Szünet',
  'pause.resume': 'Folytatás',
  'pause.quit': 'Kilépés a címképernyőre',
  'pause.timer': 'Az idő tovább fut.',

  'result.headline': 'Megszerezted a Megajánlott jegyet!',
  'result.time': 'Idő',
  'result.difficulty': 'Nehézség',
  'result.again': 'Újrajátszás ezzel a seeddel',
  'result.newGame': 'Új játék',
  'result.debugUsed': 'Hibakereső nézet használva',
  'result.saving': 'Eredmény mentése…',

  'unsupported.text':
    'Az Offered Grade Maze-hez WebGL2-t támogató asztali böngésző kell (Chrome, Edge, Firefox vagy Safari).',

  'error.title': 'A játék nem indult el',
  'error.retry': 'Újra',
  'error.back': 'Vissza',
  'error.network': 'A szerver nem érhető el. Ellenőrizd, hogy fut-e, és próbáld újra.',
  'error.invalid_seed': 'Ez a seed kód érvénytelen.',
  'error.unsupported_version': 'Ezt a seedet a játék egy újabb változata készítette.',
  'error.seed_not_playable': 'Ebből a seedből nem lehet játszható házat építeni.',
  'error.generation_unavailable': 'A szerver most nem tudott házat építeni. Próbáld újra.',
  'error.rate_limited': 'Túl sok új játék rövid idő alatt. Várj egy percet, és próbáld újra.',
  'error.saveFailed': 'Az eredményedet nem sikerült elmenteni.',
  'error.generic': 'Valami hiba történt.',

  'graphics.reset': 'Grafika újraindítása…',

  'settings.open': 'Beállítások',
  'settings.title': 'Beállítások',
  'settings.language': 'Nyelv',
  'settings.sensitivity': 'Egérérzékenység',
  'settings.invertY': 'Függőleges egértengely megfordítása',
  'settings.fov': 'Látószög',
  'settings.headBob': 'Fejbillegés járás közben',
  'settings.master': 'Fő hangerő',
  'settings.music': 'Zene hangereje',
  'settings.sfx': 'Effektek hangereje',
  'settings.quality': 'Grafikai minőség',
  'settings.quality.auto': 'Automatikus',
  'settings.quality.high': 'Magas',
  'settings.quality.low': 'Alacsony',
  'settings.reset': 'Alapértékek visszaállítása',
  'settings.done': 'Kész',
  'lang.en': 'English',
  'lang.hu': 'Magyar',

  'room.living': 'Nappali',
  'room.kitchen': 'Konyha',
  'room.bedroom': 'Hálószoba',
  'room.bathroom': 'Fürdőszoba',
  'room.hallway': 'Előszoba',
  'room.study': 'Dolgozószoba',
};
