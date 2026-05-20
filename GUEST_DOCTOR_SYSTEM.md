# 🩺 Guest Doctor (Dokter Tamu) System - Implementation Guide

## 📋 Overview

Sistem ini memungkinkan admin untuk mengelola **dokter tamu/luar** (temporary/external doctors) yang menggantikan dokter tetap ketika sedang cuti atau berhalangan. Setiap dokter tamu dapat di-assign per hari dengan akun login terpisah dan otomatis ter-track di medical records.

## ✨ Features

### 1. **Master Dokter Tamu** (Permanent Profile Storage)
- ✅ Simpan profil dokter tamu (Nama, SIP, Spesialisasi, Telepon, Email opsional)
- ✅ CRUD dokter tamu
- ✅ Track riwayat penugasan per dokter
- ✅ Disable/activate dokter tamu

### 2. **Daily Assignment** (Harian)
- ✅ Assign dokter tamu untuk tanggal tertentu
- ✅ Auto-generate akun login dengan:
  - Username = SIP dokter
  - Password = Random secure (digenerate otomatis)
  - Email = Tidak perlu (opsional)
- ✅ One doctor per day per clinic (unique constraint)
- ✅ Auto-expire akun setelah 24 jam

### 3. **Medical Record Integration**
- ✅ Auto-tag: "Dokter Tamu: Dr. [Nama]" di medical record
- ✅ Track dokter mana yang handle patient (guestDoctorId)
- ✅ Audit trail lengkap per patient

### 4. **Statistics & Reporting**
- ✅ Jumlah penugasan per dokter tamu
- ✅ Jumlah pasien yang ditangani
- ✅ Laporan history penugasan

---

## 🗄️ Database Schema

### 3 Model Baru:

#### 1. **GuestDoctorProfile**
```prisma
model GuestDoctorProfile {
  id              String
  name            String          // "Dr. Supardi"
  licenseNumber   String @unique  // SIP: "123456789000"
  specialization  String          // "Umum", "Gigi", dll
  phone           String
  email           String?         // Optional
  address         String?
  isActive        Boolean
  createdAt       DateTime
  updatedAt       DateTime
  clinicId        String
  
  assignments     GuestDoctorAssignment[]
  medicalRecords  MedicalRecord[]
}
```

#### 2. **GuestDoctorAssignment**
```prisma
model GuestDoctorAssignment {
  id               String
  date             DateTime @db.Date     // Tanggal penugasan
  guestDoctorId    String
  userId           String?               // Akun guest yang di-generate
  createdByAdminId String                // Admin yang buat assignment
  status           String                // SCHEDULED | ACTIVE | COMPLETED | CANCELLED
  notes            String?               // "Pengganti Dr. X yang cuti"
  clinicId         String
  
  @@unique([date, clinicId])  // Satu dokter per hari
}
```

#### 3. **User Updates**
```prisma
model User {
  // Existing fields...
  isGuestAccount   Boolean         @default(false)
  guestExpiryDate  DateTime?       // Kapan akun guest hangus
  guestAssignments GuestDoctorAssignment[]
}
```

#### 4. **MedicalRecord Updates**
```prisma
model MedicalRecord {
  // Existing fields...
  guestDoctorId     String?       // Dokter tamu yang handle
  guestAssignmentId String?       // Assignment reference
  guestDoctor       GuestDoctorProfile?
  guestAssignment   GuestDoctorAssignment?
}
```

---

## 🔧 API Endpoints

### Base URL: `/api/guest-doctors`

#### **Guest Doctor Profiles (Master Data)**

```
GET    /profiles                          # List all doctors
POST   /profiles                          # Create new doctor
PUT    /profiles/:id                      # Update doctor
DELETE /profiles/:id                      # Delete doctor
```

**Create Request:**
```json
{
  "name": "Dr. Supardi",
  "licenseNumber": "123456789000",
  "specialization": "Umum",
  "phone": "08123456789",
  "email": "supardi@email.com",     // Optional
  "address": "Jl. Contoh No. 123"   // Optional
}
```

**Response:**
```json
{
  "message": "Dokter tamu berhasil ditambahkan",
  "data": {
    "id": "uuid",
    "name": "Dr. Supardi",
    "licenseNumber": "123456789000",
    "specialization": "Umum",
    "phone": "08123456789",
    "isActive": true,
    "createdAt": "2026-05-20T10:00:00Z"
  }
}
```

---

#### **Guest Doctor Assignments (Daily)**

```
GET    /assignments                        # List assignments (by date)
POST   /assignments                        # Create assignment
PUT    /assignments/:id/activate           # Activate assignment
PUT    /assignments/:id/complete           # Complete assignment
PUT    /assignments/:id/cancel             # Cancel assignment
GET    /assignments/today/active           # Get today's active doctor
```

**Create Assignment Request:**
```json
{
  "guestDoctorId": "uuid",
  "date": "2026-05-20",
  "notes": "Pengganti Dr. Agus yang cuti"
}
```

**Response:**
```json
{
  "message": "Dokter tamu berhasil ditugaskan",
  "data": {
    "id": "assignment-uuid",
    "date": "2026-05-20",
    "guestDoctorId": "uuid",
    "guestDoctor": {
      "name": "Dr. Supardi",
      "specialization": "Umum",
      "licenseNumber": "123456789000"
    },
    "userId": "user-uuid",
    "user": {
      "id": "user-uuid",
      "username": "123456789000"
    },
    "status": "SCHEDULED",
    "credentials": {
      "username": "123456789000",
      "password": "TempPass@2026..."  // Hanya ditampilkan sekali!
    }
  }
}
```

---

#### **Statistics**

```
GET /statistics                    # Get doctor statistics
```

**Response:**
```json
{
  "data": {
    "totalAssignments": 45,
    "completedAssignments": 42,
    "guestDoctors": [
      {
        "id": "uuid",
        "name": "Dr. Supardi",
        "specialization": "Umum",
        "licenseNumber": "123456789000",
        "totalAssignments": 15,
        "patientsHandled": 128
      }
    ]
  }
}
```

---

## 🎨 Admin UI Pages

### 1. **Kelola Dokter Tamu**
**Route:** `/admin/master/guest-doctors`

Fitur:
- 📋 List semua dokter tamu dengan filter (nama, SIP, spesialisasi)
- ➕ Tambah dokter tamu baru
- ✏️ Edit profil dokter tamu
- 🗑️ Hapus dokter tamu
- 📊 Lihat riwayat penugasan per dokter
- Status aktif/nonaktif

### 2. **Assignment - Hari Ini**
**Route:** `/admin/master/guest-doctors-assignment`

Fitur:
- 📅 Navigasi tanggal (prev/next day)
- ➕ Tentukan dokter tamu untuk hari ini
- 👁️ Lihat dokter aktif dengan akun login
- 📋 Copy credentials (Username + Password)
- ✅ Mark assignment as completed
- ❌ Cancel assignment
- 📜 Riwayat assignment

---

## 🔐 Security Features

### 1. **Auto-Generated Credentials**
- Username = SIP (unique, permanent)
- Password = Random 12 chars dengan special chars
- Password hanya ditampilkan sekali saat create

### 2. **Auto-Expiry**
- Akun guest hangus setelah 24 jam (configurable)
- Jika assignment completed, akun langsung dinonaktifkan
- Jika assignment cancelled, akun langsung dihapus

### 3. **One-Doctor-Per-Day Rule**
- Unique constraint: (date, clinicId)
- Tidak bisa assign 2 dokter tamu di hari yang sama

### 4. **Role-Based Access**
- Guest doctor hanya bisa:
  - View pasien & queue
  - Buat/edit medical record
  - Tidak bisa manage akun
- Admin penuh kontrol

---

## 🚀 Workflow

### Scenario: Dokter Tetap Cuti, Pakai Dokter Luar

#### **Day 1: Admin Setup**
```
1. Admin → Menu "Kelola Dokter Tamu"
2. Input:
   - Nama: "Dr. Budi"
   - SIP: "987654321000"
   - Spesialisasi: "Gigi"
   - Telepon: "08198765432"
   → SAVED ke database (permanent)

3. Admin → Menu "Assignment Hari Ini"
4. Pilih: "Dr. Budi" untuk tanggal 2026-05-21
5. System auto-generate:
   - Username: 987654321000
   - Password: TempPass@2026!a (random)
   - Akun aktif hanya 24 jam
6. Admin COPY credentials → share dengan Dr. Budi
```

#### **Day 2: Dr. Budi Login & Bekerja**
```
1. Dr. Budi buka login
2. Username: 987654321000
3. Password: TempPass@2026!a (dari admin)
4. Login successful ✅
5. Bisa lihat queue & handle patient
6. Medical record auto-tag: "Dokter Tamu: Dr. Budi"
7. Semua medical record linked ke guestDoctorId
```

#### **Day 3: Admin Complete Assignment**
```
1. Admin → Menu "Assignment Hari Ini"
2. Lihat assignment Dr. Budi
3. Klik "Selesaikan Penugasan"
4. System:
   - Set status = COMPLETED
   - Nonaktifkan akun guest
   - Dr. Budi tidak bisa login lagi
5. Jika Dr. Budi perlu datang lagi, admin buat assignment baru
```

---

## 📊 Tracking & Audit

### Medical Record Tracking
```
MedicalRecord:
- doctorId: NULL (tidak ada dokter tetap)
- guestDoctorId: "uuid_dr_budi"
- guestAssignmentId: "uuid_assignment"
- recordNo: "REC-2026-05-21-001"
- patientId: "pat-123"
- diagnosis: "Karies gigi"
- createdAt: "2026-05-21T10:30:00Z"

→ Audit trail jelas: Dr. Budi handle patient ini tanggal 21 Mei
```

### Statistics
```
Dr. Budi History:
- Total assignments: 5x
- Total patients handled: 42 orang
- Dates: [2026-05-15, 2026-05-18, 2026-05-21, ...]
- Specialization: Gigi
- Report bisa di-export
```

---

## 💾 Implementation Checklist

- ✅ Prisma Schema updated (GuestDoctorProfile, GuestDoctorAssignment, User, MedicalRecord)
- ✅ Database synced (no data loss)
- ✅ Backend API endpoints created (8 endpoints)
- ✅ Guest doctor controller (with credential generation)
- ✅ Guest doctor routes registered
- ✅ Admin UI: Kelola Dokter Tamu
- ✅ Admin UI: Assignment Hari Ini
- ✅ Frontend API calls
- ✅ Error handling & validation
- ✅ Toast notifications
- ✅ Responsive design

---

## 🎯 Next Steps (Optional)

1. **Medical Record UI Update**
   - Show "Dokter Tamu: Dr. [Nama]" in consultation page
   - Auto-select guest doctor when logged in as guest

2. **Queue System Integration**
   - Show guest doctor in queue display
   - Assign queue to guest doctor today

3. **Reports**
   - Monthly guest doctor report
   - Patient count per guest doctor
   - Export to Excel

4. **SMS/Email Notifications**
   - Send assignment confirmation
   - Send login credentials
   - Send completion notification

5. **Mobile App Support**
   - Guest doctor can access via mobile
   - Offline capability

---

## 🆘 Troubleshooting

### Q: Bagaimana jika dokter luar perlu datang lagi bulan depan?
**A:** Cukup buat assignment baru. Akun guest lama auto-expire, system akan generate akun baru dengan password baru.

### Q: Bisa gak disimpan password-nya?
**A:** Tidak recommended. Password hanya ditampilkan sekali untuk security. Jika lupa, admin bisa cancel assignment & buat baru.

### Q: Multiple guests per hari bisa?
**A:** Tidak, ada unique constraint (date, clinicId). Hanya 1 guest per hari per clinic. Jika perlu 2 dokter tamu di hari yang sama, contact system admin.

### Q: Data medical record lama (sebelum implementasi) bagaimana?
**A:** Tetap aman & tidak berubah. Hanya medical record baru yang akan punya guestDoctorId.

---

## 📞 Support

Hubungi admin sistem untuk:
- Setup additional guest doctors
- Troubleshoot access issues
- Export reports
- System maintenance

---

**Last Updated:** 20 May 2026  
**Status:** ✅ Production Ready
