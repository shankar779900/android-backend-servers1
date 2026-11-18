CREATE TABLE `ScratchCard` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `investmentTransactionId` VARCHAR(191) NOT NULL,
    `rewardAmount` INTEGER NOT NULL,
    `scratchedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `ScratchCard_investmentTransactionId_key`(`investmentTransactionId`),
    INDEX `ScratchCard_userId_createdAt_idx`(`userId`, `createdAt`),
    PRIMARY KEY (`id`),
    CONSTRAINT `ScratchCard_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT `ScratchCard_investmentTransactionId_fkey` FOREIGN KEY (`investmentTransactionId`) REFERENCES `Transaction`(`id`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;