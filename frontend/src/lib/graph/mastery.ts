import type { MasteryMap, MasteryStatus, PathTraceResult, PathTraceStep } from './types.ts';

export const MASTERY_STORAGE_KEY = 'garden-mastery-v1';

export const MASTERY_LABELS: Record<MasteryStatus, string> = {
  unseen: 'نخوانده',
  learning: 'در حال مطالعه',
  review: 'نیاز به مرور',
  mastered: 'تسلط دارم',
};

/** Loads persisted personal mastery map safely in SSR or browser environments. */
export function loadMasteryMap(): MasteryMap {
  if (typeof window === 'undefined' || typeof window.localStorage === 'undefined') {
    return {};
  }
  try {
    const raw = window.localStorage.getItem(MASTERY_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    const clean: MasteryMap = {};
    for (const [k, v] of Object.entries(parsed)) {
      if (v === 'learning' || v === 'review' || v === 'mastered') {
        clean[k] = v;
      }
    }
    return clean;
  } catch {
    return {};
  }
}

/** Saves personal mastery map to localStorage when available. */
export function saveMasteryMap(map: MasteryMap): void {
  if (typeof window === 'undefined' || typeof window.localStorage === 'undefined') {
    return;
  }
  try {
    window.localStorage.setItem(MASTERY_STORAGE_KEY, JSON.stringify(map));
  } catch {
    // Ignore quota or storage restriction errors cleanly
  }
}

/** Returns a new immutable mastery map with `nodeId` updated (deleting entry when reset to `unseen`). */
export function setNodeMastery(map: MasteryMap, nodeId: string, status: MasteryStatus): MasteryMap {
  const next: MasteryMap = { ...map };
  if (status === 'unseen') {
    delete next[nodeId];
  } else {
    next[nodeId] = status;
  }
  return next;
}

/** Returns prerequisite steps along the trace checklist that are not yet marked `mastered`. */
export function findMissingPrerequisites(
  trace: PathTraceResult,
  mastery: MasteryMap,
): PathTraceStep[] {
  const steps = trace.studyChecklist?.length ? trace.studyChecklist : trace.orderedSteps;
  return steps.filter((step) => mastery[step.nodeId] !== 'mastered');
}
