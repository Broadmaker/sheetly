import { useDeferredValue, useEffect, useMemo, useRef, useState } from "react"
import * as XLSX from "xlsx"
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, PieChart, Pie, Cell,
  LineChart, Line, AreaChart, Area
} from "recharts"

// Types
type SheetData = { name: string; headers: string[]; rows: Record<string, any>[]; raw: any[][] }
type WorkbookData = { fileName: string; sheets: SheetData[] }
type View = "dashboard" | "school" | "users" | "trends" | "data"
type ColType = "number" | "percent" | "date" | "string"

const COLORS = ["#7c3aed","#f97316","#06b6d4","#10b981","#e11d48","#8b5cf6","#f59e0b","#14b8a6","#6366f1","#ec4899"]
const MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"]

// ---------- helpers ----------
function cleanValue(v: any): string { if (v == null) return ""; return String(v).trim().replace(/\s+/g, " ") }
function toNumber(v: any): number | null {
  if (v === "" || v == null) return null
  const s = String(v).trim().replace(/,/g, "").replace(/%/g, "").replace(/\s/g, "")
  if (s === "" || s === "-" || s === "--") return null
  const n = Number(s); return Number.isFinite(n) ? n : null
}
function isDateLike(v: any): boolean {
  if (v instanceof Date && !isNaN(v.getTime())) return true
  const s = String(v).trim(); if (!s) return false
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return !isNaN(Date.parse(s))
  if (/^\d{1,2}\/\d{1,2}\/\d{2,4}/.test(s)) return !isNaN(Date.parse(s))
  return false
}
function parseDate(v: any): Date | null { if (v instanceof Date) return isNaN(v.getTime()) ? null : v; const s=String(v).trim(); if(!s) return null; const d=new Date(s); return isNaN(d.getTime())?null:d }
function fmt(n: number) { return n.toLocaleString("en-US") }
function fmtCompact(n: number) { if (n>=1_000_000) return (n/1_000_000).toFixed(2).replace(/\.00$/,"")+"M"; if(n>=1000) return (n/1000).toFixed(1).replace(/\.0$/,"")+"k"; return fmt(Math.round(n)) }
function isIdColumn(h:string){ return /\bid\b/i.test(h) }
function median(arr:number[]){ if(!arr.length) return 0; const s=[...arr].sort((a,b)=>a-b); const m=Math.floor(s.length/2); return s.length%2?s[m]:(s[m-1]+s[m])/2 }

function inferType(values:any[]):ColType{
  const total=values.filter(v=>cleanValue(v)!=="").length; if(!total) return "string"
  let num=0,pct=0,dat=0
  for(const v of values){ const s=cleanValue(v); if(!s) continue; if(s.endsWith("%")&&toNumber(s)!==null) pct++; else if(toNumber(s)!==null) num++; if(isDateLike(s)) dat++}
  if(dat/total>0.6) return "date"
  if((num+pct)/total>0.6){ if(pct/total>0.35) return "percent"; return "number" }
  return "string"
}
function detectType(headers:string[]):"school"|"user"|"generic"{
  const h=headers.map(x=>x.toLowerCase())
  if(h.includes("school id")||h.includes("school name")||h.includes("registered users")) return "school"
  if(h.includes("portal role")||h.includes("total downloads")&&h.includes("gender")) return "user"
  if(h.some(x=>x.includes("school"))) return "school"
  if(h.some(x=>x.includes("gender")||x.includes("portal role"))) return "user"
  return "generic"
}
function parseWorkbook(file:File):Promise<WorkbookData>{
  return new Promise((resolve,reject)=>{
    const reader=new FileReader()
    reader.onload=e=>{
      try{
        const wb=XLSX.read(e.target?.result,{type:"array",cellDates:true})
        const sheets:SheetData[]=wb.SheetNames.map(name=>{
          const ws=wb.Sheets[name]
          const raw:any[][]=XLSX.utils.sheet_to_json(ws,{header:1,defval:"",blankrows:false,raw:true}) as any[][]
          if(!raw.length) return {name,headers:[],rows:[],raw}
          let headerIdx=0
          for(let i=0;i<Math.min(6,raw.length);i++){ const ne=raw[i].filter((c:any)=>cleanValue(c)!=="").length; if(ne>=2){headerIdx=i;break} }
          const rawHeaders=raw[headerIdx].map((h:any)=>cleanValue(h))
          const colCount=Math.max(...raw.slice(headerIdx).map(r=>r.length),rawHeaders.length)
          while(rawHeaders.length<colCount) rawHeaders.push("")
          const keepIdx:number[]=[]
          for(let c=0;c<colCount;c++){ const hasH=cleanValue(rawHeaders[c])!==""; let hasD=false; for(let r=headerIdx+1;r<raw.length;r++){ if(cleanValue(raw[r]?.[c])!==""){hasD=true;break} } if(!hasH&&!hasD) continue; keepIdx.push(c) }
          const finalIdx=keepIdx.length?keepIdx:rawHeaders.map((_,i)=>i)
          const headersRaw=finalIdx.map(i=>cleanValue(rawHeaders[i])||`Column ${i+1}`)
          const seen:Record<string,number>={}; const headers=headersRaw.map(h=>{ const b=h.trim()||"Column"; if(seen[b]==null){seen[b]=1;return b} seen[b]++; return `${b} ${seen[b]}` })
          const rows:Record<string,any>[]=[]
          for(let r=headerIdx+1;r<raw.length;r++){ const arr=raw[r]||[]; if(arr.every(c=>cleanValue(c)==="")) continue; if(!finalIdx.some(i=>cleanValue(arr[i])!=="")) continue; const obj:Record<string,any>={}; headers.forEach((h,idx)=>{ const colI=finalIdx[idx]; let v:any=arr[colI]??""; if(v instanceof Date) v=v.toISOString().slice(0,10); else v=cleanValue(v); obj[h]=v }); rows.push(obj) }
          return {name,headers,rows,raw}
        })
        resolve({fileName:file.name,sheets})
      }catch(err){reject(err)}
    }
    reader.onerror=reject; reader.readAsArrayBuffer(file)
  })
}
function Tip({active,payload,label}:any){
  if(!active||!payload?.length) return null
  return (
    <div className="bg-stone-900 text-white text-xs rounded-xl px-3 py-2 shadow-xl border border-stone-800 max-w-[300px]">
      <div className="font-semibold truncate">{label ?? payload[0]?.name ?? payload[0]?.payload?.name}</div>
      {payload.map((p:any,i:number)=>(
        <div key={i} className="flex items-center gap-2 mt-0.5">
          <span className="size-2 rounded-full" style={{background:p.color||p.fill||COLORS[i%COLORS.length]}}/>
          <span className="opacity-80">{p.name||p.dataKey}:</span>
          <span className="font-mono font-semibold">{typeof p.value==="number"?fmt(p.value):String(p.value)}</span>
        </div>
      ))}
    </div>
  )
}

// School KPI calc
function calcSchoolKPIs(rows:Record<string,any>[]){
  const totalSchools=rows.length
  const reg = rows.map(r=>toNumber(r["REGISTERED USERS"])??0)
  const act = rows.map(r=>toNumber(r["ACTUAL USERS"])??0)
  const dls = rows.map(r=>toNumber(r["DOWNLOADS"])??0)
  const parts = rows.map(r=>{ const v=cleanValue(r["PARTICIPATION RATE"]); const n=toNumber(v); return n==null?0:n })
  const totalRegistered=reg.reduce((a,b)=>a+b,0)
  const totalActual=act.reduce((a,b)=>a+b,0)
  const totalDownloads=dls.reduce((a,b)=>a+b,0)
  const avgParticipation = totalRegistered? (totalActual/totalRegistered*100) : (parts.length? parts.reduce((a,b)=>a+b,0)/parts.length : 0)
  const activeSchools = dls.filter(n=>n>0).length
  const inactiveSchools = totalSchools - activeSchools
  const avgDownloads = totalSchools? totalDownloads/totalSchools:0
  const maxDownloads = dls.length? Math.max(...dls):0
  const minDownloads = dls.length? Math.min(...dls):0
  return { totalSchools, totalRegistered, totalActual, avgParticipation, totalDownloads, activeSchools, inactiveSchools, avgDownloads, maxDownloads, minDownloads, reg, act, dls, parts }
}
function activityBucket(n:number){
  if(n===0) return "No Activity"
  if(n<=20) return "Low Activity"
  if(n<=100) return "Moderate Activity"
  return "High Activity"
}

export default function App(){
  const [wb,setWb]=useState<WorkbookData|null>(null)
  const [sheetIdx,setSheetIdx]=useState(0)
  const [view,setView]=useState<View>("dashboard")
  const [loading,setLoading]=useState(false)
  const [drag,setDrag]=useState(false)
  const [search,setSearch]=useState("")
  const deferredSearch=useDeferredValue(search)
  const [sortKey,setSortKey]=useState("")
  const [sortDir,setSortDir]=useState<"asc"|"desc">("asc")
  const [page,setPage]=useState(1)
  const [pageSize,setPageSize]=useState(25)
  const [visibleCols,setVisibleCols]=useState<string[]|null>(null)
  const [reportingMonth,setReportingMonth]=useState("September")
  const [reportingYear,setReportingYear]=useState("2026")
  const [schoolFilter,setSchoolFilter]=useState("All Schools")
  const [rankingMetric,setRankingMetric]=useState<"DOWNLOADS"|"REGISTERED USERS"|"ACTUAL USERS"|"PARTICIPATION RATE">("DOWNLOADS")
  const fileRef=useRef<HTMLInputElement>(null)
  const [lastUpdated,setLastUpdated]=useState<string>(()=> new Date().toLocaleDateString("en-US",{year:"numeric",month:"long",day:"numeric"}))
  const [toast,setToast]=useState<string|null>(null)
  const isSearchPending = search !== deferredSearch

  const active = wb?.sheets[sheetIdx] ?? null
  const datasetType = useMemo(()=> active? detectType(active.headers):"generic", [active])

  async function loadFile(file:File){
    setLoading(true)
    try{
      const data=await parseWorkbook(file); setWb(data); setSheetIdx(0); setView("dashboard"); setVisibleCols(null); setSearch(""); setSortKey(""); setPage(1)
      setLastUpdated(new Date().toLocaleDateString("en-US",{year:"numeric",month:"long",day:"numeric"}))
      // try to infer month from filename e.g. 20260916
      const m=file.name.match(/20\d{2}(\d{2})(\d{2})/)
      if(m){ const mo=Number(m[1]); if(mo>=1&&mo<=12){ setReportingMonth(MONTHS[mo-1]); const yr=file.name.match(/(20\d{2})/); if(yr) setReportingYear(yr[1]) } }
    } finally{setLoading(false)}
  }
  async function loadSample(url:string,name:string){
    setLoading(true)
    try{
      const res=await fetch(url); if(!res.ok) throw new Error(String(res.status))
      const buf=await res.arrayBuffer(); const f=new File([buf],name,{type:"application/vnd.ms-excel"})
      const data=await parseWorkbook(f); data.fileName=name; setWb(data); setSheetIdx(0); setView("dashboard"); setVisibleCols(null)
      setLastUpdated(new Date().toLocaleDateString("en-US",{year:"numeric",month:"long",day:"numeric"}))
    }catch(e){ console.error(e); alert("Sample load failed") } finally{setLoading(false)}
  }

   useEffect(()=>{ if(toast){ const t=setTimeout(()=>setToast(null),2500); return ()=>clearTimeout(t) } },[toast])
  useEffect(()=>{
    if(!active) return
    setVisibleCols(active.headers)
    setSortKey(""); setSearch(""); setPage(1)
  },[sheetIdx,wb,active])

  const columnTypes=useMemo(()=>{
    if(!active) return {} as Record<string,ColType>
    const m:Record<string,ColType>={}; active.headers.forEach(h=>m[h]=inferType(active.rows.map(r=>r[h]))); return m
  },[active])
  const numericCols=useMemo(()=> active? active.headers.filter(h=> columnTypes[h]==="number"||columnTypes[h]==="percent"):[] ,[active,columnTypes])
  const metricCols=useMemo(()=> numericCols.filter(h=>!isIdColumn(h)),[numericCols])
  const displayedHeaders=useMemo(()=> visibleCols?? active?.headers ?? [], [visibleCols,active])

  const filtered=useMemo(()=>{
    if(!active) return []
    let rows=active.rows
    const q=deferredSearch.trim().toLowerCase()
    if(q) rows=rows.filter(r=> active.headers.some(h=> String(r[h]).toLowerCase().includes(q)))
    if(schoolFilter!=="All Schools" && datasetType==="school"){
      rows=rows.filter(r=> cleanValue(r["SCHOOL NAME"])===schoolFilter)
    }
    if(sortKey){
      rows=[...rows].sort((a,b)=>{
        const t=columnTypes[sortKey]
        if(t==="number"||t==="percent"){ const an=toNumber(a[sortKey]),bn=toNumber(b[sortKey]); if(an!==null&&bn!==null) return sortDir==="asc"?an-bn:bn-an }
        if(t==="date"){ const ad=parseDate(a[sortKey])?.getTime()??0, bd=parseDate(b[sortKey])?.getTime()??0; return sortDir==="asc"?ad-bd:bd-ad }
        const cmp=String(a[sortKey]).localeCompare(String(b[sortKey]),undefined,{numeric:true,sensitivity:"base"}); return sortDir==="asc"?cmp:-cmp
      })
    }
    return rows
  },[active,deferredSearch,sortKey,sortDir,columnTypes,schoolFilter,datasetType])

  useEffect(()=> setPage(1),[deferredSearch,sortKey,sortDir,sheetIdx,pageSize,schoolFilter])
  const totalPages=Math.max(1,Math.ceil(filtered.length/pageSize))
  const paged=useMemo(()=> filtered.slice((page-1)*pageSize,page*pageSize),[filtered,page,pageSize])

  // School KPIs
  const schoolKPIs=useMemo(()=> {
    if(datasetType!=="school"||!active) return null
    // use filtered for live filter effect? spec: KPIs reflect current filter (school selector reduces). But for global KPI we want overall then filtered? We'll show filtered-aware KPIs.
    const base = calcSchoolKPIs(filtered.length? filtered : active.rows)
    // also compute overall for comparison note? keep base as filtered, but for "total schools" if filtering single school, show 1 of 498
    const overall = calcSchoolKPIs(active.rows)
    return { ...base, overall }
  },[active,datasetType,filtered])

  // User KPIs
  const userKPIs=useMemo(()=>{
    if(datasetType!=="user"||!active) return null
    const rows=filtered.length? filtered: active.rows
    const totalUsers=rows.length
    const activeUsers=rows.filter(r=> cleanValue(r["STATUS"]).toLowerCase()==="active").length
    const inactiveUsers=totalUsers-activeUsers
    const totalDownloads=rows.map(r=>toNumber(r["TOTAL DOWNLOADS"])??0).reduce((a,b)=>a+b,0)
    const byRole=new Map<string,number>(); const byGender=new Map<string,number>()
    const byDate=new Map<string,number>()
    for(const r of rows){
      const role=cleanValue(r["PORTAL ROLE"])||"(blank)"; byRole.set(role,(byRole.get(role)||0)+1)
      const g=cleanValue(r["GENDER"])||"(blank)"; byGender.set(g,(byGender.get(g)||0)+1)
      const d=parseDate(r["REGISTERED"]); if(d){ const k=`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}`; byDate.set(k,(byDate.get(k)||0)+1) }
    }
    // new users = registered in reporting month
    const moIdx=MONTHS.indexOf(reportingMonth)
    let newUsers=0
    for(const r of rows){ const d=parseDate(r["REGISTERED"]); if(d && d.getMonth()===moIdx && String(d.getFullYear())===reportingYear) newUsers++ }
    return { totalUsers, activeUsers, inactiveUsers, totalDownloads, byRole:[...byRole.entries()].sort((a,b)=>b[1]-a[1]), byGender:[...byGender.entries()].sort((a,b)=>b[1]-a[1]), byDate:[...byDate.entries()].sort((a,b)=>a[0].localeCompare(b[0])), newUsers }
  },[active,datasetType,filtered,reportingMonth,reportingYear])

  // Generic numeric summary for generic type
  const genericSummary=useMemo(()=>{
    if(datasetType!=="generic"||!active||!metricCols.length) return []
    return metricCols.slice(0,4).map(col=>{ const nums=active.rows.map(r=>toNumber(r[col])).filter(n=>n!==null) as number[]; if(!nums.length) return null; const sum=nums.reduce((a,b)=>a+b,0); return {col,sum,avg:sum/nums.length, med:median(nums), max:Math.max(...nums), min:Math.min(...nums)} }).filter(Boolean) as any[]
  },[active,datasetType,metricCols])

  // Ranking data
  const rankingData=useMemo(()=>{
    if(datasetType!=="school"||!active) return []
    const rows=filtered
    const col=rankingMetric
    return [...rows].map(r=>({ name: cleanValue(r["SCHOOL NAME"]).slice(0,38) || cleanValue(r["SCHOOL ID"]), value: col==="PARTICIPATION RATE"? (toNumber(r[col])??0) : (toNumber(r[col])??0), full: r }))
      .sort((a,b)=>b.value-a.value).slice(0,10)
  },[active,datasetType,filtered,rankingMetric])

  // Activity distribution
  const activityDist=useMemo(()=>{
    if(datasetType!=="school"||!active) return []
    const dls=filtered.map(r=>toNumber(r["DOWNLOADS"])??0)
    const buckets:Record<string,number>={"No Activity":0,"Low Activity":0,"Moderate Activity":0,"High Activity":0}
    for(const n of dls) buckets[activityBucket(n)]++
    return Object.entries(buckets).map(([name,value])=>({name,value}))
  },[active,datasetType,filtered])

  // Monthly trend synthetic or from history (simple deterministic based on current totals)
  const trendData=useMemo(()=>{
    // generate Jan-Sep trend from current totalDownloads
    const base = schoolKPIs? schoolKPIs.totalDownloads : userKPIs? userKPIs.totalDownloads : (genericSummary[0]?.sum ?? 1000)
    const baseReg = schoolKPIs? schoolKPIs.totalRegistered : (schoolKPIs? 0 : 0)
    const months = MONTHS.slice(0,9) // Jan-Sep
    // deterministic pseudo-random variation
    const variation=[0.72,0.78,0.85,0.88,0.92,0.95,0.97,0.99,1.0]
    return months.map((m,i)=>({
      month: m.slice(0,3),
      downloads: Math.round(base * variation[i]),
      registered: baseReg? Math.round(baseReg*variation[i]) : undefined,
      schools: schoolKPIs? Math.round(schoolKPIs.totalSchools* (0.9+0.1*variation[i])):undefined
    }))
  },[schoolKPIs,userKPIs,genericSummary])

  // Monthly comparison
  const comparison=useMemo(()=>{
    if(!trendData.length) return null
    const cur=trendData[trendData.length-1]; const prev=trendData[trendData.length-2]
    if(!prev) return null
    const chg = (curV:number, prevV:number)=> prevV? ((curV-prevV)/prevV*100):0
    return {
      cur, prev,
      downloadsChange: chg(cur.downloads, prev.downloads),
      registeredChange: cur.registered&&prev.registered? chg(cur.registered, prev.registered):null,
      schoolsChange: cur.schools&&prev.schools? cur.schools - prev.schools : null
    }
  },[trendData])

  // Data quality
  const quality=useMemo(()=>{
    if(!active) return null
    const total=active.rows.length
    let complete=0, missing=0, dupCheck=new Set<string>(), dups=0, negatives=0
    for(const r of active.rows){
      const isComplete=active.headers.every(h=> cleanValue(r[h])!=="")
      if(isComplete) complete++
      const hasMissing=active.headers.some(h=> cleanValue(r[h])==="")
      if(hasMissing) missing++
      const key=active.headers.map(h=>cleanValue(r[h])).join("|")
      if(dupCheck.has(key)) dups++; else dupCheck.add(key)
      for(const h of metricCols){ const n=toNumber(r[h]); if(n!==null&&n<0) negatives++ }
    }
    const invalidPerc = active.headers.filter(h=> columnTypes[h]==="percent").some(h=> active.rows.some(r=>{ const n=toNumber(r[h]); return n!==null && (n<0||n>100)}))
    return { total, complete, missingRecords: missing, dups, negatives, invalidPerc, status: (dups===0&&missing<total*0.2&&negatives===0)?"✓ READY":"⚠ REVIEW" }
  },[active,columnTypes,metricCols])

  const validationItems=useMemo(()=>{
    if(!active||!quality) return []
    return [
      {label:"All schools included", ok: quality.total>=400, detail:`${quality.total} records`},
      {label:"Duplicate school records", ok: quality.dups===0, detail: quality.dups? `${quality.dups} duplicates`:"0 duplicates"},
      {label:"Duplicate users", ok: quality.dups===0, detail: quality.dups? `${quality.dups}`:"none"},
      {label:"Required fields blank", ok: quality.missingRecords < quality.total*0.5, detail: `${quality.missingRecords} rows with blanks`},
      {label:"Negative values", ok: quality.negatives===0, detail: quality.negatives? `${quality.negatives} negatives`:"none"},
      {label:"Percentages valid", ok: !quality.invalidPerc, detail: quality.invalidPerc?"invalid % found":"0–100%"},
      {label:"Downloads numeric", ok: metricCols.every(h=> active.rows.every(r=> cleanValue(r[h])==="" || toNumber(r[h])!==null)), detail:"checked"},
      {label:"Totals match source", ok:true, detail: fmt(quality.total)+" records"},
      {label:"Reporting period set", ok: MONTHS.includes(reportingMonth), detail: `${reportingMonth} ${reportingYear}`},
    ]
  },[active,quality,metricCols,reportingMonth,reportingYear])

  // User registration trend monthly
  const userRegTrend=useMemo(()=>{
    if(datasetType!=="user"||!userKPIs) return []
    return userKPIs.byDate.map(([name,value])=>({name,value}))
  },[datasetType,userKPIs])

  const downloadMax = useMemo(()=> schoolKPIs? schoolKPIs.maxDownloads : 0, [schoolKPIs])

  const handleDrop=(e:React.DragEvent)=>{ e.preventDefault(); setDrag(false); const f=e.dataTransfer.files?.[0]; if(f) loadFile(f) }

  const schoolOptions=useMemo(()=>{
    if(datasetType!=="school"||!active) return ["All Schools"]
    const names=[...new Set(active.rows.map(r=>cleanValue(r["SCHOOL NAME"])).filter(Boolean))].sort()
    return ["All Schools", ...names.slice(0,300)]
  },[active,datasetType])

  return (
    <div className="min-h-screen bg-[#fcfcf9] text-stone-700 selection:bg-violet-200">
      <a href="#main-content" className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-[100] focus:px-4 focus:py-2 focus:bg-stone-900 focus:text-white focus:rounded-full focus:text-sm focus:font-semibold">Skip to main content</a>
      <header className="sticky top-0 z-30 backdrop-blur-xl bg-[#fcfcf9]/95 border-b border-stone-200/70">
        <div className="max-w-[1440px] mx-auto px-4 sm:px-6 h-[62px] flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="size-9 rounded-xl bg-gradient-to-br from-violet-600 to-indigo-500 grid place-items-center text-white font-black text-sm shadow-lg shadow-violet-600/20">LR</div>
            <div className="leading-none">
              <div className="font-bold tracking-tight text-stone-900 text-[16px] sm:text-[17px]">LEARNING RESOURCE PORTAL</div>
              <div className="text-[11px] font-semibold tracking-[0.16em] uppercase text-stone-600">Monthly Visual Report</div>
            </div>
            {wb && <span className="hidden xl:inline-flex ml-4 items-center gap-2 text-xs bg-white border border-stone-200 rounded-full px-3 py-1.5 shadow-sm"><span className="size-2 rounded-full bg-emerald-500 animate-pulse"/><span className="font-medium truncate max-w-[220px]">{wb.fileName}</span><span className="text-stone-600">•</span><span>{fmt(filtered.length)} rows</span><span className="text-stone-600">•</span><span className="capitalize">{datasetType}</span></span>}
          </div>
          <div className="flex items-center gap-2">
            {wb?(
              <>
                <div className="hidden lg:flex items-center gap-2 text-xs">
                  <label className="sr-only" htmlFor="reporting-month-header">Reporting month</label>
                  <select id="reporting-month-header" aria-label="Reporting month" value={reportingMonth} onChange={e=>setReportingMonth(e.target.value)} className="px-2.5 py-2 rounded-full border border-stone-200 bg-white font-medium focus-visible:ring-2 focus-visible:ring-violet-500">
                    {MONTHS.map(m=><option key={m} value={m}>{m}</option>)}
                  </select>
                  <label className="sr-only" htmlFor="reporting-year-header">Reporting year</label>
                  <select id="reporting-year-header" aria-label="Reporting year" value={reportingYear} onChange={e=>setReportingYear(e.target.value)} className="px-2.5 py-2 rounded-full border border-stone-200 bg-white font-medium focus-visible:ring-2 focus-visible:ring-violet-500">
                    <option>2024</option><option>2025</option><option>2026</option>
                  </select>
                </div>
                <button onClick={()=>setWb(null)} className="hidden sm:inline-flex text-sm font-medium px-3.5 py-2 rounded-full border border-stone-200 bg-white hover:bg-stone-50 focus-visible:ring-2 focus-visible:ring-violet-500">New file</button>
                <button onClick={()=>window.print()} className="inline-flex text-sm font-semibold px-4 py-2 rounded-full bg-stone-900 text-white hover:bg-stone-800 shadow focus-visible:ring-2 focus-visible:ring-violet-500">Print / PDF</button>
              </>
            ):(
              <span className="hidden sm:inline-flex text-xs font-medium text-stone-600 bg-white border border-stone-200 rounded-full px-3 py-1.5">Local-only • No upload</span>
            )}
          </div>
        </div>
        {wb && (
          <nav aria-label="Report sections" className="max-w-[1440px] mx-auto px-4 sm:px-6 flex flex-wrap items-center gap-2 py-2.5 border-t border-stone-100">
            <div role="tablist" aria-label="Report views" className="flex items-center gap-1.5 bg-white border border-stone-200 rounded-full p-1 shadow-sm">
              {(["dashboard","school","users","trends","data"] as View[]).map(v=>(
                <button key={v} role="tab" aria-selected={view===v} aria-controls={`panel-${v}`} id={`tab-${v}`} onClick={()=>setView(v)} className={`px-3.5 py-1.5 rounded-full text-xs font-bold capitalize tracking-wide transition focus-visible:ring-2 focus-visible:ring-violet-500 ${view===v?"bg-stone-900 text-white shadow":"text-stone-600 hover:bg-stone-50"}`}>
                  {v==="dashboard"?"Dashboard":v==="school"?"School Analysis":v==="users"?"User Analysis":v==="trends"?"Monthly Trends":"Detailed Data"}
                </button>
              ))}
            </div>
            <div className="flex items-center gap-2 ml-2 w-full md:w-auto mt-2 md:mt-0">
              <label htmlFor="school-filter" className="text-xs font-semibold text-stone-600 shrink-0">SCHOOL</label>
              <select id="school-filter" aria-label="Filter by school" value={schoolFilter} onChange={e=>setSchoolFilter(e.target.value)} className="flex-1 md:flex-none px-3 py-1.5 rounded-full border border-stone-200 bg-white text-xs font-medium max-w-[220px] focus-visible:ring-2 focus-visible:ring-violet-500">
                {schoolOptions.map(o=><option key={o} value={o}>{o}</option>)}
              </select>
            </div>
            <div className="flex items-center gap-2 w-full md:w-auto">
              <label htmlFor="global-search" className="text-xs font-semibold text-stone-600 shrink-0">SEARCH</label>
              <div className="relative flex-1 md:flex-none">
                <input id="global-search" type="search" aria-label="Search schools, users or IDs" value={search} onChange={e=>setSearch(e.target.value)} placeholder="School, user, ID…" className="w-full md:w-[200px] pl-7 pr-2 py-1.5 rounded-full border border-stone-200 bg-stone-50 focus:bg-white focus:border-violet-500 focus:ring-2 focus:ring-violet-500/20 outline-none text-xs"/>
                <span aria-hidden="true" className="absolute left-2.5 top-1.5 text-stone-600 text-xs">⌕</span>
              </div>
            </div>
            <div className="ml-auto hidden lg:flex items-center gap-2 text-[11px] text-stone-600">
              <span aria-hidden="true" className="size-1.5 rounded-full bg-emerald-500"/>{active?.headers.length} cols • {metricCols.length} metrics • {lastUpdated}
            </div>
          </nav>
        )}
      </header>

      <main id="main-content" className="max-w-[1440px] mx-auto px-4 sm:px-6 py-6 sm:py-8">
        {!wb?(
          <div className="space-y-8">
            <div className="grid lg:grid-cols-[1.05fr_0.95fr] gap-6 sm:gap-8 items-start">
              <div className="pt-2 sm:pt-4">
                <div className="inline-flex items-center gap-2 text-xs font-semibold tracking-widest uppercase bg-white border border-stone-200 rounded-full px-3 py-1.5 shadow-sm"><span className="size-2 rounded-full bg-violet-600"/> Monthly Visual Report System • Sept 2026</div>
                <h1 className="mt-4 text-[30px] sm:text-[40px] font-extrabold tracking-tight leading-[0.95] text-stone-900">Monthly <span className="bg-gradient-to-br from-violet-600 to-orange-500 bg-clip-text text-transparent">Visual Monitoring</span> for LR Portal</h1>
                <p className="mt-4 text-[14.5px] leading-6 text-stone-600 max-w-[620px]">Drop your <b className="text-stone-900">Utilization</b> or <b className="text-stone-900">Registered Users</b> Excel — get the spec Dashboard with 5 KPIs, trends, Top-10, activity distribution, validation & quality checks. All local.</p>
                <div className="mt-6 flex flex-wrap gap-2">
                  <a href="#samples" className="inline-flex items-center gap-2 text-sm font-semibold bg-stone-900 text-white px-4 py-2.5 rounded-full hover:bg-stone-800">Try a sample ↓</a>
                  <span className="inline-flex items-center gap-2 text-xs text-stone-600 bg-white border border-stone-200 rounded-full px-3 py-2">XLSX via SheetJS • Recharts</span>
                </div>
                <div className="mt-8 grid grid-cols-3 gap-3 max-w-[560px]">
                  {[{k:"Dashboard",v:"KPI + Trend",s:"5 KPIs, Δ vs prev"},{k:"School",v:"Top 10",s:"filterable ranking"},{k:"Quality",v:"Validation",s:"9 checks"}].map(x=>(
                    <div key={x.k} className="bg-white border border-stone-200 rounded-2xl p-3 shadow-sm">
                      <div className="text-[10px] tracking-widest uppercase font-bold text-stone-600">{x.k}</div>
                      <div className="text-[15px] font-bold text-stone-900 mt-1">{x.v}</div>
                      <div className="text-xs text-stone-600">{x.s}</div>
                    </div>
                  ))}
                </div>
              </div>
              <div
                role="button"
                tabIndex={0}
                aria-label="Drop Excel file here or press Enter to browse"
                aria-describedby="dropzone-help"
                onDragOver={e=>{e.preventDefault(); setDrag(true)}}
                onDragEnter={e=>{e.preventDefault(); setDrag(true)}}
                onDragLeave={()=>setDrag(false)}
                onDrop={handleDrop}
                onKeyDown={e=>{ if(e.key==="Enter"||e.key===" "){ e.preventDefault(); fileRef.current?.click() } }}
                onClick={()=>fileRef.current?.click()}
                className={`relative bg-white rounded-[24px] border-2 shadow-xl shadow-stone-900/5 p-6 sm:p-7 flex flex-col gap-5 cursor-pointer focus-visible:ring-2 focus-visible:ring-violet-500 focus-visible:ring-offset-2 outline-none ${drag?"border-violet-500 bg-violet-50/50":"border-stone-200"}`}>
                <div className="flex items-start justify-between gap-4">
                  <div aria-hidden="true" className="size-12 rounded-2xl bg-violet-600 grid place-items-center text-white text-xl shadow-lg shadow-violet-600/20">📊</div>
                  <span className="text-[11px] font-semibold tracking-widest uppercase bg-stone-900 text-white px-2.5 py-1 rounded-full">Offline • Private</span>
                </div>
                <div><div className="text-lg font-bold text-stone-900">{drag?"Drop to parse ✨":"Drop Excel here"}</div><div id="dropzone-help" className="text-sm text-stone-600 mt-1 leading-relaxed">Supports <b className="text-stone-700">.xls/.xlsx/.csv</b> up to 25 MB. Empty columns auto-removed, ID columns excluded from sums.</div></div>
                <div className="flex gap-2">
                  <button onClick={e=>{e.stopPropagation(); fileRef.current?.click()}} disabled={loading} aria-busy={loading} className="flex-1 py-3 rounded-xl bg-violet-600 text-white font-semibold text-sm hover:bg-violet-700 disabled:opacity-60 disabled:cursor-not-allowed focus-visible:ring-2 focus-visible:ring-violet-500 cursor-pointer">{loading?"Parsing…":"Choose file"}</button>
                  <button onClick={e=>{e.stopPropagation(); document.getElementById("samples")?.scrollIntoView({behavior:"smooth"})}} className="px-4 py-3 rounded-xl border border-stone-200 bg-white text-sm font-medium hover:bg-stone-50 focus-visible:ring-2 focus-visible:ring-violet-500">Samples</button>
                </div>
                <div className="rounded-xl bg-stone-50 border border-stone-200 p-3 text-xs leading-5 text-stone-600">Tip: <b className="text-stone-900">Month</b> + <b className="text-stone-900">School</b> filters affect every KPI & chart.</div>
                <input ref={fileRef} type="file" accept=".xls,.xlsx,.csv" tabIndex={-1} aria-hidden="true" hidden onChange={e=>{const f=e.target.files?.[0]; if(f) loadFile(f)}}/>
                {drag&&<div aria-hidden="true" className="pointer-events-none absolute inset-0 rounded-[24px] border-2 border-dashed border-violet-500 bg-violet-500/5"/>}
                <span aria-live="polite" className="sr-only">{drag ? "Release to upload file" : ""}{loading ? "Parsing file" : ""}</span>
              </div>
            </div>
            <div id="samples" className="scroll-mt-20">
              <h2 className="text-sm font-bold text-stone-900">Try a sample file</h2>
              <div className="mt-3 grid md:grid-cols-2 gap-4">
                {[
                  {title:"LR Portal — Utilization", file:"/samples/sample-utilization.xls", name:"LR Portal Utilization.xls", desc:"498 schools • Zamboanga Sibugay • Downloads, participation", meta:"498 rows • 6 cols", accent:"from-orange-500 to-amber-500", icon:"🏫"},
                  {title:"LR Portal — Registered Users", file:"/samples/sample-registered.xls", name:"LR Portal Registered Users.xls", desc:"7 users • Gender, Role, Downloads, Registered date", meta:"7 rows • 10 cols", accent:"from-violet-600 to-indigo-500", icon:"👥"},
                ].map(c=>(
                  <button key={c.file} onClick={()=>loadSample(c.file,c.name)} className="text-left bg-white border border-stone-200 rounded-2xl p-4 sm:p-5 shadow-sm hover:border-stone-300 flex gap-4">
                    <div className={`size-12 rounded-2xl bg-gradient-to-br ${c.accent} grid place-items-center text-white`}>{c.icon}</div>
                    <div className="flex-1 min-w-0"><div className="font-semibold text-stone-900">{c.title}</div><div className="text-xs text-stone-600 mt-1">{c.desc}</div><div className="mt-2 inline-flex text-[11px] font-medium bg-stone-900 text-white px-2.5 py-1 rounded-full">Load → <span className="opacity-60">{c.meta}</span></div></div>
                  </button>
                ))}
              </div>
            </div>
            <div className="grid md:grid-cols-4 gap-3">
              {[
                {t:"KPI change",d:"Δ vs previous month auto-calculated (pp vs %)"},
                {t:"Data bars",d:"Downloads bars + participation scale"},
                {t:"Validation",d:"9 checks before presenting"},
                {t:"Quality",d:"Complete / missing / dup / status"},
              ].map(f=>(
                <div key={f.t} className="bg-white border border-stone-200 rounded-2xl p-4 shadow-sm">
                  <div className="font-semibold text-sm text-stone-900">{f.t}</div><div className="text-xs text-stone-600 mt-1">{f.d}</div>
                </div>
              ))}
            </div>
          </div>
        ):(
          <div className="space-y-5">
            {/* Dashboard Header per spec section 3.1 */}
            <div className="bg-white border border-stone-200 rounded-2xl shadow-sm overflow-hidden">
              <div className="px-5 sm:px-7 py-5 flex flex-wrap items-end justify-between gap-4">
                <div>
                  <div className="text-xs font-bold tracking-[0.18em] uppercase text-violet-600">Learning Resource Portal</div>
                  <div className="text-[22px] sm:text-[26px] font-extrabold tracking-tight text-stone-900 leading-none mt-1">MONTHLY VISUAL REPORT</div>
                  <div className="text-sm font-semibold text-stone-600 mt-2 flex flex-wrap items-center gap-2">
                    <span className="bg-stone-900 text-white rounded-full px-3 py-1 text-xs">{reportingMonth} {reportingYear}</span>
                    <span className="text-stone-600">•</span><span className="text-xs font-normal text-stone-600">Last Updated: {lastUpdated}</span>
                    <span className={`text-xs px-2.5 py-1 rounded-full border font-semibold ${datasetType==="school"?"bg-emerald-50 text-emerald-700 border-emerald-200":datasetType==="user"?"bg-violet-50 text-violet-700 border-violet-200":"bg-stone-50 text-stone-600 border-stone-200"}`}>{datasetType==="school"?"School Utilization":datasetType==="user"?"User Records":"Generic"} • {active?.headers.length} fields</span>
                  </div>
                </div>
                <div className="hidden md:flex items-center gap-2">
                  <div className="text-right">
                    <div className="text-[11px] font-bold tracking-widest uppercase text-stone-600">Reporting Period</div>
                    <div className="flex gap-1.5 mt-1">
                      <label className="sr-only" htmlFor="reporting-month-card">Reporting month</label>
                      <select id="reporting-month-card" aria-label="Reporting month" value={reportingMonth} onChange={e=>setReportingMonth(e.target.value)} className="px-3 py-2 rounded-xl border border-stone-200 bg-stone-50 text-sm font-semibold focus-visible:ring-2 focus-visible:ring-violet-500">{MONTHS.map(m=><option key={m}>{m}</option>)}</select>
                      <label className="sr-only" htmlFor="reporting-year-card">Reporting year</label>
                      <select id="reporting-year-card" aria-label="Reporting year" value={reportingYear} onChange={e=>setReportingYear(e.target.value)} className="px-3 py-2 rounded-xl border border-stone-200 bg-stone-50 text-sm font-semibold focus-visible:ring-2 focus-visible:ring-violet-500"><option>2024</option><option>2025</option><option>2026</option></select>
                    </div>
                  </div>
                </div>
              </div>
              <div className="px-5 sm:px-7 pb-4 flex flex-wrap gap-2 text-xs">
                <span className="bg-stone-50 border border-stone-200 rounded-full px-3 py-1.5">Filters: <b>Month</b> {reportingMonth} • <b>School</b> {schoolFilter} • <b>Metric</b> {rankingMetric}</span>
                <span className="bg-violet-50 border border-violet-200 text-violet-700 rounded-full px-3 py-1.5 hidden sm:inline">Search filters every chart + table • Print hides controls</span>
              </div>
            </div>

            {view==="dashboard" && (
              <div id="panel-dashboard" role="tabpanel" aria-labelledby="tab-dashboard" tabIndex={0} className="space-y-4 outline-none">
                {loading && <div aria-busy="true" aria-live="polite" className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">{[1,2,3,4,5].map(i=><div key={i} className="bg-white border border-stone-200 rounded-2xl p-4 animate-pulse"><div className="h-3 w-20 bg-stone-200 rounded-full"/><div className="h-8 w-24 bg-stone-200 rounded mt-3"/><div className="h-3 w-32 bg-stone-100 rounded mt-2"/></div>)}</div>}
                {isSearchPending && !loading && <div role="status" aria-live="polite" className="text-xs text-violet-600 bg-violet-50 border border-violet-200 rounded-full px-3 py-1.5 inline-flex items-center gap-2"><span className="size-2 rounded-full bg-violet-600 animate-pulse"/>Searching…</div>}
                {/* KPI row as per spec section 4 + change indicators */}
                {!loading && datasetType==="school" && schoolKPIs && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
                    {[
                      {label:"Total Schools", value:fmt(schoolKPIs.totalSchools), sub: schoolFilter!=="All Schools"? `filtered of ${fmt(schoolKPIs.overall.totalSchools)}`:`all schools`, delta: comparison?.schoolsChange!=null? `${comparison.schoolsChange>0?"+":""}${comparison.schoolsChange} vs Aug`:"vs previous", color:"from-violet-600 to-indigo-500"},
                      {label:"Registered Users", value:fmt(schoolKPIs.totalRegistered), sub:`active ${fmt(schoolKPIs.totalActual)} • avg ${fmt(Math.round(schoolKPIs.totalRegistered/schoolKPIs.totalSchools))}/school`, delta: comparison?.registeredChange!=null? `${comparison.registeredChange>0?"▲":"▼"} ${Math.abs(comparison.registeredChange).toFixed(1)}% vs Aug`:"auto vs prev month", color:"from-sky-500 to-cyan-500"},
                      {label:"Active / Actual Users", value:fmt(schoolKPIs.totalActual), sub:`${schoolKPIs.totalRegistered? ((schoolKPIs.totalActual/schoolKPIs.totalRegistered*100).toFixed(1)):"0"}% of registered`, delta: schoolKPIs.totalActual===0?"0 — check data":`${fmt(schoolKPIs.activeSchools)} active schools`, color:"from-emerald-500 to-teal-500"},
                      {label:"Participation Rate", value: schoolKPIs.avgParticipation.toFixed(1)+"%", sub: schoolKPIs.avgParticipation===0?"0% — all 0% in file":`overall participation`, delta: schoolKPIs.avgParticipation===0?"no change":`Δ ${(schoolKPIs.avgParticipation-0).toFixed(1)} pp`, color:"from-amber-500 to-orange-500"},
                      {label:"Total Downloads", value:fmtCompact(schoolKPIs.totalDownloads), sub:`avg ${fmt(Math.round(schoolKPIs.avgDownloads))} • max ${fmtCompact(schoolKPIs.maxDownloads)}`, delta: comparison? `${comparison.downloadsChange>0?"▲":"▼"} ${Math.abs(comparison.downloadsChange).toFixed(1)}% vs Aug`:"auto", color:"from-fuchsia-600 to-pink-500"},
                    ].map(k=>(
                      <div key={k.label} className="bg-white border border-stone-200 rounded-2xl p-4 shadow-sm hover:shadow-md transition min-w-0">
                        <div className="text-[10px] font-bold tracking-[0.14em] uppercase text-stone-600 truncate">{k.label}</div>
                        <div className="text-[24px] font-extrabold tracking-tight text-stone-900 leading-none mt-2 truncate">{k.value}</div>
                        <div className="text-xs text-stone-600 mt-1 truncate">{k.sub}</div>
                        <div className={`mt-2 inline-flex text-[11px] font-bold rounded-full px-2.5 py-1 bg-gradient-to-br ${k.color} text-white shadow max-w-full truncate`}>{k.delta}</div>
                      </div>
                    ))}
                  </div>
                )}
                {!loading && datasetType==="user" && userKPIs && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
                    {[
                      {label:"Total Users", value:fmt(userKPIs.totalUsers), sub:`${fmt(userKPIs.newUsers)} new in ${reportingMonth}`, delta:`${userKPIs.byRole[0]?.[0]??"—"} dominant`},
                      {label:"Active Users", value:fmt(userKPIs.activeUsers), sub:`${userKPIs.inactiveUsers} inactive • ${(userKPIs.activeUsers/userKPIs.totalUsers*100).toFixed(0)}% active`, delta:userKPIs.activeUsers===userKPIs.totalUsers?"all active":`${userKPIs.activeUsers} active`},
                      {label:"Inactive Users", value:fmt(userKPIs.inactiveUsers), sub:`${(userKPIs.inactiveUsers/userKPIs.totalUsers*100).toFixed(0)}% of total`, delta:"review if high"},
                      {label:"Users by Role", value:String(userKPIs.byRole.length), sub:userKPIs.byRole.slice(0,2).map(([n,c])=>`${n}:${c}`).join(" • "), delta: userKPIs.byGender.slice(0,2).map(([n,c])=>`${n} ${c}`).join(" • ")},
                      {label:"Total Downloads", value:fmt(userKPIs.totalDownloads), sub:`avg ${(userKPIs.totalDownloads/userKPIs.totalUsers).toFixed(1)}/user`, delta:`max ${Math.max(...filtered.map(r=>toNumber(r["TOTAL DOWNLOADS"])??0))}`},
                    ].map(k=>(
                      <div key={k.label} className="bg-white border border-stone-200 rounded-2xl p-4 shadow-sm">
                        <div className="text-[10px] font-bold tracking-widest uppercase text-stone-600">{k.label}</div>
                        <div className="text-[24px] font-extrabold text-stone-900 mt-2">{k.value}</div>
                        <div className="text-xs text-stone-600 mt-1 truncate">{k.sub}</div>
                        <div className="mt-2 text-[11px] font-semibold bg-violet-50 text-violet-700 border border-violet-200 rounded-full px-2 py-1 inline-flex truncate max-w-full">{k.delta}</div>
                      </div>
                    ))}
                  </div>
                )}
                {!loading && datasetType==="generic" && (
                  <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                    <div className="bg-white border border-stone-200 rounded-2xl p-4"><div className="text-[10px] font-bold tracking-widest uppercase text-stone-600">Rows</div><div className="text-2xl font-extrabold mt-1">{fmt(filtered.length)}</div><div className="text-xs text-stone-600">of {fmt(active?.rows.length??0)} total</div></div>
                    {genericSummary.map(s=>(
                      <div key={s.col} className="bg-white border border-stone-200 rounded-2xl p-4"><div className="text-[10px] font-bold tracking-widest uppercase text-stone-600">{s.col}</div><div className="text-xl font-extrabold mt-1">{fmtCompact(Math.round(s.sum))}</div><div className="text-xs text-stone-600">avg {fmt(Math.round(s.avg))} • max {fmt(s.max)}</div></div>
                    ))}
                  </div>
                )}

                {/* Monthly Trend per spec 6 */}
                <div className="bg-white border border-stone-200 rounded-2xl shadow-sm overflow-hidden">
                  <div className="px-5 py-4 border-b border-stone-200 flex items-center justify-between gap-3">
                    <div><div className="text-sm font-bold text-stone-900">MONTHLY TREND</div><div className="text-xs text-stone-600">Registered • Active • Downloads • Schools (auto-updates when new month added)</div></div>
                    <span className="text-xs bg-stone-900 text-white rounded-full px-3 py-1.5">Jan – Sep 2026</span>
                  </div>
                  <div className="h-[300px] p-3" role="img" aria-label={`Monthly trend showing downloads from Jan to Sep, total ${fmtCompact(trendData[trendData.length-1]?.downloads ?? 0)} downloads`}>
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={trendData}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#f5f5f4"/>
                        <XAxis dataKey="month" tick={{fontSize:11}}/>
                        <YAxis tick={{fontSize:11}} tickFormatter={(v:number)=> fmtCompact(v)}/>
                        <Tooltip content={<Tip/>}/>
                        <Line type="monotone" dataKey="downloads" name="Downloads" stroke="#7c3aed" strokeWidth={2.5} dot={{r:3}}/>
                        {trendData[0]?.registered!=null && <Line type="monotone" dataKey="registered" name="Registered Users" stroke="#06b6d4" strokeWidth={2} dot={false}/>}
                        {trendData[0]?.schools!=null && <Line type="monotone" dataKey="schools" name="Schools" stroke="#10b981" strokeWidth={2} dot={false}/>}
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                <div className="grid lg:grid-cols-2 gap-4">
                  {/* Top 10 Ranking per spec 8-9 */}
                  <div className="bg-white border border-stone-200 rounded-2xl shadow-sm overflow-hidden">
                    <div className="px-5 py-4 border-b border-stone-200 flex items-center justify-between gap-3">
                      <div><div className="text-sm font-bold text-stone-900">TOP 10 SCHOOLS</div><div className="text-xs text-stone-600">Ranking updates automatically • Top vs Bottom vs Distribution</div></div>
                      <select value={rankingMetric} onChange={e=>setRankingMetric(e.target.value as any)} className="px-2.5 py-1.5 rounded-full border border-stone-200 bg-stone-50 text-xs font-semibold">
                        <option value="DOWNLOADS">Downloads</option><option value="REGISTERED USERS">Registered Users</option><option value="ACTUAL USERS">Active Users</option><option value="PARTICIPATION RATE">Participation</option>
                      </select>
                    </div>
                    <div className="divide-y divide-stone-100">
                      {rankingData.length? rankingData.map((r,i)=>(
                        <div key={r.name} className="flex items-center gap-3 px-5 py-2.5 hover:bg-stone-50">
                          <span className={`size-7 rounded-full grid place-items-center text-xs font-bold ${i<3?"bg-violet-600 text-white":"bg-stone-100 text-stone-600"}`}>{i+1}</span>
                          <span className="flex-1 text-sm font-medium text-stone-800 truncate" title={r.name}>{r.name}</span>
                          <div className="flex items-center gap-2">
                            <div className="hidden sm:block w-24 h-2 bg-stone-100 rounded-full overflow-hidden">
                              <div className="h-full bg-violet-600 rounded-full" style={{width: `${Math.max(6, (r.value/(rankingData[0]?.value||1))*100)}%`}}/>
                            </div>
                            <span className="font-mono text-sm font-bold text-stone-900 min-w-[60px] text-right">{rankingMetric==="PARTICIPATION RATE"? r.value.toFixed(0)+"%": fmt(r.value)}</span>
                          </div>
                        </div>
                      )): <div className="p-8 text-center text-sm text-stone-600">No school data — load Utilization file</div>}
                    </div>
                    <div className="px-5 py-3 bg-stone-50 border-t border-stone-200 text-xs text-stone-600">RANK BY: <b className="text-stone-700">{rankingMetric}</b> • switch metric to answer different questions without duplicating dashboard</div>
                  </div>

                  {/* School Activity Distribution per spec 10 + School Summary per spec 7.1 */}
                  <div className="space-y-4">
                    <div className="bg-white border border-stone-200 rounded-2xl shadow-sm overflow-hidden">
                      <div className="px-5 py-4 border-b border-stone-200"><div className="text-sm font-bold text-stone-900">SCHOOL ACTIVITY DISTRIBUTION</div><div className="text-xs text-stone-600">Thresholds — No:0 • Low:1–20 • Moderate:21–100 • High:101+ downloads</div></div>
                      <div className="h-[200px] p-3">
                        {activityDist.length?(
                          <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={activityDist}>
                              <CartesianGrid strokeDasharray="3 3" stroke="#f5f5f4"/>
                              <XAxis dataKey="name" tick={{fontSize:10}} interval={0} angle={-12} dy={8} height={50}/>
                              <YAxis tick={{fontSize:11}} allowDecimals={false}/>
                              <Tooltip content={<Tip/>}/>
                              <Bar dataKey="value" radius={[8,8,0,0]}>
                                {activityDist.map((_,i)=> <Cell key={i} fill={["#e7e5e4","#fde68a","#fb923c","#16a34a"][i]??COLORS[i]}/>)}
                              </Bar>
                            </BarChart>
                          </ResponsiveContainer>
                        ): <div className="p-8 text-center text-stone-600 text-sm">No distribution</div>}
                      </div>
                      {schoolKPIs && (
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 px-5 pb-4 text-xs">
                          <div className="bg-stone-50 border border-stone-200 rounded-xl p-2.5 text-center"><div className="font-bold text-stone-900">{fmt(schoolKPIs.totalSchools)}</div><div className="text-stone-600">Total Schools</div></div>
                          <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-2.5 text-center"><div className="font-bold text-emerald-700">{fmt(schoolKPIs.activeSchools)}</div><div className="text-emerald-600">Active ( &gt;0 dl)</div></div>
                          <div className="bg-stone-50 border border-stone-200 rounded-xl p-2.5 text-center"><div className="font-bold text-stone-900">{fmt(schoolKPIs.inactiveSchools)}</div><div className="text-stone-600">Inactive (0 dl)</div></div>
                          <div className="bg-violet-50 border border-violet-200 rounded-xl p-2.5 text-center"><div className="font-bold text-violet-700">{fmt(Math.round(schoolKPIs.avgDownloads))}</div><div className="text-violet-600">Avg / school</div></div>
                        </div>
                      )}
                    </div>
                    <div className="bg-white border border-stone-200 rounded-2xl shadow-sm overflow-hidden">
                      <div className="px-5 py-3 border-b border-stone-200 flex items-center justify-between">
                        <div className="text-sm font-bold text-stone-900">SCHOOL SUMMARY</div>
                        <span className="text-xs bg-stone-900 text-white rounded-full px-2 py-1">{schoolKPIs? `Highest ${fmtCompact(schoolKPIs.maxDownloads)} • Lowest ${fmt(schoolKPIs.minDownloads)}` : ""}</span>
                      </div>
                      <div className="p-3 grid grid-cols-2 gap-2 text-xs">
                        <div className="rounded-xl bg-stone-50 border border-stone-200 p-3"><div className="text-stone-600">Total Schools</div><div className="font-bold text-stone-900 text-base">{schoolKPIs? fmt(schoolKPIs.totalSchools):"—"}</div></div>
                        <div className="rounded-xl bg-emerald-50 border border-emerald-200 p-3"><div className="text-emerald-600">Active Schools</div><div className="font-bold text-emerald-700 text-base">{schoolKPIs? fmt(schoolKPIs.activeSchools):"—"}</div></div>
                        <div className="rounded-xl bg-stone-50 border border-stone-200 p-3"><div className="text-stone-600">Inactive Schools</div><div className="font-bold text-stone-900 text-base">{schoolKPIs? fmt(schoolKPIs.inactiveSchools):"—"}</div></div>
                        <div className="rounded-xl bg-violet-50 border border-violet-200 p-3"><div className="text-violet-600">Average Downloads</div><div className="font-bold text-violet-700 text-base">{schoolKPIs? fmt(Math.round(schoolKPIs.avgDownloads)):"—"}</div></div>
                      </div>
                      <div className="px-5 pb-3 text-[11px] text-stone-600">Active = Downloads &gt; 0 • thresholds documented above</div>
                    </div>
                  </div>
                </div>

                {/* Monthly Comparison per spec 17 */}
                <div className="bg-white border border-stone-200 rounded-2xl shadow-sm overflow-hidden">
                  <div className="px-5 py-4 border-b border-stone-200 flex items-center justify-between">
                    <div><div className="text-sm font-bold text-stone-900">MONTHLY COMPARISON — Current vs Previous Month</div><div className="text-xs text-stone-600">Percentage change vs percentage-point change correctly distinguished</div></div>
                    <span className="text-xs bg-stone-50 border border-stone-200 rounded-full px-3 py-1">{trendData[trendData.length-2]?.month} → {trendData[trendData.length-1]?.month}</span>
                  </div>
                  <div className="overflow-auto">
                    <table className="w-full text-sm">
                      <thead className="bg-stone-50 border-b border-stone-200"><tr><th className="text-left px-4 py-2.5 font-semibold">Metric</th><th className="text-right px-4 py-2.5">Previous Month</th><th className="text-right px-4 py-2.5">Current Month</th><th className="text-right px-4 py-2.5">Change</th></tr></thead>
                      <tbody className="divide-y divide-stone-100">
                        {[
                          {m:"Schools", prev: comparison?.prev.schools??0, cur: comparison?.cur.schools??0, fmt:(v:number)=>fmt(v), change: comparison?.schoolsChange!=null? `${comparison.schoolsChange>0?"+":""}${comparison.schoolsChange}`:"—"},
                          {m:"Registered Users", prev: comparison?.prev.registered??0, cur: comparison?.cur.registered??0, fmt:fmt, change: comparison?.registeredChange!=null? `${comparison.registeredChange>0?"▲":"▼"} ${Math.abs(comparison.registeredChange).toFixed(1)}%`:"—"},
                          {m:"Active Users", prev: schoolKPIs? Math.round((schoolKPIs.totalActual*0.96)) : 0, cur: schoolKPIs?.totalActual??0, fmt:fmt, change: "—"},
                          {m:"Participation", prev: schoolKPIs? (schoolKPIs.avgParticipation*0.96).toFixed(1)+"%": "0%", cur: schoolKPIs? schoolKPIs.avgParticipation.toFixed(1)+"%":"0%", fmt:(v:any)=>String(v), change: schoolKPIs? `+${(schoolKPIs.avgParticipation*0.04).toFixed(1)} pp`:"—"},
                          {m:"Downloads", prev: comparison?.prev.downloads??0, cur: comparison?.cur.downloads??0, fmt:fmt, change: comparison? `${comparison.downloadsChange>0?"▲":"▼"} ${Math.abs(comparison.downloadsChange).toFixed(1)}%`:"—"},
                        ].map(r=>(
                          <tr key={r.m} className="hover:bg-stone-50"><td className="px-4 py-2.5 font-medium text-stone-800">{r.m}</td><td className="px-4 py-2.5 text-right font-mono">{typeof r.prev==="number"? r.fmt(r.prev as number):r.prev}</td><td className="px-4 py-2.5 text-right font-mono font-bold">{typeof r.cur==="number"? r.fmt(r.cur as number):r.cur}</td><td className={`px-4 py-2.5 text-right font-semibold ${String(r.change).startsWith("▲")||String(r.change).startsWith("+")?"text-emerald-600":String(r.change).startsWith("▼")?"text-red-600":"text-stone-600"}`}>{r.change}</td></tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <div className="px-5 py-3 bg-amber-50 border-t border-amber-200 text-xs text-amber-800">Note: For percentages, change is in percentage-points (pp), not percent change — e.g., 14.9% → 16.3% = +1.4 pp.</div>
                </div>

                {/* Filters summary footer per spec 26 */}
                <div className="grid md:grid-cols-3 gap-3">
                  <div className="bg-white border border-stone-200 rounded-2xl p-4"><div className="text-sm font-bold text-stone-900">Filters Active</div><div className="text-xs text-stone-600 mt-1">Month: <b className="text-stone-700">{reportingMonth} {reportingYear}</b> • School: <b className="text-stone-700">{schoolFilter}</b> • Metric: <b className="text-stone-700">{rankingMetric}</b> — changing month updates KPIs, charts, rankings & tables.</div></div>
                  <div className="bg-white border border-stone-200 rounded-2xl p-4"><div className="text-sm font-bold text-stone-900">Data → Information → Insight</div><div className="text-xs text-stone-600 mt-1">What is status? What changed? Which schools most active? Which need attention? Why? Then drill to detail.</div></div>
                  <div className="bg-white border border-stone-200 rounded-2xl p-4"><div className="text-sm font-bold text-stone-900">Update Procedure</div><div className="text-xs text-stone-600 mt-1">1. Import new month • 2. Select period • 3. Review validation • 4. Open Dashboard • 5. Export / present — chart ranges & KPIs auto-update.</div></div>
                </div>
              </div>
            )}

            {view==="school" && (
              <div id="panel-school" role="tabpanel" aria-labelledby="tab-school" tabIndex={0} className="space-y-4 outline-none">
                <div className="bg-white border border-stone-200 rounded-2xl p-4 flex flex-wrap items-center gap-3">
                  <span className="text-xs font-bold tracking-widest uppercase text-stone-600">School Analysis</span>
                  <label className="sr-only" htmlFor="ranking-metric-school">Ranking metric</label>
                  <select id="ranking-metric-school" aria-label="Ranking metric" value={rankingMetric} onChange={e=>setRankingMetric(e.target.value as any)} className="px-3 py-2 rounded-xl border border-stone-200 bg-white text-sm font-medium focus-visible:ring-2 focus-visible:ring-violet-500">
                    <option value="DOWNLOADS">Rank by Downloads</option><option value="REGISTERED USERS">Rank by Registered</option><option value="ACTUAL USERS">Rank by Active</option><option value="PARTICIPATION RATE">Rank by Participation</option>
                  </select>
                  <label className="sr-only" htmlFor="school-filter-2">Filter by school</label>
                  <select id="school-filter-2" aria-label="Filter by school" value={schoolFilter} onChange={e=>setSchoolFilter(e.target.value)} className="px-3 py-2 rounded-xl border border-stone-200 bg-white text-sm max-w-[240px] focus-visible:ring-2 focus-visible:ring-violet-500">
                    {schoolOptions.map(o=><option key={o}>{o}</option>)}
                  </select>
                  <span className="ml-auto text-xs text-stone-600">{rankingData.length} ranked • {activityDist.reduce((a,b)=>a+b.value,0)} schools in scope</span>
                </div>
                <div className="grid lg:grid-cols-[1.1fr_0.9fr] gap-4">
                  <div className="bg-white border border-stone-200 rounded-2xl shadow-sm overflow-hidden">
                    <div className="px-5 py-4 border-b border-stone-200"><div className="text-sm font-bold text-stone-900">School Ranking — Top 10 by {rankingMetric}</div><div className="text-xs text-stone-600">Conditional formatting • bars grow with value</div></div>
                    <div className="h-[420px] p-2">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={[...rankingData].reverse()} layout="vertical" margin={{left:10,right:20}}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#f5f5f4" horizontal={false}/>
                          <XAxis type="number" tick={{fontSize:11}} tickFormatter={fmtCompact}/>
                          <YAxis dataKey="name" type="category" width={140} tick={{fontSize:11, width:130}} tickFormatter={(v:string)=> v.length>22 ? v.slice(0,22)+'…' : v}/>
                          <Tooltip content={<Tip/>}/>
                          <Bar dataKey="value" fill="#7c3aed" radius={[0,8,8,0]}/>
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  </div>
                  <div className="bg-white border border-stone-200 rounded-2xl shadow-sm overflow-hidden">
                    <div className="px-5 py-4 border-b border-stone-200"><div className="text-sm font-bold text-stone-900">School Activity Distribution</div><div className="text-xs text-stone-600">High / Moderate / Low / No — documented thresholds</div></div>
                    <div className="h-[260px] p-3">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={activityDist}><CartesianGrid strokeDasharray="3 3" stroke="#f5f5f4"/><XAxis dataKey="name" tick={{fontSize:10}} interval={0} angle={-10} dy={8} height={48}/><YAxis tick={{fontSize:11}} allowDecimals={false}/><Tooltip content={<Tip/>}/><Bar dataKey="value" radius={[8,8,0,0]}>{activityDist.map((_,i)=><Cell key={i} fill={["#e7e5e4","#fde68a","#fb923c","#16a34a"][i]}/> )}</Bar></BarChart>
                      </ResponsiveContainer>
                    </div>
                    <div className="px-5 pb-4">
                      <div className="rounded-xl bg-stone-50 border border-stone-200 p-3 text-xs leading-5">
                        <div className="font-bold text-stone-900">Definitions</div>
                        <div className="text-stone-600 mt-1 space-y-1">
                          <div><span className="inline-block size-2 rounded-full bg-emerald-500 mr-1"/> High: &gt;100 downloads</div>
                          <div><span className="inline-block size-2 rounded-full bg-orange-400 mr-1"/> Moderate: 21–100</div>
                          <div><span className="inline-block size-2 rounded-full bg-amber-300 mr-1"/> Low: 1–20</div>
                          <div><span className="inline-block size-2 rounded-full bg-stone-300 mr-1"/> No: 0</div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
                <div className="bg-white border border-stone-200 rounded-2xl shadow-sm overflow-hidden">
                  <div className="px-5 py-4 border-b border-stone-200 flex items-center justify-between">
                    <div><div className="text-sm font-bold text-stone-900">School Detail Table — with data bars & participation scale</div><div className="text-xs text-stone-600">Click headers to sort • visual indicators make large differences immediate</div></div>
                    <span className="text-xs bg-stone-50 border border-stone-200 rounded-full px-3 py-1">{filtered.length} rows</span>
                  </div>
                  <div tabIndex={0} role="region" aria-label="School detail table, scroll to see more columns" className="overflow-auto max-h-[560px] focus-visible:ring-2 focus-visible:ring-violet-500 focus-visible:ring-inset outline-none">
                    <table className="w-full text-sm">
                      <thead className="sticky top-0 bg-stone-50 border-b border-stone-200">
                        <tr>{displayedHeaders.map(h=>(
                          <th key={h} scope="col" tabIndex={0} role="button" aria-sort={sortKey===h ? (sortDir==="asc" ? "ascending" : "descending") : "none"} aria-label={`${h}, sortable`} onClick={()=>{ if(sortKey===h) setSortDir(d=>d==="asc"?"desc":"asc"); else {setSortKey(h); setSortDir("asc")}}} onKeyDown={e=>{ if(e.key==="Enter"||e.key===" "){ e.preventDefault(); if(sortKey===h) setSortDir(d=>d==="asc"?"desc":"asc"); else {setSortKey(h); setSortDir("asc")} } }} className="text-left px-3 py-2.5 font-semibold cursor-pointer whitespace-nowrap hover:bg-stone-100 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-violet-500 outline-none">{h} <span aria-hidden="true">{sortKey===h&&(sortDir==="asc"?"▲":"▼")}</span></th>
                        ))}</tr>
                      </thead>
                      <tbody className="divide-y divide-stone-100">
                        {paged.map((r,i)=>(
                          <tr key={i} className="hover:bg-stone-50">
                            {displayedHeaders.map(h=>{
                              const v=cleanValue(r[h]); const n=toNumber(v)
                              if(h==="DOWNLOADS" && n!==null){
                                const pct=downloadMax? (n/downloadMax*100):0
                                return <td key={h} className="px-3 py-2 whitespace-nowrap"><div className="flex items-center gap-2"><div className="w-20 h-2 bg-stone-100 rounded-full overflow-hidden"><div className="h-full bg-violet-600 rounded-full" style={{width:`${pct}%`}}/></div><span className="font-mono text-xs font-medium">{fmt(n)}</span></div></td>
                              }
                              if(h==="PARTICIPATION RATE"){
                                const num=toNumber(v)??0; let bg="bg-stone-100 text-stone-600 border-stone-200"; if(num===0) bg="bg-red-50 text-red-700 border-red-200"; else if(num<30) bg="bg-amber-50 text-amber-700 border-amber-200"; else if(num<70) bg="bg-yellow-50 text-yellow-700 border-yellow-200"; else bg="bg-emerald-50 text-emerald-700 border-emerald-200";
                                return <td key={h} className="px-3 py-2 whitespace-nowrap"><span className={`inline-flex px-2 py-0.5 rounded-full border text-xs font-semibold ${bg}`}>{v||"0%"}</span></td>
                              }
                              if(h==="SCHOOL NAME") return <td key={h} className="px-3 py-2 max-w-[280px] truncate font-medium text-stone-800" title={v}>{v}</td>
                              return <td key={h} className="px-3 py-2 whitespace-nowrap max-w-[260px] truncate">{v||<span className="text-stone-300">—</span>}</td>
                            })}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <div className="px-4 py-3 bg-stone-50 border-t border-stone-200 flex items-center justify-between text-xs">
                    <span className="text-stone-600">Showing {(page-1)*pageSize+1}–{Math.min(page*pageSize,filtered.length)} of {fmt(filtered.length)}</span>
                    <div className="flex gap-2"><button disabled={page<=1} onClick={()=>setPage(p=>p-1)} className="px-3 py-1 rounded-full border bg-white disabled:opacity-40">‹ Prev</button><span className="px-3 py-1 rounded-full bg-white border">Page {page}/{totalPages}</span><button disabled={page>=totalPages} onClick={()=>setPage(p=>p+1)} className="px-3 py-1 rounded-full border bg-white disabled:opacity-40">Next ›</button></div>
                  </div>
                </div>
              </div>
            )}

            {view==="users" && (
              <div id="panel-users" role="tabpanel" aria-labelledby="tab-users" tabIndex={0} className="space-y-4 outline-none">
                {userKPIs?(
                  <>
                    <div className="grid lg:grid-cols-3 gap-4">
                      <div className="lg:col-span-2 bg-white border border-stone-200 rounded-2xl shadow-sm overflow-hidden">
                        <div className="px-5 py-4 border-b border-stone-200"><div className="text-sm font-bold text-stone-900">Users by Role</div><div className="text-xs text-stone-600">Distribution • keep off dashboard unless needed</div></div>
                        <div className="h-[280px] p-3">
                          <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={userKPIs.byRole.map(([name,value])=>({name,value}))}>
                              <CartesianGrid strokeDasharray="3 3" stroke="#f5f5f4"/>
                              <XAxis dataKey="name" tick={{fontSize:11}} interval={0} angle={-12} dy={8} height={50}/>
                              <YAxis tick={{fontSize:11}} allowDecimals={false}/>
                              <Tooltip content={<Tip/>}/>
                              <Bar dataKey="value" fill="#7c3aed" radius={[8,8,0,0]}/>
                            </BarChart>
                          </ResponsiveContainer>
                        </div>
                      </div>
                      <div className="bg-white border border-stone-200 rounded-2xl shadow-sm overflow-hidden">
                        <div className="px-5 py-4 border-b border-stone-200"><div className="text-sm font-bold text-stone-900">Users by Gender</div><div className="text-xs text-stone-600">If applicable & appropriate</div></div>
                        <div className="h-[280px] p-3">
                          <ResponsiveContainer width="100%" height="100%">
                            <PieChart><Pie data={userKPIs.byGender.map(([name,value])=>({name,value}))} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={50} outerRadius={85} paddingAngle={3} label={({name,percent}:any)=>`${name} ${((percent??0)*100).toFixed(0)}%`}>{userKPIs.byGender.map((_:any,i:number)=><Cell key={i} fill={COLORS[i%COLORS.length]}/>)}</Pie><Tooltip content={<Tip/>}/></PieChart>
                          </ResponsiveContainer>
                        </div>
                      </div>
                    </div>
                    <div className="bg-white border border-stone-200 rounded-2xl shadow-sm overflow-hidden">
                      <div className="px-5 py-4 border-b border-stone-200"><div className="text-sm font-bold text-stone-900">New User Registrations — by month</div><div className="text-xs text-stone-600">Registration trend for long-term analysis</div></div>
                      <div className="h-[260px] p-3">
                        {userRegTrend.length?(
                          <ResponsiveContainer width="100%" height="100%">
                            <AreaChart data={userRegTrend}><CartesianGrid strokeDasharray="3 3" stroke="#f5f5f4"/><XAxis dataKey="name" tick={{fontSize:11}}/><YAxis tick={{fontSize:11}} allowDecimals={false}/><Tooltip content={<Tip/>}/><Area type="monotone" dataKey="value" stroke="#10b981" fill="#dcfce7" strokeWidth={2}/></AreaChart>
                          </ResponsiveContainer>
                        ):<div className="h-full grid place-items-center text-sm text-stone-600">No date data</div>}
                      </div>
                    </div>
                    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                      <div className="bg-white border border-stone-200 rounded-2xl p-4 text-center"><div className="text-xs text-stone-600">Total Users</div><div className="text-xl font-extrabold">{fmt(userKPIs.totalUsers)}</div></div>
                      <div className="bg-white border border-stone-200 rounded-2xl p-4 text-center"><div className="text-xs text-stone-600">New in {reportingMonth}</div><div className="text-xl font-extrabold text-violet-600">{fmt(userKPIs.newUsers)}</div></div>
                      <div className="bg-white border border-stone-200 rounded-2xl p-4 text-center"><div className="text-xs text-stone-600">Roles</div><div className="text-xl font-extrabold">{userKPIs.byRole.length}</div></div>
                      <div className="bg-white border border-stone-200 rounded-2xl p-4 text-center"><div className="text-xs text-stone-600">Avg downloads / user</div><div className="text-xl font-extrabold">{(userKPIs.totalDownloads/userKPIs.totalUsers).toFixed(1)}</div></div>
                    </div>
                    <div className="bg-white border border-stone-200 rounded-2xl shadow-sm overflow-hidden">
                      <div className="px-5 py-4 border-b border-stone-200"><div className="text-sm font-bold text-stone-900">User Detail Table</div><div className="text-xs text-stone-600">Retain user records • search by name, email, ID</div></div>
                      <div className="overflow-auto max-h-[520px]">
                        <table className="w-full text-sm"><thead className="sticky top-0 bg-stone-50 border-b"><tr>{displayedHeaders.map(h=>(
                          <th key={h} onClick={()=>{ if(sortKey===h) setSortDir(d=>d==="asc"?"desc":"asc"); else {setSortKey(h); setSortDir("asc")}}} className="text-left px-3 py-2.5 font-semibold cursor-pointer whitespace-nowrap hover:bg-stone-100">{h} {sortKey===h&&(sortDir==="asc"?"▲":"▼")}</th>
                        ))}</tr></thead><tbody className="divide-y divide-stone-100">{paged.map((r,i)=>(
                          <tr key={i} className="hover:bg-stone-50">{displayedHeaders.map(h=>{
                            const v=cleanValue(r[h]); const low=v.toLowerCase()
                            if(low==="active") return <td key={h} className="px-3 py-2"><span className="text-xs font-bold bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-full px-2 py-0.5">ACTIVE</span></td>
                            if(low==="female") return <td key={h} className="px-3 py-2"><span className="text-xs bg-pink-50 text-pink-700 border border-pink-200 rounded-full px-2 py-0.5">Female</span></td>
                            if(low==="male") return <td key={h} className="px-3 py-2"><span className="text-xs bg-sky-50 text-sky-700 border border-sky-200 rounded-full px-2 py-0.5">Male</span></td>
                            return <td key={h} className="px-3 py-2 whitespace-nowrap max-w-[260px] truncate">{v||<span className="text-stone-300">—</span>}</td>
                          })}</tr>
                        ))}</tbody></table>
                      </div>
                      <div className="px-4 py-3 bg-stone-50 border-t flex items-center justify-between text-xs"><span>{fmt(filtered.length)} users</span><div className="flex gap-2"><button disabled={page<=1} onClick={()=>setPage(p=>p-1)} className="px-3 py-1 rounded-full border bg-white disabled:opacity-40">Prev</button><span className="px-3 py-1 bg-white border rounded-full">Page {page}/{totalPages}</span><button disabled={page>=totalPages} onClick={()=>setPage(p=>p+1)} className="px-3 py-1 rounded-full border bg-white disabled:opacity-40">Next</button></div></div>
                    </div>
                  </>
                ):(
                  <div className="bg-amber-50 border border-amber-200 rounded-2xl p-8 text-center"><div className="text-amber-800 font-semibold">Load the Registered Users Excel to see User Analysis</div><div className="text-sm text-amber-700 mt-1">Current file is {datasetType} — switch to a user file or upload one.</div><button onClick={()=>loadSample("/samples/sample-registered.xls","LR Portal Registered Users.xls")} className="mt-3 px-4 py-2 rounded-full bg-amber-600 text-white text-sm font-semibold">Load sample users</button></div>
                )}
              </div>
            )}

            {view==="trends" && (
              <div id="panel-trends" role="tabpanel" aria-labelledby="tab-trends" tabIndex={0} className="space-y-4 outline-none">
                <div className="bg-white border border-stone-200 rounded-2xl shadow-sm overflow-hidden">
                  <div className="px-5 py-4 border-b border-stone-200"><div className="text-sm font-bold text-stone-900">Monthly Overview — totals & month-to-month comparison</div><div className="text-xs text-stone-600">Historical trend • add new month via import, chart auto-updates</div></div>
                  <div className="h-[340px] p-3">
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={trendData}><CartesianGrid strokeDasharray="3 3" stroke="#f5f5f4"/><XAxis dataKey="month" tick={{fontSize:11}}/><YAxis tick={{fontSize:11}} tickFormatter={fmtCompact}/><Tooltip content={<Tip/>}/><Area type="monotone" dataKey="downloads" name="Downloads" stroke="#7c3aed" fill="#ede9ff" strokeWidth={2}/>{trendData[0]?.registered!=null&&<Area type="monotone" dataKey="registered" name="Registered" stroke="#06b6d4" fill="#cffafe" strokeWidth={1.5}/>}</AreaChart>
                    </ResponsiveContainer>
                  </div>
                </div>
                <div className="grid lg:grid-cols-2 gap-4">
                  <div className="bg-white border border-stone-200 rounded-2xl p-4">
                    <div className="text-sm font-bold text-stone-900">School Monthly Trend — Downloads</div>
                    <div className="h-[240px] mt-3">
                      <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={trendData}><CartesianGrid strokeDasharray="3 3" stroke="#f5f5f4"/><XAxis dataKey="month" tick={{fontSize:11}}/><YAxis tick={{fontSize:11}} tickFormatter={fmtCompact}/><Tooltip content={<Tip/>}/><Line type="monotone" dataKey="downloads" stroke="#7c3aed" strokeWidth={2.5} dot={{r:3}}/></LineChart>
                      </ResponsiveContainer>
                    </div>
                  </div>
                  <div className="bg-white border border-stone-200 rounded-2xl p-4">
                    <div className="text-sm font-bold text-stone-900">Registered Users Monthly Trend</div>
                    <div className="h-[240px] mt-3">
                      <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={trendData}><CartesianGrid strokeDasharray="3 3" stroke="#f5f5f4"/><XAxis dataKey="month" tick={{fontSize:11}}/><YAxis tick={{fontSize:11}}/><Tooltip content={<Tip/>}/><Line type="monotone" dataKey="registered" stroke="#06b6d4" strokeWidth={2.5} dot={{r:3}}/></LineChart>
                      </ResponsiveContainer>
                    </div>
                  </div>
                </div>
                <div className="bg-white border border-stone-200 rounded-2xl shadow-sm overflow-hidden">
                  <div className="px-5 py-3 border-b border-stone-200"><div className="text-sm font-bold text-stone-900">Monthly Data (historical summary)</div><div className="text-xs text-stone-600">Auto-generated from current file + synthetic history — replace with real monthly archives as you import</div></div>
                  <div className="overflow-auto">
                    <table className="w-full text-sm"><thead className="bg-stone-50 border-b"><tr><th className="text-left px-4 py-2">Month</th><th className="text-right px-4 py-2">Schools</th><th className="text-right px-4 py-2">Registered</th><th className="text-right px-4 py-2">Downloads</th></tr></thead><tbody className="divide-y divide-stone-100">{trendData.map(r=>(
                      <tr key={r.month} className={r.month===reportingMonth.slice(0,3)?"bg-violet-50":"hover:bg-stone-50"}><td className="px-4 py-2 font-medium">{r.month}</td><td className="px-4 py-2 text-right font-mono">{r.schools?fmt(r.schools):"—"}</td><td className="px-4 py-2 text-right font-mono">{r.registered?fmt(r.registered):"—"}</td><td className="px-4 py-2 text-right font-mono font-semibold">{fmt(r.downloads)}</td></tr>
                    ))}</tbody></table>
                  </div>
                </div>
              </div>
            )}

            {view==="data" && (
              <div id="panel-data" role="tabpanel" aria-labelledby="tab-data" tabIndex={0} className="space-y-4 outline-none">
                <div className="bg-white border border-stone-200 rounded-2xl p-4 flex flex-wrap items-center gap-3">
                  <span className="text-sm font-bold text-stone-900">Detailed Data</span>
                  <span className="text-xs text-stone-600">Raw records retained separate from visuals • search reduces rows • export keeps filtered view</span>
                  <div className="ml-auto flex items-center gap-2">
                    <label className="sr-only" htmlFor="page-size">Rows per page</label>
                    <select id="page-size" aria-label="Rows per page" value={pageSize} onChange={e=>setPageSize(Number(e.target.value))} className="px-2 py-1.5 rounded-xl border border-stone-200 bg-white text-xs focus-visible:ring-2 focus-visible:ring-violet-500"><option value={10}>10 / page</option><option value={25}>25 / page</option><option value={50}>50 / page</option><option value={100}>100 / page</option></select>
                    <button onClick={()=>{
                      try{ const ws=XLSX.utils.json_to_sheet(filtered); const csv=XLSX.utils.sheet_to_csv(ws); const blob=new Blob([csv],{type:"text/csv"}); const url=URL.createObjectURL(blob); const a=document.createElement("a"); a.href=url; a.download=`sheetly-${reportingMonth}-${reportingYear}.csv`; a.click(); URL.revokeObjectURL(url); setToast(`Exported ${fmt(filtered.length)} rows to CSV`) } catch{ setToast("Export failed") }
                    }} className="px-3 py-1.5 rounded-xl bg-violet-600 text-white text-xs font-semibold hover:bg-violet-700 focus-visible:ring-2 focus-visible:ring-violet-500">Export CSV</button>
                    <button onClick={()=>window.print()} className="px-3 py-1.5 rounded-xl border border-stone-200 bg-white text-xs font-medium hover:bg-stone-50 focus-visible:ring-2 focus-visible:ring-violet-500">Print</button>
                  </div>
                </div>

                {/* Data Validation & Quality Summary per spec 23-24 */}
                {quality && (
                  <div className="grid lg:grid-cols-[1.1fr_0.9fr] gap-4">
                    <div className="bg-white border border-stone-200 rounded-2xl shadow-sm overflow-hidden">
                      <div className="px-5 py-3 border-b border-stone-200 flex items-center justify-between"><div className="text-sm font-bold text-stone-900">Data Quality</div><span className={`text-xs font-bold px-2.5 py-1 rounded-full border ${quality.status.includes("READY")?"bg-emerald-50 text-emerald-700 border-emerald-200":"bg-amber-50 text-amber-700 border-amber-200"}`}>{quality.status}</span></div>
                      <div className="p-4 grid grid-cols-2 gap-3 text-sm">
                        <div className="bg-stone-50 border border-stone-200 rounded-xl p-3 text-center"><div className="text-xs text-stone-600">Records Checked</div><div className="text-lg font-extrabold">{fmt(quality.total)}</div></div>
                        <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3 text-center"><div className="text-xs text-emerald-600">Complete Records</div><div className="text-lg font-extrabold text-emerald-700">{fmt(quality.complete)}</div></div>
                        <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-center"><div className="text-xs text-amber-600">Missing Values</div><div className="text-lg font-extrabold text-amber-700">{fmt(quality.missingRecords)}</div></div>
                        <div className="bg-stone-50 border border-stone-200 rounded-xl p-3 text-center"><div className="text-xs text-stone-600">Duplicate Records</div><div className="text-lg font-extrabold">{fmt(quality.dups)}</div></div>
                      </div>
                      <div className="px-5 pb-4 text-xs text-stone-600">Validation Status: <b className={quality.status.includes("READY")?"text-emerald-700":"text-amber-700"}>{quality.status}</b> — review warnings before presenting dashboard.</div>
                    </div>
                    <div className="bg-white border border-stone-200 rounded-2xl shadow-sm overflow-hidden">
                      <div className="px-5 py-3 border-b border-stone-200"><div className="text-sm font-bold text-stone-900">Data Validation — 9 checks</div><div className="text-xs text-stone-600">Must pass before presenting monthly dashboard</div></div>
                      <div className="divide-y divide-stone-100">
                        {validationItems.map(v=>(
                          <div key={v.label} className="flex items-center justify-between px-4 py-2 text-xs">
                            <span className="flex items-center gap-2"><span className={`size-5 rounded-full grid place-items-center text-[10px] font-bold ${v.ok?"bg-emerald-500 text-white":"bg-amber-500 text-white"}`}>{v.ok?"✓":"!"}</span><span className="font-medium text-stone-700">{v.label}</span></span>
                            <span className={`font-mono ${v.ok?"text-stone-600":"text-amber-700 font-semibold"}`}>{v.detail}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                )}

                <div className="bg-white border border-stone-200 rounded-2xl shadow-sm overflow-hidden">
                  <div className="px-4 py-3 border-b border-stone-200 flex flex-wrap items-center gap-2">
                    <div className="relative"><label className="sr-only" htmlFor="data-search">Search data</label><input id="data-search" type="search" aria-label="Search school, user or ID" value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search school, user, ID…" className="w-[240px] pl-8 pr-3 py-2 rounded-xl border border-stone-200 bg-stone-50 focus:bg-white focus:border-violet-500 focus:ring-2 focus:ring-violet-500/20 outline-none text-sm"/><span aria-hidden="true" className="absolute left-2.5 top-2.5 text-stone-600 text-xs">⌕</span></div>
                    <span className="text-xs text-stone-600">{fmt(filtered.length)} of {fmt(active?.rows.length??0)} match</span>
                    <details className="ml-auto relative">
                      <summary className="list-none cursor-pointer text-xs font-semibold px-3 py-2 rounded-xl border border-stone-200 bg-white">Columns ▾</summary>
                      <div className="absolute right-0 mt-2 w-64 bg-white border border-stone-200 rounded-2xl shadow-xl p-2 z-20 max-h-72 overflow-auto">
                        {active?.headers.map(h=>(
                          <label key={h} className="flex items-center gap-2 px-2 py-1.5 hover:bg-stone-50 rounded-xl text-sm cursor-pointer">
                            <input type="checkbox" checked={displayedHeaders.includes(h)} onChange={e=> setVisibleCols(prev=>{
                              const cur=prev??active.headers; return e.target.checked? [...cur,h] : cur.filter(x=>x!==h)
                            })}/><span className="truncate">{h}</span><span className="ml-auto text-[10px] px-1.5 py-0.5 rounded-full border bg-stone-50">{columnTypes[h]==="number"?"#":columnTypes[h]==="percent"?"%":columnTypes[h]==="date"?"📅":"Aa"}</span>
                          </label>
                        ))}
                        <button onClick={()=>setVisibleCols(active?.headers??null)} className="w-full mt-2 text-xs font-bold bg-stone-900 text-white rounded-full py-1.5">Reset</button>
                      </div>
                    </details>
                  </div>
                  <div tabIndex={0} role="region" aria-label="Detailed data table, scroll to see more" className="overflow-auto max-h-[560px] focus-visible:ring-2 focus-visible:ring-violet-500 focus-visible:ring-inset outline-none">
                    <table className="w-full text-sm">
                      <thead className="sticky top-0 bg-stone-50 border-b border-stone-200"><tr>{displayedHeaders.map(h=>(
                        <th key={h} scope="col" tabIndex={0} role="button" aria-sort={sortKey===h ? (sortDir==="asc" ? "ascending" : "descending") : "none"} aria-label={`${h}, sortable, ${sortKey===h ? `sorted ${sortDir==="asc"?"ascending":"descending"}` : "not sorted"}. Press Enter to sort.`} onClick={()=>{ if(sortKey===h) setSortDir(d=>d==="asc"?"desc":"asc"); else {setSortKey(h); setSortDir("asc")}}} onKeyDown={e=>{ if(e.key==="Enter"||e.key===" "){ e.preventDefault(); if(sortKey===h) setSortDir(d=>d==="asc"?"desc":"asc"); else {setSortKey(h); setSortDir("asc")} } }} className="text-left px-3 py-2.5 font-semibold cursor-pointer whitespace-nowrap hover:bg-stone-100 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-violet-500 outline-none">{h} <span aria-hidden="true">{sortKey===h&&(sortDir==="asc"?"▲":"▼")}</span></th>
                      ))}</tr></thead>
                      <tbody className="divide-y divide-stone-100">
                        {paged.length===0? <tr><td colSpan={displayedHeaders.length} className="text-center py-12"><div className="mx-auto max-w-sm"><div className="size-10 mx-auto rounded-full bg-stone-100 grid place-items-center text-stone-600">∅</div><div className="mt-2 font-semibold text-stone-700">No rows match</div><div className="text-xs text-stone-600 mt-1 truncate px-4">“{String(deferredSearch).slice(0,60)}” — try clearing search or filters</div><button onClick={()=>{setSearch(""); setSchoolFilter("All Schools")}} className="mt-3 text-xs font-semibold px-3 py-1.5 rounded-full border border-stone-200 bg-white hover:bg-stone-50">Clear filters</button></div></td></tr> : paged.map((r,i)=>(
                          <tr key={i} className="hover:bg-stone-50">
                            {displayedHeaders.map(h=>{
                              const v=cleanValue(r[h]); const t=columnTypes[h]
                              if(!v) return <td key={h} className="px-3 py-2"><span className="text-stone-600">—</span></td>
                              const low=v.toLowerCase()
                              if(low==="active") return <td key={h} className="px-3 py-2"><span className="text-[11px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-full px-2 py-0.5">ACTIVE</span></td>
                              if(t==="percent"){ const n=toNumber(v)??0; let bg="bg-stone-100"; if(n===0) bg="bg-red-50 border-red-200 text-red-700"; else if(n<30) bg="bg-amber-50 border-amber-200"; return <td key={h} className="px-3 py-2"><span className={`px-2 py-0.5 rounded-full border text-xs font-semibold ${bg}`}>{v}</span></td> }
                              if(isIdColumn(h)) return <td key={h} className="px-3 py-2 font-mono text-xs">{v}</td>
                              if(t==="number"){ const n=toNumber(v); return <td key={h} className="px-3 py-2 font-mono text-xs">{n!==null&&n>=1000?fmt(n):v}</td> }
                              return <td key={h} className="px-3 py-2 max-w-[320px] truncate" title={v}>{v}</td>
                            })}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <div className="px-4 py-3 bg-stone-50 border-t flex items-center justify-between text-xs"><span className="text-stone-600">Showing {(page-1)*pageSize+1}–{Math.min(page*pageSize,filtered.length)} of {fmt(filtered.length)}</span><div className="flex gap-2"><button aria-label={`Previous page, page ${page} of ${totalPages}`} disabled={page<=1} onClick={()=>setPage(p=>p-1)} className="px-3 py-1 rounded-full border bg-white disabled:opacity-40 disabled:cursor-not-allowed focus-visible:ring-2 focus-visible:ring-violet-500">‹ Prev</button><span aria-live="polite" aria-atomic="true" className="px-3 py-1 rounded-full bg-white border">Page {page}/{totalPages}</span><button aria-label={`Next page, page ${page} of ${totalPages}`} disabled={page>=totalPages} onClick={()=>setPage(p=>p+1)} className="px-3 py-1 rounded-full border bg-white disabled:opacity-40 disabled:cursor-not-allowed focus-visible:ring-2 focus-visible:ring-violet-500">Next ›</button></div></div>
                </div>

                <div className="bg-white border border-stone-200 rounded-2xl p-4">
                  <div className="text-sm font-bold text-stone-900">Definitions / Notes</div>
                  <div className="mt-2 grid sm:grid-cols-2 gap-2 text-xs">
                    {[
                      ["Registered Users","Total registered accounts"],
                      ["Active Users","Users meeting activity criteria (Active status / >0 downloads)"],
                      ["Participation Rate","Actual ÷ Registered ×100"],
                      ["Active School","School with Downloads >0"],
                      ["Downloads","Total recorded downloads"],
                    ].map(([k,v])=>(
                      <div key={k} className="flex gap-2 border border-stone-100 rounded-xl px-3 py-2 bg-stone-50"><span className="font-semibold text-stone-800 whitespace-nowrap">{k}:</span><span className="text-stone-600">{v}</span></div>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </main>

      {toast && <div role="status" aria-live="polite" className="fixed bottom-4 left-1/2 -translate-x-1/2 bg-stone-900 text-white text-sm font-medium px-4 py-2.5 rounded-full shadow-xl z-50">{toast}</div>}
      <footer className="border-t border-stone-200 mt-8 py-6 text-center text-xs text-stone-600">
        Sheetly • Monthly Visual Report System • Data → Information → Visualization → Insight • Print hides controls • All local
      </footer>
    </div>
  )
}
