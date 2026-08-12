/* cc-primitives.js — shared UI components: Waveform, Skeleton, Label, Pill,
   ChipRow, DropZone, ElapsedTimer, Toast, Header, Stepper, ResumeUpload,
   GoalSelector, ScoreRing, MetricCard.
   Depends on: cc-globals.js                                               */
"use strict";

/* ── Waveform animation ── */
function Waveform({count=32,height=56,colors=[C.coral,C.yellow,C.mint],animated=true}){
  return e("div",{style:{display:"flex",alignItems:"center",gap:3,height}},
    Array.from({length:count}).map((_,i)=>{
      const h=25+Math.abs(Math.sin(i*0.55))*65+((i*37)%11);
      return e("div",{key:i,className:animated?"cc-bar":"",style:{width:4,height:`${Math.min(h,100)}%`,background:colors[i%colors.length],borderRadius:3,animationDelay:`${i*0.035}s`,opacity:0.9}});
    })
  );
}

/* ── Skeleton loaders ── */
const Sk=({w="100%",h=16,mb=8})=>e("div",{className:"cc-skeleton",style:{width:w,height:h,marginBottom:mb}});
const SkCard=()=>e("div",{style:{background:C.card,border:`1px solid ${C.border}`,borderRadius:12,padding:16,marginBottom:8}},e(Sk,{w:"60%",h:14,mb:10}),e(Sk,{w:"100%",h:10,mb:6}),e(Sk,{w:"80%",h:10}));

/* ── Small reusable atoms ── */
const Label=({Icon,text})=>e("div",{style:{display:"flex",alignItems:"center",gap:6,marginBottom:10}},
  e(Icon,{size:13,color:C.muted}),
  e("span",{style:{fontFamily:FM,fontSize:11.5,color:C.muted,textTransform:"uppercase",letterSpacing:0.6}},text)
);
const Pill=({text,color,mono})=>e("span",{style:{fontFamily:mono?FM:FB,fontSize:12,fontWeight:500,color,border:`1px solid ${color}55`,borderRadius:999,padding:"5px 12px"}},text);
const STitle=({text,Icon})=>e("div",{style:{display:"flex",alignItems:"center",gap:7,margin:"0 0 12px"}},
  e(Icon,{size:15,color:C.coral}),
  e("span",{style:{fontFamily:FD,fontWeight:600,fontSize:15,color:C.text}},text)
);
const ChipRow=({options,value,onChange,accent,disabled})=>e("div",{role:"group",style:{display:"flex",gap:8,flexWrap:"wrap"}},
  options.map(opt=>{
    const a=opt===value;
    return e("button",{key:opt,disabled,onClick:()=>onChange(opt),
      "aria-pressed":a,
      style:{padding:"7px 14px",borderRadius:999,cursor:disabled?"default":"pointer",fontFamily:FB,fontWeight:500,fontSize:13,
        border:`1px solid ${a?accent:C.border}`,background:a?`${accent}22`:"transparent",color:a?accent:C.muted,transition:"all .15s"}
    },opt);
  })
);

/* ── Toast system ── */
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
window.ccToast=(msg,type="info",ms=3500)=>{
  if(!_toastSetItems)return;
  const id=Date.now()+Math.random();
  _toastSetItems(p=>[...p,{id,msg,type}]);
  setTimeout(()=>_toastSetItems(p=>p.filter(it=>it.id!==id)),ms);
};

/* ── Header ── */
function Header({userId,goal,onEditUser,onEditGoal}){
  const goalObj=CAREER_GOALS.find(g=>g.id===goal)||CAREER_GOALS[0];
  return e("header",{role:"banner",style:{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"16px 28px",flexWrap:"wrap",gap:12,borderBottom:`1px solid ${C.border}`}},
    e("div",{style:{display:"flex",alignItems:"center",gap:10}},
      e("div",{style:{width:34,height:34,borderRadius:10,background:C.coral,display:"flex",alignItems:"center",justifyContent:"center"},
        "aria-hidden":"true"},e(SvgMic,{size:18,color:C.bg})),
      e("span",{style:{fontFamily:FD,fontWeight:700,fontSize:19,color:C.text,letterSpacing:-0.3}},"CommCoach AI")
    ),
    e("div",{style:{display:"flex",alignItems:"center",gap:10,flexWrap:"wrap"}},
      e("button",{onClick:onEditGoal,"aria-label":`Career goal: ${goalObj.label}. Click to change.`,
        style:{display:"flex",alignItems:"center",gap:6,fontFamily:FB,fontSize:12,color:C.purple,background:C.purpleSoft,border:`1px solid ${C.purple}55`,borderRadius:999,padding:"5px 12px",cursor:"pointer"}},
        e("span",{"aria-hidden":"true"},goalObj.icon)," ",goalObj.label
      ),
      e("button",{onClick:onEditUser,"aria-label":`User: ${userId}. Click to change.`,
        style:{display:"flex",alignItems:"center",gap:6,fontFamily:FM,fontSize:11,color:C.muted,background:"transparent",border:`1px solid ${C.border}`,borderRadius:999,padding:"5px 12px",cursor:"pointer"}},
        e("span",{style:{width:7,height:7,borderRadius:"50%",background:C.mint,display:"inline-block"},"aria-hidden":"true"}),
        userId||"default_user"
      ),
      e("div",{style:{fontFamily:FM,fontSize:11,color:C.muted,border:`1px solid ${C.border}`,borderRadius:999,padding:"5px 12px",display:"flex",alignItems:"center",gap:6},"aria-label":"Powered by Sarvam AI"},
        e(SvgSparkle,{size:12,color:C.mint}),"Sarvam AI"
      )
    )
  );
}

/* ── Tab nav (replaces old stepper) ── */
function TabNav({page,setPage,interviewPhase,uploading}){
  const tabs=[
    {n:1,label:"CV & Setup",   Icon:SvgFile,   ariaLabel:"CV Upload and Setup tab"},
    {n:2,label:"Feedback",     Icon:SvgFileAudio,ariaLabel:"Feedback tab"},
    {n:3,label:"Mock Interview",Icon:SvgUsers,  ariaLabel:"Mock Interview tab"},
    {n:4,label:"Dashboard",    Icon:SvgTrend,  ariaLabel:"Dashboard tab"},
    {n:5,label:"History",      Icon:SvgHistory,ariaLabel:"Session History tab"},
  ];
  const [confirmNav,setConfirmNav]=useState(null);

  const handleClick=(target)=>{
    if(target===page)return;
    if(page===3&&interviewPhase==="interview"){setConfirmNav(target);return;}
    if(page===1&&uploading){setConfirmNav(target);return;}
    setPage(target);
  };

  return e(Fragment,null,
    confirmNav!==null&&e("div",{role:"dialog","aria-modal":"true","aria-labelledby":"navdlg-title",
      style:{position:"fixed",inset:0,background:"rgba(0,0,0,0.6)",zIndex:200,display:"flex",alignItems:"center",justifyContent:"center",padding:20}},
      e("div",{className:"cc-fade",style:{background:C.card,border:`1px solid ${C.border}`,borderRadius:18,padding:28,maxWidth:380,width:"100%",textAlign:"center"}},
        e("h2",{id:"navdlg-title",style:{fontFamily:FD,fontWeight:700,fontSize:17,color:C.text,marginBottom:10}},
          page===3?"Leave this interview?":"Leave analysis in progress?"
        ),
        e("p",{style:{fontFamily:FB,fontSize:13.5,color:C.muted,marginBottom:24,lineHeight:1.6}},
          page===3?"Your answers are saved — you can return by clicking Mock Interview."
                  :"Your current analysis will be cancelled."
        ),
        e("div",{style:{display:"flex",gap:10,justifyContent:"center"}},
          e("button",{onClick:()=>{setPage(confirmNav);setConfirmNav(null);},style:pBtn},"Leave"),
          e("button",{onClick:()=>setConfirmNav(null),style:sBtn},"Stay")
        )
      )
    ),
    e("nav",{role:"tablist","aria-label":"Application sections",
      style:{display:"flex",alignItems:"center",justifyContent:"center",gap:4,padding:"10px 20px 24px",flexWrap:"wrap"}},
      tabs.map(t=>e("button",{
        key:t.n,role:"tab","aria-selected":page===t.n,"aria-label":t.ariaLabel,
        onClick:()=>handleClick(t.n),
        style:{display:"flex",alignItems:"center",gap:7,padding:"9px 16px",borderRadius:999,
          border:`1.5px solid ${page===t.n?C.coral:C.border}`,
          background:page===t.n?C.coralSoft:"transparent",
          color:page===t.n?C.coral:C.muted,cursor:"pointer",fontFamily:FB,fontWeight:500,fontSize:13,
          transition:"all .18s"}
      },
        e(t.Icon,{size:13,color:page===t.n?C.coral:C.muted}),
        e("span",null,t.label)
      ))
    )
  );
}

/* ── Goal selector modal ── */
function GoalSelectorModal({current,onSave,onCancel}){
  const [selected,setSelected]=useState(current||"SDE");
  return e("div",{role:"dialog","aria-modal":"true","aria-labelledby":"goal-dlg-title",
    style:{position:"fixed",inset:0,background:"rgba(0,0,0,0.65)",zIndex:300,display:"flex",alignItems:"center",justifyContent:"center",padding:20}},
    e("div",{className:"cc-fade",style:{background:C.card,border:`1px solid ${C.border}`,borderRadius:20,padding:28,maxWidth:480,width:"100%"}},
      e("h2",{id:"goal-dlg-title",style:{fontFamily:FD,fontWeight:700,fontSize:18,color:C.text,marginBottom:6}},"What's your career goal?"),
      e("p",{style:{fontFamily:FB,fontSize:13,color:C.muted,marginBottom:20,lineHeight:1.6}},
        "CommCoach tailors interview questions and coaching to your specific role. You can change this any time."
      ),
      e("div",{style:{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:24}},
        CAREER_GOALS.map(g=>e("button",{key:g.id,
          onClick:()=>setSelected(g.id),
          "aria-pressed":selected===g.id,
          style:{display:"flex",flexDirection:"column",alignItems:"flex-start",gap:4,padding:"12px 14px",borderRadius:14,
            border:`2px solid ${selected===g.id?C.coral:C.border}`,
            background:selected===g.id?C.coralSoft:C.bg2,cursor:"pointer",textAlign:"left",transition:"all .15s"}
        },
          e("span",{style:{fontSize:20}},g.icon),
          e("span",{style:{fontFamily:FD,fontWeight:600,fontSize:13,color:selected===g.id?C.coral:C.text}},g.label),
          e("span",{style:{fontFamily:FB,fontSize:11,color:C.muted,lineHeight:1.4}},g.desc)
        ))
      ),
      e("div",{style:{display:"flex",gap:10}},
        e("button",{onClick:()=>onSave(selected),style:{...pBtn,flex:1}},"Save goal"),
        e("button",{onClick:onCancel,style:sBtn},"Cancel")
      )
    )
  );
}

/* ── Resume upload widget ── */
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
      window.ccToast("Resume parsed successfully","success");
    }catch(_){
      const shuffled=[...MOCK_RESUME_SKILL_POOL].sort(()=>0.5-Math.random());
      setResume({fileName:file.name,headline:"Software engineer",summary:"Experience in software development.",skills:shuffled.slice(0,6),text:""});
      window.ccToast("Using placeholder resume data","info");
    }
    setParsing(false);
  };
  return e("div",{style:{marginBottom:22}},
    e(Label,{Icon:SvgFile,text:"Resume / CV"}),
    !resume&&!parsing&&e("div",{
      onClick:()=>ref.current?.click(),
      onKeyDown:ev=>{if(ev.key==="Enter"||ev.key===" "){ev.preventDefault();ref.current?.click();}},
      tabIndex:0,role:"button","aria-label":"Upload resume — PDF, DOCX or TXT",
      style:{border:`2px dashed ${C.border}`,borderRadius:14,padding:"20px 16px",textAlign:"center",cursor:"pointer",transition:"border-color .15s",outline:"none"}
    },
      e("input",{ref,type:"file",accept:".pdf,.docx,.txt","aria-hidden":"true",style:{display:"none"},onChange:handleFile}),
      e(SvgFile,{size:20,color:C.purple}),
      e("div",{style:{fontFamily:FB,fontSize:13,color:C.text,marginTop:6}},"Upload resume — PDF, DOCX, or TXT"),
      e("div",{style:{fontFamily:FB,fontSize:12,color:C.muted,marginTop:3}},"Questions will be generated from your CV")
    ),
    parsing&&e("div",{role:"status","aria-live":"polite",style:{display:"flex",alignItems:"center",gap:10,padding:"12px 14px",background:C.card,border:`1px solid ${C.border}`,borderRadius:12}},
      e(Waveform,{count:10,height:18}),
      e("span",{style:{fontFamily:FM,fontSize:12,color:C.muted}},"Parsing resume…")
    ),
    resume&&!parsing&&e("div",{className:"cc-fade",style:{background:C.card,border:`1px solid ${C.border}`,borderRadius:14,padding:16}},
      e("div",{style:{display:"flex",justifyContent:"space-between",alignItems:"flex-start",gap:8}},
        e("div",null,
          e("div",{style:{fontFamily:FD,fontWeight:600,fontSize:14,color:C.text}},resume.headline),
          resume.summary&&e("div",{style:{fontFamily:FB,fontSize:12.5,color:C.muted,marginTop:4}},resume.summary.slice(0,120)+(resume.summary.length>120?"…":""))
        ),
        e("button",{onClick:()=>setResume(null),"aria-label":"Remove resume",style:{background:"transparent",border:"none",cursor:"pointer",color:C.muted,padding:4}},e(SvgX,{size:16,color:C.muted}))
      ),
      resume.skills?.length>0&&e("div",{style:{marginTop:10,display:"flex",gap:6,flexWrap:"wrap"}},resume.skills.map(s=>e(Pill,{key:s,text:s,color:C.purple})))
    )
  );
}

/* ── Drop-zone for audio upload ── */
function DropZone({onFile,fileInputRef}){
  const [dragOver,setDragOver]=useState(false);
  const [pickedFile,setPickedFile]=useState(null);
  const fmtSize=b=>b<1048576?`${(b/1024).toFixed(1)} KB`:`${(b/1048576).toFixed(1)} MB`;
  const accept=(f)=>{if(!f)return;setPickedFile(f);onFile(f);};
  return e("div",{
    tabIndex:0,role:"button","aria-label":"Upload audio file — drag and drop or click to browse",
    onClick:()=>fileInputRef.current?.click(),
    onKeyDown:ev=>{if(ev.key==="Enter"||ev.key===" "){ev.preventDefault();fileInputRef.current?.click();}},
    onDragOver:ev=>{ev.preventDefault();setDragOver(true);},
    onDragLeave:()=>setDragOver(false),
    onDrop:ev=>{ev.preventDefault();setDragOver(false);const f=ev.dataTransfer.files?.[0];if(f)accept(f);},
    style:{border:`2px dashed ${dragOver?C.coral:C.border}`,borderRadius:16,padding:"34px 20px",textAlign:"center",
      cursor:"pointer",transition:"all .15s",background:dragOver?C.coralSoft:"transparent",outline:"none"}
  },
    e("input",{ref:fileInputRef,type:"file",accept:"audio/*,video/*","aria-hidden":"true",style:{display:"none"},onChange:ev=>{if(ev.target.files[0])accept(ev.target.files[0]);}}),
    dragOver
      ?e(Fragment,null,e(SvgUpload,{size:26,color:C.coral}),e("div",{style:{fontFamily:FD,fontWeight:600,color:C.coral,fontSize:15,marginTop:10}},"Drop to analyze"))
      :pickedFile
        ?e(Fragment,null,
            e(SvgCheck,{size:26,color:C.mint}),
            e("div",{style:{fontFamily:FD,fontWeight:600,color:C.mint,fontSize:15,marginTop:10}},"File ready"),
            e("div",{style:{display:"inline-flex",alignItems:"center",gap:8,marginTop:6,background:C.mintSoft,border:`1px solid ${C.mint}55`,borderRadius:8,padding:"5px 12px"}},
              e(SvgFileAudio,{size:13,color:C.mint}),
              e("span",{style:{fontFamily:FM,fontSize:12,color:C.text}},pickedFile.name),
              e("span",{style:{fontFamily:FM,fontSize:11,color:C.muted}},fmtSize(pickedFile.size))
            )
          )
        :e(Fragment,null,
            e(SvgUpload,{size:26,color:C.coral}),
            e("div",{style:{fontFamily:FD,fontWeight:600,color:C.text,fontSize:15,marginTop:10}},"Drop a recording here, or click to browse"),
            e("div",{style:{fontFamily:FB,color:C.muted,fontSize:12.5,marginTop:4}},"MP3, WAV, M4A, OGG — up to 15 minutes")
          )
  );
}

/* ── ElapsedTimer ── */
function ElapsedTimer({color=C.muted}){
  const [secs,setSecs]=useState(0);
  useEffect(()=>{const iv=setInterval(()=>setSecs(s=>s+1),1000);return()=>clearInterval(iv);},[]);
  const mm=String(Math.floor(secs/60)).padStart(2,"0"),ss=String(secs%60).padStart(2,"0");
  return e("span",{"aria-live":"off",style:{fontFamily:FM,fontSize:11.5,color}},`${mm}:${ss}`);
}

/* ── ScoreRing ── */
function ScoreRing({value,size=128}){
  const angle=(value/100)*360,color=colorForScore(value);
  return e("div",{"aria-label":`Overall score: ${value} out of 100`,
    style:{width:size,height:size,borderRadius:"50%",background:`conic-gradient(${color} ${angle}deg,${C.bg2} ${angle}deg)`,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}},
    e("div",{style:{width:size-16,height:size-16,borderRadius:"50%",background:C.card,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center"}},
      e("span",{style:{fontFamily:FM,fontWeight:700,fontSize:size>80?30:20,color:C.text}},value),
      e("span",{style:{fontFamily:FB,fontSize:10.5,color:C.muted,letterSpacing:0.5}},"OVERALL")
    )
  );
}

/* ── MetricCard ── */
function MetricCard({label,value,color,note,suffix="",inverse=false}){
  const pct=typeof value==="number"?Math.min(value,100):100;
  const barColor=inverse?(value<=20?C.mint:value<=50?C.yellow:C.coral):color;
  return e("div",{style:{background:C.card,border:`1px solid ${C.border}`,borderRadius:14,padding:16,borderLeft:`3px solid ${color}`}},
    e("div",{style:{fontFamily:FM,fontSize:11,color:C.muted,marginBottom:6,textTransform:"uppercase",letterSpacing:0.5}},label),
    e("div",{style:{fontFamily:FM,fontWeight:700,fontSize:22,color:C.text,marginBottom:6}},value,
      e("span",{style:{fontSize:12,color:C.muted,fontWeight:400}},suffix)
    ),
    typeof value==="number"&&e("div",{role:"progressbar","aria-valuenow":pct,"aria-valuemin":0,"aria-valuemax":100,"aria-label":label,
      style:{height:5,borderRadius:3,background:C.bg2,overflow:"hidden",marginBottom:8}},
      e("div",{style:{width:`${pct}%`,height:"100%",background:barColor,borderRadius:3}})
    ),
    note&&e("div",{style:{fontFamily:FB,fontSize:11.5,color:C.muted}},note)
  );
}

/* ── User ID modal ── */
function UserIdModal({current,onSave,onCancel}){
  const [val,setVal]=useState(current||"default_user");
  const submit=()=>{const clean=(val||"").trim()||"default_user";onSave(clean);};
  return e("div",{role:"dialog","aria-modal":"true","aria-labelledby":"user-dlg-title",
    style:{position:"fixed",inset:0,background:"rgba(0,0,0,0.65)",zIndex:300,display:"flex",alignItems:"center",justifyContent:"center",padding:20}},
    e("div",{className:"cc-fade",style:{background:C.card,border:`1px solid ${C.border}`,borderRadius:20,padding:28,maxWidth:400,width:"100%"}},
      e("h2",{id:"user-dlg-title",style:{fontFamily:FD,fontWeight:700,fontSize:18,color:C.text,marginBottom:6}},"Switch user"),
      e("p",{style:{fontFamily:FB,fontSize:13,color:C.muted,marginBottom:16,lineHeight:1.6}},
        "Sessions and history are separate per user. Enter any identifier."
      ),
      e("input",{className:"cc-input",value:val,onChange:ev=>setVal(ev.target.value),
        placeholder:"user_id (e.g. alice, bob, your-email)",
        onKeyDown:ev=>{if(ev.key==="Enter")submit();},
        style:{marginBottom:16}
      }),
      e("div",{style:{display:"flex",gap:10}},
        e("button",{onClick:submit,style:{...pBtn,flex:1}},"Switch user"),
        e("button",{onClick:onCancel,style:sBtn},"Cancel")
      )
    )
  );
}
