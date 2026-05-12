import {
  FiHome, FiGlobe, FiUsers, FiCalendar, FiUserPlus,
  FiSettings, FiLogOut, FiChevronDown, FiDatabase,
  FiBriefcase, FiUserCheck, FiClock, FiActivity,
  FiPackage, FiShoppingBag, FiList, FiMenu, FiX, FiBox,
  FiChevronLeft, FiFolder, FiCpu, FiPlus, FiDollarSign, FiFileText, FiTrendingUp, FiLayers, FiBookOpen, FiLock, FiCreditCard,
  FiTool, FiRepeat, FiShield, FiBarChart2, FiAlertCircle, FiArchive
} from 'react-icons/fi'
import { HiOutlineBeaker } from 'react-icons/hi'

export const MAIN_MENU = [
  { icon: FiHome, label: 'Dashboard', href: '/admin' },
]

export const LAYANAN_UTAMA_GROUPS = [
  {
    label: 'Pendaftaran & Antrian',
    icon: FiUserPlus,
    moduleId: 'REGISTRATION_QUEUE',
    items: [
      { icon: FiCalendar, label: 'Janji Temu (Appointment)', href: '/admin/transactions/appointment' },
      { icon: FiPlus, label: 'Registrasi Baru', href: '/admin/transactions/registration' },
      { icon: FiActivity, label: 'Antrian Pasien', href: '/admin/transactions/queue' },
    ]
  },
  {
    label: 'Pelayanan Medis',
    icon: FiActivity,
    moduleId: 'MEDICAL_SERVICES',
    items: [
      { icon: FiActivity, label: 'Nurse Station (Triage)', href: '/admin/transactions/nurse' },
      { icon: FiUserCheck, label: 'Doctor Station', href: '/admin/transactions/doctor' },
      { icon: FiUsers, label: 'Database Pasien', href: '/admin/master/patients', roles: ['SUPER_ADMIN', 'ADMIN', 'DOCTOR', 'NURSE'] },
    ]
  },
  {
    label: 'Farmasi',
    icon: FiPackage,
    moduleId: 'PHARMACY',
    items: [
      { icon: FiBox,      label: 'Antrian Farmasi',       href: '/admin/transactions/pharmacy' },
      { icon: FiLayers,   label: 'Master Formula Racikan', href: '/admin/farmasi/formula-racikan' },
      { icon: FiMenu,     label: 'Data Obat & Alkes',      href: '/admin/master/medicines' },
    ]
  },
  {
    label: 'Laboratorium',
    icon: HiOutlineBeaker,
    moduleId: 'LABORATORY',
    items: [
      { icon: HiOutlineBeaker, label: 'Antrian Laboratorium', href: '/admin/lab/input' },
      { icon: FiBookOpen,      label: 'Master Parameter Lab', href: '/admin/master/lab', roles: ['SUPER_ADMIN', 'ADMIN'] },
    ]
  }
]

export const FINANCE_GROUPS = [
  {
    label: 'Billing & Pembayaran',
    icon: FiDollarSign,
    moduleId: 'BILLING_PAYMENT',
    items: [
      { icon: FiFileText, label: 'Invoice & Bayar', href: '/admin/finance' },
      { icon: FiDollarSign, label: 'Pengeluaran Operasional', href: '/admin/finance/expenses' },
      { icon: FiClock, label: 'Tutup Buku (Closing)', href: '/admin/finance/closing', roles: ['SUPER_ADMIN', 'ADMIN', 'ACCOUNTING'] },
    ]
  },
  {
    label: 'Laporan & Akuntansi',
    icon: FiTrendingUp,
    moduleId: 'REPORTS_ACCOUNTING',
    items: [
      { icon: FiBookOpen, label: 'Buku Besar (Ledger)', href: '/admin/finance/reports/general-ledger' },
      { icon: FiActivity, label: 'Neraca Saldo (Trial Balance)', href: '/admin/finance/reports/trial-balance' },
      { icon: FiTrendingUp, label: 'Laba Rugi (P&L)', href: '/admin/finance/reports/profit-loss' },
      { icon: FiDatabase, label: 'Neraca (Balance Sheet)', href: '/admin/finance/reports/balance-sheet' },
      { icon: FiDollarSign, label: 'Laporan Jasa Medik', href: '/admin/finance/reports/doctor-fees' },
    ]
  },
  {
    label: 'Konfigurasi Akuntansi',
    icon: FiSettings,
    moduleId: 'ACCOUNTING_CONFIG',
    items: [
      { icon: FiTrendingUp, label: 'Saldo Awal (Opening Balance)', href: '/admin/finance/opening-balance' },
      { icon: FiLayers, label: 'Chart of Accounts (COA)', href: '/admin/master/coa' },
      { icon: FiCpu, label: 'System Account Mapping', href: '/admin/master/system-accounts' },
      { icon: FiCreditCard, label: 'Rekening Bank', href: '/admin/master/banks' },
    ]
  }
]

export const LOGISTIK_GROUPS = [
  {
    label: 'Stok & Inventaris',
    icon: FiPackage,
    moduleId: 'STOCK_INVENTORY',
    items: [
      { icon: FiHome, label: 'Dashboard Stok', href: '/admin/inventory' },
      { icon: FiList, label: 'Kartu Stok', href: '/admin/inventory/mutations' },
      { icon: FiPlus, label: 'Update Stok Opname', href: '/admin/inventory/stock-opname', roles: ['SUPER_ADMIN', 'ADMIN'] },
    ]
  },
  {
    label: 'Pengadaan & Logistik',
    icon: FiShoppingBag,
    moduleId: 'PROCUREMENT_LOGISTICS',
    items: [
      { icon: FiShoppingBag, label: 'Procurement (PR/PO)', href: '/admin/inventory/procurement' },
      { icon: FiCreditCard, label: 'Bayar Hutang Supplier', href: '/admin/inventory/procurement/payables' },
      { icon: FiGlobe, label: 'Transfer Antar Cabang', href: '/admin/inventory/transfers' },
      { icon: FiPackage, label: 'Katalog Produk', href: '/admin/master/products', roles: ['SUPER_ADMIN', 'ADMIN'] },
      { icon: FiList, label: 'Kategori Produk', href: '/admin/master/product-categories', roles: ['SUPER_ADMIN', 'ADMIN'] },
    ]
  }
]

export const ASSET_GROUPS = [
  {
    label: 'Data & Registrasi Aset',
    icon: FiArchive,
    moduleId: 'ASSET_DATA',
    items: [
      { icon: FiArchive, label: 'Daftar Aset', href: '/admin/master/assets' },
      { icon: FiBarChart2, label: 'Register Aset (Nilai Buku)', href: '/admin/assets/register' },
    ]
  },
  {
    label: 'Operasional Aset',
    icon: FiTool,
    moduleId: 'ASSET_OPERATIONS',
    items: [
      { icon: FiTool, label: 'Maintenance & Perawatan', href: '/admin/assets/maintenance' },
      { icon: FiRepeat, label: 'Transfer Aset', href: '/admin/assets/transfers' },
      { icon: FiShield, label: 'Asuransi Aset', href: '/admin/assets/insurance' },
    ]
  },
  {
    label: 'Keuangan Aset',
    icon: FiTrendingUp,
    moduleId: 'ASSET_FINANCE',
    items: [
      { icon: FiTrendingUp, label: 'Penyusutan (Depresiasi)', href: '/admin/assets/depreciation' },
      { icon: FiAlertCircle, label: 'Penghapusan Aset', href: '/admin/assets/disposal' },
    ]
  },
]

export const MASTER_GROUPS = [
  {
    label: 'Master Tenaga Medis',
    icon: FiUserCheck,
    moduleId: 'MEDICAL_MASTER',
    items: [
      { icon: FiUserCheck, label: 'Database Dokter', href: '/admin/master/doctors' },
      { icon: FiClock, label: 'Jadwal Praktek', href: '/admin/master/schedules' },
      { icon: FiBriefcase, label: 'Departemen & Poli', href: '/admin/master/departments' },
      { icon: FiActivity, label: 'Daftar Layanan/Tindakan', href: '/admin/master/services' },
    ]
  },
  {
    label: 'Pengaturan Sistem',
    icon: FiDatabase,
    moduleId: 'SYSTEM_SETTINGS',
    items: [
      { icon: FiUsers, label: 'Manajemen Users', href: '/admin/master/users' },
      { icon: FiGlobe, label: 'Manajemen Cabang', href: '/admin/master/clinics', role: 'SUPER_ADMIN' },
      { icon: FiGlobe, label: 'Manajemen Website', href: '/admin/website' },
      { icon: FiSettings, label: 'Pengaturan Umum', href: '/admin/settings' },
      { icon: FiTrendingUp, label: 'Go Live Setup (Reset)', href: '/admin/settings/go-live', role: 'SUPER_ADMIN' },
      { icon: FiShield, label: 'Hak Akses Modul', href: '/admin/settings/roles', role: 'SUPER_ADMIN' },
    ]
  }
]

export const ALL_MENU_GROUPS = [
  { section: 'Layanan Utama', groups: LAYANAN_UTAMA_GROUPS },
  { section: 'Keuangan & Akuntansi', groups: FINANCE_GROUPS },
  { section: 'Logistik & Inventaris', groups: LOGISTIK_GROUPS },
  { section: 'Manajemen Aset', groups: ASSET_GROUPS },
  { section: 'Pengaturan Master', groups: MASTER_GROUPS },
]

export const extractUniqueModules = () => {
  const modulesMap = new Map<string, { id: string; label: string; section: string }>()
  
  ALL_MENU_GROUPS.forEach(section => {
    section.groups.forEach(group => {
      if (group.moduleId && !modulesMap.has(group.moduleId)) {
        modulesMap.set(group.moduleId, { 
          id: group.moduleId, 
          label: group.label,
          section: section.section
        })
      }
    })
  })
  
  return Array.from(modulesMap.values())
}
