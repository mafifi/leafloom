"""Render Leafloom's small geometric leaf mark into macOS application assets."""
from pathlib import Path
import math, struct, zlib, subprocess
root=Path(__file__).resolve().parents[1]/'apps/desktop/src-tauri/icons'
root.mkdir(parents=True,exist_ok=True)
iconset=root/'Leafloom.iconset';iconset.mkdir(exist_ok=True)
def png(size,path):
 rows=[]
 for y in range(size):
  row=bytearray([0])
  for x in range(size):
   colors=[]
   for dy in [.25,.75]:
    for dx in [.25,.75]:
     px=(x+dx)/size;py=(y+dy)/size
     corner=max(abs(px-.5)-.31,0)**2+max(abs(py-.5)-.31,0)**2<=.19**2
     color=(26,61,47,255) if corner else (0,0,0,0)
     lx=(px-.51)*.82+(py-.5)*.57;ly=-(px-.51)*.57+(py-.5)*.82
     if (lx/.18)**2+(ly/.33)**2<1:color=(201,218,157,255)
     if abs(px+py-1.02)<.012 and .31<py<.73:color=(26,61,47,255)
     colors.append(color)
   row.extend(round(sum(c[i] for c in colors)/4) for i in range(4))
  rows.append(row)
 def chunk(kind,data):return struct.pack('>I',len(data))+kind+data+struct.pack('>I',zlib.crc32(kind+data)&0xffffffff)
 path.write_bytes(b'\x89PNG\r\n\x1a\n'+chunk(b'IHDR',struct.pack('>IIBBBBB',size,size,8,6,0,0,0))+chunk(b'IDAT',zlib.compress(b''.join(rows)))+chunk(b'IEND',b''))
png(128,root/'icon.png')
for size in [16,32,128,256,512]:
 png(size,iconset/f'icon_{size}x{size}.png');png(size*2,iconset/f'icon_{size}x{size}@2x.png')
subprocess.run(['/usr/bin/iconutil','-c','icns',str(iconset),'-o',str(root/'Leafloom.icns')],check=True)
