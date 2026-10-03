ALTER TABLE `AnnouncementTemplate`
  DROP COLUMN `priority`,
  ADD COLUMN `sortOrder` INTEGER NOT NULL DEFAULT 1000;

DROP INDEX `AnnouncementTemplate_createdAt_idx` ON `AnnouncementTemplate`;
CREATE INDEX `AnnouncementTemplate_sortOrder_createdAt_idx` ON `AnnouncementTemplate`(`sortOrder`, `createdAt`);

INSERT INTO `AnnouncementTemplate` (`id`, `label`, `title`, `body`, `sortOrder`, `createdAt`, `updatedAt`) VALUES
('10000000-0000-4000-8000-000000000001', 'Toplantı hatırlatma', 'Toplantı hatırlatması', 'Merhaba {isim}, yaklaşan toplantımızı hatırlatmak isteriz. Tarih ve saat bilgisi aşağıdaki etkinlik alanında yer almaktadır. Katılımınızı bekliyoruz.', 0, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3)),
('10000000-0000-4000-8000-000000000002', 'Genel bilgilendirme', 'Genel bilgilendirme', 'Merhaba {isim}, departmanımızla ilgili güncel bilgileri sizinle paylaşıyoruz.\n\n', 1, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3)),
('10000000-0000-4000-8000-000000000003', 'Acil duyuru', 'Acil duyuru', 'Merhaba {isim}, aşağıdaki önemli bilgilendirmeyi dikkatle incelemenizi rica ederiz.\n\n', 2, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3)),
('10000000-0000-4000-8000-000000000004', 'Görev atama', 'Yeni görev bilgilendirmesi', 'Merhaba {isim}, yeni görevinize ilişkin detayları aşağıda bulabilirsiniz.\n\n', 3, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3)),
('10000000-0000-4000-8000-000000000005', 'Maaş bildirimi', 'Maaş bilgilendirmesi', 'Merhaba {isim}, maaş ödemelerine ilişkin bilgilendirmeyi aşağıda bulabilirsiniz.\n\n', 4, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3)),
('10000000-0000-4000-8000-000000000006', 'İzin onayı', 'İzin talebi onaylandı', 'Merhaba {isim}, izin talebiniz onaylanmıştır. İyi dinlenmeler dileriz.', 5, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3)),
('10000000-0000-4000-8000-000000000007', 'İzin reddi', 'İzin talebi hakkında', 'Merhaba {isim}, izin talebiniz bu tarih aralığı için onaylanamamıştır. Detaylar için departman sorumlunuzla iletişime geçebilirsiniz.', 6, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3)),
('10000000-0000-4000-8000-000000000008', 'Doğum günü kutlama', 'İyi ki doğdunuz!', 'Doğum gününüz kutlu olsun {isim}! Nice mutlu ve sağlıklı yıllar dileriz.', 7, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3));

SET @next_order = 7;
UPDATE `AnnouncementTemplate`
SET `sortOrder` = (@next_order := @next_order + 1)
WHERE `id` NOT LIKE '10000000-0000-4000-8000-00000000000%'
ORDER BY `createdAt`, `id`;
