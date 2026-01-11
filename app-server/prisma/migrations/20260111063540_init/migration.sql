-- CreateTable
CREATE TABLE "Installation" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "installationId" INTEGER NOT NULL,
    "accountLogin" TEXT NOT NULL,
    "accountType" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "RepoConfig" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "installationId" INTEGER NOT NULL,
    "repoFullName" TEXT NOT NULL,
    "configJson" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "RepoConfig_installationId_fkey" FOREIGN KEY ("installationId") REFERENCES "Installation" ("installationId") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "Installation_installationId_key" ON "Installation"("installationId");

-- CreateIndex
CREATE UNIQUE INDEX "RepoConfig_installationId_repoFullName_key" ON "RepoConfig"("installationId", "repoFullName");
