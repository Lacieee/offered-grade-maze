/**
 * Seed codes: `<D><V>-<XXXX>-<XXXX>`, for example `M1-7K2Q-X9MP`.
 *
 * - `D`: difficulty letter (`E`, `M`, `H`).
 * - `V`: generator major version, one digit 1–9.
 * - `XXXX-XXXX`: 8 Crockford base32 characters = 40 random bits.
 *
 * A typed seed alone reproduces a level (spec §5, §6).
 */

/** Game difficulty. */
export type Difficulty = 'easy' | 'medium' | 'hard';

/** All difficulties, easiest first. */
export const DIFFICULTIES = ['easy', 'medium', 'hard'] as const satisfies readonly Difficulty[];

/** Generator major versions this release can reproduce. */
export const SUPPORTED_GENERATOR_VERSIONS = [1] as const;

/** Crockford base32 alphabet (no I, L, O, U). */
export const SEED_ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

/** Number of payload characters in a seed code (8 × 5 bits = 40 bits). */
export const SEED_PAYLOAD_LENGTH = 8;

/** Number of payload bytes behind a seed code. */
export const SEED_PAYLOAD_BYTES = 5;

/** Matches a canonical seed code exactly, e.g. `M1-7K2Q-X9MP`. */
export const CANONICAL_SEED_PATTERN = /^[EMH][1-9]-[0-9A-HJKMNP-TV-Z]{4}-[0-9A-HJKMNP-TV-Z]{4}$/;

/** A successfully parsed seed code. */
export interface ParsedSeed {
  difficulty: Difficulty;
  version: number;
  /** 8 canonical base32 characters, no dashes. */
  payload: string;
  /** Canonical display form, e.g. `M1-7K2Q-X9MP`. */
  canonical: string;
}

/** Why a seed code could not be parsed. */
export type SeedParseError =
  'empty' | 'length' | 'difficulty' | 'version' | 'unsupported_version' | 'character';

/** Result of {@link parseSeed}. */
export type SeedParseResult = { ok: true; seed: ParsedSeed } | { ok: false; error: SeedParseError };

const LETTER_BY_DIFFICULTY = { easy: 'E', medium: 'M', hard: 'H' } as const satisfies Record<
  Difficulty,
  'E' | 'M' | 'H'
>;

const DIFFICULTY_BY_LETTER: Readonly<Record<string, Difficulty>> = {
  E: 'easy',
  M: 'medium',
  H: 'hard',
};

const SEPARATORS = /[\s_-]/g;
const AMBIGUOUS: Readonly<Record<string, string>> = { O: '0', I: '1', L: '1' };

/** Returns the seed-code letter of a difficulty. */
export function difficultyLetter(d: Difficulty): 'E' | 'M' | 'H' {
  return LETTER_BY_DIFFICULTY[d];
}

/** True when `version` is a generator version this release supports. */
export function isSupportedGeneratorVersion(version: number): boolean {
  return (SUPPORTED_GENERATOR_VERSIONS as readonly number[]).includes(version);
}

/**
 * Parses a seed code typed by a person.
 *
 * Trims, uppercases and removes whitespace, `-` and `_`; the rest must be exactly
 * 10 characters. In the payload, `O` reads as `0` and `I`/`L` read as `1`.
 */
export function parseSeed(input: string): SeedParseResult {
  const compact = input.trim().toUpperCase().replace(SEPARATORS, '');
  if (compact.length === 0) return { ok: false, error: 'empty' };
  if (compact.length !== 2 + SEED_PAYLOAD_LENGTH) return { ok: false, error: 'length' };

  const difficulty = DIFFICULTY_BY_LETTER[compact.charAt(0)];
  if (difficulty === undefined) return { ok: false, error: 'difficulty' };

  const versionChar = compact.charAt(1);
  if (versionChar < '1' || versionChar > '9') return { ok: false, error: 'version' };
  const version = Number(versionChar);
  if (!isSupportedGeneratorVersion(version)) return { ok: false, error: 'unsupported_version' };

  let payload = '';
  for (const raw of compact.slice(2)) {
    const ch = AMBIGUOUS[raw] ?? raw;
    if (!SEED_ALPHABET.includes(ch)) return { ok: false, error: 'character' };
    payload += ch;
  }

  return {
    ok: true,
    seed: { difficulty, version, payload, canonical: canonicalSeed(difficulty, version, payload) },
  };
}

/**
 * Formats a seed code from its parts.
 *
 * @param payload40 exactly 5 bytes (40 bits), big-endian.
 * @throws RangeError if `version` is not 1–9 or `payload40` is not 5 bytes long.
 */
export function formatSeed(difficulty: Difficulty, version: number, payload40: Uint8Array): string {
  if (!Number.isInteger(version) || version < 1 || version > 9) {
    throw new RangeError(`Seed version must be an integer 1–9, got ${version}`);
  }
  return canonicalSeed(difficulty, version, encodePayload(payload40));
}

/**
 * Encodes 5 bytes as 8 Crockford base32 characters (big-endian, 5 bits per character).
 *
 * @throws RangeError if `bytes` is not 5 bytes long.
 */
export function encodePayload(bytes: Uint8Array): string {
  if (bytes.length !== SEED_PAYLOAD_BYTES) {
    throw new RangeError(`Seed payload must be ${SEED_PAYLOAD_BYTES} bytes, got ${bytes.length}`);
  }
  let out = '';
  let acc = 0;
  let bits = 0;
  for (const byte of bytes) {
    acc = (acc << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      bits -= 5;
      out += SEED_ALPHABET.charAt((acc >>> bits) & 31);
    }
    acc &= (1 << bits) - 1;
  }
  return out;
}

/**
 * Decodes 8 canonical base32 characters back to 5 bytes. Inverse of {@link encodePayload}.
 *
 * @throws RangeError if `payload` is not 8 characters of {@link SEED_ALPHABET}.
 */
export function decodePayload(payload: string): Uint8Array {
  if (payload.length !== SEED_PAYLOAD_LENGTH) {
    throw new RangeError(`Seed payload must be ${SEED_PAYLOAD_LENGTH} characters`);
  }
  const out = new Uint8Array(SEED_PAYLOAD_BYTES);
  let acc = 0;
  let bits = 0;
  let index = 0;
  for (const ch of payload) {
    const value = SEED_ALPHABET.indexOf(ch);
    if (value < 0) throw new RangeError(`Invalid seed payload character '${ch}'`);
    acc = (acc << 5) | value;
    bits += 5;
    if (bits >= 8) {
      bits -= 8;
      out[index++] = (acc >>> bits) & 0xff;
      acc &= (1 << bits) - 1;
    }
  }
  return out;
}

function canonicalSeed(difficulty: Difficulty, version: number, payload: string): string {
  return `${difficultyLetter(difficulty)}${version}-${payload.slice(0, 4)}-${payload.slice(4)}`;
}
