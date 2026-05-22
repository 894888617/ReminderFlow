import { Input, Text, View } from '@tarojs/components'
import Taro from '@tarojs/taro'
import { useEffect, useMemo, useState } from 'react'
import { createAppointmentProject, deleteAppointmentProject, listAppointmentProjects, type AppointmentProject, updateAppointmentProject } from '../../api/appointmentProject'
import './index.scss'

export default function ProjectSelect({ calendarId, value, projectId, onChange }:{calendarId:number;value:string;projectId?:number|null;onChange:(v:{projectName:string;projectId:number|null})=>void}) {
  const [items,setItems]=useState<AppointmentProject[]>([])
  const [open,setOpen]=useState(false)
  const [keyword,setKeyword]=useState(value||'')
  const [editingId,setEditingId]=useState<number|undefined>()
  const [editingName,setEditingName]=useState('')
  useEffect(()=>setKeyword(value||''),[value])
  const load=async(k='')=>{ if(!calendarId) return; const list=await listAppointmentProjects(calendarId,k); setItems(list||[]) }
  useEffect(()=>{ load('') },[calendarId])
  const filtered=useMemo(()=>items.filter(i=>i.name.toLowerCase().includes(keyword.trim().toLowerCase())),[items,keyword])
  const select=(p:AppointmentProject)=>{ onChange({projectId:p.id,projectName:p.name}); setKeyword(p.name); setOpen(false) }
  const remove=async(p:AppointmentProject)=>{ const ok=await Taro.showModal({title:'确认删除',content:'确认删除该服务项目吗？删除后不会影响历史预约记录。'}); if(!ok.confirm) return; await deleteAppointmentProject(p.id); if(projectId===p.id) onChange({projectId:null,projectName:value}); await load(keyword) }
  const saveEdit=async()=>{ if(!editingId) return; const name=editingName.trim(); if(!name){Taro.showToast({title:'名称不能为空',icon:'none'});return}; try{ const updated=await updateAppointmentProject(editingId,name); if(projectId===editingId) onChange({projectId:editingId,projectName:updated.name}); setEditingId(undefined); await load(keyword)}catch{Taro.showToast({title:'该服务项目已存在',icon:'none'})}}
  const maybeCreate=async()=>{ const name=(value||'').trim(); if(!name||!calendarId) return; const exist=items.find(i=>i.name===name); if(exist){ onChange({projectId:exist.id,projectName:exist.name}); return } try{ const created=await createAppointmentProject(calendarId,name); onChange({projectId:created.id,projectName:created.name}); await load('') }catch(e){ console.log(e) } }
  ;(globalThis as any).__projectSelectCreate = maybeCreate
  return <View className='project-select'>
    <Input className='form-input' value={value} onFocus={()=>{setOpen(true);load('')}} onInput={(e)=>{ const v=e.detail.value; setKeyword(v); onChange({projectId:null,projectName:v}); setOpen(true); }} />
    {open ? <View className='project-dropdown'>
      {(filtered.length?filtered:items).map((p)=><View key={p.id} className='project-item'>
        {editingId===p.id ? <Input className='edit-input' value={editingName} onInput={(e)=>setEditingName(e.detail.value)} onBlur={saveEdit} /> : <Text className='project-name' onClick={()=>select(p)}>{p.name}</Text>}
        <View className='actions'>
          <Text className='act' onClick={()=>{setEditingId(p.id);setEditingName(p.name)}}>编辑</Text>
          <Text className='act delete' onClick={()=>remove(p)}>删除</Text>
        </View>
      </View>)}
      {filtered.length===0 ? <View className='empty'>暂无匹配项目，提交预约后将自动保存为新项目</View>:null}
    </View>:null}
  </View>
}
