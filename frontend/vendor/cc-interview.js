/* cc-interview.js — Mock Interview tab (page 3)
   Depends on: cc-globals.js, cc-primitives.js                             */
"use strict";

function InterviewPage({userId,goal,resume,onDone,phase,setPhase,sessionRef}){
  // phase: "setup" | "interview" | "complete"
  const [interviewType,setInterviewType]=useState("Technical");
  const [topic,setTopic]=useState("general software engineering");
  const [starting,setStarting]=useState(false);
  const [question,setQuestion]=useState("");
  const [turnCount,setTurnCount]=useState(0);
  const [totalTurns]=useState(TOTAL_QUESTIONS);
  const [feedbackText,setFeedbackText]=useState("");
  const [sessionReport,setSessionReport]=useState(null);
  const [answering,setAnswering]=useState(false);
  const [audioSource,setAudioSource]=useState("text");
  const [textAnswer,setTextAnswer]=useState("");
  const [isRecording,setIsRecording]=useState(false);
  const [recordSecs,setRecordSecs]=useState(0);
  const [micError,setMicError]=useState(null);
  const [allFeedbacks,setAllFeedbacks]=useState([]);
  const [allReports,setAllReports]=useState([]);
  const [questions,setQuestions]=useState([]);
  // Refs to avoid stale closure in submitAnswer
  const allFeedbacksRef=useRef([]);
  const allReportsRef=useRef([]);
  const questionsRef=useRef([]);
  const fileInputRef=useRef(null);
  const mediaRecorderRef=useRef(null);
  const streamRef=useRef(null);
  const timerRef=useRef(null);
  const recordSecsRef=useRef(0);
  const fmt=s=>`${Math.floor(s/60)}:${String(s%60).padStart(2,"0")}`;

  useEffect(()=>()=>{
    clearInterval(timerRef.current);
    streamRef.current?.getTracks().forEach(t=>t.stop());
  },[]);

  // Derive topic from goal
  useEffect(()=>{
    const g=CAREER_GOALS.find(x=>x.id===goal);
    if(g){
      const topicMap={
        "SDE":"software engineering system design",
        "AI Engineer":"machine learning and AI engineering",
        "Data Scientist":"data science and analytics",
        "QA Engineer":"software quality assurance and testing",
        "DevOps":"DevOps and site reliability engineering",
        "Product Manager":"product management and strategy",
        "HR":"HR and behavioural competencies",
      };
      setTopic(topicMap[g.id]||"general software engineering");
    }
  },[goal]);

  const goalObj=CAREER_GOALS.find(g=>g.id===goal)||CAREER_GOALS[0];

  const startInterview=async()=>{
    if(!resume){window.ccToast("Upload your CV first — questions will be tailored to it","error",4000);return;}
    setStarting(true);
    try{
      const body={
        user_id:userId,
        topic:`${interviewType} interview for ${goalObj.label}: ${topic}`,
        resume_text:resume?.text||resume?.summary||"",
        user_goal:goal||"SDE",
      };
      const r=await fetch(`${API_URL}/interview/start`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(body)});
      if(!r.ok)throw new Error(`Server error ${r.status}`);
      const d=await r.json();
      sessionRef.current={sessionId:d.session_id,dbSessionId:d.db_session_id};
      setQuestion(d.question||"");
      questionsRef.current=[d.question||""];
      setQuestions([d.question||""]);
      setTurnCount(1);
      setPhase("interview");
      window.ccToast("Interview started — good luck!","success");
    }catch(err){
      window.ccToast(err.message||"Failed to start interview","error");
    }
    setStarting(false);
  };

  const submitAnswer=async(audioBlob,textInput)=>{
    if(!sessionRef.current?.sessionId)return;
    setAnswering(true);setFeedbackText("");setSessionReport(null);
    try{
      const form=new FormData();
      form.append("session_id",sessionRef.current.sessionId);
      form.append("user_id",userId);
      if(sessionRef.current.dbSessionId)form.append("db_session_id",sessionRef.current.dbSessionId);
      if(audioBlob){form.append("file",audioBlob,"answer.webm");}
      else if(textInput){form.append("transcript",textInput);}
      const r=await fetch(`${API_URL}/interview/answer`,{method:"POST",body:form});
      if(!r.ok)throw new Error(`Server error ${r.status}`);
      const d=await r.json();
      setFeedbackText(d.feedback||"");
      setSessionReport(d.session_report||null);
      const newFb=[...allFeedbacksRef.current,d.feedback||""];
      const newRpts=[...allReportsRef.current,d.session_report||null];
      allFeedbacksRef.current=newFb;
      allReportsRef.current=newRpts;
      setAllFeedbacks(newFb);
      setAllReports(newRpts);
      const nextQ=d.next_question||"";
      const nextTurn=d.turn_count||turnCount+1;
      if(nextTurn>=totalTurns||!nextQ){
        setPhase("complete");
        if(onDone)onDone({allFeedbacks:newFb,allReports:newRpts,questions:questionsRef.current});
      }else{
        questionsRef.current=[...questionsRef.current,nextQ];
        setQuestions(p=>[...p,nextQ]);
        setQuestion(nextQ);
        setTurnCount(nextTurn);
        setFeedbackText(d.feedback||"");
        setSessionReport(d.session_report||null);
      }
      setTextAnswer("");
    }catch(err){
      window.ccToast(err.message||"Failed to submit answer","error");
    }
    setAnswering(false);
  };

  const startRecording=async()=>{
    setMicError(null);
    if(!navigator.mediaDevices||!window.MediaRecorder){setMicError("Live recording not supported — use text input.");return;}
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
        submitAnswer(blob,null);
      };
      mediaRecorderRef.current=recorder;
      recorder.start();
      setIsRecording(true);setRecordSecs(0);recordSecsRef.current=0;
      timerRef.current=setInterval(()=>{recordSecsRef.current+=1;setRecordSecs(recordSecsRef.current);},1000);
    }catch(_){setMicError("Microphone access denied.");}
  };
  const stopRecording=()=>{
    if(mediaRecorderRef.current&&mediaRecorderRef.current.state!=="inactive")mediaRecorderRef.current.stop();
    setIsRecording(false);
  };

  // ── Setup phase ──
  if(phase==="setup"){
    return e("main",{className:"cc-fade",style:{maxWidth:640,margin:"0 auto",padding:"0 20px 60px"}},
      e("div",{style:{textAlign:"center",marginBottom:24}},
        e("div",{style:{fontSize:36,marginBottom:10}},goalObj.icon),
        e("h1",{style:{fontFamily:FD,fontWeight:700,fontSize:"clamp(22px,4vw,32px)",color:C.text,marginBottom:8}},
          "Mock Interview"
        ),
        e("p",{style:{fontFamily:FB,color:C.muted,fontSize:14,lineHeight:1.6}},
          `Tailored for ${goalObj.label} — ${TOTAL_QUESTIONS} questions, real-time feedback after each answer.`
        )
      ),
      !resume&&e("div",{role:"alert",style:{background:C.coralSoft,border:`1px solid ${C.coral}55`,borderRadius:12,padding:"12px 16px",marginBottom:18,fontFamily:FB,fontSize:13,color:C.text}},
        e("strong",{style:{color:C.coral}},"CV required: "),
        "Go to CV & Setup tab and upload your resume — questions will be generated from it."
      ),
      e("div",{style:{background:C.card,border:`1px solid ${C.border}`,borderRadius:18,padding:22,marginBottom:18}},
        e("div",{style:{marginBottom:16}},
          e(Label,{Icon:SvgBriefcase,text:"Interview type"}),
          e(ChipRow,{options:INTERVIEW_TYPES,value:interviewType,onChange:setInterviewType,accent:C.mint})
        ),
        e("div",{style:{marginBottom:4}},
          e(Label,{Icon:SvgTarget,text:"Topic focus"}),
          e("input",{className:"cc-input",value:topic,onChange:ev=>setTopic(ev.target.value),
            placeholder:"e.g. system design, ML pipelines, data structures…"})
        )
      ),
      e("button",{
        onClick:startInterview,
        disabled:starting||!resume,
        style:{...pBtn,width:"100%",fontSize:15,padding:"15px 20px",opacity:starting||!resume?0.6:1}
      },
        starting?e(Fragment,null,e(Waveform,{count:8,height:18,animated:true})," Generating first question…")
                :e(Fragment,null,e(SvgPlay,{size:17,color:C.bg}),"Start interview")
      )
    );
  }

  // ── Complete phase ──
  if(phase==="complete"){
    const avgScore=allReports.filter(Boolean).reduce((s,r)=>s+(r?.overall_score||0),0)/Math.max(allReports.filter(Boolean).length,1);
    return e("main",{className:"cc-fade",style:{maxWidth:700,margin:"0 auto",padding:"0 20px 60px"}},
      e("div",{style:{textAlign:"center",marginBottom:24}},
        e(ScoreRing,{value:Math.round(avgScore),size:100}),
        e("h2",{style:{fontFamily:FD,fontWeight:700,fontSize:22,color:C.text,marginTop:14,marginBottom:6}},"Interview Complete!"),
        e("p",{style:{fontFamily:FB,color:C.muted,fontSize:13.5,lineHeight:1.6}},"Average score across all answers.")
      ),
      e("div",{style:{display:"flex",flexDirection:"column",gap:14,marginBottom:24}},
        questions.map((q,i)=>e("div",{key:i,style:{background:C.card,border:`1px solid ${C.border}`,borderRadius:14,padding:16}},
          e("div",{style:{fontFamily:FM,fontSize:11,color:C.muted,marginBottom:6}},`Question ${i+1}`),
          e("div",{style:{fontFamily:FB,fontWeight:500,fontSize:14,color:C.text,marginBottom:8}},q),
          allFeedbacks[i]&&e("details",null,
            e("summary",{style:{fontFamily:FB,fontSize:12.5,color:C.coral,cursor:"pointer",marginBottom:4}},"Show feedback"),
            e("div",{style:{fontFamily:FB,fontSize:13,color:C.muted,lineHeight:1.65,marginTop:8,whiteSpace:"pre-wrap"}},
              allFeedbacks[i].replace(/#{1,3} ?/g,"").replace(/\*\*([^*]+)\*\*/g,"$1")
            )
          ),
          allReports[i]&&e("div",{style:{display:"flex",gap:8,flexWrap:"wrap",marginTop:8}},
            allReports[i].overall_score!=null&&e(Pill,{text:`Overall: ${allReports[i].overall_score}`,color:colorForScore(allReports[i].overall_score)}),
            allReports[i].fluency_score!=null&&e(Pill,{text:`Fluency: ${allReports[i].fluency_score}`,color:C.purple}),
            allReports[i].filler_word_count>0&&e(Pill,{text:`Fillers: ${allReports[i].filler_word_count}`,color:C.fillerTone})
          )
        ))
      ),
      e("div",{style:{display:"flex",gap:10,flexWrap:"wrap"}},
        e("button",{onClick:()=>{setPhase("setup");setAllFeedbacks([]);setAllReports([]);setQuestions([]);},style:pBtn},"New interview"),
        e("button",{onClick:()=>window.ccToast("View Dashboard for trends","info"),style:sBtn},"View dashboard")
      )
    );
  }

  // ── Interview phase ──
  const scoreColor=sessionReport?colorForScore(sessionReport.overall_score||0):C.muted;
  return e("main",{className:"cc-fade",style:{maxWidth:720,margin:"0 auto",padding:"0 20px 60px"}},
    /* Progress bar */
    e("div",{style:{marginBottom:18}},
      e("div",{style:{display:"flex",justifyContent:"space-between",marginBottom:6}},
        e("span",{style:{fontFamily:FM,fontSize:11,color:C.muted}},`Question ${turnCount} of ${totalTurns}`),
        e("span",{style:{fontFamily:FM,fontSize:11,color:C.muted}},goalObj.icon," ",goalObj.label)
      ),
      e("div",{role:"progressbar","aria-valuenow":turnCount,"aria-valuemin":0,"aria-valuemax":totalTurns,
        style:{height:5,borderRadius:3,background:C.bg2}},
        e("div",{style:{width:`${(turnCount/totalTurns)*100}%`,height:"100%",background:C.coral,borderRadius:3,transition:"width .4s ease"}})
      )
    ),
    /* Current question */
    e("div",{style:{background:C.card,border:`1px solid ${C.border}`,borderRadius:16,padding:20,marginBottom:16}},
      e("div",{style:{display:"flex",alignItems:"center",gap:8,marginBottom:10}},
        e(SvgMsg,{size:14,color:C.coral}),
        e("span",{style:{fontFamily:FM,fontSize:11,color:C.coral,textTransform:"uppercase",letterSpacing:0.5}},"Interviewer")
      ),
      e("p",{style:{fontFamily:FB,fontSize:15,color:C.text,lineHeight:1.7,margin:0}},question)
    ),
    /* Feedback from previous answer */
    feedbackText&&e("div",{className:"cc-fade",style:{background:C.bg2,border:`1px solid ${C.border}`,borderRadius:14,padding:16,marginBottom:16}},
      e("div",{style:{display:"flex",alignItems:"center",gap:6,marginBottom:10}},
        e(SvgSparkle,{size:13,color:C.purple}),
        e("span",{style:{fontFamily:FM,fontSize:11,color:C.purple,textTransform:"uppercase",letterSpacing:0.5}},"Feedback on previous answer")
      ),
      sessionReport&&e("div",{style:{display:"flex",gap:8,flexWrap:"wrap",marginBottom:10}},
        sessionReport.overall_score!=null&&e("span",{style:{fontFamily:FM,fontSize:12,color:scoreColor,border:`1px solid ${scoreColor}55`,borderRadius:999,padding:"3px 10px"}},
          `Overall: ${sessionReport.overall_score}/100`
        ),
        sessionReport.fluency_score!=null&&e("span",{style:{fontFamily:FM,fontSize:12,color:C.muted,border:`1px solid ${C.border}`,borderRadius:999,padding:"3px 10px"}},
          `Fluency: ${sessionReport.fluency_score}`
        ),
        sessionReport.filler_word_count>0&&e("span",{style:{fontFamily:FM,fontSize:12,color:C.fillerTone,border:`1px solid ${C.fillerTone}55`,borderRadius:999,padding:"3px 10px"}},
          `Fillers: ${sessionReport.filler_word_count}`
        )
      ),
      e("div",{style:{fontFamily:FB,fontSize:13,color:C.muted,lineHeight:1.7,maxHeight:180,overflowY:"auto",whiteSpace:"pre-wrap"},className:"cc-scroll"},
        feedbackText.replace(/#{1,3} ?/g,"").replace(/\*\*([^*]+)\*\*/g,"$1")
      )
    ),
    /* Answer input */
    !answering&&e("div",{style:{background:C.card,border:`1px solid ${C.border}`,borderRadius:16,padding:20}},
      e("div",{style:{display:"flex",alignItems:"center",gap:6,marginBottom:14}},
        e(SvgMic,{size:13,color:C.muted}),
        e("span",{style:{fontFamily:FM,fontSize:11,color:C.muted,textTransform:"uppercase",letterSpacing:0.5}},"Your answer")
      ),
      e("div",{role:"group","aria-label":"Answer input mode",style:{display:"flex",gap:8,marginBottom:14}},
        e("button",{onClick:()=>setAudioSource("text"),"aria-pressed":audioSource==="text",
          style:{flex:1,padding:"8px 12px",borderRadius:10,cursor:"pointer",fontFamily:FB,fontWeight:500,fontSize:12.5,
            border:`1px solid ${audioSource==="text"?C.coral:C.border}`,
            background:audioSource==="text"?C.coralSoft:"transparent",color:audioSource==="text"?C.coral:C.muted}},
          "Type answer"
        ),
        e("button",{onClick:()=>setAudioSource("record"),"aria-pressed":audioSource==="record",
          style:{flex:1,padding:"8px 12px",borderRadius:10,cursor:"pointer",fontFamily:FB,fontWeight:500,fontSize:12.5,
            border:`1px solid ${audioSource==="record"?C.coral:C.border}`,
            background:audioSource==="record"?C.coralSoft:"transparent",color:audioSource==="record"?C.coral:C.muted}},
          e(SvgMic,{size:13})," Record"
        ),
        e("button",{onClick:()=>setAudioSource("upload"),"aria-pressed":audioSource==="upload",
          style:{flex:1,padding:"8px 12px",borderRadius:10,cursor:"pointer",fontFamily:FB,fontWeight:500,fontSize:12.5,
            border:`1px solid ${audioSource==="upload"?C.coral:C.border}`,
            background:audioSource==="upload"?C.coralSoft:"transparent",color:audioSource==="upload"?C.coral:C.muted}},
          e(SvgUpload,{size:13})," Upload"
        )
      ),
      audioSource==="text"&&e(Fragment,null,
        e("textarea",{className:"cc-textarea",value:textAnswer,onChange:ev=>setTextAnswer(ev.target.value),
          placeholder:"Type your answer here… (use STAR: Situation, Task, Action, Result)",
          style:{marginBottom:10,minHeight:110}}),
        e("button",{onClick:()=>submitAnswer(null,textAnswer),disabled:!textAnswer.trim(),
          style:{...pBtn,width:"100%",opacity:textAnswer.trim()?1:0.5}},
          e(SvgArrow,{size:15,color:C.bg}),"Submit answer"
        )
      ),
      audioSource==="record"&&e("div",{style:{border:`2px dashed ${isRecording?C.coral:C.border}`,borderRadius:14,padding:"22px 16px",textAlign:"center"}},
        !isRecording
          ?e(Fragment,null,
              e("button",{onClick:startRecording,"aria-label":"Start recording",
                style:{width:56,height:56,borderRadius:"50%",border:"none",cursor:"pointer",background:C.coral,display:"flex",alignItems:"center",justifyContent:"center",margin:"0 auto 12px",boxShadow:`0 0 0 6px ${C.coralSoft}`}},
                e(SvgMic,{size:22,color:C.bg})
              ),
              e("p",{style:{fontFamily:FB,fontSize:13.5,color:C.text,marginBottom:4}},"Tap to record your answer"),
              micError&&e("p",{role:"alert",style:{fontFamily:FB,fontSize:12,color:C.coral,marginTop:8}},micError)
            )
          :e(Fragment,null,
              e("div",{style:{display:"flex",justifyContent:"center",alignItems:"center",gap:8,marginBottom:10}},
                e("span",{"aria-hidden":"true",style:{width:9,height:9,borderRadius:"50%",background:C.coral,display:"inline-block"}}),
                e("span",{"aria-live":"polite",style:{fontFamily:FM,fontSize:13,color:C.coral}},`Recording… ${fmt(recordSecs)}`)
              ),
              e(Waveform,{count:24,height:40,animated:true}),
              e("button",{onClick:stopRecording,style:{...pBtn,width:"100%",marginTop:16}},"Stop & submit")
            )
      ),
      audioSource==="upload"&&e(Fragment,null,
        e("input",{ref:fileInputRef,type:"file",accept:"audio/*",style:{display:"none"},
          onChange:ev=>{const f=ev.target.files?.[0];if(f)submitAnswer(f,null);}}),
        e("button",{onClick:()=>fileInputRef.current?.click(),
          style:{width:"100%",border:`2px dashed ${C.border}`,borderRadius:14,padding:"22px 16px",
            background:"transparent",cursor:"pointer",color:C.muted,fontFamily:FB,fontSize:13}},
          e(SvgUpload,{size:18,color:C.muted}),
          e("div",{style:{marginTop:8}},"Click to upload audio answer")
        )
      )
    ),
    answering&&e("div",{role:"status","aria-live":"polite",style:{background:C.card,border:`1px solid ${C.border}`,borderRadius:16,padding:24,textAlign:"center"}},
      e(Waveform,{count:20,height:36,animated:true}),
      e("p",{style:{fontFamily:FM,fontSize:12,color:C.muted,marginTop:12}},"Evaluating your answer & generating next question…")
    )
  );
}
