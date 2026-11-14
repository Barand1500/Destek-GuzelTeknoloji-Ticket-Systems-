# Customer Agreements Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Müşteri anlaşmaları, kredi tüketimi, alt müşteriler ve girişli müşteri görünümü.
**Architecture:** Prisma anlaşma ve talep başına tek tüketim; atomik koşullu bakiye güncelleme. Mevcut müşteri yetkileri ve mevcut müşteri oturumu üzerine eklenir. Giriş açma/parola yönetimi kullanıcı talebiyle ertelendi.
**Tech Stack:** Express, Prisma/MySQL, React, TanStack Query.
**Spec:** docs/superpowers/specs/2026-11-14-agreements-design.md

## Global Constraints
- Mevcut form tokenlarının yetkisini genişletme. Yeni bağımlılık ekleme.
- Tarihler Europe/Istanbul; TRY ücreti ve tam sayı kredi. Dönemler personelce açılır.
- Kullanıcının açık uygulama talebi doğrultusunda mevcut çalışma dizininde uygula. Otomatik commit/push yok.

## Review Focus
- Aynı anda iki talep son krediyi tüketemez; paralel test.
- Aynı talep yeniden çözülünce kredi tekrar düşmez; test.
- Başka müşterinin anlaşması ve süresi geçmiş kredi kullanılamaz; test.
- Alt müşteri kardeş/ana müşteri taleplerine erişemez; yetki testi.
- Alt müşteri ekranı anlaşmalardan ayrı açılır; giriş/parola yönetimi eklenmez; tarayıcı testi.

### Task 1: Anlaşma ve hiyerarşi servisi
Files: backend/prisma/schema.prisma, yeni migration, backend/src/services/agreements.service.ts, backend/tests/agreements.test.ts.
Interfaces: agreementInput; listAgreements(actor, customerId); createAgreement(actor, customerId, input); setCustomerParent(actor, customerId, parentId); debitResolution(tx, actor, conversation, input).
- [x] Test: tarih/kredi, yetki, ekleme, ana/alt kapsamı, bakiye ve paralellik RED.
- [x] Şema/migration/servisi uygula ve yerel DB'ye uygula.
- [x] Testleri GREEN doğrula.

### Task 2: Talep çözümü ve API
Files: backend/src/routes/agreements.ts, backend/src/routes/index.ts, backend/src/services/conversations.service.ts, backend/src/validators/index.ts, backend/src/services/management.service.ts, backend/src/middleware/permissions.ts.
- [x] API'de müşteri kapsamı ve çözümde tüketim testi RED.
- [x] Çözüm güncellemesine tüketim ekle; özel alanları Prisma güncellemesinden ayır.
- [x] Müşteri okuma kapsamını doğrudan alt müşterilere genişlet; form kapsamını değiştirme.
- [x] Test ve backend derleme GREEN.

### Task 3: Personel ekranları
Files: frontend/src/features/agreements/Agreements.tsx ve agreements.css, frontend/src/features/management/People.tsx, frontend/src/features/tickets/Tickets.tsx.
- [x] Müşteri listesinde Anlaşmalar ikonu; modalda özet, anlaşmalar ve hareketler. Alt müşteri yönetimi ayrı CustomerRelations penceresidir.
- [x] Çözüm modalı: geçerli anlaşma, kredi, ücretsiz çözüm; iptal hiçbir şeyi kaydetmez.
- [x] Tarayıcı testi: anlaşma ekleme ve kredi çözüm akışı; frontend derleme.

### Task 4: Müşteri ekranı ve doğrulama
Files: frontend/src/main.tsx, frontend/src/components/Layout.tsx, portal sayfası Agreements.tsx; docs/agreements.md.
- [x] Mevcut müşteri girişini kullan; Anlaşmalarım menüsü ve ilişkili talepler görünümü.
- [x] Tam derleme, entegrasyon ve tarayıcı testleri.
- [x] Son inceleme ve kullanım/yayınlama açıklaması.

## Execution ledger
- Tasarımda kesinleştirilmemiş operasyonel kararlar: aylık/yıllık paketler otomatik yenilenmez; kredi 0 ile ücretsiz çözüm mümkündür; dönem bitiş günü dahildir. Bu kararlar kullanıcıya uygulama sırasında bildirilir.

- Kullanıcı düzeltmesi: Müşteri Girişi ve Bağlı Müşteriler sekmeleri Anlaşmalar penceresinden kaldırıldı. Giriş açma servisi/rotası kaldırıldı. İlişkiler CustomersPage ayrı ağ simgesi + CustomerRelations.tsx içinde yönetilir.
- Doğrulama: npm run build başarılı. İlgili dört backend testi ve üç Playwright testi geçti.
- Genel regresyon: lifecycle ve management paketlerinde dört eski assertion hatası (üst test özetleriyle altı başarısız kayıt) HEAD arşiviyle karşılaştırıldı; önceki kodda da aynıdır. Bu işte kapsam dışı bırakıldı.
- Bağımsız inceleyici dosya araçlarına erişemedi; ana oturumda satır ve yetki/kredi sınırları kontrol edildi. Ana müşteri alt talepleri salt okunur; yazma reddi testi eklendi.
- Otomatik git commit/push veya canlı yayın yapılmadı.
