-- CreateEnum
CREATE TYPE "DunningState" AS ENUM ('active', 'past_due', 'paused', 'cancelled');

-- AlterTable
ALTER TABLE "Subscription" ADD COLUMN     "dunningState" "DunningState" NOT NULL DEFAULT 'active';
