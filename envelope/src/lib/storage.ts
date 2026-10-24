// 宛先帳・差出人・印刷設定はこのPCのブラウザ（localStorage）にだけ保存する。
// 宛先は個人情報なのでリポジトリやサーバーには置かない
import { useEffect, useState } from "react";

const PREFIX = "envelope:";

function load<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(PREFIX + key);
    return raw ? { ...fallback, ...JSON.parse(raw) } : fallback;
  } catch {
    return fallback;
  }
}

function loadArray<T>(key: string): T[] {
  try {
    const raw = localStorage.getItem(PREFIX + key);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function save(key: string, value: unknown) {
  try {
    localStorage.setItem(PREFIX + key, JSON.stringify(value));
  } catch {
    // 保存できなくても印刷はできるので無視する
  }
}

export function useStoredObject<T extends object>(key: string, fallback: T) {
  const [value, setValue] = useState<T>(() => load(key, fallback));
  useEffect(() => save(key, value), [key, value]);
  return [value, setValue] as const;
}

export function useStoredArray<T>(key: string) {
  const [value, setValue] = useState<T[]>(() => loadArray<T>(key));
  useEffect(() => save(key, value), [key, value]);
  return [value, setValue] as const;
}
