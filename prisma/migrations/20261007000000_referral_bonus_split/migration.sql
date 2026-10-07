ALTER TABLE `User`
    ADD COLUMN `referralSignupBonusPaid` BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN `referralPurchaseBonusPaid` BOOLEAN NOT NULL DEFAULT false;
