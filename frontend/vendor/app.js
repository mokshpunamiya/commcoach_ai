/* CommCoach AI — frontend (vanilla React.createElement, no build step required)
   Single source of truth for all UI logic.
   To update the UI: edit this file directly.                              */
(function(){
"use strict";
if(typeof React==="undefined"||typeof ReactDOM==="undefined"||typeof Recharts==="undefined"){
  var _b=document.getElementById("error-banner");
  var _s=document.getElementById("splash");
  if(_s)_s.style.display="none";
  if(_b){_b.style.display="block";_b.textContent="Missing vendor script: "+(typeof React==="undefined"?"react.js":typeof ReactDOM==="undefined"?"react-dom.js":"Recharts.js or prop-types.js")+" failed to load. Check the browser Network tab (F12)";}
  return;
}
const e=React.createElement;
const {useState,useEffect,useRef,Fragment}=React;
const {LineChart,Line,AreaChart,Area,BarChart,Bar,XAxis,YAxis,CartesianGrid,Tooltip,ResponsiveContainer}=Recharts;

const API_URL=(window.location.port==="8000"||window.location.port===""||window.location.hostname==="127.0.0.1")?"":"http://127.0.0.1:8000";

/* ── Design tokens ── */
const C={
  bg:"#14122B",bg2:"#1A1838",card:"#1E1B42",cardHover:"#262152",border:"#332F5C",
  coral:"#FF5533",coralSoft:"rgba(255,85,51,0.14)",
  yellow:"#FFD23F",yellowSoft:"rgba(255,210,63,0.14)",
  mint:"#33E6A0",mintSoft:"rgba(51,230,160,0.14)",
  purple:"#9C7BFF",purpleSoft:"rgba(156,123,255,0.14)",
  fillerTone:"#FF8A75",text:"#F7F4FF",muted:"#9C97C4",
};
const FD='"Space Grotesk",sans-serif',FB='"Inter",sans-serif',FM='"Space Mono",monospace';
const colorForScore=v=>v>=80?C.mint:v>=60?C.yellow:C.coral;

/* ── Language registry (seeded from languages.json via /languages, live-fetched on mount) ── */
let _langRegistry=[
  {code:"en-IN",label:"English",fillers:["um","uh","umm","uhh","uhm","hmm","like","basically","actually","literally","honestly","you know","i mean","sort of","kind of","right","so yeah","anyway","anyways"]},
  {code:"hi-IN",label:"Hindi",fillers:["matlab","woh","bas","aur","toh","haan","acha","yaar","basically","actually"]},
  {code:"kn-IN",label:"Kannada",fillers:["antha","anthu","enu","yeno","matte","basically","actually"]},
  {code:"ta-IN",label:"Tamil",fillers:["enna","sollu","apdi","basically","actually","seri"]},
  {code:"te-IN",label:"Telugu",fillers:["ante","adi","emi","basically","actually","mari","avunu"]},
  {code:"unknown",label:"Hinglish",fillers:["um","uh","matlab","basically","actually","like","you know","woh","bas","toh","yaar","haan","i mean","sort of","kind of","right"]},
];
// Keep a mutable reference so re-fetches update all consumers
let LANGUAGES=_langRegistry.map(l=>l.label);
// Build a regex string from all fillers across all languages (deduped)
let _allFillers=[...new Set(_langRegistry.flatMap(l=>l.fillers))];
// Per-language filler sets for targeted detection
let _fillersByLang=Object.fromEntries(_langRegistry.map(l=>[l.label,new Set(l.fillers)]));

// Fetch fresh data from the server at startup — updates LANGUAGES and filler sets in-place
fetch(`${API_URL}/languages`).then(r=>r.ok?r.json():null).then(data=>{
  if(!data||!data.languages)return;
  _langRegistry=data.languages;
  LANGUAGES=_langRegistry.map(l=>l.label);
  _allFillers=[...new Set(_langRegistry.flatMap(l=>l.fillers))];
  _fillersByLang=Object.fromEntries(_langRegistry.map(l=>[l.label,new Set(l.fillers)]));
}).catch(()=>{/* keep seed values on network error */});

// Returns the filler set for a given language label, falling back to the all-language union
const getFillers=(lang)=>lang&&_fillersByLang[lang]?_fillersByLang[lang]:new Set(_allFillers);
// Returns the BCP-47 code for a language label
const getLangCode=(label)=>(_langRegistry.find(l=>l.label===label)||{code:"unknown"}).code;

/* ── Constants ── */
const INTERVIEW_TYPES=["HR","Technical","Behavioural","Managerial"];
const PRACTICE_MODES=["Mock Interview","Public Speaking","Presentation Practice","Resume-Based Interview"];
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
const QUESTION_BANK={
  HR:["Tell me about yourself.","Why do you want to work at this company?","What are your greatest strengths and weaknesses?","Where do you see yourself in five years?"],
  Technical:["Walk me through a technical project you're most proud of.","How would you design a URL-shortening service?","Explain a time you had to debug a hard production issue.","How do you approach learning a new technology quickly?"],
  Behavioural:["Tell me about a time you disagreed with a teammate. How did you handle it?","Describe a situation where you missed a deadline. What happened?","Tell me about a time you had to persuade someone to see things your way.","Describe a time you received tough feedback. How did you respond?"],
  Managerial:["How do you handle an underperforming team member?","Describe how you prioritize when everything feels urgent.","Tell me about a time you had to deliver bad news to your team.","How do you build trust with a team you've just started leading?"],
};
const MOCK_RESUME_SKILL_POOL=["Python","React","FastAPI","SQL","Data Analysis","Project Management","Public Speaking","AWS","Machine Learning","Team Leadership"];
const ANSWER_FEEDBACK_POOL=[
  "Clear structure and a relevant example. Quantify the outcome more concretely next time — a number lands better than an adjective.",
  "Good use of a specific example. Try trimming the setup and getting to the challenge faster.",
  "Solid answer overall — the ending felt rushed. Land on the result with more confidence.",
];
const TOTAL_QUESTIONS=4;

/* ── SVG icon helpers ── */
const svgBase=(content,size,color)=>e("svg",{width:size,height:size,viewBox:"0 0 24 24",fill:"none",stroke:color,strokeWidth:"2",strokeLinecap:"round",strokeLinejoin:"round"},content);
const SvgMic=({size=16,color="currentColor"})=>svgBase([e("path",{key:"p1",d:"M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3z"}),e("path",{key:"p2",d:"M19 10v2a7 7 0 0 1-14 0v-2"}),e("line",{key:"l1",x1:"12",y1:"19",x2:"12",y2:"22"})],size,color);
const SvgUpload=({size=16,color="currentColor"})=>svgBase([e("path",{key:"p1",d:"M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"}),e("polyline",{key:"pl1",points:"17 8 12 3 7 8"}),e("line",{key:"l1",x1:"12",y1:"3",x2:"12",y2:"15"})],size,color);
const SvgPlay=({size=16,color="currentColor"})=>svgBase(e("polygon",{key:"pg",points:"5 3 19 12 5 21 5 3"}),size,color);
const SvgCheck=({size=16,color="currentColor"})=>svgBase([e("path",{key:"p1",d:"M22 11.08V12a10 10 0 1 1-5.93-9.14"}),e("polyline",{key:"pl1",points:"22 4 12 14.01 9 11.01"})],size,color);
const SvgCheckCircle=({size=16,color="currentColor"})=>svgBase([e("path",{key:"p1",d:"M22 11.08V12a10 10 0 1 1-5.93-9.14"}),e("polyline",{key:"pl1",points:"22 4 12 14.01 9 11.01"})],size,color);
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

/* ── Shared primitives ── */
const pBtn={display:"flex",alignItems:"center",justifyContent:"center",gap:8,background:C.coral,color:C.bg,fontFamily:FD,fontWeight:700,fontSize:14,border:"none",borderRadius:12,padding:"13px 22px",cursor:"pointer"};
const sBtn={display:"flex",alignItems:"center",justifyContent:"center",gap:8,background:"transparent",color:C.text,fontFamily:FD,fontWeight:600,fontSize:14,border:`1.5px solid ${C.border}`,borderRadius:12,padding:"13px 22px",cursor:"pointer"};
const gBtn={display:"flex",alignItems:"center",gap:6,background:"transparent",color:C.muted,fontFamily:FB,fontWeight:500,fontSize:12.5,border:`1px solid ${C.border}`,borderRadius:999,padding:"8px 14px",cursor:"pointer"};

/* ── Toast notification system ── */
let _toastSetItems=null;
function ToastContainer(){
  const [items,setItems]=useState([]);
  _toastSetItems=setItems;
  if(!items.length)return null;
  return e("div",{role:"status","aria-live":"polite",style:{position:"fixed",bottom:20,left:"50%",transform:"translateX(-50%)",display:"flex",flexDirection:"column",alignItems:"center",gap:8,zIndex:9000,pointerEvents:"none"}},
    items.map(it=>e("div",{key:it.id,className:"cc-fade",style:{
      background:it.type==="error"?C.coral:it.type==="success"?C.mint:C.card,
      color:it.type==="error"||it.type==="success"?C.bg:C.text,
      fontFamily:FB,fontSize:13,borderRadius:10,padding:"10px 18px",
      border:`1px solid ${it.type==="error"?C.coral:it.type==="success"?C.mint:C.border}`,
      pointerEvents:"auto",boxShadow:"0 4px 16px rgba(0,0,0,0.4)",maxWidth:"80vw",textAlign:"center",
    }},it.msg))
  );
}
window.ccToast=(msg,type="info",durationMs=3500)=>{
  if(!_toastSetItems)return;
  const id=Date.now()+Math.random();
  _toastSetItems(prev=>[...prev,{id,msg,type}]);
  setTimeout(()=>_toastSetItems(prev=>prev.filter(it=>it.id!==id)),durationMs);
};

/* ── localStorage user profile ── */
const LS_USER_KEY="ccai_user_id";
function getStoredUserId(){
  try{return localStorage.getItem(LS_USER_KEY)||"default_user";}catch(_){return "default_user";}
}
function setStoredUserId(id){
  try{localStorage.setItem(LS_USER_KEY,id||"default_user");}catch(_){}
}

/* ── Dynamic streak helper ── */
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
    if(diff===0||(streak===0&&diff<=1)){streak++;cursor=new Date(d);}
    else if(diff===1){streak++;cursor=new Date(d);}
    else break;
  }
  return streak;
}



function Waveform({count=32,height=56,colors=[C.coral,C.yellow,C.mint],animated=true}){
  return e("div",{style:{display:"flex",alignItems:"center",gap:3,height}},
    Array.from({length:count}).map((_,i)=>{
      const h=25+Math.abs(Math.sin(i*0.55))*65+((i*37)%11);
      return e("div",{key:i,className:animated?"cc-bar":"",style:{width:4,height:`${Math.min(h,100)}%`,background:colors[i%colors.length],borderRadius:3,animationDelay:`${i*0.035}s`,opacity:0.9}});
    })
  );
}

const Label=({Icon,text})=>e("div",{style:{display:"flex",alignItems:"center",gap:6,marginBottom:10}},e(Icon,{size:13,color:C.muted}),e("span",{style:{fontFamily:FM,fontSize:11.5,color:C.muted,textTransform:"uppercase",letterSpacing:0.6}},text));
// Skeleton block for loading states
const Sk=({w="100%",h=16,mb=8})=>e("div",{className:"cc-skeleton",style:{width:w,height:h,marginBottom:mb}});
const SkCard=()=>e("div",{style:{background:C.card,border:`1px solid ${C.border}`,borderRadius:12,padding:16,marginBottom:8}},e(Sk,{w:"60%",h:14,mb:10}),e(Sk,{w:"100%",h:10,mb:6}),e(Sk,{w:"80%",h:10}));
const ChipRow=({options,value,onChange,accent,disabled})=>e("div",{style:{display:"flex",gap:8,flexWrap:"wrap"}},options.map(opt=>{const a=opt===value;return e("button",{key:opt,disabled,onClick:()=>onChange(opt),style:{padding:"7px 14px",borderRadius:999,cursor:disabled?"default":"pointer",fontFamily:FB,fontWeight:500,fontSize:13,border:`1px solid ${a?accent:C.border}`,background:a?`${accent}22`:"transparent",color:a?accent:C.muted,transition:"all .15s"}},opt);}));
const Pill=({text,color,mono})=>e("span",{style:{fontFamily:mono?FM:FB,fontSize:12,fontWeight:500,color,border:`1px solid ${color}55`,borderRadius:999,padding:"5px 12px"}},text);
const STitle=({text,Icon})=>e("div",{style:{display:"flex",alignItems:"center",gap:7,margin:"0 0 12px"}},e(Icon,{size:15,color:C.coral}),e("span",{style:{fontFamily:FD,fontWeight:600,fontSize:15,color:C.text}},text));

/* ── DropZone — drag-and-drop file upload with preview ── */
function DropZone({onFile,fileInputRef}){
  const [dragOver,setDragOver]=useState(false);
  const [pickedFile,setPickedFile]=useState(null);
  const fmtSize=bytes=>{if(bytes<1024*1024)return`${(bytes/1024).toFixed(1)} KB`;return`${(bytes/(1024*1024)).toFixed(1)} MB`;};
  const accept=(f)=>{if(!f)return;setPickedFile(f);onFile(f);};
  return e("div",null,
    e("div",{
      tabIndex:0,role:"button","aria-label":"Upload audio file",
      onClick:()=>fileInputRef.current?.click(),
      onKeyDown:ev=>{if(ev.key==="Enter"||ev.key===" "){ev.preventDefault();fileInputRef.current?.click();}},
      onDragOver:ev=>{ev.preventDefault();setDragOver(true);},
      onDragLeave:()=>setDragOver(false),
      onDrop:ev=>{ev.preventDefault();setDragOver(false);const f=ev.dataTransfer.files?.[0];if(f)accept(f);},
      style:{border:`2px dashed ${dragOver?C.coral:C.border}`,borderRadius:16,padding:"34px 20px",textAlign:"center",cursor:"pointer",transition:"all .15s",background:dragOver?C.coralSoft:"transparent",outline:"none"}
    },
      e("input",{ref:fileInputRef,type:"file",accept:"audio/*,video/*",style:{display:"none"},onChange:ev=>{if(ev.target.files[0])accept(ev.target.files[0]);}}),
      dragOver
        ?e(Fragment,null,
            e(SvgUpload,{size:26,color:C.coral}),
            e("div",{style:{fontFamily:FD,fontWeight:600,color:C.coral,fontSize:15,marginTop:10}},"Drop to analyze")
          )
        :pickedFile
          ?e(Fragment,null,
              e(SvgCheck,{size:26,color:C.mint}),
              e("div",{style:{fontFamily:FD,fontWeight:600,color:C.mint,fontSize:15,marginTop:10}},"File ready"),
              e("div",{style:{fontFamily:FB,color:C.muted,fontSize:12.5,marginTop:4}}),
              e("div",{style:{display:"inline-flex",alignItems:"center",gap:8,marginTop:6,background:C.mintSoft,border:`1px solid ${C.mint}55`,borderRadius:8,padding:"5px 12px"}},
                e(SvgFileAudio,{size:13,color:C.mint}),
                e("span",{style:{fontFamily:FM,fontSize:12,color:C.text}},pickedFile.name),
                e("span",{style:{fontFamily:FM,fontSize:11,color:C.muted}},fmtSize(pickedFile.size))
              )
            )
          :e(Fragment,null,
              e(SvgUpload,{size:26,color:C.coral}),
              e("div",{style:{fontFamily:FD,fontWeight:600,color:C.text,fontSize:15,marginTop:10}},"Drop a recording here, or click to browse"),
              e("div",{style:{fontFamily:FB,color:C.muted,fontSize:12.5,marginTop:4}},"MP3, WAV, or MP4 — up to 15 minutes")
            )
    )
  );
}

/* ── ElapsedTimer — shows time since mount ── */
function ElapsedTimer({color=C.muted}){
  const [secs,setSecs]=useState(0);
  useEffect(()=>{const iv=setInterval(()=>setSecs(s=>s+1),1000);return()=>clearInterval(iv);},[]);
  const mm=String(Math.floor(secs/60)).padStart(2,"0"),ss=String(secs%60).padStart(2,"0");
  return e("span",{style:{fontFamily:FM,fontSize:11.5,color}},`${mm}:${ss}`);
}

/* ── Header ── */
function Header({userId,onEditUser}){
  return e("div",{style:{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"20px 28px",flexWrap:"wrap",gap:12}},
    e("div",{style:{display:"flex",alignItems:"center",gap:10}},
      e("div",{style:{width:34,height:34,borderRadius:10,background:C.coral,display:"flex",alignItems:"center",justifyContent:"center"}},e(SvgMic,{size:18,color:C.bg})),
      e("span",{style:{fontFamily:FD,fontWeight:700,fontSize:19,color:C.text,letterSpacing:-0.3}},"CommCoach AI")
    ),
    e("div",{style:{display:"flex",alignItems:"center",gap:12,flexWrap:"wrap"}},
      e("button",{onClick:onEditUser,title:"Change user profile",style:{display:"flex",alignItems:"center",gap:6,fontFamily:FM,fontSize:11,color:C.muted,background:"transparent",border:`1px solid ${C.border}`,borderRadius:999,padding:"5px 12px",cursor:"pointer"}},
        e("span",{style:{width:7,height:7,borderRadius:"50%",background:C.mint,display:"inline-block"}}),
        userId||"default_user"
      ),
      e("div",{style:{fontFamily:FM,fontSize:11,color:C.muted,border:`1px solid ${C.border}`,borderRadius:999,padding:"5px 12px",display:"flex",alignItems:"center",gap:6}},e(SvgSparkle,{size:12,color:C.mint}),"Powered by Sarvam AI")
    )
  );
}

/* ── Stepper ── */
function Stepper({page,setPage,interviewPhase,uploading}){
  const steps=[
    {n:1,label:"Assessment",Icon:SvgUpload},
    {n:2,label:"Feedback",Icon:SvgFileAudio},
    {n:3,label:"Mock Interview",Icon:SvgUsers},
    {n:4,label:"Dashboard",Icon:SvgTrend},
  ];
  const [confirmNav,setConfirmNav]=useState(null);// target page number pending confirm

  const handleClick=(target)=>{
    if(target===page)return;
    // Warn if leaving an in-progress interview
    if(page===3&&interviewPhase==="interview"){setConfirmNav(target);return;}
    // Warn if leaving mid-analysis
    if(page===1&&uploading){setConfirmNav(target);return;}
    setPage(target);
  };

  return e(Fragment,null,
    /* Nav-away confirmation dialog */
    confirmNav!==null&&e("div",{role:"dialog","aria-modal":"true","aria-labelledby":"navdlg-title",style:{position:"fixed",inset:0,background:"rgba(0,0,0,0.6)",zIndex:200,display:"flex",alignItems:"center",justifyContent:"center",padding:20}},
      e("div",{className:"cc-fade",style:{background:C.card,border:`1px solid ${C.border}`,borderRadius:18,padding:28,maxWidth:380,width:"100%",textAlign:"center"}},
        e("div",{id:"navdlg-title",style:{fontFamily:FD,fontWeight:700,fontSize:17,color:C.text,marginBottom:10}},
          page===3?"Leave this interview?":"Leave analysis in progress?"
        ),
        e("div",{style:{fontFamily:FB,fontSize:13.5,color:C.muted,marginBottom:24,lineHeight:1.6}},
          page===3
            ?"Your answers will be saved — you can return to this interview by clicking Mock Interview again."
            :"Your current analysis will be cancelled."
        ),
        e("div",{style:{display:"flex",gap:10,justifyContent:"center"}},
          e("button",{onClick:()=>{setPage(confirmNav);setConfirmNav(null);},style:pBtn},"Leave"),
          e("button",{onClick:()=>setConfirmNav(null),style:sBtn},"Stay")
        )
      )
    ),
    e("div",{style:{display:"flex",alignItems:"center",justifyContent:"center",gap:8,padding:"6px 20px 28px",flexWrap:"wrap"}},
      steps.map((s,stepIdx)=>e(Fragment,{key:s.n},
        e("button",{onClick:()=>handleClick(s.n),"aria-current":page===s.n?"page":undefined,style:{display:"flex",alignItems:"center",gap:8,padding:"9px 14px 9px 10px",borderRadius:999,border:`1.5px solid ${page===s.n?C.coral:C.border}`,background:page===s.n?C.coralSoft:"transparent",color:page===s.n?C.coral:C.muted,cursor:"pointer",fontFamily:FB,transition:"all .18s"}},
          e("span",{style:{fontFamily:FM,fontSize:11,width:20,height:20,borderRadius:"50%",display:"flex",alignItems:"center",justifyContent:"center",background:page===s.n?C.coral:"transparent",color:page===s.n?C.bg:C.muted,border:page===s.n?"none":`1px solid ${C.border}`}},s.n),
          e(s.Icon,{size:13}),
          e("span",{style:{fontFamily:FD,fontWeight:600,fontSize:13}},s.label)
        ),
        stepIdx<steps.length-1&&e("div",{style:{display:"flex",gap:2,width:18}},[0,1,2].map(i=>e("div",{key:i,style:{width:4,height:4+(i%2)*3,borderRadius:2,background:C.border,alignSelf:"center"}})))
      ))
    )
  );
}

/* ── ResumeUpload ── */
function ResumeUpload({resume,setResume}){
  const ref=useRef(null);
  const [parsing,setParsing]=useState(false);
  const handleFile=async(ev)=>{
    const file=ev.target.files?.[0]; if(!file)return;
    setParsing(true);
    try{
      const fd=new FormData(); fd.append("file",file);
      const r=await fetch(`${API_URL}/resume/parse`,{method:"POST",body:fd});
      const d=r.ok?await r.json():{headline:"Resume uploaded",summary:"",skills:[],text:""};
      setResume({fileName:file.name,...d});
    }catch(_){
      // fallback: use mock skills
      const shuffled=[...MOCK_RESUME_SKILL_POOL].sort(()=>0.5-Math.random());
      setResume({fileName:file.name,headline:"Software engineer, ~2-3 yrs experience",summary:"Backend-leaning engineer with hands-on project delivery experience.",skills:shuffled.slice(0,6),text:""});
    }
    setParsing(false);
  };
  return e("div",{style:{marginBottom:22}},
    e(Label,{Icon:SvgFile,text:"Resume"}),
    !resume&&!parsing&&e("div",{
      onClick:()=>ref.current?.click(),
      onMouseEnter:ev=>ev.currentTarget.style.borderColor=C.purple,
      onMouseLeave:ev=>ev.currentTarget.style.borderColor=C.border,
      style:{border:`2px dashed ${C.border}`,borderRadius:14,padding:"18px 16px",textAlign:"center",cursor:"pointer",transition:"border-color .15s"}
    },
      e("input",{ref,type:"file",accept:".pdf,.docx,.txt",style:{display:"none"},onChange:handleFile}),
      e(SvgFile,{size:20,color:C.purple}),
      e("div",{style:{fontFamily:FB,fontSize:13,color:C.text,marginTop:6}},"Upload resume — PDF, DOCX, or TXT")
    ),
    parsing&&e("div",{style:{display:"flex",alignItems:"center",gap:10,padding:"12px 14px",background:C.card,border:`1px solid ${C.border}`,borderRadius:12}},
      e(Waveform,{count:10,height:18}),
      e("span",{style:{fontFamily:FM,fontSize:12,color:C.muted}},"Parsing resume…")
    ),
    resume&&!parsing&&e("div",{className:"cc-fade",style:{background:C.card,border:`1px solid ${C.border}`,borderRadius:14,padding:16}},
      e("div",{style:{display:"flex",justifyContent:"space-between",alignItems:"flex-start",gap:8}},
        e("div",null,
          e("div",{style:{fontFamily:FD,fontWeight:600,fontSize:14,color:C.text}},resume.headline),
          resume.summary&&e("div",{style:{fontFamily:FB,fontSize:12.5,color:C.muted,marginTop:4}},resume.summary.slice(0,120)+(resume.summary.length>120?"…":""))
        ),
        e("button",{onClick:()=>setResume(null),style:{background:"transparent",border:"none",cursor:"pointer",color:C.muted}},e(SvgX,{size:16,color:C.muted}))
      ),
      resume.skills?.length>0&&e("div",{style:{marginTop:10,display:"flex",gap:6,flexWrap:"wrap"}},resume.skills.map(s=>e(Pill,{key:s,text:s,color:C.purple})))
    )
  );
}

/* ── PAGE 1: AssessmentPage ── */
function AssessmentPage({onDone,resume,setResume,onUploadingChange,userId="default_user"}){
  const [langMode,setLangMode]=useState("auto");
  const [manualLang,setManualLang]=useState("English");
  const [interviewType,setInterviewType]=useState("HR");
  const [practiceMode,setPracticeMode]=useState("Mock Interview");
  const [uploading,setUploading]=useState(false);
  const [progress,setProgress]=useState(0);
  const [stageIdx,setStageIdx]=useState(0);
  const [detected,setDetected]=useState(null);
  const [revealDetected,setRevealDetected]=useState(false);
  const [audioSource,setAudioSource]=useState("upload");
  const [isRecording,setIsRecording]=useState(false);
  const [recordSeconds,setRecordSeconds]=useState(0);
  const [micError,setMicError]=useState(null);
  const [apiError,setApiError]=useState(null);
  const fileInputRef=useRef(null);
  const mediaRecorderRef=useRef(null);
  const streamRef=useRef(null);
  const timerRef=useRef(null);
  const recordSecondsRef=useRef(0);
  const progressIvRef=useRef(null);
  const stages=["Uploading audio…","Transcribing with Sarvam Saaras…","Checking grammar & pronunciation…","Reading confidence & emotion…","Generating coaching plan…"];

  useEffect(()=>()=>{clearInterval(timerRef.current);streamRef.current?.getTracks().forEach(t=>t.stop());},[]);

  const fmt=s=>`${Math.floor(s/60)}:${String(s%60).padStart(2,"0")}`;

  const startProgressAnimation=()=>{
    setProgress(0);setStageIdx(0);setDetected(null);setRevealDetected(false);
    const step=100/stages.length;
    progressIvRef.current=setInterval(()=>{
      setProgress(p=>{
        if(p>=90)return p;
        const next=Math.min(p+1.5,90);
        setStageIdx(Math.min(Math.floor(next/step),stages.length-1));
        return next;
      });
    },80);
  };
  const stopProgressAnimation=()=>{clearInterval(progressIvRef.current);setProgress(100);setStageIdx(stages.length-1);};

  const _tokenizeFrontend=(text,report)=>{
    if(!text)return[];
    const fillerSet=new Set(((report&&report.filler_words)||[]).map(fw=>fw.word.toLowerCase()));
    const tokens=[];
    text.split(/(\s+)/).forEach(word=>{
      if(!word)return;
      const clean=word.replace(/^[.,!?;:"']+|[.,!?;:"']+$/g,"").toLowerCase();
      tokens.push({t:word,f:fillerSet.has(clean)});
    });
    return tokens;
  };

  const runAnalysis=async(audioFile,filename)=>{
    if(!resume){
      setApiError("Resume upload is mandatory. Please upload your resume first.");
      return;
    }
    setApiError(null);setUploading(true);if(onUploadingChange)onUploadingChange(true);startProgressAnimation();
    const lang=langMode==="manual"?manualLang:"English";
    try{
      const form=new FormData();
      form.append("file",audioFile,filename||"recording.webm");
      form.append("user_id",userId);
      if(interviewType)form.append("interview_topic",interviewType);
      const resp=await fetch(`${API_URL}/analyze`,{method:"POST",body:form});
      if(!resp.ok){const err=await resp.text();throw new Error(`Server error ${resp.status}: ${err}`);}
      const data=await resp.json();
      stopProgressAnimation();
      // Show the real detected language returned by Sarvam STT.
      if(data.detected_language){
        setDetected({lang:data.detected_language,confidence:data.detected_language_confidence??100});
        setRevealDetected(true);
      }else if(langMode==="manual"){
        setDetected({lang:manualLang,confidence:100});
        setRevealDetected(true);
      }
      const transcriptTokens=(data.transcript_tokens&&data.transcript_tokens.length>0)?data.transcript_tokens:_tokenizeFrontend(data.transcript||"",data.session_report);
      setTimeout(()=>onDone({language:data.detected_language||lang,interviewType,practiceMode,apiResponse:data,transcriptTokens}),400);
    }catch(err){
      stopProgressAnimation();setUploading(false);if(onUploadingChange)onUploadingChange(false);setApiError(err.message||"Analysis failed — please try again.");
    }
  };

  const startSampleAnalysis=async()=>{
    if(!resume){
      setApiError("Resume upload is mandatory. Please upload your resume first.");
      return;
    }
    setApiError(null);setUploading(true);if(onUploadingChange)onUploadingChange(true);startProgressAnimation();
    try{
      const resp=await fetch(`${API_URL}/analyze/text`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({user_id:userId,transcript:MOCK_TRANSCRIPT_TEXT,interview_topic:interviewType})});
      if(!resp.ok)throw new Error(`Server error ${resp.status}`);
      const data=await resp.json();
      stopProgressAnimation();
      const transcriptTokens=(data.transcript_tokens&&data.transcript_tokens.length>0)?data.transcript_tokens:_tokenizeFrontend(data.transcript||MOCK_TRANSCRIPT_TEXT,data.session_report);
      const lang=langMode==="manual"?manualLang:"English";
      setTimeout(()=>onDone({language:lang,interviewType,practiceMode,apiResponse:data,transcriptTokens}),400);
    }catch(err){stopProgressAnimation();setUploading(false);if(onUploadingChange)onUploadingChange(false);setApiError(err.message||"Sample analysis failed.");}
  };

  const startRecording=async()=>{
    if(!resume){
      setMicError("Resume upload is mandatory. Please upload your resume first.");
      return;
    }
    setMicError(null);
    if(!navigator.mediaDevices||!window.MediaRecorder){setMicError("Live recording isn't supported in this browser. Try uploading a file instead.");return;}
    try{
      const stream=await navigator.mediaDevices.getUserMedia({audio:true});
      streamRef.current=stream;
      const chunks=[];
      const recorder=new MediaRecorder(stream);
      recorder.ondataavailable=ev=>{if(ev.data.size>0)chunks.push(ev.data);};
      recorder.onstop=()=>{
        stream.getTracks().forEach(t=>t.stop());
        clearInterval(timerRef.current);
        const blob=new Blob(chunks,{type:recorder.mimeType||"audio/webm"});
        runAnalysis(blob,"recording.webm");
      };
      mediaRecorderRef.current=recorder;
      recorder.start();setIsRecording(true);setRecordSeconds(0);recordSecondsRef.current=0;
      timerRef.current=setInterval(()=>{recordSecondsRef.current+=1;setRecordSeconds(recordSecondsRef.current);},1000);
    }catch(_){setMicError("Microphone access was blocked or unavailable. Check your browser permissions.");}
  };
  const stopRecording=()=>{if(mediaRecorderRef.current&&mediaRecorderRef.current.state!=="inactive")mediaRecorderRef.current.stop();setIsRecording(false);};

  return e("div",{className:"cc-fade",style:{maxWidth:760,margin:"0 auto",padding:"0 20px 60px"}},
    e("div",{style:{textAlign:"center",marginBottom:28}},
      e("h1",{style:{fontFamily:FD,fontWeight:700,fontSize:"clamp(28px,5vw,42px)",color:C.text,lineHeight:1.1,margin:"0 0 12px",letterSpacing:-0.5}},"Speak. We'll tell you",e("br",null),"exactly how it landed."),
      e("p",{style:{fontFamily:FB,color:C.muted,fontSize:15.5,maxWidth:480,margin:"0 auto"}},"Upload a recording, add your resume, and pick how you want to practice — CommCoach handles the rest.")
    ),
    e("div",{style:{display:"flex",justifyContent:"center",marginBottom:32}},e(Waveform,{count:44,height:72})),
    e("div",{style:{background:C.card,border:`1px solid ${C.border}`,borderRadius:20,padding:24}},
      /* Language */
      e("div",{style:{marginBottom:18}},
        e(Label,{Icon:SvgLang,text:"Language"}),
        e("div",{style:{display:"flex",gap:8,marginBottom:langMode==="manual"?10:0}},
          e("button",{onClick:()=>setLangMode("auto"),disabled:uploading,style:{display:"flex",alignItems:"center",gap:6,padding:"7px 14px",borderRadius:999,fontFamily:FB,fontWeight:500,fontSize:13,cursor:uploading?"default":"pointer",border:`1px solid ${langMode==="auto"?C.coral:C.border}`,background:langMode==="auto"?C.coralSoft:"transparent",color:langMode==="auto"?C.coral:C.muted}},e(SvgSparkle,{size:12}),"Auto-detect"),
          e("button",{onClick:()=>setLangMode("manual"),disabled:uploading,style:{padding:"7px 14px",borderRadius:999,fontFamily:FB,fontWeight:500,fontSize:13,cursor:uploading?"default":"pointer",border:`1px solid ${langMode==="manual"?C.coral:C.border}`,background:langMode==="manual"?C.coralSoft:"transparent",color:langMode==="manual"?C.coral:C.muted}},"Set manually")
        ),
        langMode==="auto"
          ?e("div",{style:{fontFamily:FB,fontSize:12,color:C.muted,marginTop:8}},"We'll detect it from your audio — English, Hindi, Kannada, Tamil, Telugu, and code-mixed speech supported.")
          :e(ChipRow,{options:LANGUAGES,value:manualLang,onChange:setManualLang,accent:C.coral,disabled:uploading})
      ),
      /* Practice mode */
      e("div",{style:{marginBottom:18}},e(Label,{Icon:SvgGauge,text:"Practice mode"}),e(ChipRow,{options:PRACTICE_MODES,value:practiceMode,onChange:setPracticeMode,accent:C.purple,disabled:uploading})),
      /* Resume */
      e(ResumeUpload,{resume,setResume}),
      /* Audio input */
      !uploading?e(Fragment,null,
        e(Label,{Icon:SvgUpload,text:"Audio"}),
        e("div",{style:{display:"flex",gap:8,marginBottom:16}},
          e("button",{onClick:()=>{if(isRecording)stopRecording();setAudioSource("upload");setMicError(null);},style:{flex:1,display:"flex",alignItems:"center",justifyContent:"center",gap:6,padding:"9px 14px",borderRadius:10,cursor:"pointer",fontFamily:FB,fontWeight:500,fontSize:13,border:`1px solid ${audioSource==="upload"?C.coral:C.border}`,background:audioSource==="upload"?C.coralSoft:"transparent",color:audioSource==="upload"?C.coral:C.muted}},e(SvgUpload,{size:14}),"Upload file"),
          e("button",{onClick:()=>{setAudioSource("record");setMicError(null);},style:{flex:1,display:"flex",alignItems:"center",justifyContent:"center",gap:6,padding:"9px 14px",borderRadius:10,cursor:"pointer",fontFamily:FB,fontWeight:500,fontSize:13,border:`1px solid ${audioSource==="record"?C.coral:C.border}`,background:audioSource==="record"?C.coralSoft:"transparent",color:audioSource==="record"?C.coral:C.muted}},e(SvgMic,{size:14}),"Record live")
        ),
        audioSource==="upload"
          ?e(Fragment,null,
              e(DropZone,{onFile:(f)=>runAnalysis(f,f.name),fileInputRef}),
              e("div",{style:{display:"flex",alignItems:"center",gap:12,margin:"20px 0"}},e("div",{style:{flex:1,height:1,background:C.border}}),e("span",{style:{fontFamily:FM,fontSize:11,color:C.muted}},"OR"),e("div",{style:{flex:1,height:1,background:C.border}})),
              e("button",{onClick:startSampleAnalysis,style:{width:"100%",display:"flex",alignItems:"center",justifyContent:"center",gap:8,background:"transparent",border:`1.5px solid ${C.mint}`,color:C.mint,fontFamily:FD,fontWeight:600,fontSize:14,borderRadius:12,padding:"13px 20px",cursor:"pointer"}},e(SvgPlay,{size:15,color:C.mint}),"Try a sample recording")
            )
          :e("div",{style:{border:`2px dashed ${isRecording?C.coral:C.border}`,borderRadius:16,padding:"30px 20px",textAlign:"center",transition:"all .15s"}},
              !isRecording
                ?e(Fragment,null,
                    e("button",{onClick:startRecording,style:{width:64,height:64,borderRadius:"50%",border:"none",cursor:"pointer",background:C.coral,display:"flex",alignItems:"center",justifyContent:"center",margin:"0 auto 14px",boxShadow:`0 0 0 6px ${C.coralSoft}`}},e(SvgMic,{size:26,color:C.bg})),
                    e("div",{style:{fontFamily:FD,fontWeight:600,color:C.text,fontSize:15}},"Tap to start recording"),
                    e("div",{style:{fontFamily:FB,color:C.muted,fontSize:12.5,marginTop:4}},"Speak naturally — we'll capture up to 3 minutes from your microphone"),
                    micError&&e("div",{style:{marginTop:14,background:C.coralSoft,border:`1px solid ${C.coral}55`,borderRadius:10,padding:"9px 13px",fontFamily:FB,fontSize:12.5,color:C.text}},micError)
                  )
                :e(Fragment,null,
                    e("div",{style:{display:"flex",justifyContent:"center",alignItems:"center",gap:8,marginBottom:10}},
                      e("span",{style:{width:10,height:10,borderRadius:"50%",background:C.coral,display:"inline-block"}}),
                      e("span",{style:{fontFamily:FM,fontSize:13,color:C.coral}},`Recording… ${fmt(recordSeconds)}`)
                    ),
                    e(Waveform,{count:30,height:46,animated:true}),
                    e("button",{onClick:stopRecording,style:{...pBtn,width:"100%",marginTop:18}},"Stop & analyze")
                  )
            )
      ):e("div",{style:{padding:"10px 4px"}},
          e(Waveform,{count:26,height:40,animated:true}),
          e("div",{style:{margin:"18px 0 8px",height:8,borderRadius:4,background:C.bg2,overflow:"hidden"}},
            e("div",{style:{width:`${progress}%`,height:"100%",background:`linear-gradient(90deg,${C.coral},${C.purple},${C.mint})`,transition:"width .1s linear",borderRadius:4}})
          ),
          e("div",{style:{display:"flex",justifyContent:"space-between",fontFamily:FM,fontSize:12,color:C.muted,marginBottom:revealDetected?12:0}},e("span",null,stages[stageIdx]),e("span",null,`${progress}%`)),
          revealDetected&&detected&&e("div",{className:"cc-fade",style:{display:"flex",alignItems:"center",gap:8,background:C.mintSoft,border:`1px solid ${C.mint}55`,borderRadius:10,padding:"9px 13px"}},
            e(SvgCheck,{size:14,color:C.mint}),
            e("span",{style:{fontFamily:FB,fontSize:12.5,color:C.text}},"Detected ",e("strong",{style:{color:C.mint}},detected.lang)),
            e("span",{style:{fontFamily:FM,fontSize:11,color:C.muted,marginLeft:"auto"}},`${detected.confidence}% confidence`)
          )
        )
    ),
    apiError&&!uploading&&e("div",{style:{marginTop:16,background:C.coralSoft,border:`1px solid ${C.coral}55`,borderRadius:12,padding:"12px 16px",fontFamily:FB,fontSize:13,color:C.text}},e("strong",{style:{color:C.coral}},"Analysis error: "),apiError)
  );
}

/* ── PAGE 2: ScoreRing, MetricCard, FeedbackPage ── */
function ScoreRing({value,size=128}){
  const angle=(value/100)*360,color=colorForScore(value);
  return e("div",{style:{width:size,height:size,borderRadius:"50%",background:`conic-gradient(${color} ${angle}deg,${C.bg2} ${angle}deg)`,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}},
    e("div",{style:{width:size-16,height:size-16,borderRadius:"50%",background:C.card,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center"}},
      e("span",{style:{fontFamily:FM,fontWeight:700,fontSize:size>80?30:20,color:C.text}},value),
      e("span",{style:{fontFamily:FB,fontSize:10.5,color:C.muted,letterSpacing:0.5}},"OVERALL")
    )
  );
}

function MetricCard({label,value,color,note,suffix=""}){
  const pct=typeof value==="number"?Math.min(value,100):100;
  return e("div",{style:{background:C.card,border:`1px solid ${C.border}`,borderRadius:14,padding:16,borderLeft:`3px solid ${color}`}},
    e("div",{style:{fontFamily:FM,fontSize:11,color:C.muted,marginBottom:6,textTransform:"uppercase",letterSpacing:0.5}},label),
    e("div",{style:{fontFamily:FM,fontWeight:700,fontSize:22,color:C.text,marginBottom:6}},value,e("span",{style:{fontSize:12,color:C.muted,fontWeight:400}},suffix)),
    typeof value==="number"&&e("div",{style:{height:5,borderRadius:3,background:C.bg2,overflow:"hidden",marginBottom:8}},e("div",{style:{width:`${pct}%`,height:"100%",background:color,borderRadius:3}})),
    note&&e("div",{style:{fontFamily:FB,fontSize:11.5,color:C.muted}},note)
  );
}

function FeedbackPage({session,onStartInterview,onViewDashboard,onRetry}){
  if(!session)return e("div",{className:"cc-fade",style:{maxWidth:600,margin:"60px auto",textAlign:"center",padding:"0 20px"}},
    e("p",{style:{fontFamily:FB,color:C.muted,marginBottom:16}},"No session analyzed yet — head to Assessment first."),
    e("button",{onClick:onRetry,style:pBtn},"Go to Assessment")
  );
  const fb=session.feedback||{};
  const showPS=session.practiceMode==="Public Speaking"||session.practiceMode==="Presentation Practice";
  return e("div",{className:"cc-fade",style:{maxWidth:820,margin:"0 auto",padding:"0 20px 60px"}},
    e("div",{style:{display:"flex",justifyContent:"space-between",alignItems:"center",flexWrap:"wrap",gap:12,marginBottom:22}},
      e("div",{style:{display:"flex",gap:8,flexWrap:"wrap"}},
        e(Pill,{text:session.interviewType,color:C.mint}),
        e(Pill,{text:session.practiceMode,color:C.purple}),
        e(Pill,{text:session.language,color:C.coral})
      ),
      e("button",{onClick:onRetry,style:gBtn},e(SvgRotate,{size:13})," New session")
    ),
    e("div",{style:{display:"flex",gap:24,alignItems:"center",flexWrap:"wrap",background:C.card,border:`1px solid ${C.border}`,borderRadius:20,padding:24,marginBottom:22}},
      e(ScoreRing,{value:fb.overall||0}),
      e("div",{style:{flex:1,minWidth:200}},
        e("div",{style:{fontFamily:FD,fontWeight:700,fontSize:20,color:C.text,marginBottom:6}},fb.summary||"Analysis complete."),
        e("div",{style:{fontFamily:FB,fontSize:13.5,color:C.muted,lineHeight:1.6}},"Full breakdown below — fluency, grammar, pronunciation, confidence, emotion, and pace.")
      )
    ),
    e("div",{style:{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(150px,1fr))",gap:12,marginBottom:12}},
      e(MetricCard,{label:"Fluency",value:fb.fluency||0,color:C.coral,suffix:"/100"}),
      e(MetricCard,{label:"Grammar",value:fb.grammar||0,color:C.yellow,suffix:"/100"}),
      e(MetricCard,{label:"Pronunciation",value:fb.pronunciation||0,color:C.mint,suffix:"/100"}),
      (fb.relevancy>0)&&e(MetricCard,{label:"Answer Relevancy",value:fb.relevancy||0,color:C.purple,note:"vs question asked",suffix:"/100"}),
      e(MetricCard,{label:"Pace (WPM)",value:fb.wpm||0,color:C.purple,note:fb.paceNote})
    ),
    e("div",{style:{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(150px,1fr))",gap:12,marginBottom:22}},
      e(MetricCard,{label:"Confidence",value:fb.confidence||0,color:C.coral,suffix:"/100"}),
      e(MetricCard,{label:"Emotion",value:fb.emotion||"—",color:C.yellow,note:"Acoustic read"}),
      e(MetricCard,{label:"Filler words",value:fb.fillers||0,color:C.fillerTone,note:`${fb.fillersPerMinute||0}/min`}),
      e(MetricCard,{label:"Pace score",value:fb.pace||0,color:C.purple,suffix:"/100"})
    ),
    showPS&&fb.publicSpeaking&&e(Fragment,null,
      e(STitle,{text:"Public speaking analysis",Icon:SvgUsers}),
      e("div",{style:{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(180px,1fr))",gap:12,marginBottom:22}},
        e(MetricCard,{label:"Storytelling",value:fb.publicSpeaking.storytelling||0,color:C.coral,suffix:"/100"}),
        e(MetricCard,{label:"Audience engagement",value:fb.publicSpeaking.audienceEngagement||0,color:C.yellow,suffix:"/100"}),
        e(MetricCard,{label:"Presentation flow",value:fb.publicSpeaking.presentationFlow||0,color:C.mint,suffix:"/100"})
      )
    ),
    e(STitle,{text:"Transcript",Icon:SvgVolume}),
    e("div",{className:"cc-scroll",style:{background:C.card,border:`1px solid ${C.border}`,borderRadius:14,padding:18,fontFamily:FB,fontSize:14.5,lineHeight:2,color:C.text,marginBottom:22,maxHeight:220,overflowY:"auto"}},
      (session.transcript||[]).map((tok,i)=>tok.f
        ?e("span",{key:i,title:"Filler word",style:{background:C.yellowSoft,color:C.yellow,borderRadius:5,padding:"1px 4px",fontWeight:500,cursor:"help"}},tok.t)
        :e("span",{key:i},tok.t)
      )
    ),
    fb.coachingPlan&&e(Fragment,null,
      e(STitle,{text:"Personalized coaching plan",Icon:SvgSparkle}),
      e("div",{style:{background:C.purpleSoft,border:`1px solid ${C.purple}55`,borderRadius:12,padding:"12px 14px",marginBottom:12,fontFamily:FB,fontSize:13.5,color:C.text}},
        e("strong",{style:{color:C.purple}},"Focus area: "),fb.coachingPlan.focusArea
      ),
      e("div",{style:{display:"flex",flexDirection:"column",gap:10,marginBottom:16}},
        (fb.coachingPlan.notes||[]).map((note,i)=>e("div",{key:i,style:{display:"flex",gap:10,alignItems:"flex-start",background:C.card,border:`1px solid ${C.border}`,borderRadius:12,padding:"12px 14px"}},
          e(SvgCheck,{size:16,color:C.mint}),
          e("span",{style:{fontFamily:FB,fontSize:13.5,color:C.text,lineHeight:1.6}},note)
        ))
      ),
      e("div",{style:{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(220px,1fr))",gap:12,marginBottom:28}},
        (fb.coachingPlan.drills||[]).map((d,i)=>e("div",{key:i,style:{background:C.bg2,border:`1px solid ${C.border}`,borderRadius:14,padding:16}},
          e("div",{style:{fontFamily:FD,fontWeight:600,fontSize:14,color:C.coral,marginBottom:6}},d.title),
          e("div",{style:{fontFamily:FB,fontSize:13,color:C.muted,lineHeight:1.5}},d.desc)
        ))
      )
    ),
    e("div",{style:{display:"flex",gap:12,flexWrap:"wrap"}},
      e("button",{onClick:onStartInterview,style:pBtn},"Start mock interview ",e(SvgArrow,{size:15,color:C.bg})),
      e("button",{onClick:onViewDashboard,style:sBtn},"View dashboard"),
      e("button",{onClick:onRetry,style:sBtn},"Practice again")
    )
  );
}

/* ── helpers for enhanced evaluation output ── */

const _buildReasoning = (q, answer, score, report, isWeak) => {
  const pts = [];
  const r = report || {};
  const rel = r.answer_relevancy_score || 0;
  if (isWeak || !answer || answer.trim().length < 10) {
    pts.push("The answer is empty, extremely short, or does not address the question at all.");
    pts.push("Non-answers and refusals automatically receive a score of 0-20.");
    return pts;
  }
  if (rel > 0 && rel < 25) {
    pts.push(`Answer relevancy score is very low (${Math.round(rel)}/100). The response does not engage with the question meaningfully.`);
  } else if (rel >= 25 && rel < 50) {
    pts.push(`Answer relevancy is low (${Math.round(rel)}/100). Key aspects of the question were not addressed.`);
  } else if (rel >= 50 && rel < 70) {
    pts.push(`Answer relevancy is moderate (${Math.round(rel)}/100). Some relevant content exists but important details are missing.`);
  } else if (rel >= 70) {
    pts.push(`Answer relevancy is good (${Math.round(rel)}/100). The response addresses the question with relevant content.`);
  }
  if (r.grammar_score != null) {
    if (r.grammar_score < 55) pts.push(`Grammar score is weak (${Math.round(r.grammar_score)}/100) — frequent errors in sentence structure and word choice.`);
    else if (r.grammar_score < 75) pts.push(`Grammar score is fair (${Math.round(r.grammar_score)}/100) — some grammatical errors affect overall clarity.`);
    else pts.push(`Grammar is solid (${Math.round(r.grammar_score)}/100) — minimal structural errors.`);
  }
  if ((r.filler_word_count || 0) > 3) {
    pts.push(`${r.filler_word_count} filler words detected — excessive fillers reduce perceived confidence and professionalism.`);
  }
  if (r.fluency_score != null && r.fluency_score > 0 && r.fluency_score < 60) {
    pts.push(`Fluency score is low (${Math.round(r.fluency_score)}/100) — delivery was inconsistent or broken.`);
  }
  if (pts.length === 0) {
    pts.push(`Overall score of ${score}/100 reflects the combined relevancy, grammar, and delivery quality.`);
  }
  return pts.slice(0, 4);
};

const _buildKnowledgeGaps = (q, answer, score, report) => {
  const gaps = [];
  const query = (q || "").toLowerCase();
  const r = report || {};
  const isWeak = !answer || answer.trim().length < 10;
  if (isWeak) {
    gaps.push("No substantive knowledge demonstrated — the answer did not engage with the question.");
    return gaps;
  }
  if (query.includes("yourself") || query.includes("introduce")) {
    if (score < 70) {
      gaps.push("Professional background and current role description");
      gaps.push("Key achievements and quantifiable results");
      gaps.push("Career narrative connecting past experience to this role");
    }
  } else if (query.includes("technical project") || query.includes("worked with") || query.includes("project you're most proud")) {
    if (score < 70) {
      gaps.push("STAR method structure (Situation, Task, Action, Result)");
      gaps.push("Specific technical tools, libraries, or architectural decisions used");
      gaps.push("Measurable business or technical impact (e.g., latency reduced by X%, cost saved by Y%)");
    }
  } else if (query.includes("disagreed") || query.includes("teammate")) {
    if (score < 70) {
      gaps.push("Active listening and empathy — acknowledging the other party's valid perspective");
      gaps.push("Data-driven conflict resolution approach");
      gaps.push("Positive outcome demonstrating professional maturity");
    }
  } else if (query.includes("prioritize") || query.includes("urgent") || query.includes("pressure")) {
    if (score < 70) {
      gaps.push("A formalized prioritization framework (Eisenhower Matrix, MoSCoW, or Agile backlog)");
      gaps.push("Proactive stakeholder communication when timelines shift");
      gaps.push("Specific examples of managing competing priorities successfully");
    }
  } else if (query.includes("why do you want")) {
    if (score < 70) {
      gaps.push("Specific knowledge of the company's mission, products, or technology stack");
      gaps.push("Clear articulation of what unique value you bring to the team");
    }
  } else if (score < 50) {
    gaps.push("Substantive, on-topic response addressing the core question");
    gaps.push("At least one concrete example from real professional experience");
    gaps.push("Logical structure with a clear beginning, middle, and conclusion");
  }
  if ((r.answer_relevancy_score || 0) < 40 && !isWeak) {
    gaps.push("Understanding of what the interviewer is actually asking — re-read the question before answering");
  }
  return gaps;
};

const _buildSampleAnswer = (q) => {
  const query = (q || "").toLowerCase();
  if (query.includes("yourself") || query.includes("introduce")) {
    return "I'm a software engineer with four years of experience building scalable backend systems. In my most recent role at TechCorp, I led the migration of our monolithic payment service to a microservices architecture, which reduced our deployment time by 60% and improved system uptime to 99.97%. Before that, I worked at a fintech startup where I built real-time fraud detection models using Python and Kafka. I'm excited about this role because your team is working on distributed data systems — that's exactly the space where I want to deepen my expertise over the next few years.";
  }
  if (query.includes("technical project") || query.includes("worked with") || query.includes("project you're most proud")) {
    return "One project I'm most proud of was redesigning our authentication service. The situation was that our legacy auth system was causing 200ms latency spikes during peak traffic. My task was to architect and deliver a zero-downtime replacement. My action was to introduce Redis-backed JWT sessions with a staged canary rollout — I wrote the migration script, led four engineers through a two-week sprint, and instrumented every step in Datadog. The result was a 74% reduction in p99 latency and a 40% drop in infrastructure cost. The project shipped two weeks ahead of schedule.";
  }
  if (query.includes("disagreed") || query.includes("teammate")) {
    return "During a product roadmap meeting, our lead engineer wanted to build a custom caching layer while I believed Redis would be faster to deliver and lower-risk. Rather than dismissing his idea, I asked him to walk me through his concerns about Redis — mainly around operational overhead. I acknowledged that was valid, then put together a two-page comparison doc with benchmarks, maintenance cost, and hiring implications. We agreed to run a week-long spike with Redis in staging. The results were clear — Redis handled our load with half the code, and the team aligned on that approach. The feature shipped on time and has been stable for 18 months.";
  }
  if (query.includes("prioritize") || query.includes("urgent") || query.includes("pressure")) {
    return "I use a two-step approach: first I map every task on an impact-vs-effort grid, then I hold a 10-minute sync with stakeholders to validate my read of business priority. Last quarter, when we had three concurrent P1 incidents alongside a board demo deadline, I triaged the incidents to the on-call team, delegated two lower-impact tasks, and personally focused on the demo-critical feature. I communicated timeline risks proactively to the PM by end of day Monday — giving her time to adjust the scope. Everything shipped. I find that transparency with stakeholders turns urgency from a panic into a team problem we can solve together.";
  }
  if (query.includes("why do you want")) {
    return "I've been following your engineering blog for over a year — specifically your posts on distributed tracing and chaos engineering. My last three years have been spent solving exactly these problems at scale, and I want to work somewhere that treats observability as a first-class concern rather than an afterthought. Beyond the technical fit, your culture of blameless post-mortems aligns with how I believe high-performing teams grow. I believe I can contribute to your platform reliability goals within the first quarter, and I'm genuinely excited about the problem space you're working on.";
  }
  if (query.includes("strengths")) {
    return "My strongest area is debugging complex distributed systems under pressure — I've been the person people call when nothing else is working. Last year I diagnosed a memory leak in production that had evaded three other engineers for two weeks. I isolated it to a subtle goroutine leak in our gRPC middleware within four hours using pprof. On the growth side, I'm working on delegating earlier rather than jumping in myself — I've started doing structured code walkthroughs with junior engineers rather than just fixing issues, which has improved both team capability and my own bandwidth.";
  }
  return "I faced a situation where [specific context]. My task was to [clear responsibility]. I took the following actions: first [concrete step with tool/method], then [second concrete step], and finally [third step]. The result was [quantified business or technical outcome — e.g., 30% improvement, shipped on time, zero incidents post-deployment]. This experience taught me [specific lesson that makes me stronger as a professional].";
};

const getExpectedAnswer = (q) => {
  const query = q.toLowerCase();
  if (query.includes("dependency injection")) {
    return "Dependency Injection is a design pattern where dependencies are provided to a class from outside instead of being created internally. It improves maintainability, testability, and loose coupling.";
  }
  if (query.includes("yourself") || query.includes("introduce")) {
    return "A strong introduction using the Present-Past-Future framework: outline your current role and recent key achievements, mention how your past experience prepared you for this, and express why you are excited about this specific opportunity.";
  }
  if (query.includes("technical project") || query.includes("worked with") || query.includes("project you're most proud")) {
    return "A detailed STAR-formatted technical project walkthrough. Explain the Situation (project goals), Task (your responsibilities), Action (your specific technical contributions, libraries used, architectural decisions, and coding challenges solved), and Result (performance improvements, cost reduction, or other business impact).";
  }
  if (query.includes("disagreed") || query.includes("teammate")) {
    return "A behavioral response showing professional conflict resolution: describe the technical or business disagreement, focus on active listening and empathy to understand their side, explain how you used objective data/compromise to reach a solution, and show the successful project outcome.";
  }
  if (query.includes("prioritize") || query.includes("urgent") || query.includes("pressure")) {
    return "A structured prioritization approach: explain how you use a framework (like the Eisenhower Matrix), communicate proactively with stakeholders to negotiate timelines, focus on high-impact tasks first, and manage stress with organized daily planning.";
  }
  if (query.includes("why do you want to work")) {
    return "Demonstrate alignment between your values and the company's mission. Mention specific projects, culture, or technology stack of the company that excite you, and how you can add unique value to their team.";
  }
  if (query.includes("strengths")) {
    return "Highlight 1-2 key professional strengths (e.g., rapid problem solving, clean code architecture) supported by brief real-world examples, and discuss a genuine, non-dealbreaker weakness (e.g., perfectionism, over-engineering) along with how you are actively working to improve it.";
  }
  if (query.includes("five years") || query.includes("future")) {
    return "Show ambition and realistic career progression. Focus on deep-diving into the technology stack, taking on more architecture design responsibilities, mentoring junior developers, and contributing directly to the core engineering goals of the organization.";
  }
  if (query.includes("design a url")) {
    return "A high-level system design discussion: cover key components such as a shortener hashing algorithm (MD5/Base62), database selection (NoSQL/SQL) with a schema, caching layers (Redis) for redirection scaling, load balancing, and handling collision prevention.";
  }
  if (query.includes("debug") || query.includes("production issue")) {
    return "Explain a logical diagnostic process: describe the issue and panic state, detail how you monitored logs (ELK/Splunk), isolated the variable, verified the fix in a staging environment, deployed it safely, and implemented post-mortem preventive measures.";
  }
  if (query.includes("new technology")) {
    return "Outline a learning methodology: start with official documentation/quickstarts, build a small hands-on prototype to learn key patterns, consult expert blogs/videos for best practices, and seek mentorship or code reviews on early contributions.";
  }
  if (query.includes("underperforming")) {
    return "A constructive management approach: first hold a private 1-on-1 to understand underlying personal or technical obstacles, establish a clear Performance Improvement Plan (PIP) with weekly feedback, offer mentorship or training, and document progress.";
  }
  if (query.includes("bad news")) {
    return "Provide transparent, empathetic, and timely communication: explain the context and impact clearly, take collective responsibility without assigning individual blame, lay out the concrete remediation plan, and invite feedback/questions from the team.";
  }
  if (query.includes("trust")) {
    return "Listen first, speak second. Hold individual 1-on-1s to learn team goals and pain points, lead by example, shield the team from external distractions, champion their successes, and remain reliable and transparent in decision-making.";
  }
  if (query.includes("deadline")) {
    return "A proactive accountability response: explain how you realized early that the deadline would be missed, notified stakeholders immediately with options, worked extra hours or de-scoped non-critical items, delivered a stable version, and adjusted future planning.";
  }
  if (query.includes("persuade")) {
    return "Use data, logic, and active listening: gather factual evidence, address their concerns directly, present a comparative analysis showing trade-offs, align on a shared business goal, and run a small proof-of-concept (POC) to prove feasibility.";
  }
  if (query.includes("tough feedback")) {
    return "A growth-mindset response: listen without defensiveness, ask clarifying questions to truly understand, thank the reviewer, formulate a concrete action plan to improve, and schedule a follow-up 1-on-1 to demonstrate your growth.";
  }
  return "A well-structured response that addresses the question directly with clear logic, specific examples from your past work, and quantifiable business or technical metrics to prove the value and outcome.";
};

const getWhyWeak = (q, score, report) => {
  const points = [];
  const r = report || {};
  const query = q.toLowerCase();
  
  if (score < 55) {
    points.push("Your answer is extremely short or off-topic. Please provide a more substantial verbal response.");
  }
  if (r.answer_relevancy_score != null && r.answer_relevancy_score < 60) {
    points.push(`Answer relevancy is low (${Math.round(r.answer_relevancy_score)}/100). The response does not focus enough on the core question asked.`);
  }
  if (r.grammar_score != null && r.grammar_score < 70) {
    points.push("Grammar and sentence structure needs improvement. Spoken speech contains grammar slips or awkward phrasing.");
  }
  if (r.filler_word_count != null && r.filler_word_count > 3) {
    points.push(`High usage of filler words detected (${r.filler_word_count} fillers). Filler words like 'um' and 'like' weaken overall delivery.`);
  }
  if (r.pace_score != null && r.pace_score < 70) {
    if (r.words_per_minute > 160) {
      points.push(`Your pacing was fast at ${Math.round(r.words_per_minute)} words per minute. Speaking too fast makes it harder for the interviewer to digest key points.`);
    } else {
      points.push(`Your pacing was slow at ${Math.round(r.words_per_minute)} words per minute. Aim for a confident 130-150 WPM range.`);
    }
  }
  
  if (points.length === 0 || score < 80) {
    if (query.includes("yourself") || query.includes("introduce")) {
      points.push("Does not explicitly follow the Present-Past-Future framework.");
      points.push("Could place more emphasis on quantifiable results rather than general tasks.");
    } else if (query.includes("technical project") || query.includes("worked with") || query.includes("project you're most proud")) {
      points.push("STAR structure could be more distinct (Situation, Task, Action, Result).");
      points.push("Missing concrete metrics such as latency, load, cost savings, or speed improvements.");
    } else if (query.includes("disagreed") || query.includes("teammate")) {
      points.push("Needs to highlight how you actively listened to the other party's perspective.");
      points.push("The compromise or alignment process could be explained with more data-driven details.");
    } else if (query.includes("prioritize") || query.includes("urgent") || query.includes("pressure")) {
      points.push("Missing a formalized prioritization framework (like Eisenhower matrix or Agile backlog).");
      points.push("Should detail proactive communication with stakeholders when delays are inevitable.");
    } else {
      points.push("Could be strengthened with a more structured approach and specific industry examples.");
    }
  }
  return points;
};

const getSuggestions = (q) => {
  const query = q.toLowerCase();
  if (query.includes("yourself") || query.includes("introduce")) {
    return [
      "Open with your current headline and highest-impact project.",
      "Limit your response to 90-120 seconds to keep the interviewer engaged.",
      "Align your past achievements directly with the requirements of this role."
    ];
  }
  if (query.includes("technical project") || query.includes("worked with") || query.includes("project you're most proud")) {
    return [
      "Use the STAR method: Situation (15%), Task (15%), Action (50%), Result (20%).",
      "Highlight specific technologies (e.g., Python, PostgreSQL, AWS) and why you chose them.",
      "Always state a quantifiable metric of success (e.g., 'reduced memory usage by 40%')."
    ];
  }
  if (query.includes("disagreed") || query.includes("teammate")) {
    return [
      "Focus on professional alignment rather than personal conflicts.",
      "Showcase empathy by explaining their valid arguments first.",
      "End with the positive outcome for the project or team dynamics."
    ];
  }
  if (query.includes("prioritize") || query.includes("urgent") || query.includes("pressure")) {
    return [
      "Explicitly mention prioritizing by business impact vs effort.",
      "Discuss how you manage expectations and renegotiate deadlines proactively.",
      "Explain your daily focus and time-blocking habits."
    ];
  }
  return [
    "Structure your response with clear, bulleted points.",
    "Support your claims with brief, real-world examples.",
    "Aim for a steady pace of 130 to 150 words per minute with silent pauses."
  ];
};

function generateQuestions(type,resume,useResume){
  const base=QUESTION_BANK[type]||QUESTION_BANK.HR;
  if(useResume&&resume){
    const skillQs=(resume.skills||[]).slice(0,2).map(s=>`I see you've worked with ${s}. Tell me about a project where you used it.`);
    return [...skillQs,...base.slice(0,2)];
  }
  return base.slice(0,4);
}

function MockInterviewPage({resume,defaultType,onFinish,userId="default_user",
  // lifted state — persists across tab changes
  phase,setPhase,interviewType,setInterviewType,useResume,setUseResume,
  questions,setQuestions,idx,setIdx,answer,setAnswer,
  rawLog,setRawLog,scoredLog,setScoredLog,evalProgress,setEvalProgress,
  dbSessionId,setDbSessionId,sessionId,setSessionId,setupErr,setSetupErr,
  generatedQuestions,setGeneratedQuestions,
  hidden
}){

  /* ── Interview-start loading guard ── */
  const [starting,setStarting]=useState(false);
  const startingRef=useRef(false);
  const [confirmRestart,setConfirmRestart]=useState(false);
  /*
   * evaluationFrozen: once results are shown, never re-run evaluateAll unless
   * explicit restart. Seed from localStorage so page-refresh also respects it.
   */
  const evaluationFrozenRef=useRef(
    localStorage.getItem("cc_mip_completed")==="true"
  );

  /* Sync states to localStorage */
  useEffect(() => {
    localStorage.setItem("cc_mip_phase", phase);
  }, [phase]);

  useEffect(() => {
    localStorage.setItem("cc_mip_questions", JSON.stringify(questions));
  }, [questions]);

  useEffect(() => {
    localStorage.setItem("cc_mip_idx", idx);
  }, [idx]);

  useEffect(() => {
    localStorage.setItem("cc_mip_rawLog", JSON.stringify(rawLog));
  }, [rawLog]);

  useEffect(() => {
    localStorage.setItem("cc_mip_scoredLog", JSON.stringify(scoredLog));
    /* Also persist completion flag — survives page refresh */
    if(scoredLog.length>0&&phase==="results"){
      localStorage.setItem("cc_mip_completed","true");
    }
  }, [scoredLog,phase]);

  useEffect(() => {
    if (sessionId) localStorage.setItem("cc_mip_sessionId", sessionId);
    else localStorage.removeItem("cc_mip_sessionId");
  }, [sessionId]);

  useEffect(() => {
    if (dbSessionId) localStorage.setItem("cc_mip_dbSessionId", dbSessionId);
    else localStorage.removeItem("cc_mip_dbSessionId");
  }, [dbSessionId]);

  /*
   * Safety guard: if the page restores to "evaluating" but scoredLog already
   * has results (loaded from localStorage), jump straight to "results".
   * Also guard against re-evaluation when evaluation is frozen.
   */
  useEffect(()=>{
    if(phase==="evaluating"&&scoredLog.length>0){
      setPhase("results");
    }else if(phase==="evaluating"&&evaluationFrozenRef.current){
      /* completed flag set but scoredLog cleared? go back to setup */
      setPhase("setup");
    }
  },[]);  /* run once on mount only */

  /* ── Audio recording state ── */
  const [answerMode,setAnswerMode]=useState("text");
  const [isRecording,setIsRecording]=useState(false);
  const [recordSeconds,setRecordSeconds]=useState(0);
  const [micError,setMicError]=useState(null);
  const [recordedLabel,setRecordedLabel]=useState(null);
  const mediaRecorderRef=useRef(null);
  const streamRef=useRef(null);
  const timerRef=useRef(null);
  const recordSecondsRef=useRef(0);
  const recordedBlobRef=useRef(null);
  const fmtTime=s=>`${Math.floor(s/60)}:${String(s%60).padStart(2,"0")}`;

  const startMicRec=async()=>{
    setMicError(null);setRecordedLabel(null);recordedBlobRef.current=null;setAnswer("");
    if(!navigator.mediaDevices||!window.MediaRecorder){setMicError("Recording not supported — type your answer instead.");return;}
    try{
      const stream=await navigator.mediaDevices.getUserMedia({audio:true});
      streamRef.current=stream;
      const chunks=[];
      const rec=new MediaRecorder(stream);
      rec.ondataavailable=ev=>{if(ev.data.size>0)chunks.push(ev.data);};
      rec.onstop=()=>{
        stream.getTracks().forEach(t=>t.stop());clearInterval(timerRef.current);
        const blob=new Blob(chunks,{type:rec.mimeType||"audio/webm"});
        recordedBlobRef.current=blob;setRecordedLabel(`Recorded — ${fmtTime(recordSecondsRef.current)}`);
        setIsRecording(false);setAnswer("__audio__");
      };
      mediaRecorderRef.current=rec;rec.start();setIsRecording(true);setRecordSeconds(0);recordSecondsRef.current=0;
      timerRef.current=setInterval(()=>{recordSecondsRef.current+=1;setRecordSeconds(recordSecondsRef.current);},1000);
    }catch(_){setMicError("Mic access blocked — check browser permissions or type your answer.");}
  };
  const stopMicRec=()=>{if(mediaRecorderRef.current&&mediaRecorderRef.current.state!=="inactive")mediaRecorderRef.current.stop();setIsRecording(false);};
  const resetRec=()=>{clearInterval(timerRef.current);streamRef.current?.getTracks().forEach(t=>t.stop());setIsRecording(false);setRecordSeconds(0);recordSecondsRef.current=0;recordedBlobRef.current=null;setRecordedLabel(null);setMicError(null);};
  useEffect(()=>()=>{clearInterval(timerRef.current);streamRef.current?.getTracks().forEach(t=>t.stop());},[]);

  // Sync interviewType from parent's defaultType when setup phase opens fresh
  useEffect(()=>{if(phase==="setup"&&defaultType&&!rawLog.length)setInterviewType(defaultType);},[defaultType]);

  /* ── Weak-answer helpers (must be defined before evaluateAll) ── */
  const _WEAK_PATTERNS_I=/^(i\s+don'?t\s+know|i\s+do\s+not\s+know|no\s+idea|not\s+sure|i'?m\s+not\s+sure|i\s+have\s+no\s+(experience|idea|clue|knowledge)|i\s+don'?t\s+have\s+any\s+(experience|idea|knowledge)|i\s+don'?t\s+actually|i\s+cannot\s+answer|i\s+can'?t\s+answer|^no$|nope|none|i\s+just\s+wanted\s+a\s+job|i\s+applied\s+(because|since|as)\s+i\s+(needed|wanted|just)|i\s+don'?t\s+know\s+this|i\s+have\s+no\s+answer|i\s+pass)\b/i;
  const _FILLER_SET_I=new Set(["um","uh","uhh","umm","hmm","like","so","well","you","know","i","mean","basically","actually","literally","right","yeah","okay","ok","a","an","the","and","or","but","is","it"]);
  const _isWeakAnswer=(text)=>{
    const t=(text||"").trim();
    if(!t)return true;
    if(_WEAK_PATTERNS_I.test(t))return true;
    const words=t.toLowerCase().match(/[a-z']+/g)||[];
    const meaningful=words.filter(w=>!_FILLER_SET_I.has(w)&&w.length>1);
    return meaningful.length<5;
  };
  const _heuristicScore=(text,lang)=>{
    if(_isWeakAnswer(text))return Math.max(0,Math.min(15,Math.round((text||"").trim().length/3)));
    const words=(text||"").trim().split(/\s+/).filter(Boolean);
    let base=Math.min(60,20+words.length*1.5);
    const fillerSet=getFillers(lang||null);
    const fillerRx=new RegExp("\\b("+[...fillerSet].map(f=>f.replace(/[.*+?^${}()|[\]\\]/g,"\\$&")).join("|")+")\\b","gi");
    const fillerCount=((text||"").match(fillerRx)||[]).length;
    base-=(words.length>0?fillerCount/words.length:0)*40;
    if(/\b(result|outcome|achieved|saved|improved|reduced|increased|led|managed)\b/i.test(text||""))base+=8;
    return Math.max(21,Math.min(85,Math.round(base)));
  };
  const _scoreFromReport=(report,text)=>{
    const g=report.grammar_score||0,f=report.filler_score||0,p=report.pace_score||0,fl=report.fluency_score||0,r=report.answer_relevancy_score||0;
    if(g+f+p+fl+r===0)return _heuristicScore(text||"");
    let score=Math.round(r*0.40+fl*0.25+g*0.20+f*0.10+p*0.05);
    if(_isWeakAnswer(text||"")||r<=20)score=Math.min(score,20);
    return score;
  };

  const start=async()=>{
    if(startingRef.current)return;
    startingRef.current=true;setStarting(true);setSetupErr(null);
    const resumeText=(useResume&&resume)?(resume.text||resume.summary||""):null;
    const localBank=(generatedQuestions&&generatedQuestions.length>0)?generatedQuestions:generateQuestions(interviewType,resume,useResume);
    const qs=localBank.slice(0,TOTAL_QUESTIONS);
    let sid=null;
    try{
      const resp=await fetch(`${API_URL}/interview/start`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({user_id:userId,topic:interviewType,resume_text:resumeText})});
      if(resp.ok){
        const data=await resp.json();
        setDbSessionId(data.db_session_id||null);
        sid=data.session_id||null;
      }
    }catch(_){}finally{startingRef.current=false;setStarting(false);}
    setSessionId(sid);
    setQuestions(qs);setIdx(0);setRawLog([]);setScoredLog([]);setAnswer("");setEvalProgress(0);setPhase("interview");
  };

  const submitAnswer=()=>{
    if(!answer.trim())return;
    const audioBlob=recordedBlobRef.current||null;
    const displayAnswer=answer==="__audio__"?`[Voice recording — ${recordedLabel||"audio"}]`:answer;
    const entry={question:questions[idx],answer:displayAnswer,audioBlob};
    const newRaw=[...rawLog,entry];
    setRawLog(newRaw);setAnswer("");resetRec();
    if(idx+1<questions.length){setIdx(idx+1);}
    else{setPhase("evaluating");setEvalProgress(0);setTimeout(()=>evaluateAll(newRaw),0);}
  };

  const evaluateAll=async(entries)=>{
    /* Guard: never re-evaluate if already frozen (page refresh / tab switch protection) */
    if(evaluationFrozenRef.current)return;
    const results=[];
    for(let i=0;i<entries.length;i++){
      const {question,answer:ans,audioBlob}=entries[i];
      let score,feedbackText,report={},coachingPlan=null;
      try{
        let data;
        if(sessionId&&audioBlob){
          /* Audio path — STT on server; pass question as interview_topic for relevancy scoring.
             Use /analyze directly (not /interview/answer) so we don't trigger an extra
             question-generation LLM call for each answer in batch evaluation. */
          const form=new FormData();
          form.append("user_id",userId);
          form.append("interview_topic",question||interviewType);
          form.append("file",audioBlob,"answer.webm");
          const resp=await fetch(`${API_URL}/analyze`,{method:"POST",body:form});
          if(!resp.ok)throw new Error(`API ${resp.status}`);
          data=await resp.json();
        }else{
          /* Text path — use /analyze/text with the specific question for relevancy.
             This avoids the extra generate_question LLM call from /interview/answer. */
          const resp=await fetch(`${API_URL}/analyze/text`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({user_id:userId,transcript:ans,interview_topic:question||interviewType})});
          if(!resp.ok)throw new Error(`API ${resp.status}`);
          data=await resp.json();
        }
        report=data.session_report||{};
        const feedbackFull=data.feedback||{};
        coachingPlan=feedbackFull.coachingPlan||null;
        const os=report.overall_score;
        /* Always apply weak-answer cap even to server score */
        let rawScore=(os!=null&&os>0)?Math.round(os):_scoreFromReport(report,ans);
        const rel=report.answer_relevancy_score||0;
        if(_isWeakAnswer(ans)||rel<=20)rawScore=Math.min(rawScore,20);
        score=rawScore;
        const raw=data.feedback_raw||feedbackFull;
        const m=typeof raw==="string"?raw.match(/[-•*]\s+(.+)/):null;
        const lines=m?[m[1].replace(/\*\*/g,"").trim()]:[];
        if(rel>0&&rel<50)lines.push(`Answer relevancy low (${Math.round(rel)}/100) — address the question more directly.`);
        else if(rel>=50&&rel<70)lines.push(`Answer partially relevant (${Math.round(rel)}/100) — stay more focused on what was asked.`);
        if((report.filler_word_count||0)>3)lines.push(`Watch filler words (${report.filler_word_count} detected).`);
        if((report.words_per_minute||0)>160)lines.push(`Pace was fast at ${Math.round(report.words_per_minute)} WPM.`);
        feedbackText=lines.length?lines.slice(0,2).join(" "):ANSWER_FEEDBACK_POOL[Math.floor(Math.random()*ANSWER_FEEDBACK_POOL.length)];
      }catch(_){
        score=_heuristicScore(ans);
        feedbackText=ANSWER_FEEDBACK_POOL[Math.floor(Math.random()*ANSWER_FEEDBACK_POOL.length)];
      }
      results.push({question,answer:ans,score,feedback:feedbackText,report,coachingPlan});
      setEvalProgress(Math.round(((i+1)/entries.length)*100));
      await new Promise(r=>setTimeout(r,0));
    }
    /* Freeze results — prevent re-evaluation on refresh or tab switch */
    evaluationFrozenRef.current=true;
    localStorage.setItem("cc_mip_completed","true");
    setScoredLog(results);setPhase("results");
  };

  const _doRestart=()=>{
    evaluationFrozenRef.current=false;
    setRawLog([]);
    setScoredLog([]);
    setIdx(0);
    setAnswer("");
    resetRec();
    setSessionId(null);
    setDbSessionId(null);
    setQuestions([]);
    setConfirmRestart(false);
    /* Clear ALL interview state from localStorage — full clean slate */
    ["cc_mip_phase","cc_mip_questions","cc_mip_idx","cc_mip_rawLog",
     "cc_mip_scoredLog","cc_mip_sessionId","cc_mip_dbSessionId",
     "cc_mip_completed"].forEach(k=>localStorage.removeItem(k));
    const skills = resume?.skills || [];
    const primarySkill = skills[0] || "software engineering";
    const customQuestions = [
      "Tell me about yourself and how your experience aligns with this role.",
      `I see you have experience with ${primarySkill}. Can you walk me through a complex technical challenge you solved using it?`,
      "Tell me about a time you disagreed with a teammate or stakeholder. How did you resolve it and what was the outcome?",
      "How do you handle prioritization and pressure when everything on your plate feels urgent?"
    ];
    if (setGeneratedQuestions) {
      setGeneratedQuestions(customQuestions);
    }
    setQuestions(customQuestions);
    setPhase("setup");
  };

  const handleRestart=()=>{
    /* Show confirmation modal — actual reset only happens on confirm */
    setConfirmRestart(true);
  };

  const finishInterview=()=>{
    const avgScore=Math.round(scoredLog.reduce((a,e2)=>a+e2.score,0)/Math.max(scoredLog.length,1));
    onFinish({date:"Today",type:"Mock Interview",avgScore,questions:scoredLog.length,scoredLog});
    
    setRawLog([]);
    setScoredLog([]);
    setIdx(0);
    setAnswer("");
    resetRec();
    setSessionId(null);
    setDbSessionId(null);
    setQuestions([]);
    
    ["cc_mip_phase","cc_mip_questions","cc_mip_idx","cc_mip_rawLog",
     "cc_mip_scoredLog","cc_mip_sessionId","cc_mip_dbSessionId",
     "cc_mip_completed"].forEach(k=>localStorage.removeItem(k));

    setPhase("setup");
  };

  /* Wrap entire page in a visibility shell — hidden prop keeps state alive without unmounting */
  const wrapHidden=(child)=>e("div",{style:{display:hidden?"none":"block"}},child);

  /* Setup phase */
  if(phase==="setup"){
    const qs=(generatedQuestions&&generatedQuestions.length>0)?generatedQuestions:generateQuestions(interviewType,resume,useResume).slice(0,TOTAL_QUESTIONS);
    return wrapHidden(e("div",{className:"cc-fade",style:{maxWidth:620,margin:"0 auto",padding:"0 20px 60px"}},
      e(STitle,{text:"Your Mock Interview Ready",Icon:SvgUsers}),
      setupErr&&e("div",{style:{background:C.coralSoft,border:`1px solid ${C.coral}55`,borderRadius:10,padding:"10px 14px",marginBottom:14,fontFamily:FB,fontSize:13,color:C.text}},setupErr),
      e("div",{style:{background:C.card,border:`1px solid ${C.border}`,borderRadius:18,padding:22}},
        e("div",{style:{fontFamily:FB,fontSize:13.5,color:C.muted,marginBottom:18,lineHeight:1.6}},
          "Based on your resume and assessment, we have compiled the following personalized sequence of HR, Technical, Behavioral, and Managerial questions for you:"
        ),
        e("div",{style:{display:"flex",flexDirection:"column",gap:10,marginBottom:20}},
          qs.map((q,qi)=>e("div",{key:qi,style:{display:"flex",gap:10,alignItems:"flex-start",background:C.bg2,borderRadius:10,padding:"10px 14px",border:`1px solid ${C.border}`}},
            e("div",{style:{width:20,height:20,borderRadius:"50%",background:C.purpleSoft,color:C.purple,display:"flex",alignItems:"center",justifyContent:"center",fontFamily:FM,fontSize:11,fontWeight:700,flexShrink:0,marginTop:2}},qi+1),
            e("div",{style:{fontFamily:FB,fontSize:13,color:C.text,lineHeight:1.4}},q)
          ))
        ),
        e(Label,{Icon:SvgBriefcase,text:"Interview type"}),
        e("div",{style:{marginBottom:18}},e(ChipRow,{options:INTERVIEW_TYPES,value:interviewType,onChange:setInterviewType,accent:C.mint})),
        e("label",{style:{display:"flex",alignItems:"center",gap:10,cursor:resume?"pointer":"default",opacity:resume?1:0.5}},
          e("input",{type:"checkbox",checked:useResume,disabled:!resume,onChange:ev=>setUseResume(ev.target.checked)}),
          e("span",{style:{fontFamily:FB,fontSize:13.5,color:C.text}},`Generate questions from my resume${!resume?" (upload in Assessment first)":""}`)
        ),
        e("div",{style:{marginTop:14,padding:"10px 14px",background:C.bg2,borderRadius:10,fontFamily:FB,fontSize:12.5,color:C.muted,lineHeight:1.6}},
          "You'll answer ",e("strong",{style:{color:C.text}},TOTAL_QUESTIONS," questions")," one by one. All answers collected first — evaluation happens together at the end."
        ),
        e("button",{onClick:start,disabled:starting,style:{...pBtn,width:"100%",marginTop:18,opacity:starting?0.6:1,cursor:starting?"default":"pointer"}},starting?"Starting…":"Start interview ",!starting&&e(SvgArrow,{size:15,color:C.bg}))
      )
    ));
  }

  /* Interview phase */
  if(phase==="interview"){
    const total=questions.length;
    const progressPct=Math.round((idx/total)*100);
    return wrapHidden(e("div",{className:"cc-fade",style:{maxWidth:680,margin:"0 auto",padding:"0 20px 60px"}},
      e("div",{style:{display:"flex",alignItems:"center",gap:8,marginBottom:16,flexWrap:"wrap"}},
        e(Pill,{text:"Mock Interview",color:C.mint}),
        e(Pill,{text:`Q ${idx+1} of ${total}`,color:C.muted,mono:true}),
        e("div",{style:{flex:1,minWidth:100}}),
        e(ElapsedTimer,{color:C.muted}),
        rawLog.length>0&&e("span",{style:{fontFamily:FM,fontSize:11.5,color:C.muted}},`${rawLog.length} answered`)
      ),
      e("div",{style:{height:4,borderRadius:2,background:C.bg2,overflow:"hidden",marginBottom:18}},
        e("div",{style:{width:`${progressPct}%`,height:"100%",background:C.mint,borderRadius:2,transition:"width .3s ease"}})
      ),
      e("div",{style:{background:C.card,border:`1px solid ${C.border}`,borderRadius:18,padding:22,marginBottom:14}},
        e("div",{style:{fontFamily:FD,fontWeight:700,fontSize:19,color:C.text,marginBottom:18,lineHeight:1.4}},questions[idx]),
        /* Answer mode toggle */
        e("div",{style:{display:"flex",gap:8,marginBottom:14}},
          e("button",{onClick:()=>{setAnswerMode("text");resetRec();setAnswer("");},style:{flex:1,display:"flex",alignItems:"center",justifyContent:"center",gap:6,padding:"8px 12px",borderRadius:10,cursor:"pointer",fontFamily:FB,fontWeight:500,fontSize:13,border:`1px solid ${answerMode==="text"?C.coral:C.border}`,background:answerMode==="text"?C.coralSoft:"transparent",color:answerMode==="text"?C.coral:C.muted}},
            e(SvgMsg,{size:13,color:answerMode==="text"?C.coral:C.muted})," Type answer"
          ),
          e("button",{onClick:()=>{setAnswerMode("record");setAnswer("");},style:{flex:1,display:"flex",alignItems:"center",justifyContent:"center",gap:6,padding:"8px 12px",borderRadius:10,cursor:"pointer",fontFamily:FB,fontWeight:500,fontSize:13,border:`1px solid ${answerMode==="record"?C.coral:C.border}`,background:answerMode==="record"?C.coralSoft:"transparent",color:answerMode==="record"?C.coral:C.muted}},
            e(SvgMic,{size:13,color:answerMode==="record"?C.coral:C.muted})," Record answer"
          )
        ),
        answerMode==="text"
          ? e(Fragment,null,
              e("textarea",{className:"cc-textarea",placeholder:"Type your spoken answer here…",value:answer,onChange:ev=>setAnswer(ev.target.value),onKeyDown:ev=>{if(ev.key==="Enter"&&ev.ctrlKey)submitAnswer();},style:{minHeight:110},autoFocus:true}),
              e("div",{style:{fontFamily:FB,fontSize:11.5,color:C.muted,marginTop:4,textAlign:"right"}},"Ctrl+Enter to submit")
            )
          : e("div",{style:{border:`2px dashed ${isRecording?C.coral:C.border}`,borderRadius:14,padding:"22px 16px",textAlign:"center",transition:"border-color .2s"}},
              !isRecording&&!recordedLabel
                ? e(Fragment,null,
                    e("button",{onClick:startMicRec,style:{width:56,height:56,borderRadius:"50%",border:"none",cursor:"pointer",background:C.coral,display:"flex",alignItems:"center",justifyContent:"center",margin:"0 auto 12px",boxShadow:`0 0 0 5px ${C.coralSoft}`}},e(SvgMic,{size:22,color:C.bg})),
                    e("div",{style:{fontFamily:FD,fontWeight:600,color:C.text,fontSize:14}},"Tap to record your answer"),
                    e("div",{style:{fontFamily:FB,color:C.muted,fontSize:12,marginTop:4}},"Speak naturally — your audio will be transcribed")
                  )
                : isRecording
                  ? e(Fragment,null,
                      e("div",{style:{display:"flex",justifyContent:"center",alignItems:"center",gap:8,marginBottom:10}},
                        e("span",{style:{width:9,height:9,borderRadius:"50%",background:C.coral,animation:"wfPulse 1s ease-in-out infinite"}}),
                        e("span",{style:{fontFamily:FM,fontSize:13,color:C.coral}},`Recording… ${fmtTime(recordSeconds)}`)
                      ),
                      e(Waveform,{count:24,height:36,animated:true}),
                      e("button",{onClick:stopMicRec,style:{...pBtn,width:"100%",marginTop:14}},"Stop recording")
                    )
                  : e(Fragment,null,
                      e(SvgCheck,{size:24,color:C.mint}),
                      e("div",{style:{fontFamily:FD,fontWeight:600,color:C.text,fontSize:14,margin:"8px 0 4px"}},recordedLabel),
                      e("div",{style:{fontFamily:FB,color:C.muted,fontSize:12,marginBottom:12}},"Recording ready — submit when happy with it."),
                      e("button",{onClick:()=>{resetRec();setAnswer("");},style:{...sBtn,fontSize:12,padding:"6px 14px"}},"Re-record")
                    ),
              micError&&e("div",{style:{marginTop:12,background:C.coralSoft,border:`1px solid ${C.coral}55`,borderRadius:8,padding:"8px 12px",fontFamily:FB,fontSize:12,color:C.text}}),micError
            ),
        e("div",{style:{display:"flex",gap:10,marginTop:14}},
          e("button",{onClick:submitAnswer,disabled:!answer.trim(),style:{...pBtn,flex:1,opacity:!answer.trim()?0.55:1}},
            idx+1<total?e(Fragment,null,"Next question ",e(SvgArrow,{size:15,color:C.bg})):e(Fragment,null,"Finish & evaluate ",e(SvgArrow,{size:15,color:C.bg}))
          )
        )
      ),
      rawLog.length>0&&e("div",{style:{display:"flex",flexDirection:"column",gap:6}},
        rawLog.map((entry,i)=>e("div",{key:i,style:{display:"flex",alignItems:"center",gap:10,padding:"8px 12px",background:C.bg2,borderRadius:10,border:`1px solid ${C.border}`}},
          e(SvgCheck,{size:13,color:C.mint}),
          e("span",{style:{fontFamily:FB,fontSize:12.5,color:C.muted,flex:1,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}},`Q${i+1}: ${entry.question}`),
          e("span",{style:{fontFamily:FM,fontSize:11.5,color:C.mint,flexShrink:0}},"answered")
        ))
      )
    ));
  }

  /* Evaluating phase */
  if(phase==="evaluating")return wrapHidden(e("div",{className:"cc-fade",style:{maxWidth:580,margin:"60px auto",padding:"0 20px",textAlign:"center"}},
    e("div",{style:{fontFamily:FD,fontWeight:700,fontSize:22,color:C.text,marginBottom:10}},"Evaluating your answers…"),
    e("div",{style:{fontFamily:FB,fontSize:13.5,color:C.muted,marginBottom:28}},`Scoring all ${rawLog.length} answers. This takes a few seconds.`),
    e(Waveform,{count:28,height:44,animated:true}),
    e("div",{style:{margin:"22px 0 8px",height:8,borderRadius:4,background:C.bg2,overflow:"hidden"}},
      e("div",{style:{width:`${evalProgress}%`,height:"100%",borderRadius:4,background:`linear-gradient(90deg,${C.coral},${C.purple},${C.mint})`,transition:"width .3s ease"}})
    ),
    e("div",{style:{fontFamily:FM,fontSize:12,color:C.muted}},
      evalProgress<100?`Evaluating Q${Math.ceil((evalProgress/100)*rawLog.length)} of ${rawLog.length}…`:"Finalising…"
    )
  ));

  /* Results phase */
  const avgScore=Math.round(scoredLog.reduce((a,e2)=>a+e2.score,0)/Math.max(scoredLog.length,1));
  const reportsWithData=scoredLog.map(e2=>e2.report).filter(r=>r&&Object.keys(r).length>0);
  const aggGrammar=reportsWithData.length?Math.round(reportsWithData.reduce((a,r)=>a+(r.grammar_score||0),0)/reportsWithData.length):null;
  const aggFluency=reportsWithData.length?Math.round(reportsWithData.reduce((a,r)=>a+(r.fluency_score||0),0)/reportsWithData.length):null;
  const aggFillers=reportsWithData.length?Math.round(reportsWithData.reduce((a,r)=>a+(r.filler_word_count||0),0)):null;
  const aggFiller_sc=reportsWithData.length?Math.round(reportsWithData.reduce((a,r)=>a+(r.filler_score||0),0)/reportsWithData.length):null;
  const aggRelevancy=reportsWithData.length?Math.round(reportsWithData.reduce((a,r)=>a+(r.answer_relevancy_score||0),0)/reportsWithData.length):null;
  const WEEK_COLORS=[C.coral,C.purple,C.mint];
  const allNotes=[],allDrills=[];
  scoredLog.forEach(e2=>{if(e2.coachingPlan){(e2.coachingPlan.notes||[]).forEach(n=>{if(!allNotes.includes(n))allNotes.push(n);});(e2.coachingPlan.drills||[]).forEach(d=>{if(!allDrills.find(x=>x.title===d.title))allDrills.push(d);});}});
  const dims=[{score:aggGrammar,label:"Grammar & sentence structure"},{score:aggFluency,label:"Fluency & pacing"},{score:aggFiller_sc,label:"Filler word reduction"},{score:aggRelevancy,label:"Answer relevancy"}].filter(d=>d.score!==null).sort((a,b)=>a.score-b.score);
  const weakest=dims.slice(0,2).map(d=>d.label);
  const weeks=[
    {label:"Week 1 — Foundation",focus:weakest[0]||"Overall communication",tasks:[allDrills[0]||{title:"Record & replay",desc:"Record 3 answers, play them back and note every filler or grammar slip."},{title:"Daily 5-min drill",desc:"Pick one question from today's interview, answer it again cleanly, aiming for zero fillers."},{title:"STAR framework",desc:"Re-write your weakest answer using Situation → Task → Action → Result structure."}]},
    {label:"Week 2 — Refinement",focus:weakest[1]||"Delivery consistency",tasks:[allDrills[1]||{title:"Timed answers",desc:"Answer each question in under 90 seconds. Use a stopwatch."},{title:"Peer mock",desc:"Do a full mock interview with a friend. Focus on the week 1 weak area."},{title:"Grammar review",desc:"Read your typed answers aloud, fix every grammar slip, then re-speak from memory."}]},
    {label:"Week 3 — Consolidation",focus:"Full interview simulation",tasks:[{title:"Full mock interview",desc:"Complete another CommCoach mock interview and compare scores to today's baseline."},allDrills[2]||{title:"Pace control",desc:"Re-record your fastest answer at a deliberate 130 WPM. Pause at every comma."},{title:"Confidence build",desc:"Answer 2 questions in front of a mirror or camera. Hold eye contact with your reflection."}]},
  ];

  /* ── Restart confirmation modal ── */
  const restartModal = confirmRestart && e("div",{style:{position:"fixed",inset:0,background:"rgba(0,0,0,0.65)",zIndex:9999,display:"flex",alignItems:"center",justifyContent:"center",padding:20}},
    e("div",{style:{background:C.card,border:`1px solid ${C.border}`,borderRadius:18,padding:28,maxWidth:420,width:"100%",textAlign:"center"}},
      e("div",{style:{fontFamily:FD,fontWeight:700,fontSize:18,color:C.text,marginBottom:10}},"Restart Interview?"),
      e("div",{style:{fontFamily:FB,fontSize:13.5,color:C.muted,marginBottom:24,lineHeight:1.6}},"Are you sure you want to restart? Existing interview results will be permanently lost."),
      e("div",{style:{display:"flex",gap:12,justifyContent:"center"}},
        e("button",{onClick:()=>setConfirmRestart(false),style:{...sBtn,fontSize:13,padding:"10px 22px"}},"Cancel"),
        e("button",{onClick:_doRestart,style:{...pBtn,fontSize:13,padding:"10px 22px",background:C.coral}},"Yes, restart")
      )
    )
  );

  return wrapHidden(e("div",{className:"cc-fade",style:{maxWidth:760,margin:"0 auto",padding:"0 20px 60px"}},
    restartModal,
    e(STitle,{text:"Interview report",Icon:SvgCheck}),
    /* Overall score */
    e("div",{style:{background:C.card,border:`1px solid ${C.border}`,borderRadius:18,padding:22,display:"flex",alignItems:"center",gap:20,marginBottom:20,flexWrap:"wrap"}},
      e(ScoreRing,{value:avgScore,size:100}),
      e("div",{style:{flex:1,minWidth:180}},
        e("div",{style:{fontFamily:FD,fontWeight:700,fontSize:18,color:C.text}},"Overall score"),
        e("div",{style:{fontFamily:FB,fontSize:13,color:C.muted,marginBottom:6}},`${scoredLog.length} questions · ${interviewType}`),
        e("div",{style:{fontFamily:FB,fontSize:13,color:avgScore>=70?C.mint:avgScore>=50?C.yellow:C.coral}},avgScore>=70?"Strong overall performance.":avgScore>=50?"Room to grow — review the breakdown below.":"Focus on the weak areas in each answer.")
      ),
      reportsWithData.length>0&&e("div",{style:{display:"flex",gap:8,flexWrap:"wrap"}},
        aggGrammar!==null&&e("div",{style:{textAlign:"center",background:C.bg2,borderRadius:12,padding:"10px 16px",minWidth:70}},e("div",{style:{fontFamily:FM,fontWeight:700,fontSize:18,color:colorForScore(aggGrammar)}},aggGrammar),e("div",{style:{fontFamily:FB,fontSize:11,color:C.muted,marginTop:2}},"Grammar")),
        aggFluency!==null&&e("div",{style:{textAlign:"center",background:C.bg2,borderRadius:12,padding:"10px 16px",minWidth:70}},e("div",{style:{fontFamily:FM,fontWeight:700,fontSize:18,color:colorForScore(aggFluency)}},aggFluency),e("div",{style:{fontFamily:FB,fontSize:11,color:C.muted,marginTop:2}},"Fluency")),
        aggRelevancy!==null&&e("div",{style:{textAlign:"center",background:C.bg2,borderRadius:12,padding:"10px 16px",minWidth:70}},e("div",{style:{fontFamily:FM,fontWeight:700,fontSize:18,color:colorForScore(aggRelevancy)}},aggRelevancy),e("div",{style:{fontFamily:FB,fontSize:11,color:C.muted,marginTop:2}},"Relevancy")),
        aggFillers!==null&&e("div",{style:{textAlign:"center",background:C.bg2,borderRadius:12,padding:"10px 16px",minWidth:70}},e("div",{style:{fontFamily:FM,fontWeight:700,fontSize:18,color:aggFillers===0?C.mint:aggFillers<5?C.yellow:C.coral}},aggFillers),e("div",{style:{fontFamily:FB,fontSize:11,color:C.muted,marginTop:2}},"Fillers"))
      )
    ),
    /* Score formula breakdown */
    e("div",{style:{background:C.bg2,border:`1px solid ${C.border}`,borderRadius:12,padding:"10px 16px",marginBottom:20,display:"flex",gap:12,flexWrap:"wrap",alignItems:"center"}},
      e("span",{style:{fontFamily:FM,fontSize:10.5,color:C.muted,textTransform:"uppercase",letterSpacing:0.5,marginRight:4}},"Score formula:"),
      [{label:"Relevance",pct:"40%",color:C.coral},{label:"Completeness",pct:"25%",color:C.purple},{label:"Accuracy",pct:"20%",color:C.yellow},{label:"Communication",pct:"10%",color:C.mint},{label:"Grammar",pct:"5%",color:C.fillerTone}].map(({label,pct,color})=>
        e("span",{key:label,style:{fontFamily:FB,fontSize:12,color:C.muted}},e("span",{style:{color,fontWeight:700}},pct)," ",label)
      )
    ),
    /* Per-question breakdown */
    e(STitle,{text:"Question-by-question breakdown",Icon:SvgMsg}),
    e("div",{style:{display:"flex",flexDirection:"column",gap:14,marginBottom:28}},
      scoredLog.map((entry,i)=>{
        const r=entry.report||{};
        const rel=r.answer_relevancy_score||0;
        const isWeak=_isWeakAnswer(entry.answer);
        /* Status rules: weak answers or score≤20 → always Incorrect */
        const status = (isWeak||entry.score<=20||rel<=20) ? "Incorrect"
          : entry.score >= 75 ? "Correct"
          : entry.score >= 45 ? "Partially Correct"
          : "Incorrect";
        const statusColor = status==="Correct" ? C.mint : status==="Partially Correct" ? C.yellow : C.coral;
        const statusBg = status==="Correct" ? C.mintSoft : status==="Partially Correct" ? C.yellow+"11" : C.coralSoft;

        /* Reasoning: why this score was given */
        const reasoning = _buildReasoning(entry.question, entry.answer, entry.score, r, isWeak);
        /* Knowledge gaps */
        const knowledgeGaps = _buildKnowledgeGaps(entry.question, entry.answer, entry.score, r);
        const whyWeakPoints = getWhyWeak(entry.question, entry.score, r);
        const expectedAnswer = getExpectedAnswer(entry.question);
        const sampleAnswer = _buildSampleAnswer(entry.question);
        const suggList = getSuggestions(entry.question);

        return e("div",{key:i,style:{background:C.bg2,border:`1px solid ${C.border}`,borderRadius:14,padding:18,marginBottom:16}},
          /* Q header + score */
          e("div",{style:{display:"flex",alignItems:"flex-start",gap:10,marginBottom:12}},
            e("span",{style:{fontFamily:FM,fontSize:11,color:C.muted,flexShrink:0,marginTop:3}},`Q${i+1}`),
            e("div",{style:{fontFamily:FD,fontWeight:600,fontSize:14,color:C.text,flex:1,lineHeight:1.4}},entry.question),
            e("span",{style:{fontFamily:FM,fontWeight:700,fontSize:17,color:colorForScore(entry.score),flexShrink:0}},`${entry.score}/100`)
          ),
          e("div",{style:{height:5,borderRadius:3,background:C.card,overflow:"hidden",marginBottom:16}},e("div",{style:{width:`${entry.score}%`,height:"100%",background:colorForScore(entry.score),borderRadius:3,transition:"width .4s ease"}})),

          /* Candidate Answer */
          e("div",{style:{marginBottom:14}},
            e("div",{style:{fontFamily:FM,fontSize:11,color:C.muted,textTransform:"uppercase",letterSpacing:0.5,marginBottom:4}},"Candidate Answer"),
            e("div",{style:{padding:"10px 12px",background:C.card,border:`1px solid ${C.border}`,borderRadius:8,fontFamily:FB,fontSize:13,color:C.text,lineHeight:1.6,whiteSpace:"pre-wrap"}},entry.answer)
          ),

          /* Result badge */
          e("div",{style:{marginBottom:14,display:"flex",alignItems:"center",gap:8}},
            e("span",{style:{fontFamily:FM,fontSize:11,color:C.muted,textTransform:"uppercase",letterSpacing:0.5}},"Result:"),
            e("span",{style:{fontFamily:FM,fontWeight:700,fontSize:12,color:statusColor,background:statusBg,padding:"3px 10px",borderRadius:999,border:`1px solid ${statusColor}44`}},status)
          ),

          /* Reasoning */
          e("div",{style:{marginBottom:14}},
            e("div",{style:{fontFamily:FM,fontSize:11,color:C.muted,textTransform:"uppercase",letterSpacing:0.5,marginBottom:6}},"Reasoning"),
            e("div",{style:{display:"flex",flexDirection:"column",gap:5}},
              reasoning.map((pt,pi)=>e("div",{key:pi,style:{display:"flex",gap:8,alignItems:"flex-start"}},
                e("span",{style:{color:statusColor,flexShrink:0,fontWeight:700,fontSize:13,lineHeight:1.2}},pi+1+"."),
                e("span",{style:{fontFamily:FB,fontSize:12.5,color:C.text,lineHeight:1.45}},pt)
              ))
            )
          ),

          /* Knowledge Gaps */
          knowledgeGaps.length>0&&e("div",{style:{marginBottom:14}},
            e("div",{style:{fontFamily:FM,fontSize:11,color:C.muted,textTransform:"uppercase",letterSpacing:0.5,marginBottom:6}},"Knowledge Gaps"),
            e("div",{style:{display:"flex",flexDirection:"column",gap:5}},
              knowledgeGaps.map((gap,gi)=>e("div",{key:gi,style:{display:"flex",gap:8,alignItems:"flex-start",padding:"7px 10px",background:C.coralSoft,borderRadius:8,border:`1px solid ${C.coral}33`}},
                e("span",{style:{color:C.coral,flexShrink:0,fontWeight:700,fontSize:14,lineHeight:1}},"\u26A0"),
                e("span",{style:{fontFamily:FB,fontSize:12.5,color:C.text,lineHeight:1.45}},gap)
              ))
            )
          ),

          /* Expected Answer */
          e("div",{style:{marginBottom:14}},
            e("div",{style:{fontFamily:FM,fontSize:11,color:C.muted,textTransform:"uppercase",letterSpacing:0.5,marginBottom:4}},"Expected Answer"),
            e("div",{style:{padding:"10px 12px",background:C.card,border:`1px solid ${C.border}`,borderRadius:8,fontFamily:FB,fontSize:13,color:C.muted,fontStyle:"italic",lineHeight:1.6}},expectedAnswer)
          ),

          /* Sample High-Scoring Answer (90+) */
          e("div",{style:{marginBottom:14}},
            e("div",{style:{display:"flex",alignItems:"center",gap:6,marginBottom:4}},
              e("div",{style:{fontFamily:FM,fontSize:11,color:C.mint,textTransform:"uppercase",letterSpacing:0.5}},"Sample High-Scoring Answer"),
              e("span",{style:{fontFamily:FM,fontSize:10,color:C.mint,background:C.mintSoft,padding:"2px 7px",borderRadius:999,border:`1px solid ${C.mint}44`}},"90+ score")
            ),
            e("div",{style:{padding:"10px 12px",background:C.mintSoft,border:`1px solid ${C.mint}44`,borderRadius:8,fontFamily:FB,fontSize:13,color:C.text,lineHeight:1.65}},sampleAnswer)
          ),

          /* Improvement Tips */
          e("div",null,
            e("div",{style:{fontFamily:FM,fontSize:11,color:C.muted,textTransform:"uppercase",letterSpacing:0.5,marginBottom:6}},"Improvement Tips"),
            e("div",{style:{display:"flex",flexDirection:"column",gap:6}},
              suggList.map((sugg,si)=>e("div",{key:si,style:{display:"flex",gap:8,alignItems:"flex-start"}},
                e("span",{style:{color:C.purple,fontWeight:700,fontSize:14,lineHeight:1,marginTop:-1}},"\u2022"),
                e("span",{style:{fontFamily:FB,fontSize:12.5,color:C.muted,lineHeight:1.4}},sugg)
              ))
            )
          )
        );
      })
    ),
    /* 3-week plan */
    e(STitle,{text:"Your 3-week coaching plan",Icon:SvgSparkle}),
    allNotes.length>0&&e("div",{style:{background:C.purpleSoft,border:`1px solid ${C.purple}55`,borderRadius:12,padding:"12px 16px",marginBottom:16}},
      e("div",{style:{fontFamily:FM,fontSize:11,color:C.purple,marginBottom:8,textTransform:"uppercase",letterSpacing:0.5}},"Key coaching notes for this session"),
      e("div",{style:{display:"flex",flexDirection:"column",gap:6}},allNotes.slice(0,4).map((note,ni)=>e("div",{key:ni,style:{display:"flex",gap:8,alignItems:"flex-start"}},e(SvgCheck,{size:13,color:C.purple}),e("span",{style:{fontFamily:FB,fontSize:13,color:C.text,lineHeight:1.5}},note))))
    ),
    e("div",{style:{display:"flex",flexDirection:"column",gap:14,marginBottom:28}},
      weeks.map((week,wi)=>e("div",{key:wi,style:{background:C.card,border:`1px solid ${C.border}`,borderLeft:`4px solid ${WEEK_COLORS[wi]}`,borderRadius:14,padding:18}},
        e("div",{style:{display:"flex",alignItems:"center",gap:10,marginBottom:12}},
          e("div",{style:{width:28,height:28,borderRadius:8,background:`${WEEK_COLORS[wi]}22`,display:"flex",alignItems:"center",justifyContent:"center",fontFamily:FM,fontWeight:700,fontSize:12,color:WEEK_COLORS[wi]}},`W${wi+1}`),
          e("div",null,e("div",{style:{fontFamily:FD,fontWeight:700,fontSize:14,color:C.text}},week.label),e("div",{style:{fontFamily:FB,fontSize:12,color:C.muted}},`Focus: ${week.focus}`))
        ),
        e("div",{style:{display:"flex",flexDirection:"column",gap:8}},
          week.tasks.map((task,ti)=>e("div",{key:ti,style:{display:"flex",gap:12,alignItems:"flex-start",background:C.bg2,borderRadius:10,padding:"10px 14px"}},
            e("div",{style:{width:22,height:22,borderRadius:6,flexShrink:0,marginTop:1,background:`${WEEK_COLORS[wi]}22`,display:"flex",alignItems:"center",justifyContent:"center",fontFamily:FM,fontSize:10,color:WEEK_COLORS[wi],fontWeight:700}},ti+1),
            e("div",null,e("div",{style:{fontFamily:FD,fontWeight:600,fontSize:13,color:WEEK_COLORS[wi],marginBottom:3}},task.title),e("div",{style:{fontFamily:FB,fontSize:12.5,color:C.muted,lineHeight:1.55}},task.desc))
          ))
        )
      ))
    ),
    e("div",{style:{display:"flex",gap:12,flexWrap:"wrap"}},
      e("button",{onClick:finishInterview,style:pBtn},"Save & view dashboard ",e(SvgArrow,{size:15,color:C.bg})),
      e("button",{onClick:handleRestart,style:sBtn},"Restart Interview")
    )
  ));
}

/* ── PAGE 4: DashboardPage ── */
function StatCard({Icon,label,value,color}){
  return e("div",{style:{background:C.card,border:`1px solid ${C.border}`,borderRadius:14,padding:16}},
    e("div",{style:{display:"flex",alignItems:"center",gap:8,marginBottom:10}},
      e("div",{style:{width:26,height:26,borderRadius:8,background:`${color}22`,display:"flex",alignItems:"center",justifyContent:"center"}},e(Icon,{size:14,color})),
      e("span",{style:{fontFamily:FM,fontSize:10.5,color:C.muted,textTransform:"uppercase",letterSpacing:0.5}},label)
    ),
    e("div",{style:{fontFamily:FM,fontWeight:700,fontSize:22,color:C.text}},value)
  );
}

function computeBadges(history,interviewSessions){
  const badges=[];
  if(history.length>=1)badges.push("🎙️ First Session");
  if(history.length>=5)badges.push("🔥 Consistent Practicer");
  const last=history[history.length-1];
  if(last&&last.fillers<15)badges.push("✂️ Filler Buster");
  if(last&&last.confidence>=65)badges.push("💪 Confident Speaker");
  if(last&&last.grammar>=75)badges.push("📘 Grammar Pro");
  if(last&&(last.relevancy||0)>=70)badges.push("🎯 On-Point Answers");
  if(interviewSessions.some(s=>s.avgScore>=70))badges.push("🏆 Interview Ready");
  return badges;
}

function DashboardPage({history,interviewSessions,onNewSession,onReset,userId="default_user",loading=false}){
  const [visible,setVisible]=useState({fluency:true,grammar:true,pronunciation:true,confidence:true,relevancy:true});
  const [confirmReset,setConfirmReset]=useState(false);
  const [resetting,setResetting]=useState(false);
  const toggle=k=>setVisible(v=>({...v,[k]:!v[k]}));
  const lineDefs=[{key:"fluency",color:C.coral,label:"Fluency"},{key:"grammar",color:C.yellow,label:"Grammar"},{key:"pronunciation",color:C.mint,label:"Pronunciation"},{key:"confidence",color:C.purple,label:"Confidence"},{key:"relevancy",color:C.fillerTone,label:"Relevancy"}];

  const n=history.length;
  const avgOverall=n?Math.round(history.reduce((a,s)=>a+(s.overall||0),0)/n):0;
  const avgGrammar=n?Math.round(history.reduce((a,s)=>a+(s.grammar||0),0)/n):0;
  const avgRelevancy=n?Math.round(history.reduce((a,s)=>a+(s.relevancy||0),0)/n):0;

  const handleReset=async()=>{
    setResetting(true);
    try{await fetch(`${API_URL}/sessions/reset/${userId}`,{method:"DELETE"});}catch(_){}
    setResetting(false);setConfirmReset(false);
    if(onReset)onReset();
  };

  /* Loading skeleton */
  if(loading)return e("div",{className:"cc-fade",style:{maxWidth:900,margin:"0 auto",padding:"0 20px 60px"}},
    e("div",{style:{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(140px,1fr))",gap:12,marginBottom:24}},[1,2,3,4,5,6,7].map(i=>e("div",{key:i,style:{background:C.card,border:`1px solid ${C.border}`,borderRadius:14,padding:16}},e(Sk,{w:"40%",h:10,mb:12}),e(Sk,{w:"60%",h:22})))),
    e("div",{style:{marginBottom:8}},e(Sk,{h:180})),
    e(SkCard,null),e(SkCard,null),e(SkCard,null)
  );

  /* Empty state */
  if(n===0&&interviewSessions.length===0)return e("div",{className:"cc-fade",style:{maxWidth:600,margin:"80px auto",padding:"0 20px",textAlign:"center"}},
    e("div",{style:{width:64,height:64,borderRadius:20,background:C.coralSoft,border:`1px solid ${C.coral}55`,display:"flex",alignItems:"center",justifyContent:"center",margin:"0 auto 20px"}},e(SvgMic,{size:28,color:C.coral})),
    e("h2",{style:{fontFamily:FD,fontWeight:700,fontSize:26,color:C.text,marginBottom:12}},"No sessions yet"),
    e("p",{style:{fontFamily:FB,fontSize:14,color:C.muted,marginBottom:28,lineHeight:1.7,maxWidth:400,margin:"0 auto 28px"}},"Complete an Assessment or a Mock Interview to start tracking your communication progress here."),
    e("div",{style:{display:"flex",gap:12,justifyContent:"center",flexWrap:"wrap"}},
      e("button",{onClick:onNewSession,style:pBtn},e(SvgMic,{size:14,color:C.bg})," Analyze audio"),
      e("button",{onClick:()=>{/* signal to go to interview tab */if(typeof onNewSession==="function")onNewSession();},style:sBtn},e(SvgUsers,{size:14})," Mock interview")
    )
  );

  const byType=INTERVIEW_TYPES.map(t=>{const rows=interviewSessions.filter(s=>s.type===t);return{type:t,avgScore:rows.length?Math.round(rows.reduce((a,s)=>a+s.avgScore,0)/rows.length):0};}).filter(r=>r.avgScore>0);
  const badges=computeBadges(history,interviewSessions);

  return e("div",{className:"cc-fade",style:{maxWidth:900,margin:"0 auto",padding:"0 20px 60px"}},
    /* Confirm reset modal */
    confirmReset&&e("div",{role:"dialog","aria-modal":"true","aria-labelledby":"rst-dlg-title",onKeyDown:ev=>ev.key==="Escape"&&setConfirmReset(false),style:{position:"fixed",inset:0,background:"rgba(0,0,0,0.55)",zIndex:100,display:"flex",alignItems:"center",justifyContent:"center",padding:20}},
      e("div",{className:"cc-fade",style:{background:C.card,border:`1px solid ${C.border}`,borderRadius:18,padding:28,maxWidth:400,width:"100%",textAlign:"center"}},
        e("div",{id:"rst-dlg-title",style:{fontFamily:FD,fontWeight:700,fontSize:18,color:C.text,marginBottom:10}},"Reset all session history?"),
        e("div",{style:{fontFamily:FB,fontSize:13.5,color:C.muted,marginBottom:24,lineHeight:1.6}},"This permanently deletes all your sessions, scores, and progress from the database. Your current page session will also be cleared. This cannot be undone."),
        e("div",{style:{display:"flex",gap:10,justifyContent:"center"}},
          e("button",{onClick:handleReset,disabled:resetting,style:{...pBtn,background:C.coral,opacity:resetting?0.6:1}},resetting?"Resetting…":"Yes, reset everything"),
          e("button",{onClick:()=>setConfirmReset(false),style:sBtn},"Cancel")
        )
      )
    ),
    /* Header */
    e("div",{style:{display:"flex",justifyContent:"space-between",alignItems:"center",flexWrap:"wrap",gap:12,marginBottom:22}},
      e("h2",{style:{fontFamily:FD,fontWeight:700,fontSize:24,color:C.text,margin:0}},"Your progress"),
      e("div",{style:{display:"flex",gap:8,flexWrap:"wrap"}},
        e("button",{onClick:onNewSession,style:pBtn},e(SvgMic,{size:14,color:C.bg})," Start new session"),
        e("button",{onClick:()=>setConfirmReset(true),style:{...gBtn,color:C.coral,border:`1px solid ${C.coral}`}},e(SvgRotate,{size:13})," Reset history")
      )
    ),
    /* Stat cards */
    e("div",{style:{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(140px,1fr))",gap:12,marginBottom:24}},
      e(StatCard,{Icon:SvgFileAudio,label:"Sessions",value:n,color:C.coral}),
      e(StatCard,{Icon:SvgFlame,label:"Streak",value:`${computeStreak([...history,...interviewSessions.map(s=>({date:s.date||"Today"}))])} days`,color:C.yellow}),
      e(StatCard,{Icon:SvgTrend,label:"Avg score",value:avgOverall||"—",color:C.mint}),
      e(StatCard,{Icon:SvgBook,label:"Avg grammar",value:avgGrammar||"—",color:C.purple}),
      e(StatCard,{Icon:SvgGauge,label:"Avg relevancy",value:avgRelevancy||"—",color:C.fillerTone}),
      e(StatCard,{Icon:SvgUsers,label:"Mock interviews",value:interviewSessions.length,color:C.coral}),
      e(StatCard,{Icon:SvgAward,label:"Badges",value:badges.length,color:C.yellow})
    ),
    /* Charts — only shown when there's data */
    n>0&&e(Fragment,null,
      e("div",{style:{background:C.card,border:`1px solid ${C.border}`,borderRadius:20,padding:"20px 20px 8px",marginBottom:24}},
        e("div",{style:{display:"flex",justifyContent:"space-between",alignItems:"center",flexWrap:"wrap",gap:10,marginBottom:6}},
          e("span",{style:{fontFamily:FD,fontWeight:600,fontSize:15,color:C.text}},"Progress trends"),
          e("div",{style:{display:"flex",gap:8,flexWrap:"wrap"}},
            lineDefs.map(l=>e("button",{key:l.key,onClick:()=>toggle(l.key),style:{display:"flex",alignItems:"center",gap:6,fontFamily:FB,fontSize:12,border:`1px solid ${visible[l.key]?l.color:C.border}`,color:visible[l.key]?l.color:C.muted,background:visible[l.key]?`${l.color}18`:"transparent",borderRadius:999,padding:"5px 11px",cursor:"pointer"}},e("span",{style:{width:7,height:7,borderRadius:"50%",background:l.color}}),l.label))
          )
        ),
        e("div",{style:{height:240}},e(ResponsiveContainer,{width:"100%",height:"100%"},
          e(LineChart,{data:history,margin:{top:10,right:10,left:-20,bottom:0}},
            e(CartesianGrid,{stroke:C.border,strokeDasharray:"3 3",vertical:false}),
            e(XAxis,{dataKey:"date",stroke:C.muted,tick:{fontFamily:FM,fontSize:11},tickLine:false,axisLine:{stroke:C.border}}),
            e(YAxis,{stroke:C.muted,tick:{fontFamily:FM,fontSize:11},tickLine:false,axisLine:false,domain:[0,100]}),
            e(Tooltip,{contentStyle:{background:C.bg2,border:`1px solid ${C.border}`,borderRadius:10,fontFamily:FB,fontSize:12},labelStyle:{color:C.text,fontFamily:FM}}),
            lineDefs.map(l=>visible[l.key]&&e(Line,{key:l.key,type:"monotone",dataKey:l.key,stroke:l.color,strokeWidth:2.5,dot:{r:3,fill:l.color},activeDot:{r:5}}))
          )
        ))
      ),
      e("div",{style:{background:C.card,border:`1px solid ${C.border}`,borderRadius:20,padding:"20px 20px 8px",marginBottom:24}},
        e("span",{style:{fontFamily:FD,fontWeight:600,fontSize:15,color:C.text}},"Confidence trend"),
        e("div",{style:{height:180,marginTop:6}},e(ResponsiveContainer,{width:"100%",height:"100%"},
          e(AreaChart,{data:history,margin:{top:10,right:10,left:-20,bottom:0}},
            e("defs",null,e("linearGradient",{id:"confGrad",x1:"0",y1:"0",x2:"0",y2:"1"},e("stop",{offset:"0%",stopColor:C.coral,stopOpacity:0.4}),e("stop",{offset:"100%",stopColor:C.coral,stopOpacity:0.02}))),
            e(CartesianGrid,{stroke:C.border,strokeDasharray:"3 3",vertical:false}),
            e(XAxis,{dataKey:"date",stroke:C.muted,tick:{fontFamily:FM,fontSize:11},tickLine:false,axisLine:{stroke:C.border}}),
            e(YAxis,{stroke:C.muted,tick:{fontFamily:FM,fontSize:11},tickLine:false,axisLine:false,domain:[0,100]}),
            e(Tooltip,{contentStyle:{background:C.bg2,border:`1px solid ${C.border}`,borderRadius:10,fontFamily:FB,fontSize:12},labelStyle:{color:C.text,fontFamily:FM}}),
            e(Area,{type:"monotone",dataKey:"confidence",stroke:C.coral,strokeWidth:2.5,fill:"url(#confGrad)"})
          )
        ))
      ),
      byType.length>0&&e("div",{style:{background:C.card,border:`1px solid ${C.border}`,borderRadius:20,padding:"20px 20px 8px",marginBottom:24}},
        e("span",{style:{fontFamily:FD,fontWeight:600,fontSize:15,color:C.text}},"Interview analytics — avg score by type"),
        e("div",{style:{height:200,marginTop:6}},e(ResponsiveContainer,{width:"100%",height:"100%"},
          e(BarChart,{data:byType,margin:{top:10,right:10,left:-20,bottom:0}},
            e(CartesianGrid,{stroke:C.border,strokeDasharray:"3 3",vertical:false}),
            e(XAxis,{dataKey:"type",stroke:C.muted,tick:{fontFamily:FM,fontSize:11},tickLine:false,axisLine:{stroke:C.border}}),
            e(YAxis,{stroke:C.muted,tick:{fontFamily:FM,fontSize:11},tickLine:false,axisLine:false,domain:[0,100]}),
            e(Tooltip,{contentStyle:{background:C.bg2,border:`1px solid ${C.border}`,borderRadius:10,fontFamily:FB,fontSize:12},labelStyle:{color:C.text,fontFamily:FM}}),
            e(Bar,{dataKey:"avgScore",fill:C.mint,radius:[6,6,0,0]})
          )
        ))
      )
    ),
    /* Achievements */
    e(STitle,{text:"Achievements",Icon:SvgAward}),
    e("div",{style:{marginBottom:24}},
      badges.length
        ?badges.map(b=>e("span",{key:b,style:{display:"inline-block",background:C.mintSoft,color:C.mint,border:`1px solid ${C.mint}55`,borderRadius:999,padding:"6px 14px",margin:"0 8px 8px 0",fontSize:13,fontFamily:FB}},b))
        :e("span",{style:{fontFamily:FB,color:C.muted,fontSize:13}},"Complete a session to start earning badges.")
    ),
    /* Session history */
    e(STitle,{text:"Session history",Icon:SvgFileAudio}),
    e("div",{style:{display:"flex",flexDirection:"column",gap:8}},
      [...history].reverse().map((s,i)=>e("div",{key:i,style:{display:"flex",alignItems:"center",justifyContent:"space-between",background:C.card,border:`1px solid ${C.border}`,borderRadius:12,padding:"12px 16px",flexWrap:"wrap",gap:8}},
        e("div",{style:{display:"flex",alignItems:"center",gap:12}},
          e("div",{style:{width:34,height:34,borderRadius:10,background:C.bg2,display:"flex",alignItems:"center",justifyContent:"center"}},e(Waveform,{count:5,height:16,animated:false})),
          e("div",null,
            e("div",{style:{fontFamily:FD,fontWeight:600,fontSize:13.5,color:C.text}},`${s.session} · ${s.date}`),
            e("div",{style:{fontFamily:FB,fontSize:11.5,color:C.muted}},`${s.practiceMode} · ${s.interviewType}`)
          )
        ),
        e("span",{style:{fontFamily:FM,fontWeight:700,fontSize:14,color:colorForScore(s.overall)}},s.overall||"—")
      ))
    )
  );
}

/* ── App root ── */
function CommCoachApp(){
  const [page,setPage]=useState(() => {
    const saved = localStorage.getItem("cc_page");
    return saved ? parseInt(saved, 10) : 1;
  });
  const [resume,setResume]=useState(() => {
    const saved = localStorage.getItem("cc_resume");
    return saved ? JSON.parse(saved) : null;
  });
  const [history,setHistory]=useState([]);
  const [interviewSessions,setInterviewSessions]=useState(()=>{
    const saved=localStorage.getItem("cc_interviewSessions");
    return saved?JSON.parse(saved):[];
  });
  const [currentSession,setCurrentSession]=useState(()=>{
    const saved=localStorage.getItem("cc_currentSession");
    return saved?JSON.parse(saved):null;
  });
  const [generatedQuestions,setGeneratedQuestions]=useState(()=>{
    const saved=localStorage.getItem("cc_generatedQuestions");
    if(saved)return JSON.parse(saved);
    return [
      "Tell me about yourself and how your experience aligns with this role.",
      "Walk me through a technical project you're most proud of.",
      "Tell me about a time you disagreed with a teammate. How did you handle it?",
      "How do you prioritize when everything feels urgent?"
    ];
  });
  const [assessmentUploading,setAssessmentUploading]=useState(false);
  const [sessionsLoading,setSessionsLoading]=useState(true);
  // Persistent user identity via localStorage
  const [userId,setUserId]=useState(getStoredUserId);
  const [editingUser,setEditingUser]=useState(false);
  const [userDraft,setUserDraft]=useState("");

  /* ── Lifted MockInterviewPage state — survives tab changes ── */
  const [ivPhase,setIvPhase]=useState("setup");
  const [ivType,setIvType]=useState("HR");
  const [ivUseResume,setIvUseResume]=useState(false);
  const [ivQuestions,setIvQuestions]=useState([]);
  const [ivIdx,setIvIdx]=useState(0);
  const [ivAnswer,setIvAnswer]=useState("");
  const [ivRawLog,setIvRawLog]=useState([]);
  const [ivScoredLog,setIvScoredLog]=useState([]);
  const [ivEvalProgress,setIvEvalProgress]=useState(0);
  const [ivDbSessionId,setIvDbSessionId]=useState(null);
  const [ivSessionId,setIvSessionId]=useState(null);
  const [ivSetupErr,setIvSetupErr]=useState(null);

  /* Sync states to localStorage */
  useEffect(()=>{localStorage.setItem("cc_page",page);},[page]);
  useEffect(()=>{if(resume)localStorage.setItem("cc_resume",JSON.stringify(resume));else localStorage.removeItem("cc_resume");},[resume]);
  useEffect(()=>{localStorage.setItem("cc_interviewSessions",JSON.stringify(interviewSessions));},[interviewSessions]);
  useEffect(()=>{if(currentSession)localStorage.setItem("cc_currentSession",JSON.stringify(currentSession));else localStorage.removeItem("cc_currentSession");},[currentSession]);
  useEffect(()=>{localStorage.setItem("cc_generatedQuestions",JSON.stringify(generatedQuestions));},[generatedQuestions]);

  const saveUserId=(newId)=>{
    const clean=(newId||"").trim()||"default_user";
    setUserId(clean);setStoredUserId(clean);setEditingUser(false);
    window.ccToast("User profile updated","success");
  };

  /* Load existing sessions from DB on mount */
  useEffect(()=>{
    setSessionsLoading(true);
    fetch(`${API_URL}/sessions/${userId}`)
      .then(r=>r.ok?r.json():null)
      .then(d=>{
        if(!d)return;
        const sess=d.sessions||[];
        setHistory(sess.map((s,i)=>({
          session:`S${sess.length-i}`,
          date:(s.created_at||"").slice(0,10)||"—",
          practiceMode:s.type==="interview"?"Mock Interview":"Analyze Audio",
          interviewType:s.topic||"HR",
          fluency:s.fluency||0,
          grammar:s.grammar||0,
          pronunciation:s.pronunciation||0,
          confidence:s.confidence||0,
          pace:s.pace||0,
          overall:s.overall||0,
          fillers:s.fillers||0,
          relevancy:s.relevancy||0,
        })));
      })
      .catch(()=>{})
      .finally(()=>setSessionsLoading(false));
  },[userId]);

  /* Hide splash screen */
  useEffect(()=>{
    clearTimeout(window._ccSplashGuard);
    const el=document.getElementById("splash");
    if(el)el.style.display="none";
  },[]);

  const handleAssessmentDone=({language,interviewType,practiceMode,apiResponse,transcriptTokens})=>{
    setAssessmentUploading(false);
    let feedback,tokens;
    if(apiResponse&&apiResponse.feedback){
      feedback=apiResponse.feedback;tokens=transcriptTokens||[];
    }else{
      // Fallback mock when API unavailable
      feedback={fluency:82,grammar:79,pronunciation:75,confidence:68,emotion:"Calm and steady",pace:74,paceNote:"Slightly fast",wpm:148,overall:76,fillers:MOCK_FILLER_COUNT,fillersPerMinute:2.1,summary:"Solid answer — a little polish on delivery.",publicSpeaking:{storytelling:78,audienceEngagement:70,presentationFlow:74},coachingPlan:{focusArea:"Cutting filler words before technical terms",notes:["Strong technical clarity.","Filler words cluster right before technical terms.","Confidence dipped when quantifying impact."],drills:[{title:"Pause, don't fill",desc:"Practice 5 answers where you replace every filler with a silent 1-second pause."},{title:"Lead with the number",desc:"Rewrite 3 project stories to open with the metric, not the setup."}]}};
      tokens=MOCK_TRANSCRIPT_TOKENS;
    }

    const skills = resume?.skills || [];
    const primarySkill = skills[0] || "software engineering";
    const customQuestions = [
      "Tell me about yourself and how your experience aligns with this role.",
      `I see you have experience with ${primarySkill}. Can you walk me through a complex technical challenge you solved using it?`,
      "Tell me about a time you disagreed with a teammate or stakeholder. How did you resolve it and what was the outcome?",
      "How do you handle prioritization and pressure when everything on your plate feels urgent?"
    ];
    setGeneratedQuestions(customQuestions);

    setCurrentSession({language,interviewType,practiceMode,transcript:tokens,feedback});
    const n=history.length+1;
    setHistory(prev=>[...prev,{session:`S${n}`,date:"Today",practiceMode,interviewType,fluency:feedback.fluency||0,grammar:feedback.grammar||0,pronunciation:feedback.pronunciation||0,confidence:feedback.confidence||0,pace:feedback.pace||0,overall:feedback.overall||0,fillers:feedback.fillers||0,relevancy:feedback.relevancy||0}]);
    setPage(2);
  };

  const handleInterviewFinish=(summary)=>{
    setInterviewSessions(prev=>[...prev,summary]);
    const n=history.length+1;
    // Derive per-metric averages from scoredLog if available
    const sl=summary.scoredLog||[];
    const reps=sl.map(e2=>e2.report||{}).filter(r=>Object.keys(r).length>0);
    const avgM=(k)=>reps.length?Math.round(reps.reduce((a,r)=>a+(r[k]||0),0)/reps.length):0;
    const confMap={"low":40,"medium":65,"high":85};
    const confAvg=reps.length?Math.round(reps.reduce((a,r)=>a+(confMap[(r.confidence_level||"medium").toLowerCase()]||65),0)/reps.length):summary.avgScore;
    setHistory(prev=>[...prev,{
      session:`S${n}`,date:"Today",practiceMode:"Mock Interview",interviewType:summary.type,
      fluency:avgM("fluency_score"),grammar:avgM("grammar_score"),pronunciation:avgM("pronunciation_score"),
      confidence:confAvg,pace:avgM("pace_score"),overall:summary.avgScore,
      fillers:avgM("filler_word_count"),relevancy:avgM("answer_relevancy_score"),
    }]);
    // Re-fetch DB sessions so dashboard reflects persisted data
    setSessionsLoading(true);
    fetch(`${API_URL}/sessions/${userId}`)
      .then(r=>r.ok?r.json():null)
      .then(d=>{
        if(!d)return;
        const sess=d.sessions||[];
        setHistory(sess.map((s,i)=>({
          session:`S${sess.length-i}`,
          date:(s.created_at||"").slice(0,10)||"—",
          practiceMode:s.type==="interview"?"Mock Interview":"Analyze Audio",
          interviewType:s.topic||"HR",
          fluency:s.fluency||0,
          grammar:s.grammar||0,
          pronunciation:s.pronunciation||0,
          confidence:s.confidence||0,
          pace:s.pace||0,
          overall:s.overall||0,
          fillers:s.fillers||0,
          relevancy:s.relevancy||0,
        })));
      })
      .catch(()=>{})
      .finally(()=>setSessionsLoading(false));
    setPage(4);
  };

  const handleReset=()=>{
    setHistory([]);setInterviewSessions([]);setCurrentSession(null);
    setIvPhase("setup");setIvRawLog([]);setIvScoredLog([]);
    setResume(null);setPage(1);
    localStorage.clear();
  };

  /* User ID edit banner */
  const userBanner=editingUser&&e("div",{style:{background:C.bg2,borderBottom:`1px solid ${C.border}`,padding:"12px 28px",display:"flex",alignItems:"center",gap:10,flexWrap:"wrap"}},
    e("span",{style:{fontFamily:FM,fontSize:12,color:C.muted}},"User ID:"),
    e("input",{className:"cc-input",value:userDraft,onChange:ev=>setUserDraft(ev.target.value),onKeyDown:ev=>{if(ev.key==="Enter")saveUserId(userDraft);if(ev.key==="Escape")setEditingUser(false);},style:{maxWidth:220,padding:"6px 10px",fontSize:13},autoFocus:true}),
    e("button",{onClick:()=>saveUserId(userDraft),style:{...pBtn,padding:"7px 16px",fontSize:13}},"Save"),
    e("button",{onClick:()=>setEditingUser(false),style:{...sBtn,padding:"7px 14px",fontSize:13}},"Cancel")
  );

  return e("div",{style:{background:C.bg,minHeight:"100vh",fontFamily:FB,position:"relative",overflow:"hidden"}},
    e("div",{className:"cc-blob",style:{position:"absolute",top:-80,left:-80,width:280,height:280,borderRadius:"50%",background:C.coral,opacity:0.10,filter:"blur(60px)",animation:"floatBlob 9s ease-in-out infinite"}}),
    e("div",{className:"cc-blob",style:{position:"absolute",bottom:-100,right:-60,width:320,height:320,borderRadius:"50%",background:C.mint,opacity:0.08,filter:"blur(70px)",animation:"floatBlob 11s ease-in-out infinite"}}),
    e("div",{style:{position:"relative",zIndex:1}},
      e(Header,{userId,onEditUser:()=>{setUserDraft(userId);setEditingUser(true);}}),
      userBanner,
      e(Stepper,{page,setPage,interviewPhase:ivPhase,uploading:assessmentUploading}),
      page===1&&e(AssessmentPage,{onDone:handleAssessmentDone,resume,setResume,onUploadingChange:setAssessmentUploading,userId}),
      page===2&&e(FeedbackPage,{session:currentSession,onStartInterview:()=>setPage(3),onViewDashboard:()=>setPage(4),onRetry:()=>setPage(1)}),
      /* MockInterviewPage is always mounted to preserve state across tab changes */
      e(MockInterviewPage,{
        resume,defaultType:currentSession?.interviewType,onFinish:handleInterviewFinish,
        hidden:page!==3,userId,
        phase:ivPhase,setPhase:setIvPhase,
        interviewType:ivType,setInterviewType:setIvType,
        useResume:ivUseResume,setUseResume:setIvUseResume,
        questions:ivQuestions,setQuestions:setIvQuestions,
        idx:ivIdx,setIdx:setIvIdx,
        answer:ivAnswer,setAnswer:setIvAnswer,
        rawLog:ivRawLog,setRawLog:setIvRawLog,
        scoredLog:ivScoredLog,setScoredLog:setIvScoredLog,
        evalProgress:ivEvalProgress,setEvalProgress:setIvEvalProgress,
        dbSessionId:ivDbSessionId,setDbSessionId:setIvDbSessionId,
        sessionId:ivSessionId,setSessionId:setIvSessionId,
        setupErr:ivSetupErr,setSetupErr:setIvSetupErr,
        generatedQuestions,setGeneratedQuestions,
      }),
      page===4&&e(DashboardPage,{history,interviewSessions,onNewSession:()=>setPage(1),onReset:handleReset,userId,loading:sessionsLoading}),
      e(ToastContainer,null)
    )
  );
}

window.addEventListener("error",ev=>{
  const b=document.getElementById("error-banner");
  if(b){b.style.display="block";b.textContent=`JS Error: ${ev.message} (${ev.filename?.split("/").pop()}:${ev.lineno})`;}
  const s=document.getElementById("splash");
  if(s)s.style.display="none";
});

try{
  ReactDOM.createRoot(document.getElementById("root")).render(e(CommCoachApp,null));
}catch(ex){
  clearTimeout(window._ccSplashGuard);
  const s=document.getElementById("splash");if(s)s.style.display="none";
  const b=document.getElementById("error-banner");
  if(b){b.style.display="block";b.textContent=`Startup error: ${ex.message}`;}
}
})();
