/* cc-globals.js — shared constants, design tokens, icon helpers, primitives
   Must be loaded first. All other cc-*.js files depend on these globals.    */
"use strict";

/* ── React aliases (loaded by index.html) ── */
const e=React.createElement;
const {useState,useEffect,useRef,useCallback,Fragment}=React;
const {LineChart,Line,AreaChart,Area,BarChart,Bar,XAxis,YAxis,CartesianGrid,Tooltip,ResponsiveContainer,Legend}=Recharts;

const API_URL=(window.location.port==="8000"||window.location.port===""||window.location.hostname==="127.0.0.1")?"":"http://127.0.0.1:8000";

/* ── Design tokens (GNOME HIG dark palette) ── */
const C={
  bg:"#14122B",bg2:"#1A1838",card:"#1E1B42",cardHover:"#262152",border:"#332F5C",
  coral:"#FF5533",coralSoft:"rgba(255,85,51,0.14)",
  yellow:"#FFD23F",yellowSoft:"rgba(255,210,63,0.14)",
  mint:"#33E6A0",mintSoft:"rgba(51,230,160,0.14)",
  purple:"#9C7BFF",purpleSoft:"rgba(156,123,255,0.14)",
  fillerTone:"#FF8A75",text:"#F7F4FF",muted:"#9C97C4",
};
const FD='"Space Grotesk",system-ui,sans-serif';
const FB='"Inter",system-ui,sans-serif';
const FM='"Space Mono",monospace';
const colorForScore=v=>v>=80?C.mint:v>=60?C.yellow:C.coral;

/* ── Career goals ── */
const CAREER_GOALS=[
  {id:"SDE",         label:"Software Engineer", icon:"💻",desc:"Algorithms, system design, architecture"},
  {id:"AI Engineer", label:"AI Engineer",        icon:"🤖",desc:"ML pipelines, models, MLOps"},
  {id:"Data Scientist",label:"Data Scientist",   icon:"📊",desc:"Statistics, EDA, model interpretation"},
  {id:"QA Engineer", label:"QA / Testing",       icon:"🧪",desc:"Test strategy, automation, CI/CD"},
  {id:"DevOps",      label:"DevOps / SRE",       icon:"⚙️",desc:"CI/CD, IaC, Kubernetes, observability"},
  {id:"Product Manager",label:"Product Manager", icon:"🗺️",desc:"Roadmaps, stakeholders, metrics"},
  {id:"HR",          label:"HR / Non-Technical", icon:"🤝",desc:"Behavioural & soft-skills focus"},
];

/* ── Language registry ── */
let _langRegistry=[
  {code:"en-IN",label:"English",   fillers:["um","uh","umm","uhh","uhm","hmm","like","basically","actually","literally","honestly","you know","i mean","sort of","kind of","right","so yeah","anyway","anyways"]},
  {code:"hi-IN",label:"Hindi",     fillers:["matlab","woh","bas","aur","toh","haan","acha","yaar","basically","actually"]},
  {code:"kn-IN",label:"Kannada",   fillers:["antha","anthu","enu","yeno","matte","basically","actually"]},
  {code:"ta-IN",label:"Tamil",     fillers:["enna","sollu","apdi","basically","actually","seri"]},
  {code:"te-IN",label:"Telugu",    fillers:["ante","adi","emi","basically","actually","mari","avunu"]},
  {code:"unknown",label:"Hinglish",fillers:["um","uh","matlab","basically","actually","like","you know","woh","bas","toh","yaar","haan","i mean","sort of","kind of","right"]},
];
let LANGUAGES=_langRegistry.map(l=>l.label);
let _allFillers=[...new Set(_langRegistry.flatMap(l=>l.fillers))];
let _fillersByLang=Object.fromEntries(_langRegistry.map(l=>[l.label,new Set(l.fillers)]));

fetch(`${API_URL}/languages`).then(r=>r.ok?r.json():null).then(data=>{
  if(!data||!data.languages)return;
  _langRegistry=data.languages;
  LANGUAGES=_langRegistry.map(l=>l.label);
  _allFillers=[...new Set(_langRegistry.flatMap(l=>l.fillers))];
  _fillersByLang=Object.fromEntries(_langRegistry.map(l=>[l.label,new Set(l.fillers)]));
}).catch(()=>{});

const getFillers=(lang)=>lang&&_fillersByLang[lang]?_fillersByLang[lang]:new Set(_allFillers);

/* ── App constants ── */
const INTERVIEW_TYPES=["HR","Technical","Behavioural","Managerial"];
const PRACTICE_MODES=["Mock Interview","Public Speaking","Presentation Practice","Resume-Based Interview"];
const TOTAL_QUESTIONS=4;
const MOCK_TRANSCRIPT_TOKENS=[
  {t:"So, ",f:false},{t:"um, ",f:true},{t:"I basically ",f:true},
  {t:"led the backend migration project, and ",f:false},{t:"uh, ",f:true},
  {t:"the main challenge was ",f:false},{t:"like ",f:true},
  {t:"coordinating between three different teams ",f:false},{t:"actually. ",f:true},
  {t:"We shipped it two weeks ahead of schedule, which ",f:false},{t:"basically ",f:true},
  {t:"saved the client about twelve percent in infra cost.",f:false},
];
const MOCK_TRANSCRIPT_TEXT=MOCK_TRANSCRIPT_TOKENS.map(t=>t.t).join("");
const MOCK_FILLER_COUNT=MOCK_TRANSCRIPT_TOKENS.filter(t=>t.f).length;
const MOCK_RESUME_SKILL_POOL=["Python","React","FastAPI","SQL","Data Analysis","Project Management","AWS","Machine Learning","Team Leadership"];
const ANSWER_FEEDBACK_POOL=[
  "Clear structure and a relevant example. Quantify the outcome more concretely next time.",
  "Good use of a specific example. Try trimming the setup and getting to the challenge faster.",
  "Solid answer overall — the ending felt rushed. Land on the result with more confidence.",
];

/* ── localStorage helpers ── */
const LS_USER_KEY="ccai_user_id";
const LS_GOAL_KEY="ccai_user_goal";
function getStoredUserId(){try{return localStorage.getItem(LS_USER_KEY)||"default_user";}catch(_){return"default_user";}}
function setStoredUserId(id){try{localStorage.setItem(LS_USER_KEY,id||"default_user");}catch(_){}}
function getStoredGoal(){try{return localStorage.getItem(LS_GOAL_KEY)||"SDE";}catch(_){return"SDE";}}
function setStoredGoal(g){try{localStorage.setItem(LS_GOAL_KEY,g||"SDE");}catch(_){}}

/* ── Shared button styles ── */
const pBtn={display:"flex",alignItems:"center",justifyContent:"center",gap:8,background:C.coral,color:C.bg,fontFamily:FD,fontWeight:700,fontSize:14,border:"none",borderRadius:12,padding:"13px 22px",cursor:"pointer"};
const sBtn={display:"flex",alignItems:"center",justifyContent:"center",gap:8,background:"transparent",color:C.text,fontFamily:FD,fontWeight:600,fontSize:14,border:`1.5px solid ${C.border}`,borderRadius:12,padding:"13px 22px",cursor:"pointer"};
const gBtn={display:"flex",alignItems:"center",gap:6,background:"transparent",color:C.muted,fontFamily:FB,fontWeight:500,fontSize:12.5,border:`1px solid ${C.border}`,borderRadius:999,padding:"8px 14px",cursor:"pointer"};

/* ── SVG icon factory ── */
const svgBase=(content,size,color)=>e("svg",{width:size,height:size,viewBox:"0 0 24 24",fill:"none",stroke:color,strokeWidth:"2",strokeLinecap:"round",strokeLinejoin:"round"},content);
const SvgMic=({size=16,color="currentColor"})=>svgBase([e("path",{key:"p1",d:"M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3z"}),e("path",{key:"p2",d:"M19 10v2a7 7 0 0 1-14 0v-2"}),e("line",{key:"l1",x1:"12",y1:"19",x2:"12",y2:"22"})],size,color);
const SvgUpload=({size=16,color="currentColor"})=>svgBase([e("path",{key:"p1",d:"M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"}),e("polyline",{key:"pl1",points:"17 8 12 3 7 8"}),e("line",{key:"l1",x1:"12",y1:"3",x2:"12",y2:"15"})],size,color);
const SvgPlay=({size=16,color="currentColor"})=>svgBase(e("polygon",{key:"pg",points:"5 3 19 12 5 21 5 3"}),size,color);
const SvgCheck=({size=16,color="currentColor"})=>svgBase([e("path",{key:"p1",d:"M22 11.08V12a10 10 0 1 1-5.93-9.14"}),e("polyline",{key:"pl1",points:"22 4 12 14.01 9 11.01"})],size,color);
const SvgTrend=({size=16,color="currentColor"})=>svgBase([e("polyline",{key:"pl1",points:"23 6 13.5 15.5 8.5 10.5 1 18"}),e("polyline",{key:"pl2",points:"17 6 23 6 23 12"})],size,color);
const SvgAward=({size=16,color="currentColor"})=>svgBase([e("circle",{key:"c1",cx:"12",cy:"8",r:"7"}),e("polyline",{key:"pl1",points:"8.21 13.89 7 23 12 20 17 23 15.79 13.88"})],size,color);
const SvgUsers=({size=16,color="currentColor"})=>svgBase([e("path",{key:"p1",d:"M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"}),e("circle",{key:"c1",cx:"9",cy:"7",r:"4"}),e("path",{key:"p2",d:"M23 21v-2a4 4 0 0 0-3-3.87"}),e("path",{key:"p3",d:"M16 3.13a4 4 0 0 1 0 7.75"})],size,color);
const SvgFileAudio=({size=16,color="currentColor"})=>svgBase([e("path",{key:"p1",d:"M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"}),e("polyline",{key:"pl1",points:"14 2 14 8 20 8"}),e("path",{key:"p2",d:"M9 13h6"}),e("path",{key:"p3",d:"M9 17h3"})],size,color);
const SvgFile=({size=16,color="currentColor"})=>svgBase([e("path",{key:"p1",d:"M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"}),e("polyline",{key:"pl1",points:"14 2 14 8 20 8"})],size,color);
const SvgRotate=({size=16,color="currentColor"})=>svgBase([e("polyline",{key:"pl1",points:"1 4 1 10 7 10"}),e("path",{key:"p1",d:"M3.51 15a9 9 0 1 0 .49-3.82"})],size,color);
const SvgSparkle=({size=16,color="currentColor"})=>svgBase(e("path",{key:"p1",d:"M12 2l3 7h7l-5.5 4 2 7L12 16l-6.5 4 2-7L2 9h7z"}),size,color);
const SvgArrow=({size=16,color="currentColor"})=>svgBase([e("line",{key:"l1",x1:"5",y1:"12",x2:"19",y2:"12"}),e("polyline",{key:"pl1",points:"12 5 19 12 12 19"})],size,color);
const SvgVolume=({size=16,color="currentColor"})=>svgBase([e("polygon",{key:"pg",points:"11 5 6 9 2 9 2 15 6 15 11 19 11 5"}),e("path",{key:"p1",d:"M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07"})],size,color);
const SvgBook=({size=16,color="currentColor"})=>svgBase([e("path",{key:"p1",d:"M4 19.5A2.5 2.5 0 0 1 6.5 17H20"}),e("path",{key:"p2",d:"M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"})],size,color);
const SvgGauge=({size=16,color="currentColor"})=>svgBase([e("path",{key:"p1",d:"M12 2a10 10 0 1 0 10 10"}),e("path",{key:"p2",d:"M12 6v6l4 2"})],size,color);
const SvgMsg=({size=16,color="currentColor"})=>svgBase(e("path",{key:"p1",d:"M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"}),size,color);
const SvgX=({size=16,color="currentColor"})=>svgBase([e("line",{key:"l1",x1:"18",y1:"6",x2:"6",y2:"18"}),e("line",{key:"l2",x1:"6",y1:"6",x2:"18",y2:"18"})],size,color);
const SvgLang=({size=16,color="currentColor"})=>svgBase([e("circle",{key:"c1",cx:"12",cy:"12",r:"10"}),e("line",{key:"l1",x1:"2",y1:"12",x2:"22",y2:"12"}),e("path",{key:"p1",d:"M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"})],size,color);
const SvgBriefcase=({size=16,color="currentColor"})=>svgBase([e("rect",{key:"r1",x:"2",y:"7",width:"20",height:"14",rx:"2",ry:"2"}),e("path",{key:"p1",d:"M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"})],size,color);
const SvgFlame=({size=16,color="currentColor"})=>svgBase(e("path",{key:"p1",d:"M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z"}),size,color);
const SvgTarget=({size=16,color="currentColor"})=>svgBase([e("circle",{key:"c1",cx:"12",cy:"12",r:"10"}),e("circle",{key:"c2",cx:"12",cy:"12",r:"6"}),e("circle",{key:"c3",cx:"12",cy:"12",r:"2"})],size,color);
const SvgChevron=({size=16,color="currentColor",down=false})=>svgBase(e("polyline",{key:"p",points:down?"6 9 12 15 18 9":"6 15 12 9 18 15"}),size,color);
const SvgHistory=({size=16,color="currentColor"})=>svgBase([e("polyline",{key:"pl",points:"1 4 1 10 7 10"}),e("path",{key:"p",d:"M3.51 15a9 9 0 1 0 .49-3.82"})],size,color);

/* ── Streak helper ── */
function computeStreak(history){
  if(!history.length)return 0;
  const today=new Date().toISOString().slice(0,10);
  const dates=[...new Set(history.map(s=>{
    const d=s.date||"";
    if(d==="Today"||d==="today")return today;
    return d.slice(0,10)||today;
  }))].sort().reverse();
  let streak=0,cursor=new Date(today);
  for(const d of dates){
    const diff=Math.round((cursor-new Date(d))/(1000*60*60*24));
    if(diff===0||diff===1){streak++;cursor=new Date(d);}
    else break;
  }
  return streak;
}
