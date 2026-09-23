/* © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential. */
/* Dependency-free WebGL viewer for the authored glTF node rig. ES5, no build. */
(function(root){
'use strict';
function identity(){return [1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1];}
function mul(a,b){var o=[],i,j,k;for(i=0;i<4;i++)for(j=0;j<4;j++){o[i*4+j]=0;for(k=0;k<4;k++)o[i*4+j]+=a[k*4+j]*b[i*4+k];}return o;}
function transform(p,q){var x=q[0],y=q[1],z=q[2],w=q[3];return [1-2*y*y-2*z*z,2*x*y+2*w*z,2*x*z-2*w*y,0,2*x*y-2*w*z,1-2*x*x-2*z*z,2*y*z+2*w*x,0,2*x*z+2*w*y,2*y*z-2*w*x,1-2*x*x-2*y*y,0,p[0],p[1],p[2],1];}
function axis(a,n){var q=[0,0,0,Math.cos(a/2)];q[n]=Math.sin(a/2);return q;}
/* Choose complete poses at human-scale intervals, never new random angles per frame.
   Blend through anticipation, hold and release, with a quiet gap between gestures. */
function createMotion(random){
var rng=random||Math.random,elapsed=0,duration=1,gap=.4,previous=-1,active=false;
var current=[0,0,0,0,0,0,0,0,0,0],target=current.slice(),origin=current.slice();
/* left/right shoulder, elbow, wrist, shoulder spread, head nod and head yaw */
var poses=[
 [-.18,-.62,-.32,-.94,-.08,.30,.06,.22,.045,-.06],
 [-.58,-.16,-.88,-.30,-.30,.07,.20,.06,.02,.08],
 [-.40,-.43,-.62,-.69,-.20,.24,.19,.20,.035,0],
 [-.12,-.34,-.28,-1.04,-.05,.15,.04,.10,-.045,-.04],
 [-.28,-.12,-.80,-.24,-.18,.06,.08,.04,.07,.04]
];
function choose(){var index=Math.floor(rng()*(poses.length-1));if(index>=previous&&previous>=0)index++;if(previous<0)index=Math.floor(rng()*poses.length);previous=index;var scale=.8+rng()*.3;target=poses[index].map(function(v){return v*scale;});origin=current.slice();elapsed=0;duration=2.1+rng()*2.0;active=true;}
return {step:function(dt,speaking,reduced){
 dt=Math.max(0,Math.min(.1,dt));
 if(!speaking||reduced){active=false;gap=.3;elapsed=0;for(var j=0;j<current.length;j++)current[j]+=(0-current[j])*Math.min(1,dt*6);return current.slice();}
 if(!active){gap-=dt;if(gap<=0)choose();}
 if(active){elapsed+=dt;var phase=elapsed/duration,weight;
 if(phase<.25){weight=phase/.25;weight=weight*weight*(3-2*weight);for(var k=0;k<current.length;k++)current[k]=origin[k]+(target[k]-origin[k])*weight;}
 else if(phase<.60){current=target.slice();}
 else{weight=Math.min(1,(phase-.60)/.40);weight=weight*weight*(3-2*weight);for(var i=0;i<current.length;i++)current[i]=target[i]*(1-weight);}
 if(phase>=1){active=false;gap=.45+rng()*1.4;}
 }
 return current.slice();
}};
}
/* The portrait path preserves the supplied pixels. It is an articulated 2.5D
   surface, with intentionally limited orbit; it does not invent a back view. */
function createPortrait(host,opts){
opts=opts||{};
var canvas=document.createElement('canvas');canvas.style.cssText='width:100%;height:100%;display:block;touch-action:none';canvas.setAttribute('aria-label','Doom portrait with articulated image depth. Drag for limited parallax.');host.appendChild(canvas);
var gl=canvas.getContext('webgl',{alpha:true,antialias:true,premultipliedAlpha:false});if(!gl){host.removeChild(canvas);throw new Error('WebGL is unavailable');}
var dead=false,raf=0,frameTime=0,clock=0,state='idle',energy=0,target=0,yaw=0,drag=null,solid=true,original=opts.original!==false,loaded=false;
var paused=false;var motion=createMotion(),reduced=root.matchMedia&&root.matchMedia('(prefers-reduced-motion: reduce)').matches;
var vertex=[
'precision mediump float;attribute vec3 p;attribute vec2 uv;uniform mat4 vp;uniform float yaw;uniform float time;uniform float energy;uniform float original;uniform vec4 arms;uniform vec2 head;varying vec2 vUv;varying float z;',
'vec2 turn(vec2 p,vec2 center,float a){float c=cos(a),s=sin(a);p-=center;return center+vec2(c*p.x-s*p.y,s*p.x+c*p.y);}',
'void main(){vUv=uv;vec3 q=p;float side=uv.x<.5?-1.:1.;float ax=abs(uv.x-.5);',
'float armMask=smoothstep(.13,.20,ax)*(1.-smoothstep(.51,.57,uv.y))*smoothstep(.18,.24,uv.y)*(1.-original);',
'float elbowMask=smoothstep(.33,.40,uv.y);float upper=side<0.?arms.x:arms.y;float lower=side<0.?arms.z:arms.w;',
'float aspect=0.6666667;vec2 shoulder=vec2(side*.165*2.6*aspect,(.5-.235)*2.6);vec2 elbow=vec2(side*.255*2.6*aspect,(.5-.38)*2.6);',
'vec2 a=turn(q.xy,elbow,lower*elbowMask);a=turn(a,shoulder,upper);q.xy=mix(q.xy,a,armMask);',
'float hm=1.-smoothstep(.20,.27,uv.y);q.xy=mix(q.xy,turn(q.xy,vec2(0.,.65),head.x+energy*.007),hm);q.x+=head.y*hm;',
'float crossed=smoothstep(.20,.26,uv.y)*(1.-smoothstep(.37,.43,uv.y))*original;float shift=(arms.z-arms.w)*.10+energy*.009; q.xy=mix(q.xy,turn(q.xy,vec2(0.,.37),shift),crossed);',
'float breath=sin(time*1.45)*.003;float torso=smoothstep(.18,.26,uv.y)*(1.-smoothstep(.51,.7,uv.y));q.x*=1.+breath*torso;q.y+=breath*torso;',
'float cape=smoothstep(.5,.88,uv.y)*(1.-original);q.x+=sin(time*1.1+uv.y*4.)*.003*cape;',
'float c=cos(yaw),s=sin(yaw);q=vec3(c*q.x+s*q.z,q.y,-s*q.x+c*q.z);z=q.z;gl_Position=vp*vec4(q,1.);}'
].join('\n');
var fragment='precision mediump float;uniform sampler2D tex;uniform float holo;uniform float time;uniform float energy;varying vec2 vUv;varying float z;void main(){vec4 c=texture2D(tex,vUv);if(c.a<.025)discard;float scan=.96+.04*sin(gl_FragCoord.y*1.8-time*4.);vec3 tint=c.rgb*vec3(.65,1.08,1.06)+vec3(.012,.032,.025)*(1.+energy);gl_FragColor=vec4(mix(c.rgb,tint*scan,holo),c.a);}';
function compile(type,source){var s=gl.createShader(type);gl.shaderSource(s,source);gl.compileShader(s);if(!gl.getShaderParameter(s,gl.COMPILE_STATUS))throw new Error(gl.getShaderInfoLog(s));return s;}
var vs=compile(gl.VERTEX_SHADER,vertex),fs=compile(gl.FRAGMENT_SHADER,fragment),program=gl.createProgram();gl.attachShader(program,vs);gl.attachShader(program,fs);gl.linkProgram(program);if(!gl.getProgramParameter(program,gl.LINK_STATUS))throw new Error('Portrait shader link failed: '+gl.getProgramInfoLog(program));
var loc={},buffers=[],texture=gl.createTexture(),count=0;
['p','uv'].forEach(function(k){loc[k]=gl.getAttribLocation(program,k);});['vp','yaw','time','energy','original','arms','head','tex','holo'].forEach(function(k){loc[k]=gl.getUniformLocation(program,k);});
function image(src){return new Promise(function(resolve,reject){var im=new Image();im.onload=function(){resolve(im);};im.onerror=function(){reject(new Error('Unable to load character image'));};im.src=src;});}
var originalImage=opts.originalImage||'/assets/doom-figure.png',poseImage=opts.image||originalImage;
var assets;
function upload(){if(dead||!assets)return;var im=original?assets[0]:assets[1],depth=assets[2],work=document.createElement('canvas');work.width=depth.width;work.height=depth.height;var ctx=work.getContext('2d');ctx.drawImage(depth,0,0);var pixels=ctx.getImageData(0,0,depth.width,depth.height).data;
var positions=[],uvs=[],indices=[],nx=100,ny=150,aspect=im.width/im.height;
for(var j=0;j<=ny;j++)for(var i=0;i<=nx;i++){var u=i/nx,v=j/ny,d;if(original){var px=Math.round(u*(depth.width-1)),py=Math.round(v*(depth.height-1));d=pixels[(py*depth.width+px)*4]/255*.28;}else{d=Math.sqrt(Math.max(0,1-Math.pow((u-.5)/.33,2)))*.16;}positions.push((u-.5)*2.6*aspect,(.5-v)*2.6,d);uvs.push(u,v);}
for(var y=0;y<ny;y++)for(var x=0;x<nx;x++){var a=y*(nx+1)+x,b=a+nx+1;indices.push(a,b,a+1,a+1,b,b+1);}count=indices.length;
buffers.forEach(function(b){gl.deleteBuffer(b);});buffers=[];
function buffer(target,values){var b=gl.createBuffer();buffers.push(b);gl.bindBuffer(target,b);gl.bufferData(target,values,gl.STATIC_DRAW);}
buffer(gl.ARRAY_BUFFER,new Float32Array(positions));buffer(gl.ARRAY_BUFFER,new Float32Array(uvs));buffer(gl.ELEMENT_ARRAY_BUFFER,new Uint16Array(indices));
gl.bindTexture(gl.TEXTURE_2D,texture);gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL,false);gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,im);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);loaded=true;
}
var ready=Promise.all([image(originalImage),image(poseImage),image(opts.depth||'/assets/doom-depth.png')]).then(function(a){assets=a;upload();});
function frame(now){if(dead)return;raf=root.requestAnimationFrame(frame);if(document.hidden){frameTime=now;return;}var dt=Math.min(.05,(now-(frameTime||now))/1000);frameTime=now;clock+=dt;energy+=(target-energy)*Math.min(1,dt*9);
var w=Math.max(1,host.clientWidth),h=Math.max(1,host.clientHeight),dpr=Math.min(root.devicePixelRatio||1,2);if(canvas.width!==Math.round(w*dpr)||canvas.height!==Math.round(h*dpr)){canvas.width=Math.round(w*dpr);canvas.height=Math.round(h*dpr);}gl.viewport(0,0,canvas.width,canvas.height);gl.clearColor(0,0,0,0);gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);if(!loaded)return;
var pose=motion.step(dt,state==='speaking',reduced||paused),f=1/Math.tan(.28),dist=Math.max(5.2,3.7/(w/h)),proj=[f/(w/h),0,0,0,0,f,0,0,0,0,-1.002,-1,0,0,-.2002,0];var view=identity();view[14]=-dist;
gl.useProgram(program);gl.disable(gl.DEPTH_TEST);gl.enable(gl.BLEND);gl.blendFunc(gl.SRC_ALPHA,gl.ONE_MINUS_SRC_ALPHA);gl.uniformMatrix4fv(loc.vp,false,new Float32Array(mul(proj,view)));gl.uniform1f(loc.yaw,yaw);gl.uniform1f(loc.time,reduced||paused?0:clock);gl.uniform1f(loc.energy,reduced||paused?0:energy);gl.uniform1f(loc.original,original?1:0);gl.uniform1f(loc.holo,solid?0:1);
/* Small bounded rotations preserve photographic texture and avoid pretending the
   unseen back of the hands is available. Rest arms angle in slightly. */
gl.uniform4f(loc.arms,-.07-pose[0]*.22,.07+pose[1]*.22,-pose[2]*.12,pose[3]*.12);gl.uniform2f(loc.head,(reduced||paused?0:Math.sin(clock*.57)*.007)+pose[8]*.24,(!paused&&state==='listening'?.006:0)+pose[9]*.035);
gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_2D,texture);gl.uniform1i(loc.tex,0);['p','uv'].forEach(function(k,i){gl.bindBuffer(gl.ARRAY_BUFFER,buffers[i]);gl.enableVertexAttribArray(loc[k]);gl.vertexAttribPointer(loc[k],i?2:3,gl.FLOAT,false,0,0);});gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER,buffers[2]);gl.drawElements(gl.TRIANGLES,count,gl.UNSIGNED_SHORT,0);
}
function down(e){drag=e.clientX;if(canvas.setPointerCapture)canvas.setPointerCapture(e.pointerId);}function move(e){if(drag===null)return;yaw=Math.max(-.20,Math.min(.20,yaw+(e.clientX-drag)*.002));drag=e.clientX;}function up(){drag=null;}
canvas.addEventListener('pointerdown',down);canvas.addEventListener('pointermove',move);canvas.addEventListener('pointerup',up);canvas.addEventListener('pointercancel',up);raf=root.requestAnimationFrame(frame);
return {ready:ready,canvas:canvas,setState:function(v){state=v;},setEnergy:function(v){target=Math.max(0,Math.min(1,Number(v)||0));},setSolid:function(v){solid=!!v;},setPaused:function(v){paused=!!v;},setOriginal:function(v){original=!!v;upload();},reset:function(){yaw=0;},destroy:function(){dead=true;root.cancelAnimationFrame(raf);buffers.forEach(function(b){gl.deleteBuffer(b);});gl.deleteTexture(texture);gl.deleteProgram(program);gl.deleteShader(vs);gl.deleteShader(fs);canvas.removeEventListener('pointerdown',down);canvas.removeEventListener('pointermove',move);canvas.removeEventListener('pointerup',up);canvas.removeEventListener('pointercancel',up);if(canvas.parentNode)canvas.parentNode.removeChild(canvas);}};
}

/* Full 3D import path. Material maps, skeletons and clips come from the asset;
   no substitute character is generated when an asset is missing. */
/* Retargeted to the supplied Visiion/Bip001 skeleton. Rotate around anatomical
   axes expressed in each joint's bind frame, rather than guessing local Euler axes. */
function createDoomRig(object,T){
var joints={},all=[],walk=0,listen=0,time=0,stepPhase=0,motion=createMotion();
object.updateMatrixWorld(true);
object.traverse(function(n){if(!n.isBone)return;var key=n.name.toLowerCase().replace(/[^a-z0-9]/g,'');var q=n.getWorldQuaternion(new T.Quaternion()).invert();var j={bone:n,rest:n.quaternion.clone().normalize(),x:new T.Vector3(1,0,0).applyQuaternion(q),y:new T.Vector3(0,1,0).applyQuaternion(q),z:new T.Vector3(0,0,1).applyQuaternion(q),key:key};joints[key]=j;all.push(j);});
function find(prefix){for(var k in joints)if(k.indexOf(prefix)===0)return joints[k];return null;}
var head=find('bip001head'),spine=find('bip001spine1'),hips=find('bip001pelvis');
if(!head||!spine||!hips||!find('bip001lupperarm')||!find('bip001rupperarm'))return null;
/* These decorative pieces were authored as rigid meshes outside the skin. */
var clamps=object.getObjectByName('Clamps001')||object.getObjectByName('Clamps.001');
var belt=object.getObjectByName('Object_4001')||object.getObjectByName('Object_4.001');
object.traverse(function(n){var key=n.name.toLowerCase().replace(/[^a-z0-9]/g,'');if(key==='clamps001')clamps=n;if(key==='object4001')belt=n;});
if(clamps)spine.bone.attach(clamps);if(belt){var waist=find('bip001spine');if(waist)waist.bone.attach(belt);}
var delta=new T.Quaternion();
function rotate(j,x,y,z){if(!j)return;j.bone.quaternion.copy(j.rest);if(x)j.bone.quaternion.multiply(delta.setFromAxisAngle(j.x,x));if(y)j.bone.quaternion.multiply(delta.setFromAxisAngle(j.y,y));if(z)j.bone.quaternion.multiply(delta.setFromAxisAngle(j.z,z));}
function poseRig(dt,state,energy,reduced){
var rate=Math.min(1,dt*5);walk+=((state==='walk'&&!reduced?1:0)-walk)*rate;listen+=((state==='listening'?1:0)-listen)*rate;
if(!reduced){time+=dt;stepPhase+=dt*4.5;}var pose=motion.step(dt,state==='speaking',reduced),breath=reduced?0:Math.sin(time*1.6)*.009;
all.forEach(function(j){j.bone.quaternion.copy(j.rest);});
rotate(spine,breath+pose[8]*.10,Math.sin(stepPhase)*walk*.035,0);
rotate(head,listen*.07+pose[8]*.65+(reduced?0:energy*.017),pose[9]*.75+(reduced?0:Math.sin(time*.63)*.025),listen*.035);
['l','r'].forEach(function(side,i){var sign=i?-1:1,s=Math.sin(stepPhase+i*Math.PI);var base='bip001'+side;
/* Relax the source A-pose. Speech lifts the forearm forward and opens the shoulder. */
rotate(find(base+'upperarm'),-.04+pose[i]*.65+s*walk*.23,sign*pose[6+i]*.15,-sign*(.37+pose[6+i]*-.7));
rotate(find(base+'forearm'),-.10+pose[2+i]*.78,0,0);
rotate(find(base+'hand'),pose[4+i]*.18,sign*pose[4+i]*.22,0);
rotate(find(base+'thigh'),-s*walk*.27,0,0);
rotate(find(base+'calf'),Math.max(0,-s)*walk*.43,0,0);
rotate(find(base+'foot'),s*walk*.12-Math.max(0,-s)*walk*.19,0,0);
});
all.forEach(function(j){if(/^capebone\d+/.test(j.key)&&j.key.indexOf('end')<0){rotate(j,(reduced?0:Math.sin(time*1.8+all.indexOf(j)*.13)*.01)+walk*.045,0,0);}else if(/^clothbone\d+/.test(j.key)&&j.key.indexOf('end')<0){rotate(j,-walk*.04+(reduced?0:Math.sin(time*1.6)*.004),0,0);}});
return {walk:walk,time:time,phase:stepPhase};
}
return {step:poseRig,joints:all.length,reset:function(){all.forEach(function(j){j.bone.quaternion.copy(j.rest);});},mapped:true};
}

function createModel(host,source,opts){
opts=opts||{};
var T=root.THREE;if(!T||!T.GLTFLoader)throw new Error('3D model loader is unavailable');
var renderer=new T.WebGLRenderer({alpha:true,antialias:true});renderer.setPixelRatio(Math.min(root.devicePixelRatio||1,2));renderer.outputEncoding=T.sRGBEncoding;renderer.toneMapping=T.ACESFilmicToneMapping;renderer.toneMappingExposure=.95;
var canvas=renderer.domElement;canvas.style.cssText='position:absolute;inset:0;width:100%;height:100%;touch-action:none';canvas.setAttribute('aria-label','Full 3D textured character. Drag to orbit.');host.appendChild(canvas);
var scene=new T.Scene(),camera=new T.PerspectiveCamera(32,1,.01,100),group=new T.Group();scene.add(group);camera.position.set(0,1.2,4.8);camera.lookAt(0,1.2,0);
scene.add(new T.HemisphereLight(0xcdeaf2,0x182721,.85));var key=new T.DirectionalLight(0xffefd8,1.9);key.position.set(-3,4,4);scene.add(key);var rim=new T.DirectionalLight(0x8ecbd0,1.25);rim.position.set(3,2,-2);scene.add(rim);
/* A neutral studio environment gives metal reflections without overwriting maps. */
var room=new T.Scene();room.background=new T.Color(0x606866);var roomMesh=new T.Mesh(new T.BoxGeometry(10,10,10),new T.MeshBasicMaterial({color:0x646c6a,side:T.BackSide}));room.add(roomMesh);
var softbox=new T.Mesh(new T.PlaneGeometry(4,6),new T.MeshBasicMaterial({color:0xffffff}));softbox.position.set(-4,2,0);softbox.rotation.y=Math.PI/2;room.add(softbox);
var pmrem=new T.PMREMGenerator(renderer),env=pmrem.fromScene(room);scene.environment=env.texture;pmrem.dispose();roomMesh.geometry.dispose();roomMesh.material.dispose();softbox.geometry.dispose();softbox.material.dispose();
var dead=false,raf=0,last=0,state='idle',energy=0,target=0,paused=false,solid=true,object=null,mixer=null,actions=[],activeAction=null,headBone=null,headRest=null,shoulders=[],bones=0,materials=[],phase=0,nextGesture=0,lastClip=-1,yaw=0,drag=null,rig=null,heading=0,maskMouth=[],maskGlow=[];
var motion=createMotion(),reduced=root.matchMedia&&root.matchMedia('(prefers-reduced-motion: reduce)').matches;
var manager=new T.LoadingManager();manager.setURLModifier(function(url){if(/^blob:|^data:/i.test(url))return url;throw new Error('Use a self-contained GLB with embedded textures');});var loader=new T.GLTFLoader(manager);
function chooseClip(){if(!actions.length)return;var pattern=state==='speaking'?/talk|speak|gesture|explain/i:state==='walk'?/walk/i:/idle|stand|breath/i;var found=actions.filter(function(a){return pattern.test(a.getClip().name);});if(!found.length){if(activeAction){activeAction.stop();activeAction=null;}nextGesture=phase+4;return;}var index=Math.floor(Math.random()*found.length);if(found.length>1&&index===lastClip)index=(index+1)%found.length;lastClip=index;var action=found[index];if(action!==activeAction){action.reset().setEffectiveWeight(1).play();if(activeAction)activeAction.crossFadeTo(action,.45,false);activeAction=action;}nextGesture=phase+4+Math.random()*4;}
var ready=Promise.resolve(source).then(function(bytes){return new Promise(function(resolve,reject){
if(dead){resolve({cancelled:true});return;}
loader.parse(bytes,'',function(gltf){if(dead){disposeObject(gltf.scene);return;}object=gltf.scene;
var box=new T.Box3().setFromObject(object),size=box.getSize(new T.Vector3()),center=box.getCenter(new T.Vector3());if(!isFinite(size.y)||size.y<.00001){disposeObject(object);object=null;reject(new Error('Model has no visible geometry'));return;}
var scale=2.3/size.y;object.scale.multiplyScalar(scale);object.position.sub(center.multiplyScalar(scale));object.position.y+=1.15;group.add(object);
object.traverse(function(n){if(n.isBone){bones++;if(/(^|[_:])head$|^head$/i.test(n.name)){headBone=n;headRest=n.quaternion.clone();}if(/upperarm|upper_arm|leftarm|rightarm/i.test(n.name))shoulders.push({bone:n,rest:n.quaternion.clone(),side:/left|_l\b|\.l$/i.test(n.name)?-1:1});}
if(opts.mask&&/^(lipLower_low|lowerHead_low|chin_low|teeth_low)$/i.test(n.name))maskMouth.push({node:n,position:n.position.clone(),rotation:n.rotation.clone()});
if(n.isMesh){var list=Array.isArray(n.material)?n.material:[n.material];list.forEach(function(m){if(materials.indexOf(m)<0)materials.push(m);});n.frustumCulled=false;}});
rig=createDoomRig(object,T);
maskMouth.forEach(function(part){part.node.traverse(function(n){if(!n.isMesh)return;var list=Array.isArray(n.material)?n.material:[n.material];list.forEach(function(m){if(maskGlow.indexOf(m)<0&&m&&m.emissive){m.userData.maskBaseEmissive=m.emissive.clone();m.userData.maskBaseIntensity=m.emissiveIntensity||0;maskGlow.push(m);}});});});
materials.forEach(function(m){if(rig&&/^sv_doctordoom01_s01_[14]$/.test(m.name)){m.color.multiply(new T.Color(.18,.28,.20));m.roughness=.85;}if(m.envMapIntensity!==undefined)m.envMapIntensity=.7;});
mixer=new T.AnimationMixer(object);actions=(gltf.animations||[]).map(function(c){return mixer.clipAction(c);});chooseClip();resolve({bones:bones,proceduralRig:!!rig,clips:actions.map(function(a){return a.getClip().name;})});
},function(e){reject(new Error(e&&e.message||'Unable to parse this GLB'));});});});
function disposeObject(o){if(!o)return;var seen=[];o.traverse(function(n){if(n.geometry)n.geometry.dispose();var ms=n.material?(Array.isArray(n.material)?n.material:[n.material]):[];ms.forEach(function(m){if(seen.indexOf(m)>=0)return;seen.push(m);Object.keys(m).forEach(function(k){if(m[k]&&m[k].isTexture)m[k].dispose();});m.dispose();});});}
function frame(now){if(dead)return;raf=root.requestAnimationFrame(frame);var dt=Math.min(.05,(now-(last||now))/1000);last=now;if(document.hidden)return;var w=host.clientWidth||1,h=host.clientHeight||1;if(canvas.width!==Math.round(w*renderer.getPixelRatio())||canvas.height!==Math.round(h*renderer.getPixelRatio())){renderer.setSize(w,h,false);camera.aspect=w/h;camera.position.z=Math.max(4.8,3.5/camera.aspect);camera.updateProjectionMatrix();}
energy+=(target-energy)*Math.min(1,dt*9);
if(!paused){
  if(!reduced){phase+=dt;if(mixer)mixer.update(dt);if(state==='speaking'&&phase>nextGesture)chooseClip();}
  if(rig&&!activeAction){var movement=rig.step(dt,state,energy,reduced);var angle=movement.time*.64;
    group.position.x=Math.sin(angle)*.48*movement.walk;group.position.z=(Math.cos(angle)-1)*.18*movement.walk;
    group.position.y=Math.abs(Math.sin(movement.phase))*.012*movement.walk;
    var goalHeading=Math.atan2(Math.cos(angle)*.48,-Math.sin(angle)*.18)*movement.walk;
    var turn=Math.atan2(Math.sin(goalHeading-heading),Math.cos(goalHeading-heading));heading+=turn*Math.min(1,dt*3);
  }else if(!activeAction&&!reduced){var pose=motion.step(dt,state==='speaking',false);
    if(headBone)headBone.quaternion.copy(headRest).multiply(new T.Quaternion().setFromEuler(new T.Euler(pose[8]*.45+energy*.018,pose[9]*.45,0)));
    shoulders.forEach(function(s,i){s.bone.quaternion.copy(s.rest).multiply(new T.Quaternion().setFromEuler(new T.Euler(pose[i%2]*.12,0,s.side*pose[6+i%2]*.1)));});
  }
}
/* This mask has separate lower-lip, jaw, chin and teeth objects but no face
   rig or morph targets. Move only those authored parts: it creates a real jaw
   opening from speech energy without distorting the mask itself. */
if(maskMouth.length){var mouthOpen=state==='speaking'?(.12+energy*.88)*(reduced?1:.68+.32*Math.sin(phase*16)*Math.sin(phase*16)):0;maskMouth.forEach(function(part){part.node.position.copy(part.position);part.node.rotation.copy(part.rotation);part.node.position.y-=mouthOpen*.035/Math.max(.001,object.scale.y);part.node.rotation.x-=mouthOpen*.09;});maskGlow.forEach(function(m){m.emissive.copy(m.userData.maskBaseEmissive);m.emissiveIntensity=m.userData.maskBaseIntensity+mouthOpen*1.8;if(mouthOpen)m.emissive.add(new T.Color(0,.34,.13));});}
group.rotation.y=yaw+heading;renderer.render(scene,camera);}
function down(e){drag=e.clientX;if(canvas.setPointerCapture)canvas.setPointerCapture(e.pointerId);}function move(e){if(drag===null)return;yaw+=(e.clientX-drag)*.008;drag=e.clientX;}function up(){drag=null;}
canvas.addEventListener('pointerdown',down);canvas.addEventListener('pointermove',move);canvas.addEventListener('pointerup',up);canvas.addEventListener('pointercancel',up);raf=root.requestAnimationFrame(frame);
return {ready:ready,canvas:canvas,setState:function(v){state=v;chooseClip();},setEnergy:function(v){target=Math.max(0,Math.min(1,Number(v)||0));},setPaused:function(v){paused=!!v;},setSolid:function(v){solid=!!v;materials.forEach(function(m){if(!m.emissive)return;if(!m.userData.doomEmissive)m.userData.doomEmissive=m.emissive.clone();m.emissive.copy(m.userData.doomEmissive);if(!solid)m.emissive.add(new T.Color(.015,.12,.09));});},reset:function(){yaw=0;},destroy:function(){dead=true;root.cancelAnimationFrame(raf);if(mixer){mixer.stopAllAction();mixer.uncacheRoot(object);}disposeObject(object);env.dispose();renderer.dispose();canvas.removeEventListener('pointerdown',down);canvas.removeEventListener('pointermove',move);canvas.removeEventListener('pointerup',up);canvas.removeEventListener('pointercancel',up);if(canvas.parentNode)canvas.parentNode.removeChild(canvas);}};
}

function loadAsset(path){return fetch(path).then(function(r){if(!r.ok)throw new Error('Doom model HTTP '+r.status);return r.arrayBuffer();});}
function createDefault(host){return createModel(host,loadAsset('/assets/doom/dr-doom-v2.glb'));}
function createMask(host){return createModel(host,loadAsset('/assets/doom/doctor-dooms-mask.glb'),{mask:true});}
root.OmegaDoom={createModel:createModel,createPortrait:createPortrait,create:createDefault,createMask:createMask,createMotion:createMotion,createDoomRig:createDoomRig,version:"20260922-mask-6"};
})(window);
