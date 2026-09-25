CREATE TABLE `NotificationSettings` (
    `id` VARCHAR(191) NOT NULL DEFAULT 'default',
    `ticketCreatedSubject` VARCHAR(191) NOT NULL DEFAULT 'Talebiniz oluşturuldu (#{number})',
    `ticketCreatedBody` TEXT NOT NULL,
    `ticketReplySubject` VARCHAR(191) NOT NULL DEFAULT 'Talebinize yeni yanıt geldi (#{number})',
    `ticketReplyBody` TEXT NOT NULL,
    `updatedAt` DATETIME(3) NOT NULL,
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

INSERT INTO `NotificationSettings` (`id`, `ticketCreatedBody`, `ticketReplyBody`, `updatedAt`) VALUES
('default', 'Merhaba {name},\n\n"{subject}" başlıklı talebiniz oluşturuldu. Destek ekibimiz en kısa sürede dönüş yapacaktır.', 'Merhaba {name},\n\n{subject} başlıklı talebinize destek ekibimizin yanıtı:\n\n{reply}', CURRENT_TIMESTAMP(3));
