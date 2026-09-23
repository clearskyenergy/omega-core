# © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.
# Authoring utility, not a deployment/build dependency. Full-volume reference interpretation.
import math, json, struct, base64
from pathlib import Path
G={'asset':{'version':'2.0','generator':'OMEGA articulated Doom reconstruction','copyright':'© 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.'},'scene':0,'scenes':[{'nodes':[0]}],'nodes':[],'meshes':[],'materials':[],'buffers':[],'bufferViews':[],'accessors':[],'animations':[]}
buf=bytearray()
def acc(values,typ,n):
    while len(buf)%4: buf.append(0)
    offset=len(buf); flat=[v for row in values for v in row] if n>1 else values
    buf.extend(struct.pack('<'+'f'*len(flat),*flat)); view=len(G['bufferViews']); G['bufferViews'].append({'buffer':0,'byteOffset':offset,'byteLength':len(flat)*4})
    a={'bufferView':view,'componentType':5126,'count':len(values),'type':typ}
    if n>1: a.update(min=[min(row[i] for row in values) for i in range(n)],max=[max(row[i] for row in values) for i in range(n)])
    else: a.update(min=[min(values)],max=[max(values)])
    G['accessors'].append(a); return len(G['accessors'])-1
for name,color,metal in [('Cloak',[.025,.13,.10,1],.15),('Armor',[.39,.48,.49,1],.85),('Shadow',[.012,.022,.025,1],.3),('Trim',[.40,.43,.24,1],.75),('Eyes',[.2,1,.77,1],.2)]:
    G['materials'].append({'name':name,'doubleSided':True,'pbrMetallicRoughness':{'baseColorFactor':color,'metallicFactor':metal,'roughnessFactor':.36},'emissiveFactor':[.1,.7,.45] if name=='Eyes' else [0,0,0]})
def node(name,pos=(0,0,0),parent=None):
    i=len(G['nodes']); G['nodes'].append({'name':name,'translation':list(pos),'children':[]})
    if parent is not None:G['nodes'][parent]['children'].append(i)
    return i
def surface(name,rings,mat,parent,segments=40,start=0,end=math.tau):
    # Rings are (height, x radius, z radius, z offset); longitudinal folds are geometry.
    vertices=[]
    for y,rx,rz,zc in rings:
        for j in range(segments+1):
            a=start+(end-start)*j/segments; fold=1+.035*math.cos(a*14) if mat==0 else 1
            vertices.append((rx*math.sin(a)*fold,y,zc+rz*math.cos(a)*fold))
    p=[]; normals=[]
    for k in range(len(rings)-1):
        for j in range(segments):
            a=k*(segments+1)+j;b=a+segments+1
            for ids in [(a,b,a+1),(a+1,b,b+1)]:
                tri=[vertices[i] for i in ids];u=[tri[1][i]-tri[0][i] for i in range(3)];v=[tri[2][i]-tri[0][i] for i in range(3)];n=[u[1]*v[2]-u[2]*v[1],u[2]*v[0]-u[0]*v[2],u[0]*v[1]-u[1]*v[0]];l=math.sqrt(sum(x*x for x in n)) or 1
                p.extend(tri); normals.extend([tuple(x/l for x in n)]*3)
    mesh=len(G['meshes']); G['meshes'].append({'name':name,'primitives':[{'attributes':{'POSITION':acc(p,'VEC3',3),'NORMAL':acc(normals,'VEC3',3)},'material':mat}]})
    i=node(name,parent=parent);G['nodes'][i]['mesh']=mesh;return i
def ell(name,pos,scale,mat,parent):
    n=node(name+' pivot',pos,parent);rings=[]
    for k in range(13):
        a=math.pi*k/12;rings.append((scale[1]*math.cos(a),max(.0001,scale[0]*math.sin(a)),max(.0001,scale[2]*math.sin(a)),0))
    surface(name,rings,mat,n,24);return n
root=node('Doom');hips=node('hips',(0,.99,0),root);torso=node('spine',(0,.24,0),hips)
surface('Tunic',[(.43,.24,.15,0),(.3,.29,.18,0),(.04,.23,.14,0),(-.15,.21,.14,0),(-.55,.31,.2,0),(-.68,.34,.22,0)],0,torso)
ell('Breastplate',(0,.29,.095),(.265,.23,.11),1,torso)
surface('Belt',[(-.06,.237,.157,0),(-.14,.237,.157,0)],2,torso)
ell('Buckle',(0,-.10,.16),(.065,.055,.026),3,torso)
head=node('head',(0,.56,0),torso)
surface('Hood',[(.34,.005,.005,-.04),(.29,.11,.10,-.035),(.18,.19,.16,-.035),(.02,.215,.19,-.04),(-.14,.27,.2,-.04)],0,head,48,.68,math.tau-.68)
ell('Mask',(0,.105,.05),(.132,.181,.114),1,head)
for side in [-1,1]:
    ell('Eye socket',(side*.058,.146,.15),(.048,.021,.018),2,head)
    ell('Eye slit',(side*.058,.147,.166),(.029,.006,.005),4,head)
    ell('Brow',(side*.055,.179,.14),(.066,.018,.027),1,head)
    ell('Cheek',(side*.084,.071,.135),(.04,.064,.026),1,head)
ell('Nose',(0,.10,.167),(.022,.057,.026),1,head)
for x in [-.042,-.021,0,.021,.042]:ell('Mask vent',(x,-.002,.146),(.005,.029,.008),2,head)
for side,label in [(-1,'left'),(1,'right')]:
    arm=node(label+'Shoulder',(side*.295,.38,0),torso)
    ell('Pauldron',(side*.026,-.015,0),(.155,.145,.155),1,arm)
    ell('Upper arm',(0,-.18,0),(.094,.17,.098),2,arm)
    fore=node(label+'Elbow',(0,-.34,0),arm)
    ell('Elbow',(0,0,0),(.091,.075,.088),1,fore)
    ell('Gauntlet',(0,-.14,0),(.088,.155,.10),1,fore)
    for y in [-.055,-.10,-.145,-.19]:surface('Gauntlet band',[(y,.091,.102,0),(y-.014,.091,.102,0)],2,fore,24)
    hand=node(label+'Wrist',(0,-.295,0),fore);ell('Palm',(0,-.045,.008),(.067,.076,.04),1,hand)
    for f in range(4):ell('Finger',((f-1.5)*.031,-.112,.012),(.014,.047,.021),1,hand)
    ell('Thumb',(-side*.069,-.053,.029),(.023,.05,.025),1,hand)
    leg=node(label+'Hip',(side*.135,-.025,0),hips)
    ell('Thigh',(0,-.20,0),(.115,.23,.117),2,leg)
    knee=node(label+'Knee',(0,-.42,0),leg);ell('Kneecap',(0,0,.075),(.086,.10,.065),1,knee)
    ell('Greave',(0,-.20,0),(.084,.22,.089),1,knee)
    ell('Boot',(0,-.405,.065),(.098,.069,.168),1,knee)
    ell('Cloak clasp',(side*.19,.43,.147),(.06,.06,.023),3,torso)
cape=node('cape',(0,.43,-.06),torso)
surface('Cape',[(0,.31,.17,0),(-.25,.35,.23,0),(-.65,.40,.26,-.015),(-1.05,.47,.30,-.015),(-1.48,.50,.32,0)],0,cape,64,1.2,math.tau-1.2)
# Portable node animation: rigid armor uses a transform hierarchy, no skin required.
lookup={n['name']:i for i,n in enumerate(G['nodes'])}
for clip,duration in [('Idle',4),('Walk',1.2),('Talk',3)]:
    anim={'name':clip,'samplers':[],'channels':[]};times=[duration*k/32 for k in range(33)]
    for name,axis,amp,phase,base in ([('head',1,.06,0,0),('spine',0,.018,0,0)] if clip=='Idle' else [('leftHip',0,.42,0,0),('rightHip',0,.42,math.pi,0),('leftKnee',0,.28,-1,.28),('rightKnee',0,.28,math.pi-1,.28),('leftShoulder',0,.24,math.pi,0),('rightShoulder',0,.24,0,0)] if clip=='Walk' else [('rightShoulder',0,.17,0,-.65),('rightElbow',0,.2,1,-.7),('leftElbow',0,.1,0,-.3),('head',0,.045,1,0)]):
        qs=[]
        for t in times:
            a=base+amp*math.sin(t/duration*math.tau+phase);q=[0,0,0,math.cos(a/2)];q[axis]=math.sin(a/2);qs.append(q)
        s=len(anim['samplers']);anim['samplers'].append({'input':acc(times,'SCALAR',1),'output':acc(qs,'VEC4',4),'interpolation':'LINEAR'});anim['channels'].append({'sampler':s,'target':{'node':lookup[name],'path':'rotation'}})
    G['animations'].append(anim)
G['buffers']=[{'byteLength':len(buf),'uri':'data:application/octet-stream;base64,'+base64.b64encode(buf).decode()}]
Path('assets/doom/doom-articulated.gltf').write_text(json.dumps(G,separators=(',',':')))
print('Wrote model:',len(G['nodes']),'nodes,',len(buf),'geometry/animation bytes')

# Also write a self-contained binary glTF for DCC/game-engine import.
G['buffers']=[{'byteLength':len(buf)}]
js=json.dumps(G,separators=(',',':')).encode()
while len(js)%4:js+=b' '
while len(buf)%4:buf.append(0)
Path('assets/doom/doom-articulated.glb').write_bytes(struct.pack('<III',0x46546c67,2,12+8+len(js)+8+len(buf))+struct.pack('<II',len(js),0x4e4f534a)+js+struct.pack('<II',len(buf),0x004e4942)+buf)
