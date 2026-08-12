/* cc-assessment.js — CV & Setup tab (page 1): language, practice-mode, resume,
   audio upload / live record, analysis progress.
   Depends on: cc-globals.js, cc-primitives.js                             */
"use strict";

function AssessmentPage({onDone,resume,setResume,onUploadingChange,userId,goal}){
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
  const fmt=s=>`${Math.floor(s/60)}:${String(s%60).padStart(2,"0")}`;

  useEffect(()=>()=>{clearInterval(timerRef.current);streamRef.current?.getTracks().forEach(t=>t.stop());},[]);

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
    if(!resume){setApiError("Resume upload is mandatory. Please upload your CV first.");return;}
    setApiError(null);setUploading(true);if(onUploadingChange)onUploadingChange(true);startProgressAnimation();
    const lang=langMode==="manual"?manualLang:"English";
    try{
      const form=new FormData();
      form.append("file",audioFile,filename||"recording.webm");
      form.append("user_id",userId);
      if(interviewType)form.append("interview_topic",interviewType);
      if(goal)form.append("user_goal",goal);
      const resp=await fetch(`${API_URL}/analyze`,{method:"POST",body:form});
      if(!resp.ok){const err=await resp.text();throw new Error(`Server error ${resp.status}: ${err}`);}
      const data=await resp.json();
      stopProgressAnimation();
      if(data.detected_language){setDetected({lang:data.detected_language,confidence:data.detected_language_confidence??100});setRevealDetected(true);}
      else if(langMode==="manual"){setDetected({lang:manualLang,confidence:100});setRevealDetected(true);}
      const transcriptTokens=(data.transcript_tokens&&data.transcript_tokens.length>0)?data.transcript_tokens:_tokenizeFrontend(data.transcript||"",data.session_report);
      setTimeout(()=>onDone({language:data.detected_language||lang,interviewType,practiceMode,apiResponse:data,transcriptTokens}),400);
    }catch(err){
      stopProgressAnimation();setUploading(false);if(onUploadingChange)onUploadingChange(false);
      setApiError(err.message||"Analysis failed — please try again.");
    }
  };

  const startSampleAnalysis=async()=>{
    if(!resume){setApiError("Resume upload is mandatory. Please upload your CV first.");return;}
    setApiError(null);setUploading(true);if(onUploadingChange)onUploadingChange(true);startProgressAnimation();
    try{
      const resp=await fetch(`${API_URL}/analyze/text`,{method:"POST",headers:{"Content-Type":"application/json"},
        body:JSON.stringify({user_id:userId,transcript:MOCK_TRANSCRIPT_TEXT,interview_topic:interviewType,user_goal:goal||"SDE"})});
      if(!resp.ok)throw new Error(`Server error ${resp.status}`);
      const data=await resp.json();
      stopProgressAnimation();
      const transcriptTokens=(data.transcript_tokens&&data.transcript_tokens.length>0)?data.transcript_tokens:_tokenizeFrontend(data.transcript||MOCK_TRANSCRIPT_TEXT,data.session_report);
      const lang=langMode==="manual"?manualLang:"English";
      setTimeout(()=>onDone({language:lang,interviewType,practiceMode,apiResponse:data,transcriptTokens}),400);
    }catch(err){stopProgressAnimation();setUploading(false);if(onUploadingChange)onUploadingChange(false);setApiError(err.message||"Sample analysis failed.");}
  };

  const startRecording=async()=>{
    if(!resume){setMicError("Resume upload is mandatory. Please upload your CV first.");return;}
    setMicError(null);
    if(!navigator.mediaDevices||!window.MediaRecorder){setMicError("Live recording isn't supported in this browser. Upload a file instead.");return;}
    try{
      const stream=await navigator.mediaDevices.getUserMedia({audio:true});
      streamRef.current=stream;
      const chunks=[];
      const recorder=new MediaRecorder(stream);
      recorder.ondataavailable=ev=>{if(ev.data.size>0)chunks.push(ev.data);};
      recorder.onstop=()=>{
        stream.getTracks().forEach(t=>t.stop());clearInterval(timerRef.current);
        const blob=new Blob(chunks,{type:recorder.mimeType||"audio/webm"});
        runAnalysis(blob,"recording.webm");
      };
      mediaRecorderRef.current=recorder;
      recorder.start();setIsRecording(true);setRecordSeconds(0);recordSecondsRef.current=0;
      timerRef.current=setInterval(()=>{recordSecondsRef.current+=1;setRecordSeconds(recordSecondsRef.current);},1000);
    }catch(_){setMicError("Microphone access was blocked. Check browser permissions.");}
  };
  const stopRecording=()=>{if(mediaRecorderRef.current&&mediaRecorderRef.current.state!=="inactive")mediaRecorderRef.current.stop();setIsRecording(false);};

  const goalObj=CAREER_GOALS.find(g=>g.id===goal)||CAREER_GOALS[0];

  return e("main",{className:"cc-fade",style:{maxWidth:760,margin:"0 auto",padding:"0 20px 60px"}},
    /* Hero */
    e("div",{style:{textAlign:"center",marginBottom:28}},
      e("h1",{style:{fontFamily:FD,fontWeight:700,fontSize:"clamp(26px,5vw,40px)",color:C.text,lineHeight:1.1,margin:"0 0 12px",letterSpacing:-0.5}},
        "Speak. We'll tell you",e("br",null),"exactly how it landed."
      ),
      e("p",{style:{fontFamily:FB,color:C.muted,fontSize:15,maxWidth:480,margin:"0 auto",lineHeight:1.6}},
        "Upload your CV, pick a practice mode, and record your answer — CommCoach coaches you for ",
        e("strong",{style:{color:C.coral}},goalObj.icon," ",goalObj.label)," interviews."
      )
    ),
    e("div",{style:{display:"flex",justifyContent:"center",marginBottom:32},"aria-hidden":"true"},e(Waveform,{count:44,height:72})),

    e("div",{style:{background:C.card,border:`1px solid ${C.border}`,borderRadius:20,padding:24}},
      /* Language */
      e("div",{style:{marginBottom:18}},
        e(Label,{Icon:SvgLang,text:"Language"}),
        e("div",{role:"group","aria-label":"Language mode",style:{display:"flex",gap:8,marginBottom:langMode==="manual"?10:0}},
          e("button",{onClick:()=>setLangMode("auto"),disabled:uploading,
            "aria-pressed":langMode==="auto",
            style:{display:"flex",alignItems:"center",gap:6,padding:"7px 14px",borderRadius:999,fontFamily:FB,fontWeight:500,fontSize:13,
              cursor:uploading?"default":"pointer",border:`1px solid ${langMode==="auto"?C.coral:C.border}`,
              background:langMode==="auto"?C.coralSoft:"transparent",color:langMode==="auto"?C.coral:C.muted}},
            e(SvgSparkle,{size:12}),"Auto-detect"
          ),
          e("button",{onClick:()=>setLangMode("manual"),disabled:uploading,"aria-pressed":langMode==="manual",
            style:{padding:"7px 14px",borderRadius:999,fontFamily:FB,fontWeight:500,fontSize:13,
              cursor:uploading?"default":"pointer",border:`1px solid ${langMode==="manual"?C.coral:C.border}`,
              background:langMode==="manual"?C.coralSoft:"transparent",color:langMode==="manual"?C.coral:C.muted}},
            "Set manually"
          )
        ),
        langMode==="auto"
          ?e("p",{style:{fontFamily:FB,fontSize:12,color:C.muted,marginTop:8}},"We'll detect from your audio — English, Hindi, Kannada, Tamil, Telugu, and code-mixed speech supported.")
          :e(ChipRow,{options:LANGUAGES,value:manualLang,onChange:setManualLang,accent:C.coral,disabled:uploading})
      ),
      /* Practice mode */
      e("div",{style:{marginBottom:18}},
        e(Label,{Icon:SvgGauge,text:"Practice mode"}),
        e(ChipRow,{options:PRACTICE_MODES,value:practiceMode,onChange:setPracticeMode,accent:C.purple,disabled:uploading})
      ),
      /* Interview type */
      e("div",{style:{marginBottom:18}},
        e(Label,{Icon:SvgBriefcase,text:"Interview type"}),
        e(ChipRow,{options:INTERVIEW_TYPES,value:interviewType,onChange:setInterviewType,accent:C.mint,disabled:uploading})
      ),
      /* Resume */
      e(ResumeUpload,{resume,setResume}),
      /* Audio input */
      !uploading?e(Fragment,null,
        e(Label,{Icon:SvgUpload,text:"Audio input"}),
        e("div",{role:"group","aria-label":"Audio input mode",style:{display:"flex",gap:8,marginBottom:16}},
          e("button",{onClick:()=>{if(isRecording)stopRecording();setAudioSource("upload");setMicError(null);},
            "aria-pressed":audioSource==="upload",
            style:{flex:1,display:"flex",alignItems:"center",justifyContent:"center",gap:6,padding:"9px 14px",borderRadius:10,cursor:"pointer",fontFamily:FB,fontWeight:500,fontSize:13,
              border:`1px solid ${audioSource==="upload"?C.coral:C.border}`,background:audioSource==="upload"?C.coralSoft:"transparent",color:audioSource==="upload"?C.coral:C.muted}},
            e(SvgUpload,{size:14}),"Upload file"
          ),
          e("button",{onClick:()=>{setAudioSource("record");setMicError(null);},
            "aria-pressed":audioSource==="record",
            style:{flex:1,display:"flex",alignItems:"center",justifyContent:"center",gap:6,padding:"9px 14px",borderRadius:10,cursor:"pointer",fontFamily:FB,fontWeight:500,fontSize:13,
              border:`1px solid ${audioSource==="record"?C.coral:C.border}`,background:audioSource==="record"?C.coralSoft:"transparent",color:audioSource==="record"?C.coral:C.muted}},
            e(SvgMic,{size:14}),"Record live"
          )
        ),
        audioSource==="upload"
          ?e(Fragment,null,
              e(DropZone,{onFile:(f)=>runAnalysis(f,f.name),fileInputRef}),
              e("div",{role:"separator",style:{display:"flex",alignItems:"center",gap:12,margin:"20px 0"}},e("div",{style:{flex:1,height:1,background:C.border}}),e("span",{style:{fontFamily:FM,fontSize:11,color:C.muted}},"OR"),e("div",{style:{flex:1,height:1,background:C.border}})),
              e("button",{onClick:startSampleAnalysis,style:{width:"100%",display:"flex",alignItems:"center",justifyContent:"center",gap:8,background:"transparent",border:`1.5px solid ${C.mint}`,color:C.mint,fontFamily:FD,fontWeight:600,fontSize:14,borderRadius:12,padding:"13px 20px",cursor:"pointer"}},e(SvgPlay,{size:15,color:C.mint}),"Try a sample recording")
            )
          :e("div",{style:{border:`2px dashed ${isRecording?C.coral:C.border}`,borderRadius:16,padding:"30px 20px",textAlign:"center",transition:"all .15s"}},
              !isRecording
                ?e(Fragment,null,
                    e("button",{onClick:startRecording,"aria-label":"Start microphone recording",style:{width:64,height:64,borderRadius:"50%",border:"none",cursor:"pointer",background:C.coral,display:"flex",alignItems:"center",justifyContent:"center",margin:"0 auto 14px",boxShadow:`0 0 0 6px ${C.coralSoft}`}},e(SvgMic,{size:26,color:C.bg})),
                    e("div",{style:{fontFamily:FD,fontWeight:600,color:C.text,fontSize:15}},"Tap to start recording"),
                    e("div",{style:{fontFamily:FB,color:C.muted,fontSize:12.5,marginTop:4}},"Speak naturally — up to 3 minutes"),
                    micError&&e("div",{role:"alert",style:{marginTop:14,background:C.coralSoft,border:`1px solid ${C.coral}55`,borderRadius:10,padding:"9px 13px",fontFamily:FB,fontSize:12.5,color:C.text}},micError)
                  )
                :e(Fragment,null,
                    e("div",{style:{display:"flex",justifyContent:"center",alignItems:"center",gap:8,marginBottom:10}},
                      e("span",{"aria-hidden":"true",style:{width:10,height:10,borderRadius:"50%",background:C.coral,display:"inline-block"}}),
                      e("span",{"aria-live":"polite",style:{fontFamily:FM,fontSize:13,color:C.coral}},`Recording… ${fmt(recordSeconds)}`)
                    ),
                    e(Waveform,{count:30,height:46,animated:true}),
                    e("button",{onClick:stopRecording,style:{...pBtn,width:"100%",marginTop:18}},"Stop & analyze")
                  )
            )
      ):e("div",{role:"status","aria-live":"polite",style:{padding:"10px 4px"}},
          e(Waveform,{count:26,height:40,animated:true}),
          e("div",{style:{margin:"18px 0 8px",height:8,borderRadius:4,background:C.bg2,overflow:"hidden"},role:"progressbar","aria-valuenow":progress,"aria-valuemin":0,"aria-valuemax":100,"aria-label":"Analysis progress"},
            e("div",{style:{width:`${progress}%`,height:"100%",background:`linear-gradient(90deg,${C.coral},${C.purple},${C.mint})`,transition:"width .1s linear",borderRadius:4}})
          ),
          e("div",{style:{display:"flex",justifyContent:"space-between",fontFamily:FM,fontSize:12,color:C.muted,marginBottom:revealDetected?12:0}},
            e("span",null,stages[stageIdx]),e("span",null,`${progress}%`)
          ),
          revealDetected&&detected&&e("div",{className:"cc-fade",style:{display:"flex",alignItems:"center",gap:8,background:C.mintSoft,border:`1px solid ${C.mint}55`,borderRadius:10,padding:"9px 13px"}},
            e(SvgCheck,{size:14,color:C.mint}),
            e("span",{style:{fontFamily:FB,fontSize:12.5,color:C.text}},"Detected ",e("strong",{style:{color:C.mint}},detected.lang)),
            e("span",{style:{fontFamily:FM,fontSize:11,color:C.muted,marginLeft:"auto"}},`${detected.confidence}% confidence`)
          )
        )
    ),
    apiError&&!uploading&&e("div",{role:"alert",style:{marginTop:16,background:C.coralSoft,border:`1px solid ${C.coral}55`,borderRadius:12,padding:"12px 16px",fontFamily:FB,fontSize:13,color:C.text}},
      e("strong",{style:{color:C.coral}},"Error: "),apiError
    )
  );
}
