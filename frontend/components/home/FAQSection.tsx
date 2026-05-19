'use client'

import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { FiChevronDown } from 'react-icons/fi'
import { useSettingsStore } from '@/lib/store/useSettingsStore'

export default function FAQSection() {
  const { settings } = useSettingsStore()
  const faqs = settings.faq
  const [activeIndex, setActiveIndex] = useState<number | null>(0)

  if (!faqs || faqs.length === 0) return null;

  return (
    <section id="faq" className="section-padding bg-white dark:bg-slate-950 transition-colors duration-500 relative overflow-hidden">
      <div className="container-custom max-w-4xl">
        <div className="text-center mb-16">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5 }}
            className="inline-flex items-center justify-center px-4 py-1.5 rounded-full bg-primary/10 text-primary font-bold text-xs uppercase tracking-widest mb-4"
          >
            Tanya Jawab
          </motion.div>
          <motion.h2
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5, delay: 0.1 }}
            className="text-3xl md:text-4xl font-extrabold text-gray-900 dark:text-white mb-6"
          >
            Pertanyaan Umum
          </motion.h2>
          <motion.p
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5, delay: 0.2 }}
            className="text-lg text-gray-600 dark:text-gray-400"
          >
            Temukan jawaban atas pertanyaan yang sering diajukan oleh pasien kami.
          </motion.p>
        </div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5, delay: 0.3 }}
          className="space-y-4"
        >
          {faqs.map((faq: any, index: number) => {
            const isActive = activeIndex === index;
            return (
              <div 
                key={index} 
                className={`border rounded-2xl overflow-hidden transition-all duration-300 ${isActive ? 'border-primary shadow-md dark:border-primary/50' : 'border-gray-200 dark:border-slate-800'}`}
              >
                <button
                  onClick={() => setActiveIndex(isActive ? null : index)}
                  className={`w-full flex items-center justify-between p-6 text-left transition-colors duration-300 ${isActive ? 'bg-primary/5' : 'bg-white dark:bg-slate-900 hover:bg-gray-50 dark:hover:bg-slate-800'}`}
                >
                  <span className={`text-lg font-bold pr-8 ${isActive ? 'text-primary' : 'text-gray-900 dark:text-white'}`}>
                    {faq.question}
                  </span>
                  <div className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center transition-transform duration-300 ${isActive ? 'bg-primary text-white rotate-180' : 'bg-gray-100 dark:bg-slate-800 text-gray-500 dark:text-gray-400'}`}>
                    <FiChevronDown className="w-5 h-5" />
                  </div>
                </button>
                
                <AnimatePresence>
                  {isActive && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.3 }}
                    >
                      <div className="p-6 pt-0 text-gray-600 dark:text-gray-400 leading-relaxed bg-primary/5">
                        {faq.answer}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            )
          })}
        </motion.div>
      </div>
    </section>
  )
}
