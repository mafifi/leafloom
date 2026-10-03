// @vitest-environment jsdom
import {it,expect} from 'vitest';
import {editableText} from '../../apps/desktop/src/lib/editable-text';
it('retains one native text node and the author caret across reactive heading updates',()=>{
 const element=document.createElement('div');element.contentEditable='true';element.tabIndex=0;document.body.append(element);
 const action=editableText(element,'');element.focus();element.textContent='A title';const range=document.createRange();range.selectNodeContents(element);range.collapse(false);window.getSelection()!.removeAllRanges();window.getSelection()!.addRange(range);
 action.update('A title');expect(element.textContent).toBe('A title');expect(element.childNodes.length).toBe(1);expect(window.getSelection()!.anchorNode).toBe(element);
 element.blur();action.update('Another title');expect(element.textContent).toBe('Another title');expect(element.childNodes.length).toBe(1);element.remove();
});
