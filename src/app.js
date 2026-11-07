import * as B from './body.js';
import { View3D, webglAvailable, PRESET_CYCLE } from './three-view.js';
let SITES3=null, MAPS3=null; // 3D anchors of SITES / MAPS (filled by init3D)
const spatial3=(name,p)=>MAPS3?B.mapAt3(MAPS3[name],p):0;
/* =====================================================================
   0. UTILITIES
   ===================================================================== */
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const smooth=(e0,e1,x)=>{const t=clamp((x-e0)/(e1-e0),0,1);return t*t*(3-2*t);};
const rand=(a,b)=>a+Math.random()*(b-a);
const hash=n=>{const s=Math.sin(n*12.9898)*43758.5453;return s-Math.floor(s);};
const $=id=>document.getElementById(id);

/* =====================================================================
   1. ANATOMY — body coordinates (SVG units, 1 cm ≈ 8 units, midline x = 300)
   P(view, side, dx, y): side is the PATIENT's side ('R','L','M').
   Front (supine, facing viewer): patient's right = viewer's left.
   Back: patient's right = viewer's right.
   ===================================================================== */
const CX=300;
function P(view,side,dx,y){const s=side==='M'?0:(side==='R'?-1:1);return {view,x:CX+(view==='front'?s:-s)*dx,y};}

const SITES={
  // Heart (front)
  aortic:   {...P('front','R',20,303), name:'Aortic area', desc:'2nd ICS, right sternal border', lab:'Aortic'},
  pulmonic: {...P('front','L',20,303), name:'Pulmonic area', desc:'2nd ICS, left sternal border', lab:'Pulmonic'},
  erb:      {...P('front','L',20,325), name:"Erb's point", desc:'3rd ICS, left sternal border', lab:"Erb's"},
  tricuspid:{...P('front','L',19,358), name:'Tricuspid area', desc:'4th–5th ICS, left lower sternal border', lab:'Tricuspid'},
  mitral:   {...P('front','L',74,390), name:'Mitral area (apex)', desc:'5th ICS, left midclavicular line', lab:'Mitral (apex)'},
  rCarotid: {...P('front','R',24,205), name:'Right carotid', desc:'neck, radiation site', lab:'R carotid', rad:true},
  lAxilla:  {...P('front','L',122,380), name:'Left axilla', desc:'mid-axillary line, radiation site', lab:'L axilla', rad:true},
  lsb34:    {...P('front','L',28,340), name:'Left sternal border', desc:'3rd–4th ICS'},
  // Lungs (front)
  trachea:  {...P('front','M',0,205), name:'Trachea', desc:'anterior neck', lab:'Trachea'},
  rulF:     {...P('front','R',64,292), name:'Right upper lobe', desc:'anterior, 2nd ICS MCL', lab:'RUL'},
  lulF:     {...P('front','L',64,292), name:'Left upper lobe', desc:'anterior, 2nd ICS MCL', lab:'LUL'},
  rmlF:     {...P('front','R',92,378), name:'Right middle lobe', desc:'4th–5th ICS, right MCL', lab:'RML'},
  lingF:    {...P('front','L',112,412), name:'Lingula', desc:'left anterior axillary line', lab:'Lingula'},
  rBaseF:   {...P('front','R',112,428), name:'Right lateral base', desc:'anterior/mid-axillary line', lab:'R base'},
  // Lungs (back)
  rulB:     {...P('back','R',52,282), name:'Right upper lobe (posterior)', desc:'above scapular spine', lab:'RUL'},
  lulB:     {...P('back','L',52,282), name:'Left upper lobe (posterior)', desc:'above scapular spine', lab:'LUL'},
  rllB:     {...P('back','R',64,392), name:'Right lower lobe', desc:'below the inferior angle of the scapula', lab:'RLL'},
  lllB:     {...P('back','L',64,392), name:'Left lower lobe', desc:'below the inferior angle of the scapula', lab:'LLL'},
  rBaseB:   {...P('back','R',68,432), name:'Right lung base (posterior)', desc:'≈ T10, paravertebral', lab:'R base'},
  lBaseB:   {...P('back','L',68,432), name:'Left lung base (posterior)', desc:'≈ T10, paravertebral', lab:'L base'},
  interB:   {...P('back','M',0,300), name:'Interscapular area', desc:'T2–T4, bronchovesicular', lab:'Interscapular'},
};
const HEART_DOTS=['aortic','pulmonic','erb','tricuspid','mitral','rCarotid','lAxilla'];
const LUNG_DOTS=['trachea','rulF','lulF','rmlF','lingF','rBaseF','rulB','lulB','rllB','lllB','rBaseB','lBaseB','interB'];

/* =====================================================================
   2. SPATIAL INTENSITY MAPS
   Each map is a list of Gaussian lobes {view,x,y,s(sigma),w(weight)}.
   Intensity I = 1 − Π(1 − w·g)  (smooth, ≤ 1, overlapping lobes merge).
   Gain applied to the component = I² (perceptual contrast).
   ===================================================================== */
const S=SITES;
const lobe=(pt,s,w)=>({view:pt.view,x:pt.x,y:pt.y,s,w});
const mirror=lobes=>lobes.map(l=>({...l,x:2*CX-l.x}));
const VES_R=[lobe(P('front','R',50,258),30,.8),lobe(P('front','R',66,300),42,1),lobe(P('front','R',88,355),44,1),lobe(P('front','R',108,410),34,.9),
  lobe(P('back','R',50,280),40,.9),lobe(P('back','R',62,335),44,1),lobe(P('back','R',66,392),44,1),lobe(P('back','R',70,432),32,.9),lobe(P('back','R',110,392),30,.7)];
const MAPS={
  // heart sounds
  S1:[lobe(S.mitral,56,1),lobe(S.tricuspid,42,.62),lobe(S.pulmonic,52,.38),lobe(S.aortic,52,.33),lobe(P('back','L',45,365),80,.12)],
  A2:[lobe(S.aortic,54,1),lobe(S.pulmonic,48,.75),lobe(S.erb,52,.5),lobe(S.mitral,62,.38),lobe(S.rCarotid,26,.3),lobe(P('back','L',40,330),80,.1)],
  P2:[lobe(S.pulmonic,30,1),lobe(S.erb,26,.4)],
  apexLow:[lobe(S.mitral,30,1),lobe(P('front','L',52,378),26,.35)],
  OS:[lobe(S.mitral,38,1),lobe(P('front','L',32,366),32,.7)],
  rumble:[lobe(S.mitral,24,1)],
  AS:[lobe(S.aortic,44,1),lobe(S.rCarotid,24,.75),lobe(P('front','L',24,205),24,.55),lobe(P('front','R',26,252),24,.5),lobe(S.erb,38,.45),lobe(S.mitral,38,.28),lobe(P('back','M',0,300),60,.08)],
  MR:[lobe(S.mitral,38,1),lobe(P('front','L',100,384),26,.3),lobe(S.lAxilla,30,.45),lobe(P('back','L',72,400),45,.3)],
  AR:[lobe(S.erb,32,1),lobe(P('front','L',20,348),30,.6),lobe(S.aortic,30,.4),lobe(S.tricuspid,30,.35)],
  VSD:[lobe(S.tricuspid,40,1),lobe(S.erb,38,.5),lobe(P('front','R',20,356),38,.4),lobe(S.mitral,44,.4),lobe(P('back','L',30,360),70,.15)],
  MVP:[lobe(S.mitral,32,1),lobe(P('front','L',50,376),28,.4)],
  periRub:[lobe(S.lsb34,46,1),lobe(S.erb,36,.45),lobe(S.mitral,42,.4)],
  // lungs
  vesR:VES_R, vesL:mirror(VES_R),
  bronch:[lobe(S.trachea,22,1),lobe(P('front','M',0,262),22,.45),lobe(P('back','M',0,212),24,.5),lobe(P('back','R',26,292),24,.35),lobe(P('back','L',26,292),24,.35)],
  bases:[lobe(S.rBaseB,36,1),lobe(S.lBaseB,36,1),lobe(P('back','R',105,415),28,.55),lobe(P('back','L',105,415),28,.55),lobe(P('front','R',110,425),28,.45),lobe(P('front','L',110,425),28,.45)],
  wheeze:[...VES_R.map(l=>({...l,w:l.w*.8})),...mirror(VES_R).map(l=>({...l,w:l.w*.8})),lobe(S.trachea,24,.55),lobe(P('front','M',0,285),36,.7),lobe(P('back','M',0,300),36,.6)],
  pleuralRub:[lobe(S.rBaseF,28,1),lobe(P('back','R',106,428),28,.75)],
  consol:[lobe(S.rBaseB,36,1),lobe(P('back','R',104,410),26,.55),lobe(P('front','R',112,434),24,.4)],
};
function mapAt(map,view,x,y){
  let prod=1;
  for(const l of map){ if(l.view!==view) continue; const dx=x-l.x,dy=y-l.y; prod*=1-l.w*Math.exp(-(dx*dx+dy*dy)/(2*l.s*l.s)); }
  return 1-prod;
}
const mapPeak=name=>{const l=MAPS[name].reduce((a,b)=>b.w>a.w?b:a);return {view:l.view,x:l.x,y:l.y};};

/* =====================================================================
   3. SOUND SYNTHESIS — one function per sound type (Web Audio only)
   signature: (engine, outNode, startTime, duration, amplitude, params, shape)
   ===================================================================== */
const edge=u=>smooth(0,.04,u)*(1-smooth(.96,1,u));
const SHAPES={
  thump:u=>u<.05?u/.05:Math.exp(-(u-.05)*5),
  click:u=>u<.05?u/.05:Math.exp(-(u-.05)*8),
  diamond:(u,p)=>{const k=p.peak??.45;const v=u<k?u/k:(1-u)/(1-k);return Math.pow(Math.max(0,v),.85)*edge(u);},
  plateau:u=>smooth(0,.06,u)*(1-smooth(.93,1,u))*(.9+.1*Math.sin(u*9)),
  decresc:u=>smooth(0,.035,u)*Math.pow(1-u,1.35),
  cresc:u=>(Math.pow(u,.9)*.85+.15*smooth(0,.12,u))*(1-smooth(.93,1,u)),
  msRumble:u=>(smooth(0,.1,u)*(.55*Math.exp(-u*2.6)+.22)+.8*smooth(.7,.95,u))*(1-smooth(.96,1,u)),
  vesIn:u=>smooth(0,.25,u)*(.55+.45*u)*(1-smooth(.86,1,u)),
  vesOut:u=>smooth(0,.08,u)*Math.exp(-u*3)*(1-smooth(.8,1,u)),
  bronch:u=>smooth(0,.1,u)*(1-smooth(.86,1,u)),
  rub:u=>Math.pow(Math.sin(Math.PI*u),.7),
  wheeze:u=>smooth(0,.15,u)*(1-smooth(.8,1,u)),
  tick:()=>0,
};
function curve(shape,p,amp,n=128){const c=new Float32Array(n),f=SHAPES[shape];for(let i=0;i<n;i++)c[i]=amp*f(i/(n-1),p);c[0]=0;c[n-1]=0;return c;}

function makeNoiseBuffer(ctx,sec){const b=ctx.createBuffer(1,Math.floor(ctx.sampleRate*sec),ctx.sampleRate);const d=b.getChannelData(0);for(let i=0;i<d.length;i++)d[i]=Math.random()*2-1;return b;}
function biquad(ctx,type,f,q){const b=ctx.createBiquadFilter();b.type=type;b.frequency.value=f;b.Q.value=q;return b;}
function addAM(ctx,node,t,d,depth,freq,type){ // returns gain node with amplitude modulation in [1-depth,1]
  const am=ctx.createGain(); am.gain.value=1-depth/2;
  const o=ctx.createOscillator(); o.type=type; o.frequency.value=freq;
  const og=ctx.createGain(); og.gain.value=depth/2; o.connect(og); og.connect(am.gain);
  o.start(t); o.stop(t+d+.05); node.connect(am); return am;
}

const SYN={
  /* Low-frequency valve-closure transient (S1, S2, S3, S4) */
  thump(E,out,t,d,a,p){
    const c=E.ctx,f=p.f||55,drop=p.drop||1.35,r2=p.r2||2.6;
    const o1=c.createOscillator(); o1.frequency.setValueAtTime(f*drop,t); o1.frequency.exponentialRampToValueAtTime(f,t+d*.5);
    const g1=c.createGain(); g1.gain.setValueAtTime(0,t); g1.gain.linearRampToValueAtTime(a,t+.007); g1.gain.setTargetAtTime(0,t+.012,d*.3);
    o1.connect(g1); g1.connect(out); o1.start(t); o1.stop(t+d*2.2);
    const o2=c.createOscillator(); o2.frequency.setValueAtTime(f*r2*1.12,t); o2.frequency.exponentialRampToValueAtTime(f*r2,t+d*.4);
    const g2=c.createGain(); g2.gain.setValueAtTime(0,t); g2.gain.linearRampToValueAtTime(a*(p.m2??.55),t+.005); g2.gain.setTargetAtTime(0,t+.009,d*.2);
    o2.connect(g2); g2.connect(out); o2.start(t); o2.stop(t+d*2);
    if((p.hi||0)>0){
      const n=E.noiseSrc(t,d), bp=biquad(c,'bandpass',p.hiF||250,1);
      const g3=c.createGain(); g3.gain.setValueAtTime(0,t); g3.gain.linearRampToValueAtTime(a*p.hi*7,t+.003); g3.gain.setTargetAtTime(0,t+.006,d*.13);
      n.connect(bp); bp.connect(g3); g3.connect(out);
    }
  },
  /* Short high-pitched transient (opening snap, mid-systolic click) */
  click(E,out,t,d,a,p){
    const c=E.ctx,f=p.f||600;
    const o=c.createOscillator(); o.frequency.setValueAtTime(f*1.25,t); o.frequency.exponentialRampToValueAtTime(f,t+d*.5);
    const g=c.createGain(); g.gain.setValueAtTime(0,t); g.gain.linearRampToValueAtTime(a,t+.0015); g.gain.setTargetAtTime(0,t+.003,d*.22);
    o.connect(g); g.connect(out); o.start(t); o.stop(t+d*2);
    const n=E.noiseSrc(t,d), hp=biquad(c,'highpass',f*.8,.7);
    const g2=c.createGain(); g2.gain.setValueAtTime(0,t); g2.gain.linearRampToValueAtTime(a*(p.hi??.5)*4,t+.001); g2.gain.setTargetAtTime(0,t+.002,d*.12);
    n.connect(hp); hp.connect(g2); g2.connect(out);
  },
  /* Filtered noise with envelope: murmurs, rumble, breath sounds */
  noise(E,out,t,d,a,p,shape){
    const c=E.ctx; let node=E.noiseSrc(t,d);
    const f1=biquad(c,p.ftype||'bandpass',p.fc||400,p.q??.8); node.connect(f1); node=f1;
    if(p.lp){const f=biquad(c,'lowpass',p.lp,.5);node.connect(f);node=f;}
    if(p.lp2){const f=biquad(c,'lowpass',p.lp2,.5);node.connect(f);node=f;}
    if(p.hp){const f=biquad(c,'highpass',p.hp,.5);node.connect(f);node=f;}
    if(p.harsh) node=addAM(c,node,t,d,p.harsh,(p.amF||60)*rand(.92,1.08),'sawtooth');
    if(p.wobble){node=addAM(c,node,t,d,p.wobble,(p.wobF||14)*rand(.9,1.1),'triangle');node=addAM(c,node,t,d,p.wobble*.6,(p.wobF||14)*.37,'sine');}
    const env=c.createGain(); env.gain.value=0; env.gain.setValueCurveAtTime(curve(shape,p,a*(p.gain||1)),t,d);
    node.connect(env); env.connect(out);
  },
  /* Friction rubs: stick-slip grains of noise */
  rub(E,out,t,d,a,p,shape){
    const c=E.ctx,sr=c.sampleRate,len=Math.max(64,Math.ceil(d*sr)),buf=c.createBuffer(1,len,sr),x=buf.getChannelData(0);
    let i=0; while(i<len){const gl=Math.max(8,Math.floor(rand(p.gMin||.003,p.gMax||.01)*sr)),amp=rand(.25,1);
      for(let j=0;j<gl&&i+j<len;j++)x[i+j]+=amp*Math.sin(Math.PI*j/gl)*(Math.random()*2-1);
      i+=gl+Math.floor(rand(0,p.gap||.005)*sr);}
    const s=c.createBufferSource(); s.buffer=buf;
    const hp=biquad(c,'highpass',p.hp||250,.6), bp=biquad(c,'bandpass',p.fc||700,p.q??.5);
    const env=c.createGain(); env.gain.value=0; env.gain.setValueCurveAtTime(curve(shape,p,a*(p.gain||1)),t,d);
    s.connect(hp); hp.connect(bp); bp.connect(env); env.connect(out); s.start(t);
  },
  /* Discontinuous crackles: damped sinusoid "pops", biased to late inspiration */
  crackles(E,out,t,d,a,p){
    const c=E.ctx,sr=c.sampleRate,len=Math.ceil(d*sr),buf=c.createBuffer(1,len,sr),x=buf.getChannelData(0),ticks=[];
    const n=Math.round((p.n||12)*rand(.8,1.2));
    for(let k=0;k<n;k++){
      const u=p.early?Math.random():Math.pow(Math.random(),.55), t0=u*d*.97; ticks.push(t+t0);
      const f=p.fine?rand(550,950):rand(180,380), tau=p.fine?rand(.0007,.0014):rand(.002,.004), amp=rand(.4,1)*(Math.random()<.5?-1:1);
      const i0=Math.floor(t0*sr), L=Math.min(len-i0,Math.ceil(tau*7*sr));
      for(let j=0;j<L;j++){const tt=j/sr;x[i0+j]+=amp*Math.exp(-tt/tau)*Math.cos(2*Math.PI*f*tt);}
    }
    const s=c.createBufferSource(); s.buffer=buf; const hp=biquad(c,'highpass',120,.6); const g=c.createGain(); g.gain.value=a*(p.gain||1);
    s.connect(hp); hp.connect(g); g.connect(out); s.start(t);
    return {ticks};
  },
  /* Continuous musical wheeze: several sine tones gliding slightly (polyphonic) */
  wheeze(E,out,t,d,a,p,shape){
    const c=E.ctx, env=c.createGain(); env.gain.value=0; env.gain.setValueCurveAtTime(curve(shape,p,a*(p.gain||1)),t,d);
    const lp=biquad(c,'lowpass',1600,.6); env.connect(lp); lp.connect(out);
    (p.freqs||[400]).forEach((f0,i)=>{const f=f0*rand(.96,1.04),o=c.createOscillator(); o.frequency.setValueAtTime(f,t); o.frequency.linearRampToValueAtTime(f*(p.glide||.92),t+d);
      const g=c.createGain(); g.gain.value=(p.levels?.[i]??1)/(p.freqs||[1]).length; o.connect(g); g.connect(env); o.start(t); o.stop(t+d+.03);});
  },
};

/* =====================================================================
   4. COMPONENT LIBRARY + CASE DEFINITIONS (pure data)
   Component spec:
     id, label (short, for trace), name (long), cat: sound|extra|murmur|breath|adv,
     band: low|mid|high (only for display weighting), synth: key of SYN,
     map: key of MAPS, cycle: 'beat'|'breath', gain, graded (follows murmur grade),
     params: synth parameters, events: [{at|from,to, dur, shape, amp}]
   Anchors — beat: S1, sys (S1 + f·systole), A2, dia (A2 + f·diastole), P2, S1next
             breath: insp (start + f·Ti), exp (start of expiration + f·Te), next
   ===================================================================== */
function mk(base,o={}){return {...base,...o,params:{...base.params,...(o.params||{})}};}
const C={
  S1:o=>mk({id:'S1',label:'S1',name:'S1 (mitral + tricuspid closure)',cat:'sound',band:'mid',synth:'thump',map:'S1',cycle:'beat',gain:1,
      params:{f:50,r2:2.7,hiF:240,hi:.6},events:[{at:{a:'S1'},dur:.11}]},o),
  A2:o=>mk({id:'A2',label:'A2',name:'A2 (aortic closure)',cat:'sound',band:'mid',synth:'thump',map:'A2',cycle:'beat',gain:.9,
      params:{f:66,r2:2.8,hiF:340,hi:.7,m2:.6},events:[{at:{a:'A2'},dur:.075}]},o),
  P2:o=>mk({id:'P2',label:'P2',name:'P2 (pulmonic closure)',cat:'sound',band:'mid',synth:'thump',map:'P2',cycle:'beat',gain:.75,
      params:{f:62,r2:2.7,hiF:310,hi:.65,m2:.6},events:[{at:{a:'P2'},dur:.065}]},o),
  S3:o=>mk({id:'S3',label:'S3',name:'S3 (ventricular gallop)',cat:'extra',band:'low',synth:'thump',map:'apexLow',cycle:'beat',gain:1.2,
      params:{f:34,r2:1.8,drop:1.15,hi:0,m2:.35},events:[{at:{a:'A2',s:.14},dur:.09}]},o),
  S4:o=>mk({id:'S4',label:'S4',name:'S4 (atrial gallop)',cat:'extra',band:'low',synth:'thump',map:'apexLow',cycle:'beat',gain:1.1,
      params:{f:30,r2:1.8,drop:1.15,hi:0,m2:.35},events:[{at:{a:'S1next',s:-.1},dur:.085}]},o),
  vesR:o=>mk({id:'vesR',label:'Insp',meter:'Vesicular R',name:'Vesicular breath sounds (right)',cat:'breath',band:'mid',synth:'noise',map:'vesR',cycle:'breath',gain:1,
      params:{ftype:'lowpass',fc:380,q:.6,hp:110,gain:2.4},
      events:[{from:{a:'insp'},to:{a:'exp',s:.06},shape:'vesIn',amp:1,label:'Insp'},{from:{a:'exp'},to:{a:'exp',f:.4},shape:'vesOut',amp:.4,label:'Exp'}]},o),
  vesL:o=>mk(C.vesR(),{id:'vesL',meter:'Vesicular L',name:'Vesicular breath sounds (left)',map:'vesL',...o}),
  bronch:o=>mk({id:'bronch',label:'Bronchial',meter:'Bronchial',name:'Bronchial (tracheal) breath sounds',cat:'breath',band:'high',synth:'noise',map:'bronch',cycle:'breath',gain:1,
      params:{fc:620,q:.55,lp:1800,hp:200,gain:1.7},
      events:[{from:{a:'insp'},to:{a:'insp',f:.9},shape:'bronch',amp:.8,label:'Insp'},{from:{a:'exp',f:.08},to:{a:'exp',f:.85},shape:'bronch',amp:1,label:'Exp'}]},o),
};
// Background layers (always present unless disabled)
const BG={
  heart:[C.vesR({id:'bgVesR',gain:.1,background:true}),C.vesL({id:'bgVesL',gain:.1,background:true})],
  lungs:[C.S1({id:'bgS1',gain:.3,background:true}),C.A2({id:'bgA2',gain:.27,background:true}),C.P2({id:'bgP2',gain:.2,background:true})],
};

const CASES=[
  /* ---------------- HEART ---------------- */
  {id:'normal',module:'heart',name:'Normal heart sounds',tag:'Normal',hr:72,split:{exp:.008,insp:.03},
    components:[C.S1(),C.A2(),C.P2()],key:'S1',expect:['mitral'],
    bestHeard:'S1 loudest at the apex (mitral area); S2 loudest at the base (aortic and pulmonic areas).',
    explain:'S1 (closure of the mitral and tricuspid valves) marks the start of systole; S2 (closure of the aortic and pulmonic valves) the start of diastole. Systole is shorter than diastole. No added sounds or murmurs.',
    tip:'Move from the apex to the base: S1 > S2 at the apex, S2 > S1 at the base.'},
  {id:'split',module:'heart',name:'Physiological split S2',tag:'Normal variant',hr:64,split:{exp:.018,insp:.075},
    components:[C.S1(),C.A2(),C.P2({gain:.9})],key:'P2',expect:['pulmonic'],
    bestHeard:'Pulmonic area (2nd ICS, left sternal border), where P2 is audible.',
    explain:'Inspiration increases venous return to the right heart and pulmonary vascular capacitance, so pulmonic valve closure (P2) is delayed while A2 comes slightly earlier. S2 splits into A2–P2 on inspiration and becomes single on expiration.',
    tip:'Watch the breathing indicator: the split widens on inspiration. At the apex P2 is inaudible, so S2 is single.'},
  {id:'as',module:'heart',name:'Aortic stenosis',tag:'Systolic murmur',hr:72,graded:true,split:{exp:.008,insp:.025},
    components:[C.S1(),C.A2({gain:.4}),C.P2({gain:.6}),C.S4({gain:.45}),
      {id:'AS',label:'SEM',name:'Ejection systolic murmur (crescendo–decrescendo)',cat:'murmur',band:'mid',synth:'noise',map:'AS',cycle:'beat',gain:1,graded:true,
       params:{fc:330,q:.9,lp:1100,harsh:.6,amF:55,gain:1.7,peak:.48},events:[{from:{a:'S1',s:.055},to:{a:'A2',s:-.03},shape:'diamond'}]}],
    key:'AS',expect:['aortic'],
    bestHeard:'Aortic area (2nd ICS, right sternal border); radiates to both carotids.',
    explain:'Harsh, medium-pitched crescendo–decrescendo ejection murmur that starts after S1 and ends before S2. A2 is soft in severe stenosis, a late-peaking murmur suggests greater severity, and an S4 is common (LV hypertrophy).',
    tip:'Follow the radiation up into the right side of the neck (carotid).'},
  {id:'mr',module:'heart',name:'Mitral regurgitation',tag:'Systolic murmur',hr:76,graded:true,split:{exp:.01,insp:.03},
    components:[C.S1({gain:.6}),C.A2(),C.P2(),
      {id:'MR',label:'HSM',name:'Holosystolic murmur (blowing)',cat:'murmur',band:'high',synth:'noise',map:'MR',cycle:'beat',gain:1,graded:true,
       params:{fc:560,q:.6,lp:1500,harsh:.08,amF:90,gain:1.5},events:[{from:{a:'S1',s:.004},to:{a:'A2',s:.006},shape:'plateau'}]}],
    key:'MR',expect:['mitral'],
    bestHeard:'Apex (5th ICS, left midclavicular line); radiates to the left axilla.',
    explain:'High-pitched, blowing holosystolic (pansystolic) murmur of uniform intensity from S1 to S2, caused by retrograde flow into the left atrium throughout systole. S1 is often soft.',
    tip:'Use the diaphragm and slide laterally from the apex into the left axilla.'},
  {id:'ar',module:'heart',name:'Aortic regurgitation',tag:'Diastolic murmur',hr:70,graded:true,split:{exp:.008,insp:.025},
    components:[C.S1(),C.A2(),C.P2(),
      {id:'AR',label:'EDM',name:'Early diastolic murmur (decrescendo)',cat:'murmur',band:'high',synth:'noise',map:'AR',cycle:'beat',gain:1,graded:true,
       params:{fc:720,q:.6,lp:1700,hp:300,gain:1.25},events:[{from:{a:'A2',s:.008},to:{a:'dia',f:.68},shape:'decresc'}]}],
    key:'AR',expect:['erb'],
    bestHeard:"Erb's point (3rd ICS, left sternal border) and along the left sternal border.",
    explain:'High-pitched, blowing, decrescendo murmur beginning immediately after A2. Heard best with the diaphragm with the patient sitting up, leaning forward, in held expiration. Wide pulse pressure on examination.',
    tip:'It is soft and high-pitched — use the diaphragm and listen in the gap after S2.'},
  {id:'ms',module:'heart',name:'Mitral stenosis',tag:'Diastolic murmur',hr:72,graded:true,preferred:'bell',split:{exp:.015,insp:.04},
    components:[C.S1({gain:1.3,params:{hi:1,hiF:300}}),C.A2(),C.P2({gain:1}),
      {id:'OS',label:'OS',name:'Opening snap',cat:'extra',band:'high',synth:'click',map:'OS',cycle:'beat',gain:.75,params:{f:380,hi:.6},events:[{at:{a:'A2',s:.07},dur:.035}]},
      {id:'MS',label:'Rumble',name:'Mid-diastolic rumble + presystolic accentuation',cat:'murmur',band:'low',synth:'noise',map:'rumble',cycle:'beat',gain:1,graded:true,
       params:{ftype:'lowpass',fc:95,q:1.2,lp:150,lp2:150,wobble:.6,wobF:14,gain:5.5},events:[{from:{a:'A2',s:.11},to:{a:'S1next',s:-.012},shape:'msRumble'}]}],
    key:'MS',expect:['mitral'],
    bestHeard:'Apex — very localized; use the bell (left lateral decubitus).',
    explain:'Loud S1, an opening snap shortly after S2 (a shorter A2–OS interval means more severe stenosis), then a low-pitched mid-diastolic rumble with presystolic accentuation from atrial contraction (lost in atrial fibrillation).',
    tip:'Switch to the BELL and stay exactly on the apex — the rumble disappears a few centimetres away.'},
  {id:'vsd',module:'heart',name:'Ventricular septal defect',tag:'Systolic murmur',hr:84,graded:true,split:{exp:.015,insp:.04},
    components:[C.S1(),C.A2(),C.P2(),
      {id:'VSD',label:'HSM',name:'Harsh holosystolic murmur',cat:'murmur',band:'mid',synth:'noise',map:'VSD',cycle:'beat',gain:1,graded:true,
       params:{fc:420,q:.8,lp:1300,harsh:.7,amF:70,gain:1.8},events:[{from:{a:'S1'},to:{a:'A2',s:.015},shape:'plateau'}]}],
    key:'VSD',expect:['tricuspid'],
    bestHeard:'Left lower sternal border (3rd–4th ICS), widely transmitted over the precordium.',
    explain:'Harsh, loud holosystolic murmur caused by left-to-right shunting through the septal defect, often with a palpable thrill. Small (restrictive) defects tend to produce louder murmurs.',
    tip:'Compare with mitral regurgitation: harsher, maximal at the left lower sternal border, no axillary radiation.'},
  {id:'s3',module:'heart',name:'S3 gallop (heart failure)',tag:'Extra sound',hr:92,preferred:'bell',split:{exp:.01,insp:.03},
    components:[C.S1({gain:.8}),C.A2(),C.P2(),C.S3()],key:'S3',expect:['mitral'],
    bestHeard:'Apex, with the bell (left lateral decubitus).',
    explain:'Low-pitched early diastolic sound 120–160 ms after S2 ("Ken-tuc-ky"), produced by rapid ventricular filling into a dilated, poorly compliant ventricle. Physiological in children and young adults; pathological after ~40 years (systolic heart failure, volume overload).',
    tip:'With the diaphragm the S3 almost vanishes — switch to the bell and press lightly.'},
  {id:'s4',module:'heart',name:'S4 gallop',tag:'Extra sound',hr:66,preferred:'bell',split:{exp:.01,insp:.03},
    components:[C.S1(),C.A2(),C.P2(),C.S4()],key:'S4',expect:['mitral'],
    bestHeard:'Apex, with the bell.',
    explain:'Low-pitched late diastolic (presystolic) sound just before S1 ("Ten-nes-see"), produced by atrial contraction into a stiff, non-compliant ventricle (LV hypertrophy, hypertension, aortic stenosis, ischaemia). Never present in atrial fibrillation.',
    tip:'Listen just before S1 with the bell.'},
  {id:'rub',module:'heart',name:'Pericardial friction rub',tag:'Pericardial',hr:88,split:{exp:.01,insp:.03},
    components:[C.S1(),C.A2(),C.P2(),
      {id:'RUB',label:'Rub',name:'Friction rub (3 components)',cat:'adv',band:'high',synth:'rub',map:'periRub',cycle:'beat',gain:1,
       params:{fc:850,q:.5,hp:320,gMin:.002,gMax:.007,gap:.004,gain:1.7},
       events:[{from:{a:'S1next',s:-.13},to:{a:'S1next',s:-.035},shape:'rub',amp:.7},{from:{a:'sys',f:.22},to:{a:'sys',f:.72},shape:'rub',amp:1},{from:{a:'A2',s:.06},to:{a:'A2',s:.17},shape:'rub',amp:.8}]}],
    key:'RUB',expect:['lsb34'],
    bestHeard:'Left sternal border (3rd–4th ICS), patient sitting up and leaning forward, in expiration.',
    explain:'Scratchy, grating, high-pitched sound with up to three components (atrial systole, ventricular systole, early ventricular diastole) in acute pericarditis. Unlike a pleural rub it persists when the patient holds the breath.',
    tip:'Count the components per cardiac cycle — a rub often sounds like squeaky leather.'},
  {id:'mvp',module:'heart',name:'Mitral valve prolapse',tag:'Systolic click + murmur',hr:72,graded:true,split:{exp:.01,insp:.03},
    components:[C.S1(),C.A2(),C.P2(),
      {id:'CLICK',label:'C',name:'Mid-systolic click',cat:'extra',band:'high',synth:'click',map:'MVP',cycle:'beat',gain:.5,params:{f:760,hi:.5},events:[{at:{a:'sys',f:.5},dur:.025}]},
      {id:'MVP',label:'LSM',name:'Late systolic murmur',cat:'murmur',band:'high',synth:'noise',map:'MVP',cycle:'beat',gain:1,graded:true,
       params:{fc:620,q:.7,lp:1500,harsh:.1,amF:80,gain:1.4},events:[{from:{a:'sys',f:.55},to:{a:'A2',s:-.004},shape:'cresc'}]}],
    key:'MVP',expect:['mitral'],
    bestHeard:'Apex (mitral area).',
    explain:'Mid-systolic click (sudden tensing of the prolapsing leaflet/chordae) followed by a late systolic regurgitant murmur. Standing or Valsalva (less preload) moves the click earlier and lengthens the murmur; squatting does the opposite.',
    tip:'Listen for the click in the middle of the silent systolic gap.'},
  {id:'af',module:'heart',name:'Atrial fibrillation',tag:'Rhythm',hr:96,rhythm:'af',split:{exp:.01,insp:.03},
    components:[C.S1({varS1:true}),C.A2(),C.P2()],key:'S1',expect:['mitral'],
    bestHeard:'Apex (the rhythm is audible everywhere over the precordium).',
    explain:'Irregularly irregular ventricular rhythm with no repeating pattern. S1 intensity varies from beat to beat (louder after short RR intervals). There is no S4 because there is no effective atrial contraction; a pulse deficit is common.',
    tip:'Ignore the sounds themselves and listen to the timing — no two cycles are equal.'},
  /* ---------------- LUNGS ---------------- */
  {id:'lnormal',module:'lungs',name:'Normal breath sounds',tag:'Normal',resp:14,
    components:[C.vesR(),C.vesL(),C.bronch()],key:'bronch',expect:['trachea'],
    bestHeard:'Vesicular sounds over all lung fields; bronchial sounds over the trachea; bronchovesicular over the manubrium and between the scapulae.',
    explain:'Vesicular: soft, low-pitched, inspiration longer and louder than expiration, no pause. Bronchial (tracheal): loud, high-pitched, hollow, expiration as long as or longer than inspiration, with a gap between the phases.',
    tip:'Compare the neck (trachea) with the lateral chest wall.'},
  {id:'crackles',module:'lungs',name:'Fine crackles at both bases',tag:'Adventitious',resp:16,
    components:[C.vesR(),C.vesL(),C.bronch(),
      {id:'CRK',label:'Crackles',name:'Fine end-inspiratory crackles',cat:'adv',band:'high',synth:'crackles',map:'bases',cycle:'breath',gain:1,
       params:{n:16,fine:true,gain:1.6},events:[{from:{a:'insp',f:.45},to:{a:'insp',f:1},shape:'tick'}]}],
    key:'CRK',expect:['rBaseB','lBaseB'],
    bestHeard:'Posterior lung bases, both sides (switch to the BACK view).',
    explain:'Short, high-pitched, discontinuous "Velcro-like" sounds in late inspiration from sudden reopening of collapsed small airways — e.g. pulmonary fibrosis or early pulmonary oedema. They do not clear with coughing.',
    tip:'Listen posteriorly at the bases, below the inferior angle of the scapula.'},
  {id:'wheeze',module:'lungs',name:'Expiratory wheezes',tag:'Adventitious',resp:12,ti:.32,
    components:[C.vesR({gain:.8}),C.vesL({gain:.8}),C.bronch(),
      {id:'WHZ',label:'Wheeze',name:'Polyphonic wheeze',cat:'adv',band:'high',synth:'wheeze',map:'wheeze',cycle:'breath',gain:1,
       params:{freqs:[392,494,622],levels:[1,.75,.55],glide:.9,gain:.35},
       events:[{from:{a:'exp',f:.04},to:{a:'exp',f:.92},shape:'wheeze',amp:1},{from:{a:'insp',f:.55},to:{a:'insp',f:.98},shape:'wheeze',amp:.3}]}],
    key:'WHZ',expect:['rulF','lulF','rmlF','lingF','rulB','lulB','rllB','lllB','rBaseB','lBaseB','interB','trachea'],diffuse:true,
    bestHeard:'Diffusely over both lung fields (and often at the mouth).',
    explain:'Continuous, musical, high-pitched sounds produced by airflow through narrowed airways (asthma, COPD). Mainly expiratory with a prolonged expiratory phase; several simultaneous pitches = polyphonic wheeze.',
    tip:'Note the long expiration compared with inspiration.'},
  {id:'ptx',module:'lungs',name:'Right pneumothorax',tag:'Absent breath sounds',resp:18,
    components:[C.vesR({gain:.02}),C.vesL(),C.bronch()],key:null,mark:P('front','R',88,350),
    bestHeard:'Compare both sides: breath sounds absent over the entire right hemithorax.',
    explain:'Air in the right pleural space separates the lung from the chest wall: breath sounds are absent (or markedly reduced) on the affected side, with hyperresonant percussion, reduced chest expansion and absent vocal fremitus. The left side is normal.',
    tip:'Always compare symmetric points left vs right.'},
  {id:'prub',module:'lungs',name:'Pleural friction rub',tag:'Adventitious',resp:14,
    components:[C.vesR(),C.vesL(),C.bronch(),
      {id:'PRUB',label:'Rub',name:'Pleural rub',cat:'adv',band:'mid',synth:'rub',map:'pleuralRub',cycle:'breath',gain:1,
       params:{fc:420,q:.6,hp:160,gMin:.006,gMax:.03,gap:.025,gain:3.4},
       events:[{from:{a:'insp',f:.5},to:{a:'insp',f:1},shape:'rub',amp:.9},{from:{a:'exp'},to:{a:'exp',f:.35},shape:'rub',amp:1}]}],
    key:'PRUB',expect:['rBaseF'],
    bestHeard:'Localized to the right lower lateral chest (anterior/mid-axillary line).',
    explain:'Creaking, grating "leather-on-leather" sound in late inspiration and early expiration from inflamed pleural surfaces (pleurisy, pneumonia, pulmonary embolism). It stops when the patient holds the breath — unlike a pericardial rub.',
    tip:'Search the lower lateral chest wall; the rub is very localized.'},
  {id:'consol',module:'lungs',name:'Right lower lobe consolidation',tag:'Bronchial breathing',resp:20,
    components:[C.vesR(),C.vesL(),C.bronch(),
      C.bronch({id:'BRC',label:'Bronchial',meter:'Bronchial (RLL)',name:'Bronchial breathing over consolidation',map:'consol',gain:1}),
      {id:'CRC',label:'Crackles',name:'Coarse crackles',cat:'adv',band:'mid',synth:'crackles',map:'consol',cycle:'breath',gain:1,
       params:{n:8,fine:false,early:true,gain:1.8},events:[{from:{a:'insp',f:.1},to:{a:'insp',f:.85},shape:'tick'}]}],
    key:'BRC',expect:['rBaseB','rllB'],
    bestHeard:'Right lower lobe, posteriorly (switch to the BACK view).',
    explain:'Lobar pneumonia: consolidated lung transmits bronchial breathing (loud, high-pitched, expiration ≥ inspiration, with a gap) to the chest wall, plus coarse crackles. Increased vocal resonance and whispering pectoriloquy; dull percussion.',
    tip:'Compare the right and left lower lobes posteriorly.'},
];
const caseById=id=>CASES.find(c=>c.id===id);

/* =====================================================================
   5. AUDIO ENGINE — scheduler + spatial mixer
   ===================================================================== */
const GRADE=[0,.22,.42,.62,.82,1.0,1.18];
const BANDF={diaphragm:{low:.06,mid:.85,high:1},bell:{low:1,mid:.75,high:.3}};
class Engine{
  constructor(ctx,dest){
    this.ctx=ctx; this.offline=!(ctx instanceof AudioContext);
    this.noise=makeNoiseBuffer(ctx,3);
    const c=ctx;
    this.mix=c.createGain();
    this.hpD=biquad(c,'highpass',200,.7); this.hpD2=biquad(c,'highpass',170,.6); this.lpB=biquad(c,'lowpass',200,.7);
    this.gD=c.createGain(); this.gB=c.createGain();
    this.sum=c.createGain(); this.tone=biquad(c,'lowpass',2200,.5);
    this.contactG=c.createGain(); this.contactG.gain.value=0;
    this.master=c.createGain(); this.master.gain.value=.6;
    this.comp=c.createDynamicsCompressor(); this.comp.threshold.value=-4; this.comp.knee.value=2; this.comp.ratio.value=20; this.comp.attack.value=.001; this.comp.release.value=.1; // safety limiter only — keeps spatial level differences intact
    this.mix.connect(this.hpD); this.hpD.connect(this.hpD2); this.hpD2.connect(this.gD); this.gD.connect(this.sum);
    this.mix.connect(this.lpB); this.lpB.connect(this.gB); this.gB.connect(this.sum);
    this.sum.connect(this.tone); this.tone.connect(this.contactG); this.contactG.connect(this.master); this.master.connect(this.comp); this.comp.connect(dest||c.destination);
    this.case=null; this.comps=[]; this.hr=72; this.grade=3; this.bg=true;
    this.nextBeat=0; this.nextBreath=0; this.beats=[]; this.breaths=[]; this.log=[];
    this.resp=14; this.ti=.4; this.pos={view:'front',x:-999,y:-999,contact:false};
    this.mode='diaphragm'; this.MAKEUP={diaphragm:1.8,bell:.65}; this.setMode('diaphragm');
  }
  noiseSrc(t,d){const s=this.ctx.createBufferSource();s.buffer=this.noise;s.loop=true;s.start(t,Math.random()*2.5);s.stop(t+d+.06);return s;}
  set(param,v,tau){ if(this.offline){param.value=v;} else {param.cancelScheduledValues(this.ctx.currentTime); param.setTargetAtTime(v,this.ctx.currentTime,tau);} }
  setMode(m){this.mode=m; this.set(this.gD.gain,m==='diaphragm'?this.MAKEUP.diaphragm:0,.04); this.set(this.gB.gain,m==='bell'?this.MAKEUP.bell:0,.04); this.updateGains();}
  setVolume(v){this.set(this.master.gain,v,.03);}
  setHR(hr){this.hr=hr;}
  setGrade(g){this.grade=g;this.updateGains();}
  setCase(c,{hr,background}={}){
    const now=this.ctx.currentTime;
    for(const o of this.comps){ this.set(o.bus.gain,0,.03); const b=o.bus; if(!this.offline) setTimeout(()=>b.disconnect(),600); }
    this.case=c; if(hr) this.hr=hr; if(background!==undefined) this.bg=background;
    const specs=[...c.components,...(this.bg?BG[c.module]:[])];
    this.comps=specs.map(spec=>{const bus=this.ctx.createGain();bus.gain.value=0;bus.connect(this.mix);return {spec,bus,v:0,g:0,vis:0};});
    this.resp=c.resp||14; this.ti=c.ti||.4;
    if(this.nextBeat<now+.05) this.nextBeat=now+.12;
    if(this.nextBreath<now+.05) this.nextBreath=now+.12;
    // fill in the remainder of cycles that were already scheduled for the previous case
    for(const b of this.beats) if(b.anchors.S1next.t>now) this.scheduleCycle('beat',b.anchors,now+.02,b.extra);
    for(const b of this.breaths) if(b.anchors.next.t>now) this.scheduleCycle('breath',b.anchors,now+.02,{});
    this.updateGains();
  }
  rr(){const mean=60/this.hr; if(this.case&&this.case.rhythm==='af'){return mean*(.6+.8*Math.random());} return mean;}
  breathAt(t){
    for(const b of this.breaths){const st=b.anchors.insp.t,Ti=b.anchors.insp.len,Te=b.anchors.exp.len;
      if(t>=st&&t<st+Ti){const u=(t-st)/Ti;return {v:(1-Math.cos(Math.PI*u))/2,insp:true};}
      if(t>=st+Ti&&t<st+Ti+Te){const u=(t-st-Ti)/Te;return {v:(1+Math.cos(Math.PI*u))/2,insp:false};}}
    return {v:0,insp:false};
  }
  pump(until){
    if(!this.case) return;
    while(this.nextBreath<until+1.6){
      const T=60/this.resp,Ti=T*this.ti,st=this.nextBreath;
      const anchors={insp:{t:st,len:Ti},exp:{t:st+Ti,len:T-Ti},next:{t:st+T,len:0}};
      this.breaths.push({anchors}); if(this.breaths.length>5) this.breaths.shift();
      this.scheduleCycle('breath',anchors,this.ctx.currentTime,{});
      this.nextBreath+=T;
    }
    while(this.nextBeat<until){
      const rr=this.rr(),t0=this.nextBeat,sys=clamp(.36*Math.sqrt(rr),.2,.46),a2=t0+sys;
      const sp=this.case.split||{exp:.01,insp:.03},v=this.breathAt(a2).v,split=sp.exp+(sp.insp-sp.exp)*v;
      const mean=60/this.hr, extra={s1amp:clamp(1.55-.75*(rr/mean),.55,1.35)};
      const anchors={S1:{t:t0,len:sys},sys:{t:t0,len:sys},A2:{t:a2,len:rr-sys},dia:{t:a2,len:rr-sys},P2:{t:a2+split,len:0},S1next:{t:t0+rr,len:0}};
      this.beats.push({anchors,extra}); if(this.beats.length>6) this.beats.shift();
      this.scheduleCycle('beat',anchors,this.ctx.currentTime,extra);
      this.nextBeat+=rr;
    }
    const cut=this.ctx.currentTime-14; if(this.log.length&&this.log[0].t<cut) this.log=this.log.filter(e=>e.t+e.d>cut);
  }
  scheduleCycle(kind,anchors,minT,extra){
    const res=a=>{const A=anchors[a.a];return A.t+(a.f||0)*A.len+(a.s||0);};
    for(const comp of this.comps){
      const s=comp.spec; if(s.cycle!==kind) continue;
      for(const ev of s.events){
        let t,d; if(ev.at){t=res(ev.at);d=ev.dur;} else {t=res(ev.from);d=res(ev.to)-t;}
        if(!(d>.008)||t<minT) continue;
        let amp=(ev.amp??1)*rand(.94,1.06); if(s.varS1) amp*=extra.s1amp||1;
        const shape=ev.shape||(s.synth==='thump'?'thump':s.synth==='click'?'click':'plateau');
        const p={...s.params,...(ev.params||{})};
        const r=SYN[s.synth](this,comp.bus,t,d,amp,p,shape);
        this.log.push({t,d,comp,shape,amp,p,ticks:r&&r.ticks,label:ev.label||s.label,synth:s.synth});
      }
    }
    if(this.log.length>1) this.log.sort((a,b)=>a.t-b.t);
  }
  gradeF(s){return s.graded?GRADE[this.grade]/GRADE[3]:1;}
  setPosition(view,x,y,contact){this.pos={view,x,y,contact};this.updateGains();this.set(this.contactG.gain,contact?1:0,contact?.03:.09);}
  setPosition3(p,contact){this.pos={p3:p,contact};this.updateGains();this.set(this.contactG.gain,contact?1:0,contact?.03:.09);} // 3D surface point (cm)
  updateGains(){
    const pos=this.pos,{view,x,y,contact}=pos, bf=BANDF[this.mode];
    for(const o of this.comps){const s=o.spec,v=pos.p3?spatial3(s.map,pos.p3):mapAt(MAPS[s.map],view,x,y);
      o.v=v; o.g=(s.gain??1)*v*v*this.gradeF(s); o.vis=contact?o.g*bf[s.band||'mid']:0; this.set(o.bus.gain,o.g,.035);}
  }
}

/* =====================================================================
   6. MANIKIN (SVG)
   ===================================================================== */
function sp(pts,closed=true){ // Catmull-Rom → cubic Bézier
  const n=pts.length,g=i=>closed?pts[(i+n)%n]:pts[clamp(i,0,n-1)],f=v=>v.toFixed(1);
  let d=`M${f(pts[0][0])},${f(pts[0][1])}`;
  for(let i=0;i<(closed?n:n-1);i++){const p0=g(i-1),p1=g(i),p2=g(i+1),p3=g(i+2);
    d+=`C${f(p1[0]+(p2[0]-p0[0])/6)},${f(p1[1]+(p2[1]-p0[1])/6)} ${f(p2[0]-(p3[0]-p1[0])/6)},${f(p2[1]-(p3[1]-p1[1])/6)} ${f(p2[0])},${f(p2[1])}`;}
  return closed?d+'Z':d;
}
const mx=pts=>pts.map(([x,y])=>[2*CX-x,y]);
const TORSO_L=[[266,150],[265,200],[258,232],[232,244],[196,251],[164,257],[142,270],[130,298],[134,330],[166,350],[172,400],[178,455],[190,515],[186,565],[172,620],[165,690],[170,770],[180,860],[188,946],[204,968],[280,968],[293,946],[297,860],[300,768]];
const TORSO=[...TORSO_L,...mx(TORSO_L.slice(0,-1)).reverse()];
const ARM_L=[[160,258],[126,282],[112,350],[93,440],[84,505],[66,600],[58,688],[48,722],[44,770],[60,810],[84,808],[98,770],[102,722],[104,690],[120,600],[132,505],[150,440],[170,360],[178,300]];
/** Rib / ICS / landmark-line geometry in 2D body coordinates — drawn by the 2D SVG and painted onto the 3D body. */
function decalGeometry(view){
  const g={ribs:[],ics:[],lines:[]}, Lp=(x1,y1,x2,y2,lab,lx,ly,anc='middle')=>g.lines.push({x1,y1,x2,y2,lab,lx,ly,anc});
  if(view==='front'){
    const ys=[258,292,314,336,358,378,394];
    for(let n=1;n<=10;n++){
      let pts;
      if(n<=7){const y=ys[n-1],d=8+3.5*n;pts=n===1?[[16,y],[45,y+d*.5],[80,y+d*.75]]:[[16,y],[45,y+d*.55],[80,y+d],[110,y+d*.75],[134,y+d*.2]];}
      else{const y0=[0,0,0,0,0,0,0,0,412,432,456][n],dx0=[0,0,0,0,0,0,0,0,52,78,100][n];pts=[[dx0,y0],[dx0+30,y0+14],[132,y0+12]];}
      for(const sgn of [-1,1]) g.ribs.push(sp(pts.map(([dx,y])=>[CX+sgn*dx,y]),false));
    }
    [[303,2],[325,3],[347,4],[368,5]].forEach(([y,n])=>g.ics.push({x:CX,y:y+3,t:String(n)}));
    g.ics.push({x:CX,y:283,t:'ICS',size:6.5});
    Lp(300,240,300,470,'MSL',300,236); Lp(380,252,380,480,'MCL',380,248); Lp(220,252,220,480,'MCL',220,248);
    Lp(418,335,418,480,'AAL',418,331); Lp(182,335,182,480,'AAL',182,331); Lp(176,362,424,362,'Nipple line',428,365,'start');
  } else {
    for(let n=2;n<=12;n++){const y=248+(n-1)*19,len=n===12?70:n===11?104:128;
      for(const sgn of [-1,1]) g.ribs.push(sp([[CX+sgn*12,y],[CX+sgn*58,y+8],[CX+sgn*Math.min(100,len),y+22],[CX+sgn*len,y+(len>110?36:28)]],false));}
    [['T4',305],['T7',362],['T10',419]].forEach(([l,y])=>g.ics.push({x:CX+10,y:y+3,t:l,anchor:'left'}));
    Lp(300,240,300,480,'Vertebral line',304,236,'start'); Lp(220,330,220,480,'Scapular line',220,326); Lp(380,330,380,480,'',0,0);
    Lp(180,419,420,419,'T10 (lung bases)',424,422,'start');
  }
  return g;
}
function buildManikin(){
  const torsoD=sp(TORSO),armL=sp(ARM_L),armR=sp(mx(ARM_L));
  const decalSVG=view=>{const g=decalGeometry(view);let ribs='';
    for(const d of g.ribs) ribs+=`<path class="rib" d="${d}"/><path class="ribedge" d="${d}" transform="translate(0,3.5)"/>`;
    for(const t of g.ics) ribs+=`<text class="icsl" x="${t.x}" y="${t.y}" text-anchor="${t.anchor==='left'?'start':'middle'}"${t.size?` style="font-size:${t.size}px"`:''}>${t.t}</text>`;
    const lines=g.lines.map(l=>`<path class="ln" d="M${l.x1},${l.y1}L${l.x2},${l.y2}"/>`+(l.lab?`<text class="lnl" x="${l.lx}" y="${l.ly}" text-anchor="${l.anc}">${l.lab}</text>`:'')).join('');
    return {ribs,lines};};
  const DF=decalSVG('front'),DB=decalSVG('back');
  const scap=sgn=>sp([[CX+sgn*52,256],[CX+sgn*56,300],[CX+sgn*66,345],[CX+sgn*80,374],[CX+sgn*104,345],[CX+sgn*122,318],[CX+sgn*134,284],[CX+sgn*100,262]]);
  const dots=(keys,cls)=>keys.map(k=>{const s=SITES[k];const right=s.x>=CX+(s.x===CX?-1:0);const rad=s.rad;
      const below=rad&&s.y<300;const anchor=below?'middle':s.x===CX?'start':(right?'start':'end'),dx=below?0:s.x===CX?9:(right?9:-9),dy=below?-10:4;
      return `<g class="view ${s.view}"><circle class="dot${rad?' rad':''}" cx="${s.x}" cy="${s.y}" r="${rad?5:4.5}"/><text class="slabel${rad?' small':''}" x="${s.x+dx}" y="${s.y+dy}" text-anchor="${anchor}">${s.lab}</text></g>`;}).join('');
  const svg=`
<defs>
  <linearGradient id="gTorso" x1="0" x2="1" y1="0" y2="0"><stop offset="0" style="stop-color:var(--skin-lo)"/><stop offset=".2" style="stop-color:var(--skin)"/><stop offset=".5" style="stop-color:var(--skin-hi)"/><stop offset=".8" style="stop-color:var(--skin)"/><stop offset="1" style="stop-color:var(--skin-lo)"/></linearGradient>
  <linearGradient id="gArm" x1="0" x2="1" y1="0" y2="0"><stop offset="0" style="stop-color:var(--skin-lo)"/><stop offset=".45" style="stop-color:var(--skin-hi)"/><stop offset="1" style="stop-color:var(--skin-lo)"/></linearGradient>
  <radialGradient id="gHead" cx="45%" cy="38%" r="65%"><stop offset="0" style="stop-color:var(--skin-hi)"/><stop offset=".7" style="stop-color:var(--skin)"/><stop offset="1" style="stop-color:var(--skin-lo)"/></radialGradient>
  <radialGradient id="gChest" cx="50%" cy="50%" r="50%"><stop offset="0" stop-color="#fff" stop-opacity=".35"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></radialGradient>
  <clipPath id="torsoClip"><path d="${torsoD}"/></clipPath>
  <filter id="bodyShadow" x="-20%" y="-10%" width="140%" height="125%"><feGaussianBlur stdDeviation="9"/></filter>
</defs>
<ellipse cx="300" cy="560" rx="250" ry="430" fill="#000" opacity=".10" filter="url(#bodyShadow)" pointer-events="none"/>
<g id="armLg"><path class="skin arm" data-region="arm" d="${armL}"/></g>
<g id="armRg"><path class="skin arm" data-region="arm" d="${armR}"/></g>
<g id="trunk">
  <path class="skin" data-region="torso" d="${torsoD}"/>
  <ellipse id="chestGlow" cx="300" cy="350" rx="120" ry="95" fill="url(#gChest)" opacity=".25" pointer-events="none"/>
  <g class="view front" pointer-events="none">
    <path class="det" stroke-opacity=".28" stroke-width="2" d="M288,247 Q300,258 312,247"/>
    <path class="det" stroke-opacity=".34" stroke-width="3.2" d="M308,250 C340,246 378,258 410,256 S446,258 458,268"/>
    <path class="det" stroke-opacity=".34" stroke-width="3.2" d="M292,250 C260,246 222,258 190,256 S154,258 142,268"/>
    <path class="det" stroke-opacity=".2" stroke-width="1.6" d="M286,256 L284,292 L288,392 L300,406 L312,392 L316,292 L314,256"/>
    <path class="det" stroke-opacity=".3" stroke-width="1.6" d="M284,292 L316,292"/>
    <path class="det" stroke-opacity=".16" stroke-width="2.4" d="M310,392 Q372,414 432,352"/>
    <path class="det" stroke-opacity=".16" stroke-width="2.4" d="M290,392 Q228,414 168,352"/>
    <path class="det" stroke-opacity=".2" stroke-width="2" d="M300,407 Q342,440 382,462 T432,488"/>
    <path class="det" stroke-opacity=".2" stroke-width="2" d="M300,407 Q258,440 218,462 T168,488"/>
    <path class="det" stroke-opacity=".08" stroke-width="2" d="M300,410 L300,700"/>
    <path class="det" stroke-opacity=".12" stroke-width="2" d="M272,180 L292,247 M328,180 L308,247"/>
    <path class="det" stroke-opacity=".15" stroke-width="2.2" d="M190,640 Q240,700 292,746 M410,640 Q360,700 308,746"/>
    <circle cx="218" cy="362" r="8.5" class="detf" opacity=".22"/><circle cx="218" cy="362" r="3.6" class="detf" opacity=".38"/>
    <circle cx="382" cy="362" r="8.5" class="detf" opacity=".22"/><circle cx="382" cy="362" r="3.6" class="detf" opacity=".38"/>
    <ellipse cx="300" cy="566" rx="4.5" ry="7" class="detf" opacity=".3"/>
    <g class="ribs" clip-path="url(#torsoClip)">${DF.ribs}</g>
    <g class="lines">${DF.lines}</g>
  </g>
  <g class="view back" pointer-events="none">
    <path class="det" stroke-opacity=".18" stroke-width="2" d="M300,238 L300,700"/>
    ${Array.from({length:15},(_,i)=>`<circle cx="300" cy="${248+i*19}" r="${i===0?4:2.6}" class="detf" opacity="${i===0?.32:.18}"/>`).join('')}
    <circle cx="300" cy="232" r="4.2" class="detf" opacity=".3"/>
    <path d="${scap(-1)}" class="detf" fill-opacity=".07" stroke="var(--skin-line)" stroke-opacity=".25" stroke-width="1.6"/>
    <path d="${scap(1)}" class="detf" fill-opacity=".07" stroke="var(--skin-line)" stroke-opacity=".25" stroke-width="1.6"/>
    <path class="det" stroke-opacity=".3" stroke-width="2.4" d="M246,298 Q200,282 160,270 M354,298 Q400,282 440,270"/>
    <path class="det" stroke-opacity=".14" stroke-width="2.4" d="M300,640 L300,742 M200,760 Q246,776 294,764 M400,760 Q354,776 306,764"/>
    <path class="det" stroke-opacity=".12" stroke-width="2" d="M196,560 Q248,580 300,580 Q352,580 404,560"/>
    <g class="ribs" clip-path="url(#torsoClip)">${DB.ribs}</g>
    <g class="lines">${DB.lines}</g>
  </g>
</g>
<g id="headg">
  <ellipse class="skin head" data-region="head" cx="236" cy="100" rx="9" ry="19"/>
  <ellipse class="skin head" data-region="head" cx="364" cy="100" rx="9" ry="19"/>
  <ellipse class="skin head" data-region="head" cx="300" cy="92" rx="64" ry="80"/>
  <g class="view front" pointer-events="none"><path class="det" stroke-opacity=".12" stroke-width="2" d="M300,82 Q306,104 300,112"/></g>
</g>
<g class="sites heart">${dots(HEART_DOTS)}</g>
<g class="sites lungs">${dots(LUNG_DOTS)}</g>
<g id="markerLayer"></g>`;
  $('manikin').innerHTML=svg;
}

/* =====================================================================
   7. APP STATE + UI
   ===================================================================== */
const state={display:'2d',zoom:'body',module:'heart',mode:'teach',view:'front',head:'diaphragm',caseId:'normal',hr:72,grade:3,vol:.75,muted:false,keep:false,bg:true,
  quiz:{caseId:null,answered:false,right:0,total:0}};
const cp={x:530,y:820,down:false,onBody:false,region:''};
let v3=null,engine=null,actx=null,dirty=true,dragging=false,dragOff={x:0,y:0},dragId=null;
const manikin=$('manikin'),stage=$('stage');

function currentCase(){return caseById(state.mode==='quiz'?state.quiz.caseId:state.caseId);}
function unlockAudio(){
  if(!actx){
    try{actx=new (window.AudioContext||window.webkitAudioContext)({latencyHint:'interactive'});}catch(e){return;}
    engine=new Engine(actx); engine.setMode(state.head); applyVolume(); engine.setHR(state.hr); engine.setGrade(state.grade);
    engine.setCase(currentCase(),{hr:state.hr,background:state.bg});
    setInterval(()=>{if(engine)engine.pump(actx.currentTime+.3);},25);
    $('startHint').hidden=true; dirty=true;
  }
  if(actx.state==='suspended') actx.resume();
}
function applyVolume(){if(engine)engine.setVolume(state.muted?0:Math.pow(state.vol,2)*.95);$('muteBtn').textContent=state.muted?'🔇':'🔊';}

function setSeg(id,v){document.querySelectorAll(`#${id} button`).forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.v===v)));}
function renderCaseList(){
  const list=CASES.filter(c=>c.module===state.module);
  $('caseHeading').textContent=state.module==='heart'?'Heart cases':'Lung cases';
  $('caseList').innerHTML=list.map((c,i)=>`<button data-id="${c.id}" aria-pressed="${c.id===state.caseId}"><span class="n">${i+1}</span><span>${c.name}</span><span class="t">${c.tag}</span></button>`).join('');
}
function selectCase(id,{hr}={}){
  const c=caseById(id);
  if(state.mode==='quiz') state.quiz.caseId=id; else state.caseId=id;
  state.hr=hr||c.hr||72; $('hr').value=state.hr; $('hrV').textContent=state.hr+' bpm';
  if(engine){engine.setHR(state.hr);engine.setCase(c,{hr:state.hr,background:state.bg});}
  renderInfo(); buildMeters(); dirty=true;
  document.querySelectorAll('#caseList button').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.id===id)));
}
function renderInfo(){
  const c=currentCase(), quiz=state.mode==='quiz', revealed=quiz&&state.quiz.answered;
  $('bannerK').textContent=(quiz?'Quiz':'Teaching')+' · '+(state.module==='heart'?'Heart':'Lungs');
  if(quiz&&!revealed){$('bannerName').textContent='Unknown case';$('bannerSub').textContent='Listen at several sites. What do you hear?';}
  else{$('bannerName').textContent=c.name;$('bannerSub').textContent='Best heard: '+c.bestHeard;}
  const g=$('gradeBox'); g.hidden=quiz; g.classList.toggle('disabled',!c.graded); $('grade').disabled=!c.graded;
  $('gradeV').textContent=c.graded?(['','I','II','III','IV','V','VI'][state.grade]+' / VI'):'n/a';
  $('aboutSection').hidden=quiz&&!revealed;
  $('about').innerHTML=`<h3>${c.name}</h3><span class="tag">${c.tag}</span>${c.preferred==='bell'?' <span class="tag">Bell</span>':''}<p>${c.explain}</p><p><b>Best heard:</b> ${c.bestHeard}</p>${c.tip?`<p class="long"><b>Tip:</b> ${c.tip}</p>`:''}`;
  $('pcgTitle').innerHTML=state.module==='heart'?'<b>Live phonocardiogram</b> · what you hear at the current position':'<b>Live sound trace</b> · breath cycle at the current position';
}
function buildMeters(){
  const c=currentCase(); if(!c) return;
  const items=c.components.map(s=>`<div class="m" data-id="${s.id}"><span title="${s.name}">${s.meter||s.name.split(' (')[0]}</span><div class="b"><i></i></div></div>`).join('');
  $('meters').innerHTML=`<div class="mh">Local intensity</div>`+items;
}
function setModule(m){
  state.module=m; setSeg('moduleSeg',m);
  manikin.classList.toggle('mod-heart',m==='heart'); manikin.classList.toggle('mod-lungs',m==='lungs');
  renderCaseList(); clearMarker(); if(v3) v3.setModule(m);
  if(state.mode==='quiz') newQuiz(); else selectCase(CASES.find(c=>c.module===m).id);
}
function setMode(m){
  state.mode=m; setSeg('modeSeg',m);
  const quiz=m==='quiz';
  $('caseSection').hidden=quiz; $('quizSection').hidden=!quiz; $('pcgPanel').hidden=quiz;
  manikin.classList.toggle('teach',!quiz); clearMarker(); if(v3) v3.setTeach(!quiz);
  if(quiz) newQuiz(); else selectCase(state.caseId);
}
function setZoom(z){state.zoom=z;setSeg('zoomSeg',z);manikin.setAttribute('viewBox',z==='chest'?'95 165 410 380':'0 0 600 990');manikin.classList.toggle('zoomed',z==='chest');dirty=true;}
function setView(v){state.view=v;setSeg('viewSeg',v);manikin.classList.toggle('view-front',v==='front');manikin.classList.toggle('view-back',v==='back');
  $('viewTag').textContent=v==='front'?'FRONT · SUPINE':'BACK · POSTERIOR';dirty=true;}
function setHead(h){state.head=h;setSeg('headSeg',h);if(engine)engine.setMode(h);if(v3)v3.setHead(h);
  $('headHint').textContent=h==='diaphragm'?'Diaphragm: high frequencies (S1, S2, AR, MR, rubs).':'Bell: low frequencies (S3, S4, mitral stenosis rumble). Light pressure.';dirty=true;}

/* ---------- Quiz ---------- */
function newQuiz(){
  const pool=CASES.filter(c=>c.module===state.module).filter(c=>c.id!==state.quiz.caseId);
  const c=pool[Math.floor(Math.random()*pool.length)];
  state.quiz.answered=false; clearMarker();
  const others=CASES.filter(x=>x.module===state.module&&x.id!==c.id).sort(()=>Math.random()-.5).slice(0,3);
  const opts=[c,...others].sort(()=>Math.random()-.5);
  $('quizOpts').innerHTML=opts.map(o=>`<button data-id="${o.id}">${o.name}</button>`).join('');
  $('quizFeedback').innerHTML=''; $('quizNext').textContent='Skip →';
  const hr=c.rhythm==='af'?c.hr:Math.round(c.hr+rand(-6,6));
  state.quiz.caseId=c.id; selectCase(c.id,{hr});
}
function answerQuiz(id){
  if(state.quiz.answered) return; const c=currentCase(), ok=id===c.id;
  state.quiz.answered=true; state.quiz.total++; if(ok) state.quiz.right++;
  document.querySelectorAll('#quizOpts button').forEach(b=>{b.disabled=true;if(b.dataset.id===c.id)b.classList.add('right');else if(b.dataset.id===id)b.classList.add('wrong');});
  $('quizFeedback').innerHTML=`<div class="verdict" style="color:var(--${ok?'ok':'bad'})">${ok?'✓ Correct':'✗ Not quite'} — ${c.name}</div><p>${c.explain}</p><p><b>Best heard:</b> ${c.bestHeard}</p><p style="color:var(--muted)">The red ring marks the point of maximal intensity.</p>`;
  $('score').textContent=`${state.quiz.right} / ${state.quiz.total}`; $('quizNext').textContent='Next case →';
  showMarker(c); renderInfo();
}
function clearMarker(){$('markerLayer').innerHTML='';if(v3)v3.clearMarker();}
function showMarker(c){
  const m=c.mark||(c.key?mapPeak(c.components.find(s=>s.id===c.key).map):null); if(!m) return;
  if(state.display==='3d'&&v3){ // 3D: ring on the surface at the point of maximal intensity; camera flies to face it
    let p,n; if(c.mark){const q=B.to3D(c.mark.view,c.mark.x,c.mark.y);p=[q.x,q.y,q.z];n=q.n;}
    else{const l=MAPS3[c.components.find(s=>s.id===c.key).map].reduce((a,b)=>b.w>a.w?b:a);p=[l.x,l.y,l.z];n=B.gradient(B.sdf,...p);}
    v3.showMarker(p,n); return;}
  if(m.view!==state.view) setView(m.view);
  $('markerLayer').innerHTML=`<g class="view ${m.view}"><circle class="marker" cx="${m.x}" cy="${m.y}" r="16"/><circle class="marker pulse" cx="${m.x}" cy="${m.y}" r="16"/></g>`;
}

/* ---------- Stethoscope: pointer + rendering ---------- */
function toBody(cx,cy){const pt=new DOMPoint(cx,cy).matrixTransform(manikin.getScreenCTM().inverse());return {x:pt.x,y:pt.y};}
function toScreen(x,y){return new DOMPoint(x,y).matrixTransform(manikin.getScreenCTM());}
function cpRadius(){return state.head==='diaphragm'?20:14;}
stage.addEventListener('pointerdown',e=>{
  if(state.display!=='2d') return;
  unlockAudio(); if(e.pointerType==='mouse'&&e.button!==0) return;
  const p=toBody(e.clientX,e.clientY);
  if(Math.hypot(p.x-cp.x,p.y-cp.y)<=cpRadius()*1.6) dragOff={x:cp.x-p.x,y:cp.y-p.y}; else {dragOff={x:0,y:0};cp.x=p.x;cp.y=p.y;}
  dragging=true; dragId=e.pointerId; cp.down=true; stage.setPointerCapture(e.pointerId); stage.classList.add('dragging'); dirty=true; e.preventDefault();
});
stage.addEventListener('pointermove',e=>{
  if(state.display!=='2d'||!dragging||e.pointerId!==dragId) return;
  const p=toBody(e.clientX,e.clientY); cp.x=clamp(p.x+dragOff.x,0,600); cp.y=clamp(p.y+dragOff.y,0,990); dirty=true;
});
const endDrag=e=>{if(!dragging||e.pointerId!==dragId)return;dragging=false;stage.classList.remove('dragging');cp.down=state.keep;dirty=true;};
stage.addEventListener('pointerup',endDrag); stage.addEventListener('pointercancel',endDrag);

function updateContact(){
  if(state.display==='3d'){ if(v3) on3DChestPiece(v3.cp); return; }
  const s=toScreen(cp.x,cp.y); const el=document.elementFromPoint(s.x,s.y);
  cp.onBody=!!(el&&el.classList&&el.classList.contains('skin')); cp.region=cp.onBody?el.dataset.region:'';
  const contact=cp.down&&cp.onBody;
  if(engine) engine.setPosition(state.view,cp.x,cp.y,contact);
  // status text
  $('status').innerHTML=statusText(cp.down,cp.onBody,regionName);
}
function statusText(down,onBody,nameFn){
  if(!down) return onBody?'Chest piece lifted — press/drag to listen':'Drag the chest piece onto the body';
  if(!onBody) return 'Not on the body — no sound';
  return state.mode==='quiz'?'<b>Listening…</b>':'<b>Listening:</b> '+nameFn();
}
function on3DChestPiece(c){
  if(engine) engine.setPosition3(c.p,c.down&&c.onBody);
  $('status').innerHTML=statusText(c.down,c.onBody,()=>regionName3(c));
}
function regionName3(c){
  const keys=state.module==='heart'?HEART_DOTS:LUNG_DOTS; let best=null,bd=1e9;
  for(const k of keys){const s=SITES3[k],d=Math.hypot(s.p[0]-c.p[0],s.p[1]-c.p[1],s.p[2]-c.p[2]);if(d<bd){bd=d;best=s;}}
  if(best&&bd<2.2) return `${best.name} — ${best.desc}`;
  const r=c.region,y=c.p[1],side=c.p[0]>0?'Left':'Right';
  if(r==='head') return 'Head'; if(r==='armL') return 'Left arm'; if(r==='armR') return 'Right arm';
  if(y>=31) return c.cos<-.3?'Neck (posterior)':'Neck';
  if(y>=1.5) return c.cos>.35?'Anterior chest':c.cos<-.35?'Posterior thorax':`${side} lateral chest wall (axillary region)`;
  if(y>=-22) return c.cos>.35?'Abdomen':c.cos<-.35?'Lumbar region':`${side} flank`;
  return c.cos<-.2?'Gluteal region / thigh':'Thigh';
}
function regionName(){
  let best=null,bd=1e9;
  for(const [k,s] of Object.entries(SITES)){ if(s.view!==state.view||!s.lab) continue;
    if(state.module==='heart'&&!HEART_DOTS.includes(k)) continue; if(state.module==='lungs'&&!LUNG_DOTS.includes(k)) continue;
    const d=Math.hypot(s.x-cp.x,s.y-cp.y); if(d<bd){bd=d;best=s;} }
  if(best&&bd<16) return `${best.name} — ${best.desc}`;
  const r=cp.region,y=cp.y;
  if(r==='head') return 'Head'; if(r==='arm') return 'Arm';
  if(state.view==='front') return y<248?'Neck':y<470?'Anterior chest':y<730?'Abdomen':'Thigh';
  return y<240?'Neck (posterior)':y<470?'Posterior thorax':y<640?'Lumbar region':'Gluteal region / thigh';
}
const cpEl=$('cp');let cpKey='';
function drawStethoscope(){
  const rect=stage.getBoundingClientRect(), s=toScreen(cp.x,cp.y), k=manikin.getScreenCTM().a;
  const sx=s.x-rect.left, sy=s.y-rect.top, present=document.documentElement.classList.contains('present');
  let r=Math.max(state.head==='diaphragm'?19:13,cpRadius()*k*(present?1.15:1)); const lifted=!cp.down;
  if(lifted) r*=1.06;
  const ov=$('overlay'); ov.setAttribute('viewBox',`0 0 ${rect.width} ${rect.height}`);
  // tube to the top-right edge of the screen
  const A={x:rect.width*.86,y:-30};
  const ang=Math.atan2(A.y+260-sy, A.x-sx)*0.55 + Math.atan2(-1,.6)*0.45;
  const se={x:sx+Math.cos(ang)*r*1.75,y:sy+Math.sin(ang)*r*1.75};
  const c1={x:se.x+Math.cos(ang)*120,y:se.y+Math.sin(ang)*120+90}, c2={x:A.x-30,y:A.y+260};
  const d=`M${se.x},${se.y} C${c1.x},${c1.y} ${c2.x},${c2.y} ${A.x},${A.y}`;
  const tw=Math.max(6,r*.36);
  $('tube').setAttribute('d',d);$('tube').setAttribute('stroke-width',tw);
  $('tubeHi').setAttribute('d',d);$('tubeHi').setAttribute('stroke-width',tw*.25);$('tubeHi').setAttribute('transform',`translate(${-tw*.18},${-tw*.18})`);
  $('tubeShadow').setAttribute('d',d);$('tubeShadow').setAttribute('stroke-width',tw);$('tubeShadow').setAttribute('transform',`translate(${lifted?10:5},${lifted?14:7})`);
  const sh=$('cpShadow'),off=lifted?11:3; sh.setAttribute('cx',sx+off);sh.setAttribute('cy',sy+off*1.3);sh.setAttribute('rx',r*1.02);sh.setAttribute('ry',r*1.02);sh.setAttribute('opacity',lifted?.55:.95);
  const key=state.head+'|'+r.toFixed(1);
  if(key!==cpKey){cpKey=key;
    const stem=`<rect x="${r*.7}" y="${-r*.17}" width="${r*1.1}" height="${r*.34}" rx="${r*.12}" fill="url(#chrome)" stroke="#5d666e" stroke-width=".8"/><circle cx="${r*.95}" cy="0" r="${r*.2}" fill="url(#chrome)" stroke="#5d666e" stroke-width=".8"/>`;
    cpEl.innerHTML=state.head==='diaphragm'
      ?`${stem}<circle r="${r}" fill="url(#chrome)" stroke="#4d565e" stroke-width="1"/><circle r="${r*.84}" fill="url(#membrane)"/><circle r="${r*.62}" fill="none" stroke="rgba(255,255,255,.09)" stroke-width="1.2"/><circle r="${r*.38}" fill="none" stroke="rgba(255,255,255,.07)" stroke-width="1"/><ellipse cx="${-r*.3}" cy="${-r*.35}" rx="${r*.28}" ry="${r*.14}" fill="rgba(255,255,255,.12)" transform="rotate(-30)"/>`
      :`${stem}<circle r="${r}" fill="url(#chrome)" stroke="#4d565e" stroke-width="1"/><circle r="${r*.66}" fill="url(#cavity)"/><circle r="${r*.66}" fill="none" stroke="rgba(255,255,255,.35)" stroke-width="1"/>`;
  }
  cpEl.setAttribute('transform',`translate(${sx},${sy}) rotate(${ang*180/Math.PI})`);
}

/* ---------- Phonocardiogram (live, model-based trace) ---------- */
const pcg=$('pcg'),pctx=pcg.getContext('2d');
const VIS={sound:1,extra:1,murmur:.6,breath:.55,adv:.8};
function cssVar(n){return getComputedStyle(document.documentElement).getPropertyValue(n).trim();}
let PCOL={};function refreshColors(){if(v3)v3.refreshTheme(cssVar('--skin'),cssVar('color-scheme')==='dark');PCOL={bg:cssVar('--pcg-bg'),grid:cssVar('--pcg-grid'),ink:cssVar('--pcg-ink'),hi:cssVar('--pcg-hi'),sound:cssVar('--pcg-sound'),extra:cssVar('--pcg-extra'),murmur:cssVar('--pcg-murmur'),breath:cssVar('--pcg-breath'),adv:cssVar('--pcg-adv')};}
function drawPCG(now){
  const dpr=window.devicePixelRatio||1, w=Math.round(pcg.clientWidth*dpr), h=Math.round(pcg.clientHeight*dpr);
  if(!w||!h) return; if(pcg.width!==w||pcg.height!==h){pcg.width=w;pcg.height=h;}
  const W=state.module==='heart'?3.2:9, mid=h*.58, amp=h*.36;
  pctx.fillStyle=PCOL.bg; pctx.fillRect(0,0,w,h);
  const xNow=((now%W)/W)*w;
  // grid
  pctx.strokeStyle=PCOL.grid; pctx.lineWidth=1; pctx.beginPath();
  const step=state.module==='heart'?.2:1; for(let t=Math.ceil((now-W)/step)*step;t<=now;t+=step){const x=((t%W)/W)*w;pctx.moveTo(x,0);pctx.lineTo(x,h);} pctx.stroke();
  pctx.beginPath();pctx.moveTo(0,mid);pctx.lineTo(w,mid);pctx.stroke();
  if(!engine){pctx.fillStyle=PCOL.ink;pctx.font=`${12*dpr}px system-ui`;pctx.fillText('Audio not started',10*dpr,20*dpr);return;}
  const evs=engine.log.filter(e=>e.t<=now&&e.t+e.d>=now-W&&e.comp.vis>0.0005);
  const paths={};
  const add=(col,x,y0,y1)=>{(paths[col]||(paths[col]=new Path2D())).moveTo(x+.5,y0);paths[col].lineTo(x+.5,y1);};
  for(let i=0;i<w;i+=dpr>1?1:1){
    const age=(((xNow-i)/w*W)%W+W)%W; if(age>W*.94) continue;
    const t=now-age; let sum=0,best=0,bestE=null;
    for(const e of evs){ if(t<e.t||t>e.t+e.d||e.synth==='crackles') continue;
      const u=(t-e.t)/e.d, a=e.amp*SHAPES[e.shape](u,e.p)*e.comp.vis*VIS[e.comp.spec.cat]; if(a<.002) continue;
      let tex; if(e.synth==='thump') tex=Math.sin(2*Math.PI*26*(t-e.t)); else if(e.synth==='click') tex=Math.sin(2*Math.PI*70*(t-e.t)); else if(e.synth==='wheeze') tex=Math.sin(2*Math.PI*40*t); else tex=hash(Math.floor(t*900)+e.t*7)*2-1;
      sum+=a*tex; if(a>best){best=a;bestE=e;} }
    if(!bestE) continue;
    const active=now>=bestE.t&&now<=bestE.t+bestE.d+.04;
    const col=active?'hi':(bestE.comp.spec.background?'bg_'+bestE.comp.spec.cat:bestE.comp.spec.cat);
    const y=clamp(sum,-1.15,1.15)*amp; add(col,i,mid,mid-y);
  }
  // crackle ticks
  for(const e of evs) if(e.ticks){for(const tk of e.ticks){const age=now-tk; if(age<0||age>W*.94) continue; const x=Math.round((((xNow-age/W*w)%w)+w)%w);
      const a=clamp(e.comp.vis*VIS.adv*rand(.7,1),0,1.1)*amp*(hash(tk*1e4)>.5?1:-1); add(now-e.t<e.d+.05?'hi':'adv',x,mid,mid-a);}}
  for(const [k,p] of Object.entries(paths)){const bgc=k.startsWith('bg_');pctx.strokeStyle=PCOL[bgc?k.slice(3):k];pctx.globalAlpha=bgc?.35:1;pctx.lineWidth=Math.max(1,dpr*.9);pctx.stroke(p);}
  pctx.globalAlpha=1;
  // erase gap + playhead
  pctx.strokeStyle=PCOL.hi; pctx.globalAlpha=.6; pctx.beginPath(); pctx.moveTo(xNow,0); pctx.lineTo(xNow,h); pctx.stroke(); pctx.globalAlpha=1;
  // labels
  pctx.font=`600 ${11*dpr}px system-ui`; pctx.textAlign='center';
  const labs=[]; const a2=evs.filter(e=>e.comp.spec.id==='A2');
  for(const e of evs){ const s=e.comp.spec; if(s.background) continue; if(e.amp*e.comp.vis*VIS[s.cat]<.05&&!e.ticks) continue; if(e.ticks&&e.comp.vis<.05) continue;
    let lab=e.label, tl=(e.synth==='thump'||e.synth==='click')?e.t:e.t+e.d*.45;
    if(s.id==='A2'){const p2=evs.find(x=>x.comp.spec.id==='P2'&&Math.abs(x.t-e.t)<.12); if(p2&&p2.t-e.t<.03&&p2.comp.vis>.02) lab='S2'; else if(!p2||p2.comp.vis<.02) lab='S2';}
    if(s.id==='P2'){const a=a2.find(x=>Math.abs(x.t-e.t)<.12); if(a&&e.t-a.t<.03) continue;}
    const age=now-tl; if(age<0||age>W*.94) continue;
    labs.push({x:(((xNow-age/W*w)%w)+w)%w,lab,active:now>=e.t&&now<=e.t+e.d+.04});
  }
  labs.sort((a,b)=>a.x-b.x); let lastR=-1e9;
  for(const l of labs){ const hw=pctx.measureText(l.lab).width/2; if(l.x-hw<lastR+6*dpr) continue; lastR=l.x+hw; pctx.fillStyle=l.active?PCOL.hi:PCOL.ink; pctx.fillText(l.lab,l.x,14*dpr); }
  // now readout
  const act=engine.log.filter(e=>now>=e.t&&now<=e.t+e.d&&!e.comp.spec.background&&e.comp.vis>.01).map(e=>e.comp.spec.name.split(' (')[0]);
  $('nowTxt').innerHTML=engine.pos.contact?('Now: <b>'+([...new Set(act)].join(' + ')||'—')+'</b>'):'No contact';
}
function updateMeters(){
  if(!engine) return; const nodes=$('meters').querySelectorAll('.m');
  nodes.forEach(n=>{const o=engine.comps.find(c=>c.spec.id===n.dataset.id); const v=o?clamp(Math.sqrt(o.vis/Math.max(.05,(o.spec.gain??1)*engine.gradeF(o.spec))),0,1):0; n.querySelector('i').style.width=(v*100).toFixed(1)+'%';});
}

/* ---------- Breathing animation ---------- */
let lastBV=-1;
function breathing(t){
  const b=engine?engine.breathAt(t):{v:(1-Math.cos(2*Math.PI*((t%4.3)/4.3)))/2,insp:((t%4.3)/4.3)<.4};
  if(Math.abs(b.v-lastBV)>.002){lastBV=b.v;
    $('trunk').setAttribute('transform',`translate(300 380) scale(${1+.017*b.v} ${1+.006*b.v}) translate(-300 -380)`);
    $('armLg').setAttribute('transform',`translate(${-2.6*b.v} 0)`); $('armRg').setAttribute('transform',`translate(${2.6*b.v} 0)`);
    $('headg').setAttribute('transform',`translate(0 ${-1.2*b.v})`);
    $('chestGlow').setAttribute('opacity',(.15+.3*b.v).toFixed(3));}
  $('breathBar').style.height=(b.v*100).toFixed(0)+'%'; $('breathTxt').textContent=b.insp?'Inspiration ▲':'Expiration ▼';
  return b;
}

/* ---------- Main loop ---------- */
function frame(){
  const t=engine?actx.currentTime:performance.now()/1000;
  const b=breathing(t);
  if(dirty){dirty=false;updateContact();if(state.display==='2d')drawStethoscope();}
  if(state.display==='3d'&&v3) v3.update(b.v);
  if(state.mode==='teach'){drawPCG(engine?Math.max(0,t-(actx.outputLatency||actx.baseLatency||0)):t);updateMeters();}
  requestAnimationFrame(frame);
}

/* ---------- Wiring ---------- */
function bindSeg(id,fn){$(id).addEventListener('click',e=>{const b=e.target.closest('button');if(b)fn(b.dataset.v);});}
bindSeg('moduleSeg',v=>{unlockAudio();setModule(v);});
bindSeg('modeSeg',v=>{unlockAudio();setMode(v);});
bindSeg('viewSeg',setView);
bindSeg('zoomSeg',setZoom);
bindSeg('headSeg',v=>{unlockAudio();setHead(v);});
$('caseList').addEventListener('click',e=>{const b=e.target.closest('button');if(b){unlockAudio();selectCase(b.dataset.id);}});
$('quizOpts').addEventListener('click',e=>{const b=e.target.closest('button');if(b)answerQuiz(b.dataset.id);});
$('quizNext').addEventListener('click',()=>{unlockAudio();newQuiz();});
$('hr').addEventListener('input',e=>{state.hr=+e.target.value;$('hrV').textContent=state.hr+' bpm';if(engine)engine.setHR(state.hr);});
$('grade').addEventListener('input',e=>{state.grade=+e.target.value;if(engine)engine.setGrade(state.grade);renderInfo();});
$('vol').addEventListener('input',e=>{state.vol=e.target.value/100;state.muted=false;applyVolume();});
$('muteBtn').addEventListener('click',()=>{unlockAudio();state.muted=!state.muted;applyVolume();});
$('keepChk').addEventListener('change',e=>{state.keep=e.target.checked;});
$('ribsChk').addEventListener('change',e=>{manikin.classList.toggle('show-ribs',e.target.checked);if(v3)v3.setRibs(e.target.checked);});
$('linesChk').addEventListener('change',e=>{manikin.classList.toggle('show-lines',e.target.checked);if(v3)v3.setLines(e.target.checked);});
let presetIdx=0;
bindSeg('dispSeg',v=>setDisplay(v));
$('presetGrid').addEventListener('click',e=>{const b=e.target.closest('button');if(b&&v3){v3.preset(b.dataset.p);presetIdx=Math.max(0,PRESET_CYCLE.indexOf(b.dataset.p));}});
$('rotateBtn').addEventListener('click',()=>{if(!v3)return;const on=!v3.rotateMode;v3.setRotateMode(on);$('rotateBtn').setAttribute('aria-pressed',String(on));});
$('bgChk').addEventListener('change',e=>{state.bg=e.target.checked;if(engine)engine.setCase(currentCase(),{hr:state.hr,background:state.bg});});
$('themeBtn').addEventListener('click',()=>{const root=document.documentElement;const dark=root.dataset.theme?root.dataset.theme==='dark':matchMedia('(prefers-color-scheme: dark)').matches;root.dataset.theme=dark?'light':'dark';refreshColors();});
function togglePresent(on){
  const root=document.documentElement; on=on??!root.classList.contains('present');
  root.classList.toggle('present',on); $('presentBtn').classList.toggle('primary',on);
  try{ if(on&&!document.fullscreenElement) root.requestFullscreen?.().catch(()=>{}); if(!on&&document.fullscreenElement) document.exitFullscreen?.(); }catch(e){}
  refreshColors(); cpKey=''; setTimeout(()=>{dirty=true;},120);
}
$('presentBtn').addEventListener('click',()=>{unlockAudio();togglePresent();});
document.addEventListener('fullscreenchange',()=>{if(!document.fullscreenElement&&document.documentElement.classList.contains('present'))togglePresent(false);});
document.addEventListener('keydown',e=>{
  if(e.target.matches('input,select,textarea')&&!e.key.startsWith('Arrow')) return;
  if(e.target.matches('input[type=range]')) return;
  unlockAudio(); const k=e.key.toLowerCase();
  const is3=state.display==='3d'&&v3;
  if(e.key.startsWith('Arrow')){
    if(is3){const st=e.shiftKey?20:6;v3.nudge(k==='arrowleft'?-st:k==='arrowright'?st:0,k==='arrowup'?-st:k==='arrowdown'?st:0);}
    else{const st=e.shiftKey?14:5;if(k==='arrowleft')cp.x-=st;if(k==='arrowright')cp.x+=st;if(k==='arrowup')cp.y-=st;if(k==='arrowdown')cp.y+=st;cp.down=true;dirty=true;}
    e.preventDefault();}
  else if(k==='d') setHead('diaphragm'); else if(k==='b') setHead('bell');
  else if(k==='v'){ if(is3){presetIdx=(presetIdx+1)%PRESET_CYCLE.length;v3.preset(PRESET_CYCLE[presetIdx]);} else setView(state.view==='front'?'back':'front'); }
  else if(k==='z'){ if(is3) v3.preset('chest'); else setZoom(state.zoom==='chest'?'body':'chest'); }
  else if(k==='r'&&is3){presetIdx=0;v3.preset('reset');}
  else if(k==='m'){state.muted=!state.muted;applyVolume();}
  else if(k==='p') togglePresent();
  else if(k==='l'){ if(is3) v3.toggleLift(); else {cp.down=!cp.down;dirty=true;} }
  else if(k===' '||k==='alt'){ if(is3) v3.setHold(true); else if(k===' ') {cp.down=!cp.down;dirty=true;} e.preventDefault(); }
});
document.addEventListener('keyup',e=>{const k=e.key.toLowerCase(); if((k===' '||k==='alt')&&v3) v3.setHold(false);});
window.addEventListener('blur',()=>{if(v3)v3.setHold(false);});
document.addEventListener('pointerdown',unlockAudio,{capture:true});
new ResizeObserver(()=>{dirty=true;}).observe(stage);
matchMedia('(prefers-color-scheme: dark)').addEventListener?.('change',refreshColors);

buildManikin(); refreshColors(); renderCaseList(); selectCase('normal'); setView('front'); requestAnimationFrame(frame);

/* ---------- Display: 3D (default when WebGL works) or 2D ---------- */
function setDisplay(d){
  if(d==='3d'&&!v3) d='2d';
  state.display=d; setSeg('dispSeg',d);
  manikin.style.display=d==='2d'?'':'none'; $('overlay').style.display=d==='2d'?'':'none';
  $('view3dBox').hidden=d!=='3d'; $('view2dBox').hidden=d!=='2d';
  if(v3) v3.setActive(d==='3d');
  if(d==='2d') setView(state.view); else $('viewTag').textContent='3D';
  const c=currentCase(); clearMarker(); if(state.mode==='quiz'&&state.quiz.answered&&c) showMarker(c);
  dirty=true;
}
function init3D(){
  try{
    B.initBody();
    const sp3=B.projectSpatialModel(SITES,MAPS); SITES3=sp3.SITES3; MAPS3=sp3.MAPS3;
    if(!webglAvailable()||/[?&]2d(=|&|$)/.test(location.search)) throw new Error('WebGL is not available (or ?2d was requested)');
    const mesh=B.polygonize(0.9), attrs=B.vertexAttributes(mesh.positions,mesh.normals);
    v3=new View3D({stage,labelsEl:$('labels3d'),mesh,attrs,SITES3,siteKeys:{heart:HEART_DOTS,lungs:LUNG_DOTS},
      decal:decalGeometry,torsoPath:sp(TORSO),onChestPiece:on3DChestPiece,keepPlaced:()=>state.keep,
      onPreset:l=>{if(state.display==='3d')$('viewTag').textContent=l?'3D · '+l:'3D';}});
    v3.setModule(state.module); v3.setTeach(state.mode==='teach'); v3.setHead(state.head);
    v3.setRibs($('ribsChk').checked); v3.setLines($('linesChk').checked); refreshColors();
    setDisplay('3d');
  }catch(err){
    console.warn('3D view unavailable — using 2D.',err);
    const b=document.querySelector('#dispSeg [data-v="3d"]'); b.disabled=true; b.title='3D needs WebGL'; $('dispNote').hidden=false;
    setDisplay('2d');
  }
  $('build3d').hidden=true;
}
setTimeout(init3D,30);

// Exposed for testing / extension
window.AuscSim={Engine,CASES,MAPS,SITES,C,SYN,SHAPES,mapAt,mapPeak,P,state,cp,B,setDisplay,get SITES3(){return SITES3;},get MAPS3(){return MAPS3;},get v3(){return v3;},get engine(){return engine;}};
