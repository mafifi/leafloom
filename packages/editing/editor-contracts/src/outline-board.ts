/** Card addresses resolve against the live manuscript, never a saved card model. */
export type OutlineCardTarget = {
  kind: 'chapter' | 'section' | 'scene' | 'loose';
  chapterId: string;
  sectionId?: string;
  segmentIndex?: number;
  sceneIndex?: number;
  passageId?: string;
  looseId?: string;
};
export type OutlineCard = {
  key: string;
  kind: OutlineCardTarget['kind'] | 'part';
  chapterId: string;
  label: string;
  note: string;
  excerpt: string;
  words: number;
  written: boolean;
  /** The first author passage is a planned ghost, ready to be replaced on navigation. */
  ghost?: boolean;
  virtual: boolean;
  flag: boolean;
  first: boolean;
  last: boolean;
  sectionId?: string;
  segmentIndex?: number;
  sceneIndex?: number;
  sceneId?: string;
  passageId?: string;
  looseId?: string;
  slug?: string;
  cast?: string[];
  eighths?: number | null;
};
export type OutlineCardInsertion =
  | { kind: 'chapter'; afterChapterId: string | null }
  | { kind: 'section'; chapterId: string; afterSegment: number }
  | { kind: 'scene'; afterScene: number }
  | { kind: 'loose' };
export type OutlineDropSide = 'before' | 'after' | 'into';
export type WalkingOutlineNote = { chapterId: string; sectionId: string; passageId: string; text: string };
/** Actual screenplay geometry, including the paginator's spacing above each paragraph. */
export type OutlineSceneMeasurement = { passageId: string; lines: number; before: number; page?: number; fill?: number };
