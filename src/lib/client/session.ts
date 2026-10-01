export interface PlayerSession {
  code: string;
  playerId: string;
  token: string;
  nickname: string;
  emoji: string;
}

export interface HostSession {
  code: string;
  hostToken: string;
}

const PLAYER_KEY = "tumbleword:player";
const HOST_KEY = "tumbleword:host";

function read<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

function write(key: string, value: unknown) {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // storage unavailable (private mode); the session just won't survive reloads
  }
}

export const loadPlayerSession = () => read<PlayerSession>(PLAYER_KEY);
export const savePlayerSession = (s: PlayerSession | null) => write(PLAYER_KEY, s);
export const loadHostSession = () => read<HostSession>(HOST_KEY);
export const saveHostSession = (s: HostSession | null) => write(HOST_KEY, s);
