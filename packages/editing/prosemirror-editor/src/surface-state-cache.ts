import type {Mark, Node} from 'prosemirror-model';
import type {EditorState} from 'prosemirror-state';
import type {Annotation} from '@leafloom/editor-contracts';
export interface SurfaceStateInputs {
  section: Node;
  from: number;
  to: number;
  marks: readonly Mark[] | null;
  pageKind: string;
  walkingPassage: string | null;
  base: number;
  ranges: readonly {annotation: Annotation; position: number}[];
}
function same(left: SurfaceStateInputs, right: SurfaceStateInputs): boolean {
  if (left.section !== right.section || left.from !== right.from || left.to !== right.to ||
      left.pageKind !== right.pageKind || left.walkingPassage !== right.walkingPassage ||
      (left.marks === null) !== (right.marks === null) ||
      left.marks?.length !== right.marks?.length || left.ranges.length !== right.ranges.length)
    return false;
  if (left.marks?.some((mark, index) => !mark.eq(right.marks![index]))) return false;
  return left.ranges.every((range, index) => {
    const other = right.ranges[index], a = range.annotation, b = other.annotation;
    return range.position - left.base === other.position - right.base &&
      a.id === b.id && a.kind === b.kind && a.passageId === b.passageId &&
      a.from === b.from && a.to === b.to && a.message === b.message && a.correction === b.correction;
  });
}
/** A surface owns inactive chapter projections; native editing paths bypass reuse. */
export class SurfaceStateCache {
  private readonly entries = new Map<string, {inputs: SurfaceStateInputs; state: EditorState}>();
  project(id: string, inputs: SurfaceStateInputs, create: () => EditorState, reusable: boolean) {
    if (!reusable) {this.entries.delete(id); return create();}
    const cached = this.entries.get(id);
    if (cached && same(cached.inputs, inputs)) return cached.state;
    const state = create();
    this.entries.set(id, {inputs: {...inputs, marks: inputs.marks?.slice() ?? null,
      ranges: inputs.ranges.map(range => ({...range, annotation: {...range.annotation}}))}, state});
    return state;
  }
  clear() {this.entries.clear();}
  delete(id: string) {this.entries.delete(id);}
}
