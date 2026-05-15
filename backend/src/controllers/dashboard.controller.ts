import { Request, Response } from 'express'
import { PrismaClient } from '@prisma/client'
import {
  startOfDay, endOfDay, subDays, format,
  startOfMonth, endOfMonth, startOfYear,
  eachDayOfInterval, eachMonthOfInterval, addDays
} from 'date-fns'

import { prisma } from '../lib/prisma'

export const getDashboardStats = async (req: Request, res: Response) => {
  try {
    const clinicId = (req as any).clinicId
    const isAdminView = (req as any).isAdminView
    const range = (req.query.range as string) || 'week'
    const { getJakartaDateString } = require('../utils/date')
    const jakartaTodayStr = getJakartaDateString()
    
    const today = new Date(`${jakartaTodayStr}T00:00:00+07:00`)
    const todayStart = new Date(`${jakartaTodayStr}T00:00:00+07:00`)
    const todayEnd = new Date(`${jakartaTodayStr}T23:59:59+07:00`)
    
    // Calculate Yesterday based on Jakarta Date
    const yesterdayDate = new Date(todayStart)
    yesterdayDate.setDate(yesterdayDate.getDate() - 1)
    const yesterdayStr = yesterdayDate.toLocaleDateString('en-CA', { timeZone: 'Asia/Jakarta' })
    
    const yesterdayStart = new Date(`${yesterdayStr}T00:00:00+07:00`)
    const yesterdayEnd = new Date(`${yesterdayStr}T23:59:59+07:00`)
    
    // Day Name for schedule
    const dayName = new Intl.DateTimeFormat('en-US', { weekday: 'long', timeZone: 'Asia/Jakarta' }).format(today)

    // Clinic filter — SUPER_ADMIN / isMain sees all, others see their clinic
    const clinicFilter = isAdminView ? {} : (clinicId ? { clinicId } : {})
    const branchFilter = isAdminView ? {} : (clinicId ? { branchId: clinicId } : {})

    // ─── 1. TODAY'S OPERATIONAL STATS ───────────────────────────────────────
    const [
      todayRegistrations,
      yesterdayRegistrations,
      todayRevenue,
      yesterdayRevenue,
      activeQueue,
      pendingPharmacy,
      unpaidInvoices,
      pendingProcurements,
    ] = await Promise.all([
      // Today registrations
      prisma.registration.count({
        where: {
          registrationDate: { gte: todayStart, lte: todayEnd },
          ...clinicFilter,
        },
      }),
      // Yesterday registrations (for trend)
      prisma.registration.count({
        where: {
          registrationDate: { gte: yesterdayStart, lte: yesterdayEnd },
          ...clinicFilter,
        },
      }),
      // Today revenue (paid invoices)
      prisma.invoice.aggregate({
        _sum: { total: true },
        where: {
          status: 'paid',
          invoiceDate: { gte: todayStart, lte: todayEnd },
          ...clinicFilter,
        },
      }),
      // Yesterday revenue
      prisma.invoice.aggregate({
        _sum: { total: true },
        where: {
          status: 'paid',
          invoiceDate: { gte: yesterdayStart, lte: yesterdayEnd },
          ...clinicFilter,
        },
      }),
      // Active queue (waiting + called)
      prisma.queueNumber.count({
        where: {
          queueDate: { gte: todayStart, lte: todayEnd },
          status: { in: ['waiting', 'called'] },
          ...clinicFilter,
        },
      }),
      // Pending pharmacy (prescriptions not yet dispensed)
      prisma.prescription.count({
        where: {
          dispenseStatus: 'pending',
        },
      }),
      // Unpaid invoices (outstanding receivables)
      prisma.invoice.aggregate({
        _sum: { total: true },
        _count: true,
        where: {
          status: { in: ['unpaid', 'partial'] },
          ...clinicFilter,
        },
      }),
      // Pending procurement approvals
      prisma.procurement.count({
        where: {
          status: { in: ['DRAFT', 'REQUESTED'] },
          ...branchFilter,
        },
      }),
    ])

    // ─── 2. SUPPLIER DEBT (hutang supplier) ─────────────────────────────────
    const supplierDebt = await prisma.procurement.aggregate({
      _sum: { totalAmount: true, paidAmount: true },
      where: {
        paymentStatus: { in: ['UNPAID', 'PARTIAL'] },
        status: 'RECEIVED',
        ...branchFilter,
      },
    })
    const totalDebt = (supplierDebt._sum.totalAmount || 0) - (supplierDebt._sum.paidAmount || 0)

    // ─── 3. STOCK ALERTS ────────────────────────────────────────────────────
    const thirtyDaysFromNow = new Date(today)
    thirtyDaysFromNow.setDate(thirtyDaysFromNow.getDate() + 30)
    const sixtyDaysFromNow = new Date(today)
    sixtyDaysFromNow.setDate(sixtyDaysFromNow.getDate() + 60)

    const [criticalStocks, expiringBatches] = await Promise.all([
      // Products below minimum stock
      prisma.inventoryStock.findMany({
        where: {
          ...(clinicId ? { branchId: clinicId } : {}),
          // onHandQty <= minStockAlert — Prisma doesn't support column comparison directly
          // We fetch and filter in JS for accuracy
        },
        include: {
          product: { select: { productName: true, productCode: true, minimumStock: true } },
          branch: { select: { name: true, code: true } },
        },
        take: 100,
      }),
      // Batches expiring within 60 days
      prisma.inventoryBatch.findMany({
        where: {
          expiryDate: { lte: sixtyDaysFromNow, gte: today },
          currentQty: { gt: 0 },
          ...(clinicId ? { branchId: clinicId } : {}),
        },
        include: {
          product: { select: { productName: true, productCode: true } },
          branch: { select: { name: true, code: true } },
        },
        orderBy: { expiryDate: 'asc' },
        take: 20,
      }),
    ])

    // Filter critical stocks in JS (onHandQty <= minStockAlert)
    const criticalStockList = criticalStocks
      .filter((s) => s.onHandQty <= s.minStockAlert && s.minStockAlert > 0)
      .slice(0, 15)
      .map((s) => ({
        productName: s.product.productName,
        productCode: s.product.productCode,
        onHandQty: s.onHandQty,
        minStockAlert: s.minStockAlert,
        branch: s.branch.code,
        isCritical: s.onHandQty === 0,
      }))

    const expiringList = expiringBatches.map((b) => ({
      productName: b.product.productName,
      productCode: b.product.productCode,
      batchNumber: b.batchNumber,
      expiryDate: b.expiryDate,
      currentQty: b.currentQty,
      branch: b.branch.code,
      daysLeft: Math.ceil((b.expiryDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24)),
      isCritical: b.expiryDate <= thirtyDaysFromNow,
    }))

    // ─── 4. SUMMARY CARDS (all-time totals with real trend) ─────────────────
    const clinics = await prisma.clinic.findMany({
      select: { id: true, name: true, code: true },
    })

    const [totalPatients, totalRevenueAgg, totalExpenseAgg, totalAssetValue, totalStock] =
      await Promise.all([
        prisma.patient.count(),
        // Get Total Revenue from Journal Details (Category 4-xxxx)
        prisma.journalDetail.aggregate({
          where: {
            coa: { category: 'REVENUE' },
            journalEntry: { ...clinicFilter }
          },
          _sum: { debit: true, credit: true }
        }),
        // Get Total Expense from Journal Details (Category 5-xxxx & 6-xxxx)
        prisma.journalDetail.aggregate({
          where: {
            coa: { category: 'EXPENSE' },
            journalEntry: { ...clinicFilter }
          },
          _sum: { debit: true, credit: true }
        }),
        prisma.asset.aggregate({
          _sum: { purchasePrice: true },
          where: { status: 'active', ...clinicFilter },
        }),
        prisma.inventoryStock.aggregate({
          _sum: { onHandQty: true },
          where: { ...(clinicId ? { branchId: clinicId } : {}) },
        }),
      ])

    const totalRevValue = (totalRevenueAgg._sum.credit || 0) - (totalRevenueAgg._sum.debit || 0)
    const totalExpValue = (totalExpenseAgg._sum.debit || 0) - (totalExpenseAgg._sum.credit || 0)

    const globalNetProfit = totalRevValue - totalExpValue

    // Real trend: compare today vs yesterday for registrations & revenue
    const regTrend =
      yesterdayRegistrations === 0
        ? null
        : (((todayRegistrations - yesterdayRegistrations) / yesterdayRegistrations) * 100).toFixed(1)

    const todayRev = todayRevenue._sum.total || 0
    const yestRev = yesterdayRevenue._sum.total || 0
    const revTrend =
      yestRev === 0
        ? null
        : (((todayRev - yestRev) / yestRev) * 100).toFixed(1)

    // Branch breakdown
    // Branch breakdown - Optimized to avoid connection bomb
    const branchAnalytics = []
    for (const c of clinics) {
      const [pats, revAgg, expAgg, assets, stocks] = await Promise.all([
        prisma.registration.groupBy({ by: ['patientId'], where: { clinicId: c.id } }),
        prisma.journalDetail.aggregate({
          where: {
            coa: { category: 'REVENUE' },
            journalEntry: { clinicId: c.id }
          },
          _sum: { debit: true, credit: true }
        }),
        prisma.journalDetail.aggregate({
          where: {
            coa: { category: 'EXPENSE' },
            journalEntry: { clinicId: c.id }
          },
          _sum: { debit: true, credit: true }
        }),
        prisma.asset.aggregate({
          _sum: { purchasePrice: true },
          where: { status: 'active', clinicId: c.id },
        }),
        prisma.inventoryStock.aggregate({
          _sum: { onHandQty: true },
          where: { branchId: c.id },
        }),
      ])
      const r = (revAgg._sum.credit || 0) - (revAgg._sum.debit || 0)
      const ex = (expAgg._sum.debit || 0) - (expAgg._sum.credit || 0)
      branchAnalytics.push({
        id: c.id,
        name: c.name,
        code: c.code,
        patients: pats.length,
        profit: r - ex,
        assets: assets._sum.purchasePrice || 0,
        stocks: stocks._sum.onHandQty || 0,
      })
    }

    // ─── 5. FINANCIAL TREND ─────────────────────────────────────────────────
    let financialTrend: any[] = []
    if (range === 'month') {
      for (let i = 29; i >= 0; i--) {
        const d = new Date(todayStart)
        d.setDate(d.getDate() - i)
        const dStr = d.toLocaleDateString('en-CA', { timeZone: 'Asia/Jakarta' })
        const s = new Date(`${dStr}T00:00:00+07:00`)
        const e = new Date(`${dStr}T23:59:59+07:00`)
        
        const [revAgg, expAgg] = await Promise.all([
          prisma.journalDetail.aggregate({
            _sum: { debit: true, credit: true },
            where: {
              coa: { category: 'REVENUE' },
              journalEntry: { date: { gte: s, lte: e }, ...clinicFilter }
            },
          }),
          prisma.journalDetail.aggregate({
            _sum: { debit: true, credit: true },
            where: {
              coa: { category: 'EXPENSE' },
              journalEntry: { date: { gte: s, lte: e }, ...clinicFilter }
            },
          }),
        ])
        const r = (revAgg._sum.credit || 0) - (revAgg._sum.debit || 0)
        const ex = (expAgg._sum.debit || 0) - (expAgg._sum.credit || 0)
        financialTrend.push({ label, revenue: r, expense: ex, profit: r - ex })
      }
    } else if (range === 'year') {
      const currentYear = today.getFullYear()
      for (let m = 0; m <= today.getMonth(); m++) {
        const monthStart = new Date(currentYear, m, 1)
        const monthEnd = new Date(currentYear, m + 1, 0)
        
        // Convert to Jakarta ISO string for query
        const s = new Date(monthStart.toLocaleString('en-US', { timeZone: 'Asia/Jakarta' }))
        const e = new Date(monthEnd.toLocaleString('en-US', { timeZone: 'Asia/Jakarta' }))
        e.setHours(23, 59, 59, 999)

        const [revAgg, expAgg] = await Promise.all([
          prisma.journalDetail.aggregate({
            _sum: { debit: true, credit: true },
            where: {
              coa: { category: 'REVENUE' },
              journalEntry: { date: { gte: s, lte: e }, ...clinicFilter }
            },
          }),
          prisma.journalDetail.aggregate({
            _sum: { debit: true, credit: true },
            where: {
              coa: { category: 'EXPENSE' },
              journalEntry: { date: { gte: s, lte: e }, ...clinicFilter }
            },
          }),
        ])
        const r = (revAgg._sum.credit || 0) - (revAgg._sum.debit || 0)
        const ex = (expAgg._sum.debit || 0) - (expAgg._sum.credit || 0)
        const label = new Intl.DateTimeFormat('id-ID', { month: 'short', timeZone: 'Asia/Jakarta' }).format(monthStart)
        financialTrend.push({ label, revenue: r, expense: ex, profit: r - ex })
      }
    } else {
      // week (default)
      for (let i = 6; i >= 0; i--) {
        const d = new Date(todayStart)
        d.setDate(d.getDate() - i)
        const dStr = d.toLocaleDateString('en-CA', { timeZone: 'Asia/Jakarta' })
        const s = new Date(`${dStr}T00:00:00+07:00`)
        const e = new Date(`${dStr}T23:59:59+07:00`)

        const [revAgg, expAgg] = await Promise.all([
          prisma.journalDetail.aggregate({
            _sum: { debit: true, credit: true },
            where: {
              coa: { category: 'REVENUE' },
              journalEntry: { date: { gte: s, lte: e }, ...clinicFilter }
            },
          }),
          prisma.journalDetail.aggregate({
            _sum: { debit: true, credit: true },
            where: {
              coa: { category: 'EXPENSE' },
              journalEntry: { date: { gte: s, lte: e }, ...clinicFilter }
            },
          }),
        ])
        const r = (revAgg._sum.credit || 0) - (revAgg._sum.debit || 0)
        const ex = (expAgg._sum.debit || 0) - (expAgg._sum.credit || 0)
        const label = new Intl.DateTimeFormat('id-ID', { weekday: 'short', timeZone: 'Asia/Jakarta' }).format(d)
        financialTrend.push({ label, revenue: r, expense: ex, profit: r - ex })
      }
    }

    // ─── 6. DOCTOR DUTY STATUS ──────────────────────────────────────────────
    const allDoctors = await prisma.doctor.findMany({
      where: { isActive: true },
      select: {
        id: true,
        name: true,
        specialization: true,
        profilePicture: true,
        schedules: {
          where: {
            dayOfWeek: dayName,
            isActive: true,
            ...(clinicId ? { clinicId } : {}),
          },
          select: {
            startTime: true,
            endTime: true,
            clinic: { select: { name: true, code: true } },
          },
        },
      },
    })

    const dutyStatus = allDoctors.map((doc) => ({
      id: doc.id,
      name: doc.name,
      specialization: doc.specialization,
      photo: doc.profilePicture,
      isOnDuty: doc.schedules.length > 0,
      schedule: doc.schedules[0] || null,
      clinic: doc.schedules[0]?.clinic || null,
    }))

    // ─── 7. RECENT REGISTRATIONS (from Registration table, not Appointment) ─
    const recentRegistrations = await prisma.registration.findMany({
      where: isAdminView ? {} : (clinicId ? { clinicId } : {}),
      take: 6,
      orderBy: [{ createdAt: 'desc' }, { registrationDate: 'desc' }],
      include: {
        patient: { select: { name: true, medicalRecordNo: true, gender: true } },
        doctor: { select: { name: true, specialization: true } },
        department: { select: { name: true } },
        clinic: { select: { name: true, code: true } },
      },
    })

    // ─── 8. ASSET ALERTS ────────────────────────────────────────────────────
    const maintenanceOverdue = await prisma.asset.findMany({
      where: {
        status: 'active',
        lastMaintenanceDate: { lte: subDays(today, 180) }, // 6 months overdue
        ...clinicFilter,
      },
      select: {
        assetCode: true,
        assetName: true,
        lastMaintenanceDate: true,
        clinic: { select: { code: true } },
      },
      take: 5,
    })

    const insuranceExpiring = await prisma.assetInsurance.findMany({
      where: {
        endDate: { lte: sixtyDaysFromNow, gte: today },
      },
      include: {
        asset: {
          select: {
            assetCode: true,
            assetName: true,
            clinic: { select: { code: true } },
          },
        },
      },
      take: 5,
    })

    // ─── RESPONSE ────────────────────────────────────────────────────────────
    res.json({
      // Today's operational snapshot
      today: {
        registrations: todayRegistrations,
        registrationTrend: regTrend ? `${Number(regTrend) >= 0 ? '+' : ''}${regTrend}%` : null,
        revenue: todayRev,
        revenueTrend: revTrend ? `${Number(revTrend) >= 0 ? '+' : ''}${revTrend}%` : null,
        activeQueue,
        pendingPharmacy,
        unpaidInvoicesAmount: unpaidInvoices._sum.total || 0,
        unpaidInvoicesCount: unpaidInvoices._count,
        pendingProcurements,
        supplierDebt: totalDebt,
      },

      // Summary cards (all-time)
      summary: [
        {
          label: 'Total Pasien',
          value: totalPatients.toLocaleString(),
          trend: regTrend ? `${Number(regTrend) >= 0 ? '+' : ''}${regTrend}%` : null,
          trendLabel: 'vs kemarin',
          color: 'blue',
          breakdown: branchAnalytics.map((b) => ({
            name: b.name,
            code: b.code,
            quantity: b.patients,
          })),
        },
        {
          label: 'Net Profit',
          value: globalNetProfit.toLocaleString(),
          trend: globalNetProfit >= 0 ? 'Laba' : 'Rugi',
          trendLabel: 'kumulatif',
          color: 'emerald',
          breakdown: branchAnalytics.map((b) => ({
            name: b.name,
            code: b.code,
            quantity: b.profit,
            isCurrency: true,
          })),
        },
        {
          label: 'Nilai Aset',
          value: (totalAssetValue._sum.purchasePrice || 0).toLocaleString(),
          trend: null,
          trendLabel: 'aktif',
          color: 'indigo',
          breakdown: branchAnalytics.map((b) => ({
            name: b.name,
            code: b.code,
            quantity: b.assets,
            isCurrency: true,
          })),
        },
        {
          label: 'Total Stok',
          value: Math.round(totalStock._sum.onHandQty || 0).toLocaleString(),
          trend: criticalStockList.length > 0 ? `${criticalStockList.length} kritis` : null,
          trendLabel: 'item',
          color: 'orange',
          breakdown: branchAnalytics.map((b) => ({
            name: b.name,
            code: b.code,
            quantity: Math.round(b.stocks),
          })),
        },
      ],

      // Financial chart
      financialTrend,

      // Doctor monitoring
      dutyStatus,

      // Recent registrations (corrected source)
      recentRegistrations: recentRegistrations.map((r) => ({
        id: r.id,
        registrationNo: r.registrationNo,
        registrationDate: r.registrationDate,
        visitType: r.visitType,
        status: r.status,
        patient: r.patient,
        doctor: r.doctor,
        department: r.department,
        clinic: r.clinic,
      })),

      // Alerts
      alerts: {
        criticalStocks: criticalStockList,
        expiringBatches: expiringList,
        maintenanceOverdue: maintenanceOverdue.map((a) => ({
          assetCode: a.assetCode,
          assetName: a.assetName,
          lastMaintenanceDate: a.lastMaintenanceDate,
          branch: a.clinic?.code || '-',
          daysOverdue: a.lastMaintenanceDate
            ? Math.floor(
                (today.getTime() - a.lastMaintenanceDate.getTime()) / (1000 * 60 * 60 * 24)
              )
            : null,
        })),
        insuranceExpiring: insuranceExpiring.map((i) => ({
          assetCode: i.asset.assetCode,
          assetName: i.asset.assetName,
          endDate: i.endDate,
          branch: i.asset.clinic?.code || '-',
          daysLeft: Math.ceil(
            (i.endDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24)
          ),
        })),
      },
    })
  } catch (e) {
    console.error('[Dashboard] Error:', e)
    res.status(500).json({ message: (e as Error).message })
  }
}
