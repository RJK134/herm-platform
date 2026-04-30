-- Phase 10.7 — SSO identity-provider scaffold.
-- Adds the SsoIdentityProvider table and the SsoProtocol enum so the
-- discovery endpoint and future SAML/OIDC flows have a stable contract
-- to read from. No application code reads from this table yet — the
-- actual auth flows ship in a follow-up PR. See
-- docs/adr/0001-sso-architecture.md for the design + open questions.

-- CreateEnum
CREATE TYPE "SsoProtocol" AS ENUM ('SAML', 'OIDC');

-- CreateTable
CREATE TABLE "SsoIdentityProvider" (
    "id" TEXT NOT NULL,
    "institutionId" TEXT NOT NULL,
    "protocol" "SsoProtocol" NOT NULL,
    "displayName" TEXT NOT NULL,
    "samlEntityId" TEXT,
    "samlSsoUrl" TEXT,
    "samlCert" TEXT,
    "oidcIssuer" TEXT,
    "oidcClientId" TEXT,
    "oidcClientSecret" TEXT,
    "jitProvisioning" BOOLEAN NOT NULL DEFAULT true,
    "defaultRole" "UserRole" NOT NULL DEFAULT 'VIEWER',
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SsoIdentityProvider_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "SsoIdentityProvider_institutionId_key" ON "SsoIdentityProvider"("institutionId");

-- AddForeignKey
ALTER TABLE "SsoIdentityProvider" ADD CONSTRAINT "SsoIdentityProvider_institutionId_fkey" FOREIGN KEY ("institutionId") REFERENCES "Institution"("id") ON DELETE CASCADE ON UPDATE CASCADE;
