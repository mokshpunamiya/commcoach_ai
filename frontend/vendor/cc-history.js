/* cc-history.js — Session History tab (page 5): full Q&A turns, per-turn scores.
   Depends on: cc-globals.js, cc-primitives.js                                     */
"use strict";

function HistoryPage({userId,onGoToAssessment}){
  const [loading,setLoading]=useState(true);
  const [sessions,setSessions]=useState([]);
  const [expanded,setExpanded]=useState(null); // session id
  const [detailLoading,setDetailLoading]=useState(false);
  const [details,setDetails]=useState({}); // {[session_id]: turns}
  const [error,setError]=useState(null);
  const [resetting,setResetting]=useState(false);
  const [confirmReset,setConfirmReset]=useState(false);

  const loadSessions=()=>{
    if(!userId)return;
    setLoading(true);setError(null);
    fetch(`${API_URL}/sessions/${encodeURIComponent(userId)}`)
      .then(r=>r.ok?r.json():Promise.reject(r.status))
      .then(d=>setSessions(d.sessions||[]))
      .catch(err=>setError(`Failed to load history (${err}).`))
      .finally(()=>setLoading(false));
  };
  useEffect(loadSessions,[userId]);

  const toggleSession=async(sid)=>{
    if(expanded===sid){setExpanded(null);return;}
    setExpanded(sid);
    if(details[sid])return;
    setDetailLoading(true);
    try{
      const r=await fetch(`${API_URL}/sessions/detail/${encodeURIComponent(sid)}`);
      if(!r.ok)throw new Error(r.status);
      const d=await r.json();
      setDetails(p=>({...p,[sid]:d.turns||[]}));
    }catch(_){
      setDetails(p=>({...p,[sid]:[]}));
    }
    setDetailLoading(false);
  };

  const doReset=async()=>{
    setResetting(true);setConfirmReset(false);
    try{
      const r=await fetch(`${API_URL}/sessions/reset/${encodeURIComponent(userId)}`,{method:"DELETE"});
      if(!r.ok)throw new Error(r.status);
      setSessions([]);setDetails({});setExpanded(null);
      window.ccToast("All session history cleared","success");
    }catch(_){window.ccToast("Could not reset history","error");}
    setResetting(false);
  };

  if(loading)return e("div",{style:{maxWidth:760,margin:"0 auto",padding:"0 20px 60px"}},
    [1,2,3].map(i=>e(SkCard,{key:i}))
  );
  if(error)return e("div",{style:{maxWidth:760,margin:"40px auto",padding:"0 20px",textAlign:"center"}},
    e("p",{style:{fontFamily:FB,color:C.coral}},error),
    e("button",{onClick:loadSessions,style:{...gBtn,marginTop:12}},e(SvgRotate,{size:13}),"Retry")
  );

  return e("main",{className:"cc-fade",style:{maxWidth:820,margin:"0 auto",padding:"0 20px 60px"}},
    /* Header */
    e("div",{style:{display:"flex",justifyContent:"space-between",alignItems:"center",flexWrap:"wrap",gap:10,marginBottom:20}},
      e("div",null,
        e("h1",{style:{fontFamily:FD,fontWeight:700,fontSize:22,color:C.text,margin:0}},"Session History"),
        e("p",{style:{fontFamily:FB,fontSize:13,color:C.muted,marginTop:2}},`${sessions.length} session${sessions.length!==1?"s":""} for ${userId}`)
      ),
      sessions.length>0&&e("button",{onClick:()=>setConfirmReset(true),disabled:resetting,
        style:{...gBtn,color:C.coral,border:`1px solid ${C.coral}55`}},
        e(SvgX,{size:13,color:C.coral}),"Clear all"
      )
    ),
    /* Reset confirmation dialog */
    confirmReset&&e("div",{role:"dialog","aria-modal":"true","aria-labelledby":"reset-dlg",
      style:{position:"fixed",inset:0,background:"rgba(0,0,0,0.65)",zIndex:300,display:"flex",alignItems:"center",justifyContent:"center",padding:20}},
      e("div",{className:"cc-fade",style:{background:C.card,border:`1px solid ${C.border}`,borderRadius:18,padding:28,maxWidth:360,width:"100%",textAlign:"center"}},
        e("h2",{id:"reset-dlg",style:{fontFamily:FD,fontWeight:700,fontSize:17,color:C.text,marginBottom:10}},"Delete all history?"),
        e("p",{style:{fontFamily:FB,fontSize:13,color:C.muted,marginBottom:24,lineHeight:1.6}},"This is permanent and cannot be undone."),
        e("div",{style:{display:"flex",gap:10,justifyContent:"center"}},
          e("button",{onClick:doReset,style:{...pBtn,background:C.coral}},"Delete"),
          e("button",{onClick:()=>setConfirmReset(false),style:sBtn},"Cancel")
        )
      )
    ),
    sessions.length===0&&e("div",{style:{textAlign:"center",padding:"40px 20px",background:C.card,border:`1px solid ${C.border}`,borderRadius:18}},
      e(SvgHistory,{size:32,color:C.muted}),
      e("h3",{style:{fontFamily:FD,fontWeight:600,fontSize:17,color:C.text,margin:"12px 0 6px"}},"No sessions yet"),
      e("p",{style:{fontFamily:FB,fontSize:13,color:C.muted,marginBottom:18,lineHeight:1.6}},"Complete a CV analysis or mock interview to see your history here."),
      e("button",{onClick:onGoToAssessment,style:pBtn},e(SvgMic,{size:14,color:C.bg}),"Start a session")
    ),
    /* Session list */
    e("div",{style:{display:"flex",flexDirection:"column",gap:10}},
      sessions.map(s=>{
        const dt=s.created_at?new Date(s.created_at).toLocaleString("en-IN",{weekday:"short",month:"short",day:"numeric",hour:"2-digit",minute:"2-digit"}):"";
        const score=s.overall||0;
        const scoreColor=colorForScore(score);
        const open=expanded===s.id;
        return e("div",{key:s.id,style:{background:C.card,border:`1.5px solid ${open?C.coral:C.border}`,borderRadius:14,overflow:"hidden",transition:"border-color .2s"}},
          /* Session header row */
          e("button",{
            onClick:()=>toggleSession(s.id),
            "aria-expanded":open,
            style:{width:"100%",display:"flex",alignItems:"center",gap:12,padding:"14px 16px",background:"transparent",border:"none",cursor:"pointer",textAlign:"left"}
          },
            /* Score ring */
            e("div",{style:{width:44,height:44,borderRadius:"50%",background:`conic-gradient(${scoreColor} ${score*3.6}deg,${C.bg2} ${score*3.6}deg)`,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}},
              e("div",{style:{width:33,height:33,borderRadius:"50%",background:C.card,display:"flex",alignItems:"center",justifyContent:"center"}},
                e("span",{style:{fontFamily:FM,fontWeight:700,fontSize:11,color:C.text}},score||"—")
              )
            ),
            e("div",{style:{flex:1,minWidth:0}},
              e("div",{style:{fontFamily:FD,fontWeight:600,fontSize:13.5,color:C.text,marginBottom:2,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}},
                s.topic||"Untitled session"
              ),
              e("div",{style:{fontFamily:FM,fontSize:11,color:C.muted}},dt," · ",s.type," · ",s.goal||"SDE")
            ),
            e("div",{style:{display:"flex",gap:6,flexWrap:"wrap",flexShrink:0}},
              s.fluency>0&&e(Pill,{text:`F${s.fluency}`,color:C.coral}),
              s.grammar>0&&e(Pill,{text:`G${s.grammar}`,color:C.yellow}),
              s.confidence>0&&e(Pill,{text:`C${s.confidence}`,color:C.mint})
            ),
            e(SvgChevron,{size:16,color:C.muted,down:open})
          ),
          /* Expanded turns */
          open&&e("div",{className:"cc-fade",style:{padding:"0 16px 16px",borderTop:`1px solid ${C.border}`}},
            detailLoading&&!details[s.id]&&e("div",{style:{padding:"12px 0",display:"flex",gap:8,alignItems:"center"}},
              e(Waveform,{count:10,height:18,animated:true}),
              e("span",{style:{fontFamily:FM,fontSize:12,color:C.muted}},"Loading turns…")
            ),
            (details[s.id]||s.turn_summaries||[]).length===0&&!detailLoading&&e("p",{style:{fontFamily:FB,fontSize:12.5,color:C.muted,marginTop:12}},"No turn data available."),
            (details[s.id]||s.turn_summaries||[]).map((turn,ti)=>
              e(_TurnCard,{key:ti,turn,index:ti})
            )
          )
        );
      })
    )
  );
}

function _TurnCard({turn,index}){
  const [showFull,setShowFull]=useState(false);
  const rpt=turn.session_report||{};
  // Handle both full detail turns (session_report.*) and turn_summaries (flat fields)
  const overallScore=rpt.overall_score??turn.overall_score;
  const fluencyScore=rpt.fluency_score??turn.fluency_score;
  const grammarScore=rpt.grammar_score??turn.grammar_score;
  const fillerCount=rpt.filler_word_count??turn.filler_count??turn.filler_word_count;
  const wpm=rpt.words_per_minute??turn.wpm;
  const scoreColor=overallScore!=null?colorForScore(overallScore):C.muted;
  const fb=turn.feedback||"";
  const preview=fb.replace(/#{1,3} ?/g,"").replace(/\*\*([^*]+)\*\*/g,"$1").trim().slice(0,200);
  return e("div",{style:{marginTop:12,background:C.bg2,border:`1px solid ${C.border}`,borderRadius:12,overflow:"hidden"}},
    /* Turn header */
    e("div",{style:{padding:"10px 14px",borderBottom:`1px solid ${C.border}`,display:"flex",alignItems:"center",gap:8,flexWrap:"wrap"}},
      e("span",{style:{fontFamily:FM,fontSize:11,color:C.muted}},`Turn ${(turn.turn_number??index)+1}`),
      overallScore!=null&&e("span",{style:{fontFamily:FM,fontSize:12,color:scoreColor,border:`1px solid ${scoreColor}55`,borderRadius:999,padding:"2px 9px"}},
        `${overallScore}/100`
      ),
      fluencyScore!=null&&e(Pill,{text:`F:${fluencyScore}`,color:C.coral}),
      grammarScore!=null&&e(Pill,{text:`G:${grammarScore}`,color:C.yellow}),
      fillerCount>0&&e(Pill,{text:`${fillerCount} fillers`,color:C.fillerTone}),
      wpm>0&&e(Pill,{text:`${wpm} WPM`,color:C.purple})
    ),
    /* Question */
    turn.question&&e("div",{style:{padding:"10px 14px",borderBottom:fb?`1px solid ${C.border}`:"none"}},
      e("div",{style:{fontFamily:FM,fontSize:11,color:C.muted,marginBottom:4}},"QUESTION"),
      e("p",{style:{fontFamily:FB,fontSize:13.5,color:C.text,lineHeight:1.65,margin:0}},turn.question)
    ),
    /* Transcript */
    turn.transcript&&e("div",{style:{padding:"8px 14px",borderBottom:fb?`1px solid ${C.border}`:"none",background:C.card}},
      e("div",{style:{fontFamily:FM,fontSize:11,color:C.muted,marginBottom:4}},"YOUR ANSWER"),
      e("p",{style:{fontFamily:FB,fontSize:12.5,color:C.muted,lineHeight:1.6,margin:0}},turn.transcript.slice(0,300)+(turn.transcript.length>300?"…":""))
    ),
    /* Feedback */
    fb&&e("div",{style:{padding:"10px 14px"}},
      e("div",{style:{fontFamily:FM,fontSize:11,color:C.muted,marginBottom:6}},"COACH FEEDBACK"),
      e("p",{style:{fontFamily:FB,fontSize:13,color:C.muted,lineHeight:1.65,margin:"0 0 6px",whiteSpace:"pre-wrap"}},
        showFull?fb.replace(/#{1,3} ?/g,"").replace(/\*\*([^*]+)\*\*/g,"$1").trim():preview+(fb.length>200?"…":"")
      ),
      fb.length>200&&e("button",{onClick:()=>setShowFull(p=>!p),
        style:{fontFamily:FB,fontSize:12,color:C.coral,background:"transparent",border:"none",cursor:"pointer",padding:0}},
        showFull?"Show less ↑":"Show more ↓"
      )
    )
  );
}
