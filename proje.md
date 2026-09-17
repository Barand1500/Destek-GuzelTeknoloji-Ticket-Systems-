# Helpdesk Ticketing System

## 1. Projenin Amacı

Bu proje, şirketlerin müşterilerinden gelen destek taleplerini merkezi bir sistem üzerinden yönetmesini sağlayan web tabanlı bir **Helpdesk / Ticketing System** uygulamasıdır.

Sistem BeDesk, Zendesk ve Freshdesk benzeri bir çalışma mantığına sahip olacaktır.

Temel amaç:

* Müşterilerin destek talebi (ticket) oluşturabilmesi
* Destek personellerinin ticketları yönetebilmesi
* Ticketların departmanlara ayrılabilmesi
* Ticketların personele atanabilmesi
* Müşteri ve destek personelinin ticket üzerinden mesajlaşabilmesi
* Ticket durumlarının takip edilebilmesi
* Dosya yüklenebilmesi
* Yetkilendirme sistemi bulunması
* Yönetici panelinden sistemin yönetilebilmesi
* Destek performansının raporlanabilmesi

İlk hedef bütün gelişmiş özellikleri yapmak değildir.

Öncelikle sağlam ve kullanılabilir bir **V1 Helpdesk sistemi** geliştirilecektir.

---

# 2. Teknoloji Stack

## Frontend

* React
* TypeScript
* Vite
* React Router
* Axios
* TanStack Query
* Tailwind CSS

## Backend

* Node.js
* TypeScript
* Express.js
* Prisma ORM
* JWT Authentication
* bcrypt
* Zod
* Socket.IO

## Database

PostgreSQL

## Cache / Queue

İlk sürümde zorunlu değildir.

İlerleyen sürümlerde:

* Redis
* BullMQ

kullanılabilir.

## Dosya Depolama

Development:

Local Storage

Production:

* S3
* MinIO
* Cloudflare R2

gibi object storage sistemlerinden biri kullanılabilir.

---

# 3. Genel Mimari

Uygulama iki ana projeden oluşacaktır.

```text
helpdesk/
│
├── frontend/
│
└── backend/
```

Frontend React ile geliştirilecektir.

Backend REST API olarak Node.js üzerinde çalışacaktır.

Genel iletişim:

```text
React Frontend
      │
      │ HTTP / REST
      ▼
Node.js Backend
      │
      ├── PostgreSQL
      │
      ├── File Storage
      │
      └── Socket.IO
```

Frontend doğrudan veritabanına erişmemelidir.

Bütün işlemler backend API üzerinden yapılmalıdır.

---

# 4. Kullanıcı Rolleri

İlk sürümde dört temel rol bulunacaktır.

## ADMIN

Sistemin tamamını yönetebilir.

Yetkileri:

* Kullanıcı oluşturma
* Kullanıcı düzenleme
* Agent oluşturma
* Departman oluşturma
* Ticket görüntüleme
* Ticket atama
* Ticket durumlarını değiştirme
* Ticket önceliklerini değiştirme
* Rapor görüntüleme
* Sistem ayarlarını değiştirme
* Activity Log görüntüleme

---

## SUPERVISOR

Destek ekibini yönetir.

Yetkileri:

* Departmanındaki ticketları görüntüleme
* Agentlara ticket atama
* Ticket durumlarını değiştirme
* Agent performansını görüntüleme
* Ticket transfer etme

---

## AGENT

Destek personelidir.

Yetkileri:

* Kendisine atanan ticketları görüntüleme
* Ticket cevaplama
* Ticket durumunu değiştirme
* Internal Note ekleme
* Dosya ekleme
* Ticket transfer talebi oluşturma

---

## CUSTOMER

Müşteridir.

Yetkileri:

* Ticket oluşturma
* Kendi ticketlarını görüntüleme
* Ticket'a cevap verme
* Dosya yükleme
* Ticket durumunu görüntüleme

Customer başka müşterilerin ticketlarını kesinlikle görememelidir.

---

# 5. Authentication

Authentication sistemi JWT tabanlı olacaktır.

Gerekli işlemler:

```text
Register
Login
Logout
Refresh Token
Get Current User
```

Şifreler veritabanına kesinlikle açık şekilde kaydedilmemelidir.

bcrypt kullanılarak hashlenmelidir.

Örnek:

```text
password
↓
bcrypt
↓
passwordHash
```

Backend üzerinde authentication middleware bulunmalıdır.

Örnek:

```text
authenticate()
authorize("ADMIN")
authorize("AGENT")
```

---

# 6. Ticket Sistemi

Ticket sistemin ana entity'sidir.

Her ticket benzersiz bir ticket numarasına sahip olacaktır.

Örnek:

```text
#TK-10001
#TK-10002
#TK-10003
```

Ticket içerisinde:

* Ticket numarası
* Müşteri
* Konu
* Açıklama
* Departman
* Atanan agent
* Durum
* Öncelik
* Etiketler
* Oluşturulma tarihi
* Güncellenme tarihi
* Kapanma tarihi

bulunacaktır.

---

# 7. Ticket Durumları

Başlangıç durumları:

```text
OPEN
PENDING
IN_PROGRESS
RESOLVED
CLOSED
```

Anlamları:

OPEN
Yeni oluşturulan ticket.

PENDING
Müşteriden veya başka bir işlemden cevap bekleniyor.

IN_PROGRESS
Agent ticket üzerinde çalışıyor.

RESOLVED
Sorun çözüldü.

CLOSED
Ticket tamamen kapatıldı.

---

# 8. Ticket Priority

Ticket öncelikleri:

```text
LOW
NORMAL
HIGH
URGENT
```

Priority daha sonra SLA sisteminde kullanılabilir.

Örneğin:

```text
URGENT
15 dakika içerisinde ilk cevap

HIGH
1 saat içerisinde ilk cevap

NORMAL
4 saat içerisinde ilk cevap

LOW
24 saat içerisinde ilk cevap
```

SLA sistemi V1 için zorunlu değildir.

---

# 9. Ticket Conversation Sistemi

Ticket tek bir mesaj değildir.

Bir ticket içerisinde birden fazla mesaj bulunabilir.

İlişki:

```text
Ticket
 │
 ├── Message
 ├── Message
 ├── Message
 └── Message
```

Örnek:

```text
Ticket #TK-10045

Customer:
Ödeme sırasında hata alıyorum.

Agent:
Hangi bankada hata alıyorsunuz?

Customer:
Garanti Bankası.

Agent:
Kontrol ediyoruz.
```

Mesajlar ayrı bir tabloda tutulmalıdır.

Ticket tablosuna message1, message2 gibi alanlar eklenmemelidir.

---

# 10. Internal Notes

Agentlar müşterinin göremeyeceği notlar bırakabilmelidir.

Örneğin:

```text
INTERNAL NOTE

Müşteriyle telefon üzerinden görüşüldü.
Sorun banka tarafında görünüyor.
```

Customer bu mesajı göremez.

Bunun için mesaj üzerinde:

```text
isInternalNote
```

alanı kullanılabilir.

---

# 11. Departman Sistemi

Ticketlar departmanlara ayrılabilir.

Örnek departmanlar:

```text
Teknik Destek
Muhasebe
Satış
Ödeme Sistemleri
Genel Destek
```

Her agent bir veya birden fazla departmanda çalışabilir.

Ticket oluşturulurken müşteri departman seçebilir.

Admin veya Supervisor daha sonra departmanı değiştirebilir.

---

# 12. Agent Assignment

Ticket bir agente atanabilir.

Örnek:

```text
Ticket #TK-10421

Department:
Technical Support

Assigned Agent:
Ahmet Yılmaz
```

Ticket başlangıçta agentsız da olabilir.

```text
assignedAgentId = null
```

Bu durumda ticket:

```text
UNASSIGNED
```

listesinde görüntülenmelidir.

---

# 13. Ticket Tags

Ticketlara birden fazla etiket eklenebilir.

Örnek:

```text
payment
pos
bank
bug
critical
refund
```

Ticket ile Tag arasında many-to-many ilişki kurulmalıdır.

---

# 14. Dosya Sistemi

Customer ve Agent ticket mesajlarına dosya ekleyebilmelidir.

Desteklenecek temel formatlar:

```text
jpg
jpeg
png
webp
pdf
docx
xlsx
txt
zip
```

Dosyalarda:

* Dosya boyutu kontrol edilmeli
* MIME type kontrol edilmeli
* Dosya adı güvenli hale getirilmeli
* Tahmin edilebilir public dosya yollarından kaçınılmalı

Attachment ayrı tabloda tutulmalıdır.

---

# 15. Notification Sistemi

Kullanıcıların bildirimleri olacaktır.

Örnek bildirimler:

```text
Ticketınıza cevap geldi.

Yeni ticket size atandı.

Ticket durumu değiştirildi.

Ticket başka departmana aktarıldı.
```

Notification modeli:

```text
id
userId
type
title
message
isRead
createdAt
```

---

# 16. Realtime

Socket.IO kullanılacaktır.

Amaç:

Agent veya Customer yeni mesaj gönderdiğinde sayfayı yenilemeden mesajın görünmesidir.

Örnek:

```text
Customer
   │
   │ send message
   ▼
Backend
   │
   │ socket event
   ▼
Agent
```

Örnek eventler:

```text
ticket:message:new

ticket:updated

notification:new
```

REST API sistemin ana veri kaynağı olmaya devam etmelidir.

Socket.IO yalnızca realtime güncellemeler için kullanılmalıdır.

---

# 17. Saved Replies

Agentların sık kullandıkları cevaplar saklanabilir.

Örnek:

```text
Başlık:
Ödeme kontrol ediliyor

Mesaj:
Merhaba,

Yaşadığınız problem teknik ekibimize iletilmiştir.
Kontroller tamamlandığında tarafınıza bilgi verilecektir.
```

Agent cevap verirken hazır cevabı seçebilir.

---

# 18. Activity Log

Önemli işlemler loglanmalıdır.

Örnek:

```text
Admin created agent.

Agent assigned ticket.

Supervisor changed priority.

Agent changed status.

Customer created ticket.
```

Activity Log:

```text
id
userId
action
entityType
entityId
metadata
ipAddress
createdAt
```

Audit log kayıtları normal kullanıcılar tarafından değiştirilememelidir.

---

# 19. Database Modelleri

Temel modeller:

```text
User

Role
Permission

Department
DepartmentAgent

Ticket
TicketMessage
TicketAttachment

TicketStatus
TicketPriority

Tag
TicketTag

Notification

SavedReply

ActivityLog
```

---

# 20. Temel Database İlişkileri

```text
User
 │
 ├── Customer Tickets
 │
 ├── Assigned Tickets
 │
 ├── Messages
 │
 └── Notifications


Department
 │
 ├── Agents
 │
 └── Tickets


Ticket
 │
 ├── Customer
 ├── Assigned Agent
 ├── Department
 ├── Messages
 ├── Attachments
 └── Tags
```

---

# 21. Backend Klasör Yapısı

Backend mümkün olduğunca modüler tutulmalıdır.

```text
backend/
│
├── src/
│   │
│   ├── config/
│   │
│   ├── controllers/
│   │
│   ├── services/
│   │
│   ├── repositories/
│   │
│   ├── routes/
│   │
│   ├── middleware/
│   │
│   ├── validators/
│   │
│   ├── utils/
│   │
│   ├── sockets/
│   │
│   ├── types/
│   │
│   └── app.ts
│   │
│   └── server.ts
│
├── prisma/
│   ├── schema.prisma
│   └── seed.ts
│
├── uploads/
│
├── .env
├── package.json
└── tsconfig.json
```

Controller içerisinde business logic biriktirilmemelidir.

Akış:

```text
Route
 ↓
Middleware
 ↓
Validator
 ↓
Controller
 ↓
Service
 ↓
Repository / Prisma
 ↓
PostgreSQL
```

---

# 22. Frontend Klasör Yapısı

```text
frontend/
│
├── src/
│
├── components/
│
├── pages/
│
├── layouts/
│
├── features/
│
├── hooks/
│
├── services/
│
├── store/
│
├── types/
│
├── utils/
│
└── router/
```

Büyük özellikler mümkün olduğunca feature bazlı ayrılmalıdır.

Örneğin:

```text
features/
│
├── auth/
├── tickets/
├── users/
├── departments/
├── notifications/
└── reports/
```

---

# 23. Frontend Ekranları

## Authentication

```text
/login
/register
```

---

## Customer

```text
/customer/dashboard

/customer/tickets

/customer/tickets/new

/customer/tickets/:id

/customer/profile
```

---

## Agent

```text
/agent/dashboard

/agent/inbox

/agent/tickets/:id

/agent/customers

/agent/saved-replies
```

---

## Admin

```text
/admin/dashboard

/admin/tickets

/admin/users

/admin/agents

/admin/departments

/admin/tags

/admin/reports

/admin/activity-logs

/admin/settings
```

---

# 24. Agent Inbox Tasarımı

Agent panelinin en önemli ekranı Inbox olacaktır.

Desktop tasarım üç kolonlu olabilir.

```text
┌──────────────┬────────────────────┬─────────────────────┐
│              │                    │                     │
│ FILTER       │ TICKET LIST        │ CONVERSATION        │
│              │                    │                     │
│ All          │ #TK-1021           │ Customer            │
│ Mine         │ Payment Error      │ Ödeme yapamıyorum   │
│ Unassigned   │                    │                     │
│ Open         │ #TK-1022           │ Agent               │
│ Pending      │ Login Problem      │ Kontrol ediyoruz.   │
│ Resolved     │                    │                     │
│              │                    │ [Message...]        │
│              │                    │                     │
└──────────────┴────────────────────┴─────────────────────┘
```

Ama mobil tasarım responsive olmalıdır.

---

# 25. Dashboard

Admin Dashboard üzerinde:

```text
Total Tickets

Open Tickets

Pending Tickets

Resolved Tickets

Unassigned Tickets

Active Agents

Average Response Time

Tickets Today
```

gösterilebilir.

Grafikler:

```text
Daily Tickets

Ticket Status Distribution

Tickets By Department

Tickets By Priority
```

---

# 26. API Tasarımı

Base URL:

```text
/api/v1
```

## Auth

```text
POST /api/v1/auth/register

POST /api/v1/auth/login

POST /api/v1/auth/refresh

POST /api/v1/auth/logout

GET /api/v1/auth/me
```

---

## Tickets

```text
GET /api/v1/tickets

POST /api/v1/tickets

GET /api/v1/tickets/:id

PATCH /api/v1/tickets/:id

DELETE /api/v1/tickets/:id
```

Ticket silme işlemi tercihen soft-delete mantığıyla yapılmalıdır.

---

## Messages

```text
GET /api/v1/tickets/:id/messages

POST /api/v1/tickets/:id/messages
```

---

## Assignment

```text
PATCH /api/v1/tickets/:id/assign
```

---

## Status

```text
PATCH /api/v1/tickets/:id/status
```

---

## Priority

```text
PATCH /api/v1/tickets/:id/priority
```

---

## Departments

```text
GET /api/v1/departments

POST /api/v1/departments

PATCH /api/v1/departments/:id

DELETE /api/v1/departments/:id
```

---

## Users

```text
GET /api/v1/users

GET /api/v1/users/:id

POST /api/v1/users

PATCH /api/v1/users/:id
```

---

## Notifications

```text
GET /api/v1/notifications

PATCH /api/v1/notifications/:id/read

PATCH /api/v1/notifications/read-all
```

---

# 27. API Response Standardı

API cevapları mümkün olduğunca standart olmalıdır.

Başarılı:

```json
{
  "success": true,
  "data": {}
}
```

Hatalı:

```json
{
  "success": false,
  "error": {
    "code": "TICKET_NOT_FOUND",
    "message": "Ticket bulunamadı."
  }
}
```

Validation hataları da merkezi olarak yönetilmelidir.

---

# 28. Pagination

Ticket sayısı büyüyeceği için bütün ticketları tek istekte frontend'e göndermek yasaktır.

Örneğin:

```text
GET /api/v1/tickets?page=1&limit=25
```

Response:

```json
{
  "success": true,
  "data": [],
  "pagination": {
    "page": 1,
    "limit": 25,
    "total": 1832,
    "totalPages": 74
  }
}
```

---

# 29. Ticket Filtreleme

Backend filtrelemeyi desteklemelidir.

Örneğin:

```text
/api/v1/tickets?status=OPEN

/api/v1/tickets?priority=HIGH

/api/v1/tickets?departmentId=1

/api/v1/tickets?assignedAgentId=15

/api/v1/tickets?search=ödeme
```

Filtreleme frontend üzerinde bütün kayıtları indirip yapılmamalıdır.

---

# 30. Güvenlik

Aşağıdaki kurallara dikkat edilmelidir.

## Authentication

JWT doğrulanmalıdır.

## Authorization

Her endpoint role/permission kontrolü yapmalıdır.

Frontend üzerindeki butonu gizlemek güvenlik değildir.

Backend mutlaka yetki kontrolü yapmalıdır.

Örneğin Customer:

```text
GET /tickets/100
```

isteği yaptığında backend kontrol etmelidir:

```text
ticket.customerId === currentUser.id
```

değilse:

```text
403 Forbidden
```

dönmelidir.

---

# 31. Validation

Frontend validation tek başına yeterli değildir.

Backend bütün inputları doğrulamalıdır.

Zod kullanılabilir.

Örneğin:

```text
subject:
minimum 5 karakter

message:
minimum 1 karakter

priority:
enum

email:
valid email
```

---

# 32. Error Handling

Global Error Handler kullanılmalıdır.

Controllerlarda tekrar tekrar:

```text
try/catch
```

yazılmasından mümkün olduğunca kaçınılmalıdır.

Beklenen hata türleri:

```text
ValidationError

AuthenticationError

AuthorizationError

NotFoundError

ConflictError

InternalServerError
```

---

# 33. Environment Variables

Örnek `.env`:

```text
NODE_ENV=development

PORT=3000

DATABASE_URL=

JWT_ACCESS_SECRET=
JWT_REFRESH_SECRET=

JWT_ACCESS_EXPIRES_IN=15m
JWT_REFRESH_EXPIRES_IN=7d

FRONTEND_URL=http://localhost:5173

UPLOAD_DIR=uploads
MAX_FILE_SIZE=10485760
```

Secret değerler GitHub'a gönderilmemelidir.

`.env` `.gitignore` içerisinde bulunmalıdır.

---

# 34. V1 Kapsamı

İlk sürümde aşağıdakiler tamamlanmalıdır:

* Authentication
* Role sistemi
* Customer
* Agent
* Admin
* Ticket oluşturma
* Ticket listeleme
* Ticket detay
* Ticket conversation
* Internal Notes
* Status
* Priority
* Department
* Agent Assignment
* Tags
* Attachments
* Notifications
* Saved Replies
* Activity Logs
* Dashboard
* Pagination
* Filtering
* Search
* Socket.IO realtime messages

Bunlar tamamlanmadan AI özelliklerine başlanmamalıdır.

---

# 35. V2

V1 tamamlandıktan sonra:

* Email to Ticket
* SMTP
* IMAP
* Email Reply
* SLA
* Automation Rules
* Advanced Permissions
* Knowledge Base
* Customer Management
* Canned Responses geliştirmeleri
* Advanced Search
* Export
* Reporting
* Ticket Merge
* Ticket Transfer
* Custom Fields

eklenebilir.

---

# 36. V3

Daha ileri sürüm:

* Live Chat
* AI Assistant
* AI Suggested Reply
* AI Ticket Summary
* AI Classification
* AI Priority Detection
* AI Knowledge Base
* Semantic Search
* Customer Satisfaction
* Agent Performance Analytics
* Multi Tenant
* SaaS Subscription System

---

# 37. Multi-Tenant

İlk sürüm tek şirket için geliştirilecektir.

Ancak ileride sistem SaaS ürününe dönüştürülebilir.

Örneğin:

```text
Helpdesk SaaS

├── Company A
│   ├── Agents
│   ├── Customers
│   └── Tickets
│
├── Company B
│   ├── Agents
│   ├── Customers
│   └── Tickets
│
└── Company C
```

Bu nedenle kod içerisinde ileride tenant yapısına geçişi gereksiz yere zorlaştıracak bağımlılıklardan kaçınılmalıdır.

Ancak V1 aşamasında gereksiz multi-tenant karmaşıklığı oluşturulmamalıdır.

---

# 38. Development Sırası

Proje şu sırayla geliştirilmelidir:

```text
1. Project Setup

2. PostgreSQL + Prisma

3. User Model

4. Authentication

5. Authorization / Roles

6. Department

7. Ticket Model

8. Ticket CRUD

9. Ticket Messages

10. Agent Assignment

11. Status / Priority

12. Attachments

13. Internal Notes

14. Tags

15. Notifications

16. React Authentication

17. Customer Panel

18. Agent Inbox

19. Admin Panel

20. Socket.IO

21. Dashboard

22. Activity Logs

23. Search / Filter / Pagination

24. Testing

25. Production Deployment
```

Bu sıraya mümkün olduğunca uyulmalıdır.

---

# 39. Kodlama Kuralları

Kod oluştururken:

* TypeScript kullanılmalı.
* `any` mümkün olduğunca kullanılmamalı.
* Fonksiyon ve değişken isimleri İngilizce olmalı.
* Kod tekrarından kaçınılmalı.
* Controller ince tutulmalı.
* Business logic Service katmanında bulunmalı.
* Database işlemleri kontrollü yapılmalı.
* Input validation backend üzerinde yapılmalı.
* Authentication ve authorization ayrılmalı.
* API response formatı standart tutulmalı.
* Error handling merkezi olmalı.
* Environment variable kullanılmalı.
* Secret değerler source code içine yazılmamalı.
* Pagination zorunlu tutulmalı.
* Database indexleri düşünülmeli.
* N+1 query problemlerinden kaçınılmalı.
* Gereksiz dependency eklenmemeli.

---

# 40. AI İçin Geliştirme Talimatı

Bu proje AI destekli geliştirilecekse AI bütün sistemi tek seferde üretmeye çalışmamalıdır.

Her aşamada:

```text
Plan
↓
Implement
↓
Run
↓
Test
↓
Fix
↓
Commit
↓
Next Feature
```

döngüsü uygulanmalıdır.

Bir özellik tamamlanmadan sonraki büyük özelliğe geçilmemelidir.

AI mevcut kodu incelemeden büyük refactor yapmamalıdır.

Database schema değişikliklerinde mevcut ilişkiler kontrol edilmelidir.

Authentication veya authorization değişikliklerinde güvenlik testleri yapılmalıdır.

---

# 41. İlk Hedef

İlk milestone:

```text
Customer Login
      ↓
Create Ticket
      ↓
PostgreSQL
      ↓
Agent Login
      ↓
See Ticket
      ↓
Assign Ticket
      ↓
Reply
      ↓
Customer Sees Reply
      ↓
Resolve Ticket
```

Bu akış baştan sona sorunsuz çalıştığında projenin temel helpdesk altyapısı tamamlanmış kabul edilebilir.

Bundan sonra gelişmiş özelliklere geçilmelidir.

---

# 42. Projenin Ana Prensibi

Bu proje yalnızca güzel görünen bir admin panel değildir.

Ana odak:

```text
Ticket Lifecycle
+
Conversation
+
Authorization
+
Assignment
+
Department
+
Notifications
+
Realtime Communication
+
Auditability
```

olmalıdır.

UI bu sistemin üzerinde çalışan arayüzdür.

Önce doğru backend ve veri modeli kurulmalı, ardından gelişmiş UI ve ek özellikler geliştirilmelidir.
