'use client'

import { motion } from 'framer-motion'
import { FiMapPin, FiPhone, FiMail, FiClock } from 'react-icons/fi'
import { useSettingsStore } from '@/lib/store/useSettingsStore'

export default function ContactSection() {
  const { settings } = useSettingsStore()
  const contact = settings.contact

  if (!contact) return null;

  return (
    <section id="contact" className="section-padding bg-gray-50 dark:bg-slate-900 transition-colors duration-500 overflow-hidden">
      <div className="container-custom">
        <div className="text-center max-w-3xl mx-auto mb-16">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5 }}
            className="inline-flex items-center justify-center px-4 py-1.5 rounded-full bg-primary/10 text-primary font-bold text-xs uppercase tracking-widest mb-4"
          >
            Lokasi & Kontak
          </motion.div>
          <motion.h2
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5, delay: 0.1 }}
            className="text-3xl md:text-4xl lg:text-5xl font-extrabold text-gray-900 dark:text-white mb-6"
          >
            Kunjungi Klinik Kami
          </motion.h2>
          <motion.p
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5, delay: 0.2 }}
            className="text-lg text-gray-600 dark:text-gray-400"
          >
            Kami siap melayani Anda. Hubungi kami atau kunjungi langsung klinik untuk mendapatkan pelayanan medis terbaik.
          </motion.p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 lg:gap-20">
          
          {/* Contact Info */}
          <motion.div
            initial={{ opacity: 0, x: -50 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.8 }}
            className="space-y-8"
          >
            <div className="bg-white dark:bg-slate-950 p-8 rounded-[2rem] shadow-xl shadow-gray-200/40 dark:shadow-none border border-gray-100 dark:border-slate-800">
              <h3 className="text-2xl font-bold text-gray-900 dark:text-white mb-8">Informasi Kontak</h3>
              
              <div className="space-y-6">
                <div className="flex items-start gap-4">
                  <div className="w-12 h-12 bg-primary/10 text-primary rounded-xl flex items-center justify-center flex-shrink-0">
                    <FiMapPin className="w-6 h-6" />
                  </div>
                  <div>
                    <h4 className="text-sm font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1">Alamat</h4>
                    <p className="text-lg font-medium text-gray-900 dark:text-white">{contact.address}</p>
                  </div>
                </div>

                <div className="flex items-start gap-4">
                  <div className="w-12 h-12 bg-emerald-50 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400 rounded-xl flex items-center justify-center flex-shrink-0">
                    <FiPhone className="w-6 h-6" />
                  </div>
                  <div>
                    <h4 className="text-sm font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1">Telepon / WhatsApp</h4>
                    <p className="text-lg font-medium text-gray-900 dark:text-white">{contact.phone}</p>
                  </div>
                </div>

                <div className="flex items-start gap-4">
                  <div className="w-12 h-12 bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 rounded-xl flex items-center justify-center flex-shrink-0">
                    <FiMail className="w-6 h-6" />
                  </div>
                  <div>
                    <h4 className="text-sm font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1">Email</h4>
                    <p className="text-lg font-medium text-gray-900 dark:text-white">{contact.email}</p>
                  </div>
                </div>

                <div className="flex items-start gap-4">
                  <div className="w-12 h-12 bg-amber-50 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400 rounded-xl flex items-center justify-center flex-shrink-0">
                    <FiClock className="w-6 h-6" />
                  </div>
                  <div>
                    <h4 className="text-sm font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1">Jam Operasional</h4>
                    <p className="text-lg font-medium text-gray-900 dark:text-white">{contact.hours}</p>
                  </div>
                </div>
              </div>
            </div>
          </motion.div>

          {/* Map Placeholder */}
          <motion.div
            initial={{ opacity: 0, x: 50 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.8 }}
            className="h-full min-h-[400px]"
          >
            <div className="w-full h-full rounded-[2rem] overflow-hidden shadow-xl shadow-gray-200/40 dark:shadow-none border border-gray-100 dark:border-slate-800 bg-gray-200 dark:bg-slate-800 relative">
              {/* Replace iframe src with actual Google Maps embed link */}
              <iframe 
                src={`https://maps.google.com/maps?q=${encodeURIComponent(contact.address)}&t=&z=15&ie=UTF8&iwloc=&output=embed`} 
                width="100%" 
                height="100%" 
                style={{ border: 0, minHeight: '400px' }} 
                allowFullScreen={true} 
                loading="lazy" 
                referrerPolicy="no-referrer-when-downgrade"
                className="absolute inset-0"
              ></iframe>
            </div>
          </motion.div>

        </div>
      </div>
    </section>
  )
}
