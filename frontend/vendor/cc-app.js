/* cc-app.js — Root App component. Stitches all tabs together.
   Depends on: cc-globals.js, cc-primitives.js, cc-assessment.js,
               cc-feedback.js, cc-interview.js, cc-dashboard.js, cc-history.js */
"use strict";

(function(){
"use strict";
if(typeof React==="undefined"||typeof ReactDOM==="undefined"){
  var b=document.getElementById("error-banner");
  var s=document.getElementById("splash");
  if(s)s.style.display="none";
  if(b){b.style.display="block";b.textContent="React failed to load. Check the browser Network tab (F12)";}
  return;
}

function App(){
  const [page,setPage]=useState(()=>1);
  const [userId,setUserId]=useState(getStoredUserId);
  const [goal,setGoal]=useState(getStoredGoal);
  const [resume,setResume]=useState(null);
  const [session,setSession]=useState(null); // feedback session result
  const [uploading,setUploading]=useState(false);
  const [showGoalModal,setShowGoalModal]=useState(false);
  const [showUserModal,setShowUserModal]=useState(false);
  const [interviewPhase,setInterviewPhase]=useState("setup"); // setup|interview|complete
  const interviewSessionRef=useRef(null);

  // Sync goal with server on change
  useEffect(()=>{
    if(!userId||!goal)return;
    fetch(`${API_URL}/user/goal`,{method:"POST",headers:{"Content-Type":"application/json"},
      body:JSON.stringify({user_id:userId,goal})}).catch(()=>{});
  },[userId,goal]);

  // Load stored goal from server on user change
  useEffect(()=>{
    if(!userId)return;
    fetch(`${API_URL}/user/goal/${encodeURIComponent(userId)}`)
      .then(r=>r.ok?r.json():null)
      .then(d=>{if(d?.goal){setGoal(d.goal);setStoredGoal(d.goal);}})
      .catch(()=>{});
  },[userId]);

  const saveGoal=(g)=>{
    setGoal(g);setStoredGoal(g);setShowGoalModal(false);
    window.ccToast(`Goal updated to ${CAREER_GOALS.find(x=>x.id===g)?.label||g}`,"success");
  };

  const saveUser=(id)=>{
    const clean=(id||"").trim()||"default_user";
    setUserId(clean);setStoredUserId(clean);
    setShowUserModal(false);
    // Reset interview state when switching users
    setInterviewPhase("setup");interviewSessionRef.current=null;
    window.ccToast(`Switched to user: ${clean}`,"info");
  };

  const handleAssessmentDone=(result)=>{
    // Flatten apiResponse into session for FeedbackPage compatibility
    const api=result.apiResponse||{};
    setSession({
      ...result,
      userId,
      feedback:api.feedback||{},
      transcript:result.transcriptTokens||[],
      sessionReport:api.session_report||null,
      sessionId:api.session_id||null,
    });
    setPage(2);
  };

  const handleStartInterview=()=>{
    setInterviewPhase("setup");
    interviewSessionRef.current=null;
    setPage(3);
  };

  return e(Fragment,null,
    e(ToastContainer),
    showGoalModal&&e(GoalSelectorModal,{current:goal,onSave:saveGoal,onCancel:()=>setShowGoalModal(false)}),
    showUserModal&&e(UserIdModal,{current:userId,onSave:saveUser,onCancel:()=>setShowUserModal(false)}),

    e(Header,{userId,goal,onEditUser:()=>setShowUserModal(true),onEditGoal:()=>setShowGoalModal(true)}),
    e(TabNav,{page,setPage,interviewPhase,uploading}),

    page===1&&e(AssessmentPage,{
      onDone:handleAssessmentDone,
      resume,setResume,
      onUploadingChange:setUploading,
      userId,goal,
    }),
    page===2&&e(FeedbackPage,{
      session,
      onStartInterview:handleStartInterview,
      onViewDashboard:()=>setPage(4),
      onRetry:()=>setPage(1),
    }),
    page===3&&e(InterviewPage,{
      userId,goal,resume,
      onDone:(result)=>{
        window.ccToast("Interview complete! Check your dashboard.","success");
        setPage(4);
      },
      phase:interviewPhase,
      setPhase:setInterviewPhase,
      sessionRef:interviewSessionRef,
    }),
    page===4&&e(DashboardPage,{
      userId,goal,
      onGoToInterview:()=>{setInterviewPhase("setup");setPage(3);},
    }),
    page===5&&e(HistoryPage,{
      userId,
      onGoToAssessment:()=>setPage(1),
    })
  );
}

// Mount
var splash=document.getElementById("splash");
if(splash)splash.style.display="none";
clearTimeout(window._ccSplashGuard);
ReactDOM.render(e(App),document.getElementById("root"));
})();
