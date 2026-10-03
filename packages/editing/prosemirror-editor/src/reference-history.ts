import type { Location, Part } from './model';

type Anchor = { chapterId: string; passageId: string; from: number; to: number };
type Snapshot = { location: Location; anchors: Anchor[] };

export const cloneLocation = (location: Location): Location => ({
  ...location,
  parts: location.parts.map((part) => ({ ...part })),
});

/** Reference snapshots follow the master PM history; this is not an undo engine. */
export class ReferenceHistory {
  private readonly snapshots = new Map<string, Map<string, Snapshot>>();
  private branches: { before: string; after: string }[] = [];
  private cursor = 0;
  clear() {
    this.snapshots.clear();
    this.branches = [];
    this.cursor = 0;
  }
  remember(
    version: string,
    locations: ReadonlyMap<string, Location>,
    anchors: (location: Location) => Anchor[],
  ) {
    this.snapshots.set(
      version,
      new Map(
        Array.from(locations, ([id, location]) => [
          id,
          { location: cloneLocation(location), anchors: anchors(location) },
        ]),
      ),
    );
  }
  restore(
    version: string,
    mapped: ReadonlyMap<string, Location>,
    locate: (anchor: Anchor) => Part | null,
  ): Map<string, Location> {
    const snapshot = this.snapshots.get(version);
    return new Map(
      Array.from(mapped, ([id, location]) => {
        const saved = snapshot?.get(id);
        if (!saved) return [id, { ...location, unresolved: true }];
        if (saved.location.deleted || saved.location.unresolved)
          return [id, cloneLocation(saved.location)];
        const parts = saved.anchors.map(locate);
        if (!parts.length || parts.some((part) => part === null))
          return [id, { ...location, unresolved: true }];
        return [
          id,
          { ...saved.location, parts: parts.filter((part): part is Part => part !== null) },
        ];
      }),
    );
  }
  record(
    previous: string,
    current: string,
    depthBefore: number,
    depth: number,
    historical: boolean,
  ) {
    if (historical) this.cursor = depth;
    else {
      this.branches = this.branches.slice(0, this.cursor);
      if (depth !== depthBefore || !this.branches.length)
        this.branches.push({ before: previous, after: current });
      else this.branches.at(-1)!.after = current;
      while (this.branches.length > depth) this.branches.shift();
      this.cursor = this.branches.length;
    }
    const retained = new Set([
      current,
      ...this.branches.flatMap((branch) => [branch.before, branch.after]),
    ]);
    for (const version of this.snapshots.keys())
      if (!retained.has(version)) this.snapshots.delete(version);
  }
}
