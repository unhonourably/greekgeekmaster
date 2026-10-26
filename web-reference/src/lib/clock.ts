"use client";

import { useSyncExternalStore } from "react";

const STEP = 30_000;

function subscribe(onChange: () => void): () => void {
  const timer = setInterval(onChange, STEP);
  return () => clearInterval(timer);
}

function snapshot(): number {
  return Math.floor(Date.now() / STEP) * STEP;
}

function serverSnapshot(): number {
  return 0;
}

export function useNow(): number {
  return useSyncExternalStore(subscribe, snapshot, serverSnapshot);
}
