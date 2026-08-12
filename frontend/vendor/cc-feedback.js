/* cc-feedback.js — Feedback page (page 2): score cards, transcript with
   highlighted fillers, coaching plan.
   Depends on: cc-globals.js, cc-primitives.js                             */
"use strict";

function FeedbackPage({session,onStartInterview,onViewDashboard,onRetry}){
  if(!session)return e("div",{className:"cc-fade",style:{maxWidth:600,margin:"60px auto",textAlign:"center",padding:"0 20px"}},
    e("p",{style:{fontFamily:FB,color:C.muted,marginBottom:16}},"No session analyzed yet — go to CV & Setup first."),
    e("button",{onClick:onRetry,style:pBtn},"Go to CV & Setup")
  );
  const fb=session.feedback||{};
  const showPS=session.practiceMode==="Public Speaking"||session.practiceMode==="Presentation Practice";
  return e("main",{className:"cc-fade",style:{maxWidth:820,margin:"0 auto",padding:"0 20px 60px"}},
    /* Tags + new-session button */
    e("div",{style:{display:"flex",justifyContent:"space-between",alignItems:"center",flexWrap:"wrap",gap:12,marginBottom:22}},
      e("div",{style:{display:"flex",gap:8,flexWrap:"wrap"}},
        e(Pill,{text:session.interviewType,color:C.mint}),
        e(Pill,{text:session.practiceMode,color:C.purple}),
        e(Pill,{text:session.language,color:C.coral})
      ),
      e("button",{onClick:onRetry,style:gBtn},e(SvgRotate,{size:13})," New session")
    ),
    /* Overall score hero */
    e("div",{style:{display:"flex",gap:24,alignItems:"center",flexWrap:"wrap",background:C.card,border:`1px solid ${C.border}`,borderRadius:20,padding:24,marginBottom:22}},
      e(ScoreRing,{value:fb.overall||0}),
      e("div",{style:{flex:1,minWidth:200}},
        e("h2",{style:{fontFamily:FD,fontWeight:700,fontSize:20,color:C.text,marginBottom:6,margin:"0 0 6px"}},fb.summary||"Analysis complete."),
        e("p",{style:{fontFamily:FB,fontSize:13.5,color:C.muted,lineHeight:1.6,margin:0}},"Fluency, grammar, pronunciation, confidence, emotion, and pace — all in one view.")
      )
    ),
    /* Metrics: things to INCREASE (higher = better) */
    e("div",{style:{background:C.bg2,border:`1px solid ${C.border}`,borderRadius:14,padding:"14px 16px",marginBottom:16}},
      e("div",{style:{display:"flex",alignItems:"center",gap:6,marginBottom:12}},
        e(SvgTrend,{size:14,color:C.mint}),
        e("span",{style:{fontFamily:FM,fontSize:11,color:C.mint,textTransform:"uppercase",letterSpacing:0.5}},"Aim to increase ↑")
      ),
      e("div",{style:{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(140px,1fr))",gap:10}},
        e(MetricCard,{label:"Fluency",value:fb.fluency||0,color:C.coral,suffix:"/100"}),
        e(MetricCard,{label:"Grammar",value:fb.grammar||0,color:C.yellow,suffix:"/100"}),
        e(MetricCard,{label:"Pronunciation",value:fb.pronunciation||0,color:C.mint,suffix:"/100"}),
        e(MetricCard,{label:"Confidence",value:fb.confidence||0,color:C.coral,suffix:"/100"}),
        (fb.relevancy>0)&&e(MetricCard,{label:"Answer Relevancy",value:fb.relevancy||0,color:C.purple,suffix:"/100",note:"vs question asked"}),
        e(MetricCard,{label:"Pace score",value:fb.pace||0,color:C.purple,suffix:"/100"})
      )
    ),
    /* Metrics: things to REDUCE (lower = better) */
    e("div",{style:{background:C.bg2,border:`1px solid ${C.border}`,borderRadius:14,padding:"14px 16px",marginBottom:22}},
      e("div",{style:{display:"flex",alignItems:"center",gap:6,marginBottom:12}},
        e(SvgFlame,{size:14,color:C.fillerTone}),
        e("span",{style:{fontFamily:FM,fontSize:11,color:C.fillerTone,textTransform:"uppercase",letterSpacing:0.5}},"Aim to reduce ↓")
      ),
      e("div",{style:{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(140px,1fr))",gap:10}},
        e(MetricCard,{label:"Filler words",value:fb.fillers||0,color:C.fillerTone,note:`${fb.fillersPerMinute||0}/min`,inverse:true}),
        e(MetricCard,{label:"Pace (WPM)",value:fb.wpm||0,color:C.purple,note:fb.paceNote}),
        e(MetricCard,{label:"Emotion",value:fb.emotion||"—",color:C.yellow,note:"Acoustic read"})
      )
    ),
    /* Public speaking extras */
    showPS&&fb.publicSpeaking&&e(Fragment,null,
      e(STitle,{text:"Public speaking breakdown",Icon:SvgUsers}),
      e("div",{style:{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(160px,1fr))",gap:12,marginBottom:22}},
        e(MetricCard,{label:"Storytelling",value:fb.publicSpeaking.storytelling||0,color:C.coral,suffix:"/100"}),
        e(MetricCard,{label:"Audience engagement",value:fb.publicSpeaking.audienceEngagement||0,color:C.yellow,suffix:"/100"}),
        e(MetricCard,{label:"Presentation flow",value:fb.publicSpeaking.presentationFlow||0,color:C.mint,suffix:"/100"})
      )
    ),
    /* Transcript with filler highlights */
    e(STitle,{text:"Transcript",Icon:SvgVolume}),
    e("div",{className:"cc-scroll","aria-label":"Transcript with filler words highlighted in yellow",
      style:{background:C.card,border:`1px solid ${C.border}`,borderRadius:14,padding:18,fontFamily:FB,fontSize:14,lineHeight:2,color:C.text,marginBottom:22,maxHeight:220,overflowY:"auto"}},
      (session.transcript||[]).map((tok,i)=>tok.f
        ?e("mark",{key:i,title:"Filler word",style:{background:C.yellowSoft,color:C.yellow,borderRadius:5,padding:"1px 4px",fontWeight:500,cursor:"help"}},tok.t)
        :e("span",{key:i},tok.t)
      )
    ),
    /* Coaching plan */
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
    /* CTA row */
    e("div",{style:{display:"flex",gap:12,flexWrap:"wrap"}},
      e("button",{onClick:onStartInterview,style:pBtn},"Start mock interview ",e(SvgArrow,{size:15,color:C.bg})),
      e("button",{onClick:onViewDashboard,style:sBtn},"View dashboard"),
      e("button",{onClick:onRetry,style:sBtn},"Practice again")
    )
  );
}
