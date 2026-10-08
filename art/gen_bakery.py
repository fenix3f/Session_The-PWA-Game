import math
# Финальный хлебозавод (изометрия) и хлеб. Запуск: python3 gen_bakery.py -> bakery_iso.svg, bread.svg
S=40; CX=330; CY=235
def P(x,y,z):
    return (CX+(x-y)*0.866*S, CY+(x+y)*0.5*S - z*S)
def pts(*ps): return " ".join("%.1f,%.1f"%P(*p) for p in ps)
out=[]
def poly(ps,fill,stroke="#1a1216",sw=3,op=None):
    o=' opacity="%s"'%op if op else ''
    out.append('<polygon points="%s" fill="%s" stroke="%s" stroke-width="%s" stroke-linejoin="round"%s/>'%(pts(*ps),fill,stroke,sw,o))
def line(a,b,col,w=1.5,op=0.35):
    (x1,y1),(x2,y2)=P(*a),P(*b)
    out.append('<line x1="%.1f" y1="%.1f" x2="%.1f" y2="%.1f" stroke="%s" stroke-width="%s" opacity="%s" stroke-linecap="round"/>'%(x1,y1,x2,y2,col,w,op))
def box(x0,y0,z0,dx,dy,dz,top,left,right,lines=True,lc="#4a1d14"):
    x1,y1,z1=x0+dx,y0+dy,z0+dz
    poly([(x0,y1,z0),(x1,y1,z0),(x1,y1,z1),(x0,y1,z1)],left)
    poly([(x1,y0,z0),(x1,y1,z0),(x1,y1,z1),(x1,y0,z1)],right)
    poly([(x0,y0,z1),(x1,y0,z1),(x1,y1,z1),(x0,y1,z1)],top)
    if lines:
        z=z0+0.3
        while z<z1-0.05:
            line((x0,y1,z),(x1,y1,z),lc)
            line((x1,y0,z),(x1,y1,z),lc)
            z+=0.3

BL="#b0584a"; BR="#8a3f33"
box(-3,1.5,0,3,3,1.5,"#8d8f98","#b0584a","#8a3f33")
poly([(-2.4,4.5,0.55),(-1.4,4.5,0.55),(-1.4,4.5,1.15),(-2.4,4.5,1.15)],"#ffd36b",sw=2.5)
poly([(-1.1,4.5,0.55),(-0.3,4.5,0.55),(-0.3,4.5,1.15),(-1.1,4.5,1.15)],"#ffd36b",sw=2.5)
box(-2.2,2.2,1.5,0.7,0.7,0.5,"#9aa0a8","#767b84","#5f646d",lines=False)

poly([(0,5,0),(8,5,0),(8,5,3),(0,5,3)],BL)
poly([(8,0,0),(8,5,0),(8,5,3),(8,0,3),(8,0,3)],BR)
z=0.3
while z<3:
    line((0,5,z),(8,5,z),"#4a1d14"); line((8,0,z),(8,5,z),"#4a1d14"); z+=0.3
poly([(0,0,3),(8,0,3),(8,5,3),(0,5,3)],"#7a3b30")
for i in range(1,6):
    line((0,i*5/6,3),(8,i*5/6,3),"#3d1812",2,0.5)
for xa,xb in [(0.8,2.4),(3.2,4.8),(5.6,7.2)]:
    poly([(xa,1.2,3),(xb,1.2,3),(xb,3.8,3),(xa,3.8,3)],"#7fa6c9",sw=2.5)
    line(((xa+xb)/2,1.2,3),((xa+xb)/2,3.8,3),"#1a1216",2,0.7)
poly([(0,5,3),(8,5,3),(8,5,2.8),(0,5,2.8)],"#4f251f",sw=2.5)
for a,b in [(0.6,1.8),(2.1,3.1),(5.4,6.5),(6.8,7.7)]:
    poly([(a,5,0.9),(b,5,0.9),(b,5,2.1),(a,5,2.1)],"#ffd36b",sw=2.5)
    line(((a+b)/2,5,0.9),((a+b)/2,5,2.1),"#1a1216",2.5,0.9)
    line((a,5,1.5),(b,5,1.5),"#1a1216",2.5,0.9)
for a,b in [(0.8,2.0),(2.5,3.7)]:
    poly([(8,a,0.9),(8,b,0.9),(8,b,2.1),(8,a,2.1)],"#e8b94f",sw=2.5)
    line((8,(a+b)/2,0.9),(8,(a+b)/2,2.1),"#1a1216",2.5,0.9)
    line((8,a,1.5),(8,b,1.5),"#1a1216",2.5,0.9)
poly([(3.5,5,0),(4.7,5,0),(4.7,5,1.7),(3.5,5,1.7)],"#5b3a26",sw=3)
line((4.1,5,0),(4.1,5,1.7),"#1a1216",2.5,0.9)
poly([(3.0,5,2.1),(5.2,5,2.1),(5.2,5,2.8),(3.0,5,2.8)],"#f1e7c9",sw=3)
sx,sy=P(4.1,5,2.28)
out.append('<text transform="translate(%.1f %.1f) matrix(0.866 0.5 0 1 0 0)" font-family="Arial, sans-serif" font-size="22" font-weight="bold" text-anchor="middle" fill="#8a4a16">ХЛЕБ</text>'%(sx,sy))
box(3.3,5,0,1.6,0.5,0.15,"#8b8294","#6b6270","#554d5c",lines=False)

cxm,cym=6.8,0.6
box(cxm,cym,3,1.0,1.0,3.6,"#a8523f","#b0584a","#8a3f33",lc="#4a1d14")
box(cxm-0.12,cym-0.12,6.6,1.24,1.24,0.3,"#7a3b30","#6a2e24","#55241c",lines=False)

sx0,sy0=P(10.6,2.6,0); syT=sy0-4.0*S
rx=1.2247*0.9*S; ry=0.7071*0.9*S
out.append('<path d="M%.1f %.1f L%.1f %.1f A%.1f %.1f 0 0 0 %.1f %.1f L%.1f %.1f Z" fill="#9fa8b3" stroke="#1a1216" stroke-width="3" stroke-linejoin="round"/>'%(sx0-rx,syT,sx0-rx,sy0,rx,ry,sx0+rx,sy0,sx0+rx,syT))
out.append('<path d="M%.1f %.1f L%.1f %.1f A%.1f %.1f 0 0 1 %.1f %.1f Z" fill="#6f7883" opacity="0.4"/>'%(sx0+rx*0.3,syT,sx0+rx*0.3,sy0+ry*0.95,rx,ry,sx0+rx,sy0))
for h in (1.0,2.0,3.0):
    yy=sy0-h*S
    out.append('<path d="M%.1f %.1f A%.1f %.1f 0 0 0 %.1f %.1f" fill="none" stroke="#5f6872" stroke-width="3"/>'%(sx0-rx,yy,rx,ry,sx0+rx,yy))
out.append('<ellipse cx="%.1f" cy="%.1f" rx="%.1f" ry="%.1f" fill="#b9c1ca" stroke="#1a1216" stroke-width="3"/>'%(sx0,syT,rx,ry))
out.append('<path d="M%.1f %.1f L%.1f %.1f L%.1f %.1f A%.1f %.1f 0 0 1 %.1f %.1f Z" fill="#c5ccd4" stroke="#1a1216" stroke-width="3" stroke-linejoin="round"/>'%(sx0-rx,syT,sx0,syT-1.2*S,sx0+rx,syT,rx,ry,sx0-rx,syT))
out.append('<rect x="%.1f" y="%.1f" width="46" height="22" rx="4" fill="#f1e7c9" stroke="#1a1216" stroke-width="2.5"/>'%(sx0-23,sy0-2.0*S))
out.append('<text x="%.1f" y="%.1f" font-family="Arial, sans-serif" font-size="14" font-weight="bold" text-anchor="middle" fill="#7a4a1a">МУКА</text>'%(sx0,sy0-2.0*S+16))

tx,ty=P(cxm+0.5,cym+0.5,6.9)
for dx,dy,r,o in [(0,-18,20,0.95),(22,-52,27,0.9),(58,-92,33,0.85),(104,-122,36,0.7)]:
    out.append('<circle cx="%.1f" cy="%.1f" r="%d" fill="#ece8ef" stroke="#b9b3c0" stroke-width="2" opacity="%s"/>'%(tx+dx,ty+dy,r,o))

svg='<svg xmlns="http://www.w3.org/2000/svg" viewBox="-20 -60 860 640" width="860" height="640">\n'+"\n".join(out)+'\n</svg>\n'
open("bakery_iso.svg","w").write(svg)

bread='''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 300" width="400" height="300">
  <defs>
    <linearGradient id="crust" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#f0b45e"/>
      <stop offset="0.6" stop-color="#c9772e"/>
      <stop offset="1" stop-color="#9a5320"/>
    </linearGradient>
  </defs>
  <path d="M40 190 C18 118 92 56 200 54 C308 56 382 118 360 190 C350 245 50 245 40 190 Z" fill="url(#crust)" stroke="#4e260d" stroke-width="7" stroke-linejoin="round"/>
  <path d="M46 202 C100 248 300 248 354 202 C346 240 54 240 46 202 Z" fill="#7a3d14" opacity="0.55"/>
  <ellipse cx="130" cy="92" rx="62" ry="20" transform="rotate(-18 130 92)" fill="#fff" opacity="0.22"/>
  <g fill="none" stroke-linecap="round">
    <path d="M98 172 C112 130 134 104 166 90" stroke="#f8dc9a" stroke-width="22"/>
    <path d="M168 188 C184 146 206 120 238 104" stroke="#f8dc9a" stroke-width="22"/>
    <path d="M240 192 C256 156 278 134 308 122" stroke="#f8dc9a" stroke-width="22"/>
    <path d="M102 176 C116 134 138 108 168 94" stroke="#b3601f" stroke-width="7" opacity="0.8"/>
    <path d="M172 192 C188 150 210 124 240 108" stroke="#b3601f" stroke-width="7" opacity="0.8"/>
    <path d="M244 196 C260 160 282 138 310 126" stroke="#b3601f" stroke-width="7" opacity="0.8"/>
  </g>
  <g fill="#fff6dc" opacity="0.7">
    <circle cx="90" cy="140" r="2.5"/><circle cx="210" cy="76" r="2.5"/><circle cx="330" cy="150" r="2.5"/>
    <circle cx="150" cy="215" r="2"/><circle cx="280" cy="85" r="2"/><circle cx="60" cy="185" r="2"/>
  </g>
</svg>
'''
open("bread.svg","w").write(bread)
