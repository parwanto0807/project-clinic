'use client'

import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import axios from 'axios'
import Link from 'next/link'
import { FiClock, FiUser, FiCalendar, FiActivity } from 'react-icons/fi'

interface Schedule {
  dayOfWeek: string
  startTime: string
  endTime: string
}

interface Doctor {
  id: string
  name: string
  specialization: string
  schedules: Schedule[]
}

interface GroupedSchedules {
  [specialty: string]: Doctor[]
}

export default function DoctorScheduleSection() {
  const [groupedSchedules, setGroupedSchedules] = useState<GroupedSchedules>({})
  const [activeSpecialty, setActiveSpecialty] = useState<string>('')
  const [loading, setLoading] = useState(true)
  const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5004'

  useEffect(() => {
    const fetchSchedules = async () => {
      try {
        const response = await axios.get(`${API_URL}/api/public/doctors`)
        const docs: Doctor[] = response.data
        
        // Group by specialization
        const grouped = docs.reduce((acc: GroupedSchedules, doc) => {
          const specialty = doc.specialization || 'Umum'
          if (!acc[specialty]) acc[specialty] = []
          acc[specialty].push(doc)
          return acc
        }, {})
        
        setGroupedSchedules(grouped)
        
        // Set first specialty as active
        const specialties = Object.keys(grouped)
        if (specialties.length > 0) {
          setActiveSpecialty(specialties[0])
        }
      } catch (error) {
        console.error('Failed to fetch doctor schedules:', error)
      } finally {
        setLoading(false)
      }
    }
    fetchSchedules()
  }, [API_URL])

  const daysOrder = ['Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu', 'Minggu']

  if (loading) {
    return (
      <div className="py-20 flex justify-center items-center">
        <div className="w-10 h-10 border-4 border-primary/20 border-t-primary rounded-full animate-spin" />
      </div>
    )
  }

  const specialties = Object.keys(groupedSchedules)

  return (
    <section id="schedule" className="section-padding bg-slate-50 dark:bg-slate-900/50 transition-colors duration-500 overflow-hidden">
      <div className="container-custom">
        <div className="text-center mb-16">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
            viewport={{ once: true }}
            className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-primary/10 text-primary text-[10px] font-black uppercase tracking-[0.2em] mb-4"
          >
            <FiCalendar className="w-3.5 h-3.5" />
            Jadwal Praktik
          </motion.div>
          <motion.h2 
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.1 }}
            viewport={{ once: true }}
            className="text-3xl md:text-5xl font-black text-gray-900 dark:text-white mb-4 tracking-tight"
          >
            Jadwal <span className="text-primary">Dokter & Poli</span>
          </motion.h2>
          <motion.p 
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.2 }}
            viewport={{ once: true }}
            className="text-gray-500 dark:text-gray-400 max-w-2xl mx-auto font-medium"
          >
            Temukan jadwal praktik dokter kami untuk memudahkan rencana kunjungan kesehatan Anda.
          </motion.p>
        </div>

        {specialties.length > 0 ? (
          <div className="space-y-12">
            {/* Specialty Tabs */}
            <div className="flex flex-wrap justify-center gap-3">
              {specialties.map((specialty) => (
                <button
                  key={specialty}
                  onClick={() => setActiveSpecialty(specialty)}
                  className={`px-6 py-3 rounded-2xl font-black text-xs uppercase tracking-widest transition-all duration-300 shadow-sm ${
                    activeSpecialty === specialty 
                      ? 'bg-primary text-white shadow-xl shadow-primary/20 scale-105' 
                      : 'bg-white dark:bg-slate-800 text-gray-500 hover:text-primary dark:hover:text-primary border border-gray-100 dark:border-slate-700'
                  }`}
                >
                  {specialty}
                </button>
              ))}
            </div>

            {/* Schedule Display */}
            <AnimatePresence mode="wait">
              <motion.div
                key={activeSpecialty}
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                transition={{ duration: 0.4 }}
                className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6"
              >
                {groupedSchedules[activeSpecialty]?.map((doctor) => (
                  <div key={doctor.id} className="bg-white dark:bg-slate-800 rounded-[2.5rem] p-8 border border-gray-100 dark:border-slate-700 shadow-sm hover:shadow-2xl transition-all duration-500 group overflow-hidden relative">
                    <div className="absolute top-0 right-0 w-32 h-32 bg-primary/5 rounded-bl-[4rem] -mr-10 -mt-10 group-hover:scale-110 transition-transform duration-700" />
                    
                    <div className="relative z-10">
                      <div className="flex items-center gap-4 mb-8">
                         <div className="w-14 h-14 bg-primary/10 rounded-2xl flex items-center justify-center text-primary group-hover:scale-110 transition-transform duration-500 shadow-sm">
                            <FiUser className="w-7 h-7" />
                         </div>
                         <div>
                            <h3 className="text-lg font-black text-gray-900 dark:text-white leading-tight">{doctor.name}</h3>
                            <p className="text-[10px] font-bold text-primary uppercase tracking-widest mt-1">{doctor.specialization}</p>
                         </div>
                      </div>

                      <div className="space-y-4">
                        <div className="flex items-center gap-2 mb-2">
                           <FiClock className="w-3.5 h-3.5 text-gray-400" />
                           <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Jadwal Praktik</span>
                        </div>
                        
                        {doctor.schedules && doctor.schedules.length > 0 ? (
                          <div className="space-y-2">
                            {doctor.schedules
                              .sort((a, b) => daysOrder.indexOf(a.dayOfWeek) - daysOrder.indexOf(b.dayOfWeek))
                              .map((sched, idx) => (
                                <div key={idx} className="flex items-center justify-between p-4 bg-gray-50/50 dark:bg-slate-900/50 rounded-2xl border border-transparent hover:border-primary/20 transition-all">
                                   <span className="text-xs font-black text-gray-700 dark:text-gray-300">{sched.dayOfWeek}</span>
                                   <span className="px-3 py-1 bg-white dark:bg-slate-800 rounded-lg text-[10px] font-black text-primary shadow-sm border border-gray-100 dark:border-slate-700">
                                      {sched.startTime} - {sched.endTime}
                                   </span>
                                </div>
                              ))}
                          </div>
                        ) : (
                          <div className="py-4 text-center italic text-gray-400 text-xs font-medium">
                            Jadwal belum tersedia
                          </div>
                        )}
                      </div>

                      <Link 
                        href="/register"
                        className="w-full mt-8 py-4 bg-gray-900 dark:bg-slate-700 text-white rounded-2xl text-[10px] font-black uppercase tracking-widest hover:bg-primary transition-all shadow-lg active:scale-95 flex items-center justify-center gap-2"
                      >
                         <FiActivity className="w-4 h-4" />
                         Buat Janji Temu
                      </Link>
                    </div>
                  </div>
                ))}
              </motion.div>
            </AnimatePresence>
          </div>
        ) : (
          <div className="text-center py-20 bg-white dark:bg-slate-800 rounded-[3rem] border border-gray-100 dark:border-slate-700 shadow-sm">
             <div className="w-20 h-20 bg-gray-50 dark:bg-slate-900 rounded-full flex items-center justify-center text-gray-200 mx-auto mb-4">
                <FiCalendar className="w-10 h-10" />
             </div>
             <p className="text-gray-400 font-bold text-xs uppercase tracking-widest">Data jadwal dokter tidak ditemukan</p>
          </div>
        )}
      </div>
    </section>
  )
}
