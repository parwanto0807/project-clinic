'use client'

import { motion } from 'framer-motion'
import { FiCalendar, FiPackage, FiUsers, FiClock, FiShield, FiTrendingUp, FiHeart, FiAward } from 'react-icons/fi'
import { useSettingsStore } from '@/lib/store/useSettingsStore'

const iconMap: Record<string, any> = {
  calendar: FiCalendar,
  users: FiUsers,
  package: FiPackage,
  clock: FiClock,
  shield: FiShield,
  trendingUp: FiTrendingUp,
  heart: FiHeart,
  award: FiAward,
}

export default function FeaturesSection() {
  const { settings } = useSettingsStore()
  const features = settings.features

  return (
    <section id="features" className="section-padding bg-white dark:bg-slate-950 transition-colors duration-500 overflow-hidden">
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
            Fitur Unggulan
          </h2>
          <p className="text-xl text-gray-600 dark:text-gray-400 max-w-3xl mx-auto">
            Lengkap dengan tools modern untuk manajemen klinik yang lebih efisien
          </p>
        </motion.div>

        {/* Features Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-8">
          {features.map((feature: any, index: number) => {
            const Icon = iconMap[feature.icon as keyof typeof iconMap] || FiShield
            return (
              <motion.div
                key={index}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.6, delay: index * 0.1 }}
                viewport={{ once: true }}
                className="group p-8 rounded-[2rem] border-2 border-gray-100 dark:border-slate-800 bg-white dark:bg-slate-900/50 hover:border-primary hover:shadow-xl dark:hover:shadow-primary/5 transition-all duration-300"
              >
                <div className="w-14 h-14 bg-gradient-to-br from-primary/10 to-secondary/10 dark:from-primary/20 dark:to-secondary/20 rounded-2xl flex items-center justify-center mb-6 group-hover:scale-110 transition-transform shadow-inner">
                  <Icon className="w-7 h-7 text-primary" />
                </div>
                <h3 className="text-xl font-bold mb-3 text-gray-900 dark:text-white">
                  {feature.title}
                </h3>
                <p className="text-gray-600 dark:text-gray-400 leading-relaxed text-sm">
                  {feature.description}
                </p>
              </motion.div>
            )
          })}
        </div>
      </div>
    </section>
  )
}
