/* cc-dashboard.js — Dashboard tab (page 4): per-user metrics over time,
   split into "increase" and "decrease" panels.
   Depends on: cc-globals.js, cc-primitives.js                             */
"use strict";

function DashboardPage({userId,goal,onGoToInterview}){
  const [loading,setLoading]=useState(true);
  const [sessions,setSessions]=useState([]);
  const [error,setError]=useState(null);

  useEffect(()=>{
    if(!userId)return;
    setLoading(true);setError(null);
    fetch(`${API_URL}/sessions/${encodeURIComponent(userId)}`)
      .then(r=>r.ok?r.json():Promise.reject(r.status))
      .then(d=>{setSessions(d.sessions||[]);})
      .catch(err=>{setError(`Failed to load data (${err}).`);})
      .finally(()=>setLoading(false));
  },[userId]);

  const goalObj=CAREER_GOALS.find(g=>g.id===goal)||CAREER_GOALS[0];

  if(loading)return e("div",{style:{maxWidth:760,margin:"0 auto",padding:"0 20px 60px"}},
    e("div",{style:{marginBottom:18}},e(Sk,{w:"40%",h:22,mb:0})),
    [1,2,3].map(i=>e(SkCard,{key:i}))
  );
  if(error)return e("div",{style:{maxWidth:760,margin:"40px auto",padding:"0 20px",textAlign:"center"}},
    e("p",{style:{fontFamily:FB,color:C.coral}}),error,
    e("button",{onClick:()=>setError(null),style:{...gBtn,marginTop:12}},"Retry")
  );

  const hasSessions=sessions.length>0;
  // Build chart data: last 8 sessions with scores
  const chartSessions=sessions.slice(0,8).reverse();
  const chartData=chartSessions.map((s,i)=>{
    const dt=s.created_at?new Date(s.created_at).toLocaleDateString("en-IN",{month:"short",day:"numeric"}):`S${i+1}`;
    return {
      name:dt,
      fluency:s.fluency||0,
      grammar:s.grammar||0,
      confidence:s.confidence||0,
      pronunciation:s.pronunciation||0,
      pace:s.pace||0,
      fillers:s.fillers||0,
      relevancy:s.relevancy||0,
    };
  });

  // Summary stats
  const latest=sessions[0]||{};
  const streak=computeStreak(sessions.map(s=>({date:s.created_at})));
  const totalSessions=sessions.length;
  const avgOverall=sessions.length?Math.round(sessions.reduce((a,s)=>a+(s.overall||0),0)/sessions.length):0;
  const bestScore=sessions.reduce((b,s)=>Math.max(b,s.overall||0),0);

  return e("main",{className:"cc-fade",style:{maxWidth:820,margin:"0 auto",padding:"0 20px 60px"}},
    /* Header row */
    e("div",{style:{display:"flex",justifyContent:"space-between",alignItems:"flex-start",flexWrap:"wrap",gap:12,marginBottom:22}},
      e("div",null,
        e("h1",{style:{fontFamily:FD,fontWeight:700,fontSize:22,color:C.text,margin:0}},"Your Dashboard"),
        e("p",{style:{fontFamily:FB,fontSize:13,color:C.muted,marginTop:3}},
          goalObj.icon," ",goalObj.label," · ",userId
        )
      ),
      hasSessions&&e("button",{onClick:onGoToInterview,style:pBtn},
        e(SvgPlay,{size:14,color:C.bg}),"Practice now"
      )
    ),
    /* KPI row */
    e("div",{style:{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(130px,1fr))",gap:10,marginBottom:22}},
      e(_KpiCard,{label:"Sessions",value:totalSessions,color:C.purple,icon:SvgHistory}),
      e(_KpiCard,{label:"Avg Score",value:avgOverall,color:colorForScore(avgOverall),icon:SvgAward,suffix:"/100"}),
      e(_KpiCard,{label:"Best Score",value:bestScore,color:colorForScore(bestScore),icon:SvgTarget,suffix:"/100"}),
      e(_KpiCard,{label:"Streak",value:streak,color:C.mint,icon:SvgFlame,suffix:" days"})
    ),
    !hasSessions&&e("div",{style:{textAlign:"center",padding:"40px 20px",background:C.card,border:`1px solid ${C.border}`,borderRadius:18}},
      e(SvgTrend,{size:32,color:C.muted}),
      e("h3",{style:{fontFamily:FD,fontWeight:600,fontSize:17,color:C.text,margin:"12px 0 6px"}},"No data yet"),
      e("p",{style:{fontFamily:FB,fontSize:13,color:C.muted,marginBottom:18,lineHeight:1.6}},
        "Complete your first session to see personalised trends and coaching graphs."
      ),
      e("button",{onClick:onGoToInterview,style:pBtn},e(SvgPlay,{size:14,color:C.bg}),"Start interview")
    ),
    hasSessions&&e(Fragment,null,
      /* Increase section */
      e("div",{style:{background:C.bg2,border:`1px solid ${C.border}`,borderRadius:16,padding:"16px 18px",marginBottom:16}},
        e("div",{style:{display:"flex",alignItems:"center",gap:7,marginBottom:14}},
          e(SvgTrend,{size:15,color:C.mint}),
          e("span",{style:{fontFamily:FD,fontWeight:600,fontSize:14,color:C.mint}},"Aim to increase ↑"),
          e("span",{style:{fontFamily:FB,fontSize:12,color:C.muted,marginLeft:"auto"}},"higher is better")
        ),
        chartData.length>=2&&e("div",{style:{height:200,marginBottom:16}},
          e(ResponsiveContainer,{width:"100%",height:"100%"},
            e(LineChart,{data:chartData,margin:{top:4,right:8,left:-20,bottom:0}},
              e(CartesianGrid,{strokeDasharray:"3 3",stroke:C.border}),
              e(XAxis,{dataKey:"name",tick:{fill:C.muted,fontSize:11},axisLine:false,tickLine:false}),
              e(YAxis,{domain:[0,100],tick:{fill:C.muted,fontSize:11},axisLine:false,tickLine:false}),
              e(Tooltip,{contentStyle:{background:C.card,border:`1px solid ${C.border}`,borderRadius:10,color:C.text,fontFamily:FB,fontSize:12},itemStyle:{color:C.text}}),
              e(Legend,{wrapperStyle:{fontFamily:FB,fontSize:11,color:C.muted}}),
              e(Line,{type:"monotone",dataKey:"fluency",stroke:C.coral,strokeWidth:2,dot:{r:3},name:"Fluency"}),
              e(Line,{type:"monotone",dataKey:"grammar",stroke:C.yellow,strokeWidth:2,dot:{r:3},name:"Grammar"}),
              e(Line,{type:"monotone",dataKey:"confidence",stroke:C.mint,strokeWidth:2,dot:{r:3},name:"Confidence"}),
              e(Line,{type:"monotone",dataKey:"pronunciation",stroke:C.purple,strokeWidth:2,dot:{r:3},name:"Pronunciation"})
            )
          )
        ),
        e("div",{style:{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(130px,1fr))",gap:10}},
          e(MetricCard,{label:"Fluency",value:latest.fluency||0,color:C.coral,suffix:"/100"}),
          e(MetricCard,{label:"Grammar",value:latest.grammar||0,color:C.yellow,suffix:"/100"}),
          e(MetricCard,{label:"Confidence",value:latest.confidence||0,color:C.mint,suffix:"/100"}),
          e(MetricCard,{label:"Pronunciation",value:latest.pronunciation||0,color:C.purple,suffix:"/100"}),
          latest.relevancy>0&&e(MetricCard,{label:"Relevancy",value:latest.relevancy||0,color:C.coral,suffix:"/100"})
        )
      ),
      /* Decrease section */
      e("div",{style:{background:C.bg2,border:`1px solid ${C.border}`,borderRadius:16,padding:"16px 18px",marginBottom:22}},
        e("div",{style:{display:"flex",alignItems:"center",gap:7,marginBottom:14}},
          e(SvgFlame,{size:15,color:C.fillerTone}),
          e("span",{style:{fontFamily:FD,fontWeight:600,fontSize:14,color:C.fillerTone}},"Aim to reduce ↓"),
          e("span",{style:{fontFamily:FB,fontSize:12,color:C.muted,marginLeft:"auto"}},"lower is better")
        ),
        chartData.length>=2&&e("div",{style:{height:180,marginBottom:16}},
          e(ResponsiveContainer,{width:"100%",height:"100%"},
            e(BarChart,{data:chartData,margin:{top:4,right:8,left:-20,bottom:0}},
              e(CartesianGrid,{strokeDasharray:"3 3",stroke:C.border}),
              e(XAxis,{dataKey:"name",tick:{fill:C.muted,fontSize:11},axisLine:false,tickLine:false}),
              e(YAxis,{tick:{fill:C.muted,fontSize:11},axisLine:false,tickLine:false}),
              e(Tooltip,{contentStyle:{background:C.card,border:`1px solid ${C.border}`,borderRadius:10,color:C.text,fontFamily:FB,fontSize:12},itemStyle:{color:C.text}}),
              e(Legend,{wrapperStyle:{fontFamily:FB,fontSize:11,color:C.muted}}),
              e(Bar,{dataKey:"fillers",fill:C.fillerTone,name:"Filler words",radius:[3,3,0,0]}),
              e(Bar,{dataKey:"pace",fill:C.purple,name:"Pace score",radius:[3,3,0,0]})
            )
          )
        ),
        e("div",{style:{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(130px,1fr))",gap:10}},
          e(MetricCard,{label:"Filler words",value:latest.fillers||0,color:C.fillerTone,inverse:true,note:"count per session"}),
          e(MetricCard,{label:"Pace (0=bad)",value:latest.pace||0,color:C.purple,note:"aim for 100"})
        )
      ),
      /* Recent sessions list */
      e(STitle,{text:"Recent sessions",Icon:SvgHistory}),
      e("div",{style:{display:"flex",flexDirection:"column",gap:8}},
        sessions.slice(0,5).map(s=>e(_SessionRow,{key:s.id,session:s}))
      )
    )
  );
}

function _KpiCard({label,value,color,icon:Icon,suffix=""}){
  return e("div",{style:{background:C.card,border:`1px solid ${C.border}`,borderRadius:14,padding:"14px 16px",textAlign:"center"}},
    e(Icon,{size:20,color}),
    e("div",{style:{fontFamily:FM,fontWeight:700,fontSize:22,color,margin:"6px 0 2px"}},value,e("span",{style:{fontSize:12,color:C.muted,fontWeight:400}},suffix)),
    e("div",{style:{fontFamily:FB,fontSize:11,color:C.muted}},label)
  );
}

function _SessionRow({session}){
  const dt=session.created_at?new Date(session.created_at).toLocaleString("en-IN",{month:"short",day:"numeric",hour:"2-digit",minute:"2-digit"}):"";
  const score=session.overall||0;
  const color=colorForScore(score);
  return e("div",{style:{background:C.card,border:`1px solid ${C.border}`,borderRadius:12,padding:"12px 14px",display:"flex",alignItems:"center",gap:12,flexWrap:"wrap"}},
    e("div",{style:{width:42,height:42,borderRadius:"50%",background:`conic-gradient(${color} ${score*3.6}deg,${C.bg2} ${score*3.6}deg)`,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}},
      e("div",{style:{width:32,height:32,borderRadius:"50%",background:C.card,display:"flex",alignItems:"center",justifyContent:"center"}},
        e("span",{style:{fontFamily:FM,fontSize:11,color:C.text,fontWeight:700}},score)
      )
    ),
    e("div",{style:{flex:1,minWidth:100}},
      e("div",{style:{fontFamily:FD,fontWeight:600,fontSize:13,color:C.text}},session.topic||"Untitled session"),
      e("div",{style:{fontFamily:FM,fontSize:11,color:C.muted,marginTop:2}},dt," · ",session.type)
    ),
    e("div",{style:{display:"flex",gap:6,flexWrap:"wrap"}},
      session.fluency>0&&e(Pill,{text:`Fluency ${session.fluency}`,color:C.coral}),
      session.grammar>0&&e(Pill,{text:`Grammar ${session.grammar}`,color:C.yellow})
    )
  );
}
