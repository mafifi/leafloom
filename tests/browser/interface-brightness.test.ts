import {expect,it} from 'vitest';
import {interfaceBrightness} from '../../apps/desktop/src/lib/interface-brightness';
it('NEO135 auxiliary tabs default bright independently of writing and shelf system contrast',()=>{
 for (const panel of ['outline','notes','darlings']) expect(interfaceBrightness({},'editor',panel,false)).toBe(true);
 expect(interfaceBrightness({},'editor','manuscript',false)).toBe(false);
 expect(interfaceBrightness({},'library','outline',false)).toBe(false);
 expect(interfaceBrightness({},'library','manuscript',true)).toBe(true);
});
it('NEO135 independent persisted settings survive both tab directions',()=>{
 const preferences={uiBright:true,uiBrightAside:false};
 expect(interfaceBrightness(preferences,'editor','notes')).toBe(false);
 expect(interfaceBrightness(preferences,'editor','manuscript')).toBe(true);
 expect(interfaceBrightness(preferences,'library','notes')).toBe(true);
});
