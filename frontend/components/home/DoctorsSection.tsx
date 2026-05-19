'use client'

import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import axios from 'axios'
import { FiInstagram, FiTwitter, FiLinkedin } from 'react-icons/fi'

interface Doctor {
  id: string
  name: string
  specialization: string
  bio?: string
  profilePicture?: string
}

export default function DoctorsSection() {
  const [doctors, setDoctors] = useState<Doctor[]>([])
  const [loading, setLoading] = useState(true)
  const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5004'

  const isFemaleDoctor = (name: string): boolean => {
    const lowerName = name.toLowerCase();
    
    // Honorific/Title prefixes
    if (lowerName.includes('hj.') || lowerName.includes('hajah') || lowerName.includes('ibu') || lowerName.includes('ny.')) {
      return true;
    }
    if (lowerName.includes('h.') || lowerName.includes('haji') || lowerName.includes('bapak') || lowerName.includes('bpk.')) {
      return false;
    }
    
    // Female keywords
    const femaleKeywords = [
      'siti', 'sri', 'dewi', 'sintia', 'balqish', 'putri', 'diah', 'fitri', 'indah', 'rina', 
      'ani', 'ria', 'kartika', 'aisyah', 'fatimah', 'nurmala', 'lilis', 'yanti', 'wulan', 
      'lestari', 'rahayu', 'ningsih', 'amalia', 'lidya', 'ayu', 'sari', 'widya', 'agustina', 
      'maria', 'theresia', 'sarah', 'diana', 'indri', 'desi', 'ratna', 'novita', 'dhyandra', 
      'lia', 'anisa', 'annisa', 'mutia', 'ulia', 'mega', 'ita', 'ratu'
    ];
    
    // Male keywords
    const maleKeywords = [
      'prasetyo', 'bambang', 'agus', 'budi', 'hadi', 'hendra', 'ahmad', 'muhammad', 'rudi', 
      'eko', 'joko', 'dedi', 'dedy', 'toni', 'tony', 'rian', 'ryan', 'aris', 'andi', 'aditya', 
      'yanto', 'wawan', 'teguh', 'sigit', 'fajar', 'surya', 'rizal', 'gunawan', 'agung', 
      'deny', 'deni', 'roni', 'rony', 'hasan', 'husain', 'ridwan', 'taufik', 'yusuf', 
      'arief', 'arif', 'imran', 'zulkifli', 'setiawan', 'kurniawan', 'sugeng', 'slamet', 'mulyono',
      'susilo', 'heru', 'triyono', 'supriadi', 'anwar', 'wibowo', 'saputra', 'wahyudi'
    ];

    for (const kw of femaleKeywords) {
      if (lowerName.includes(kw)) return true;
    }
    for (const kw of maleKeywords) {
      if (lowerName.includes(kw)) return false;
    }
    
    if (lowerName.endsWith('o') || lowerName.endsWith('us') || lowerName.endsWith('an') || lowerName.endsWith('am') || lowerName.endsWith('ad') || lowerName.endsWith('in') || lowerName.endsWith('ar')) {
      return false;
    }
    
    return true; // Default fallback to female
  };

  const getDefaultDoctorPhoto = (name: string): string => {
    return isFemaleDoctor(name) ? '/default-doctor-female.png' : '/default-doctor-male.png';
  };

  const getDoctorPhoto = (pic: string | undefined, name: string) => {
    if (!pic) return getDefaultDoctorPhoto(name);
    const cleanPic = pic.replace(/\\/g, '/');
    if (cleanPic.startsWith('http')) return cleanPic;
    const slash = cleanPic.startsWith('/') ? '' : '/';
    return `${API_URL}${slash}${cleanPic}`;
  };

  useEffect(() => {
    const fetchDoctors = async () => {
      try {
        const response = await axios.get(`${API_URL}/api/public/doctors`)
        setDoctors(response.data)
      } catch (error) {
        console.error('Failed to fetch doctors:', error)
      } finally {
        setLoading(false)
      }
    }
    fetchDoctors()
  }, [API_URL])

  return (
    <section id="doctors" className="section-padding bg-white dark:bg-slate-950 transition-colors duration-500 overflow-hidden">
      <div className="container-custom">
        <div className="text-center mb-16">
          <motion.h2 
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
            viewport={{ once: true }}
            className="text-3xl md:text-5xl font-bold text-gray-900 dark:text-white mb-4"
          >
            Kenali <span className="text-primary">Tim Dokter</span> Kami
          </motion.h2>
          <motion.p 
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.2 }}
            viewport={{ once: true }}
            className="text-gray-600 dark:text-gray-400 max-w-2xl mx-auto"
          >
            Tenaga medis profesional yang siap memberikan pelayanan terbaik untuk kesehatan Anda dan keluarga.
          </motion.p>
        </div>

        {loading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-8">
            {[1, 2, 3].map((i) => (
              <div key={i} className="bg-gray-50 dark:bg-slate-900 rounded-2xl overflow-hidden h-[500px] animate-pulse">
                <div className="h-80 bg-gray-200 dark:bg-slate-800"></div>
                <div className="p-6 space-y-4">
                  <div className="h-4 bg-gray-200 dark:bg-slate-800 rounded w-1/4"></div>
                  <div className="h-6 bg-gray-200 dark:bg-slate-800 rounded w-3/4"></div>
                  <div className="h-12 bg-gray-200 dark:bg-slate-800 rounded w-full"></div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-8">
            {doctors.length > 0 ? (
              doctors.map((doctor, index) => (
                <motion.div
                  key={doctor.id}
                  initial={{ opacity: 0, scale: 0.9 }}
                  whileInView={{ opacity: 1, scale: 1 }}
                  transition={{ duration: 0.5, delay: index * 0.1 }}
                  viewport={{ once: true }}
                  className="group relative bg-gray-50 dark:bg-slate-900 rounded-2xl overflow-hidden border border-gray-100 dark:border-slate-800 hover:shadow-2xl dark:hover:shadow-primary/5 transition-all duration-500"
                >
                  <div className="h-80 overflow-hidden bg-gray-200 dark:bg-slate-800">
                    <img 
                      src={getDoctorPhoto(doctor.profilePicture, doctor.name)} 
                      alt={doctor.name} 
                      onError={(e) => {
                        (e.target as HTMLImageElement).src = getDefaultDoctorPhoto(doctor.name);
                      }}
                      className="w-full h-full object-cover group-hover:scale-110 transition-all duration-700" 
                    />
                  </div>
                  <div className="p-6">
                    <p className="text-primary font-bold text-sm uppercase tracking-wider mb-1">{doctor.specialization}</p>
                    <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-3">{doctor.name}</h3>
                    <p className="text-gray-600 dark:text-gray-400 text-sm leading-relaxed mb-6 line-clamp-3 h-[72px]">
                      {doctor.bio || 'Dokter berpengalaman dengan dedikasi tinggi dalam melayani pasien dan memberikan solusi medis terbaik.'}
                    </p>
                    <div className="flex items-center gap-4">
                      <a href="#" className="w-10 h-10 rounded-full bg-white dark:bg-slate-800 flex items-center justify-center text-gray-400 dark:text-gray-500 hover:bg-primary hover:text-white dark:hover:text-white transition-all shadow-sm">
                        <FiInstagram />
                      </a>
                      <a href="#" className="w-10 h-10 rounded-full bg-white dark:bg-slate-800 flex items-center justify-center text-gray-400 dark:text-gray-500 hover:bg-primary hover:text-white dark:hover:text-white transition-all shadow-sm">
                        <FiTwitter />
                      </a>
                      <a href="#" className="w-10 h-10 rounded-full bg-white dark:bg-slate-800 flex items-center justify-center text-gray-400 dark:text-gray-500 hover:bg-primary hover:text-white dark:hover:text-white transition-all shadow-sm">
                        <FiLinkedin />
                      </a>
                    </div>
                  </div>
                </motion.div>
              ))
            ) : (
              <div className="col-span-full text-center py-20 text-gray-500">
                Belum ada data dokter yang tersedia.
              </div>
            )}
          </div>
        )}
      </div>
    </section>
  )
}
