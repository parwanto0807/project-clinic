'use client'

import { motion } from 'framer-motion'
import { useSettingsStore } from '@/lib/store/useSettingsStore'

export default function ServicesSection() {
  const { settings } = useSettingsStore()
  const services = settings.services

  return (
    <section id="services" className="section-padding bg-gray-50 dark:bg-slate-900/50 overflow-hidden">
      <div className="container-custom">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          whileInView={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          viewport={{ once: true }}
          className="text-center mb-16"
        >
          <h2 className="text-4xl sm:text-5xl font-bold mb-4 text-gray-900 dark:text-white">
            Layanan Kami
          </h2>
          <p className="text-xl text-gray-600 dark:text-gray-400 max-w-3xl mx-auto">
            Kami menyediakan layanan kesehatan komprehensif dengan standar internasional
          </p>
        </motion.div>

        {/* Services Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          {services.map((service: any, index: number) => (
            <motion.div
              key={index}
              initial={{ opacity: 0, x: index % 2 === 0 ? -50 : 50 }}
              whileInView={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.6, delay: index * 0.1 }}
              viewport={{ once: true }}
              className="relative group h-full"
            >
              {/* Card Background */}
              <div className="absolute inset-0 bg-gradient-to-br from-white to-gray-50 dark:from-slate-800 dark:to-slate-900 rounded-[2.5rem] transform group-hover:scale-[1.02] transition-all duration-500 shadow-sm group-hover:shadow-2xl dark:shadow-none border border-gray-100 dark:border-slate-800"></div>
              
              {/* Card Content */}
              <div className="relative p-10 md:p-12 h-full flex flex-col justify-center">
                <motion.div
                  whileHover={{ scale: 1.1 }}
                  className={`text-6xl md:text-7xl font-black bg-gradient-to-r ${service.gradient} bg-clip-text text-transparent mb-6 opacity-80`}
                >
                  {service.number}
                </motion.div>
                
                <h3 className="text-2xl md:text-3xl font-bold text-gray-900 dark:text-white mb-4">
                  {service.title}
                </h3>
                
                <p className="text-gray-600 dark:text-gray-400 text-lg leading-relaxed mb-6">
                  {service.description}
                </p>

                {/* Hover indicator */}
                <div className={`absolute bottom-8 left-10 md:left-12 h-1.5 bg-gradient-to-r ${service.gradient} rounded-full w-0 group-hover:w-16 transition-all duration-500`}></div>
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  )
}
